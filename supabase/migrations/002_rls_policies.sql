-- ============================================================================
-- منصة أحمد الرمادي | ملك اللغة العربية
-- 002_rls_policies.sql — تفعيل Row Level Security وعزل الصفوف الأربعة
-- ============================================================================

-- تفعيل RLS على كافة الجداول
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة العامة المحدودة للبيانات غير الحساسة فقط
DROP POLICY IF EXISTS "public_read_grades" ON public.grades;
CREATE POLICY "public_read_grades" ON public.grades
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "public_read_published_videos" ON public.videos;
CREATE POLICY "public_read_published_videos" ON public.videos
  FOR SELECT USING (publish_status = 'published');

DROP POLICY IF EXISTS "public_read_published_exams" ON public.exams;
CREATE POLICY "public_read_published_exams" ON public.exams
  FOR SELECT USING (publish_status = 'published');

DROP POLICY IF EXISTS "public_read_active_badges" ON public.badges;
CREATE POLICY "public_read_active_badges" ON public.badges
  FOR SELECT USING (is_active = TRUE);

-- عزل تام للجداول الحساسة عن أي وصول مباشر من مفاتيح anon/authenticated العامة:
-- الجداول (students, user_sessions, questions, question_options, exam_attempts,
-- student_answers, exam_results, scheduled_publications, student_badges,
-- certificates, notifications, audit_logs, platform_settings)
-- لا تحتوي على سياسات مفتوحة للعامة، وبالتالي يقتصر الوصول إليها على الخادم
-- الموثق (Express Gateway عبر Service Role) مع التحقق الصارم من الجلسة و grade_id.

-- مثال سياسة عزل في حال ربط Supabase Auth JWT مستقبلًا:
DROP POLICY IF EXISTS "student_own_results_same_grade" ON public.exam_results;
CREATE POLICY "student_own_results_same_grade" ON public.exam_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = exam_results.student_id
        AND s.grade_id = exam_results.grade_id
        AND s.profile_id = auth.uid()
    )
  );
