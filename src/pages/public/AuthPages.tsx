import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Phone,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { apiRequest, ApiError, setStoredStudentToken } from '../../lib/api';
import { BrandLogo } from '../../components/BrandLogo';
import type { GradeInfo, StudentSessionUser } from '../../types/domain';

interface AuthSuccessProps {
  locationSearch: string;
  onSuccess: (student: StudentSessionUser, token?: string) => void;
  onNavigate: (path: string) => void;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

function normalizeArabicToken(token: string): string {
  return token
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF\u0640]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[ہھۀ]/g, 'ه')
    .trim()
    .toLowerCase();
}

function validateClientQuadName(name: string): string | null {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF\u0640]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned || !/^[\p{L}\s]+$/u.test(cleaned)) {
    return 'يرجى إدخال الاسم الرباعي بحروف صحيحة دون أرقام أو رموز.';
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 4 || !parts.every((p) => p.length >= 2)) {
    return 'يرجى إدخال الاسم الرباعي كاملًا (أربعة مقاطع على الأقل، وكل مقطع من حرفين فأكثر).';
  }
  const counts = new Map<string, number>();
  let maxFreq = 0;
  for (const part of parts) {
    const norm = normalizeArabicToken(part);
    const c = (counts.get(norm) || 0) + 1;
    counts.set(norm, c);
    if (c > maxFreq) maxFreq = c;
  }
  if (maxFreq >= 3) {
    return 'لا يمكن تكرار نفس الاسم أكثر من مرتين داخل الاسم الرباعي؛ يرجى كتابة الاسم الحقيقي كاملًا.';
  }
  if (counts.size < 3) {
    return 'يرجى كتابة الاسم الرباعي الحقيقي (اسم الطالب والأب والجد واللقب) دون تكرار.';
  }
  return null;
}

export const RegisterPage: React.FC<AuthSuccessProps> = ({
  locationSearch,
  onSuccess,
  onNavigate,
}) => {
  const [grades, setGrades] = useState<GradeInfo[]>([]);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gradeId, setGradeId] = useState<number>(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [duplicateField, setDuplicateField] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch);
    const g = Number(params.get('grade'));
    if (g >= 1) setGradeId(g);
  }, [locationSearch]);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch);
    const g = Number(params.get('grade'));
    apiRequest<{ grades: GradeInfo[] }>('/api/public/landing')
      .then((res) => {
        setGrades(res.grades);
        if (g >= 1 && res.grades.some((item) => item.id === g)) {
          setGradeId(g);
        } else if (res.grades.length > 0 && !g) {
          setGradeId(res.grades[0].id);
        }
      })
      .catch(() => {});
  }, [locationSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDuplicateField('');
    const quadErr = validateClientQuadName(fullName);
    if (quadErr) {
      setError(quadErr);
      setDuplicateField('invalid_full_name');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ student: StudentSessionUser; token?: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ fullName, phoneNumber, gradeId, password, confirmPassword }),
        }
      );
      onSuccess(res.student, res.token);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setDuplicateField(typeof err.data?.field === 'string' ? err.data.field : '');
      } else {
        setError('تعذر إنشاء الحساب.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-royal-atmosphere relative flex flex-col justify-center px-3.5 sm:px-6 py-8 sm:py-12">
      <div className="bg-grid-hairline absolute inset-0 pointer-events-none opacity-45" />
      <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-60" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        className="relative max-w-md sm:max-w-lg w-full mx-auto"
      >
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#EED07A] mb-5 py-1.5 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للصفحة الرئيسية
        </button>

        <div className="relative overflow-hidden rounded-3xl surface-card-gold p-5 sm:p-8 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent" />
          <div className="mb-6">
            <BrandLogo variant="horizontal" size="sm" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] mt-5">
              إنشاء حساب طالب جديد
            </h1>
            <p className="text-sm text-[#94A3B8] mt-1.5 leading-relaxed">
              يرجى كتابة الاسم الرباعي كاملًا بدقة؛ المنصة تمنع تسجيل طالبين بنفس الاسم.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm space-y-2"
            >
              <div>{error}</div>
              {duplicateField === 'full_name' && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/login?grade=${gradeId}`)}
                  className="text-xs font-bold text-[#EED07A] hover:underline block"
                >
                  الانتقال إلى صفحة تسجيل الدخول ←
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                الاسم الرباعي
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (duplicateField === 'full_name' || duplicateField === 'invalid_full_name') {
                      setDuplicateField('');
                    }
                  }}
                  placeholder="مثال: محمد أحمد محمود علي"
                  className={`w-full min-h-[46px] pr-10 pl-3.5 py-2.5 rounded-xl bg-[#070B14] border focus:outline-none text-base sm:text-sm text-[#F8FAFC] transition-colors ${
                    duplicateField === 'full_name' || duplicateField === 'invalid_full_name'
                      ? 'border-red-500/70 focus:border-red-400'
                      : 'border-white/10 focus:border-[#D4AF37]'
                  }`}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                  رقم الهاتف
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      if (duplicateField === 'phone_number') setDuplicateField('');
                    }}
                    placeholder="01012345678"
                    className={`w-full min-h-[46px] pr-10 pl-3.5 py-2.5 rounded-xl bg-[#070B14] border focus:outline-none text-base sm:text-sm text-[#F8FAFC] font-mono-nums transition-colors ${
                      duplicateField === 'phone_number'
                        ? 'border-red-500/70 focus:border-red-400'
                        : 'border-white/10 focus:border-[#D4AF37]'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                  الصف الدراسي
                </label>
                <select
                  value={gradeId}
                  onChange={(e) => setGradeId(Number(e.target.value))}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] transition-colors"
                >
                  {(grades.length
                    ? grades
                    : [
                        { id: 1, name_ar: 'الصف الثالث الإعدادي' },
                        { id: 2, name_ar: 'الصف الأول الثانوي' },
                        { id: 3, name_ar: 'الصف الثاني الثانوي' },
                        { id: 4, name_ar: 'الصف الثالث الثانوي' },
                      ]
                  ).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="w-full min-h-[46px] pr-10 pl-10 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-3 text-[#94A3B8] hover:text-[#EED07A] p-0.5"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور"
                    className="w-full min-h-[46px] pr-10 pl-3.5 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] py-3.5 rounded-xl btn-gold-royal disabled:opacity-60 font-bold text-sm inline-flex items-center justify-center gap-2 mt-2"
            >
              <UserPlus className="w-4 h-4" />
              {submitting ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#94A3B8]">
            لديك حساب بالفعل؟{' '}
            <button
              type="button"
              onClick={() => onNavigate(`/login?grade=${gradeId}`)}
              className="text-[#EED07A] font-bold hover:underline"
            >
              تسجيل الدخول
            </button>
          </p>
        </div>
        <p className="mt-4 text-center text-[11px] text-[#94A3B8]/80">
          جميع الحقوق محفوظة محمد نصر © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
};

export const LoginPage: React.FC<AuthSuccessProps> = ({
  locationSearch,
  onSuccess,
  onNavigate,
}) => {
  const [grades, setGrades] = useState<GradeInfo[]>([]);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mismatchAuth, setMismatchAuth] = useState<{
    student: StudentSessionUser;
    token?: string;
    targetGradeName: string;
  } | null>(null);

  const params = new URLSearchParams(locationSearch);
  const targetGradeId = Number(params.get('grade')) || 0;

  useEffect(() => {
    apiRequest<{ grades: GradeInfo[] }>('/api/public/landing')
      .then((res) => setGrades(res.grades))
      .catch(() => {});
  }, []);

  const targetGrade = grades.find((g) => g.id === targetGradeId) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMismatchAuth(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ student: StudentSessionUser; token?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ fullName, password }),
        }
      );

      if (targetGradeId && res.student.gradeId !== targetGradeId) {
        setMismatchAuth({
          student: res.student,
          token: res.token,
          targetGradeName: targetGrade?.name_ar || 'الصف المختار',
        });
        return;
      }

      onSuccess(res.student, res.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدخول.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMismatch = async (goToRegister: boolean) => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredStudentToken(null);
    setMismatchAuth(null);
    if (goToRegister && targetGradeId) {
      onNavigate(`/register?grade=${targetGradeId}`);
    }
  };

  return (
    <div className="min-h-screen bg-royal-atmosphere relative flex flex-col justify-center px-3.5 sm:px-6 py-8 sm:py-12">
      <div className="bg-grid-hairline absolute inset-0 pointer-events-none opacity-45" />
      <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-60" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        className="relative max-w-md sm:max-w-lg w-full mx-auto"
      >
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#EED07A] mb-5 py-1.5 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للصفحة الرئيسية
        </button>

        <div className="relative overflow-hidden rounded-3xl surface-card-gold p-5 sm:p-8 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent" />
          <div className="mb-6">
            <BrandLogo variant="horizontal" size="sm" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] mt-5">
              تسجيل دخول الطالب
            </h1>
            <p className="text-sm text-[#94A3B8] mt-1.5">
              سجل الدخول بالاسم الرباعي وكلمة المرور من أي جهاز.
              {targetGrade && (
                <span className="block mt-1.5 text-xs font-bold text-[#EED07A]">
                  الصف المقصود: {targetGrade.name_ar}
                </span>
              )}
            </p>
          </div>

          {mismatchAuth ? (
            <div className="space-y-4 p-4 rounded-2xl bg-amber-950/35 border border-amber-500/40">
              <div className="flex items-start gap-2.5 text-amber-200 text-sm font-bold">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <span>تنبيه اختلاف الصف الدراسي</span>
              </div>
              <p className="text-sm text-[#E2E8F0] leading-relaxed">
                حساب الطالب <strong className="text-[#F8FAFC]">{mismatchAuth.student.fullName}</strong>{' '}
                مسجل في <strong className="text-[#EED07A]">{mismatchAuth.student.gradeName}</strong>،
                وليس في <strong className="text-[#F8FAFC]">{mismatchAuth.targetGradeName}</strong>.
              </p>
              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onSuccess(mismatchAuth.student, mismatchAuth.token)}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl btn-gold-royal text-xs sm:text-sm font-bold"
                >
                  المتابعة إلى صفك المسجل ({mismatchAuth.student.gradeName})
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelMismatch(true)}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl btn-royal-outline text-xs sm:text-sm font-bold"
                >
                  إنشاء حساب جديد في {mismatchAuth.targetGradeName}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelMismatch(false)}
                  className="w-full py-2 text-xs text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  تسجيل الدخول بحساب آخر
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                    الاسم الرباعي
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="الاسم الرباعي المسجل"
                      className="w-full min-h-[46px] pr-10 pl-3.5 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="كلمة المرور"
                      className="w-full min-h-[46px] pr-10 pl-10 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute left-3 top-3 text-[#94A3B8] hover:text-[#EED07A] p-0.5"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] py-3.5 rounded-xl btn-gold-royal disabled:opacity-60 font-bold text-sm inline-flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {submitting ? 'جاري التحقق...' : 'دخول إلى المنصة'}
                </button>
              </form>

              <div className="mt-5 p-3.5 rounded-2xl bg-[#070B14]/90 border border-white/[0.06] text-xs text-[#94A3B8] leading-relaxed">
                نسيت كلمة المرور؟ تواصل مع الأستاذ أحمد الرمادي لتعيين كلمة مرور مؤقتة جديدة لك من غرفة الإدارة.
              </div>

              <p className="mt-5 text-center text-sm text-[#94A3B8]">
                طالب جديد؟{' '}
                <button
                  type="button"
                  onClick={() => onNavigate(targetGradeId ? `/register?grade=${targetGradeId}` : '/register')}
                  className="text-[#EED07A] font-bold hover:underline"
                >
                  أنشئ حسابك الآن
                </button>
              </p>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-[#94A3B8]/80">
          جميع الحقوق محفوظة محمد نصر © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
};

export const ForcePasswordChangePage: React.FC<{
  student: StudentSessionUser;
  onUpdated: () => void;
  onLogout: () => void;
}> = ({ student, onUpdated, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحديث كلمة المرور.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-royal-atmosphere relative flex flex-col justify-center px-3.5 sm:px-6 py-8 sm:py-12">
      <div className="bg-grid-hairline absolute inset-0 pointer-events-none opacity-45" />
      <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-60" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        className="relative overflow-hidden max-w-md sm:max-w-lg w-full mx-auto rounded-3xl surface-card-gold p-5 sm:p-8 shadow-2xl"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent" />
        <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#EED07A] mb-5">
          <KeyRound className="w-6 h-6" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
          تعيين كلمة مرور شخصية جديدة
        </h1>
        <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
          مرحبًا <strong className="text-[#F8FAFC]">{student.fullName}</strong>. تم تسجيل دخولك بكلمة
          مرور مؤقتة صادرة من الأستاذ، ويرجى اختيار كلمة مرور خاصة بك الآن للمتابعة.
        </p>

        {error && (
          <div className="mt-4 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full min-h-[46px] pr-3.5 pl-10 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC]"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute left-3 top-3 text-[#94A3B8] hover:text-[#EED07A] p-0.5"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد كتابة كلمة المرور"
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] py-3.5 rounded-xl btn-gold-royal disabled:opacity-60 font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {submitting ? 'جاري الحفظ...' : 'حفظ كلمة المرور والدخول'}
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="mt-4 w-full text-center text-xs text-[#94A3B8] hover:text-[#F8FAFC] py-2"
        >
          تسجيل الخروج
        </button>
        <p className="mt-3 pt-3 border-t border-white/[0.06] text-center text-[11px] text-[#94A3B8]/80">
          جميع الحقوق محفوظة محمد نصر © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
};
