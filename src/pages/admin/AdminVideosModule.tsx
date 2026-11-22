import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, ExternalLink, Eye, EyeOff, Link2, PlayCircle, Trash2, Upload } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { formatArabicDateTime, formatFileSize } from '../../lib/formatters';
import { parseVideoPlayback } from '../../lib/videoUrl';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import type { GradeInfo, VideoItem } from '../../types/domain';

export const AdminVideosModule: React.FC<{ grades: GradeInfo[] }> = ({ grades }) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<VideoItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add video form (Default: Free Unlimited Link)
  const [sourceMode, setSourceMode] = useState<'link' | 'upload'>('link');
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [gradeId, setGradeId] = useState<number>(grades[0]?.id || 1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [publishMode, setPublishMode] = useState<'now' | 'scheduled' | 'draft'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (grades.length > 0 && !grades.some((g) => g.id === gradeId)) {
      setGradeId(grades[0].id);
    }
  }, [grades, gradeId]);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const res = await apiRequest<{ videos: VideoItem[] }>('/api/admin/videos');
      setVideos(res.videos);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحميل الفيديوهات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const parsedLinkPreview = sourceMode === 'link' ? parseVideoPlayback(videoUrl) : null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');

    if (sourceMode === 'link') {
      if (!videoUrl.trim()) {
        setUploadError('يرجى لصق رابط الفيديو (يوتيوب أو جوجل درايف أو رابط مباشر).');
        return;
      }
    } else if (!videoFile) {
      setUploadError('يرجى اختيار ملف الفيديو.');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('gradeId', String(gradeId));
      form.append('title', title);
      form.append('description', description);
      form.append('unitTitle', unitTitle);
      form.append('lessonTitle', lessonTitle);
      form.append('publishMode', publishMode);
      if (publishMode === 'scheduled' && scheduledFor) {
        form.append('scheduledFor', new Date(scheduledFor).toISOString());
        form.append('timezone', 'Africa/Cairo');
      }
      if (sourceMode === 'link') {
        form.append('videoUrl', videoUrl.trim());
        if (thumbnailUrl.trim()) form.append('thumbnailUrl', thumbnailUrl.trim());
      } else if (videoFile) {
        form.append('video', videoFile);
      }
      if (thumbFile) form.append('thumbnail', thumbFile);

      await apiRequest('/api/admin/videos', { method: 'POST', body: form });
      setUploadOpen(false);
      setTitle('');
      setDescription('');
      setUnitTitle('');
      setLessonTitle('');
      setVideoUrl('');
      setThumbnailUrl('');
      setVideoFile(null);
      setThumbFile(null);
      setScheduledFor('');
      void loadVideos();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'تعذر حفظ الفيديو.');
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async (v: VideoItem) => {
    try {
      const nextStatus = v.publish_status === 'published' ? 'hidden' : 'published';
      await apiRequest(`/api/admin/videos/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ publish_status: nextStatus }),
      });
      void loadVideos();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر تحديث حالة الفيديو.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/admin/videos/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      void loadVideos();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'تعذر حذف الفيديو.');
    }
  };

  const previewPlayback = parseVideoPlayback(previewVideo?.playbackUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">إدارة الفيديوهات</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            أضف فيديوهات مجانًا بلا حدود عبر روابط يوتيوب (غير مدرج) أو جوجل درايف، أو ارفع مقطعًا مباشرًا.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setUploadError('');
            setUploadOpen(true);
          }}
          className="px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E6C667] text-[#07090E] text-sm font-bold inline-flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          إضافة فيديو جديد
        </button>
      </div>

      <div className="rounded-xl bg-[#11192C]/70 border border-[#D4AF37]/25 p-4 text-xs text-[#94A3B8] leading-relaxed">
        <strong className="text-[#D4AF37]">للتشغيل المجاني بلا حدود:</strong> ارفع حصتك على{' '}
        <strong className="text-[#F8FAFC]">يوتيوب كـ «غير مدرج / Unlisted»</strong> أو على{' '}
        <strong className="text-[#F8FAFC]">جوجل درايف</strong> والصق الرابط هنا — لا يستهلك أي مساحة من الخادم ويعمل بأقصى سرعة وجودة تلقائيًا لجميع الطلاب، مع إمكانية رفع الملفات الصغيرة مباشرة أيضًا.
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={PlayCircle}
          title="لا توجد فيديوهات مضافة بعد"
          description="أضف أول درس مرئي عبر رابط يوتيوب أو جوجل درايف مجانًا بلا حدود أو ارفع ملفًا من جهازك."
          actionLabel="إضافة فيديو الآن"
          onAction={() => setUploadOpen(true)}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((v) => {
            const parsed = parseVideoPlayback(v.playbackUrl);
            return (
              <div
                key={v.id}
                className="rounded-xl bg-[#11192C] border border-white/10 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-video bg-[#07090E] relative flex items-center justify-center">
                    {v.thumbnailUrl ? (
                      <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <PlayCircle className="w-10 h-10 text-[#D4AF37]/60" />
                    )}
                    {parsed && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#07090E]/85 border border-[#D4AF37]/30 text-[10px] font-bold text-[#D4AF37]">
                        {parsed.providerLabel}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-[#D4AF37]">
                      {v.gradeName} · {v.unit_title} · {v.lesson_title}
                    </div>
                    <h3 className="text-base font-bold text-[#F8FAFC] mt-1">{v.title}</h3>
                    <div className="text-xs text-[#94A3B8] mt-1 font-mono-nums">
                      الحالة: {v.publish_status} ·{' '}
                      {v.file_size_bytes ? `الحجم: ${formatFileSize(v.file_size_bytes)}` : 'سحابي بلا حدود'}
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewVideo(v)}
                    className="px-3 py-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-xs font-bold text-[#D4AF37]"
                  >
                    تشغيل
                  </button>
                  <button
                    type="button"
                    onClick={() => void togglePublish(v)}
                    className="px-3 py-1.5 rounded-lg bg-[#0B1221] border border-white/10 text-xs font-bold text-[#F8FAFC] inline-flex items-center gap-1"
                  >
                    {v.publish_status === 'published' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        إخفاء
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        نشر
                      </>
                    )}
                  </button>
                  {confirmDeleteId === v.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(v.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                      >
                        تأكيد الحذف
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 rounded-lg bg-[#0B1221] text-xs text-[#94A3B8]"
                      >
                        تراجع
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(v.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Upload Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="إضافة درس فيديو جديد"
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          {uploadError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs">
              {uploadError}
            </div>
          )}

          {/* Source Type Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#07090E] border border-white/10">
            <button
              type="button"
              onClick={() => setSourceMode('link')}
              className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                sourceMode === 'link'
                  ? 'bg-[#D4AF37] text-[#07090E]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              رابط مجاني بلا حدود
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('upload')}
              className={`py-2 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                sourceMode === 'upload'
                  ? 'bg-[#D4AF37] text-[#07090E]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              رفع ملف من الجهاز
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">الصف الدراسي</label>
              <select
                value={gradeId}
                onChange={(e) => setGradeId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
              >
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">حالة النشر</label>
              <select
                value={publishMode}
                onChange={(e) => setPublishMode(e.target.value as 'now' | 'scheduled' | 'draft')}
                className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
              >
                <option value="now">نشر فوري</option>
                <option value="scheduled">جدولة النشر</option>
                <option value="draft">مسودة</option>
              </select>
            </div>
          </div>

          {publishMode === 'scheduled' && (
            <div>
              <label className="block text-xs text-[#D4AF37] mb-1">موعد النشر المجدول</label>
              <input
                type="datetime-local"
                required
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-[#D4AF37]/40 text-sm font-mono-nums"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">عنوان الفيديو</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: شرح المنادى وأنواعه بالتفصيل"
              className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">الوحدة</label>
              <input
                type="text"
                required
                value={unitTitle}
                onChange={(e) => setUnitTitle(e.target.value)}
                placeholder="مثال: الوحدة الأولى"
                className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">الدرس</label>
              <input
                type="text"
                required
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="مثال: المنادى وأنواعه"
                className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">وصف الدرس</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm"
            />
          </div>

          {sourceMode === 'link' ? (
            <div className="space-y-3 p-3.5 rounded-xl bg-[#07090E]/70 border border-[#D4AF37]/25">
              <div>
                <label className="block text-xs text-[#D4AF37] font-semibold mb-1">
                  رابط الفيديو (YouTube / Google Drive / Vimeo / MP4 مباشر)
                </label>
                <input
                  type="url"
                  required
                  dir="ltr"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... أو رابط Google Drive"
                  className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-sm font-mono text-left"
                />
                {parsedLinkPreview && (
                  <div className="text-[11px] text-emerald-300 mt-1.5">
                    تم التعرف على المصدر تلقائيًا: <strong>{parsedLinkPreview.providerLabel}</strong>
                  </div>
                )}
                <p className="text-[11px] text-[#94A3B8] mt-1.5 leading-relaxed">
                  عند استخدام <strong className="text-[#F8FAFC]">جوجل درايف</strong>: تأكد من تفعيل خيار المشاركة «أي شخص لديه الرابط / Anyone with the link» ليظهر الفيديو لجميع طلاب الصف مباشرة.
                </p>
              </div>
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1">
                  رابط صورة مصغرة (اختياري — تُجلب تلقائيًا لروابط يوتيوب)
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl bg-[#11192C] border border-white/10 text-xs font-mono text-left"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">
                ملف الفيديو (MP4 / WebM / MOV — للمقاطع الصغيرة حتى 30 ميجا؛ للأطول استخدم الرابط المجاني)
              </label>
              <input
                type="file"
                required
                accept="video/*,.mp4,.webm,.mov,.m4v,.mkv"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-[#94A3B8]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1">أو ارفع صورة مصغرة من جهازك (اختياري)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setThumbFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-[#94A3B8]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#11192C] text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-5 py-2 rounded-lg bg-[#D4AF37] text-[#07090E] text-xs font-bold"
            >
              {uploading ? 'جاري الحفظ...' : 'حفظ ونشر الفيديو'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview Player Modal */}
      <Modal
        open={Boolean(previewVideo)}
        onClose={() => setPreviewVideo(null)}
        title={previewVideo?.title || 'معاينة الفيديو'}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-3">
          {previewPlayback?.kind === 'iframe' ? (
            <iframe
              src={previewPlayback.src}
              title={previewVideo?.title || 'معاينة'}
              className="w-full rounded-xl bg-black aspect-video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : previewPlayback?.kind === 'video' ? (
            <video
              src={previewPlayback.src}
              poster={previewVideo?.thumbnailUrl || undefined}
              controls
              playsInline
              className="w-full rounded-xl bg-black aspect-video"
            />
          ) : (
            <p className="text-sm text-[#94A3B8]">تعذر تحميل مسار الفيديو.</p>
          )}
          {previewPlayback?.externalOpenUrl && (
            <div className="flex justify-end">
              <a
                href={previewPlayback.externalOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#11192C] border border-[#D4AF37]/30 text-xs font-bold text-[#D4AF37]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                فتح الفيديو في نافذة خارجية
              </a>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export const AdminSchedulesModule: React.FC = () => {
  const [schedules, setSchedules] = useState<
    Array<{
      id: string;
      target_type: string;
      targetTitle: string;
      gradeName: string;
      scheduled_for_utc: string;
      timezone: string;
      status: string;
      executed_at: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ schedules: typeof schedules }>('/api/admin/schedules');
      setSchedules(res.schedules);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل جدول النشر.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRunDue = async () => {
    setError('');
    try {
      await apiRequest('/api/admin/schedules/run-due', { method: 'POST' });
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تنفيذ فحص النشر المجدول.');
    }
  };

  const handleCancel = async (id: string) => {
    setError('');
    try {
      await apiRequest(`/api/admin/schedules/${id}/cancel`, { method: 'POST' });
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إلغاء المهمة المجدولة.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#F8FAFC]">جدولة النشر الخادمية</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            تنفذ المهام تلقائيًا على الخادم كل 30 ثانية بتوقيت القاهرة دون الحاجة لبقاء المتصفح مفتوحًا.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRunDue()}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#D4AF37] text-[#07090E] text-xs font-bold"
        >
          فحص ونشر المواعيد المستحقة الآن
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="لا توجد عمليات مجدولة"
          description="عند اختيار (جدولة النشر) عند إنشاء امتحان أو إضافة فيديو ستظهر هنا حالة التنفيذ."
        />
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-white/10 bg-[#11192C] p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-[#D4AF37]">
                      {s.target_type === 'exam' ? 'امتحان' : 'فيديو'} · {s.gradeName}
                    </span>
                    <div className="font-bold text-sm text-[#F8FAFC] mt-0.5">{s.targetTitle}</div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#0B1221] text-[#E2E8F0]">
                    {s.status}
                  </span>
                </div>
                <div className="text-xs font-mono-nums text-[#94A3B8]">
                  {formatArabicDateTime(s.scheduled_for_utc)} ({s.timezone})
                </div>
                {s.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void handleCancel(s.id)}
                    className="w-full py-2 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-bold"
                  >
                    إلغاء الجدولة
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10 bg-[#11192C]">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#0B1221] text-[#D4AF37] border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">النوع</th>
                  <th className="py-3 px-4">العنصر</th>
                  <th className="py-3 px-4">الصف</th>
                  <th className="py-3 px-4">موعد النشر</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 px-4">{s.target_type === 'exam' ? 'امتحان' : 'فيديو'}</td>
                    <td className="py-3 px-4 font-bold">{s.targetTitle}</td>
                    <td className="py-3 px-4">{s.gradeName}</td>
                    <td className="py-3 px-4 font-mono-nums text-xs">
                      {formatArabicDateTime(s.scheduled_for_utc)} ({s.timezone})
                    </td>
                    <td className="py-3 px-4 font-semibold">{s.status}</td>
                    <td className="py-3 px-4">
                      {s.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => void handleCancel(s.id)}
                          className="px-3 py-1 rounded-lg bg-red-950/40 text-red-300 text-xs font-bold"
                        >
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
