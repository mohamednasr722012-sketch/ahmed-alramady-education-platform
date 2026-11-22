import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ExternalLink, PlayCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { formatArabicDate } from '../../lib/formatters';
import { parseVideoPlayback } from '../../lib/videoUrl';
import { EmptyState, LoadingSkeleton } from '../../components/EmptyState';
import type { VideoItem } from '../../types/domain';

interface VideoWatchProps {
  videoId: string;
  onBack: () => void;
  onOpenVideo: (videoId: string) => void;
}

export const VideoWatchPage: React.FC<VideoWatchProps> = ({
  videoId,
  onBack,
  onOpenVideo,
}) => {
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    apiRequest<{ video: VideoItem; relatedVideos: VideoItem[] }>(`/api/student/videos/${videoId}`)
      .then((res) => {
        if (!mounted) return;
        setVideo(res.video);
        setRelatedVideos(res.relatedVideos);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof ApiError ? err.message : 'تعذر تحميل الفيديو.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [videoId]);

  if (loading) return <LoadingSkeleton rows={4} />;

  if (error || !video) {
    return (
      <EmptyState
        icon={PlayCircle}
        title="تعذر فتح الفيديو"
        description={error || 'الفيديو غير متاح لصفك الدراسي.'}
        actionLabel="العودة للفيديوهات"
        onAction={onBack}
      />
    );
  }

  const parsed = parseVideoPlayback(video.playbackUrl);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#D4AF37] py-1 transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        العودة إلى مكتبة الفيديوهات
      </button>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-3xl overflow-hidden bg-black border border-[#D4AF37]/30 aspect-video shadow-2xl">
            {parsed?.kind === 'iframe' ? (
              <iframe
                key={video.id}
                src={parsed.src}
                title={video.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : parsed?.kind === 'video' ? (
              <video
                key={video.id}
                src={parsed.src}
                poster={video.thumbnailUrl || undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-[#94A3B8]">
                رابط الفيديو غير متاح حاليًا.
              </div>
            )}
          </div>

          <div className="rounded-2xl surface-card p-5 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[#D4AF37]">
                {video.unit_title} · {video.lesson_title} ·{' '}
                {formatArabicDate(video.published_at || video.created_at)}
              </div>
              {parsed?.externalOpenUrl && (
                <a
                  href={parsed.externalOpenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1120] border border-[#D4AF37]/30 text-xs font-bold text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  فتح الفيديو في نافذة خارجية
                </a>
              )}
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#F8FAFC]">{video.title}</h1>
            <p className="text-sm text-[#94A3B8] leading-relaxed whitespace-pre-line">
              {video.description || 'لا يوجد وصف إضافي لهذا الدرس.'}
            </p>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-base font-bold text-[#F8FAFC]">فيديوهات أخرى مرتبطة بالدرس</h2>
          {relatedVideos.length === 0 ? (
            <div className="rounded-xl bg-[#11192C]/70 border border-white/10 p-5 text-sm text-[#94A3B8]">
              لا توجد فيديوهات أخرى في هذا الدرس حاليًا.
            </div>
          ) : (
            <div className="space-y-3">
              {relatedVideos.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onOpenVideo(rel.id)}
                  className="w-full text-right rounded-xl bg-[#11192C] hover:bg-[#19233D] border border-white/10 hover:border-[#D4AF37]/40 p-3 flex items-center gap-3 transition-colors"
                >
                  <div className="w-24 h-14 rounded-lg bg-[#07090E] overflow-hidden shrink-0 flex items-center justify-center">
                    {rel.thumbnailUrl ? (
                      <img
                        src={rel.thumbnailUrl}
                        alt={rel.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <PlayCircle className="w-6 h-6 text-[#D4AF37]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#F8FAFC] truncate">{rel.title}</div>
                    <div className="text-xs text-[#94A3B8] mt-1">{rel.lesson_title}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
