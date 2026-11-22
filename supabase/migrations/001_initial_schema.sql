-- ============================================================================
-- منصة أحمد الرمادي | ملك اللغة العربية
-- 001_initial_schema.sql — الجداول الكاملة، العلاقات، القيود الفريدة، والفهارس
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. الأدوار
CREATE TABLE IF NOT EXISTS public.roles (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL
);

-- 2. الملفات التعريفية
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id SMALLINT NOT NULL REFERENCES public.roles(id),
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role_id);

-- 3. الصفوف الدراسية الأربعة المستقلة
CREATE TABLE IF NOT EXISTS public.grades (
  id SMALLINT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL UNIQUE,
  description_ar TEXT NOT NULL DEFAULT '',
  sort_order SMALLINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. الطلاب (قيود فريدة صارمة على الاسم الرباعي المطبّع ورقم الهاتف)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  full_name TEXT NOT NULL,
  normalized_full_name TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_students_grade_status ON public.students(grade_id, status);
CREATE INDEX IF NOT EXISTS idx_students_created ON public.students(created_at DESC);

-- 5. الجلسات متعددة الأجهزة
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('student', 'teacher_admin')),
  subject_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT NOT NULL DEFAULT 'متصفح ويب',
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON public.user_sessions(subject_type, subject_id, expires_at);

-- 6. تصنيفات الفيديوهات (الصف -> الوحدة -> الدرس)
CREATE TABLE IF NOT EXISTS public.video_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  unit_title TEXT NOT NULL,
  lesson_title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  UNIQUE(grade_id, unit_title, lesson_title)
);
CREATE INDEX IF NOT EXISTS idx_video_categories_grade ON public.video_categories(grade_id, sort_order);

-- 7. الفيديوهات
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  category_id UUID REFERENCES public.video_categories(id) ON DELETE SET NULL,
  unit_title TEXT NOT NULL,
  lesson_title TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_seconds INT,
  file_size_bytes BIGINT,
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft', 'scheduled', 'published', 'hidden')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_videos_grade_status ON public.videos(grade_id, publish_status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_lesson ON public.videos(grade_id, unit_title, lesson_title);

-- 8. الامتحانات (كيان مستقل — لا يوجد بنك أسئلة)
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit_title TEXT NOT NULL DEFAULT '',
  lesson_title TEXT NOT NULL DEFAULT '',
  question_count INT NOT NULL DEFAULT 10 CHECK (question_count > 0),
  points_per_question NUMERIC(8,2) NOT NULL DEFAULT 10 CHECK (points_per_question > 0),
  total_points NUMERIC(10,2) NOT NULL DEFAULT 100 CHECK (total_points > 0),
  duration_minutes INT NOT NULL DEFAULT 10 CHECK (duration_minutes > 0),
  max_attempts INT DEFAULT 1 CHECK (max_attempts IS NULL OR max_attempts > 0),
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft', 'scheduled', 'published', 'closed')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exams_grade_status ON public.exams(grade_id, publish_status, opens_at, closes_at);

-- 9. أسئلة الامتحان (مرتبطة بالامتحان فقط)
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  question_text TEXT NOT NULL,
  image_path TEXT,
  points NUMERIC(8,2) NOT NULL DEFAULT 10 CHECK (points > 0),
  UNIQUE(exam_id, question_order)
);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON public.questions(exam_id);

-- 10. اختيارات الأسئلة
CREATE TABLE IF NOT EXISTS public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_order SMALLINT NOT NULL CHECK (option_order >= 1 AND option_order <= 6),
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(question_id, option_order)
);
CREATE INDEX IF NOT EXISTS idx_options_question ON public.question_options(question_id);

-- 11. محاولات الامتحان (يمنع محاولتين نشطتين لنفس الطالب والامتحان)
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  attempt_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  duration_ms BIGINT,
  UNIQUE(exam_id, student_id, attempt_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_attempt_per_student_exam
  ON public.exam_attempts(exam_id, student_id)
  WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS idx_attempts_student_exam ON public.exam_attempts(student_id, exam_id);

-- 12. إجابات الطالب (حفظ تلقائي)
CREATE TABLE IF NOT EXISTS public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id UUID NOT NULL REFERENCES public.question_options(id) ON DELETE CASCADE,
  is_correct_snapshot BOOLEAN,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON public.student_answers(attempt_id);

-- 13. النتائج المعتمدة
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL UNIQUE REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  earned_score NUMERIC(10,2) NOT NULL,
  max_score NUMERIC(10,2) NOT NULL,
  correct_count INT NOT NULL,
  wrong_count INT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  duration_ms BIGINT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_leaderboard
  ON public.exam_results(grade_id, exam_id, earned_score DESC, duration_ms ASC, submitted_at ASC);
CREATE INDEX IF NOT EXISTS idx_results_student_grade ON public.exam_results(student_id, grade_id);

-- 14. جدولة النشر الخادمية
CREATE TABLE IF NOT EXISTS public.scheduled_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('exam', 'video')),
  target_id UUID NOT NULL,
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  scheduled_for_utc TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed', 'cancelled')),
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_schedule_target
  ON public.scheduled_publications(target_type, target_id)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_schedule_due ON public.scheduled_publications(status, scheduled_for_utc);

-- 15. الشارات (الافتراضية والمخصصة)
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('gold', 'silver', 'bronze')),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('exam_min_pct', 'exam_perfect', 'exams_completed', 'grade_rank_one', 'avg_pct_min_exams')),
  rule_threshold NUMERIC(8,2) NOT NULL,
  secondary_threshold NUMERIC(8,2),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. شارات الطلاب (يمنع منح الشارة مرتين)
CREATE TABLE IF NOT EXISTS public.student_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_student_badges_student ON public.student_badges(student_id, earned_at DESC);

-- 17. الشهادات الرسمية
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  grade_id SMALLINT NOT NULL REFERENCES public.grades(id),
  cert_type TEXT NOT NULL CHECK (cert_type IN ('exam_completion', 'excellence', 'achievement', 'appreciation', 'top_of_grade')),
  title_ar TEXT NOT NULL,
  reason_ar TEXT NOT NULL,
  reference_key TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, cert_type, reference_key)
);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON public.certificates(student_id, issued_at DESC);

-- 18. الإشعارات
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id SMALLINT REFERENCES public.grades(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  link_path TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_grade ON public.notifications(grade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON public.notifications(student_id, is_read, created_at DESC);

-- 19. سجل التدقيق الأمني
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_role TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action, target_id);

-- 20. إعدادات المنصة
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
