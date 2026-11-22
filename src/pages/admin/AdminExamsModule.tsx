import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, CheckCircle2, ImagePlus, Plus, Trash2, Lock, Unlock } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { formatArabicDateTime } from '../../lib/formatters';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import type { ExamSummary, GradeInfo } from '../../types/domain';

interface QuestionDraft {
  questionText: string;
  imagePath: string | null;
  imageUrl?: string | null;
  points: number;
  options: Array<{ optionText: string; isCorrect: boolean }>;
}

function makeDefaultQuestion(points = 10): QuestionDraft {
  return {
    questionText: '',
    imagePath: null,
    imageUrl: null,
    points,
    options: [
      { optionText: '', isCorrect: true },
      { optionText: '', isCorrect: false },
      { optionText: '', isCorrect: false },
      { optionText: '', isCorrect: false },
    ],
  };
}

export const AdminExamsListModule: React.FC<{
  grades: GradeInfo[];
  onCreateNew: () => void;
}> = ({ grades, onCreateNew }) => {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [gradeFilter, setGradeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const qs = gradeFilter ? `?gradeId=${gradeFilter}` : '';
      const res = await apiRequest<{ exams: ExamSummary[] }>(`/api/admin/exams${qs}`);
      setExams(res.exams);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحميل الامتحانات.');
    } finally {
      setLoading(false);
    }
  }, [gradeFilter]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const handleStatusChange = async (examId: string, publish_status: string) => {
    setActionError('');
    try {
      await apiRequest(`/api/admin/exams/${examId}`, {
        method: 'PATCH',
        body: JSON.stringify({ publish_status }),
      });
      void loadExams();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة الامتحان.');
    }
  };

  const handleDelete = async (examId: string) => {
    setActionError('');
    try {
      await apiRequest(`/api/admin/exams/${examId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      void loadExams();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر حذف الامتحان.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إدارة الامتحانات</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            نشر، إغلاق، إعادة فتح، حذف، ومراقبة عدد المشاركين لكل امتحان مستقل.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
          >
            <option value="">كل الصفوف</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_ar}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 py-2 rounded-xl bg-[#D4AF37] text-[#07090E] text-sm font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            إنشاء امتحان جديد
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="لا توجد امتحانات منشأة بعد"
          description="ابدأ بإنشاء امتحانك الأول بتحديد الصف وكتابة الأسئلة مباشرة داخل الامتحان."
          actionLabel="إنشاء امتحان"
          onAction={onCreateNew}
        />
      ) : (
        <div className="space-y-3">
          {exams.map((ex) => (
            <div
              key={ex.id}
              className="rounded-xl bg-[#11192C] border border-white/10 p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <div className="text-xs text-[#D4AF37]">
                  {ex.gradeName} · {ex.question_count} أسئلة · {ex.total_points} درجة ·{' '}
                  {ex.duration_minutes} دقيقة
                </div>
                <h3 className="text-base font-bold text-[#F8FAFC] mt-1">{ex.title}</h3>
                <div className="text-xs text-[#94A3B8] mt-1 font-mono-nums">
                  الحالة: <strong className="text-[#F8FAFC]">{ex.publish_status}</strong> · المشاركون:{' '}
                  {ex.participantsCount ?? 0} · التسليمات: {ex.submissionsCount ?? 0}
                  {ex.published_at && ` · نُشر: ${formatArabicDateTime(ex.published_at)}`}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {ex.publish_status !== 'published' ? (
                  <button
                    type="button"
                    onClick={() => void handleStatusChange(ex.id, 'published')}
                    className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    نشر / إعادة فتح
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStatusChange(ex.id, 'closed')}
                    className="px-3 py-1.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    إغلاق الامتحان
                  </button>
                )}
                {confirmDeleteId === ex.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleDelete(ex.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                    >
                      تأكيد الحذف
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0B1221] text-xs text-[#94A3B8]"
                    >
                      تراجع
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(ex.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminCreateExamModule: React.FC<{
  grades: GradeInfo[];
  onCreated: () => void;
}> = ({ grades, onCreated }) => {
  const [gradeId, setGradeId] = useState<number>(grades[0]?.id || 1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [pointsPerQuestion, setPointsPerQuestion] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState<string>('1');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'draft' | 'scheduled'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    Array.from({ length: 10 }, () => makeDefaultQuestion(10))
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (grades.length > 0 && !grades.some((g) => g.id === gradeId)) {
      setGradeId(grades[0].id);
    }
  }, [grades, gradeId]);

  const handleQuestionCountChange = (count: number) => {
    const safe = Math.max(1, Math.min(100, count));
    setQuestions((prev) => {
      if (safe === prev.length) return prev;
      if (safe < prev.length) return prev.slice(0, safe);
      return [
        ...prev,
        ...Array.from({ length: safe - prev.length }, () => makeDefaultQuestion(pointsPerQuestion)),
      ];
    });
  };

  const handlePointsPerQuestionChange = (pts: number) => {
    const safe = Math.max(1, pts);
    setPointsPerQuestion(safe);
    setQuestions((prev) => prev.map((q) => ({ ...q, points: safe })));
  };

  const handleUploadQuestionImage = async (qIdx: number, file: File) => {
    setError('');
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await apiRequest<{ storagePath: string; url: string }>(
        '/api/admin/uploads/question-image',
        { method: 'POST', body: form }
      );
      setQuestions((prev) =>
        prev.map((q, idx) => (idx === qIdx ? { ...q, imagePath: res.storagePath, imageUrl: res.url } : q))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر رفع صورة السؤال.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (opensAt && closesAt && new Date(opensAt).getTime() >= new Date(closesAt).getTime()) {
      setError('يجب أن يكون موعد فتح الامتحان قبل موعد الإغلاق.');
      return;
    }
    if (publishMode === 'scheduled' && !scheduledFor) {
      setError('يرجى تحديد تاريخ وساعة النشر المجدول.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/admin/exams', {
        method: 'POST',
        body: JSON.stringify({
          gradeId,
          title,
          description,
          unitTitle,
          lessonTitle,
          pointsPerQuestion,
          durationMinutes,
          maxAttempts: maxAttempts === 'unlimited' ? 'unlimited' : Number(maxAttempts),
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          publishMode,
          scheduledFor:
            publishMode === 'scheduled' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
          timezone: 'Africa/Cairo',
          questions: questions.map((q) => ({
            questionText: q.questionText,
            imagePath: q.imagePath,
            points: q.points,
            options: q.options,
          })),
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ الامتحان.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPoints = questions.reduce((s, q) => s + Number(q.points || 0), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إنشاء امتحان مستقل</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          الإعداد الافتراضي 10 أسئلة × 10 درجات (المجموع 100) لمدة 10 دقائق ومحاولة واحدة، مع حرية التعديل الكاملة دون أي بنك أسئلة.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-[#11192C] border border-[#D4AF37]/20 p-4 sm:p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-[#94A3B8] mb-1">عنوان الامتحان</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: اختبار الوحدة الأولى — النحو والبلاغة"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">الصف الدراسي المستهدف</label>
          <select
            value={gradeId}
            onChange={(e) => setGradeId(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          >
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_ar}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs text-[#94A3B8] mb-1">وصف الامتحان</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="تعليمات مختصرة للطلاب..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">الوحدة</label>
          <input
            type="text"
            value={unitTitle}
            onChange={(e) => setUnitTitle(e.target.value)}
            placeholder="الوحدة الأولى"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">الدرس</label>
          <input
            type="text"
            value={lessonTitle}
            onChange={(e) => setLessonTitle(e.target.value)}
            placeholder="اسم الدرس"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">عدد الأسئلة</label>
          <input
            type="number"
            min={1}
            max={100}
            value={questions.length}
            onChange={(e) => handleQuestionCountChange(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
          />
        </div>

        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">درجة كل سؤال</label>
          <input
            type="number"
            min={1}
            value={pointsPerQuestion}
            onChange={(e) => handlePointsPerQuestionChange(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">المدة (بالدقائق)</label>
          <input
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">عدد المحاولات</label>
          <select
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          >
            <option value="1">محاولة واحدة (افتراضي)</option>
            <option value="2">محاولتان</option>
            <option value="3">3 محاولات</option>
            <option value="unlimited">محاولات غير محدودة</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">موعد الفتح (اختياري)</label>
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">موعد الإغلاق (اختياري)</label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm font-mono-nums"
          />
        </div>
        <div>
          <label className="block text-xs text-[#94A3B8] mb-1">حالة النشر</label>
          <select
            value={publishMode}
            onChange={(e) => setPublishMode(e.target.value as 'now' | 'draft' | 'scheduled')}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
          >
            <option value="now">نشر فوري</option>
            <option value="scheduled">جدولة النشر</option>
            <option value="draft">حفظ كمسودة</option>
          </select>
        </div>

        {publishMode === 'scheduled' && (
          <div className="sm:col-span-2">
            <label className="block text-xs text-[#D4AF37] mb-1 inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              تاريخ وساعة ودقيقة النشر (بتوقيت القاهرة)
            </label>
            <input
              type="datetime-local"
              required
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-[#D4AF37]/40 text-sm font-mono-nums"
            />
          </div>
        )}

        <div className="sm:col-span-2 lg:col-span-3 pt-2 border-t border-white/10 flex items-center justify-between text-sm">
          <span className="text-[#94A3B8]">المجموع الكلي للامتحان:</span>
          <span className="font-mono-nums text-lg font-bold text-[#D4AF37]">{totalPoints} درجة</span>
        </div>
      </div>

      {/* Questions Builder */}
      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div
            key={qIdx}
            className="rounded-2xl bg-[#11192C] border border-white/10 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-bold text-[#D4AF37] font-mono-nums">
                السؤال #{qIdx + 1}
              </span>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-xs text-[#94A3B8] hover:text-[#F8FAFC]">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{q.imagePath ? 'تغيير الصورة' : 'إرفاق صورة'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadQuestionImage(qIdx, f);
                    }}
                  />
                </label>
                <input
                  type="number"
                  min={1}
                  value={q.points}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setQuestions((prev) =>
                      prev.map((item, idx) => (idx === qIdx ? { ...item, points: val } : item))
                    );
                  }}
                  className="w-20 px-2.5 py-1 rounded-lg bg-[#0B1221] border border-white/10 text-xs font-mono-nums text-center"
                  title="درجة السؤال"
                />
              </div>
            </div>

            <textarea
              required
              rows={2}
              value={q.questionText}
              onChange={(e) => {
                const val = e.target.value;
                setQuestions((prev) =>
                  prev.map((item, idx) => (idx === qIdx ? { ...item, questionText: val } : item))
                );
              }}
              placeholder={`اكتب نص السؤال رقم ${qIdx + 1}...`}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1221] border border-white/10 text-sm"
            />

            {q.imageUrl && (
              <img
                src={q.imageUrl}
                alt={`صورة السؤال ${qIdx + 1}`}
                className="max-h-40 rounded-lg border border-white/10 object-contain"
              />
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {q.options.map((opt, optIdx) => (
                <div
                  key={optIdx}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border ${
                    opt.isCorrect
                      ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50'
                      : 'bg-[#0B1221] border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name={`correct-q-${qIdx}`}
                    checked={opt.isCorrect}
                    onChange={() =>
                      setQuestions((prev) =>
                        prev.map((item, idx) =>
                          idx === qIdx
                            ? {
                                ...item,
                                options: item.options.map((o, i) => ({
                                  ...o,
                                  isCorrect: i === optIdx,
                                })),
                              }
                            : item
                        )
                      )
                    }
                    title="تحديد كإجابة صحيحة"
                    className="accent-[#D4AF37] w-4 h-4 shrink-0"
                  />
                  <input
                    type="text"
                    required
                    value={opt.optionText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuestions((prev) =>
                        prev.map((item, idx) =>
                          idx === qIdx
                            ? {
                                ...item,
                                options: item.options.map((o, i) =>
                                  i === optIdx ? { ...o, optionText: val } : o
                                ),
                              }
                            : item
                        )
                      );
                    }}
                    placeholder={`الاختيار ${optIdx + 1}`}
                    className="w-full bg-transparent text-sm focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => handleQuestionCountChange(questions.length + 1)}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#11192C] border border-[#D4AF37]/30 text-[#D4AF37] text-sm font-bold inline-flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          إضافة سؤال جديد
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C667] disabled:opacity-60 text-[#07090E] font-bold text-sm"
        >
          {submitting ? 'جاري حفظ الامتحان...' : 'حفظ ونشر الامتحان'}
        </button>
      </div>
    </form>
  );
};
