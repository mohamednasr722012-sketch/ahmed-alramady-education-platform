import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { getCertificateBySerial } from '../db/assessmentsRepo.ts';
import {
  isPublishedQuestionImageAccessibleToGrade,
  isPublishedVideoAccessibleToGrade,
  listExams,
  listVideos,
} from '../db/contentRepo.ts';
import {
  findStudentById,
  getGradeById,
  getPlatformSetting,
  listGrades,
} from '../db/usersRepo.ts';
import { resolveOptionalMediaActor } from '../middleware/auth.ts';
import { getGradeCumulativeLeaderboard } from '../services/scoringAndRanks.ts';
import {
  resolvePlaybackOrAssetUrl,
  resolveSafeLocalUploadPath,
  type StorageBucket,
} from '../services/storageService.ts';
import { getOrSetCache } from '../services/cache.ts';

const router = Router();

router.get('/landing', async (_req, res, next) => {
  try {
    const payload = await getOrSetCache('public:landing', 20_000, async () => {
      const [grades, rawVideos, rawExams, teacherProfile] = await Promise.all([
        listGrades(),
        listVideos({ publishedOnly: true, limit: 6 }),
        listExams({ publishedOnly: true, limit: 6 }),
        getPlatformSetting<{
          title: string;
          teacherName: string;
          headline: string;
          bio: string;
          portraitUrl: string;
        }>('teacher_profile'),
      ]);

      const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));

      const latestVideos = await Promise.all(
        rawVideos.map(async (v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          gradeId: v.grade_id,
          gradeName: gradeMap.get(v.grade_id) || '',
          unitTitle: v.unit_title,
          lessonTitle: v.lesson_title,
          thumbnailUrl: await resolvePlaybackOrAssetUrl(v.thumbnail_path),
          publishedAt: v.published_at || v.created_at,
        }))
      );

      const latestExams = rawExams.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        gradeId: e.grade_id,
        gradeName: gradeMap.get(e.grade_id) || '',
        questionCount: e.question_count,
        totalPoints: e.total_points,
        durationMinutes: e.duration_minutes,
        publishedAt: e.published_at || e.created_at,
      }));

      const honorRollsByGrade = await Promise.all(
        grades.map(async (g) => {
          const board = await getGradeCumulativeLeaderboard(g.id);
          return {
            gradeId: g.id,
            gradeName: g.name_ar,
            topStudents: board.slice(0, 5),
          };
        })
      );

      return {
        teacherProfile: teacherProfile || {
          title: 'أحمد الرمادي | ملك اللغة العربية',
          teacherName: 'الأستاذ أحمد الرمادي',
          headline: 'ملك اللغة العربية — خبرة تجمع بين أصالة البيان ومنهجية التفوق الحديثة',
          bio: 'أستاذ اللغة العربية وخبير تدريس النحو والبلاغة والبيان.',
          portraitUrl: '/assets/aistudio/8c90e49c3fc2c338f135fac6a737bb9d_tplv-tiktokx-cropcenter_1080_1080_c7ae25b5.jpeg',
        },
        grades,
        latestVideos,
        latestExams,
        honorRollsByGrade,
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=20');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// التحقق العام من صحة أي شهادة عبر رقمها التسلسلي الفريد (ARM-YYYY-XXXXXXXX)
router.get('/certificates/verify/:serial', async (req, res, next) => {
  try {
    const serial = decodeURIComponent(String(req.params.serial || '')).trim().toUpperCase();
    if (!serial || serial.length < 6 || serial.length > 64) {
      res.status(400).json({ valid: false, error: 'صيغة الرقم التسلسلي غير صالحة.' });
      return;
    }

    const cert = await getCertificateBySerial(serial);
    if (!cert) {
      res.status(404).json({ valid: false, error: 'لم يتم العثور على شهادة مطابقة لهذا الرقم التسلسلي.' });
      return;
    }

    const [student, grade] = await Promise.all([
      findStudentById(cert.student_id),
      getGradeById(cert.grade_id),
    ]);

    res.json({
      valid: true,
      certificate: {
        serialNumber: cert.serial_number,
        studentName: student?.full_name || 'طالب بالمنصة',
        gradeName: grade?.name_ar || '',
        certType: cert.cert_type,
        titleAr: cert.title_ar,
        reasonAr: cert.reason_ar,
        issuedAt: cert.issued_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// بث محمي ومقيد بالصف الدراسي لملفات التخزين المحلية عند التشغيل في وضع المعاينة
router.get('/media/:bucket/:filename', async (req, res, next) => {
  try {
    const bucket = req.params.bucket as StorageBucket;
    if (bucket !== 'videos' && bucket !== 'thumbnails' && bucket !== 'question-images') {
      res.status(400).json({ error: 'حاوية ملفات غير صالحة.' });
      return;
    }

    const safeFilename = path.basename(req.params.filename);

    if (bucket === 'videos' || bucket === 'question-images') {
      const actor = await resolveOptionalMediaActor(req);
      if (!actor) {
        res.status(401).json({ error: 'يجب تسجيل الدخول لعرض هذا الملف.' });
        return;
      }
      if (actor.role === 'student') {
        const storagePathKey = `local:${bucket}/${safeFilename}`;
        const allowed =
          bucket === 'videos'
            ? await isPublishedVideoAccessibleToGrade(storagePathKey, actor.student.grade_id)
            : await isPublishedQuestionImageAccessibleToGrade(storagePathKey, actor.student.grade_id);
        if (!allowed) {
          res.status(403).json({ error: 'هذا الملف مخصص لصف دراسي آخر أو غير منشور حاليًا.' });
          return;
        }
      }
    }

    const filePath = resolveSafeLocalUploadPath(bucket, safeFilename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    if (bucket === 'videos' || bucket === 'question-images') {
      res.setHeader('Cache-Control', 'private, no-store');
    }

    const range = req.headers.range;
    if (range && bucket === 'videos') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (isNaN(start) || start >= stat.size || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
