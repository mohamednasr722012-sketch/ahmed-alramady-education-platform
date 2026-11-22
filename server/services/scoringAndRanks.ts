import {
  listGradeLeaderboardRows,
  listResultsByGradeOrExam,
  listResultsForStudent,
} from '../db/assessmentsRepo.ts';
import { getExamQuestions, listExams } from '../db/contentRepo.ts';
import { listStudents } from '../db/usersRepo.ts';
import { getOrSetCache } from './cache.ts';
import type { ExamResultRecord } from '../db/types.ts';

export interface CumulativeStats {
  completedExams: number;
  cumulativeEarned: number;
  cumulativePossible: number;
  percentage: number;
  averageScore: number;
  rankInGrade: number | null;
  totalRankedStudentsInGrade: number;
}

export interface CumulativeRankEntry {
  rank: number;
  studentId: string;
  fullName: string;
  gradeId: number;
  completedExams: number;
  cumulativeEarned: number;
  cumulativePossible: number;
  percentage: number;
  totalDurationMs: number;
}

export interface ExamRankEntry {
  rank: number;
  studentId: string;
  fullName: string;
  earnedScore: number;
  maxScore: number;
  percentage: number;
  durationMs: number;
  submittedAt: string;
}

/**
 * تجميع النتائج بحيث يُؤخذ أحدث نتيجة رسمية لكل امتحان في التراكمي
 * (أو جميع النتائج المكتملة؛ هنا نعتمد أعلى نتيجة معتمدة لكل امتحان أداه الطالب
 * حتى لا يتضخم التراكمي من إعادة المحاولة، مع عدم إضافة صفر لأي امتحان لم يؤدَّ)
 */
export function pickBestResultPerExam(results: ExamResultRecord[]): ExamResultRecord[] {
  const byExam = new Map<string, ExamResultRecord>();
  for (const r of results) {
    const current = byExam.get(r.exam_id);
    if (
      !current ||
      r.earned_score > current.earned_score ||
      (r.earned_score === current.earned_score && r.duration_ms < current.duration_ms)
    ) {
      byExam.set(r.exam_id, r);
    }
  }
  return Array.from(byExam.values());
}

export async function getGradeCumulativeLeaderboard(gradeId: number): Promise<CumulativeRankEntry[]> {
  return getOrSetCache(`leaderboard:grade:${gradeId}`, 15_000, async () => {
    const rows = await listGradeLeaderboardRows(gradeId);
    const byStudent = new Map<
      string,
      {
        fullName: string;
        byExam: Map<string, { earned: number; max: number; durationMs: number }>;
      }
    >();

    for (const r of rows) {
      let stu = byStudent.get(r.student_id);
      if (!stu) {
        stu = { fullName: r.full_name, byExam: new Map() };
        byStudent.set(r.student_id, stu);
      }
      const cur = stu.byExam.get(r.exam_id);
      if (
        !cur ||
        r.earned_score > cur.earned ||
        (r.earned_score === cur.earned && r.duration_ms < cur.durationMs)
      ) {
        stu.byExam.set(r.exam_id, {
          earned: r.earned_score,
          max: r.max_score,
          durationMs: r.duration_ms,
        });
      }
    }

    const entries: Omit<CumulativeRankEntry, 'rank'>[] = [];
    for (const [studentId, stu] of byStudent.entries()) {
      const effective = Array.from(stu.byExam.values());
      if (effective.length === 0) continue;

      const cumulativeEarned = effective.reduce((s, r) => s + r.earned, 0);
      const cumulativePossible = effective.reduce((s, r) => s + r.max, 0);
      const totalDurationMs = effective.reduce((s, r) => s + r.durationMs, 0);
      const percentage =
        cumulativePossible > 0 ? Number(((cumulativeEarned / cumulativePossible) * 100).toFixed(2)) : 0;

      entries.push({
        studentId,
        fullName: stu.fullName,
        gradeId,
        completedExams: effective.length,
        cumulativeEarned: Number(cumulativeEarned.toFixed(2)),
        cumulativePossible: Number(cumulativePossible.toFixed(2)),
        percentage,
        totalDurationMs,
      });
    }

    // ترتيب عادل: النسبة المئوية أولاً عند اختلاف عدد الامتحانات، ثم مجموع الدرجات، ثم عدد الامتحانات، ثم الزمن الأقل
    entries.sort((a, b) => {
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      if (b.cumulativeEarned !== a.cumulativeEarned) return b.cumulativeEarned - a.cumulativeEarned;
      if (b.completedExams !== a.completedExams) return b.completedExams - a.completedExams;
      return a.totalDurationMs - b.totalDurationMs;
    });

    return entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
  });
}

export async function getExamLeaderboard(gradeId: number, examId: string): Promise<ExamRankEntry[]> {
  const [students, rawResults] = await Promise.all([
    listStudents({ gradeId }),
    listResultsByGradeOrExam({ gradeId, examId }),
  ]);
  const studentMap = new Map(students.map((s) => [s.id, s]));

  // لكل طالب في الامتحان: نأخذ أفضل محاولة له
  const bestPerStudent = new Map<string, ExamResultRecord>();
  for (const r of rawResults) {
    if (!studentMap.has(r.student_id)) continue;
    const cur = bestPerStudent.get(r.student_id);
    if (
      !cur ||
      r.earned_score > cur.earned_score ||
      (r.earned_score === cur.earned_score && r.duration_ms < cur.duration_ms) ||
      (r.earned_score === cur.earned_score &&
        r.duration_ms === cur.duration_ms &&
        r.submitted_at < cur.submitted_at)
    ) {
      bestPerStudent.set(r.student_id, r);
    }
  }

  const list = Array.from(bestPerStudent.values());
  // معيار ترتيب الامتحان: 1) الدرجة الأعلى 2) الزمن الأقل بأجزاء الثانية 3) وقت التسليم الأسبق
  list.sort((a, b) => {
    if (b.earned_score !== a.earned_score) return b.earned_score - a.earned_score;
    if (a.duration_ms !== b.duration_ms) return a.duration_ms - b.duration_ms;
    return a.submitted_at.localeCompare(b.submitted_at);
  });

  return list.map((r, idx) => ({
    rank: idx + 1,
    studentId: r.student_id,
    fullName: studentMap.get(r.student_id)?.full_name || 'طالب',
    earnedScore: Number(r.earned_score),
    maxScore: Number(r.max_score),
    percentage: Number(r.percentage),
    durationMs: Number(r.duration_ms),
    submittedAt: r.submitted_at,
  }));
}

export async function getStudentCumulativeStats(
  studentId: string,
  gradeId: number
): Promise<CumulativeStats> {
  const [myResults, leaderboard] = await Promise.all([
    listResultsForStudent(studentId, gradeId),
    getGradeCumulativeLeaderboard(gradeId),
  ]);

  const effective = pickBestResultPerExam(myResults);
  const completedExams = effective.length;
  const cumulativeEarned = Number(effective.reduce((s, r) => s + Number(r.earned_score), 0).toFixed(2));
  const cumulativePossible = Number(effective.reduce((s, r) => s + Number(r.max_score), 0).toFixed(2));
  const percentage =
    cumulativePossible > 0 ? Number(((cumulativeEarned / cumulativePossible) * 100).toFixed(2)) : 0;
  const averageScore =
    completedExams > 0 ? Number((cumulativeEarned / completedExams).toFixed(2)) : 0;

  const myRank = leaderboard.find((e) => e.studentId === studentId)?.rank ?? null;

  return {
    completedExams,
    cumulativeEarned,
    cumulativePossible,
    percentage,
    averageScore,
    rankInGrade: myRank,
    totalRankedStudentsInGrade: leaderboard.length,
  };
}

export async function buildStudentAnalytics(studentId: string, gradeId: number) {
  const [results, exams] = await Promise.all([
    listResultsForStudent(studentId, gradeId),
    listExams({ gradeId }),
  ]);

  const examMap = new Map(exams.map((e) => [e.id, e]));
  const ordered = [...results].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));

  const totalCorrect = ordered.reduce((s, r) => s + r.correct_count, 0);
  const totalWrong = ordered.reduce((s, r) => s + r.wrong_count, 0);
  const totalQuestions = totalCorrect + totalWrong;

  const correctRate = totalQuestions > 0 ? Number(((totalCorrect / totalQuestions) * 100).toFixed(1)) : 0;
  const wrongRate = totalQuestions > 0 ? Number(((totalWrong / totalQuestions) * 100).toFixed(1)) : 0;
  const averagePercentage =
    ordered.length > 0
      ? Number((ordered.reduce((s, r) => s + Number(r.percentage), 0) / ordered.length).toFixed(1))
      : 0;

  let bestExam: { examId: string; title: string; percentage: number; earned: number; max: number } | null = null;
  let worstExam: { examId: string; title: string; percentage: number; earned: number; max: number } | null = null;

  const lessonBucket = new Map<string, { unit: string; lesson: string; sumPct: number; count: number }>();

  for (const r of ordered) {
    const ex = examMap.get(r.exam_id);
    const title = ex?.title || 'امتحان';
    const pct = Number(r.percentage);

    if (!bestExam || pct > bestExam.percentage) {
      bestExam = { examId: r.exam_id, title, percentage: pct, earned: r.earned_score, max: r.max_score };
    }
    if (!worstExam || pct < worstExam.percentage) {
      worstExam = { examId: r.exam_id, title, percentage: pct, earned: r.earned_score, max: r.max_score };
    }

    const lessonKey = `${ex?.unit_title || 'عام'}::${ex?.lesson_title || title}`;
    const existing = lessonBucket.get(lessonKey) || {
      unit: ex?.unit_title || 'الوحدة العامة',
      lesson: ex?.lesson_title || title,
      sumPct: 0,
      count: 0,
    };
    existing.sumPct += pct;
    existing.count += 1;
    lessonBucket.set(lessonKey, existing);
  }

  const lessonBreakdown = Array.from(lessonBucket.values()).map((l) => ({
    unit: l.unit,
    lesson: l.lesson,
    avgPercentage: Number((l.sumPct / l.count).toFixed(1)),
    attemptsCount: l.count,
  }));

  const strengths = lessonBreakdown.filter((l) => l.avgPercentage >= 80);
  const needsReview = lessonBreakdown.filter((l) => l.avgPercentage < 75);

  const timeline = ordered.map((r, i) => ({
    index: i + 1,
    examTitle: examMap.get(r.exam_id)?.title || `امتحان ${i + 1}`,
    percentage: Number(r.percentage),
    earnedScore: Number(r.earned_score),
    maxScore: Number(r.max_score),
    submittedAt: r.submitted_at,
  }));

  // Ensure question count sanity if needed
  void getExamQuestions;

  return {
    totalCompletedAttempts: ordered.length,
    averagePercentage,
    correctRate,
    wrongRate,
    totalCorrect,
    totalWrong,
    bestExam,
    worstExam,
    strengths,
    needsReview,
    lessonBreakdown,
    timeline,
  };
}
