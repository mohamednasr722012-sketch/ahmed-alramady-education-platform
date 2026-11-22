export type UserRoleCode = 'student' | 'teacher_admin';
export type StudentStatus = 'active' | 'suspended';
export type PublishStatus = 'draft' | 'scheduled' | 'published' | 'hidden' | 'closed';
export type AttemptStatus = 'in_progress' | 'submitted' | 'expired';
export type BadgeTier = 'gold' | 'silver' | 'bronze';
export type BadgeRuleType =
  | 'exam_min_pct'
  | 'exam_perfect'
  | 'exams_completed'
  | 'grade_rank_one'
  | 'avg_pct_min_exams';

export type CertType =
  | 'exam_completion'
  | 'excellence'
  | 'achievement'
  | 'appreciation'
  | 'top_of_grade';

export interface GradeRecord {
  id: number;
  slug: string;
  name_ar: string;
  description_ar: string;
  sort_order: number;
  is_active: boolean;
}

export interface StudentRecord {
  id: string;
  profile_id: string;
  grade_id: number;
  full_name: string;
  normalized_full_name: string;
  phone_number: string;
  password_hash: string;
  must_change_password: boolean;
  status: StudentStatus;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  id: string;
  subject_type: UserRoleCode;
  subject_id: string;
  token_hash: string;
  device_label: string;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface VideoRecord {
  id: string;
  grade_id: number;
  category_id: string | null;
  unit_title: string;
  lesson_title: string;
  title: string;
  description: string;
  storage_path: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  publish_status: 'draft' | 'scheduled' | 'published' | 'hidden';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamRecord {
  id: string;
  grade_id: number;
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
  created_at: string;
  updated_at: string;
}

export interface QuestionRecord {
  id: string;
  exam_id: string;
  question_order: number;
  question_text: string;
  image_path: string | null;
  points: number;
}

export interface QuestionOptionRecord {
  id: string;
  question_id: string;
  option_order: number;
  option_text: string;
  is_correct: boolean;
}

export interface ExamAttemptRecord {
  id: string;
  exam_id: string;
  student_id: string;
  grade_id: number;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  duration_ms: number | null;
}

export interface StudentAnswerRecord {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_id: string;
  is_correct_snapshot: boolean | null;
  saved_at: string;
}

export interface ExamResultRecord {
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
}

export interface ScheduledPublicationRecord {
  id: string;
  target_type: 'exam' | 'video';
  target_id: string;
  grade_id: number;
  scheduled_for_utc: string;
  timezone: string;
  status: 'pending' | 'processing' | 'published' | 'failed' | 'cancelled';
  executed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface BadgeRecord {
  id: string;
  code: string;
  title_ar: string;
  description_ar: string;
  tier: BadgeTier;
  rule_type: BadgeRuleType;
  rule_threshold: number;
  secondary_threshold: number | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export interface StudentBadgeRecord {
  id: string;
  student_id: string;
  badge_id: string;
  exam_id: string | null;
  earned_at: string;
}

export interface CertificateRecord {
  id: string;
  serial_number: string;
  student_id: string;
  grade_id: number;
  cert_type: CertType;
  title_ar: string;
  reason_ar: string;
  reference_key: string;
  issued_at: string;
}

export interface NotificationRecord {
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

export interface AuditLogRecord {
  id: string;
  actor_role: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata_json: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
