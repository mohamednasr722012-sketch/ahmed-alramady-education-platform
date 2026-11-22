import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Send,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { formatCountdownMs, formatDurationMs } from '../../lib/formatters';
import { Modal } from '../../components/Modal';
import { LoadingSkeleton } from '../../components/EmptyState';
import type { BadgeItem, CertificateItem, ExamResultItem, ExamSummary } from '../../types/domain';

interface ExamRunnerProps {
  examId: string;
  onExitToExams: () => void;
  onOpenCertificates: () => void;
}

interface StartExamResponse {
  exam: ExamSummary;
  attempt: {
    id: string;
    attempt_number: number;
    started_at: string;
    expires_at: string;
  };
  questions: Array<{
    id: string;
    question_order: number;
    question_text: string;
    imageUrl?: string | null;
    points: number;
    options: Array<{ id: string; option_order: number; option_text: string }>;
  }>;
  savedAnswers: Record<string, string>;
  serverNowIso: string;
  remainingMs: number;
}

interface SubmitResponse {
  result: ExamResultItem;
  newlyAwardedBadges: BadgeItem[];
  newlyIssuedCertificates: CertificateItem[];
}

export const ExamRunnerPage: React.FC<ExamRunnerProps> = ({
  examId,
  onExitToExams,
  onOpenCertificates,
}) => {
  const [session, setSession] = useState<StartExamResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingMsg, setSavingMsg] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionOutcome, setSubmissionOutcome] = useState<SubmitResponse | null>(null);

  const serverOffsetRef = useRef<number>(0);
  const autoSubmittedRef = useRef<boolean>(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiRequest<StartExamResponse>(`/api/student/exams/${examId}/start`, {
      method: 'POST',
    })
      .then((res) => {
        if (!mounted) return;
        serverOffsetRef.current = new Date(res.serverNowIso).getTime() - Date.now();
        setSession(res);
        setAnswers(res.savedAnswers || {});
        setRemainingMs(res.remainingMs);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof ApiError ? err.message : 'تعذر بدء الامتحان.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [examId]);

  const submitAttempt = useCallback(async () => {
    if (!session || submitting || submissionOutcome) return;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      const outcome = await apiRequest<SubmitResponse>(
        `/api/student/attempts/${session.attempt.id}/submit`,
        { method: 'POST' }
      );
      setSubmissionOutcome(outcome);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تسليم الامتحان.');
    } finally {
      setSubmitting(false);
    }
  }, [session, submitting, submissionOutcome]);

  useEffect(() => {
    if (!session || submissionOutcome) return;
    const expiresMs = new Date(session.attempt.expires_at).getTime();

    const interval = window.setInterval(() => {
      const serverNow = Date.now() + serverOffsetRef.current;
      const left = Math.max(0, expiresMs - serverNow);
      setRemainingMs(left);
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void submitAttempt();
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [session, submissionOutcome, submitAttempt]);

  const handleSelectOption = async (questionId: string, optionId: string) => {
    if (!session || submissionOutcome) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setSavingMsg('جاري الحفظ...');
    try {
      const res = await apiRequest<{ saved: boolean; expired?: boolean }>(
        `/api/student/attempts/${session.attempt.id}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ questionId, selectedOptionId: optionId }),
        }
      );
      if (res.expired) {
        void submitAttempt();
        return;
      }
      setSavingMsg('تم حفظ الإجابة تلقائيًا');
    } catch (err) {
      setSavingMsg(err instanceof ApiError ? err.message : 'تعذر الحفظ');
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="rounded-2xl surface-card border-red-500/40 p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-[#F8FAFC] mb-2">تنبيه الامتحان</h2>
          <p className="text-sm text-[#94A3B8] mb-6">{error}</p>
          <button
            type="button"
            onClick={onExitToExams}
            className="px-6 py-2.5 rounded-xl bg-[#D4AF37] text-[#06080D] text-sm font-bold"
          >
            العودة إلى قائمة الامتحانات
          </button>
        </div>
      </div>
    );
  }

  if (submissionOutcome && session) {
    const { result, newlyAwardedBadges, newlyIssuedCertificates } = submissionOutcome;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl mx-auto py-8 px-4"
      >
        <div className="rounded-3xl surface-card-gold p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
            تم تصحيح الامتحان وتسجيل النتيجة
          </h2>
          <p className="text-sm text-[#94A3B8] mt-1">{session.exam.title}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4 mt-8 text-center">
            <div className="p-4 rounded-2xl surface-card">
              <div className="text-xs text-[#94A3B8]">الدرجة</div>
              <div className="font-mono-nums text-2xl font-bold text-[#D4AF37] mt-1">
                {result.earned_score} / {result.max_score}
              </div>
            </div>
            <div className="p-4 rounded-2xl surface-card">
              <div className="text-xs text-[#94A3B8]">النسبة المئوية</div>
              <div className="font-mono-nums text-2xl font-bold text-[#F8FAFC] mt-1">
                {result.percentage}%
              </div>
            </div>
            <div className="p-4 rounded-2xl surface-card">
              <div className="text-xs text-[#94A3B8]">إجابات صحيحة</div>
              <div className="font-mono-nums text-2xl font-bold text-emerald-400 mt-1">
                {result.correct_count}
              </div>
            </div>
            <div className="p-4 rounded-2xl surface-card">
              <div className="text-xs text-[#94A3B8]">مدة الحل</div>
              <div className="font-mono-nums text-lg font-bold text-[#F8FAFC] mt-2">
                {formatDurationMs(result.duration_ms)}
              </div>
            </div>
          </div>

          {newlyAwardedBadges.length > 0 && (
            <div className="mt-6 p-4 rounded-2xl surface-card-gold text-right">
              <div className="flex items-center gap-2 text-sm font-bold text-[#D4AF37] mb-2">
                <Award className="w-5 h-5" />
                شارات جديدة مكتسبة
              </div>
              <ul className="space-y-1 text-sm text-[#F8FAFC]">
                {newlyAwardedBadges.map((b) => (
                  <li key={b.id}>
                    {b.title_ar} — <span className="text-[#94A3B8]">{b.description_ar}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {newlyIssuedCertificates.length > 0 && (
            <div className="mt-4 p-4 rounded-2xl surface-card-gold text-right flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[#F8FAFC]">
                تم إصدار <strong className="text-[#D4AF37]">{newlyIssuedCertificates.length}</strong>{' '}
                شهادة جديدة لك.
              </div>
              <button
                type="button"
                onClick={onOpenCertificates}
                className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#06080D] text-xs font-bold"
              >
                عرض شهاداتي PDF
              </button>
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={onExitToExams}
              className="px-7 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#E6C667] text-[#06080D] font-bold text-sm"
            >
              العودة إلى لوحة الامتحانات
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!session || session.questions.length === 0) return null;

  const currentQuestion = session.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = session.questions.length;
  const progressPct = Math.round(((currentIndex + 1) / totalQuestions) * 100);
  const isUrgent = remainingMs < 60_000;

  return (
    <div className="max-w-4xl mx-auto py-2 sm:py-4 space-y-4 sm:space-y-5">
      {/* Top Exam Bar (Sticky on Mobile, iPad & Desktop) */}
      <div className="sticky top-16 lg:top-2 z-30 rounded-2xl bg-[#0B1120]/95 backdrop-blur-md border border-[#D4AF37]/30 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 shadow-xl">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-lg font-bold text-[#F8FAFC] truncate">{session.exam.title}</h2>
          <p className="text-[11px] sm:text-xs text-[#94A3B8] mt-0.5 truncate">
            السؤال <span className="font-mono-nums text-[#F8FAFC]">{currentIndex + 1}</span> من{' '}
            <span className="font-mono-nums text-[#F8FAFC]">{totalQuestions}</span> · تم حل{' '}
            <span className="font-mono-nums text-[#D4AF37]">{answeredCount}</span>
            {savingMsg && ` · ${savingMsg}`}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div
            className={`px-3 sm:px-4 py-2 rounded-xl border font-mono-nums text-sm sm:text-base font-bold inline-flex items-center gap-1.5 sm:gap-2 ${
              isUrgent
                ? 'bg-red-950/70 border-red-500/60 text-red-200'
                : 'bg-[#10192E] border-[#D4AF37]/30 text-[#D4AF37]'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            {formatCountdownMs(remainingMs)}
          </div>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E6C667] text-[#06080D] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            تسليم الامتحان
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 rounded-full bg-[#10192E] overflow-hidden">
        <div
          className="h-full bg-[#D4AF37] transition-all duration-200"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Question Card */}
      <motion.div
        key={currentQuestion.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl surface-card p-5 sm:p-8"
      >
        <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-3 sm:mb-4">
          <span>السؤال رقم {currentQuestion.question_order}</span>
          <span className="font-mono-nums text-[#D4AF37]">{currentQuestion.points} درجات</span>
        </div>

        <h3 className="text-base sm:text-xl font-bold text-[#F8FAFC] leading-relaxed mb-5">
          {currentQuestion.question_text}
        </h3>

        {currentQuestion.imageUrl && (
          <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 bg-[#06080D] max-h-80 flex justify-center">
            <img
              src={currentQuestion.imageUrl}
              alt={`صورة السؤال ${currentQuestion.question_order}`}
              referrerPolicy="no-referrer"
              className="max-h-80 object-contain"
            />
          </div>
        )}

        <div className="space-y-3">
          {currentQuestion.options.map((opt) => {
            const selected = answers[currentQuestion.id] === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => void handleSelectOption(currentQuestion.id, opt.id)}
                className={`w-full min-h-[54px] text-right p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 flex items-center gap-3.5 ${
                  selected
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F8FAFC]'
                    : 'bg-[#0B1120] border-white/[0.08] hover:border-[#D4AF37]/40 text-[#E2E8F0]'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono-nums font-bold shrink-0 ${
                    selected
                      ? 'bg-[#D4AF37] text-[#06080D]'
                      : 'bg-[#10192E] text-[#94A3B8] border border-white/10'
                  }`}
                >
                  {opt.option_order}
                </span>
                <span className="text-sm sm:text-base font-medium leading-snug">{opt.option_text}</span>
              </button>
            );
          })}
        </div>

        {/* Navigation Buttons */}
        <div className="mt-7 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between gap-2 sm:contents">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="flex-1 sm:flex-initial justify-center px-4 sm:px-5 py-2.5 rounded-lg bg-[#0B1221] border border-white/10 hover:border-[#D4AF37]/40 disabled:opacity-40 text-sm font-semibold text-[#F8FAFC] inline-flex items-center gap-2 sm:order-1"
            >
              <ArrowRight className="w-4 h-4" />
              السابق
            </button>

            {currentIndex < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                className="flex-1 sm:flex-initial justify-center px-4 sm:px-5 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#E6C667] text-[#07090E] text-sm font-bold inline-flex items-center gap-2 sm:order-3"
              >
                التالي
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="flex-1 sm:flex-initial justify-center px-4 sm:px-5 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#E6C667] text-[#07090E] text-sm font-bold inline-flex items-center gap-2 sm:order-3"
              >
                <Send className="w-4 h-4" />
                إنهاء وتسليم
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0 sm:flex-wrap sm:justify-center sm:order-2">
            {session.questions.map((q, idx) => {
              const isAnswered = Boolean(answers[q.id]);
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-8 h-8 shrink-0 rounded-lg font-mono-nums text-xs font-bold transition-colors ${
                    isCurrent
                      ? 'bg-[#D4AF37] text-[#07090E]'
                      : isAnswered
                        ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40'
                        : 'bg-[#0B1221] text-[#94A3B8] border border-white/10'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="تأكيد تسليم الامتحان"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            لقد أجبت عن{' '}
            <strong className="font-mono-nums text-[#D4AF37]">{answeredCount}</strong> من أصل{' '}
            <strong className="font-mono-nums text-[#F8FAFC]">{totalQuestions}</strong> أسئلة.
            {answeredCount < totalQuestions && (
              <span className="block mt-2 text-amber-300">
                تنبيه: توجد أسئلة لم تقم باختيار إجابة لها بعد.
              </span>
            )}
          </p>
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#11192C] border border-white/10 text-sm font-semibold text-[#F8FAFC]"
            >
              مراجعة الإجابات
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitAttempt()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#E6C667] text-[#07090E] text-sm font-bold"
            >
              {submitting ? 'جاري التصحيح...' : 'تأكيد التسليم النهائي'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
