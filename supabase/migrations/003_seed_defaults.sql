-- ============================================================================
-- منصة أحمد الرمادي | ملك اللغة العربية
-- 003_seed_defaults.sql — البذرة الأساسية: الأدوار، الصفوف الأربعة، الشارات، الإعدادات
-- ============================================================================

INSERT INTO public.roles (id, code, name_ar) VALUES
  (1, 'student', 'طالب'),
  (2, 'teacher_admin', 'الأستاذ / الإدارة')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.grades (id, slug, name_ar, description_ar, sort_order, is_active) VALUES
  (1, 'prep-3', 'الصف الثالث الإعدادي', 'تأسيس متين في النحو والبلاغة والقراءة المتحررة والنصوص بأسلوب مبسط ومنهجي.', 1, TRUE),
  (2, 'sec-1', 'الصف الأول الثانوي', 'انطلاقة المرحلة الثانوية وفهم نظام الأسئلة الحديثة والتحليل البلاغي والأدبي.', 2, TRUE),
  (3, 'sec-2', 'الصف الثاني الثانوي', 'إتقان فروع اللغة العربية والتدريب المكثف على نواتج التعلم والامتحانات المعيارية.', 3, TRUE),
  (4, 'sec-3', 'الصف الثالث الثانوي', 'رحلة التفوق في الثانوية العامة مع تدريبات شاملة وامتحانات محاكية ومعايير دقيقة.', 4, TRUE)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.badges (code, title_ar, description_ar, tier, rule_type, rule_threshold, secondary_threshold, is_system, is_active) VALUES
  ('high_achiever', 'شارة المتفوق', 'تحقيق نسبة 90% فأكثر في أي امتحان رسمي على المنصة.', 'silver', 'exam_min_pct', 90, NULL, TRUE, TRUE),
  ('genius', 'شارة العبقري', 'تحقيق الدرجة النهائية الكاملة 100% في امتحان.', 'gold', 'exam_perfect', 100, NULL, TRUE, TRUE),
  ('continuity', 'شارة الاستمرارية', 'إكمال 5 امتحانات بنجاح والالتزام بالمتابعة المستمرة.', 'bronze', 'exams_completed', 5, NULL, TRUE, TRUE),
  ('perseverance', 'شارة المثابرة', 'إكمال 10 امتحانات والمداومة على التقييم الذاتي.', 'silver', 'exams_completed', 10, NULL, TRUE, TRUE),
  ('grade_champion', 'شارة بطل الصف', 'اعتلاء المركز الأول في الترتيب التراكمي للصف الدراسي.', 'gold', 'grade_rank_one', 1, NULL, TRUE, TRUE),
  ('excellence', 'شارة التميز', 'الحفاظ على متوسط تراكمي 90% فأكثر بعد اجتياز 3 امتحانات على الأقل.', 'gold', 'avg_pct_min_exams', 90, 3, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_settings (key, value_json) VALUES
  ('teacher_profile', '{
    "title": "أحمد الرمادي | ملك اللغة العربية",
    "teacherName": "الأستاذ أحمد الرمادي",
    "headline": "ملك اللغة العربية — خبرة تجمع بين أصالة البيان ومنهجية التفوق الحديثة",
    "bio": "أستاذ اللغة العربية وخبير تدريس النحو والبلاغة والبيان، متخصص في تبسيط قواعد اللغة وتدريب الطلاب على نظام التقييم الحديث عبر امتحانات دقيقة وشروحات مرئية متكاملة.",
    "portraitUrl": "/assets/aistudio/8c90e49c3fc2c338f135fac6a737bb9d_tplv-tiktokx-cropcenter_1080_1080_c7ae25b5.jpeg"
  }'::JSONB),
  ('certificate_rules', '{
    "autoIssueOnExamCompletion": true,
    "excellenceMinPercentage": 90,
    "autoIssueExcellence": true,
    "autoIssueTopOfGrade": true
  }'::JSONB)
ON CONFLICT (key) DO NOTHING;
