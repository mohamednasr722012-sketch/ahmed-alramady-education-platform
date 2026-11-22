import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileBadge,
  Home,
  LogOut,
  Menu,
  PlayCircle,
  Printer,
  Settings,
  Trophy,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { downloadPdfFile, fetchPdfBlobUrl } from '../../lib/downloadPdf';
import { formatArabicDate, formatArabicDateTime, formatDurationMs } from '../../lib/formatters';
import { BrandLogo } from '../../components/BrandLogo';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { AccuracyPieChart, StudentTimelineChart } from '../../components/AnalyticsCharts';
import { ExamRunnerPage } from './ExamRunnerPage';
import { VideoWatchPage } from './VideoWatchPage';
import type {
  BadgeItem,
  CertificateItem,
  CumulativeRankEntry,
  CumulativeStats,
  ExamRankEntry,
  ExamResultItem,
  ExamSummary,
  NotificationItem,
  StudentAnalyticsData,
  StudentSessionUser,
  VideoItem,
} from '../../types/domain';

export type StudentSection =
  | 'overview'
  | 'exams'
  | 'results'
  | 'videos'
  | 'leaderboard'
  | 'badges'
  | 'certificates'
  | 'analytics'
  | 'notifications'
  | 'settings';

interface StudentDashboardProps {
  student: StudentSessionUser;
  initialPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  student,
  initialPath,
  onNavigate,
  onLogout,
}) => {
  const [section, setSection] = useState<StudentSection>('overview');
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync URL sub-path
  useEffect(() => {
    const clean = initialPath.replace(/^\/student\/?/, '');
    if (clean.startsWith('videos/')) {
      setSection('videos');
      setActiveVideoId(clean.split('/')[1] || null);
      setActiveExamId(null);
      return;
    }
    if (clean.startsWith('exams/run/')) {
      setSection('exams');
      setActiveExamId(clean.split('/')[2] || null);
      setActiveVideoId(null);
      return;
    }
    const valid: StudentSection[] = [
      'overview',
      'exams',
      'results',
      'videos',
      'leaderboard',
      'badges',
      'certificates',
      'analytics',
      'notifications',
      'settings',
    ];
    if (valid.includes(clean as StudentSection)) {
      setSection(clean as StudentSection);
    } else {
      setSection('overview');
    }
    setActiveExamId(null);
    setActiveVideoId(null);
  }, [initialPath]);

  const switchSection = (next: StudentSection) => {
    setSection(next);
    setActiveExamId(null);
    setActiveVideoId(null);
    setMobileMenuOpen(false);
    onNavigate(next === 'overview' ? '/student' : `/student/${next}`);
  };

  // Section States
  const [overviewData, setOverviewData] = useState<{
    stats: CumulativeStats;
    latestResults: ExamResultItem[];
    availableExams: ExamSummary[];
    latestVideos: VideoItem[];
    badgesCount: number;
    totalActiveBadges: number;
    certificatesCount: number;
    unreadNotificationsCount: number;
    notifications: NotificationItem[];
  } | null>(null);
  const [examsList, setExamsList] = useState<ExamSummary[]>([]);
  const [resultsData, setResultsData] = useState<{ stats: CumulativeStats; results: ExamResultItem[] } | null>(null);
  const [videosList, setVideosList] = useState<VideoItem[]>([]);
  const [leaderboardData, setLeaderboardData] = useState<{
    cumulativeBoard: CumulativeRankEntry[];
    exams: Array<{ id: string; title: string }>;
    examBoard: ExamRankEntry[];
  } | null>(null);
  const [selectedLeaderboardExam, setSelectedLeaderboardExam] = useState('');
  const [badgesList, setBadgesList] = useState<BadgeItem[]>([]);
  const [certificatesList, setCertificatesList] = useState<CertificateItem[]>([]);
  const [analyticsData, setAnalyticsData] = useState<StudentAnalyticsData | null>(null);
  const [notificationsList, setNotificationsList] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{
    title: string;
    blobUrl: string;
    downloadUrl: string;
    filename: string;
  } | null>(null);

  // Account Settings Password Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const closePreviewPdf = useCallback(() => {
    setPreviewPdf((cur) => {
      if (cur?.blobUrl) URL.revokeObjectURL(cur.blobUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewPdf?.blobUrl) URL.revokeObjectURL(previewPdf.blobUrl);
    };
  }, [previewPdf]);

  const loadSectionData = useCallback(async () => {
    if (activeExamId || activeVideoId) return;
    setLoading(true);
    setLoadError('');
    try {
      if (section === 'overview') {
        const res = await apiRequest<typeof overviewData>('/api/student/dashboard');
        setOverviewData(res);
      } else if (section === 'exams') {
        const res = await apiRequest<{ exams: ExamSummary[] }>('/api/student/exams');
        setExamsList(res.exams);
      } else if (section === 'results') {
        const res = await apiRequest<{ stats: CumulativeStats; results: ExamResultItem[] }>(
          '/api/student/results'
        );
        setResultsData(res);
      } else if (section === 'videos') {
        const res = await apiRequest<{ videos: VideoItem[] }>('/api/student/videos');
        setVideosList(res.videos);
      } else if (section === 'leaderboard') {
        const q = selectedLeaderboardExam ? `?examId=${encodeURIComponent(selectedLeaderboardExam)}` : '';
        const res = await apiRequest<NonNullable<typeof leaderboardData>>(
          `/api/student/leaderboard${q}`
        );
        setLeaderboardData(res);
      } else if (section === 'badges') {
        const res = await apiRequest<{ badges: BadgeItem[] }>('/api/student/badges');
        setBadgesList(res.badges);
      } else if (section === 'certificates') {
        const res = await apiRequest<{ certificates: CertificateItem[] }>('/api/student/certificates');
        setCertificatesList(res.certificates);
      } else if (section === 'analytics') {
        const res = await apiRequest<{ analytics: StudentAnalyticsData }>('/api/student/analytics');
        setAnalyticsData(res.analytics);
      } else if (section === 'notifications') {
        const res = await apiRequest<{ notifications: NotificationItem[] }>(
          '/api/student/notifications'
        );
        setNotificationsList(res.notifications);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات القسم الحالي.');
    } finally {
      setLoading(false);
    }
  }, [section, activeExamId, activeVideoId, selectedLeaderboardExam, onLogout]);

  useEffect(() => {
    void loadSectionData();
  }, [loadSectionData]);

  const handleDownloadCert = async (cert: CertificateItem) => {
    setPdfError('');
    setPdfBusyId(cert.id);
    try {
      await downloadPdfFile(
        `/api/student/certificates/${cert.id}/pdf`,
        `certificate-${cert.serial_number}.pdf`
      );
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'تعذر تحميل الشهادة.');
    } finally {
      setPdfBusyId(null);
    }
  };

  const handlePreviewCert = async (cert: CertificateItem) => {
    setPdfError('');
    setPdfBusyId(cert.id);
    try {
      const downloadUrl = `/api/student/certificates/${cert.id}/pdf`;
      const blobUrl = await fetchPdfBlobUrl(downloadUrl);
      setPreviewPdf({
        title: cert.title_ar,
        blobUrl,
        downloadUrl,
        filename: `certificate-${cert.serial_number}.pdf`,
      });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'تعذر معاينة الشهادة.');
    } finally {
      setPdfBusyId(null);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await apiRequest(`/api/student/notifications/${id}/read`, { method: 'POST' });
      setNotificationsList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setOverviewData((prev) =>
        prev
          ? {
              ...prev,
              unreadNotificationsCount: Math.max(0, prev.unreadNotificationsCount - 1),
            }
          : prev
      );
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة الإشعار.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPassword.length < 6) {
      setPwdMsg({ type: 'err', text: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'err', text: 'كلمتا المرور غير متطابقتين.' });
      return;
    }
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg({ type: 'ok', text: 'تم تحديث كلمة المرور بنجاح.' });
    } catch (err) {
      setPwdMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'تعذر تحديث كلمة المرور.',
      });
    }
  };

  const navItems: Array<{ id: StudentSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'الرئيسية', icon: Home },
    { id: 'exams', label: 'الامتحانات', icon: ClipboardList },
    { id: 'results', label: 'النتائج', icon: CheckCircle2 },
    { id: 'videos', label: 'الفيديوهات', icon: PlayCircle },
    { id: 'leaderboard', label: 'لوحة الشرف', icon: Trophy },
    { id: 'badges', label: 'إنجازاتي', icon: Award },
    { id: 'certificates', label: 'شهاداتي', icon: FileBadge },
    { id: 'analytics', label: 'تحليل مستواي', icon: BarChart3 },
    { id: 'notifications', label: 'الإشعارات', icon: Bell },
    { id: 'settings', label: 'إعدادات الحساب', icon: Settings },
  ];

  // Group videos by Unit -> Lesson
  const groupedVideos = videosList.reduce<Record<string, Record<string, VideoItem[]>>>((acc, v) => {
    if (!acc[v.unit_title]) acc[v.unit_title] = {};
    if (!acc[v.unit_title][v.lesson_title]) acc[v.unit_title][v.lesson_title] = [];
    acc[v.unit_title][v.lesson_title].push(v);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#05070C] text-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Mobile & Tablet Header */}
      <header className="lg:hidden sticky top-0 z-40 bg-[#0A101E]/95 backdrop-blur-md border-b border-[#D4AF37]/20 px-4 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="text-right min-w-0"
        >
          <BrandLogo variant="horizontal" size="sm" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          aria-label="فتح قائمة الطالب"
          className="w-11 h-11 rounded-xl bg-[#0F172A] border border-white/10 flex items-center justify-center text-[#D4AF37] hover:border-[#D4AF37]/40 transition-colors"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/75 backdrop-blur-xs"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen
            ? 'fixed inset-y-0 right-0 z-50 flex w-72 max-w-[82vw] shadow-2xl'
            : 'hidden'
        } lg:flex lg:w-68 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-[#0A101E] border-l border-[#D4AF37]/18 flex-col justify-between p-4`}
      >
        <div className="space-y-5 overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('/');
              }}
              className="text-right"
            >
              <BrandLogo variant="horizontal" size="sm" />
            </button>
            {mobileMenuOpen && (
              <button
                type="button"
                aria-label="إغلاق القائمة"
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="rounded-xl bg-[#0F172A] border border-[#D4AF37]/25 p-3.5 shadow-inner">
            <div className="text-sm font-bold text-[#F8FAFC] truncate">{student.fullName}</div>
            <div className="text-xs text-[#EED07A] mt-0.5">{student.gradeName}</div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
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

        <button
          type="button"
          onClick={onLogout}
          className="mt-4 w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-500/20 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>تسجيل الخروج</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-6xl w-full mx-auto">
        {activeExamId ? (
          <ExamRunnerPage
            examId={activeExamId}
            onExitToExams={() => {
              setActiveExamId(null);
              switchSection('exams');
            }}
            onOpenCertificates={() => {
              setActiveExamId(null);
              switchSection('certificates');
            }}
          />
        ) : activeVideoId ? (
          <VideoWatchPage
            videoId={activeVideoId}
            onBack={() => {
              setActiveVideoId(null);
              switchSection('videos');
            }}
            onOpenVideo={(vid) => {
              setActiveVideoId(vid);
              onNavigate(`/student/videos/${vid}`);
            }}
          />
        ) : loading ? (
          <LoadingSkeleton rows={4} />
        ) : loadError ? (
          <div className="p-5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex flex-wrap items-center justify-between gap-3">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadSectionData()}
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
            {/* 1. الرئيسية */}
            {section === 'overview' && overviewData && (
              <div className="space-y-7 sm:space-y-8">
                <div className="relative overflow-hidden rounded-3xl surface-card-gold p-6 sm:p-8">
                  <div className="bg-arabesque-lattice absolute inset-0 pointer-events-none opacity-45" />
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/75 to-transparent" />
                  <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-[#D4AF37] mb-1">بوابة الطالب الشخصية</div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                        مرحبًا بك، {student.fullName}
                      </h1>
                      <p className="text-sm text-[#94A3B8] mt-1.5">
                        {student.gradeName} · هاتف: <span className="font-mono-nums text-[#EED07A]">{student.phoneNumber}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchSection('exams')}
                      className="px-5 py-2.5 rounded-xl btn-gold-royal text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 self-start sm:self-center"
                    >
                      استعراض الامتحانات
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
                  <div className="rounded-2xl surface-card p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">الامتحانات المكتملة</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1.5">
                      {overviewData.stats.completedExams}
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card-gold p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">المجموع التراكمي</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#EED07A] mt-1.5">
                      {overviewData.stats.cumulativeEarned}
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">الدرجات الممكنة</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1.5">
                      {overviewData.stats.cumulativePossible}
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card p-4 sm:p-5">
                    <div className="text-xs text-[#94A3B8]">النسبة التراكمية</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#EED07A] mt-1.5">
                      {overviewData.stats.percentage}%
                    </div>
                  </div>
                  <div className="rounded-2xl surface-card p-4 sm:p-5 col-span-2 sm:col-span-2 xl:col-span-1">
                    <div className="text-xs text-[#94A3B8]">الترتيب في الصف</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1.5">
                      {overviewData.stats.rankInGrade ? `#${overviewData.stats.rankInGrade}` : '—'}
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Available Exams */}
                  <div className="rounded-2xl surface-card p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-display text-lg font-bold text-[#F8FAFC]">الامتحانات المتاحة</h2>
                      <button
                        type="button"
                        onClick={() => switchSection('exams')}
                        className="text-xs text-[#EED07A] font-bold hover:underline"
                      >
                        عرض الكل
                      </button>
                    </div>
                    {overviewData.availableExams.length === 0 ? (
                      <p className="text-sm text-[#94A3B8]">لا توجد امتحانات منشورة لصفك حاليًا.</p>
                    ) : (
                      <div className="space-y-3">
                        {overviewData.availableExams.slice(0, 4).map((ex) => (
                          <div
                            key={ex.id}
                            className="p-3.5 rounded-xl bg-[#0A101E] border border-white/[0.08] hover:border-[#D4AF37]/30 transition-colors flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-[#F8FAFC] truncate">{ex.title}</div>
                              <div className="text-xs text-[#94A3B8] mt-0.5 font-mono-nums">
                                {ex.question_count} أسئلة · {ex.duration_minutes} د · {ex.total_points} درجة
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveExamId(ex.id)}
                              className="px-4 py-1.5 rounded-lg btn-gold-royal text-xs font-bold shrink-0"
                            >
                              ابدأ
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Latest Results */}
                  <div className="rounded-2xl surface-card p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-display text-lg font-bold text-[#F8FAFC]">آخر النتائج</h2>
                      <button
                        type="button"
                        onClick={() => switchSection('results')}
                        className="text-xs text-[#EED07A] font-bold hover:underline"
                      >
                        كل النتائج
                      </button>
                    </div>
                    {overviewData.latestResults.length === 0 ? (
                      <p className="text-sm text-[#94A3B8]">لم تؤدِّ أي امتحان بعد.</p>
                    ) : (
                      <div className="space-y-3">
                        {overviewData.latestResults.map((res) => (
                          <div
                            key={res.id}
                            className="p-3.5 rounded-xl bg-[#0A101E] border border-white/[0.08] flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-[#F8FAFC] truncate">
                                {res.examTitle}
                              </div>
                              <div className="text-xs text-[#94A3B8] mt-0.5">
                                {formatArabicDate(res.submitted_at)}
                              </div>
                            </div>
                            <div className="text-left font-mono-nums shrink-0">
                              <div className="text-sm font-bold text-[#EED07A]">
                                {res.earned_score} / {res.max_score}
                              </div>
                              <div className="text-xs text-[#94A3B8]">{res.percentage}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => switchSection('badges')}
                    className="rounded-2xl surface-card hover:border-[#D4AF37]/40 p-5 text-right transition-colors"
                  >
                    <Award className="w-6 h-6 text-[#D4AF37] mb-2" />
                    <div className="text-sm font-bold text-[#F8FAFC]">الشارات والإنجازات</div>
                    <div className="text-xs text-[#94A3B8] mt-1 font-mono-nums">
                      {overviewData.badgesCount} / {overviewData.totalActiveBadges} شارة مكتسبة
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchSection('certificates')}
                    className="rounded-2xl surface-card hover:border-[#D4AF37]/40 p-5 text-right transition-colors"
                  >
                    <FileBadge className="w-6 h-6 text-[#D4AF37] mb-2" />
                    <div className="text-sm font-bold text-[#F8FAFC]">الشهادات PDF</div>
                    <div className="text-xs text-[#94A3B8] mt-1 font-mono-nums">
                      {overviewData.certificatesCount} شهادة صادرة
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchSection('notifications')}
                    className="rounded-xl bg-[#11192C] border border-white/10 hover:border-[#D4AF37]/40 p-5 text-right transition-colors"
                  >
                    <Bell className="w-6 h-6 text-[#D4AF37] mb-2" />
                    <div className="text-sm font-bold text-[#F8FAFC]">الإشعارات</div>
                    <div className="text-xs text-[#94A3B8] mt-1 font-mono-nums">
                      {overviewData.unreadNotificationsCount} إشعار غير مقروء
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* 2. الامتحانات */}
            {section === 'exams' && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">
                    امتحانات {student.gradeName}
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    يُحفظ وقت الامتحان وإجاباتك تلقائيًا على الخادم، وتستأنف المحاولة بالوقت المتبقي عند تحديث الصفحة.
                  </p>
                </div>
                {examsList.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="لا توجد امتحانات متاحة حاليًا"
                    description="عند قيام الأستاذ بنشر امتحان جديد لصفك الدراسي سيظهر هنا فورًا."
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {examsList.map((ex) => (
                      <div
                        key={ex.id}
                        className="rounded-2xl bg-[#11192C] border border-[#D4AF37]/20 p-6 flex flex-col justify-between"
                      >
                        <div>
                          <div className="text-xs text-[#D4AF37] mb-1.5">
                            {ex.unit_title || 'عام'} {ex.lesson_title ? `· ${ex.lesson_title}` : ''}
                          </div>
                          <h2 className="text-lg font-bold text-[#F8FAFC]">{ex.title}</h2>
                          <p className="text-sm text-[#94A3B8] mt-2">{ex.description}</p>
                          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#94A3B8] font-mono-nums">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                              {ex.duration_minutes} دقيقة
                            </span>
                            <span>{ex.question_count} سؤال</span>
                            <span>{ex.total_points} درجة</span>
                            <span>
                              المحاولات: {ex.attemptsUsed || 0} / {ex.max_attempts ?? 'غير محدود'}
                            </span>
                          </div>
                          {ex.bestResult && (
                            <div className="mt-3 text-xs text-emerald-300 font-mono-nums">
                              أفضل نتيجة: {ex.bestResult.earned_score} / {ex.bestResult.max_score} (
                              {ex.bestResult.percentage}%)
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!ex.canStart}
                          onClick={() => setActiveExamId(ex.id)}
                          className="mt-5 w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C667] disabled:bg-white/10 disabled:text-[#94A3B8] text-[#07090E] text-sm font-bold transition-colors"
                        >
                          {ex.hasActiveAttempt
                            ? 'استكمال المحاولة الجارية'
                            : ex.canStart
                              ? 'بدء الامتحان الآن'
                              : 'تم استنفاد المحاولات'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. النتائج والمجموع التراكمي */}
            {section === 'results' && resultsData && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">النتائج والمجموع التراكمي</h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    المجموع التراكمي مفتوح دون حد أقصى 100 ويُحسب من الامتحانات التي أكملتها فعليًا فقط.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-[#11192C] border border-[#D4AF37]/25 p-4">
                    <div className="text-xs text-[#94A3B8]">المجموع المكتسب</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#D4AF37] mt-1">
                      {resultsData.stats.cumulativeEarned}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                    <div className="text-xs text-[#94A3B8]">مجموع الدرجات الممكنة</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                      {resultsData.stats.cumulativePossible}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                    <div className="text-xs text-[#94A3B8]">الامتحانات المكتملة</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                      {resultsData.stats.completedExams}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                    <div className="text-xs text-[#94A3B8]">النسبة المئوية</div>
                    <div className="font-mono-nums text-2xl font-bold text-[#E6C667] mt-1">
                      {resultsData.stats.percentage}%
                    </div>
                  </div>
                </div>

                {resultsData.results.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="لا توجد نتائج مسجلة بعد"
                    description="عند إنهائك لأي امتحان ستظهر درجاتك التفصيلية هنا."
                    actionLabel="استعراض الامتحانات"
                    onAction={() => switchSection('exams')}
                  />
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {resultsData.results.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-xl border border-white/10 bg-[#11192C] p-4 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-bold text-sm text-[#F8FAFC]">{r.examTitle}</div>
                            <span className="font-mono-nums text-xs font-bold px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] shrink-0">
                              {r.percentage}%
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-white/10 font-mono-nums">
                            <div>
                              <span className="block text-[10px] text-[#94A3B8]">الدرجة</span>
                              <span className="text-[#D4AF37] font-bold">
                                {r.earned_score} / {r.max_score}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-[#94A3B8]">صحيح / خطأ</span>
                              <span>
                                <span className="text-emerald-400">{r.correct_count}</span> /{' '}
                                <span className="text-red-400">{r.wrong_count}</span>
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-[#94A3B8]">الزمن</span>
                              <span className="text-[#E2E8F0]">{formatDurationMs(r.duration_ms)}</span>
                            </div>
                          </div>
                          <div className="text-[11px] text-[#94A3B8]">
                            {formatArabicDateTime(r.submitted_at)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                          <tr>
                            <th className="py-3.5 px-4">الامتحان</th>
                            <th className="py-3.5 px-4">الدرجة</th>
                            <th className="py-3.5 px-4">النسبة</th>
                            <th className="py-3.5 px-4">صحيح / خطأ</th>
                            <th className="py-3.5 px-4">مدة الحل</th>
                            <th className="py-3.5 px-4">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {resultsData.results.map((r) => (
                            <tr key={r.id}>
                              <td className="py-3.5 px-4 font-bold text-[#F8FAFC]">{r.examTitle}</td>
                              <td className="py-3.5 px-4 font-mono-nums text-[#D4AF37] font-bold">
                                {r.earned_score} / {r.max_score}
                              </td>
                              <td className="py-3.5 px-4 font-mono-nums">{r.percentage}%</td>
                              <td className="py-3.5 px-4 font-mono-nums text-[#94A3B8]">
                                <span className="text-emerald-400">{r.correct_count}</span> /{' '}
                                <span className="text-red-400">{r.wrong_count}</span>
                              </td>
                              <td className="py-3.5 px-4 font-mono-nums text-[#94A3B8]">
                                {formatDurationMs(r.duration_ms)}
                              </td>
                              <td className="py-3.5 px-4 text-xs text-[#94A3B8]">
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

            {/* 4. الفيديوهات */}
            {section === 'videos' && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">
                    مكتبة دروس {student.gradeName}
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    فيديوهات مصنفة حسب الوحدة والدرس.
                  </p>
                </div>

                {videosList.length === 0 ? (
                  <EmptyState
                    icon={PlayCircle}
                    title="لا توجد فيديوهات منشورة لصفك بعد"
                    description="ستظهر هنا جميع شروحات الفيديو فور نشرها من قِبل الأستاذ."
                  />
                ) : (
                  <div className="space-y-8">
                    {Object.entries(groupedVideos).map(([unitTitle, lessons]) => (
                      <div key={unitTitle} className="space-y-4">
                        <h2 className="text-lg font-bold text-[#D4AF37] border-b border-[#D4AF37]/20 pb-2">
                          {unitTitle}
                        </h2>
                        {Object.entries(lessons).map(([lessonTitle, vids]) => (
                          <div key={lessonTitle} className="space-y-3">
                            <h3 className="text-sm font-semibold text-[#F8FAFC]">{lessonTitle}</h3>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {vids.map((vid) => (
                                <button
                                  key={vid.id}
                                  type="button"
                                  onClick={() => {
                                    setActiveVideoId(vid.id);
                                    onNavigate(`/student/videos/${vid.id}`);
                                  }}
                                  className="text-right rounded-xl bg-[#11192C] border border-white/10 hover:border-[#D4AF37]/50 overflow-hidden transition-colors flex flex-col"
                                >
                                  <div className="aspect-video bg-[#07090E] flex items-center justify-center">
                                    {vid.thumbnailUrl ? (
                                      <img
                                        src={vid.thumbnailUrl}
                                        alt={vid.title}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <PlayCircle className="w-10 h-10 text-[#D4AF37]" />
                                    )}
                                  </div>
                                  <div className="p-4">
                                    <div className="font-bold text-sm text-[#F8FAFC]">{vid.title}</div>
                                    <div className="text-xs text-[#94A3B8] mt-1 line-clamp-2">
                                      {vid.description}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5. لوحة الشرف */}
            {section === 'leaderboard' && leaderboardData && (
              <div className="space-y-8">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">
                    لوحة شرف {student.gradeName}
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    ترتيب مستقل لصفك فقط. يُرتب الترتيب التراكمي وفق النسبة المئوية أولًا لضمان العدالة عند اختلاف عدد الامتحانات، ثم مجموع الدرجات.
                  </p>
                </div>

                {/* Cumulative Table */}
                <div className="space-y-3">
                  <h2 className="text-base font-bold text-[#D4AF37]">الترتيب التراكمي العام</h2>
                  {leaderboardData.cumulativeBoard.length === 0 ? (
                    <EmptyState
                      icon={Trophy}
                      title="لا يوجد ترتيب بعد"
                      description="تظهر لوحة الشرف فور إتمام الطلاب للامتحانات."
                    />
                  ) : (
                    <>
                      <div className="md:hidden space-y-2.5">
                        {leaderboardData.cumulativeBoard.map((row) => (
                          <div
                            key={row.studentId}
                            className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${
                              row.studentId === student.id
                                ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50'
                                : 'bg-[#11192C] border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-8 h-8 rounded-lg bg-[#0B1221] border border-[#D4AF37]/30 flex items-center justify-center font-mono-nums text-xs font-bold text-[#D4AF37] shrink-0">
                                #{row.rank}
                              </span>
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-[#F8FAFC] truncate">
                                  {row.fullName}
                                </div>
                                <div className="text-[11px] text-[#94A3B8] font-mono-nums">
                                  {row.completedExams} امتحانات · {row.cumulativeEarned} /{' '}
                                  {row.cumulativePossible}
                                </div>
                              </div>
                            </div>
                            <div className="font-mono-nums text-sm font-bold text-[#E6C667] shrink-0">
                              {row.percentage}%
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="hidden md:block overflow-x-auto rounded-xl border border-[#D4AF37]/25 bg-[#11192C]">
                        <table className="w-full text-right text-sm">
                          <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                            <tr>
                              <th className="py-3 px-4">الترتيب</th>
                              <th className="py-3 px-4">الطالب</th>
                              <th className="py-3 px-4">عدد الامتحانات</th>
                              <th className="py-3 px-4">المجموع</th>
                              <th className="py-3 px-4">الممكن</th>
                              <th className="py-3 px-4">النسبة المئوية</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {leaderboardData.cumulativeBoard.map((row) => (
                              <tr
                                key={row.studentId}
                                className={row.studentId === student.id ? 'bg-[#D4AF37]/10' : ''}
                              >
                                <td className="py-3 px-4 font-mono-nums font-bold text-[#D4AF37]">
                                  #{row.rank}
                                </td>
                                <td className="py-3 px-4 font-semibold text-[#F8FAFC]">
                                  {row.fullName}
                                </td>
                                <td className="py-3 px-4 font-mono-nums text-[#94A3B8]">
                                  {row.completedExams}
                                </td>
                                <td className="py-3 px-4 font-mono-nums">{row.cumulativeEarned}</td>
                                <td className="py-3 px-4 font-mono-nums text-[#94A3B8]">
                                  {row.cumulativePossible}
                                </td>
                                <td className="py-3 px-4 font-mono-nums font-bold text-[#E6C667]">
                                  {row.percentage}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* Per-Exam Leaderboard */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-bold text-[#F8FAFC]">
                      ترتيب امتحان محدد (الدرجة الأعلى ← الزمن الأقل ← التسليم الأسبق)
                    </h2>
                    <select
                      value={selectedLeaderboardExam}
                      onChange={(e) => setSelectedLeaderboardExam(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 rounded-lg bg-[#11192C] border border-white/10 text-sm text-[#F8FAFC]"
                    >
                      <option value="">اختر امتحانًا لعرض أوائله</option>
                      {leaderboardData.exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedLeaderboardExam && (
                    leaderboardData.examBoard.length === 0 ? (
                      <p className="text-sm text-[#94A3B8]">لا توجد نتائج لهذا الامتحان بعد.</p>
                    ) : (
                      <>
                        <div className="md:hidden space-y-2.5">
                          {leaderboardData.examBoard.map((r) => (
                            <div
                              key={r.studentId}
                              className="rounded-xl border border-white/10 bg-[#11192C] p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-8 h-8 rounded-lg bg-[#0B1221] border border-[#D4AF37]/30 flex items-center justify-center font-mono-nums text-xs font-bold text-[#D4AF37] shrink-0">
                                  #{r.rank}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-sm text-[#F8FAFC] truncate">
                                    {r.fullName}
                                  </div>
                                  <div className="text-[11px] text-[#94A3B8] font-mono-nums">
                                    {r.earnedScore} / {r.maxScore} · {formatDurationMs(r.durationMs)}
                                  </div>
                                </div>
                              </div>
                              <div className="font-mono-nums text-sm font-bold text-[#E6C667] shrink-0">
                                {r.percentage}%
                              </div>
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
                                <th className="py-3 px-4">الزمن (ثانية)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {leaderboardData.examBoard.map((r) => (
                                <tr key={r.studentId}>
                                  <td className="py-3 px-4 font-mono-nums font-bold text-[#D4AF37]">
                                    #{r.rank}
                                  </td>
                                  <td className="py-3 px-4 font-semibold">{r.fullName}</td>
                                  <td className="py-3 px-4 font-mono-nums">
                                    {r.earnedScore} / {r.maxScore}
                                  </td>
                                  <td className="py-3 px-4 font-mono-nums">{r.percentage}%</td>
                                  <td className="py-3 px-4 font-mono-nums text-[#94A3B8]">
                                    {formatDurationMs(r.durationMs)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  )}
                </div>
              </div>
            )}

            {/* 6. إنجازاتي (الشارات) */}
            {section === 'badges' && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">شاراتي وإنجازاتي</h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    تُمنح الشارات تلقائيًا بناءً على أدائك الحقيقي في الامتحانات.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {badgesList.map((b) => {
                    const tierStyles =
                      b.tier === 'gold'
                        ? 'border-[#D4AF37]/60 text-[#D4AF37]'
                        : b.tier === 'silver'
                          ? 'border-slate-300/50 text-slate-200'
                          : 'border-amber-700/60 text-amber-400';
                    return (
                      <div
                        key={b.id}
                        className={`rounded-2xl p-6 border transition-all ${
                          b.earned
                            ? `bg-[#11192C] ${tierStyles}`
                            : 'bg-[#0B1221]/60 border-white/10 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <Award className="w-7 h-7" />
                          <span className="text-xs font-bold">
                            {b.earned ? 'مكتسبة' : 'غير مكتسبة بعد'}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#F8FAFC]">{b.title_ar}</h3>
                        <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">
                          {b.description_ar}
                        </p>
                        {b.earned && b.earnedAt && (
                          <div className="mt-3 text-[11px] text-[#D4AF37]">
                            تاريخ الإنجاز: {formatArabicDate(b.earnedAt)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 7. شهاداتي PDF */}
            {section === 'certificates' && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">شهاداتي الرسمية (PDF)</h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    شهادات PDF عربية حقيقية تحمل شعار المنصة وتوقيع الأستاذ ورقمًا تسلسليًا فريدًا.
                  </p>
                </div>

                {pdfError && (
                  <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
                    {pdfError}
                  </div>
                )}

                {certificatesList.length === 0 ? (
                  <EmptyState
                    icon={FileBadge}
                    title="لا توجد شهادات صادرة بعد"
                    description="تصدر الشهادات تلقائيًا عند إتمام الامتحانات أو تحقيق معايير التفوق، أو بقرار تقدير من الأستاذ."
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {certificatesList.map((cert) => {
                      const themeMap: Record<
                        string,
                        { label: string; cardClass: string; badgeClass: string }
                      > = {
                        top_of_grade: {
                          label: 'وسام المركز الأول',
                          cardClass:
                            'bg-gradient-to-br from-[#191224] via-[#11192C] to-[#0D1322] border-[#E5BF45]/60',
                          badgeClass: 'bg-rose-900/50 text-rose-200 border border-rose-500/40',
                        },
                        excellence: {
                          label: 'درع التفوق والتميّز',
                          cardClass:
                            'bg-gradient-to-br from-[#071D17] via-[#0B1F1B] to-[#0B1221] border-emerald-400/45',
                          badgeClass: 'bg-emerald-900/50 text-emerald-200 border border-emerald-400/35',
                        },
                        achievement: {
                          label: 'نوط الإنجاز',
                          cardClass:
                            'bg-gradient-to-br from-[#0E1B36] via-[#11192C] to-[#0B1221] border-slate-300/40',
                          badgeClass: 'bg-slate-700/50 text-slate-100 border border-slate-300/35',
                        },
                        appreciation: {
                          label: 'مخطوطة شكر وتقدير',
                          cardClass:
                            'bg-gradient-to-br from-[#241319] via-[#1B131C] to-[#111524] border-amber-400/45',
                          badgeClass: 'bg-amber-900/50 text-amber-200 border border-amber-400/40',
                        },
                        exam_completion: {
                          label: 'وثيقة اجتياز اختبار',
                          cardClass:
                            'bg-gradient-to-br from-[#0D1A2B] via-[#11192C] to-[#0B1221] border-sky-400/40',
                          badgeClass: 'bg-sky-900/45 text-sky-200 border border-sky-400/35',
                        },
                      };
                      const meta = themeMap[cert.cert_type] || themeMap.exam_completion;
                      return (
                        <div
                          key={cert.id}
                          className={`rounded-2xl border p-6 flex flex-col justify-between shadow-lg ${meta.cardClass}`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${meta.badgeClass}`}>
                                {meta.label}
                              </span>
                              <span className="text-xs font-mono-nums text-[#D4AF37]">
                                {cert.serial_number}
                              </span>
                            </div>
                            <h2 className="font-display text-xl font-bold text-[#F8FAFC]">
                              {cert.title_ar}
                            </h2>
                            <p className="text-sm text-[#CBD5E1] mt-2 leading-relaxed">
                              {cert.reason_ar}
                            </p>
                            <div className="text-xs text-[#94A3B8] mt-3">
                              صدرت بتاريخ: {formatArabicDate(cert.issued_at)}
                            </div>
                          </div>

                          <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={pdfBusyId === cert.id}
                              onClick={() => void handleDownloadCert(cert)}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#E6C667] disabled:opacity-60 text-[#07090E] text-xs font-bold"
                            >
                              <Download className="w-4 h-4" />
                              {pdfBusyId === cert.id ? 'جاري التحضير...' : 'تحميل PDF'}
                            </button>
                            <button
                              type="button"
                              disabled={pdfBusyId === cert.id}
                              onClick={() => void handlePreviewCert(cert)}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1221] border border-[#D4AF37]/30 disabled:opacity-60 text-[#F8FAFC] text-xs font-bold"
                            >
                              <Printer className="w-4 h-4 text-[#D4AF37]" />
                              معاينة وطباعة
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 8. تحليل مستواي */}
            {section === 'analytics' && analyticsData && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">تحليل مستواي الدراسي</h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    مؤشرات أداء حقيقية مستخرجة مباشرة من نتائج امتحاناتك الفعلية.
                  </p>
                </div>

                {analyticsData.totalCompletedAttempts === 0 ? (
                  <EmptyState
                    icon={BarChart3}
                    title="لا تتوفر بيانات تحليلية بعد"
                    description="أدِّ امتحانك الأول ليبدأ النظام في تحليل مستواك ورسم منحنى التقدم وتحديد نقاط القوة والمراجعة."
                    actionLabel="الذهاب إلى الامتحانات"
                    onAction={() => switchSection('exams')}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">متوسط الدرجات</div>
                        <div className="font-mono-nums text-2xl font-bold text-[#D4AF37] mt-1">
                          {analyticsData.averagePercentage}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">نسبة الإجابات الصحيحة</div>
                        <div className="font-mono-nums text-2xl font-bold text-emerald-400 mt-1">
                          {analyticsData.correctRate}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">نسبة الإجابات الخاطئة</div>
                        <div className="font-mono-nums text-2xl font-bold text-red-400 mt-1">
                          {analyticsData.wrongRate}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#11192C] border border-white/10 p-4">
                        <div className="text-xs text-[#94A3B8]">المحاولات المصححة</div>
                        <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                          {analyticsData.totalCompletedAttempts}
                        </div>
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-8 rounded-2xl bg-[#11192C] border border-white/10 p-6">
                        <h2 className="text-base font-bold text-[#F8FAFC] mb-4">
                          تطور الأداء عبر الزمن
                        </h2>
                        <StudentTimelineChart timeline={analyticsData.timeline} />
                      </div>
                      <div className="lg:col-span-4 rounded-2xl bg-[#11192C] border border-white/10 p-6">
                        <h2 className="text-base font-bold text-[#F8FAFC] mb-4">
                          توزيع الإجابات
                        </h2>
                        <AccuracyPieChart
                          totalCorrect={analyticsData.totalCorrect}
                          totalWrong={analyticsData.totalWrong}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="rounded-2xl bg-[#11192C] border border-white/10 p-6">
                        <h3 className="text-sm font-bold text-[#D4AF37] mb-3">أفضل امتحان وأضعف امتحان</h3>
                        {analyticsData.bestExam && (
                          <div className="p-3 rounded-xl bg-[#0B1221] mb-3">
                            <div className="text-xs text-[#94A3B8]">أفضل أداء</div>
                            <div className="text-sm font-bold text-emerald-300 mt-0.5">
                              {analyticsData.bestExam.title} ({analyticsData.bestExam.percentage}%)
                            </div>
                          </div>
                        )}
                        {analyticsData.worstExam && (
                          <div className="p-3 rounded-xl bg-[#0B1221]">
                            <div className="text-xs text-[#94A3B8]">أقل أداء</div>
                            <div className="text-sm font-bold text-amber-300 mt-0.5">
                              {analyticsData.worstExam.title} ({analyticsData.worstExam.percentage}%)
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-[#11192C] border border-white/10 p-6 space-y-4">
                        <div>
                          <h3 className="text-sm font-bold text-emerald-300 mb-2">نقاط القوة</h3>
                          {analyticsData.strengths.length === 0 ? (
                            <p className="text-xs text-[#94A3B8]">لا توجد دروس مصنفة كنقاط قوة بعد.</p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {analyticsData.strengths.map((s, i) => (
                                <li key={i} className="flex justify-between">
                                  <span>{s.lesson}</span>
                                  <span className="font-mono-nums text-emerald-400">{s.avgPercentage}%</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="pt-3 border-t border-white/10">
                          <h3 className="text-sm font-bold text-amber-300 mb-2">
                            دروس تحتاج إلى مراجعة
                          </h3>
                          {analyticsData.needsReview.length === 0 ? (
                            <p className="text-xs text-[#94A3B8]">أداؤك متميز في جميع الدروس المختبرة.</p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {analyticsData.needsReview.map((s, i) => (
                                <li key={i} className="flex justify-between">
                                  <span>{s.lesson}</span>
                                  <span className="font-mono-nums text-amber-400">{s.avgPercentage}%</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 9. الإشعارات */}
            {section === 'notifications' && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">الإشعارات</h1>
                {notificationsList.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title="لا توجد إشعارات حاليًا"
                    description="ستصلك هنا تنبيهات الامتحانات والفيديوهات الجديدة والنتائج والشارات والشهادات."
                  />
                ) : (
                  <div className="space-y-3">
                    {notificationsList.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-xl p-4 border flex items-start justify-between gap-4 ${
                          n.is_read
                            ? 'bg-[#0B1221] border-white/10 opacity-75'
                            : 'bg-[#11192C] border-[#D4AF37]/40'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-[#F8FAFC]">{n.title_ar}</div>
                          <p className="text-sm text-[#94A3B8] mt-1">{n.body_ar}</p>
                          <div className="text-xs text-[#94A3B8] mt-2">
                            {formatArabicDateTime(n.created_at)}
                          </div>
                        </div>
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => void handleMarkNotificationRead(n.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] text-xs font-bold shrink-0"
                          >
                            تمت القراءة
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 10. إعدادات الحساب */}
            {section === 'settings' && (
              <div className="max-w-xl space-y-6">
                <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إعدادات الحساب</h1>
                <div className="rounded-2xl bg-[#11192C] border border-white/10 p-6 space-y-3 text-sm">
                  <div>
                    <span className="text-[#94A3B8]">الاسم الرباعي: </span>
                    <strong className="text-[#F8FAFC]">{student.fullName}</strong>
                  </div>
                  <div>
                    <span className="text-[#94A3B8]">الصف الدراسي: </span>
                    <strong className="text-[#D4AF37]">{student.gradeName}</strong>
                  </div>
                  <div>
                    <span className="text-[#94A3B8]">رقم الهاتف: </span>
                    <strong className="font-mono-nums text-[#F8FAFC]">{student.phoneNumber}</strong>
                  </div>
                </div>

                <form
                  onSubmit={handleChangePassword}
                  className="rounded-2xl bg-[#11192C] border border-white/10 p-6 space-y-4"
                >
                  <h2 className="text-base font-bold text-[#F8FAFC]">تغيير كلمة المرور</h2>
                  {pwdMsg && (
                    <div
                      className={`p-3 rounded-xl text-sm ${
                        pwdMsg.type === 'ok'
                          ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
                          : 'bg-red-950/60 border border-red-500/40 text-red-200'
                      }`}
                    >
                      {pwdMsg.text}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">كلمة المرور الحالية</label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">كلمة المرور الجديدة</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">تأكيد كلمة المرور الجديدة</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C667] text-[#07090E] text-sm font-bold"
                  >
                    حفظ كلمة المرور الجديدة
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </main>

      <Modal
        open={Boolean(previewPdf)}
        onClose={closePreviewPdf}
        title={previewPdf?.title || 'معاينة الشهادة'}
        maxWidthClass="max-w-4xl"
      >
        {previewPdf && (
          <div className="space-y-4">
            <iframe
              src={previewPdf.blobUrl}
              title={previewPdf.title}
              className="w-full h-[50vh] sm:h-[65vh] rounded-xl bg-white border border-white/10"
            />
            <p className="sm:hidden text-[11px] text-[#94A3B8] leading-relaxed">
              إذا لم يعرض متصفح الهاتف ملف PDF داخل الإطار، اضغط على زر «تنزيل / فتح الشهادة PDF» بالأسفل لعرضها بجودة كاملة.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closePreviewPdf}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#11192C] border border-white/10 text-[#F8FAFC] text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => void downloadPdfFile(previewPdf.downloadUrl, previewPdf.filename)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#07090E] text-xs font-bold"
              >
                <Download className="w-4 h-4" />
                تنزيل / فتح الشهادة PDF
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Mobile Bottom Quick Nav */}
      {!activeExamId && (
        <nav
          aria-label="التنقل السريع"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0B1221]/95 backdrop-blur-md border-t border-[#D4AF37]/25 px-1.5 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] grid grid-cols-5 gap-1"
        >
          {[
            { id: 'overview' as const, label: 'الرئيسية', icon: Home },
            { id: 'exams' as const, label: 'الامتحانات', icon: ClipboardList },
            { id: 'videos' as const, label: 'الفيديوهات', icon: PlayCircle },
            { id: 'certificates' as const, label: 'شهاداتي', icon: FileBadge },
          ].map((item) => {
            const Icon = item.icon;
            const active = section === item.id && !activeVideoId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchSection(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  active ? 'text-[#D4AF37] bg-[#D4AF37]/10' : 'text-[#94A3B8]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[11px] font-bold text-[#94A3B8]"
          >
            <Menu className="w-4 h-4" />
            <span>المزيد</span>
          </button>
        </nav>
      )}
    </div>
  );
};
