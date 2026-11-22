import cron from 'node-cron';
import {
  claimDueSchedules,
  createNotification,
  finishSchedule,
  getExamById,
  getVideoById,
  updateExam,
  updateVideo,
} from '../db/contentRepo.ts';
import { invalidateCachePrefix } from '../services/cache.ts';
import { purgeExpiredSessions } from '../db/usersRepo.ts';

let schedulerStarted = false;
let sessionSweepTick = 0;

export async function runDuePublicationsOnce(): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();
  const due = await claimDueSchedules(nowIso);
  let processed = 0;

  for (const job of due) {
    try {
      if (job.target_type === 'exam') {
        const exam = await getExamById(job.target_id);
        if (!exam) {
          await finishSchedule(job.id, 'failed', 'الامتحان غير موجود.');
          continue;
        }
        await updateExam(exam.id, {
          publish_status: 'published',
          published_at: nowIso,
        });
        await createNotification({
          gradeId: exam.grade_id,
          type: 'exam_published',
          titleAr: `امتحان جديد: ${exam.title}`,
          bodyAr: `تم نشر امتحان «${exam.title}» (${exam.duration_minutes} دقيقة · ${exam.total_points} درجة).`,
          linkPath: '/student/exams',
        });
      } else if (job.target_type === 'video') {
        const video = await getVideoById(job.target_id);
        if (!video) {
          await finishSchedule(job.id, 'failed', 'الفيديو غير موجود.');
          continue;
        }
        await updateVideo(video.id, {
          publish_status: 'published',
          published_at: nowIso,
        });
        await createNotification({
          gradeId: video.grade_id,
          type: 'video_published',
          titleAr: `فيديو جديد: ${video.title}`,
          bodyAr: `أُضيف درس مرئي جديد في ${video.unit_title} — ${video.lesson_title}.`,
          linkPath: `/student/videos/${video.id}`,
        });
      }

      await finishSchedule(job.id, 'published');
      processed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء النشر المجدول';
      await finishSchedule(job.id, 'failed', msg);
    }
  }

  if (processed > 0) {
    invalidateCachePrefix('public:');
  }

  return { processed };
}

export function startPublicationScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  // يعمل تلقائيًا كل 30 ثانية على الخادم دون الحاجة لبقاء متصفح المدرس مفتوحًا
  cron.schedule('*/30 * * * * *', () => {
    void runDuePublicationsOnce().catch((err) => {
      console.error('[Scheduler Error]', err);
    });
    sessionSweepTick += 1;
    if (sessionSweepTick >= 60) {
      sessionSweepTick = 0;
      void purgeExpiredSessions().catch((err) => {
        console.error('[Session Sweep Error]', err);
      });
    }
  });
}
