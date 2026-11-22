import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Crown,
  Feather,
  FileText,
  GraduationCap,
  LogIn,
  Menu,
  PenTool,
  Play,
  PlayCircle,
  RefreshCw,
  ScrollText,
  Search,
  Shield,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { formatArabicDate } from '../../lib/formatters';
import { BrandLogo } from '../../components/BrandLogo';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import type { CumulativeRankEntry, GradeInfo, StudentSessionUser } from '../../types/domain';

interface LandingResponse {
  teacherProfile: {
    title: string;
    teacherName: string;
    headline: string;
    bio: string;
    portraitUrl: string;
  };
  grades: GradeInfo[];
  latestVideos: Array<{
    id: string;
    title: string;
    description: string;
    gradeId: number;
    gradeName: string;
    unitTitle: string;
    lessonTitle: string;
    thumbnailUrl: string | null;
    publishedAt: string;
  }>;
  latestExams: Array<{
    id: string;
    title: string;
    description: string;
    gradeId: number;
    gradeName: string;
    questionCount: number;
    totalPoints: number;
    durationMinutes: number;
    publishedAt: string;
  }>;
  honorRollsByGrade: Array<{
    gradeId: number;
    gradeName: string;
    topStudents: CumulativeRankEntry[];
  }>;
}

interface LandingPageProps {
  currentStudent: StudentSessionUser | null;
  onNavigate: (path: string) => void;
  onSwitchAccountAndNavigate: (nextTarget: string) => Promise<void>;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const OrnamentDivider: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-4" aria-hidden="true">
    <div className="h-px flex-1 bg-gradient-to-l from-[#D4AF37]/30 via-white/[0.08] to-transparent" />
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#D4AF37]/65 shrink-0">
      <polygon points="12,2 15,9 22,12 15,15 12,22 9,15 2,12 9,9" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
    <div className="h-px flex-1 bg-gradient-to-r from-[#D4AF37]/30 via-white/[0.08] to-transparent" />
  </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  currentStudent,
  onNavigate,
  onSwitchAccountAndNavigate,
}) => {
  const [data, setData] = useState<LandingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeHonorGrade, setActiveHonorGrade] = useState<number>(1);
  const [switchModalGrade, setSwitchModalGrade] = useState<GradeInfo | null>(null);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySerial, setVerifySerial] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    serialNumber: string;
    studentName: string;
    gradeName: string;
    certType: string;
    titleAr: string;
    reasonAr: string;
    issuedAt: string;
  } | null>(null);

  const handleVerifyCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = verifySerial.trim();
    if (!trimmed) {
      setVerifyError('يرجى إدخال الرقم التسلسلي للشهادة.');
      return;
    }
    setVerifyLoading(true);
    setVerifyError('');
    setVerifyResult(null);
    try {
      const res = await apiRequest<{
        valid: boolean;
        certificate: NonNullable<typeof verifyResult>;
      }>(`/api/public/certificates/verify/${encodeURIComponent(trimmed)}`);
      setVerifyResult(res.certificate);
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'تعذر التحقق من الشهادة.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const loadLanding = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiRequest<LandingResponse>('/api/public/landing');
      setData(res);
      if (res.grades.length > 0) {
        setActiveHonorGrade((prev) =>
          res.grades.some((g) => g.id === prev) ? prev : res.grades[0].id
        );
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات الصفحة الرئيسية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLanding();
  }, [loadLanding]);

  const handleGradeAction = (grade: GradeInfo) => {
    if (!currentStudent) {
      onNavigate(`/register?grade=${grade.id}`);
      return;
    }
    if (currentStudent.gradeId === grade.id) {
      onNavigate('/student');
      return;
    }
    setSwitchModalGrade(grade);
  };

  const handleConfirmSwitch = async (nextTarget: string) => {
    setSwitchingAccount(true);
    try {
      setSwitchModalGrade(null);
      await onSwitchAccountAndNavigate(nextTarget);
    } finally {
      setSwitchingAccount(false);
    }
  };

  const portraitUrl =
    data?.teacherProfile.portraitUrl ||
    '/assets/aistudio/8c90e49c3fc2c338f135fac6a737bb9d_tplv-tiktokx-cropcenter_1080_1080_c7ae25b5.jpeg';

  const activeHonor = data?.honorRollsByGrade.find((h) => h.gradeId === activeHonorGrade);

  const navLinks = [
    { href: '#branches', label: 'فروع اللغة' },
    { href: '#grades', label: 'الصفوف' },
    { href: '#videos', label: 'الفيديوهات' },
    { href: '#exams', label: 'الامتحانات' },
    { href: '#honor-roll', label: 'لوحة الشرف' },
  ];

  const getRankBadgeStyle = (rank: number) => {
    if (rank === 1) {
      return 'bg-gradient-to-br from-[#F6E29C] to-[#C89F28] text-[#05070C] border-[#F6E29C]/70 shadow-md shadow-[#D4AF37]/25';
    }
    if (rank === 2) {
      return 'bg-slate-200/15 text-slate-100 border-slate-300/40';
    }
    if (rank === 3) {
      return 'bg-amber-700/25 text-amber-300 border-amber-600/45';
    }
    return 'bg-[#0A101E] text-[#D4AF37] border-[#D4AF37]/25';
  };

  const arabicBranches = [
    {
      num: '01',
      icon: Feather,
      branch: 'النحو والإعراب',
      tag: 'تأسيس وتطبيق',
      desc: 'تحليل الجملة العربية وضبط أواخر الكلمات وفهم الوظائف الإعرابية بتطبيقات عملية بعيدة عن التلقين الآلي.',
      featured: true,
    },
    {
      num: '02',
      icon: BookOpen,
      branch: 'البلاغة والبيان',
      tag: 'تذوّق جمالي',
      desc: 'إدراك أسرار البيان والبديع والمعاني واستخراج الصور البلاغية وربطها بالسياق الأدبي بدقة وسلاسة.',
      featured: true,
    },
    {
      num: '03',
      icon: ScrollText,
      branch: 'الأدب والنصوص',
      tag: 'تحليل ونقد',
      desc: 'ربط العصور والمدارس الأدبية بالنصوص المتحررة واستنباط العاطفة والفكر.',
      featured: false,
    },
    {
      num: '04',
      icon: FileText,
      branch: 'القراءة المتحررة',
      tag: 'فهم واستنتاج',
      desc: 'تفكيك المقالات العلمية والأدبية واستخلاص الفكرة الرئيسة والعلاقات الضمنية.',
      featured: false,
    },
    {
      num: '05',
      icon: PenTool,
      branch: 'قواعد الإملاء',
      tag: 'سلامة الرسم',
      desc: 'إتقان الهمزات والألف اللينة وعلامات الترقيم لكتابة عربية سليمة ومُتقنة.',
      featured: false,
    },
    {
      num: '06',
      icon: Trophy,
      branch: 'التعبير والإنشاء',
      tag: 'صياغة رصينة',
      desc: 'بناء الفقرات المترابطة وتوظيف التراكيب الفصيحة والشواهد الأدبية في الكتابة.',
      featured: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#05070C] text-[#F8FAFC] flex flex-col">
      {/* 1. Crisp 3-Zone Royal Header (≤ 64px Mobile Height) */}
      <header className="sticky top-0 z-40 bg-[#05070C]/90 backdrop-blur-md border-b border-[#D4AF37]/18">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:gap-8">
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              onNavigate('/');
            }}
            className="text-right rounded-lg min-w-0 shrink-0"
          >
            <BrandLogo variant="horizontal" size="sm" />
          </button>

          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-semibold text-[#94A3B8]">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative py-1 hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px] after:bg-[#D4AF37] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {currentStudent ? (
              <button
                type="button"
                onClick={() => onNavigate('/student')}
                className="px-4 sm:px-5 py-2.5 rounded-xl btn-gold-royal text-xs sm:text-sm font-bold whitespace-nowrap shrink-0"
              >
                لوحة الطالب
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="px-4 sm:px-5 py-2.5 rounded-xl btn-gold-royal text-xs sm:text-sm font-bold whitespace-nowrap shrink-0"
              >
                تسجيل الدخول
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={mobileNavOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              aria-expanded={mobileNavOpen}
              className="md:hidden w-10 h-10 rounded-xl bg-[#0F172A] border border-white/10 flex items-center justify-center text-[#D4AF37] hover:border-[#D4AF37]/45 transition-colors"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Menu Drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="md:hidden overflow-hidden border-t border-white/[0.08] bg-[#0A101E]/98 backdrop-blur-md"
            >
              <div className="px-4 py-3 grid grid-cols-2 gap-2">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileNavOpen(false)}
                    className="px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-white/[0.08] text-xs font-bold text-[#F8FAFC] hover:border-[#D4AF37]/40 text-center transition-colors whitespace-nowrap"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">
        {loadError && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
            <div className="p-4 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void loadLanding()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-gold-royal text-xs font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                إعادة المحاولة
              </button>
            </div>
          </div>
        )}

        {/* 2. Royal Architectural Hero Section */}
        <section className="relative overflow-hidden bg-royal-atmosphere">
          <div className="bg-grid-hairline absolute inset-0 pointer-events-none opacity-60" />
          <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-75" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-22">
            <div className="grid lg:grid-cols-12 gap-9 lg:gap-12 items-stretch">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, ease: EASE_OUT }}
                className="lg:col-span-7 flex flex-col justify-center"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="h-px w-8 bg-gradient-to-l from-[#D4AF37] to-transparent" />
                  <span className="text-xs sm:text-sm font-semibold text-[#EED07A] tracking-wide">
                    المنصة التعليمية الرسمية للأستاذ أحمد الرمادي
                  </span>
                </div>

                <h1 className="font-display text-[clamp(2.25rem,4.8vw,4.1rem)] font-bold text-[#F8FAFC] leading-[1.15] mb-5 text-balance">
                  أحمد الرمادي{' '}
                  <span className="text-gold-gradient block sm:inline mt-1 sm:mt-0">
                    ملك اللغة العربية
                  </span>
                </h1>

                <p className="text-sm sm:text-base lg:text-lg text-[#94A3B8] leading-relaxed max-w-2xl mb-8">
                  {data?.teacherProfile.headline ||
                    'بيئة تعليمية متكاملة تجمع بين الشرح المرئي المنهجي، والامتحانات الإلكترونية الدقيقة، والمتابعة التراكمية المستمرة لبناء التفوق في اللغة العربية.'}
                </p>

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                  {currentStudent ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('/student')}
                      className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl btn-gold-royal font-bold text-sm sm:text-base whitespace-nowrap shrink-0"
                    >
                      <GraduationCap className="w-5 h-5" />
                      دخول لوحة الطالب ({currentStudent.gradeName})
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onNavigate('/register')}
                        className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl btn-gold-royal font-bold text-sm sm:text-base whitespace-nowrap shrink-0"
                      >
                        <UserPlus className="w-5 h-5" />
                        إنشاء حساب طالب جديد
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('/login')}
                        className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl btn-royal-outline font-bold text-sm sm:text-base whitespace-nowrap shrink-0"
                      >
                        <LogIn className="w-5 h-5 text-[#D4AF37]" />
                        تسجيل الدخول
                      </button>
                    </>
                  )}
                </div>

                {/* Unboxed Architectural Proof Strip */}
                <div className="mt-10 sm:mt-12 pt-6 border-t border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-5 sm:gap-6">
                  <div className="sm:border-l sm:border-white/[0.07] sm:pl-4">
                    <div className="font-mono-nums text-2xl sm:text-3xl font-bold text-[#EED07A]">4</div>
                    <div className="text-xs text-[#94A3B8] mt-1">صفوف دراسية معزولة</div>
                  </div>
                  <div className="sm:border-l sm:border-white/[0.07] sm:pl-4">
                    <div className="font-mono-nums text-2xl sm:text-3xl font-bold text-[#F8FAFC]">100%</div>
                    <div className="text-xs text-[#94A3B8] mt-1">تصحيح ومؤقت خادمي</div>
                  </div>
                  <div className="sm:border-l sm:border-white/[0.07] sm:pl-4">
                    <div className="font-mono-nums text-2xl sm:text-3xl font-bold text-[#F8FAFC]">PDF</div>
                    <div className="text-xs text-[#94A3B8] mt-1">شهادات تفوق عربية</div>
                  </div>
                  <div>
                    <div className="font-mono-nums text-2xl sm:text-3xl font-bold text-[#F8FAFC]">24/7</div>
                    <div className="text-xs text-[#94A3B8] mt-1">دخول مرن عبر الأجهزة</div>
                  </div>
                </div>
              </motion.div>

              {/* Museum-Bezel Architectural Portrait Frame */}
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.48, delay: 0.06, ease: EASE_OUT }}
                className="lg:col-span-5 flex items-center"
              >
                <div className="relative w-full mx-auto max-w-md lg:max-w-none">
                  {/* Soft Radial Brass Backlight */}
                  <div
                    aria-hidden="true"
                    className="absolute -inset-4 rounded-3xl bg-radial from-[#D4AF37]/15 via-transparent to-transparent blur-2xl pointer-events-none"
                  />

                  <div className="relative p-2.5 sm:p-3 rounded-[26px] surface-card-gold">
                    {/* Subtle Corner Architectural Hairlines */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1.5 right-1.5 w-5 h-5 border-t border-r border-[#EED07A]/60 rounded-tr-xl"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-1.5 left-1.5 w-5 h-5 border-b border-l border-[#EED07A]/60 rounded-bl-xl"
                    />

                    <div className="relative rounded-2xl overflow-hidden bg-[#0A101E] aspect-[4/4.3] sm:aspect-[4/3.6] lg:aspect-[4/4.5]">
                      <img
                        src={portraitUrl}
                        alt="الأستاذ أحمد الرمادي — ملك اللغة العربية"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#05070C] via-[#05070C]/85 to-transparent p-5 sm:p-6">
                        <p className="font-display text-xl sm:text-2xl font-bold text-[#F8FAFC]">
                          {data?.teacherProfile.teacherName || 'الأستاذ أحمد الرمادي'}
                        </p>
                        <p className="text-xs sm:text-sm text-[#EED07A] mt-1">
                          ملك اللغة العربية · النحو والبلاغة والبيان
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <OrnamentDivider />

        {/* 3. Teacher Manifesto & Literary Heritage */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.38, ease: EASE_OUT }}
          className="py-12 sm:py-16"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl surface-card-gold p-6 sm:p-10 lg:p-12">
              <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-40" />
              <div className="relative grid md:grid-cols-12 gap-6 sm:gap-8 items-center">
                <div className="md:col-span-3 flex justify-center md:justify-start">
                  <div className="p-6 rounded-2xl bg-[#05070C]/80 border border-[#D4AF37]/30 shadow-inner">
                    <BrandLogo variant="icon" size="lg" className="sm:scale-110" />
                  </div>
                </div>
                <div className="md:col-span-9 text-center md:text-right">
                  <div className="text-xs font-bold text-[#D4AF37] tracking-wide mb-2">
                    رسالة الأستاذ ومنهج تدريس لغة الضاد
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] mb-3">
                    عن الأستاذ أحمد الرمادي
                  </h2>
                  <p className="text-[#94A3B8] leading-relaxed text-sm sm:text-base max-w-3xl">
                    {data?.teacherProfile.bio ||
                      'أستاذ اللغة العربية وخبير تدريس النحو والبلاغة والبيان، متخصص في تبسيط قواعد اللغة وتدريب الطلاب على نظام التقييم الحديث عبر امتحانات دقيقة وشروحات مرئية متكاملة.'}
                  </p>
                  <div className="mt-6 pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-display text-[#EED07A] font-semibold">
                      «إِنَّ مِنَ البَيَانِ لَسِحْرًا» — إتقانُ العربيةِ يبدأُ من الفهمِ والتذوّقِ لا الحفظ
                    </span>
                    <span className="text-xs text-[#94A3B8] shrink-0">
                      النحو · البلاغة · الأدب · النصوص
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* 3.5. فروع اللغة العربية — Asymmetric Editorial Bento */}
        <section id="branches" className="py-12 sm:py-16 bg-[#0A101E]/45 border-y border-white/[0.06]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
            >
              <div>
                <div className="text-xs font-bold text-[#D4AF37] mb-1.5">أركان لغة الضاد</div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                  فروع اللغة العربية في المنصة
                </h2>
              </div>
              <p className="text-sm text-[#94A3B8] max-w-xl">
                تغطية شاملة ومتدرجة لجميع فروع المادة لبناء ملكة الفهم والتذوّق والإجابة الدقيقة.
              </p>
            </motion.div>

            {/* Row 1: Two Marquee Featured Branches */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-5">
              {arabicBranches
                .filter((b) => b.featured)
                .map((item, idx) => (
                  <motion.div
                    key={item.branch}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.32, delay: idx * 0.05, ease: EASE_OUT }}
                    className="group relative overflow-hidden rounded-2xl surface-card-gold p-6 sm:p-7 hover:border-[#D4AF37]/45 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2.5 text-xs font-semibold text-[#EED07A]">
                        <span className="font-mono-nums font-bold">{item.num}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.tag}</span>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-[#05070C]/80 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] group-hover:border-[#EED07A]/60 transition-colors">
                        <item.icon className="w-5 h-5" />
                      </div>
                    </div>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-[#F8FAFC] mb-2">
                      {item.branch}
                    </h3>
                    <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
            </div>

            {/* Row 2: Four Complementary Branches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {arabicBranches
                .filter((b) => !b.featured)
                .map((item, idx) => (
                  <motion.div
                    key={item.branch}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.32, delay: idx * 0.04, ease: EASE_OUT }}
                    className="rounded-2xl surface-card p-5 sm:p-6 hover:border-[#D4AF37]/35 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3.5">
                        <div className="flex items-center gap-2 text-xs text-[#D4AF37] font-semibold">
                          <span className="font-mono-nums font-bold">{item.num}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.tag}</span>
                        </div>
                        <item.icon className="w-4 h-4 text-[#D4AF37]/80 shrink-0" />
                      </div>
                      <h3 className="font-display text-lg font-bold text-[#F8FAFC] mb-1.5">
                        {item.branch}
                      </h3>
                      <p className="text-sm text-[#94A3B8] leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
            </div>
          </div>
        </section>

        {/* 4. Four Isolated Grades */}
        <section id="grades" className="py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
            >
              <div>
                <div className="text-xs font-bold text-[#D4AF37] mb-1.5">المسارات التعليمية</div>
                <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-[#F8FAFC]">
                  الصفوف الدراسية
                </h2>
              </div>
              <p className="text-sm text-[#94A3B8] max-w-xl">
                كل صف دراسي مستقل تمامًا بملفاته وفيديوهاته وامتحاناته ولوحة شرفه دون أي اختلاط.
              </p>
            </motion.div>

            {loading ? (
              <LoadingSkeleton rows={2} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
                {(data?.grades || []).map((grade, index) => {
                  const isCurrentStudentGrade = currentStudent?.gradeId === grade.id;
                  const stageLabel = grade.id === 1 ? 'الشهادة الإعدادية' : 'المرحلة الثانوية';
                  return (
                    <motion.div
                      key={grade.id}
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{ duration: 0.34, delay: index * 0.05, ease: EASE_OUT }}
                      className={`group relative overflow-hidden rounded-2xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${
                        isCurrentStudentGrade
                          ? 'surface-card-gold border-[#D4AF37]'
                          : 'surface-card hover:border-[#D4AF37]/45'
                      }`}
                    >
                      {/* Top subtle brass sheen edge on hover */}
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3 text-xs">
                          <span className="font-mono-nums text-[#D4AF37] font-bold">
                            {String(index + 1).padStart(2, '0')} · {stageLabel}
                          </span>
                          {isCurrentStudentGrade && (
                            <span className="text-[11px] font-bold text-[#EED07A]">
                              صفك المسجل
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-xl font-bold text-[#F8FAFC] mb-2 group-hover:text-[#EED07A] transition-colors">
                          {grade.name_ar}
                        </h3>
                        <p className="text-sm text-[#94A3B8] leading-relaxed">
                          {grade.description_ar}
                        </p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-white/[0.07] space-y-2.5">
                        <button
                          type="button"
                          onClick={() => handleGradeAction(grade)}
                          className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-bold whitespace-nowrap ${
                            isCurrentStudentGrade
                              ? 'btn-gold-royal'
                              : 'btn-royal-outline hover:bg-[#D4AF37] hover:text-[#05070C] hover:border-[#D4AF37]'
                          }`}
                        >
                          {isCurrentStudentGrade
                            ? 'دخول لوحة صفك'
                            : currentStudent
                              ? 'دخول / تسجيل في هذا الصف'
                              : 'التسجيل في هذا الصف'}
                        </button>
                        {!currentStudent && (
                          <button
                            type="button"
                            onClick={() => onNavigate(`/login?grade=${grade.id}`)}
                            className="w-full py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-[#D4AF37] transition-colors"
                          >
                            لديك حساب في هذا الصف؟ تسجيل الدخول
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <OrnamentDivider />

        {/* 5. Latest Videos */}
        <section id="videos" className="py-12 sm:py-16 bg-[#0A101E]/35">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-[#D4AF37] mb-1.5">المكتبة المرئية</div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                  أحدث الفيديوهات
                </h2>
              </div>
              <p className="text-sm text-[#94A3B8]">
                شروحات مرئية منظمة حسب الصف والوحدة والدرس بجودة تشغيل ثابتة.
              </p>
            </div>

            {loading ? (
              <LoadingSkeleton rows={2} />
            ) : !data?.latestVideos.length ? (
              <EmptyState
                icon={PlayCircle}
                title="لا توجد فيديوهات منشورة بعد"
                description="عند قيام الأستاذ برفع ونشر الدروس المرئية ستظهر هنا أحدث الحصص المتاحة."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {data.latestVideos.map((vid, idx) => (
                  <motion.div
                    key={vid.id}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.34, delay: idx * 0.05, ease: EASE_OUT }}
                    className="group rounded-2xl surface-card hover:border-[#D4AF37]/40 overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-1"
                  >
                    <div className="aspect-video bg-[#05070C] relative flex items-center justify-center overflow-hidden">
                      {vid.thumbnailUrl ? (
                        <img
                          src={vid.thumbnailUrl}
                          alt={vid.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-royal-atmosphere bg-arabesque-lattice flex flex-col items-center justify-center gap-2 p-4 text-center">
                          <div className="w-12 h-12 rounded-full bg-[#0A101E]/90 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                            <Play className="w-5 h-5 fill-current" />
                          </div>
                          <span className="text-xs font-semibold text-[#EED07A]/85 truncate max-w-full">
                            {vid.lessonTitle}
                          </span>
                        </div>
                      )}
                      {vid.thumbnailUrl && (
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070C]/65 via-transparent to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="w-12 h-12 rounded-full bg-[#D4AF37]/95 text-[#05070C] flex items-center justify-center shadow-lg">
                            <Play className="w-5 h-5 fill-current" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-semibold text-[#D4AF37] mb-1.5">
                          {vid.gradeName} · {vid.unitTitle}
                        </div>
                        <h3 className="text-base font-bold text-[#F8FAFC] mb-2">{vid.title}</h3>
                        <p className="text-sm text-[#94A3B8] line-clamp-2">{vid.description}</p>
                      </div>
                      <div className="mt-4 pt-3.5 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>{formatArabicDate(vid.publishedAt)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentStudent && currentStudent.gradeId === vid.gradeId) {
                              onNavigate(`/student/videos/${vid.id}`);
                            } else if (currentStudent) {
                              const g = data?.grades.find((item) => item.id === vid.gradeId);
                              if (g) setSwitchModalGrade(g);
                            } else {
                              onNavigate(`/login?grade=${vid.gradeId}`);
                            }
                          }}
                          className="text-[#EED07A] hover:text-[#F8FAFC] font-bold py-1 transition-colors"
                        >
                          مشاهدة الدرس ←
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 6. Latest Exams */}
        <section id="exams" className="py-12 sm:py-16 border-y border-white/[0.06]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-[#D4AF37] mb-1.5">التقييم الإلكتروني</div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                  أحدث الامتحانات
                </h2>
              </div>
              <p className="text-sm text-[#94A3B8]">
                امتحانات إلكترونية محكمة التوقيت والتصحيح التلقائي على الخادم.
              </p>
            </div>

            {loading ? (
              <LoadingSkeleton rows={2} />
            ) : !data?.latestExams.length ? (
              <EmptyState
                icon={FileText}
                title="لا توجد امتحانات منشورة حاليًا"
                description="بمجرد نشر الأستاذ للامتحانات الدورية ستظهر تفاصيلها هنا للطلاب."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {data.latestExams.map((ex, idx) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.34, delay: idx * 0.05, ease: EASE_OUT }}
                    className="rounded-2xl surface-card-gold hover:border-[#D4AF37]/50 p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#D4AF37] mb-2 font-mono-nums">
                        {ex.gradeName} · {ex.questionCount} أسئلة · {ex.totalPoints} درجة
                      </div>
                      <h3 className="text-lg font-bold text-[#F8FAFC] mb-2">{ex.title}</h3>
                      <p className="text-sm text-[#94A3B8] line-clamp-2">{ex.description}</p>
                    </div>
                    <div className="mt-5 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#94A3B8]">
                      <span className="inline-flex items-center gap-1.5 font-mono-nums">
                        <Clock className="w-4 h-4 text-[#D4AF37]" />
                        {ex.durationMinutes} دقيقة
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentStudent && currentStudent.gradeId === ex.gradeId) {
                            onNavigate('/student/exams');
                          } else if (currentStudent) {
                            const g = data?.grades.find((item) => item.id === ex.gradeId);
                            if (g) setSwitchModalGrade(g);
                          } else {
                            onNavigate(`/login?grade=${ex.gradeId}`);
                          }
                        }}
                        className="text-[#EED07A] hover:text-[#F8FAFC] font-bold py-1 transition-colors"
                      >
                        دخول الامتحان ←
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 7. Isolated Grade Honor Roll with Top-3 Royal Podium */}
        <section id="honor-roll" className="py-12 sm:py-16 bg-[#0A101E]/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <div className="text-xs font-bold text-[#D4AF37] mb-1.5">التنافس الشريف</div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                  أوائل الطلاب
                </h2>
                <p className="text-sm text-[#94A3B8] mt-1.5">
                  لوحة شرف مستقلة لكل صف مرتبة بالنسب المئوية والمجموع التراكمي المفتوح مع بيان عدد الامتحانات.
                </p>
              </div>
              <div className="flex items-center gap-1.5 p-1.5 bg-[#0F172A] rounded-xl border border-white/[0.08] overflow-x-auto no-scrollbar max-w-full">
                {(data?.grades || []).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveHonorGrade(g.id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      activeHonorGrade === g.id
                        ? 'btn-gold-royal'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {g.name_ar}
                  </button>
                ))}
              </div>
            </div>

            {!activeHonor || activeHonor.topStudents.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="لم تُسجل نتائج في لوحة شرف هذا الصف بعد"
                description="يتصدر الأوائل هنا فور إتمام الطلاب للامتحانات الرسمية الخاصة بهذا الصف."
              />
            ) : (
              <div className="space-y-6">
                {/* Top 3 Royal Spotlight Podium */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {activeHonor.topStudents.slice(0, 3).map((st) => (
                    <div
                      key={st.studentId}
                      className={`rounded-2xl p-5 flex flex-col justify-between ${
                        st.rank === 1
                          ? 'surface-card-gold border-[#D4AF37]/50 md:order-2'
                          : st.rank === 2
                            ? 'surface-card md:order-1'
                            : 'surface-card md:order-3'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border font-mono-nums font-bold text-xs ${getRankBadgeStyle(
                            st.rank
                          )}`}
                        >
                          {st.rank === 1 && <Crown className="w-3.5 h-3.5" />}
                          المركز #{st.rank}
                        </span>
                        <span className="font-mono-nums text-xl font-bold text-[#EED07A]">
                          {st.percentage}%
                        </span>
                      </div>
                      <div>
                        <div className="font-display text-lg font-bold text-[#F8FAFC] truncate">
                          {st.fullName}
                        </div>
                        <div className="text-xs text-[#94A3B8] mt-1 font-mono-nums">
                          {st.completedExams} امتحانات · {st.cumulativeEarned} / {st.cumulativePossible}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Phone & Small Tablet Full List */}
                <div className="md:hidden space-y-3">
                  {activeHonor.topStudents.slice(3).map((st) => (
                    <div
                      key={st.studentId}
                      className="rounded-2xl surface-card p-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center font-mono-nums font-bold text-sm shrink-0 ${getRankBadgeStyle(
                            st.rank
                          )}`}
                        >
                          #{st.rank}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[#F8FAFC] truncate">{st.fullName}</div>
                          <div className="text-xs text-[#94A3B8] mt-0.5 font-mono-nums">
                            {st.completedExams} امتحانات · {st.cumulativeEarned} / {st.cumulativePossible}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono-nums font-bold text-base text-[#EED07A] shrink-0">
                        {st.percentage}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tablet & Desktop Full Ranked Table */}
                <div className="hidden md:block overflow-x-auto rounded-2xl surface-card-gold">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-[#0A101E] text-[#D4AF37] border-b border-white/[0.08]">
                      <tr>
                        <th className="py-3.5 px-5 font-bold">الترتيب</th>
                        <th className="py-3.5 px-5 font-bold">الاسم الرباعي</th>
                        <th className="py-3.5 px-5 font-bold">الامتحانات</th>
                        <th className="py-3.5 px-5 font-bold">المجموع التراكمي</th>
                        <th className="py-3.5 px-5 font-bold">النسبة المئوية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {activeHonor.topStudents.map((st) => (
                        <tr key={st.studentId} className="hover:bg-white/[0.025] transition-colors">
                          <td className="py-3 px-5">
                            <span
                              className={`inline-flex items-center justify-center min-w-[36px] h-8 px-2.5 rounded-lg border font-mono-nums font-bold text-xs ${getRankBadgeStyle(
                                st.rank
                              )}`}
                            >
                              #{st.rank}
                            </span>
                          </td>
                          <td className="py-3 px-5 font-semibold text-[#F8FAFC]">{st.fullName}</td>
                          <td className="py-3 px-5 font-mono-nums text-[#94A3B8]">
                            {st.completedExams}
                          </td>
                          <td className="py-3 px-5 font-mono-nums text-[#F8FAFC]">
                            {st.cumulativeEarned} / {st.cumulativePossible}
                          </td>
                          <td className="py-3 px-5 font-mono-nums font-bold text-[#EED07A]">
                            {st.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        <OrnamentDivider />

        {/* 8. Platform Architectural Pillars Matrix */}
        <section className="py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-[#D4AF37] mb-1.5">المعايير التقنية</div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                  مميزات المنصة
                </h2>
              </div>
              <p className="text-sm text-[#94A3B8]">
                بنية تقنية متكاملة لضمان الانضباط والعدالة والوضوح على كل شاشة.
              </p>
            </div>

            <div className="rounded-2xl surface-card-gold overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border border-white/[0.08]">
              {[
                {
                  icon: Shield,
                  title: 'امتحانات مؤمّنة بالتوقيت الخادمي',
                  desc: 'حفظ تلقائي لكل إجابة، تسليم تلقائي عند انتهاء الوقت، ومنع كشف الإجابات الصحيحة قبل التسليم.',
                },
                {
                  icon: BarChart3,
                  title: 'مجموع تراكمي مفتوح بلا سقف',
                  desc: 'كل امتحان يحتفظ بدرجته الحقيقية دون تقليص أو تصفير للامتحانات غير المؤداة.',
                },
                {
                  icon: Award,
                  title: 'شارات وشهادات PDF عربية',
                  desc: 'منح تلقائي للشارات وإصدار شهادات تفوق وتقدير عربية برقم تسلسلي فريد للتحقق الفوري.',
                },
                {
                  icon: PlayCircle,
                  title: 'مكتبة دروس مرئية منظمة',
                  desc: 'تشغيل مباشر سريع أو عبر روابط يوتيوب وجوجل درايف مع جدولة نشر تلقائية لكل صف.',
                },
                {
                  icon: Trophy,
                  title: 'لوحات شرف عادلة لكل صف',
                  desc: 'ترتيب دقيق لكل امتحان وترتيب تراكمي منفصل تمامًا بين الصفوف الأربعة.',
                },
                {
                  icon: CheckCircle2,
                  title: 'دخول من أكثر من جهاز بأمان',
                  desc: 'احتفاظ بالجلسة عبر الهاتف والتابلت والكمبيوتر مع حماية كاملة وعزل تام للبيانات.',
                },
              ].map((feat, i) => (
                <div
                  key={feat.title}
                  className="p-6 sm:p-7 border-b border-white/[0.06] md:border-l md:border-white/[0.06] hover:bg-white/[0.02] transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono-nums text-xs text-[#D4AF37] font-bold">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <feat.icon className="w-5 h-5 text-[#D4AF37]/85" />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#F8FAFC] mb-2">{feat.title}</h3>
                    <p className="text-sm text-[#94A3B8] leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 9. Quiet Royal Footer */}
      <footer className="border-t border-[#D4AF37]/18 bg-[#05070C] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-[#94A3B8] text-center sm:text-right">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <BrandLogo variant="icon" size="sm" />
            <div className="space-y-0.5">
              <div className="text-[#F8FAFC] font-semibold">
                جميع الحقوق محفوظة محمد نصر © {new Date().getFullYear()}
              </div>
              <div className="text-xs text-[#94A3B8]">
                منصة الأستاذ أحمد الرمادي | ملك اللغة العربية
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setVerifyOpen(true);
                setVerifyError('');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A101E] hover:bg-[#0F172A] border border-white/15 text-[#F8FAFC] font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <BadgeCheck className="w-4 h-4 text-[#D4AF37]" />
              التحقق من شهادة
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/admin-gate')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-royal-outline text-[#EED07A] font-semibold whitespace-nowrap shrink-0"
            >
              <Shield className="w-4 h-4 text-[#D4AF37]" />
              غرفة الإدارة
            </button>
          </div>
        </div>
      </footer>

      {/* Public Certificate Verification Modal */}
      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="التحقق من صحة الشهادة الرسمية"
      >
        <form onSubmit={handleVerifyCertificate} className="space-y-4">
          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            أدخل الرقم التسلسلي المطبوع أعلى أو أسفل الشهادة (مثل <span className="font-mono-nums text-[#D4AF37]">ARM-2026-...</span>) للتأكد من اعتمادها من منصة الأستاذ أحمد الرمادي.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              dir="ltr"
              value={verifySerial}
              onChange={(e) => setVerifySerial(e.target.value)}
              placeholder="ARM-2026-XXXXXXXX"
              className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-white/15 text-sm font-mono-nums text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#D4AF37]"
            />
            <button
              type="submit"
              disabled={verifyLoading}
              className="px-4 py-2.5 rounded-xl btn-gold-royal text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              {verifyLoading ? 'جاري التحقق...' : 'تحقق'}
            </button>
          </div>

          {verifyError && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs sm:text-sm">
              {verifyError}
            </div>
          )}

          {verifyResult && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <BadgeCheck className="w-4 h-4 shrink-0" />
                شهادة معتمدة وصحيحة
              </div>
              <div className="text-[#F8FAFC]">
                <span className="text-[#94A3B8]">اسم الطالب: </span>
                <strong>{verifyResult.studentName}</strong>
              </div>
              <div className="text-[#F8FAFC]">
                <span className="text-[#94A3B8]">الصف الدراسي: </span>
                <span>{verifyResult.gradeName}</span>
              </div>
              <div className="text-[#F8FAFC]">
                <span className="text-[#94A3B8]">نوع الشهادة: </span>
                <span className="text-[#D4AF37] font-semibold">{verifyResult.titleAr}</span>
              </div>
              <div className="text-[#94A3B8]">{verifyResult.reasonAr}</div>
              <div className="pt-1 flex items-center justify-between text-[11px] text-[#94A3B8] border-t border-white/10">
                <span className="font-mono-nums text-[#D4AF37]">{verifyResult.serialNumber}</span>
                <span>تاريخ الإصدار: {formatArabicDate(verifyResult.issuedAt)}</span>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Grade Isolation & Account Switch Modal */}
      <Modal
        open={Boolean(switchModalGrade && currentStudent)}
        onClose={() => setSwitchModalGrade(null)}
        title={switchModalGrade ? `الدخول إلى ${switchModalGrade.name_ar}` : 'تبديل الصف الدراسي'}
      >
        {switchModalGrade && currentStudent && (
          <div className="space-y-4">
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              أنت مسجل الدخول حاليًا بحساب الطالب{' '}
              <strong className="text-[#F8FAFC]">{currentStudent.fullName}</strong> في{' '}
              <strong className="text-[#D4AF37]">{currentStudent.gradeName}</strong>.
              <br />
              ولمنع اختلاط بيانات الصفوف، للدخول إلى{' '}
              <strong className="text-[#F8FAFC]">{switchModalGrade.name_ar}</strong> يجب تسجيل الدخول
              بحساب تابع لهذا الصف أو إنشاء حساب جديد فيه (سيتم تسجيل الخروج من الحساب الحالي تلقائيًا).
            </p>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={switchingAccount}
                onClick={() => void handleConfirmSwitch(`/login?grade=${switchModalGrade.id}`)}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl btn-gold-royal font-bold text-sm"
              >
                تسجيل الدخول بحساب في {switchModalGrade.name_ar}
              </button>
              <button
                type="button"
                disabled={switchingAccount}
                onClick={() => void handleConfirmSwitch(`/register?grade=${switchModalGrade.id}`)}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl btn-royal-outline font-bold text-sm"
              >
                إنشاء حساب طالب جديد في {switchModalGrade.name_ar}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSwitchModalGrade(null);
                  onNavigate('/student');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                العودة إلى لوحة صفك المسجل ({currentStudent.gradeName})
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
