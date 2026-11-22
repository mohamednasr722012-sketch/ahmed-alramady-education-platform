-- ============================================================================
-- منصة أحمد الرمادي | ملك اللغة العربية
-- 004_scale_and_audit_fixes.sql — فهارس الأداء، حقل الاسم المضغوط، وتوسيع التحقق
-- ============================================================================

-- 1. إضافة عمود الاسم الرباعي المضغوط لمنع أي تكرار بالمسافات أو الكلمات المركبة في O(1)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS compact_full_name TEXT;

UPDATE public.students
SET compact_full_name = REPLACE(normalized_full_name, ' ', '')
WHERE compact_full_name IS NULL OR compact_full_name = '';

ALTER TABLE public.students
  ALTER COLUMN compact_full_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_compact_full_name
  ON public.students(compact_full_name);

-- 2. فهارس الأداء للمحاولات والنتائج والشهادات والجلسات
CREATE INDEX IF NOT EXISTS idx_attempts_exam_student_status
  ON public.exam_attempts(exam_id, student_id, status);

CREATE INDEX IF NOT EXISTS idx_certificates_serial
  ON public.certificates(serial_number);

CREATE INDEX IF NOT EXISTS idx_sessions_token_active
  ON public.user_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;
