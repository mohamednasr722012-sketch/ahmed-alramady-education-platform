-- ============================================================================
-- منصة أحمد الرمادي | ملك اللغة العربية
-- storage_setup.sql — تهيئة حاويات تخزين الفيديوهات والصور في Supabase Storage
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('videos', 'videos', FALSE, 524288000, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('thumbnails', 'thumbnails', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('question-images', 'question-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
