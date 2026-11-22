export interface GradeInfo {
  id: number;
  slug: string;
  name_ar: string;
  description_ar: string;
  sort_order: number;
  is_active: boolean;
}

export interface StudentSessionUser {
  id: string;
  fullName: string;
  phoneNumber: string;
  gradeId: number;
  gradeName: string;
  mustChangePassword: boolean;
  createdAt?: string;
}

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

export interface ExamSummary {
  id: string;
  grade_id: number;
  gradeName?: string;
  title: string;
  description: string;
  unit_title: string;
  lesson_title: string;
  question_count: number;
  points_per_question: number;
  total_points: number;
  duration_minutes: number;
  max_attempts: number | null;
  opens_at: string | null;
  closes_at: string | null;
  publish_status: 'draft' | 'scheduled' | 'published' | 'closed';
  published_at: string | null;
  attemptsUsed?: number;
  hasActiveAttempt?: boolean;
  canStart?: boolean;
  bestResult?: ExamResultItem | null;
  participantsCount?: number;
  submissionsCount?: number;
}

export interface ExamResultItem {
  id: string;
  attempt_id: string;
  exam_id: string;
  student_id: string;
  grade_id: number;
  earned_score: number;
  max_score: number;
  correct_count: number;
  wrong_count: number;
  percentage: number;
  duration_ms: number;
  submitted_at: string;
  examTitle?: string;
  unitTitle?: string;
  lessonTitle?: string;
  studentName?: string;
  gradeName?: string;
}

export interface VideoItem {
  id: string;
  grade_id: number;
  gradeName?: string;
  unit_title: string;
  lesson_title: string;
  title: string;
  description: string;
  storage_path: string;
  thumbnail_path: string | null;
  thumbnailUrl?: string | null;
  playbackUrl?: string | null;
  file_size_bytes?: number | null;
  publish_status: 'draft' | 'scheduled' | 'published' | 'hidden';
  published_at: string | null;
  created_at: string;
}

export interface BadgeItem {
  id: string;
  code: string;
  title_ar: string;
  description_ar: string;
  tier: 'gold' | 'silver' | 'bronze';
  rule_type: string;
  rule_threshold: number;
  secondary_threshold: number | null;
  is_system: boolean;
  is_active: boolean;
  earned?: boolean;
  earnedAt?: string | null;
}

export interface CertificateItem {
  id: string;
  serial_number: string;
  student_id: string;
  grade_id: number;
  cert_type: string;
  title_ar: string;
  reason_ar: string;
  reference_key: string;
  issued_at: string;
  studentName?: string;
  gradeName?: string;
}

export interface NotificationItem {
  id: string;
  grade_id: number | null;
  student_id: string | null;
  type: string;
  title_ar: string;
  body_ar: string;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

export interface StudentAnalyticsData {
  totalCompletedAttempts: number;
  averagePercentage: number;
  correctRate: number;
  wrongRate: number;
  totalCorrect: number;
  totalWrong: number;
  bestExam: { examId: string; title: string; percentage: number; earned: number; max: number } | null;
  worstExam: { examId: string; title: string; percentage: number; earned: number; max: number } | null;
  strengths: Array<{ unit: string; lesson: string; avgPercentage: number; attemptsCount: number }>;
  needsReview: Array<{ unit: string; lesson: string; avgPercentage: number; attemptsCount: number }>;
  lessonBreakdown: Array<{ unit: string; lesson: string; avgPercentage: number; attemptsCount: number }>;
  timeline: Array<{
    index: number;
    examTitle: string;
    percentage: number;
    earnedScore: number;
    maxScore: number;
    submittedAt: string;
  }>;
}
