import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  apiRequest,
  getStoredStudentToken,
  setStoredAdminToken,
  setStoredStudentToken,
} from './lib/api';
import { BrandLogo } from './components/BrandLogo';
import { LandingPage } from './pages/public/LandingPage';
import { ForcePasswordChangePage, LoginPage, RegisterPage } from './pages/public/AuthPages';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { AdminGatePage } from './pages/admin/AdminGatePage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import type { StudentSessionUser } from './types/domain';

export default function App() {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [search, setSearch] = useState<string>(() => window.location.search || '');
  const [student, setStudent] = useState<StudentSessionUser | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [booting, setBooting] = useState(true);

  const lockAdminSession = useCallback(() => {
    setAdminAuthenticated(false);
    setStoredAdminToken(null);
    void apiRequest('/api/auth/admin/logout', { method: 'POST', keepalive: true }).catch(() => {});
  }, []);

  const navigate = useCallback(
    (nextPath: string) => {
      const target = nextPath || '/';
      const [rawBase, rawQuery] = target.split('?');
      const targetBase = rawBase || '/';
      const targetSearch = rawQuery ? `?${rawQuery}` : '';
      if ((!targetBase.startsWith('/admin') || targetBase === '/admin-gate') && adminAuthenticated) {
        lockAdminSession();
      }
      if (window.location.pathname + window.location.search !== targetBase + targetSearch) {
        window.history.pushState({}, '', targetBase + targetSearch);
      }
      setPath(targetBase);
      setSearch(targetSearch);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [adminAuthenticated, lockAdminSession]
  );

  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname || '/';
      const nextSearch = window.location.search || '';
      if (!next.startsWith('/admin') || next === '/admin-gate') {
        lockAdminSession();
      }
      setPath(next);
      setSearch(nextSearch);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [lockAdminSession]);

  const refreshAuthState = useCallback(async () => {
    try {
      // لا يُفتح دخول الإدارة تلقائيًا عند تحميل الصفحة؛ يجب إدخال الرمز في كل دخول
      setStoredAdminToken(null);
      setAdminAuthenticated(false);
      const meRes = await apiRequest<{ student: StudentSessionUser | null }>('/api/auth/me');
      setStudent(meRes.student);
      if (!meRes.student && getStoredStudentToken()) {
        setStoredStudentToken(null);
      }
    } catch {
      // ignore initial boot failure
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  const handleStudentAuthSuccess = (loggedInStudent: StudentSessionUser, token?: string) => {
    if (token) setStoredStudentToken(token);
    setStudent(loggedInStudent);
    if (loggedInStudent.mustChangePassword) {
      navigate('/change-password');
    } else {
      navigate('/student');
    }
  };

  const handleStudentLogout = async (redirectTo = '/') => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredStudentToken(null);
    setStudent(null);
    navigate(redirectTo);
  };

  const handleAdminLogout = async () => {
    await apiRequest('/api/auth/admin/logout', { method: 'POST' }).catch(() => {});
    setStoredAdminToken(null);
    setAdminAuthenticated(false);
    navigate('/');
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-royal-atmosphere flex flex-col items-center justify-center gap-4 px-4">
        <BrandLogo variant="icon" size="lg" />
        <p className="font-display text-lg font-bold text-[#D4AF37]">
          منصة الأستاذ أحمد الرمادي
        </p>
        <div className="w-36 h-1 rounded-full skeleton-shimmer border border-white/[0.06]" />
      </div>
    );
  }

  let viewKey = 'landing';
  let viewNode: React.ReactNode;

  // Admin Room Routing (يتطلب إدخال رمز الإدارة في كل مرة)
  if (path.startsWith('/admin')) {
    if (!adminAuthenticated || path === '/admin-gate') {
      viewKey = 'admin-gate';
      viewNode = (
        <AdminGatePage
          onAuthenticated={(token) => {
            if (token) setStoredAdminToken(token);
            setAdminAuthenticated(true);
            navigate('/admin');
          }}
          onNavigate={navigate}
        />
      );
    } else {
      viewKey = 'admin-dashboard';
      viewNode = <AdminDashboard onNavigate={navigate} onLogout={() => void handleAdminLogout()} />;
    }
  } else if (student && student.mustChangePassword) {
    viewKey = 'force-password-change';
    viewNode = (
      <ForcePasswordChangePage
        student={student}
        onUpdated={() => {
          setStudent((s) => (s ? { ...s, mustChangePassword: false } : null));
          navigate('/student');
        }}
        onLogout={() => void handleStudentLogout('/')}
      />
    );
  } else if (path === '/register') {
    if (student) {
      viewKey = 'student-dashboard';
      viewNode = (
        <StudentDashboard
          student={student}
          initialPath="/student"
          onNavigate={navigate}
          onLogout={() => void handleStudentLogout('/')}
        />
      );
    } else {
      viewKey = 'register';
      viewNode = (
        <RegisterPage
          locationSearch={search}
          onSuccess={handleStudentAuthSuccess}
          onNavigate={navigate}
        />
      );
    }
  } else if (path === '/login') {
    if (student) {
      viewKey = 'student-dashboard';
      viewNode = (
        <StudentDashboard
          student={student}
          initialPath="/student"
          onNavigate={navigate}
          onLogout={() => void handleStudentLogout('/')}
        />
      );
    } else {
      viewKey = 'login';
      viewNode = (
        <LoginPage
          locationSearch={search}
          onSuccess={handleStudentAuthSuccess}
          onNavigate={navigate}
        />
      );
    }
  } else if (path.startsWith('/student')) {
    if (!student) {
      viewKey = 'login';
      viewNode = (
        <LoginPage
          locationSearch={search}
          onSuccess={handleStudentAuthSuccess}
          onNavigate={navigate}
        />
      );
    } else {
      viewKey = 'student-dashboard';
      viewNode = (
        <StudentDashboard
          student={student}
          initialPath={path}
          onNavigate={navigate}
          onLogout={() => void handleStudentLogout('/')}
        />
      );
    }
  } else {
    viewKey = 'landing';
    viewNode = (
      <LandingPage
        currentStudent={student}
        onNavigate={navigate}
        onSwitchAccountAndNavigate={(nextTarget) => handleStudentLogout(nextTarget)}
      />
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          key={viewKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {viewNode}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
