import { Router } from 'express';
import {
  requirePasswordUpdated,
  requireStudent,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import {
  getCertificateById,
  listAllStudentAttempts,
  listBadges,
  listCertificates,
  listResultsForStudent,
  listStudentBadges,
} from '../db/assessmentsRepo.ts';
import {
  getVideoById,
  listExams,
  listStudentNotifications,
  listVideos,
  markNotificationRead,
} from '../db/contentRepo.ts';
import { getGradeById } from '../db/usersRepo.ts';
import {
  ExamEngineError,
  gradeAndSubmitAttempt,
  saveStudentAnswerForAttempt,
  startOrResumeExamAttempt,
} from '../services/examEngine.ts';
import {
  buildStudentAnalytics,
  getExamLeaderboard,
  getGradeCumulativeLeaderboard,
  getStudentCumulativeStats,
} from '../services/scoringAndRanks.ts';
import { generateArabicCertificatePdf } from '../services/certificatePdf.ts';
import { resolvePlaybackOrAssetUrl } from '../services/storageService.ts';

const router = Router();

router.use(requireStudent, requirePasswordUpdated);

router.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const [grade, stats, results, allExams, videos, badges, earnedBadges, certificates, notifications] =
      await Promise.all([
        getGradeById(student.grade_id),
        getStudentCumulativeStats(student.id, student.grade_id),
        listResultsForStudent(student.id, student.grade_id),
        listExams({ gradeId: student.grade_id, publishedOnly: true }),
        listVideos({ gradeId: student.grade_id, publishedOnly: true, limit: 6 }),
        listBadges(true),
        listStudentBadges(student.id),
        listCertificates({ studentId: student.id }),
        listStudentNotifications(student.id, student.grade_id),
      ]);

    const examTitleMap = new Map(allExams.map((e) => [e.id, e.title]));
    const latestResults = results.slice(0, 5).map((r) => ({
      ...r,
      examTitle: examTitleMap.get(r.exam_id) || 'امتحان',
    }));

    const latestVideos = await Promise.all(
      videos.map(async (v) => ({
        ...v,
        thumbnailUrl: await resolvePlaybackOrAssetUrl(v.thumbnail_path),
      }))
    );

    res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        phoneNumber: student.phone_number,
        gradeId: student.grade_id,
        gradeName: grade?.name_ar || '',
      },
      stats,
      latestResults,
      availableExams: allExams.slice(0, 6),
      latestVideos,
      badgesCount: earnedBadges.length,
      totalActiveBadges: badges.length,
      certificatesCount: certificates.length,
      unreadNotificationsCount: notifications.filter((n) => !n.is_read).length,
      notifications: notifications.slice(0, 6),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/exams', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const [exams, results, allAttempts] = await Promise.all([
      listExams({ gradeId: student.grade_id, publishedOnly: true }),
      listResultsForStudent(student.id, student.grade_id),
      listAllStudentAttempts(student.id),
    ]);

    const attemptsByExam = new Map<string, typeof allAttempts>();
    for (const a of allAttempts) {
      if (!attemptsByExam.has(a.exam_id)) attemptsByExam.set(a.exam_id, []);
      attemptsByExam.get(a.exam_id)!.push(a);
    }

    const enriched = exams.map((exam) => {
      const attempts = attemptsByExam.get(exam.id) || [];
      const activeAttempt = attempts.find((a) => a.status === 'in_progress') || null;
      const examResults = results.filter((r) => r.exam_id === exam.id);
      const bestResult = examResults.sort((a, b) => b.earned_score - a.earned_score)[0] || null;
      const attemptsUsed = attempts.length;
      const canStart =
        Boolean(activeAttempt) ||
        exam.max_attempts === null ||
        attemptsUsed < exam.max_attempts;

      return {
        ...exam,
        attemptsUsed,
        hasActiveAttempt: Boolean(activeAttempt),
        canStart,
        bestResult,
      };
    });

    res.json({ exams: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/exams/:examId/start', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const payload = await startOrResumeExamAttempt(student, req.params.examId);
    const questionsWithUrls = await Promise.all(
      payload.questions.map(async (q) => ({
        ...q,
        imageUrl: await resolvePlaybackOrAssetUrl(q.image_path),
      }))
    );
    res.json({ ...payload, questions: questionsWithUrls });
  } catch (err) {
    if (err instanceof ExamEngineError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.post('/attempts/:attemptId/answer', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const questionId = String(req.body?.questionId || '');
    const selectedOptionId = String(req.body?.selectedOptionId || '');
    if (!questionId || !selectedOptionId) {
      res.status(400).json({ error: 'بيانات الإجابة غير مكتملة.' });
      return;
    }
    const result = await saveStudentAnswerForAttempt({
      student,
      attemptId: req.params.attemptId,
      questionId,
      selectedOptionId,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof ExamEngineError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.post('/attempts/:attemptId/submit', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const outcome = await gradeAndSubmitAttempt(student, req.params.attemptId, 'submitted');
    res.json(outcome);
  } catch (err) {
    if (err instanceof ExamEngineError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get('/results', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const [results, exams, stats] = await Promise.all([
      listResultsForStudent(student.id, student.grade_id),
      listExams({ gradeId: student.grade_id }),
      getStudentCumulativeStats(student.id, student.grade_id),
    ]);
    const examMap = new Map(exams.map((e) => [e.id, e]));
    res.json({
      stats,
      results: results.map((r) => ({
        ...r,
        examTitle: examMap.get(r.exam_id)?.title || 'امتحان',
        unitTitle: examMap.get(r.exam_id)?.unit_title || '',
        lessonTitle: examMap.get(r.exam_id)?.lesson_title || '',
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/videos', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const videos = await listVideos({ gradeId: student.grade_id, publishedOnly: true });
    const enriched = await Promise.all(
      videos.map(async (v) => ({
        ...v,
        thumbnailUrl: await resolvePlaybackOrAssetUrl(v.thumbnail_path),
      }))
    );
    res.json({ videos: enriched });
  } catch (err) {
    next(err);
  }
});

router.get('/videos/:videoId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const video = await getVideoById(req.params.videoId);
    if (!video || video.grade_id !== student.grade_id || video.publish_status !== 'published') {
      res.status(404).json({ error: 'الفيديو غير متاح لصفك الدراسي.' });
      return;
    }
    const [playbackUrl, thumbnailUrl, relatedRaw] = await Promise.all([
      resolvePlaybackOrAssetUrl(video.storage_path),
      resolvePlaybackOrAssetUrl(video.thumbnail_path),
      listVideos({
        gradeId: student.grade_id,
        publishedOnly: true,
        unitTitle: video.unit_title,
        lessonTitle: video.lesson_title,
      }),
    ]);

    const relatedVideos = await Promise.all(
      relatedRaw
        .filter((r) => r.id !== video.id)
        .map(async (r) => ({
          ...r,
          thumbnailUrl: await resolvePlaybackOrAssetUrl(r.thumbnail_path),
        }))
    );

    res.json({
      video: {
        ...video,
        playbackUrl,
        thumbnailUrl,
      },
      relatedVideos,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/leaderboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const examId = typeof req.query.examId === 'string' ? req.query.examId : '';
    const [cumulativeBoard, exams] = await Promise.all([
      getGradeCumulativeLeaderboard(student.grade_id),
      listExams({ gradeId: student.grade_id, publishedOnly: true }),
    ]);

    let examBoard: Awaited<ReturnType<typeof getExamLeaderboard>> = [];
    if (examId) {
      const ownsGrade = exams.some((e) => e.id === examId);
      if (ownsGrade) {
        examBoard = await getExamLeaderboard(student.grade_id, examId);
      }
    }

    res.json({
      gradeId: student.grade_id,
      cumulativeBoard,
      exams: exams.map((e) => ({ id: e.id, title: e.title })),
      examBoard,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/badges', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const [allBadges, earned] = await Promise.all([
      listBadges(true),
      listStudentBadges(student.id),
    ]);
    const earnedMap = new Map(earned.map((e) => [e.badge_id, e]));
    res.json({
      badges: allBadges.map((b) => ({
        ...b,
        earned: earnedMap.has(b.id),
        earnedAt: earnedMap.get(b.id)?.earned_at || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/certificates', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const certificates = await listCertificates({ studentId: student.id });
    res.json({ certificates });
  } catch (err) {
    next(err);
  }
});

router.get('/certificates/:certId/pdf', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const cert = await getCertificateById(req.params.certId);
    if (!cert || cert.student_id !== student.id) {
      res.status(404).json({ error: 'الشهادة غير موجودة.' });
      return;
    }
    const grade = await getGradeById(student.grade_id);
    const pdfBytes = await generateArabicCertificatePdf({
      certificate: cert,
      student,
      grade: grade!,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="certificate-${cert.serial_number}.pdf"`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const analytics = await buildStudentAnalytics(student.id, student.grade_id);
    res.json({ analytics });
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const notifications = await listStudentNotifications(student.id, student.grade_id);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/read', async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    await markNotificationRead(req.params.id, student.id, student.grade_id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
