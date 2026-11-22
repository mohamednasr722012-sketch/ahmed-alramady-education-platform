import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FileBadge,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  PlayCircle,
  PlusCircle,
  Settings,
  Shield,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { downloadPdfFile } from '../../lib/downloadPdf';
import { formatArabicDate, formatArabicDateTime, formatDurationMs } from '../../lib/formatters';
import { BrandLogo } from '../../components/BrandLogo';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { GradeComparisonBarChart, StudentTimelineChart } from '../../components/AnalyticsCharts';
import { AdminStudentsModule } from './AdminStudentsModule';
import { AdminCreateExamModule, AdminExamsListModule } from './AdminExamsModule';
import { AdminSchedulesModule, AdminVideosModule } from './AdminVideosModule';
import type {
  BadgeItem,
  CertificateItem,
  CumulativeRankEntry,
  ExamRankEntry,
  ExamResultItem,
  ExamSummary,
  GradeInfo,
  NotificationItem,
  StudentAnalyticsData,
} from '../../types/domain';

type AdminSection =
  | 'overview'
  | 'students'
  | 'grades'
  | 'exams'
  | 'create-exam'
  | 'results'
  | 'videos'
  | 'schedule'
  | 'leaderboards'
  | 'badges'
  | 'certificates'
  | 'analytics'
  | 'notifications'
  | 'stats'
  | 'settings';

export const AdminDashboard: React.FC<{
  onNavigate: (path: string) => void;
  onLogout: () => void;
}> = ({ onNavigate, onLogout }) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [grades, setGrades] = useState<GradeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editingGrade, setEditingGrade] = useState<GradeInfo | null>(null);
  const [gradeForm, setGradeForm] = useState({ name_ar: '', description_ar: '' });
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  // Overview / Stats
  const [overview, setOverview] = useState<{
    totals: Record<string, number>;
    perGradeStats: Array<{
      gradeId: number;
      gradeName: string;
      studentsCount: number;
      activeStudentsCount: number;
      examsCount: number;
      videosCount: number;
      resultsCount: number;
      avgPercentage: number;
    }>;
    recentAuditLogs: Array<{
      id: string;
      action: string;
      target_type: string;
      target_id: string;
      created_at: string;
    }>;
  } | null>(null);

  // Results
  const [results, setResults] = useState<ExamResultItem[]>([]);

  // Leaderboards
  const [lbGrade, setLbGrade] = useState(1);
  const [lbExamId, setLbExamId] = useState('');
  const [lbData, setLbData] = useState<{
    cumulativeBoard: CumulativeRankEntry[];
    exams: ExamSummary[];
    examBoard: ExamRankEntry[];
  } | null>(null);

  // Badges
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [badgeForm, setBadgeForm] = useState({
    titleAr: '',
    descriptionAr: '',
    tier: 'gold',
    ruleType: 'exam_min_pct',
    ruleThreshold: 95,
  });

  // Certificates
  const [certsData, setCertsData] = useState<{
    certificates: CertificateItem[];
    rules: {
      autoIssueOnExamCompletion: boolean;
      excellenceMinPercentage: number;
      autoIssueExcellence: boolean;
      autoIssueTopOfGrade: boolean;
    };
  } | null>(null);
  const [manualCert, setManualCert] = useState({
    studentId: '',
    certType: 'appreciation',
    titleAr: 'شهادة تقدير',
    reasonAr: '',
  });
  const [allStudentsSimple, setAllStudentsSimple] = useState<
    Array<{ id: string; fullName: string; gradeName: string }>
  >([]);
  const [studentPickerQuery, setStudentPickerQuery] = useState('');

  // Analytics
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentAnalytics, setStudentAnalytics] = useState<{
    analytics: StudentAnalyticsData;
  } | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifForm, setNotifForm] = useState({ gradeId: '1', titleAr: '', bodyAr: '' });

  // Settings
  const [settingsData, setSettingsData] = useState<{
    teacherProfile: { teacherName: string; headline: string; bio: string };
    systemStatus: {
      databaseMode: 'supabase' | 'local_preview';
      supabaseConfigured: boolean;
      adminCodeSource: 'env' | 'db';
      freeTierLimits: { database: string; storage: string; egress: string };
    };
    auditLogs: Array<{
      id: string;
      actor_role: string;
      action: string;
      target_type: string;
      target_id: string;
      ip_address: string | null;
      created_at: string;
    }>;
  } | null>(null);
  const [newAdminPasscode, setNewAdminPasscode] = useState('');
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const loadGrades = useCallback(async () => {
    try {
      const res = await apiRequest<{ grades: GradeInfo[] }>('/api/admin/grades');
      setGrades(res.grades);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onLogout();
      }
    }
  }, [onLogout]);

  useEffect(() => {
    void loadGrades();
  }, [loadGrades]);

  const loadSection = useCallback(async () => {
    setLoading(true);
    setSectionError('');
    try {
      if (section === 'overview' || section === 'stats') {
        const res = await apiRequest<NonNullable<typeof overview>>('/api/admin/overview');
        setOverview(res);
      } else if (section === 'results') {
        const res = await apiRequest<{ results: ExamResultItem[] }>('/api/admin/results');
        setResults(res.results);
      } else if (section === 'leaderboards') {
        const qs = new URLSearchParams({ gradeId: String(lbGrade) });
        if (lbExamId) qs.set('examId', lbExamId);
        const res = await apiRequest<NonNullable<typeof lbData>>(
          `/api/admin/leaderboards?${qs.toString()}`
        );
        setLbData(res);
      } else if (section === 'badges') {
        const res = await apiRequest<{ badges: BadgeItem[] }>('/api/admin/badges');
        setBadges(res.badges);
      } else if (section === 'certificates') {
        const [cRes, sRes] = await Promise.all([
          apiRequest<NonNullable<typeof certsData>>('/api/admin/certificates'),
          apiRequest<{ students: Array<{ id: string; fullName: string; gradeName: string }> }>(
            '/api/admin/students?pageSize=100'
          ),
        ]);
        setCertsData(cRes);
        setAllStudentsSimple(sRes.students);
      } else if (section === 'analytics') {
        const sRes = await apiRequest<{
          students: Array<{ id: string; fullName: string; gradeName: string }>;
        }>('/api/admin/students?pageSize=100');
        setAllStudentsSimple(sRes.students);
        if (selectedStudentId) {
          const aRes = await apiRequest<{ analytics: StudentAnalyticsData }>(
            `/api/admin/analytics/student/${selectedStudentId}`
          );
          setStudentAnalytics(aRes);
        }
      } else if (section === 'notifications') {
        const res = await apiRequest<{ notifications: NotificationItem[] }>('/api/admin/notifications');
        setNotifications(res.notifications);
      } else if (section === 'settings') {
        const res = await apiRequest<NonNullable<typeof settingsData>>('/api/admin/settings');
        setSettingsData(res);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onLogout();
        return;
      }
      setSectionError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات القسم الحالي.');
    } finally {
      setLoading(false);
    }
  }, [section, lbGrade, lbExamId, selectedStudentId, onLogout]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  useEffect(() => {
    if (section !== 'certificates' && section !== 'analytics') return;
    const trimmed = studentPickerQuery.trim();
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ pageSize: '50' });
      if (trimmed) qs.set('search', trimmed);
      apiRequest<{ students: Array<{ id: string; fullName: string; gradeName: string }> }>(
        `/api/admin/students?${qs.toString()}`
      )
        .then((res) => setAllStudentsSimple(res.students))
        .catch(() => undefined);
    }, 220);
    return () => clearTimeout(timer);
  }, [studentPickerQuery, section]);

  const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: '1. نظرة عامة', icon: LayoutDashboard },
    { id: 'students', label: '2. إدارة الطلاب', icon: Users },
    { id: 'grades', label: '3. إدارة الصفوف', icon: GraduationCap },
    { id: 'exams', label: '4. إدارة الامتحانات', icon: ClipboardList },
    { id: 'create-exam', label: '5. إنشاء امتحان', icon: PlusCircle },
    { id: 'results', label: '6. النتائج', icon: CheckCircle2 },
    { id: 'videos', label: '7. الفيديوهات', icon: PlayCircle },
    { id: 'schedule', label: '8. جدولة النشر', icon: CalendarClock },
    { id: 'leaderboards', label: '9. لوحات الشرف', icon: Trophy },
    { id: 'badges', label: '10. الشارات', icon: Award },
    { id: 'certificates', label: '11. الشهادات', icon: FileBadge },
    { id: 'analytics', label: '12. تحليل الطلاب', icon: BarChart3 },
    { id: 'notifications', label: '13. الإشعارات', icon: Bell },
    { id: 'stats', label: '14. الإحصائيات', icon: PieChart },
    { id: 'settings', label: '15. إعدادات المنصة', icon: Settings },
  ];

  const handleCreateBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionFeedback(null);
    try {
      await apiRequest('/api/admin/badges', {
        method: 'POST',
        body: JSON.stringify(badgeForm),
      });
      setBadgeForm({
        titleAr: '',
        descriptionAr: '',
        tier: 'gold',
        ruleType: 'exam_min_pct',
        ruleThreshold: 95,
      });
      setActionFeedback({ type: 'ok', text: 'تم إضافة الشارة بنجاح.' });
      void loadSection();
    } catch (err) {
      setActionFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر إضافة الشارة.',
      });
    }
  };

  const handleIssueManualCert = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionFeedback(null);
    try {
      await apiRequest('/api/admin/certificates/issue', {
        method: 'POST',
        body: JSON.stringify(manualCert),
      });
      setManualCert({ studentId: '', certType: 'appreciation', titleAr: 'شهادة تقدير', reasonAr: '' });
      setActionFeedback({ type: 'ok', text: 'تم إصدار الشهادة للطالب بنجاح.' });
      void loadSection();
    } catch (err) {
      setActionFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر إصدار الشهادة.',
      });
    }
  };

  const handleSaveCertRules = async () => {
    if (!certsData) return;
    setActionFeedback(null);
    try {
      await apiRequest('/api/admin/certificates/rules', {
        method: 'PUT',
        body: JSON.stringify(certsData.rules),
      });
      setActionFeedback({ type: 'ok', text: 'تم حفظ شروط الشهادات بنجاح.' });
      void loadSection();
    } catch (err) {
      setActionFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر حفظ شروط الشهادات.',
      });
    }
  };

  const handleDownloadAdminCert = async (certId: string, serial: string) => {
    setActionFeedback(null);
    setPdfBusyId(certId);
    try {
      await downloadPdfFile(`/api/admin/certificates/${certId}/pdf`, `certificate-${serial}.pdf`);
    } catch (err) {
      setActionFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر تحميل ملف الشهادة.',
      });
    } finally {
      setPdfBusyId(null);
    }
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrade) return;
    setActionFeedback(null);
    try {
      await apiRequest(`/api/admin/grades/${editingGrade.id}`, {
        method: 'PATCH',
        body: JSON.stringify(gradeForm),
      });
      setEditingGrade(null);
      setActionFeedback({ type: 'ok', text: 'تم تحديث بيانات الصف الدراسي بنجاح.' });
      void loadGrades();
    } catch (err) {
      setActionFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر تحديث بيانات الصف.',
      });
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionFeedback(null);
    try {
      await apiRequest('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          gradeId: notifForm.gradeId ? Number(notifForm.gradeId) : null,
          titleAr: notifForm.titleAr,
          bodyAr: notifForm.bodyAr,
        }),
      });
      setNotifForm({ gradeId: '1', titleAr: '', bodyAr: '' });
      setActionFeedback({ type: 'ok', text: 'تم إرسال الإشعار لطلاب الصف.' });
      void loadSection();
    } catch (err) {
      setActionFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر إرسال الإشعار.',
      });
    }
  };

  const handleUpdateTeacherProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsData) return;
    setSettingsFeedback(null);
    try {
      await apiRequest('/api/admin/settings/teacher-profile', {
        method: 'PUT',
        body: JSON.stringify(settingsData.teacherProfile),
      });
      setSettingsFeedback({ type: 'ok', text: 'تم حفظ بيانات الأستاذ بنجاح.' });
    } catch (err) {
      setSettingsFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر حفظ بيانات الأستاذ.',
      });
    }
  };

  const handleChangeAdminPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsFeedback(null);
    try {
      await apiRequest('/api/admin/settings/change-admin-passcode', {
        method: 'POST',
        body: JSON.stringify({ newPasscode: newAdminPasscode }),
      });
      setNewAdminPasscode('');
      setSettingsFeedback({ type: 'ok', text: 'تم تحديث رمز دخول غرفة الإدارة بنجاح.' });
    } catch (err) {
      setSettingsFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر تغيير الرمز.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#05070C] text-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Mobile & Tablet Header */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#0A101E]/95 backdrop-blur-md border-b border-[#D4AF37]/20 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#EED07A] font-bold text-sm">
          <Shield className="w-4 h-4 text-[#D4AF37]" />
          غرفة الإدارة — الأستاذ
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="فتح قائمة الإدارة"
          className="w-11 h-11 rounded-xl bg-[#0F172A] border border-white/10 flex items-center justify-center text-[#D4AF37] hover:border-[#D4AF37]/40 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/75 backdrop-blur-xs"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          mobileOpen
            ? 'fixed inset-y-0 right-0 z-50 flex w-72 max-w-[82vw] shadow-2xl'
            : 'hidden'
        } lg:flex lg:w-68 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-[#0A101E] border-l border-[#D4AF37]/20 flex-col justify-between p-4`}
      >
        <div className="space-y-4 overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onNavigate('/');
              }}
              className="text-right"
            >
              <BrandLogo variant="horizontal" size="sm" />
            </button>
            {mobileOpen && (
              <button
                type="button"
                aria-label="إغلاق قائمة الإدارة"
                onClick={() => setMobileOpen(false)}
                className="lg:hidden p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-[#D4AF37]/30 text-xs font-bold text-[#EED07A] flex items-center gap-2 shadow-inner">
            <Shield className="w-4 h-4 text-[#D4AF37] shrink-0" />
            غرفة الإدارة — الأستاذ أحمد الرمادي
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setActionFeedback(null);
                    setMobileOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                    active
                      ? 'btn-gold-royal font-bold'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onNavigate('/');
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04]"
          >
            <Home className="w-4 h-4" />
            العودة للمنصة (مع قفل الإدارة)
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-red-300 hover:bg-red-950/40"
          >
            <LogOut className="w-4 h-4" />
            تسجيل خروج الإدارة
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-10 max-w-6xl w-full mx-auto">
        {actionFeedback && (
          <div
            className={`mb-5 p-3.5 rounded-xl border text-sm flex items-center justify-between gap-3 ${
              actionFeedback.type === 'ok'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
            }`}
          >
            <span>{actionFeedback.text}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-xs opacity-80 hover:opacity-100"
            >
              إغلاق
            </button>
          </div>
        )}

        {loading && !['students', 'exams', 'create-exam', 'videos', 'schedule'].includes(section) ? (
          <LoadingSkeleton rows={4} />
        ) : sectionError ? (
          <div className="p-5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex flex-wrap items-center justify-between gap-3">
            <span>{sectionError}</span>
            <button
              type="button"
              onClick={() => void loadSection()}
              className="px-4 py-2 rounded-lg btn-gold-royal text-xs font-bold"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* 1. نظرة عامة */}
            {section === 'overview' && overview && (
              <div className="space-y-6">
                <div className="relative overflow-hidden rounded-3xl surface-card-gold p-6 sm:p-7">
                  <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-45" />
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/75 to-transparent" />
                  <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-[#D4AF37] mb-1">لوحة القيادة الإدارية</div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                        نظرة عامة على المنصة
                      </h1>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSection('create-exam')}
                        className="px-4 py-2 rounded-xl btn-gold-royal text-xs font-bold whitespace-nowrap"
                      >
                        إنشاء امتحان جديد
                      </button>
                      <button
                        type="button"
                        onClick={() => setSection('videos')}
                        className="px-4 py-2 rounded-xl btn-royal-outline text-xs font-bold whitespace-nowrap"
                      >
                        إدارة الفيديوهات
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-2xl surface-card-gold p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">إجمالي الطلاب</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#EED07A] mt-1.5">
                      {overview.totals.students}
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">الامتحانات المنشورة</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1.5">
                      {overview.totals.publishedExams} / {overview.totals.exams}
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">الفيديوهات المنشورة</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                      {overview.totals.publishedVideos} / {overview.totals.videos}
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">النتائج والشهادات</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#E6C667] mt-1">
                      {overview.totals.results} / {overview.totals.certificates}
                    </div>
                  </div>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden grid sm:grid-cols-2 gap-3">
                  {overview.perGradeStats.map((g) => (
                    <div
                      key={g.gradeId}
                      className="rounded-xl border border-white/10 bg-[#11192C] p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-sm text-[#F8FAFC]">{g.gradeName}</div>
                        <span className="font-mono-nums text-xs font-bold text-[#D4AF37]">
                          {g.avgPercentage}%
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t border-white/10 font-mono-nums text-xs">
                        <div>
                          <span className="block text-[10px] text-[#94A3B8]">الطلاب</span>
                          <span>{g.studentsCount}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[#94A3B8]">الامتحانات</span>
                          <span>{g.examsCount}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[#94A3B8]">الفيديو</span>
                          <span>{g.videosCount}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[#94A3B8]">النتائج</span>
                          <span>{g.resultsCount}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                      <tr>
                        <th className="py-3 px-4">الصف الدراسي</th>
                        <th className="py-3 px-4">الطلاب</th>
                        <th className="py-3 px-4">الامتحانات</th>
                        <th className="py-3 px-4">الفيديوهات</th>
                        <th className="py-3 px-4">النتائج</th>
                        <th className="py-3 px-4">المتوسط العام</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {overview.perGradeStats.map((g) => (
                        <tr key={g.gradeId}>
                          <td className="py-3 px-4 font-bold">{g.gradeName}</td>
                          <td className="py-3 px-4 font-mono-nums">{g.studentsCount}</td>
                          <td className="py-3 px-4 font-mono-nums">{g.examsCount}</td>
                          <td className="py-3 px-4 font-mono-nums">{g.videosCount}</td>
                          <td className="py-3 px-4 font-mono-nums">{g.resultsCount}</td>
                          <td className="py-3 px-4 font-mono-nums text-[#D4AF37]">
                            {g.avgPercentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. إدارة الطلاب */}
            {section === 'students' && <AdminStudentsModule grades={grades} />}

            {/* 3. إدارة الصفوف */}
            {section === 'grades' && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إدارة الصفوف الدراسية</h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    كل صف معزول تمامًا في امتحاناته وفيديوهاته ولوحات الشرف. يمكنك تعديل الاسم أو الوصف الظاهر للطلاب.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {grades.map((g) => (
                    <div
                      key={g.id}
                      className="rounded-xl bg-[#11192C] border border-[#D4AF37]/20 p-5 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="text-xs font-mono-nums text-[#D4AF37]">معرّف الصف: {g.id}</div>
                        <h2 className="text-lg font-bold text-[#F8FAFC]">{g.name_ar}</h2>
                        <p className="text-sm text-[#94A3B8]">{g.description_ar}</p>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGrade(g);
                            setGradeForm({ name_ar: g.name_ar, description_ar: g.description_ar });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#0B1221] border border-[#D4AF37]/30 text-xs font-bold text-[#D4AF37] hover:bg-[#D4AF37]/10"
                        >
                          تعديل المسمى والوصف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. إدارة الامتحانات */}
            {section === 'exams' && (
              <AdminExamsListModule
                grades={grades}
                onCreateNew={() => setSection('create-exam')}
              />
            )}

            {/* 5. إنشاء امتحان */}
            {section === 'create-exam' && (
              <AdminCreateExamModule
                grades={grades}
                onCreated={() => setSection('exams')}
              />
            )}

            {/* 6. النتائج */}
            {section === 'results' && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">نتائج الامتحانات</h1>
                {results.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="لا توجد نتائج مسجلة بعد"
                    description="ستظهر هنا جميع نتائج الطلاب فور تسليمهم للامتحانات."
                  />
                ) : (
                  <>
                    <div className="md:hidden space-y-3">
                      {results.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-xl border border-white/10 bg-[#11192C] p-4 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-[#F8FAFC] truncate">
                                {r.studentName}
                              </div>
                              <div className="text-xs text-[#D4AF37]">{r.gradeName}</div>
                            </div>
                            <span className="font-mono-nums text-xs font-bold px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] shrink-0">
                              {r.percentage}%
                            </span>
                          </div>
                          <div className="text-xs text-[#E2E8F0]">{r.examTitle}</div>
                          <div className="flex items-center justify-between text-xs text-[#94A3B8] pt-2 border-t border-white/10 font-mono-nums">
                            <span className="text-[#D4AF37] font-bold">
                              {r.earned_score} / {r.max_score}
                            </span>
                            <span>{formatDurationMs(r.duration_ms)}</span>
                            <span>{formatArabicDateTime(r.submitted_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                          <tr>
                            <th className="py-3 px-4">الطالب</th>
                            <th className="py-3 px-4">الصف</th>
                            <th className="py-3 px-4">الامتحان</th>
                            <th className="py-3 px-4">الدرجة</th>
                            <th className="py-3 px-4">النسبة</th>
                            <th className="py-3 px-4">الزمن</th>
                            <th className="py-3 px-4">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {results.map((r) => (
                            <tr key={r.id}>
                              <td className="py-3 px-4 font-bold">{r.studentName}</td>
                              <td className="py-3 px-4">{r.gradeName}</td>
                              <td className="py-3 px-4">{r.examTitle}</td>
                              <td className="py-3 px-4 font-mono-nums text-[#D4AF37]">
                                {r.earned_score} / {r.max_score}
                              </td>
                              <td className="py-3 px-4 font-mono-nums">{r.percentage}%</td>
                              <td className="py-3 px-4 font-mono-nums text-xs">
                                {formatDurationMs(r.duration_ms)}
                              </td>
                              <td className="py-3 px-4 text-xs text-[#94A3B8]">
                                {formatArabicDateTime(r.submitted_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 7. الفيديوهات */}
            {section === 'videos' && <AdminVideosModule grades={grades} />}

            {/* 8. جدولة النشر */}
            {section === 'schedule' && <AdminSchedulesModule />}

            {/* 9. لوحات الشرف */}
            {section === 'leaderboards' && lbData && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">لوحات الشرف</h1>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <select
                      value={lbGrade}
                      onChange={(e) => {
                        setLbGrade(Number(e.target.value));
                        setLbExamId('');
                      }}
                      className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
                    >
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name_ar}
                        </option>
                      ))}
                    </select>
                    <select
                      value={lbExamId}
                      onChange={(e) => setLbExamId(e.target.value)}
                      className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
                    >
                      <option value="">الترتيب التراكمي العام</option>
                      {lbData.exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {lbExamId ? (
                  <>
                    <div className="md:hidden space-y-2.5">
                      {lbData.examBoard.map((r) => (
                        <div
                          key={r.studentId}
                          className="rounded-xl border border-white/10 bg-[#11192C] p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-lg bg-[#0B1221] border border-[#D4AF37]/30 flex items-center justify-center font-mono-nums text-xs font-bold text-[#D4AF37] shrink-0">
                              #{r.rank}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{r.fullName}</div>
                              <div className="text-[11px] text-[#94A3B8] font-mono-nums">
                                {r.earnedScore} / {r.maxScore} · {formatDurationMs(r.durationMs)}
                              </div>
                            </div>
                          </div>
                          <span className="font-mono-nums text-sm font-bold text-[#E6C667] shrink-0">
                            {r.percentage}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                          <tr>
                            <th className="py-3 px-4">الترتيب</th>
                            <th className="py-3 px-4">الطالب</th>
                            <th className="py-3 px-4">الدرجة</th>
                            <th className="py-3 px-4">النسبة</th>
                            <th className="py-3 px-4">الزمن</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {lbData.examBoard.map((r) => (
                            <tr key={r.studentId}>
                              <td className="py-3 px-4 font-mono-nums text-[#D4AF37]">#{r.rank}</td>
                              <td className="py-3 px-4 font-bold">{r.fullName}</td>
                              <td className="py-3 px-4 font-mono-nums">
                                {r.earnedScore} / {r.maxScore}
                              </td>
                              <td className="py-3 px-4 font-mono-nums">{r.percentage}%</td>
                              <td className="py-3 px-4 font-mono-nums">{formatDurationMs(r.durationMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="md:hidden space-y-2.5">
                      {lbData.cumulativeBoard.map((r) => (
                        <div
                          key={r.studentId}
                          className="rounded-xl border border-white/10 bg-[#11192C] p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-lg bg-[#0B1221] border border-[#D4AF37]/30 flex items-center justify-center font-mono-nums text-xs font-bold text-[#D4AF37] shrink-0">
                              #{r.rank}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{r.fullName}</div>
                              <div className="text-[11px] text-[#94A3B8] font-mono-nums">
                                {r.completedExams} امتحانات · {r.cumulativeEarned} / {r.cumulativePossible}
                              </div>
                            </div>
                          </div>
                          <span className="font-mono-nums text-sm font-bold text-[#E6C667] shrink-0">
                            {r.percentage}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                          <tr>
                            <th className="py-3 px-4">الترتيب</th>
                            <th className="py-3 px-4">الطالب</th>
                            <th className="py-3 px-4">الامتحانات</th>
                            <th className="py-3 px-4">المجموع</th>
                            <th className="py-3 px-4">الممكن</th>
                            <th className="py-3 px-4">النسبة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {lbData.cumulativeBoard.map((r) => (
                            <tr key={r.studentId}>
                              <td className="py-3 px-4 font-mono-nums text-[#D4AF37]">#{r.rank}</td>
                              <td className="py-3 px-4 font-bold">{r.fullName}</td>
                              <td className="py-3 px-4 font-mono-nums">{r.completedExams}</td>
                              <td className="py-3 px-4 font-mono-nums">{r.cumulativeEarned}</td>
                              <td className="py-3 px-4 font-mono-nums">{r.cumulativePossible}</td>
                              <td className="py-3 px-4 font-mono-nums text-[#E6C667]">{r.percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 10. الشارات */}
            {section === 'badges' && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إدارة الشارات المخصصة والافتراضية</h1>
                <form
                  onSubmit={handleCreateBadge}
                  className="rounded-2xl bg-[#11192C] border border-[#D4AF37]/20 p-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">اسم الشارة</label>
                    <input
                      type="text"
                      required
                      value={badgeForm.titleAr}
                      onChange={(e) => setBadgeForm((f) => ({ ...f, titleAr: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">الوصف</label>
                    <input
                      type="text"
                      required
                      value={badgeForm.descriptionAr}
                      onChange={(e) => setBadgeForm((f) => ({ ...f, descriptionAr: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">المستوى</label>
                    <select
                      value={badgeForm.tier}
                      onChange={(e) => setBadgeForm((f) => ({ ...f, tier: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    >
                      <option value="gold">ذهبي</option>
                      <option value="silver">فضي</option>
                      <option value="bronze">برونزي</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">الشرط</label>
                    <select
                      value={badgeForm.ruleType}
                      onChange={(e) => setBadgeForm((f) => ({ ...f, ruleType: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    >
                      <option value="exam_min_pct">نسبة امتحان ≥</option>
                      <option value="exams_completed">عدد امتحانات ≥</option>
                      <option value="avg_pct_min_exams">متوسط تراكمي ≥</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={badgeForm.ruleThreshold}
                      onChange={(e) =>
                        setBadgeForm((f) => ({ ...f, ruleThreshold: Number(e.target.value) }))
                      }
                      className="w-20 px-2 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
                    />
                    <button
                      type="submit"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                    >
                      إضافة
                    </button>
                  </div>
                </form>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {badges.map((b) => (
                    <div key={b.id} className="rounded-xl bg-[#11192C] border border-white/10 p-5">
                      <div className="text-xs text-[#D4AF37] mb-1">
                        {b.tier} · {b.is_system ? 'افتراضية' : 'مخصصة'}
                      </div>
                      <h3 className="font-bold text-[#F8FAFC]">{b.title_ar}</h3>
                      <p className="text-xs text-[#94A3B8] mt-1">{b.description_ar}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 11. الشهادات */}
            {section === 'certificates' && certsData && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إدارة الشهادات PDF</h1>

                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl bg-[#11192C] border border-white/10 p-5 space-y-4">
                    <h2 className="text-base font-bold text-[#D4AF37]">شروط الإصدار التلقائي</h2>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={certsData.rules.autoIssueOnExamCompletion}
                        onChange={(e) =>
                          setCertsData((d) =>
                            d
                              ? {
                                  ...d,
                                  rules: {
                                    ...d.rules,
                                    autoIssueOnExamCompletion: e.target.checked,
                                  },
                                }
                              : d
                          )
                        }
                        className="accent-[#D4AF37]"
                      />
                      إصدار شهادة إتمام امتحان تلقائيًا
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={certsData.rules.autoIssueExcellence}
                        onChange={(e) =>
                          setCertsData((d) =>
                            d
                              ? {
                                  ...d,
                                  rules: { ...d.rules, autoIssueExcellence: e.target.checked },
                                }
                              : d
                          )
                        }
                        className="accent-[#D4AF37]"
                      />
                      إصدار شهادة تفوق عند نسبة ≥
                      <input
                        type="number"
                        value={certsData.rules.excellenceMinPercentage}
                        onChange={(e) =>
                          setCertsData((d) =>
                            d
                              ? {
                                  ...d,
                                  rules: {
                                    ...d.rules,
                                    excellenceMinPercentage: Number(e.target.value),
                                  },
                                }
                              : d
                          )
                        }
                        className="w-16 px-2 py-1 rounded bg-[#0B1221] border border-white/10 font-mono-nums text-xs"
                      />
                      %
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={certsData.rules.autoIssueTopOfGrade}
                        onChange={(e) =>
                          setCertsData((d) =>
                            d
                              ? {
                                  ...d,
                                  rules: { ...d.rules, autoIssueTopOfGrade: e.target.checked },
                                }
                              : d
                          )
                        }
                        className="accent-[#D4AF37]"
                      />
                      إصدار شهادة أوائل الصف للمركز الأول
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveCertRules()}
                      className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                    >
                      حفظ الشروط
                    </button>
                  </div>

                  <form
                    onSubmit={handleIssueManualCert}
                    className="rounded-2xl bg-[#11192C] border border-white/10 p-5 space-y-3"
                  >
                    <h2 className="text-base font-bold text-[#D4AF37]">إصدار شهادة يدويًا</h2>
                    <input
                      type="search"
                      value={studentPickerQuery}
                      onChange={(e) => setStudentPickerQuery(e.target.value)}
                      placeholder="ابحث بالاسم أو رقم الهاتف لاختيار الطالب..."
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                    <select
                      required
                      value={manualCert.studentId}
                      onChange={(e) => setManualCert((m) => ({ ...m, studentId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    >
                      <option value="">اختر الطالب...</option>
                      {allStudentsSimple.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} — {s.gradeName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={manualCert.certType}
                      onChange={(e) => {
                        const map: Record<string, string> = {
                          appreciation: 'شهادة تقدير',
                          achievement: 'شهادة إنجاز',
                          excellence: 'شهادة تفوق',
                          top_of_grade: 'شهادة أوائل الصف',
                        };
                        setManualCert((m) => ({
                          ...m,
                          certType: e.target.value,
                          titleAr: map[e.target.value] || 'شهادة تقدير',
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    >
                      <option value="appreciation">شهادة تقدير</option>
                      <option value="achievement">شهادة إنجاز</option>
                      <option value="excellence">شهادة تفوق</option>
                      <option value="top_of_grade">شهادة أوائل الصف</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={manualCert.reasonAr}
                      onChange={(e) => setManualCert((m) => ({ ...m, reasonAr: e.target.value }))}
                      placeholder="سبب منح الشهادة..."
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                    >
                      إصدار الشهادة الآن
                    </button>
                  </form>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2.5">
                  {certsData.certificates.map((c) => {
                    const typeLabels: Record<string, string> = {
                      top_of_grade: 'أوائل الصف',
                      excellence: 'تفوق',
                      achievement: 'إنجاز',
                      appreciation: 'تقدير',
                      exam_completion: 'إتمام امتحان',
                    };
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-white/10 bg-[#11192C] p-4 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono-nums text-[#D4AF37]">
                              {c.serial_number}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] text-[10px] font-bold">
                              {typeLabels[c.cert_type] || 'شهادة'}
                            </span>
                          </div>
                          <div className="font-bold text-sm text-[#F8FAFC] truncate mt-0.5">
                            {c.studentName}
                          </div>
                          <div className="text-xs text-[#94A3B8]">
                            {c.title_ar} · {formatArabicDate(c.issued_at)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={pdfBusyId === c.id}
                          onClick={() => void handleDownloadAdminCert(c.id, c.serial_number)}
                          className="px-3 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {pdfBusyId === c.id ? '...' : 'PDF'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                      <tr>
                        <th className="py-3 px-4">الرقم التسلسلي</th>
                        <th className="py-3 px-4">الطالب</th>
                        <th className="py-3 px-4">الفئة</th>
                        <th className="py-3 px-4">الشهادة</th>
                        <th className="py-3 px-4">التاريخ</th>
                        <th className="py-3 px-4">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {certsData.certificates.map((c) => {
                        const typeLabels: Record<string, string> = {
                          top_of_grade: 'أوائل الصف',
                          excellence: 'تفوق',
                          achievement: 'إنجاز',
                          appreciation: 'تقدير',
                          exam_completion: 'إتمام امتحان',
                        };
                        return (
                          <tr key={c.id}>
                            <td className="py-3 px-4 font-mono-nums text-[#D4AF37]">
                              {c.serial_number}
                            </td>
                            <td className="py-3 px-4 font-bold">{c.studentName}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] text-xs font-bold">
                                {typeLabels[c.cert_type] || 'شهادة'}
                              </span>
                            </td>
                            <td className="py-3 px-4">{c.title_ar}</td>
                            <td className="py-3 px-4 text-xs text-[#94A3B8]">
                              {formatArabicDate(c.issued_at)}
                            </td>
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                disabled={pdfBusyId === c.id}
                                onClick={() => void handleDownloadAdminCert(c.id, c.serial_number)}
                                className="inline-flex items-center gap-1 text-xs text-[#D4AF37] font-bold hover:underline disabled:opacity-50"
                              >
                                <Download className="w-3.5 h-3.5" />
                                {pdfBusyId === c.id ? 'جاري التحميل...' : 'تحميل'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 12. تحليل الطلاب */}
            {section === 'analytics' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">تحليل مستوى الطلاب</h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      value={studentPickerQuery}
                      onChange={(e) => setStudentPickerQuery(e.target.value)}
                      placeholder="ابحث بالاسم أو الهاتف..."
                      className="px-3.5 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
                    />
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="px-4 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
                    >
                      <option value="">اختر طالبًا لعرض تحليله...</option>
                      {allStudentsSimple.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} — {s.gradeName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {!selectedStudentId ? (
                  <EmptyState
                    icon={BarChart3}
                    title="اختر طالبًا من القائمة"
                    description="لعرض تطور درجاته ونسب الإجابات الصحيحة والدروس التي تحتاج إلى مراجعة."
                  />
                ) : studentAnalytics ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">متوسط النسبة</div>
                        <div className="font-mono-nums text-2xl font-bold text-[#D4AF37]">
                          {studentAnalytics.analytics.averagePercentage}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">إجابات صحيحة</div>
                        <div className="font-mono-nums text-2xl font-bold text-emerald-400">
                          {studentAnalytics.analytics.correctRate}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">إجابات خاطئة</div>
                        <div className="font-mono-nums text-2xl font-bold text-red-400">
                          {studentAnalytics.analytics.wrongRate}%
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#11192C] border border-white/10 p-6">
                      <StudentTimelineChart timeline={studentAnalytics.analytics.timeline} />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* 13. الإشعارات */}
            {section === 'notifications' && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إرسال الإشعارات</h1>
                <form
                  onSubmit={handleSendNotification}
                  className="rounded-2xl bg-[#11192C] border border-white/10 p-5 space-y-3 max-w-xl"
                >
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">الصف المستهدف</label>
                    <select
                      value={notifForm.gradeId}
                      onChange={(e) => setNotifForm((f) => ({ ...f, gradeId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    >
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name_ar}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    required
                    value={notifForm.titleAr}
                    onChange={(e) => setNotifForm((f) => ({ ...f, titleAr: e.target.value }))}
                    placeholder="عنوان الإشعار..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                  />
                  <textarea
                    required
                    rows={2}
                    value={notifForm.bodyAr}
                    onChange={(e) => setNotifForm((f) => ({ ...f, bodyAr: e.target.value }))}
                    placeholder="محتوى الإشعار..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                  >
                    إرسال الإشعار للصف
                  </button>
                </form>

                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div key={n.id} className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                      <div className="font-bold text-sm">{n.title_ar}</div>
                      <p className="text-xs text-[#94A3B8] mt-1">{n.body_ar}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 14. الإحصائيات */}
            {section === 'stats' && overview && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إحصائيات الأداء العام</h1>
                <div className="rounded-2xl bg-[#11192C] border border-white/10 p-6">
                  <h2 className="text-base font-bold text-[#D4AF37] mb-4">
                    مقارنة متوسط الدرجات بين الصفوف الأربعة
                  </h2>
                  <GradeComparisonBarChart rows={overview.perGradeStats} />
                </div>
              </div>
            )}

            {/* 15. إعدادات المنصة وسجل التدقيق */}
            {section === 'settings' && settingsData && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إعدادات المنصة والأمان</h1>

                {settingsFeedback && (
                  <div
                    className={`p-3.5 rounded-xl border text-sm ${
                      settingsFeedback.type === 'ok'
                        ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                        : 'bg-red-950/60 border-red-500/40 text-red-200'
                    }`}
                  >
                    {settingsFeedback.text}
                  </div>
                )}

                <div className="rounded-2xl bg-[#11192C] border border-[#D4AF37]/25 p-5 space-y-2 text-sm">
                  <div className="font-bold text-[#D4AF37]">حالة الربط بقاعدة البيانات والتخزين:</div>
                  <div>
                    الوضع الحالي:{' '}
                    <strong className="text-[#F8FAFC]">
                      {settingsData.systemStatus.supabaseConfigured
                        ? 'متصل فعليًا بـ Supabase PostgreSQL + Storage'
                        : 'وضع المعاينة المحلي (SQLite) — بانتظار ضبط مفاتيح SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في الأسرار'}
                    </strong>
                  </div>
                  <div className="text-xs text-[#94A3B8] pt-1">
                    حدود Supabase Free Tier: قاعدة البيانات {settingsData.systemStatus.freeTierLimits.database} · التخزين {settingsData.systemStatus.freeTierLimits.storage} · نقل البيانات {settingsData.systemStatus.freeTierLimits.egress}
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  <form
                    onSubmit={handleUpdateTeacherProfile}
                    className="rounded-2xl bg-[#11192C] border border-white/10 p-5 space-y-3"
                  >
                    <h2 className="text-base font-bold text-[#F8FAFC]">بيانات الأستاذ في الواجهة</h2>
                    <input
                      type="text"
                      value={settingsData.teacherProfile.teacherName}
                      onChange={(e) =>
                        setSettingsData((s) =>
                          s
                            ? {
                                ...s,
                                teacherProfile: {
                                  ...s.teacherProfile,
                                  teacherName: e.target.value,
                                },
                              }
                            : s
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                    <input
                      type="text"
                      value={settingsData.teacherProfile.headline}
                      onChange={(e) =>
                        setSettingsData((s) =>
                          s
                            ? {
                                ...s,
                                teacherProfile: {
                                  ...s.teacherProfile,
                                  headline: e.target.value,
                                },
                              }
                            : s
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                    <textarea
                      rows={3}
                      value={settingsData.teacherProfile.bio}
                      onChange={(e) =>
                        setSettingsData((s) =>
                          s
                            ? {
                                ...s,
                                teacherProfile: { ...s.teacherProfile, bio: e.target.value },
                              }
                            : s
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                    >
                      حفظ التعديلات
                    </button>
                  </form>

                  <form
                    onSubmit={handleChangeAdminPasscode}
                    className="rounded-2xl bg-[#11192C] border border-white/10 p-5 space-y-3"
                  >
                    <h2 className="text-base font-bold text-[#F8FAFC]">تغيير رمز غرفة الإدارة</h2>
                    <p className="text-xs text-[#94A3B8]">
                      مصدر الرمز الحالي:{' '}
                      {settingsData.systemStatus.adminCodeSource === 'env'
                        ? 'متغير البيئة ADMIN_ACCESS_CODE (يُعدَّل من إعدادات الأسرار)'
                        : 'مشفّر في قاعدة البيانات'}
                    </p>
                    <input
                      type="password"
                      minLength={6}
                      value={newAdminPasscode}
                      onChange={(e) => setNewAdminPasscode(e.target.value)}
                      placeholder="رمز جديد (6 خانات على الأقل)"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
                    >
                      تحديث الرمز
                    </button>
                  </form>
                </div>

                <div className="space-y-3">
                  <h2 className="text-base font-bold text-[#D4AF37]">سجل التدقيق الأمني (Audit Logs)</h2>
                  <div className="md:hidden space-y-2">
                    {settingsData.auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-xl border border-white/10 bg-[#11192C] p-3.5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[#F8FAFC] font-semibold">{log.action}</span>
                          <span className="font-mono-nums text-[#94A3B8]">{log.ip_address || '—'}</span>
                        </div>
                        <div className="text-[#94A3B8]">
                          {log.target_type} ({log.target_id.slice(0, 8)}) ·{' '}
                          {formatArabicDateTime(log.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-3">الإجراء</th>
                          <th className="py-2.5 px-3">الهدف</th>
                          <th className="py-2.5 px-3">IP</th>
                          <th className="py-2.5 px-3">الوقت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {settingsData.auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="py-2.5 px-3 font-mono text-[#F8FAFC]">{log.action}</td>
                            <td className="py-2.5 px-3 text-[#94A3B8]">
                              {log.target_type} ({log.target_id.slice(0, 8)})
                            </td>
                            <td className="py-2.5 px-3 font-mono-nums text-[#94A3B8]">
                              {log.ip_address || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-[#94A3B8]">
                              {formatArabicDateTime(log.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>

      <Modal
        open={Boolean(editingGrade)}
        onClose={() => setEditingGrade(null)}
        title="تعديل بيانات الصف الدراسي"
      >
        <form onSubmit={handleSaveGrade} className="space-y-4">
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">اسم الصف الدراسي</label>
            <input
              type="text"
              required
              value={gradeForm.name_ar}
              onChange={(e) => setGradeForm((f) => ({ ...f, name_ar: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">الوصف المختصر</label>
            <textarea
              rows={2}
              value={gradeForm.description_ar}
              onChange={(e) => setGradeForm((f) => ({ ...f, description_ar: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingGrade(null)}
              className="px-4 py-2 rounded-lg bg-[#11192C] text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
            >
              حفظ التعديلات
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
