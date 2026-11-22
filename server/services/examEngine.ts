import {
  createExamAttempt,
  finalizeAttemptAndSaveResult,
  getAttemptById,
  getResultByAttemptId,
  listAttemptAnswers,
  listStudentAttemptsForExam,
  upsertStudentAnswer,
} from '../db/assessmentsRepo.ts';
import { createNotification, getExamById, getExamQuestions } from '../db/contentRepo.ts';
import { updateStudent } from '../db/usersRepo.ts';
import { invalidateCachePrefix } from './cache.ts';
import { evaluateBadgesAndCertificatesAfterExam } from './badgesEngine.ts';
import type { ExamAttemptRecord, ExamRecord, ExamResultRecord, StudentRecord } from '../db/types.ts';

export class ExamEngineError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function startOrResumeExamAttempt(student: StudentRecord, examId: string): Promise<{
  exam: ExamRecord;
  attempt: ExamAttemptRecord;
  questions: Array<{
    id: string;
    question_order: number;
    question_text: string;
    image_path: string | null;
    points: number;
    options: Array<{ id: string; option_order: number; option_text: string }>;
  }>;
  savedAnswers: Record<string, string>;
  serverNowIso: string;
  remainingMs: number;
}> {
  const exam = await getExamById(examId);
  if (!exam) {
    throw new ExamEngineError(404, 'الامتحان غير موجود.');
  }
  if (exam.grade_id !== student.grade_id) {
    throw new ExamEngineError(403, 'هذا الامتحان مخصص لصف دراسي آخر.');
  }
  if (exam.publish_status !== 'published') {
    throw new ExamEngineError(403, 'هذا الامتحان غير متاح حاليًا.');
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (exam.opens_at && new Date(exam.opens_at).getTime() > nowMs) {
    throw new ExamEngineError(403, 'لم يحن موعد فتح هذا الامتحان بعد.');
  }

  const existingAttempts = await listStudentAttemptsForExam(examId, student.id);
  const activeAttempt = existingAttempts.find((a) => a.status === 'in_progress');

  let attempt: ExamAttemptRecord;
  if (activeAttempt) {
    const expiresMs = new Date(activeAttempt.expires_at).getTime();
    if (expiresMs <= nowMs) {
      // انتهى وقت المحاولة النشطة: تُغلق وتُصحح تلقائيًا أولًا
      await gradeAndSubmitAttempt(student, activeAttempt.id, 'expired');
      return startOrResumeExamAttempt(student, examId);
    }
    attempt = activeAttempt;
  } else {
    if (exam.closes_at && new Date(exam.closes_at).getTime() <= nowMs) {
      throw new ExamEngineError(403, 'انتهى موعد هذا الامتحان وتم إغلاقه.');
    }
    if (exam.max_attempts !== null && existingAttempts.length >= exam.max_attempts) {
      throw new ExamEngineError(403, 'لقد استنفدت عدد المحاولات المسموح به لهذا الامتحان.');
    }

    const startedAt = nowIso;
    const durationMs = exam.duration_minutes * 60 * 1000;
    const examCloseMs = exam.closes_at ? new Date(exam.closes_at).getTime() : Number.POSITIVE_INFINITY;
    const effectiveExpiresMs = Math.min(nowMs + durationMs, examCloseMs);
    const expiresAt = new Date(effectiveExpiresMs).toISOString();

    try {
      attempt = await createExamAttempt({
        examId: exam.id,
        studentId: student.id,
        gradeId: student.grade_id,
        attemptNumber: existingAttempts.length + 1,
        startedAt,
        expiresAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('uq_active_attempt')) {
        const retryAttempts = await listStudentAttemptsForExam(examId, student.id);
        const racedActive = retryAttempts.find((a) => a.status === 'in_progress');
        if (racedActive) {
          attempt = racedActive;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  // لا ترسل الإجابات الصحيحة (is_correct) لواجهة الطالب إطلاقًا!
  const questions = await getExamQuestions(exam.id, { includeCorrectAnswers: false });
  const answers = await listAttemptAnswers(attempt.id);
  const savedAnswers: Record<string, string> = {};
  for (const ans of answers) {
    savedAnswers[ans.question_id] = ans.selected_option_id;
  }

  await updateStudent(student.id, { lastActivityAt: nowIso });

  const remainingMs = Math.max(0, new Date(attempt.expires_at).getTime() - Date.now());
  return {
    exam,
    attempt,
    questions: questions.map((q) => ({
      id: q.id,
      question_order: q.question_order,
      question_text: q.question_text,
      image_path: q.image_path,
      points: q.points,
      options: q.options.map((o) => ({
        id: o.id,
        option_order: o.option_order,
        option_text: o.option_text,
      })),
    })),
    savedAnswers,
    serverNowIso: new Date().toISOString(),
    remainingMs,
  };
}

export async function saveStudentAnswerForAttempt(params: {
  student: StudentRecord;
  attemptId: string;
  questionId: string;
  selectedOptionId: string;
}): Promise<{ saved: boolean; expired?: boolean; serverNowIso: string; remainingMs: number }> {
  const attempt = await getAttemptById(params.attemptId);
  if (!attempt || attempt.student_id !== params.student.id) {
    throw new ExamEngineError(404, 'المحاولة غير موجودة.');
  }
  if (attempt.status !== 'in_progress') {
    throw new ExamEngineError(409, 'تم إغلاق هذه المحاولة بالفعل.');
  }

  const nowMs = Date.now();
  const expiresMs = new Date(attempt.expires_at).getTime();
  // هامش 3 ثوانٍ فقط لتعويض زمن الشبكة
  if (nowMs > expiresMs + 3000) {
    await gradeAndSubmitAttempt(params.student, attempt.id, 'expired');
    return {
      saved: false,
      expired: true,
      serverNowIso: new Date(nowMs).toISOString(),
      remainingMs: 0,
    };
  }

  const questions = await getExamQuestions(attempt.exam_id, { includeCorrectAnswers: false });
  const targetQuestion = questions.find((q) => q.id === params.questionId);
  if (!targetQuestion) {
    throw new ExamEngineError(400, 'السؤال لا ينتمي لهذا الامتحان.');
  }
  const validOption = targetQuestion.options.find((o) => o.id === params.selectedOptionId);
  if (!validOption) {
    throw new ExamEngineError(400, 'الاختيار المحدد غير صالح لهذا السؤال.');
  }

  await upsertStudentAnswer({
    attemptId: attempt.id,
    questionId: params.questionId,
    selectedOptionId: params.selectedOptionId,
  });

  return {
    saved: true,
    serverNowIso: new Date().toISOString(),
    remainingMs: Math.max(0, expiresMs - Date.now()),
  };
}

export async function gradeAndSubmitAttempt(
  student: StudentRecord,
  attemptId: string,
  mode: 'submitted' | 'expired' = 'submitted'
): Promise<{
  result: ExamResultRecord;
  newlyAwardedBadges: Awaited<ReturnType<typeof evaluateBadgesAndCertificatesAfterExam>>['newlyAwardedBadges'];
  newlyIssuedCertificates: Awaited<ReturnType<typeof evaluateBadgesAndCertificatesAfterExam>>['newlyIssuedCertificates'];
}> {
  const attempt = await getAttemptById(attemptId);
  if (!attempt || attempt.student_id !== student.id) {
    throw new ExamEngineError(404, 'المحاولة غير موجودة.');
  }

  if (attempt.status !== 'in_progress') {
    const existing = await getResultByAttemptId(attempt.id);
    if (existing) {
      return { result: existing, newlyAwardedBadges: [], newlyIssuedCertificates: [] };
    }
  }

  const exam = await getExamById(attempt.exam_id);
  if (!exam) {
    throw new ExamEngineError(404, 'الامتحان غير موجود.');
  }

  const nowMs = Date.now();
  const startedMs = new Date(attempt.started_at).getTime();
  const expiresMs = new Date(attempt.expires_at).getTime();
  const effectiveStatus: 'submitted' | 'expired' =
    mode === 'expired' || nowMs > expiresMs + 3000 ? 'expired' : 'submitted';

  const clampedEndMs = Math.min(nowMs, expiresMs);
  const durationMs = Math.max(100, clampedEndMs - startedMs);
  const submittedAtIso = new Date(clampedEndMs).toISOString();

  const [questionsWithTruth, savedAnswers] = await Promise.all([
    getExamQuestions(exam.id, { includeCorrectAnswers: true }),
    listAttemptAnswers(attempt.id),
  ]);

  const answerByQ = new Map(savedAnswers.map((a) => [a.question_id, a.selected_option_id]));

  let earnedScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  const answerSnapshots: Array<{ questionId: string; isCorrect: boolean }> = [];

  for (const q of questionsWithTruth) {
    const qPoints = Number(q.points);
    maxScore += qPoints;
    const selectedOptId = answerByQ.get(q.id);
    const correctOption = q.options.find((o) => o.is_correct);
    const isCorrect = Boolean(selectedOptId && correctOption && selectedOptId === correctOption.id);
    if (isCorrect) {
      earnedScore += qPoints;
      correctCount += 1;
    } else {
      wrongCount += 1;
    }
    if (selectedOptId) {
      answerSnapshots.push({ questionId: q.id, isCorrect });
    }
  }

  const percentage = maxScore > 0 ? Number(((earnedScore / maxScore) * 100).toFixed(2)) : 0;

  const result = await finalizeAttemptAndSaveResult({
    attemptId: attempt.id,
    examId: exam.id,
    studentId: student.id,
    gradeId: student.grade_id,
    status: effectiveStatus,
    submittedAt: submittedAtIso,
    durationMs,
    earnedScore: Number(earnedScore.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    correctCount,
    wrongCount,
    percentage,
    answerSnapshots,
  });

  await updateStudent(student.id, { lastActivityAt: new Date().toISOString() });

  await createNotification({
    studentId: student.id,
    gradeId: student.grade_id,
    type: 'result_published',
    titleAr: `نتيجة امتحان: ${exam.title}`,
    bodyAr: `حصلت على ${result.earned_score} من ${result.max_score} (${result.percentage}%).`,
    linkPath: '/student/results',
  });

  invalidateCachePrefix(`leaderboard:grade:${student.grade_id}`);
  invalidateCachePrefix('public:');

  const evaluation = await evaluateBadgesAndCertificatesAfterExam({
    studentId: student.id,
    gradeId: student.grade_id,
    exam,
    result,
  });

  return {
    result,
    newlyAwardedBadges: evaluation.newlyAwardedBadges,
    newlyIssuedCertificates: evaluation.newlyIssuedCertificates,
  };
}
