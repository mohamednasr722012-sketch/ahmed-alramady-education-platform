import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, Lock, Shield, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiError, setStoredAdminToken } from '../../lib/api';
import { BrandLogo } from '../../components/BrandLogo';
import { LoadingSkeleton } from '../../components/EmptyState';

interface AdminGateProps {
  onAuthenticated: (token?: string) => void;
  onNavigate: (path: string) => void;
}

export const AdminGatePage: React.FC<AdminGateProps> = ({ onAuthenticated, onNavigate }) => {
  const [status, setStatus] = useState<{
    configured: boolean;
    source: 'env' | 'db' | 'unconfigured';
    authenticated: boolean;
  } | null>(null);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // إبطال أي جلسة إدارة سابقة لضمان طلب الرمز في كل مرة يُفتح فيها باب الإدارة
      setStoredAdminToken(null);
      await apiRequest('/api/auth/admin/logout', { method: 'POST' }).catch(() => {});
      try {
        const res = await apiRequest<{
          configured: boolean;
          source: 'env' | 'db' | 'unconfigured';
          authenticated: boolean;
        }>('/api/auth/admin/status');
        if (active) setStatus(res);
      } catch {
        if (active) setStatus({ configured: true, source: 'env', authenticated: false });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ token?: string }>('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      setPasscode('');
      onAuthenticated(res.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر التحقق من رمز الإدارة.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFirstSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ token?: string }>('/api/auth/admin/setup', {
        method: 'POST',
        body: JSON.stringify({ passcode, confirmPasscode }),
      });
      setPasscode('');
      setConfirmPasscode('');
      onAuthenticated(res.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ رمز الإدارة.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!status) {
    return (
      <div className="min-h-screen bg-royal-atmosphere flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingSkeleton rows={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-royal-atmosphere relative flex flex-col justify-center px-3.5 sm:px-6 py-8 sm:py-12">
      <div className="bg-grid-hairline absolute inset-0 pointer-events-none opacity-45" />
      <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-60" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-w-md sm:max-w-lg w-full mx-auto"
      >
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#EED07A] mb-5 py-1.5 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى المنصة
        </button>

        <div className="relative overflow-hidden rounded-3xl surface-card-gold p-6 sm:p-8 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent" />
          <div className="flex items-center justify-between mb-6">
            <BrandLogo variant="horizontal" size="sm" />
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/12 border border-[#D4AF37]/35 flex items-center justify-center text-[#EED07A]">
              <Shield className="w-5 h-5" />
            </div>
          </div>

          {!status.configured ? (
            <>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                تهيئة رمز غرفة الإدارة لأول مرة
              </h1>
              <p className="text-sm text-[#94A3B8] mt-1.5 leading-relaxed">
                لم يتم ضبط متغير البيئة <span className="font-mono text-xs">ADMIN_ACCESS_CODE</span> بعد.
                يمكنك تعيين رمز الإدارة الخاص بك الآن، وسيُحفظ مشفّرًا على الخادم ويُطلب إدخاله في كل مرة تدخل فيها لغرفة الإدارة.
              </p>

              {error && (
                <div className="mt-4 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleFirstSetup} autoComplete="off" className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                    رمز الإدارة المعتمد
                  </label>
                  <div className="relative">
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="أدخل رمز الدخول الإداري"
                      className="w-full min-h-[46px] pr-3.5 pl-10 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] font-mono-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode((v) => !v)}
                      aria-label={showPasscode ? 'إخفاء الرمز' : 'إظهار الرمز'}
                      className="absolute left-3 top-3 text-[#94A3B8] hover:text-[#EED07A] p-0.5"
                    >
                      {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                    تأكيد رمز الإدارة
                  </label>
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    placeholder="أعد كتابة الرمز"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] font-mono-nums"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] py-3 rounded-xl btn-gold-royal font-bold text-sm inline-flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {submitting ? 'جاري التهيئة...' : 'حفظ الرمز والدخول لغرفة الإدارة'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                دخول غرفة الإدارة — الأستاذ
              </h1>
              <p className="text-sm text-[#94A3B8] mt-1.5 leading-relaxed">
                لأمان المنصة، يُطلب إدخال رمز الدخول الإداري في كل مرة تدخل فيها إلى غرفة الإدارة.
              </p>

              {error && (
                <div className="mt-4 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} autoComplete="off" className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#F8FAFC] mb-1.5">
                    رمز دخول الإدارة
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3.5" />
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="•••••••••"
                      className="w-full min-h-[46px] pr-10 pl-10 py-2.5 rounded-xl bg-[#070B14] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-base sm:text-sm text-[#F8FAFC] font-mono-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode((v) => !v)}
                      aria-label={showPasscode ? 'إخفاء الرمز' : 'إظهار الرمز'}
                      className="absolute left-3 top-3 text-[#94A3B8] hover:text-[#EED07A] p-0.5"
                    >
                      {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] py-3 rounded-xl btn-gold-royal disabled:opacity-60 font-bold text-sm"
                >
                  {submitting ? 'جاري التحقق...' : 'دخول غرفة الإدارة'}
                </button>
              </form>
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
