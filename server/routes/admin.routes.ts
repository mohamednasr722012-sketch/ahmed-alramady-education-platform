import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { isSupabaseConfigured, env } from '../config/env.ts';
import { createHashedAdminPasscode, requireTeacherAdmin, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  issueCertificateIfNotExists,
  listBadges,
  listCertificates,
  listResultsByGradeOrExam,
  listResultsForStudent,
  listResultsForStudentIds,
  createCustomBadge,
  getCertificateById,
} from '../db/assessmentsRepo.ts';
import {
  cancelSchedule,
  createExamWithQuestions,
  createNotification,
  createVideo,
  deleteExam,
  deleteVideo,
  getExamById,
  getExamQuestions,
  getVideoById,
  listAllNotificationsAdmin,
  listExams,
  listSchedules,
  listVideos,
  updateExam,
  updateVideo,
  upsertSchedule,
  type QuestionInput,
} from '../db/contentRepo.ts';
import {
  DuplicateFieldError,
  findStudentById,
  getGradeById,
  getPlatformOverviewStats,
  getPlatformSetting,
  insertAuditLog,
  listAuditLogs,
  listGrades,
  listStudents,
  listStudentsPaginated,
  revokeAllStudentSessions,
  setPlatformSetting,
  setStudentPassword,
  updateGrade,
  updateStudent,
} from '../db/usersRepo.ts';
import {
  generateTemporaryPassword,
  hashPassword,
  isValidPhone,
  normalizeArabicName,
  normalizePhone,
  validateQuadName,
} from '../services/password.ts';
import {
  buildStudentAnalytics,
  getExamLeaderboard,
  getGradeCumulativeLeaderboard,
  getStudentCumulativeStats,
} from '../services/scoringAndRanks.ts';
import { generateArabicCertificatePdf } from '../services/certificatePdf.ts';
import {
  deleteFileFromStorage,
  resolvePlaybackOrAssetUrl,
  uploadFileToStorage,
} from '../services/storageService.ts';
import { runDuePublicationsOnce } from '../jobs/publicationScheduler.ts';
import { parseVideoPlayback } from '../../src/lib/videoUrl.ts';
import { clearAllServerCache } from '../services/cache.ts';

const router = Router();
router.use(requireTeacherAdmin);
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        clearAllServerCache();
      }
    });
  }
  next();
});

const TMP_UPLOAD_DIR = path.resolve(process.cwd(), '.data', 'tmp_uploads');
const uploadStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
    cb(null, TMP_UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.tmp';
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB max per request
  },
});

async function removeTempFiles(...files: Array<Express.Multer.File | undefined>) {
  for (const f of files) {
    if (f?.path) {
      await fs.promises.unlink(f.path).catch(() => undefined);
    }
  }
}

function adminIp(req: AuthenticatedRequest): string | null {
  return req.ip || null;
}

// 1. نظرة عامة وإحصائيات المنصة (مجمّعة بكفاءة على مستوى قاعدة البيانات)
router.get('/overview', async (_req, res, next) => {
  try {
    const grades = await listGrades();
    const [stats, auditLogs] = await Promise.all([
      getPlatformOverviewStats(grades),
      listAuditLogs(15),
    ]);

    res.json({
      totals: stats.totals,
      perGradeStats: stats.perGradeStats,
      recentAuditLogs: auditLogs,
    });
  } catch (err) {
    next(err);
  }
});

// 2. إدارة الطلاب (مع Pagination حقيقية وجلب نتائج الصفحة فقط)
router.get('/students', async (req, res, next) => {
  try {
    const gradeId = req.query.gradeId ? Number(req.query.gradeId) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const [{ students: paged, total }, grades] = await Promise.all([
      listStudentsPaginated({ gradeId, search, page, pageSize }),
      listGrades(),
    ]);

    const pagedIds = paged.map((s) => s.id);
    const pagedResults = await listResultsForStudentIds(pagedIds);

    const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));
    const resultsByStudent = new Map<string, typeof pagedResults>();
    for (const r of pagedResults) {
      if (!resultsByStudent.has(r.student_id)) resultsByStudent.set(r.student_id, []);
      resultsByStudent.get(r.student_id)!.push(r);
    }

    const rows = paged.map((s) => {
      const sResults = resultsByStudent.get(s.id) || [];
      const bestByExam = new Map<string, (typeof sResults)[0]>();
      for (const r of sResults) {
        const cur = bestByExam.get(r.exam_id);
        if (!cur || r.earned_score > cur.earned_score) bestByExam.set(r.exam_id, r);
      }
      const effective = Array.from(bestByExam.values());
      const cumulativeEarned = Number(effective.reduce((sum, r) => sum + r.earned_score, 0).toFixed(2));
      const cumulativePossible = Number(effective.reduce((sum, r) => sum + r.max_score, 0).toFixed(2));
      const averagePercentage =
        cumulativePossible > 0
          ? Number(((cumulativeEarned / cumulativePossible) * 100).toFixed(1))
          : 0;

      return {
        id: s.id,
        fullName: s.full_name,
        phoneNumber: s.phone_number,
        gradeId: s.grade_id,
        gradeName: gradeMap.get(s.grade_id) || '',
        status: s.status,
        mustChangePassword: s.must_change_password,
        createdAt: s.created_at,
        lastActivityAt: s.last_activity_at,
        completedExams: effective.length,
        cumulativeEarned,
        cumulativePossible,
        averagePercentage,
      };
    });

    res.json({ students: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.patch('/students/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const studentId = req.params.id;
    const existing = await findStudentById(studentId);
    if (!existing) {
      res.status(404).json({ error: 'الطالب غير موجود.' });
      return;
    }

    const updates: Parameters<typeof updateStudent>[1] = {};
    if (req.body?.fullName !== undefined) {
      const fullName = String(req.body.fullName).trim().replace(/\s+/g, ' ');
      const nameCheck = validateQuadName(fullName);
      if (!nameCheck.valid) {
        res.status(400).json({ error: nameCheck.error || 'يجب أن يكون الاسم رباعيًا صحيحًا.' });
        return;
      }
      updates.fullName = fullName;
      updates.normalizedFullName = normalizeArabicName(fullName);
    }
    if (req.body?.phoneNumber !== undefined) {
      const phone = String(req.body.phoneNumber).trim();
      if (!isValidPhone(phone)) {
        res.status(400).json({ error: 'رقم الهاتف غير صالح.' });
        return;
      }
      updates.phoneNumber = normalizePhone(phone);
    }
    if (req.body?.gradeId !== undefined) {
      const gradeId = Number(req.body.gradeId);
      const grade = await getGradeById(gradeId);
      if (!grade) {
        res.status(400).json({ error: 'الصف غير صالح.' });
        return;
      }
      updates.gradeId = gradeId;
    }
    if (req.body?.status === 'active' || req.body?.status === 'suspended') {
      updates.status = req.body.status;
      if (req.body.status === 'suspended') {
        await revokeAllStudentSessions(studentId);
      }
    }

    const updated = await updateStudent(studentId, updates);
    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'student_updated',
      targetType: 'student',
      targetId: studentId,
      metadata: { fields: Object.keys(updates), status: updated?.status },
      ipAddress: adminIp(req),
    });
    res.json({ student: updated });
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// تعيين كلمة مرور مؤقتة جديدة للطالب عند نسيانها (دون الاطلاع على كلمة المرور القديمة)
router.post('/students/:id/reset-password', async (req: AuthenticatedRequest, res, next) => {
  try {
    const studentId = req.params.id;
    const student = await findStudentById(studentId);
    if (!student) {
      res.status(404).json({ error: 'الطالب غير موجود.' });
      return;
    }

    const autoGenerate = Boolean(req.body?.autoGenerate);
    const customPassword = String(req.body?.newPassword || '').trim();
    const tempPassword = autoGenerate ? generateTemporaryPassword(10) : customPassword;

    if (tempPassword.length < 6) {
      res.status(400).json({ error: 'يجب أن تتكون كلمة المرور المؤقتة من 6 أحرف على الأقل.' });
      return;
    }

    await setStudentPassword(student.id, hashPassword(tempPassword), true);
    await revokeAllStudentSessions(student.id);

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'student_password_reset',
      targetType: 'student',
      targetId: student.id,
      metadata: { studentName: student.full_name, autoGenerated: autoGenerate },
      ipAddress: adminIp(req),
    });

    // تعاد كلمة المرور المؤقتة مرة واحدة فقط للمدرس ليسلمها للطالب بأمان
    res.json({
      temporaryPassword: tempPassword,
      mustChangePassword: true,
      studentName: student.full_name,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/students/:id/details', async (req, res, next) => {
  try {
    const student = await findStudentById(req.params.id);
    if (!student) {
      res.status(404).json({ error: 'الطالب غير موجود.' });
      return;
    }
    const [grade, stats, results, analytics, certificates] = await Promise.all([
      getGradeById(student.grade_id),
      getStudentCumulativeStats(student.id, student.grade_id),
      listResultsForStudent(student.id, student.grade_id),
      buildStudentAnalytics(student.id, student.grade_id),
      listCertificates({ studentId: student.id }),
    ]);

    res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        phoneNumber: student.phone_number,
        gradeId: student.grade_id,
        gradeName: grade?.name_ar || '',
        status: student.status,
        mustChangePassword: student.must_change_password,
        createdAt: student.created_at,
        lastActivityAt: student.last_activity_at,
      },
      stats,
      results,
      analytics,
      certificates,
    });
  } catch (err) {
    next(err);
  }
});

// 3. إدارة الصفوف
router.get('/grades', async (_req, res, next) => {
  try {
    const grades = await listGrades();
    res.json({ grades });
  } catch (err) {
    next(err);
  }
});

router.patch('/grades/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const gradeId = Number(req.params.id);
    const nameAr = req.body?.name_ar !== undefined ? String(req.body.name_ar).trim() : undefined;
    if (nameAr !== undefined && !nameAr) {
      res.status(400).json({ error: 'اسم الصف الدراسي مطلوب.' });
      return;
    }
    const updated = await updateGrade(gradeId, {
      name_ar: nameAr,
      description_ar:
        req.body?.description_ar !== undefined ? String(req.body.description_ar).trim() : undefined,
      is_active: req.body?.is_active,
    });
    if (!updated) {
      res.status(404).json({ error: 'الصف غير موجود.' });
      return;
    }
    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'grade_updated',
      targetType: 'grade',
      targetId: String(gradeId),
      ipAddress: adminIp(req),
    });
    res.json({ grade: updated });
  } catch (err) {
    next(err);
  }
});

// 4 & 5. إدارة وإنشاء الامتحانات المستقلة (بلا بنك أسئلة)
router.get('/exams', async (req, res, next) => {
  try {
    const gradeId = req.query.gradeId ? Number(req.query.gradeId) : undefined;
    const [exams, grades, results] = await Promise.all([
      listExams({ gradeId }),
      listGrades(),
      listResultsByGradeOrExam({ gradeId }),
    ]);
    const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));

    const enriched = exams.map((e) => {
      const eResults = results.filter((r) => r.exam_id === e.id);
      const uniqueParticipants = new Set(eResults.map((r) => r.student_id)).size;
      return {
        ...e,
        gradeName: gradeMap.get(e.grade_id) || '',
        participantsCount: uniqueParticipants,
        submissionsCount: eResults.length,
      };
    });
    res.json({ exams: enriched });
  } catch (err) {
    next(err);
  }
});

router.get('/exams/:id', async (req, res, next) => {
  try {
    const exam = await getExamById(req.params.id);
    if (!exam) {
      res.status(404).json({ error: 'الامتحان غير موجود.' });
      return;
    }
    const questions = await getExamQuestions(exam.id, { includeCorrectAnswers: true });
    const questionsWithUrls = await Promise.all(
      questions.map(async (q) => ({
        ...q,
        imageUrl: await resolvePlaybackOrAssetUrl(q.image_path),
      }))
    );
    res.json({ exam, questions: questionsWithUrls });
  } catch (err) {
    next(err);
  }
});

router.post('/exams', async (req: AuthenticatedRequest, res, next) => {
  try {
    const gradeId = Number(req.body?.gradeId);
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const unitTitle = String(req.body?.unitTitle || '').trim();
    const lessonTitle = String(req.body?.lessonTitle || '').trim();
    const pointsPerQuestion = Number(req.body?.pointsPerQuestion || 10);
    const durationMinutes = Number(req.body?.durationMinutes || 10);
    const maxAttemptsRaw = req.body?.maxAttempts;
    const maxAttempts =
      maxAttemptsRaw === null || maxAttemptsRaw === '' || maxAttemptsRaw === 'unlimited'
        ? null
        : Number(maxAttemptsRaw);
    const opensAt = req.body?.opensAt ? new Date(req.body.opensAt).toISOString() : null;
    const closesAt = req.body?.closesAt ? new Date(req.body.closesAt).toISOString() : null;
    const publishMode = String(req.body?.publishMode || 'now'); // now | draft | scheduled
    const scheduledFor = req.body?.scheduledFor ? new Date(req.body.scheduledFor).toISOString() : null;
    const timezone = String(req.body?.timezone || 'Africa/Cairo');
    const questions = (req.body?.questions || []) as QuestionInput[];

    if (!title) {
      res.status(400).json({ error: 'يرجى إدخال عنوان الامتحان.' });
      return;
    }
    if (opensAt && closesAt && new Date(closesAt).getTime() <= new Date(opensAt).getTime()) {
      res.status(400).json({ error: 'يجب أن يكون موعد إغلاق الامتحان بعد موعد الفتح.' });
      return;
    }
    if (publishMode === 'scheduled' && !scheduledFor) {
      res.status(400).json({ error: 'يرجى تحديد موعد النشر المجدول.' });
      return;
    }
    const grade = await getGradeById(gradeId);
    if (!grade) {
      res.status(400).json({ error: 'الصف الدراسي غير صالح.' });
      return;
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'يجب إضافة سؤال واحد على الأقل داخل الامتحان.' });
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText?.trim()) {
        res.status(400).json({ error: `نص السؤال رقم ${i + 1} مطلوب.` });
        return;
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        res.status(400).json({ error: `السؤال رقم ${i + 1} يجب أن يحتوي على خيارين على الأقل.` });
        return;
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        res.status(400).json({ error: `السؤال رقم ${i + 1} يجب أن يحتوي على إجابة صحيحة واحدة.` });
        return;
      }
      if (q.options.some((o) => !o.optionText?.trim())) {
        res.status(400).json({ error: `يرجى ملء نص كل الاختيارات في السؤال رقم ${i + 1}.` });
        return;
      }
    }

    const publishStatus =
      publishMode === 'now' ? 'published' : publishMode === 'scheduled' ? 'scheduled' : 'draft';
    const publishedAt = publishMode === 'now' ? new Date().toISOString() : null;

    const created = await createExamWithQuestions({
      gradeId,
      title,
      description,
      unitTitle,
      lessonTitle,
      pointsPerQuestion,
      durationMinutes,
      maxAttempts,
      opensAt,
      closesAt,
      publishStatus,
      publishedAt,
      questions,
    });

    if (publishMode === 'scheduled' && scheduledFor) {
      await upsertSchedule({
        targetType: 'exam',
        targetId: created.id,
        gradeId,
        scheduledForUtc: scheduledFor,
        timezone,
      });
    } else if (publishMode === 'now') {
      await createNotification({
        gradeId,
        type: 'exam_published',
        titleAr: `امتحان جديد: ${created.title}`,
        bodyAr: `تم نشر امتحان «${created.title}» (${created.duration_minutes} دقيقة · ${created.total_points} درجة).`,
        linkPath: '/student/exams',
      });
    }

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'exam_created',
      targetType: 'exam',
      targetId: created.id,
      metadata: { title: created.title, gradeId, publishStatus, questionCount: created.question_count },
      ipAddress: adminIp(req),
    });

    res.status(201).json({ exam: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/exams/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const examId = req.params.id;
    const existing = await getExamById(examId);
    if (!existing) {
      res.status(404).json({ error: 'الامتحان غير موجود.' });
      return;
    }

    const nextStatus = req.body?.publish_status as typeof existing.publish_status | undefined;
    const updated = await updateExam(
      examId,
      {
        title: req.body?.title,
        description: req.body?.description,
        unit_title: req.body?.unitTitle,
        lesson_title: req.body?.lessonTitle,
        duration_minutes: req.body?.durationMinutes ? Number(req.body.durationMinutes) : undefined,
        max_attempts:
          req.body?.maxAttempts === 'unlimited'
            ? null
            : req.body?.maxAttempts !== undefined
              ? Number(req.body.maxAttempts)
              : undefined,
        opens_at: req.body?.opensAt !== undefined ? (req.body.opensAt ? new Date(req.body.opensAt).toISOString() : null) : undefined,
        closes_at: req.body?.closesAt !== undefined ? (req.body.closesAt ? new Date(req.body.closesAt).toISOString() : null) : undefined,
        publish_status: nextStatus,
        published_at:
          nextStatus === 'published' && !existing.published_at ? new Date().toISOString() : undefined,
      },
      Array.isArray(req.body?.questions) ? req.body.questions : undefined
    );

    if (nextStatus === 'published' && existing.publish_status !== 'published' && updated) {
      await createNotification({
        gradeId: updated.grade_id,
        type: 'exam_published',
        titleAr: `امتحان جديد: ${updated.title}`,
        bodyAr: `تم فتح امتحان «${updated.title}» للطلاب.`,
        linkPath: '/student/exams',
      });
    }

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'exam_updated',
      targetType: 'exam',
      targetId: examId,
      metadata: { publish_status: updated?.publish_status },
      ipAddress: adminIp(req),
    });

    res.json({ exam: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/exams/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const ok = await deleteExam(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'الامتحان غير موجود.' });
      return;
    }
    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'exam_deleted',
      targetType: 'exam',
      targetId: req.params.id,
      ipAddress: adminIp(req),
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// رفع صورة سؤال
router.post('/uploads/question-image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'لم يتم إرفاق صورة.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ error: 'الملف المرفوع يجب أن يكون صورة صالحة.' });
      return;
    }
    const stored = await uploadFileToStorage({
      bucket: 'question-images',
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      filePath: req.file.path,
    });
    const url = await resolvePlaybackOrAssetUrl(stored.storagePath);
    res.status(201).json({ storagePath: stored.storagePath, url });
  } catch (err) {
    next(err);
  } finally {
    await removeTempFiles(req.file);
  }
});

// 6. النتائج
router.get('/results', async (req, res, next) => {
  try {
    const gradeId = req.query.gradeId ? Number(req.query.gradeId) : undefined;
    const examId = typeof req.query.examId === 'string' && req.query.examId ? req.query.examId : undefined;
    const [results, students, exams, grades] = await Promise.all([
      listResultsByGradeOrExam({ gradeId, examId }),
      listStudents({ gradeId }),
      listExams({ gradeId }),
      listGrades(),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const examMap = new Map(exams.map((e) => [e.id, e]));
    const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));

    res.json({
      results: results.map((r) => ({
        ...r,
        studentName: studentMap.get(r.student_id)?.full_name || 'طالب',
        examTitle: examMap.get(r.exam_id)?.title || 'امتحان',
        gradeName: gradeMap.get(r.grade_id) || '',
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 7. إدارة الفيديوهات والرفع المباشر
router.get('/videos', async (req, res, next) => {
  try {
    const gradeId = req.query.gradeId ? Number(req.query.gradeId) : undefined;
    const [videos, grades] = await Promise.all([listVideos({ gradeId }), listGrades()]);
    const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));

    const enriched = await Promise.all(
      videos.map(async (v) => ({
        ...v,
        gradeName: gradeMap.get(v.grade_id) || '',
        playbackUrl: await resolvePlaybackOrAssetUrl(v.storage_path),
        thumbnailUrl: await resolvePlaybackOrAssetUrl(v.thumbnail_path),
      }))
    );
    res.json({ videos: enriched });
  } catch (err) {
    next(err);
  }
});

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function isAcceptedVideoFile(file: Express.Multer.File): boolean {
  if (file.mimetype.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(file.originalname || '');
}

const uploadVideoMiddleware = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

router.post(
  '/videos',
  (req, res, next) => {
    uploadVideoMiddleware(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error:
              'حجم ملف الفيديو يتجاوز الحد المسموح للرفع المباشر؛ استخدم تبويب (رابط مجاني بلا حدود) عبر يوتيوب أو جوجل درايف.',
          });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر قراءة الملف المرفوع.' });
        return;
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res, next) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const videoFile = files?.video?.[0];
    const thumbFile = files?.thumbnail?.[0];
    try {

      const gradeId = Number(req.body?.gradeId);
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const unitTitle = String(req.body?.unitTitle || '').trim();
      const lessonTitle = String(req.body?.lessonTitle || '').trim();
      const publishMode = String(req.body?.publishMode || 'now'); // now | draft | scheduled
      const scheduledFor = req.body?.scheduledFor ? new Date(req.body.scheduledFor).toISOString() : null;
      const timezone = String(req.body?.timezone || 'Africa/Cairo');
      const videoUrlRaw = String(req.body?.videoUrl || '').trim();
      const customThumbUrl = String(req.body?.thumbnailUrl || '').trim();

      if (!title || !unitTitle || !lessonTitle) {
        res.status(400).json({ error: 'عنوان الفيديو والوحدة والدرس حقول مطلوبة.' });
        return;
      }
      const grade = await getGradeById(gradeId);
      if (!grade) {
        res.status(400).json({ error: 'الصف الدراسي غير صالح.' });
        return;
      }

      let storagePath = '';
      let fileSizeBytes: number | null = null;
      let autoThumbnail: string | null = null;

      if (videoUrlRaw) {
        if (!isValidHttpUrl(videoUrlRaw)) {
          res.status(400).json({ error: 'يرجى إدخال رابط فيديو صحيح يبدأ بـ https:// أو http://.' });
          return;
        }
        storagePath = videoUrlRaw;
        autoThumbnail = parseVideoPlayback(videoUrlRaw)?.autoThumbnailUrl || null;
      } else if (videoFile) {
        if (!isAcceptedVideoFile(videoFile)) {
          res.status(400).json({ error: 'صيغة الفيديو غير مدعومة (استخدم MP4 أو WebM أو MOV أو رابط يوتيوب).' });
          return;
        }
        const uploadedVideo = await uploadFileToStorage({
          bucket: 'videos',
          originalName: videoFile.originalname,
          mimeType: videoFile.mimetype || 'video/mp4',
          filePath: videoFile.path,
        });
        storagePath = uploadedVideo.storagePath;
        fileSizeBytes = uploadedVideo.fileSizeBytes;
      } else {
        res.status(400).json({ error: 'يرجى لصق رابط الفيديو (يوتيوب / جوجل درايف / مباشر) أو اختيار ملف فيديو.' });
        return;
      }

      let thumbnailPath: string | null = autoThumbnail;
      if (thumbFile && thumbFile.mimetype.startsWith('image/')) {
        const uploadedThumb = await uploadFileToStorage({
          bucket: 'thumbnails',
          originalName: thumbFile.originalname,
          mimeType: thumbFile.mimetype,
          filePath: thumbFile.path,
        });
        thumbnailPath = uploadedThumb.storagePath;
      } else if (customThumbUrl && isValidHttpUrl(customThumbUrl)) {
        thumbnailPath = customThumbUrl;
      }

      const publishStatus =
        publishMode === 'now' ? 'published' : publishMode === 'scheduled' ? 'scheduled' : 'draft';
      const publishedAt = publishMode === 'now' ? new Date().toISOString() : null;

      const created = await createVideo({
        gradeId,
        unitTitle,
        lessonTitle,
        title,
        description,
        storagePath,
        thumbnailPath,
        fileSizeBytes,
        publishStatus,
        publishedAt,
      });

      if (publishMode === 'scheduled' && scheduledFor) {
        await upsertSchedule({
          targetType: 'video',
          targetId: created.id,
          gradeId,
          scheduledForUtc: scheduledFor,
          timezone,
        });
      } else if (publishMode === 'now') {
        await createNotification({
          gradeId,
          type: 'video_published',
          titleAr: `فيديو جديد: ${created.title}`,
          bodyAr: `تم رفع درس «${created.title}» في ${created.unit_title} — ${created.lesson_title}.`,
          linkPath: `/student/videos/${created.id}`,
        });
      }

      await insertAuditLog({
        actorRole: 'teacher_admin',
        actorId: 'admin',
        action: 'video_uploaded',
        targetType: 'video',
        targetId: created.id,
        metadata: {
          title: created.title,
          gradeId,
          fileSizeBytes,
          source: videoUrlRaw ? 'external_link' : 'direct_upload',
        },
        ipAddress: adminIp(req),
      });

      res.status(201).json({
        video: {
          ...created,
          playbackUrl: await resolvePlaybackOrAssetUrl(created.storage_path),
          thumbnailUrl: await resolvePlaybackOrAssetUrl(created.thumbnail_path),
        },
      });
    } catch (err) {
      next(err);
    } finally {
      await removeTempFiles(videoFile, thumbFile);
    }
  }
);

router.patch('/videos/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await getVideoById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'الفيديو غير موجود.' });
      return;
    }

    const nextStatus = req.body?.publish_status as typeof existing.publish_status | undefined;
    const updated = await updateVideo(existing.id, {
      grade_id: req.body?.gradeId ? Number(req.body.gradeId) : undefined,
      unit_title: req.body?.unitTitle,
      lesson_title: req.body?.lessonTitle,
      title: req.body?.title,
      description: req.body?.description,
      publish_status: nextStatus,
      published_at:
        nextStatus === 'published' && !existing.published_at ? new Date().toISOString() : undefined,
    });

    if (nextStatus === 'published' && existing.publish_status !== 'published' && updated) {
      await createNotification({
        gradeId: updated.grade_id,
        type: 'video_published',
        titleAr: `فيديو جديد: ${updated.title}`,
        bodyAr: `تم نشر درس «${updated.title}».`,
        linkPath: `/student/videos/${updated.id}`,
      });
    }

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'video_updated',
      targetType: 'video',
      targetId: existing.id,
      ipAddress: adminIp(req),
    });

    res.json({ video: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/videos/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const existing = await getVideoById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'الفيديو غير موجود.' });
      return;
    }
    await deleteFileFromStorage(existing.storage_path);
    await deleteFileFromStorage(existing.thumbnail_path);
    await deleteVideo(existing.id);

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'video_deleted',
      targetType: 'video',
      targetId: existing.id,
      ipAddress: adminIp(req),
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 8. جدولة النشر
router.get('/schedules', async (_req, res, next) => {
  try {
    const [schedules, exams, videos, grades] = await Promise.all([
      listSchedules(),
      listExams(),
      listVideos(),
      listGrades(),
    ]);
    const examMap = new Map(exams.map((e) => [e.id, e.title]));
    const videoMap = new Map(videos.map((v) => [v.id, v.title]));
    const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));

    res.json({
      schedules: schedules.map((s) => ({
        ...s,
        targetTitle:
          s.target_type === 'exam'
            ? examMap.get(s.target_id) || 'امتحان'
            : videoMap.get(s.target_id) || 'فيديو',
        gradeName: gradeMap.get(s.grade_id) || '',
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/schedules', async (req: AuthenticatedRequest, res, next) => {
  try {
    const targetType = req.body?.targetType as 'exam' | 'video';
    const targetId = String(req.body?.targetId || '');
    const scheduledForUtc = new Date(req.body?.scheduledFor).toISOString();
    const timezone = String(req.body?.timezone || 'Africa/Cairo');

    let gradeId = 0;
    if (targetType === 'exam') {
      const ex = await getExamById(targetId);
      if (!ex) {
        res.status(404).json({ error: 'الامتحان غير موجود.' });
        return;
      }
      gradeId = ex.grade_id;
      await updateExam(ex.id, { publish_status: 'scheduled' });
    } else if (targetType === 'video') {
      const vid = await getVideoById(targetId);
      if (!vid) {
        res.status(404).json({ error: 'الفيديو غير موجود.' });
        return;
      }
      gradeId = vid.grade_id;
      await updateVideo(vid.id, { publish_status: 'scheduled' });
    } else {
      res.status(400).json({ error: 'نوع العنصر غير صالح.' });
      return;
    }

    const schedule = await upsertSchedule({
      targetType,
      targetId,
      gradeId,
      scheduledForUtc,
      timezone,
    });

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'publication_scheduled',
      targetType,
      targetId,
      metadata: { scheduledForUtc, timezone },
      ipAddress: adminIp(req),
    });

    res.status(201).json({ schedule });
  } catch (err) {
    next(err);
  }
});

router.post('/schedules/:id/cancel', async (req, res, next) => {
  try {
    await cancelSchedule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/schedules/run-due', async (_req, res, next) => {
  try {
    const out = await runDuePublicationsOnce();
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// 9. لوحات الشرف
router.get('/leaderboards', async (req, res, next) => {
  try {
    const gradeId = Number(req.query.gradeId || 1);
    const examId = typeof req.query.examId === 'string' ? req.query.examId : '';
    const [cumulativeBoard, exams] = await Promise.all([
      getGradeCumulativeLeaderboard(gradeId),
      listExams({ gradeId }),
    ]);
    const examBoard = examId ? await getExamLeaderboard(gradeId, examId) : [];
    res.json({ gradeId, cumulativeBoard, exams, examBoard });
  } catch (err) {
    next(err);
  }
});

// 10. الشارات
router.get('/badges', async (_req, res, next) => {
  try {
    const badges = await listBadges(false);
    res.json({ badges });
  } catch (err) {
    next(err);
  }
});

router.post('/badges', async (req: AuthenticatedRequest, res, next) => {
  try {
    const titleAr = String(req.body?.titleAr || '').trim();
    const descriptionAr = String(req.body?.descriptionAr || '').trim();
    const tier = req.body?.tier as 'gold' | 'silver' | 'bronze';
    const ruleType = req.body?.ruleType;
    const ruleThreshold = Number(req.body?.ruleThreshold || 90);
    const secondaryThreshold = req.body?.secondaryThreshold
      ? Number(req.body.secondaryThreshold)
      : null;

    if (!titleAr || !descriptionAr) {
      res.status(400).json({ error: 'اسم الشارة ووصفها مطلوبان.' });
      return;
    }

    const code = `custom_${Date.now()}`;
    const badge = await createCustomBadge({
      code,
      titleAr,
      descriptionAr,
      tier: tier || 'gold',
      ruleType,
      ruleThreshold,
      secondaryThreshold,
    });

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'badge_created',
      targetType: 'badge',
      targetId: badge.id,
      metadata: { titleAr, ruleType, ruleThreshold },
      ipAddress: adminIp(req),
    });

    res.status(201).json({ badge });
  } catch (err) {
    next(err);
  }
});

// 11. الشهادات
router.get('/certificates', async (req, res, next) => {
  try {
    const gradeId = req.query.gradeId ? Number(req.query.gradeId) : undefined;
    const [certificates, students, grades, rules] = await Promise.all([
      listCertificates({ gradeId }),
      listStudents({ gradeId }),
      listGrades(),
      getPlatformSetting('certificate_rules'),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const gradeMap = new Map(grades.map((g) => [g.id, g.name_ar]));

    res.json({
      rules: rules || {
        autoIssueOnExamCompletion: true,
        excellenceMinPercentage: 90,
        autoIssueExcellence: true,
        autoIssueTopOfGrade: true,
      },
      certificates: certificates.map((c) => ({
        ...c,
        studentName: studentMap.get(c.student_id)?.full_name || 'طالب',
        gradeName: gradeMap.get(c.grade_id) || '',
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/certificates/issue', async (req: AuthenticatedRequest, res, next) => {
  try {
    const studentId = String(req.body?.studentId || '');
    const certType = req.body?.certType || 'appreciation';
    const titleAr = String(req.body?.titleAr || 'شهادة تقدير').trim();
    const reasonAr = String(req.body?.reasonAr || '').trim();
    const student = await findStudentById(studentId);
    if (!student) {
      res.status(404).json({ error: 'الطالب غير موجود.' });
      return;
    }
    if (!reasonAr) {
      res.status(400).json({ error: 'يرجى كتابة سبب منح الشهادة.' });
      return;
    }

    const referenceKey = `manual:${certType}:${reasonAr.slice(0, 40)}`;
    const outcome = await issueCertificateIfNotExists({
      studentId: student.id,
      gradeId: student.grade_id,
      certType,
      titleAr,
      reasonAr,
      referenceKey,
    });

    if (outcome.issued) {
      await createNotification({
        studentId: student.id,
        gradeId: student.grade_id,
        type: 'certificate_issued',
        titleAr: `صدرت لك ${titleAr}`,
        bodyAr: `تهانينا! أصدر لك الأستاذ ${titleAr} (${outcome.certificate.serial_number}).`,
        linkPath: '/student/certificates',
      });
      await insertAuditLog({
        actorRole: 'teacher_admin',
        actorId: 'admin',
        action: 'certificate_issued',
        targetType: 'certificate',
        targetId: outcome.certificate.id,
        metadata: { studentId, certType },
        ipAddress: adminIp(req),
      });
    }

    res.status(201).json(outcome);
  } catch (err) {
    next(err);
  }
});

router.put('/certificates/rules', async (req, res, next) => {
  try {
    const rules = {
      autoIssueOnExamCompletion: Boolean(req.body?.autoIssueOnExamCompletion),
      excellenceMinPercentage: Number(req.body?.excellenceMinPercentage || 90),
      autoIssueExcellence: Boolean(req.body?.autoIssueExcellence),
      autoIssueTopOfGrade: Boolean(req.body?.autoIssueTopOfGrade),
    };
    await setPlatformSetting('certificate_rules', rules);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

router.get('/certificates/:certId/pdf', async (req, res, next) => {
  try {
    const cert = await getCertificateById(req.params.certId);
    if (!cert) {
      res.status(404).json({ error: 'الشهادة غير موجودة.' });
      return;
    }
    const student = await findStudentById(cert.student_id);
    const grade = await getGradeById(cert.grade_id);
    if (!student || !grade) {
      res.status(404).json({ error: 'بيانات الطالب غير مكتملة.' });
      return;
    }
    const pdfBytes = await generateArabicCertificatePdf({ certificate: cert, student, grade });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${cert.serial_number}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

// 12. تحليل الطلاب
router.get('/analytics/student/:studentId', async (req, res, next) => {
  try {
    const student = await findStudentById(req.params.studentId);
    if (!student) {
      res.status(404).json({ error: 'الطالب غير موجود.' });
      return;
    }
    const [analytics, stats] = await Promise.all([
      buildStudentAnalytics(student.id, student.grade_id),
      getStudentCumulativeStats(student.id, student.grade_id),
    ]);
    res.json({ student, stats, analytics });
  } catch (err) {
    next(err);
  }
});

// 13. الإشعارات
router.get('/notifications', async (_req, res, next) => {
  try {
    const notifications = await listAllNotificationsAdmin(60);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications', async (req: AuthenticatedRequest, res, next) => {
  try {
    const gradeId = req.body?.gradeId ? Number(req.body.gradeId) : null;
    const studentId = req.body?.studentId ? String(req.body.studentId) : null;
    const titleAr = String(req.body?.titleAr || '').trim();
    const bodyAr = String(req.body?.bodyAr || '').trim();
    if (!titleAr || !bodyAr) {
      res.status(400).json({ error: 'عنوان الإشعار ونصه مطلوبان.' });
      return;
    }
    const notif = await createNotification({
      gradeId,
      studentId,
      type: 'admin_announcement',
      titleAr,
      bodyAr,
      linkPath: '/student/notifications',
    });
    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'notification_sent',
      targetType: 'notification',
      targetId: notif.id,
      metadata: { gradeId, studentId },
      ipAddress: adminIp(req),
    });
    res.status(201).json({ notification: notif });
  } catch (err) {
    next(err);
  }
});

// 14 & 15. إعدادات المنصة وسجل التدقيق وحالة الاتصال بـ Supabase
router.get('/settings', async (_req, res, next) => {
  try {
    const [teacherProfile, auditLogs] = await Promise.all([
      getPlatformSetting('teacher_profile'),
      listAuditLogs(50),
    ]);
    res.json({
      teacherProfile,
      auditLogs,
      systemStatus: {
        databaseMode: isSupabaseConfigured() ? 'supabase' : 'local_preview',
        supabaseConfigured: isSupabaseConfigured(),
        adminCodeSource: env.adminAccessCode ? 'env' : 'db',
        freeTierLimits: {
          database: '500 MB (Supabase Free)',
          storage: '1 GB (Supabase Storage Free)',
          egress: '5 GB / شهر (يُوصى بضغط الفيديو 720p MP4)',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/teacher-profile', async (req: AuthenticatedRequest, res, next) => {
  try {
    const current =
      (await getPlatformSetting<Record<string, unknown>>('teacher_profile')) || {};
    const nextProfile = {
      ...current,
      teacherName: String(req.body?.teacherName || current.teacherName || 'الأستاذ أحمد الرمادي'),
      headline: String(req.body?.headline || current.headline || ''),
      bio: String(req.body?.bio || current.bio || ''),
    };
    await setPlatformSetting('teacher_profile', nextProfile);
    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'teacher_profile_updated',
      targetType: 'platform_settings',
      targetId: 'teacher_profile',
      ipAddress: adminIp(req),
    });
    res.json({ teacherProfile: nextProfile });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/change-admin-passcode', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (env.adminAccessCode) {
      res.status(400).json({
        error:
          'تم تعيين رمز الإدارة عبر متغير البيئة ADMIN_ACCESS_CODE؛ لتغييره يرجى تحديث المتغير في إعدادات الأسرار (Secrets) وإعادة التشغيل.',
      });
      return;
    }
    const newPasscode = String(req.body?.newPasscode || '').trim();
    if (newPasscode.length < 6) {
      res.status(400).json({ error: 'يجب أن يتكون رمز الإدارة من 6 خانات على الأقل.' });
      return;
    }
    const { hash } = createHashedAdminPasscode(newPasscode);
    await setPlatformSetting('admin_security', { hash, updatedAt: new Date().toISOString() });
    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'admin_passcode_rotated',
      targetType: 'platform_settings',
      targetId: 'admin_security',
      ipAddress: adminIp(req),
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
