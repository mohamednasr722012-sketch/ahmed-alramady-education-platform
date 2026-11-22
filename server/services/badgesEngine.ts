import {
  awardBadgeIfNotExists,
  issueCertificateIfNotExists,
  listBadges,
  listResultsForStudent,
} from '../db/assessmentsRepo.ts';
import { createNotification } from '../db/contentRepo.ts';
import { getPlatformSetting } from '../db/usersRepo.ts';
import { getGradeCumulativeLeaderboard, pickBestResultPerExam } from './scoringAndRanks.ts';
import type { BadgeRecord, CertificateRecord, ExamRecord, ExamResultRecord } from '../db/types.ts';

export interface EvaluationOutcome {
  newlyAwardedBadges: BadgeRecord[];
  newlyIssuedCertificates: CertificateRecord[];
}

export async function evaluateBadgesAndCertificatesAfterExam(params: {
  studentId: string;
  gradeId: number;
  exam: ExamRecord;
  result: ExamResultRecord;
}): Promise<EvaluationOutcome> {
  const [badges, myResults, leaderboard, certRulesSetting] = await Promise.all([
    listBadges(true),
    listResultsForStudent(params.studentId, params.gradeId),
    getGradeCumulativeLeaderboard(params.gradeId),
    getPlatformSetting<{
      autoIssueOnExamCompletion?: boolean;
      excellenceMinPercentage?: number;
      autoIssueExcellence?: boolean;
      autoIssueTopOfGrade?: boolean;
    }>('certificate_rules'),
  ]);

  const effectiveResults = pickBestResultPerExam(myResults);
  const completedExams = effectiveResults.length;
  const cumulativeEarned = effectiveResults.reduce((s, r) => s + Number(r.earned_score), 0);
  const cumulativePossible = effectiveResults.reduce((s, r) => s + Number(r.max_score), 0);
  const stats = {
    completedExams,
    percentage:
      cumulativePossible > 0 ? Number(((cumulativeEarned / cumulativePossible) * 100).toFixed(2)) : 0,
  };

  const newlyAwardedBadges: BadgeRecord[] = [];
  const newlyIssuedCertificates: CertificateRecord[] = [];
  const distinctCompletedExamCount = completedExams;
  const isRankOne = leaderboard.length > 0 && leaderboard[0].studentId === params.studentId;

  for (const badge of badges) {
    let qualified = false;

    switch (badge.rule_type) {
      case 'exam_min_pct':
        qualified = params.result.percentage >= badge.rule_threshold;
        break;
      case 'exam_perfect':
        qualified = params.result.percentage >= 100;
        break;
      case 'exams_completed':
        qualified = distinctCompletedExamCount >= badge.rule_threshold;
        break;
      case 'grade_rank_one':
        qualified = isRankOne;
        break;
      case 'avg_pct_min_exams': {
        const minExams = badge.secondary_threshold ?? 3;
        qualified = stats.completedExams >= minExams && stats.percentage >= badge.rule_threshold;
        break;
      }
    }

    if (qualified) {
      const awarded = await awardBadgeIfNotExists({
        studentId: params.studentId,
        badgeId: badge.id,
        examId: params.exam.id,
      });
      if (awarded) {
        newlyAwardedBadges.push(badge);
        await createNotification({
          studentId: params.studentId,
          gradeId: params.gradeId,
          type: 'badge_earned',
          titleAr: `حصلت على ${badge.title_ar}`,
          bodyAr: `مبارك! تم منحك ${badge.title_ar}: ${badge.description_ar}`,
          linkPath: '/student/badges',
        });
      }
    }
  }

  const rules = {
    autoIssueOnExamCompletion: certRulesSetting?.autoIssueOnExamCompletion ?? true,
    excellenceMinPercentage: certRulesSetting?.excellenceMinPercentage ?? 90,
    autoIssueExcellence: certRulesSetting?.autoIssueExcellence ?? true,
    autoIssueTopOfGrade: certRulesSetting?.autoIssueTopOfGrade ?? true,
  };

  if (rules.autoIssueOnExamCompletion) {
    const res = await issueCertificateIfNotExists({
      studentId: params.studentId,
      gradeId: params.gradeId,
      certType: 'exam_completion',
      titleAr: 'شهادة إتمام امتحان',
      reasonAr: `إتمام امتحان «${params.exam.title}» بدرجة ${params.result.earned_score} من ${params.result.max_score}`,
      referenceKey: `exam:${params.exam.id}`,
    });
    if (res.issued) {
      newlyIssuedCertificates.push(res.certificate);
    }
  }

  if (rules.autoIssueExcellence && params.result.percentage >= rules.excellenceMinPercentage) {
    const res = await issueCertificateIfNotExists({
      studentId: params.studentId,
      gradeId: params.gradeId,
      certType: 'excellence',
      titleAr: 'شهادة تفوق',
      reasonAr: `التفوق في امتحان «${params.exam.title}» بنسبة ${params.result.percentage}%`,
      referenceKey: `excellence:${params.exam.id}`,
    });
    if (res.issued) {
      newlyIssuedCertificates.push(res.certificate);
    }
  }

  if (rules.autoIssueTopOfGrade && isRankOne && stats.completedExams >= 1) {
    const res = await issueCertificateIfNotExists({
      studentId: params.studentId,
      gradeId: params.gradeId,
      certType: 'top_of_grade',
      titleAr: 'شهادة أوائل الصف',
      reasonAr: `تحقيق المركز الأول في الترتيب التراكمي للصف الدراسي بنسبة ${stats.percentage}%`,
      referenceKey: `top_grade:${params.gradeId}`,
    });
    if (res.issued) {
      newlyIssuedCertificates.push(res.certificate);
    }
  }

  for (const cert of newlyIssuedCertificates) {
    await createNotification({
      studentId: params.studentId,
      gradeId: params.gradeId,
      type: 'certificate_issued',
      titleAr: `تم إصدار ${cert.title_ar}`,
      bodyAr: `تهانينا! صدرت لك ${cert.title_ar} برقم تسلسلي ${cert.serial_number}.`,
      linkPath: '/student/certificates',
    });
  }

  return { newlyAwardedBadges, newlyIssuedCertificates };
}
