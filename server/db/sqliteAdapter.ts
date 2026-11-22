import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: DatabaseSync | null = null;

export function getSqliteDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) return dbInstance;

  const dataDir = path.resolve(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = customPath || path.join(dataDir, 'ramady_platform.sqlite');
  const db = new DatabaseSync(dbPath);
  configureSqlitePragmas(db);
  initSqliteSchema(db);
  seedSqliteDefaults(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

function configureSqlitePragmas(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 8000;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA cache_size = -16000;');
}

export function closeSqliteDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}

export function resetSqliteInstanceForTests(dbPath: string): DatabaseSync {
  closeSqliteDb();
  const db = new DatabaseSync(dbPath);
  configureSqlitePragmas(db);
  initSqliteSchema(db);
  seedSqliteDefaults(db);
  dbInstance = db;
  return db;
}

function initSqliteSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL UNIQUE,
      description_ar TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      full_name TEXT NOT NULL,
      normalized_full_name TEXT NOT NULL UNIQUE,
      compact_full_name TEXT NOT NULL DEFAULT '',
      phone_number TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      last_activity_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_students_grade_status ON students(grade_id, status);

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('student', 'teacher_admin')),
      subject_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      device_label TEXT NOT NULL DEFAULT 'متصفح ويب',
      ip_address TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_subject ON user_sessions(subject_type, subject_id, expires_at);

    CREATE TABLE IF NOT EXISTS video_categories (
      id TEXT PRIMARY KEY,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      unit_title TEXT NOT NULL,
      lesson_title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      UNIQUE(grade_id, unit_title, lesson_title)
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      category_id TEXT REFERENCES video_categories(id) ON DELETE SET NULL,
      unit_title TEXT NOT NULL,
      lesson_title TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL,
      thumbnail_path TEXT,
      duration_seconds INTEGER,
      file_size_bytes INTEGER,
      publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft', 'scheduled', 'published', 'hidden')),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_videos_grade_status ON videos(grade_id, publish_status, published_at);

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      unit_title TEXT NOT NULL DEFAULT '',
      lesson_title TEXT NOT NULL DEFAULT '',
      question_count INTEGER NOT NULL DEFAULT 10 CHECK (question_count > 0),
      points_per_question REAL NOT NULL DEFAULT 10 CHECK (points_per_question > 0),
      total_points REAL NOT NULL DEFAULT 100 CHECK (total_points > 0),
      duration_minutes INTEGER NOT NULL DEFAULT 10 CHECK (duration_minutes > 0),
      max_attempts INTEGER DEFAULT 1 CHECK (max_attempts IS NULL OR max_attempts > 0),
      opens_at TEXT,
      closes_at TEXT,
      publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft', 'scheduled', 'published', 'closed')),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_exams_grade_status ON exams(grade_id, publish_status);

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_order INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      image_path TEXT,
      points REAL NOT NULL DEFAULT 10 CHECK (points > 0),
      UNIQUE(exam_id, question_order)
    );

    CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_order INTEGER NOT NULL,
      option_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      UNIQUE(question_id, option_order)
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      submitted_at TEXT,
      duration_ms INTEGER,
      UNIQUE(exam_id, student_id, attempt_number)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_attempt_per_student_exam
      ON exam_attempts(exam_id, student_id)
      WHERE status = 'in_progress';

    CREATE TABLE IF NOT EXISTS student_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_id TEXT NOT NULL REFERENCES question_options(id) ON DELETE CASCADE,
      is_correct_snapshot INTEGER,
      saved_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL UNIQUE REFERENCES exam_attempts(id) ON DELETE CASCADE,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      earned_score REAL NOT NULL,
      max_score REAL NOT NULL,
      correct_count INTEGER NOT NULL,
      wrong_count INTEGER NOT NULL,
      percentage REAL NOT NULL,
      duration_ms INTEGER NOT NULL,
      submitted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_results_leaderboard ON exam_results(grade_id, exam_id, earned_score DESC, duration_ms ASC, submitted_at ASC);

    CREATE TABLE IF NOT EXISTS scheduled_publications (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('exam', 'video')),
      target_id TEXT NOT NULL,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      scheduled_for_utc TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed', 'cancelled')),
      executed_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_schedule_target
      ON scheduled_publications(target_type, target_id)
      WHERE status IN ('pending', 'processing');

    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title_ar TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('gold', 'silver', 'bronze')),
      rule_type TEXT NOT NULL CHECK (rule_type IN ('exam_min_pct', 'exam_perfect', 'exams_completed', 'grade_rank_one', 'avg_pct_min_exams')),
      rule_threshold REAL NOT NULL,
      secondary_threshold REAL,
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_badges (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL,
      earned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      serial_number TEXT NOT NULL UNIQUE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      grade_id INTEGER NOT NULL REFERENCES grades(id),
      cert_type TEXT NOT NULL CHECK (cert_type IN ('exam_completion', 'excellence', 'achievement', 'appreciation', 'top_of_grade')),
      title_ar TEXT NOT NULL,
      reason_ar TEXT NOT NULL,
      reference_key TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, cert_type, reference_key)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      grade_id INTEGER REFERENCES grades(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      body_ar TEXT NOT NULL,
      link_path TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_role TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_active ON user_sessions(token_hash, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_attempts_student_status ON exam_attempts(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_attempts_exam_student_status ON exam_attempts(exam_id, student_id, status);
    CREATE INDEX IF NOT EXISTS idx_answers_attempt ON student_answers(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_results_student_grade ON exam_results(student_id, grade_id);
    CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_student_grade ON certificates(student_id, grade_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_serial ON certificates(serial_number);
    CREATE INDEX IF NOT EXISTS idx_notifications_grade_created ON notifications(grade_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_student_created ON notifications(student_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  const studentCols = db.prepare('PRAGMA table_info(students)').all() as Array<{ name: string }>;
  if (!studentCols.some((c) => c.name === 'compact_full_name')) {
    db.exec("ALTER TABLE students ADD COLUMN compact_full_name TEXT NOT NULL DEFAULT '';");
  }
  db.exec(
    "UPDATE students SET compact_full_name = REPLACE(normalized_full_name, ' ', '') WHERE compact_full_name IS NULL OR compact_full_name = '';"
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_students_compact_full_name ON students(compact_full_name);'
  );
}

function seedSqliteDefaults(db: DatabaseSync): void {
  db.exec(`
    INSERT OR IGNORE INTO roles (id, code, name_ar) VALUES
      (1, 'student', 'طالب'),
      (2, 'teacher_admin', 'الأستاذ / الإدارة');

    INSERT OR IGNORE INTO grades (id, slug, name_ar, description_ar, sort_order, is_active) VALUES
      (1, 'prep-3', 'الصف الثالث الإعدادي', 'تأسيس متين في النحو والبلاغة والقراءة المتحررة والنصوص بأسلوب مبسط ومنهجي.', 1, 1),
      (2, 'sec-1', 'الصف الأول الثانوي', 'انطلاقة المرحلة الثانوية وفهم نظام الأسئلة الحديثة والتحليل البلاغي والأدبي.', 2, 1),
      (3, 'sec-2', 'الصف الثاني الثانوي', 'إتقان فروع اللغة العربية والتدريب المكثف على نواتج التعلم والامتحانات المعيارية.', 3, 1),
      (4, 'sec-3', 'الصف الثالث الثانوي', 'رحلة التفوق في الثانوية العامة مع تدريبات شاملة وامتحانات محاكية ومعايير دقيقة.', 4, 1);
  `);

  const targetGrades: Array<[number, string, string, string, string]> = [
    [1, 'grade-1', 'prep-3', 'الصف الثالث الإعدادي', 'تأسيس متين في النحو والبلاغة والقراءة المتحررة والنصوص بأسلوب مبسط ومنهجي.'],
    [2, 'grade-2', 'sec-1', 'الصف الأول الثانوي', 'انطلاقة المرحلة الثانوية وفهم نظام الأسئلة الحديثة والتحليل البلاغي والأدبي.'],
    [3, 'grade-3', 'sec-2', 'الصف الثاني الثانوي', 'إتقان فروع اللغة العربية والتدريب المكثف على نواتج التعلم والامتحانات المعيارية.'],
    [4, 'grade-4', 'sec-3', 'الصف الثالث الثانوي', 'رحلة التفوق في الثانوية العامة مع تدريبات شاملة وامتحانات محاكية ومعايير دقيقة.'],
  ];
  const migrateGradeStmt = db.prepare(
    `UPDATE grades SET slug = ?, name_ar = ?, description_ar = ? WHERE id = ? AND slug = ?`
  );
  for (const [id, tempSlug, targetSlug, targetName, targetDesc] of targetGrades) {
    migrateGradeStmt.run(targetSlug, targetName, targetDesc, id, tempSlug);
  }

  const badgeCount = db.prepare('SELECT COUNT(*) AS c FROM badges').get() as { c: number };
  if (badgeCount.c === 0) {
    const insertBadge = db.prepare(`
      INSERT INTO badges (id, code, title_ar, description_ar, tier, rule_type, rule_threshold, secondary_threshold, is_system, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
    `);
    const defaults: Array<[string, string, string, string, string, number, number | null]> = [
      ['high_achiever', 'شارة المتفوق', 'تحقيق نسبة 90% فأكثر في أي امتحان رسمي على المنصة.', 'silver', 'exam_min_pct', 90, null],
      ['genius', 'شارة العبقري', 'تحقيق الدرجة النهائية الكاملة 100% في امتحان.', 'gold', 'exam_perfect', 100, null],
      ['continuity', 'شارة الاستمرارية', 'إكمال 5 امتحانات بنجاح والالتزام بالمتابعة المستمرة.', 'bronze', 'exams_completed', 5, null],
      ['perseverance', 'شارة المثابرة', 'إكمال 10 امتحانات والمداومة على التقييم الذاتي.', 'silver', 'exams_completed', 10, null],
      ['grade_champion', 'شارة بطل الصف', 'اعتلاء المركز الأول في الترتيب التراكمي للصف الدراسي.', 'gold', 'grade_rank_one', 1, null],
      ['excellence', 'شارة التميز', 'الحفاظ على متوسط تراكمي 90% فأكثر بعد اجتياز 3 امتحانات على الأقل.', 'gold', 'avg_pct_min_exams', 90, 3],
    ];
    for (const [code, title, desc, tier, rule, thresh, sec] of defaults) {
      insertBadge.run(crypto.randomUUID(), code, title, desc, tier, rule, thresh, sec);
    }
  }

  const upsertSetting = db.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_json) VALUES (?, ?)
  `);
  const defaultBio =
    'أستاذ اللغة العربية وخبير تدريس النحو والبلاغة والبيان، متخصص في تبسيط قواعد اللغة وتدريب الطلاب على نظام التقييم الحديث عبر امتحانات دقيقة وشروحات مرئية متكاملة.';
  const defaultProfile = {
    title: 'أحمد الرمادي | ملك اللغة العربية',
    teacherName: 'الأستاذ أحمد الرمادي',
    headline: 'ملك اللغة العربية — خبرة تجمع بين أصالة البيان ومنهجية التفوق الحديثة',
    bio: defaultBio,
    portraitUrl: '/assets/aistudio/8c90e49c3fc2c338f135fac6a737bb9d_tplv-tiktokx-cropcenter_1080_1080_c7ae25b5.jpeg',
  };
  upsertSetting.run('teacher_profile', JSON.stringify(defaultProfile));
  const existingProfile = db
    .prepare("SELECT value_json FROM platform_settings WHERE key = 'teacher_profile'")
    .get() as { value_json: string } | undefined;
  if (existingProfile?.value_json.includes('للمرحلتين الإعدادية والثانوية')) {
    const parsed = JSON.parse(existingProfile.value_json) as Record<string, unknown>;
    parsed.bio = defaultBio;
    db.prepare("UPDATE platform_settings SET value_json = ? WHERE key = 'teacher_profile'").run(
      JSON.stringify(parsed)
    );
  }
  upsertSetting.run(
    'certificate_rules',
    JSON.stringify({
      autoIssueOnExamCompletion: true,
      excellenceMinPercentage: 90,
      autoIssueExcellence: true,
      autoIssueTopOfGrade: true,
    })
  );
}
