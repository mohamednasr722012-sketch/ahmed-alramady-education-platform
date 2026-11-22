import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.ts';
import { getSqliteDb } from './sqliteAdapter.ts';
import { fetchAllSupabaseRows } from './supabasePager.ts';
import type {
  ExamRecord,
  NotificationRecord,
  QuestionOptionRecord,
  QuestionRecord,
  ScheduledPublicationRecord,
  VideoRecord,
} from './types.ts';

function mapSqliteVideo(r: Record<string, unknown>): VideoRecord {
  return {
    id: String(r.id),
    grade_id: Number(r.grade_id),
    category_id: r.category_id ? String(r.category_id) : null,
    unit_title: String(r.unit_title),
    lesson_title: String(r.lesson_title),
    title: String(r.title),
    description: String(r.description || ''),
    storage_path: String(r.storage_path),
    thumbnail_path: r.thumbnail_path ? String(r.thumbnail_path) : null,
    duration_seconds: r.duration_seconds !== null ? Number(r.duration_seconds) : null,
    file_size_bytes: r.file_size_bytes !== null ? Number(r.file_size_bytes) : null,
    publish_status: r.publish_status as VideoRecord['publish_status'],
    published_at: r.published_at ? String(r.published_at) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

function mapSqliteExam(r: Record<string, unknown>): ExamRecord {
  return {
    id: String(r.id),
    grade_id: Number(r.grade_id),
    title: String(r.title),
    description: String(r.description || ''),
    unit_title: String(r.unit_title || ''),
    lesson_title: String(r.lesson_title || ''),
    question_count: Number(r.question_count),
    points_per_question: Number(r.points_per_question),
    total_points: Number(r.total_points),
    duration_minutes: Number(r.duration_minutes),
    max_attempts: r.max_attempts !== null && r.max_attempts !== undefined ? Number(r.max_attempts) : null,
    opens_at: r.opens_at ? String(r.opens_at) : null,
    closes_at: r.closes_at ? String(r.closes_at) : null,
    publish_status: r.publish_status as ExamRecord['publish_status'],
    published_at: r.published_at ? String(r.published_at) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

// ---------- Videos ----------

export async function ensureVideoCategory(gradeId: number, unitTitle: string, lessonTitle: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: existing } = await supabase
      .from('video_categories')
      .select('id')
      .eq('grade_id', gradeId)
      .eq('unit_title', unitTitle)
      .eq('lesson_title', lessonTitle)
      .maybeSingle();
    if (existing) return String(existing.id);

    const id = crypto.randomUUID();
    const { data, error } = await supabase
      .from('video_categories')
      .insert({ id, grade_id: gradeId, unit_title: unitTitle, lesson_title: lessonTitle, sort_order: 1 })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return String(data.id);
  }

  const db = getSqliteDb();
  const existing = db
    .prepare('SELECT id FROM video_categories WHERE grade_id = ? AND unit_title = ? AND lesson_title = ?')
    .get(gradeId, unitTitle, lessonTitle) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO video_categories (id, grade_id, unit_title, lesson_title, sort_order) VALUES (?, ?, ?, ?, 1)'
  ).run(id, gradeId, unitTitle, lessonTitle);
  return id;
}

export async function createVideo(input: {
  gradeId: number;
  unitTitle: string;
  lessonTitle: string;
  title: string;
  description: string;
  storagePath: string;
  thumbnailPath: string | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  publishStatus: 'draft' | 'scheduled' | 'published' | 'hidden';
  publishedAt: string | null;
}): Promise<VideoRecord> {
  const categoryId = await ensureVideoCategory(input.gradeId, input.unitTitle, input.lessonTitle);
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('videos')
      .insert({
        id,
        grade_id: input.gradeId,
        category_id: categoryId,
        unit_title: input.unitTitle,
        lesson_title: input.lessonTitle,
        title: input.title,
        description: input.description,
        storage_path: input.storagePath,
        thumbnail_path: input.thumbnailPath,
        duration_seconds: input.durationSeconds ?? null,
        file_size_bytes: input.fileSizeBytes ?? null,
        publish_status: input.publishStatus,
        published_at: input.publishedAt,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as VideoRecord;
  }

  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO videos (
      id, grade_id, category_id, unit_title, lesson_title, title, description,
      storage_path, thumbnail_path, duration_seconds, file_size_bytes,
      publish_status, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.gradeId,
    categoryId,
    input.unitTitle,
    input.lessonTitle,
    input.title,
    input.description,
    input.storagePath,
    input.thumbnailPath,
    input.durationSeconds ?? null,
    input.fileSizeBytes ?? null,
    input.publishStatus,
    input.publishedAt,
    nowIso,
    nowIso
  );
  const created = await getVideoById(id);
  if (!created) throw new Error('تعذر حفظ بيانات الفيديو.');
  return created;
}

export async function listVideos(filters?: {
  gradeId?: number;
  publishedOnly?: boolean;
  unitTitle?: string;
  lessonTitle?: string;
  limit?: number;
}): Promise<VideoRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    if (filters?.limit) {
      let q = supabase.from('videos').select('*').order('created_at', { ascending: false });
      if (filters.gradeId) q = q.eq('grade_id', filters.gradeId);
      if (filters.publishedOnly) q = q.eq('publish_status', 'published');
      if (filters.unitTitle) q = q.eq('unit_title', filters.unitTitle);
      if (filters.lessonTitle) q = q.eq('lesson_title', filters.lessonTitle);
      q = q.limit(filters.limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []) as VideoRecord[];
    }
    return fetchAllSupabaseRows<VideoRecord>((from, to) => {
      let q = supabase.from('videos').select('*').order('created_at', { ascending: false }).range(from, to);
      if (filters?.gradeId) q = q.eq('grade_id', filters.gradeId);
      if (filters?.publishedOnly) q = q.eq('publish_status', 'published');
      if (filters?.unitTitle) q = q.eq('unit_title', filters.unitTitle);
      if (filters?.lessonTitle) q = q.eq('lesson_title', filters.lessonTitle);
      return q;
    });
  }

  const db = getSqliteDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.gradeId) {
    clauses.push('grade_id = ?');
    params.push(filters.gradeId);
  }
  if (filters?.publishedOnly) {
    clauses.push("publish_status = 'published'");
  }
  if (filters?.unitTitle) {
    clauses.push('unit_title = ?');
    params.push(filters.unitTitle);
  }
  if (filters?.lessonTitle) {
    clauses.push('lesson_title = ?');
    params.push(filters.lessonTitle);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = filters?.limit ? `LIMIT ${Number(filters.limit)}` : '';
  const rows = db
    .prepare(`SELECT * FROM videos ${whereSql} ORDER BY COALESCE(published_at, created_at) DESC ${limitSql}`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteVideo);
}

export async function getVideoById(videoId: string): Promise<VideoRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from('videos').select('*').eq('id', videoId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as VideoRecord) || null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId) as Record<string, unknown> | undefined;
  return row ? mapSqliteVideo(row) : null;
}

export async function isPublishedVideoAccessibleToGrade(
  storagePath: string,
  gradeId: number
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from('videos')
      .select('id')
      .eq('storage_path', storagePath)
      .eq('grade_id', gradeId)
      .eq('publish_status', 'published')
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }
  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT id FROM videos WHERE storage_path = ? AND grade_id = ? AND publish_status = 'published' LIMIT 1`
    )
    .get(storagePath, gradeId);
  return Boolean(row);
}

export async function isPublishedQuestionImageAccessibleToGrade(
  imagePath: string,
  gradeId: number
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from('questions')
      .select('id, exams!inner(grade_id, publish_status)')
      .eq('image_path', imagePath)
      .eq('exams.grade_id', gradeId)
      .eq('exams.publish_status', 'published')
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }
  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT q.id FROM questions q
       JOIN exams e ON e.id = q.exam_id
       WHERE q.image_path = ? AND e.grade_id = ? AND e.publish_status = 'published'
       LIMIT 1`
    )
    .get(imagePath, gradeId);
  return Boolean(row);
}

export async function updateVideo(
  videoId: string,
  updates: Partial<{
    grade_id: number;
    unit_title: string;
    lesson_title: string;
    title: string;
    description: string;
    thumbnail_path: string | null;
    publish_status: VideoRecord['publish_status'];
    published_at: string | null;
  }>
): Promise<VideoRecord | null> {
  const existing = await getVideoById(videoId);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const nextGrade = updates.grade_id ?? existing.grade_id;
  const nextUnit = updates.unit_title ?? existing.unit_title;
  const nextLesson = updates.lesson_title ?? existing.lesson_title;
  const categoryId = await ensureVideoCategory(nextGrade, nextUnit, nextLesson);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('videos')
      .update({
        ...updates,
        category_id: categoryId,
        updated_at: nowIso,
      })
      .eq('id', videoId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as VideoRecord;
  }

  const db = getSqliteDb();
  db.prepare(
    `UPDATE videos SET
      grade_id = ?, category_id = ?, unit_title = ?, lesson_title = ?,
      title = ?, description = ?, thumbnail_path = ?, publish_status = ?,
      published_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    nextGrade,
    categoryId,
    nextUnit,
    nextLesson,
    updates.title ?? existing.title,
    updates.description ?? existing.description,
    updates.thumbnail_path !== undefined ? updates.thumbnail_path : existing.thumbnail_path,
    updates.publish_status ?? existing.publish_status,
    updates.published_at !== undefined ? updates.published_at : existing.published_at,
    nowIso,
    videoId
  );
  return getVideoById(videoId);
}

export async function deleteVideo(videoId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from('videos').delete().eq('id', videoId);
    if (error) throw new Error(error.message);
    return true;
  }
  const db = getSqliteDb();
  const info = db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
  return info.changes > 0;
}

// ---------- Exams & Questions (NO Question Bank) ----------

export interface QuestionInput {
  questionText: string;
  imagePath?: string | null;
  points?: number;
  options: Array<{ optionText: string; isCorrect: boolean }>;
}

export async function createExamWithQuestions(input: {
  gradeId: number;
  title: string;
  description: string;
  unitTitle: string;
  lessonTitle: string;
  pointsPerQuestion: number;
  durationMinutes: number;
  maxAttempts: number | null;
  opensAt: string | null;
  closesAt: string | null;
  publishStatus: 'draft' | 'scheduled' | 'published' | 'closed';
  publishedAt: string | null;
  questions: QuestionInput[];
}): Promise<ExamRecord> {
  const examId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const questionCount = input.questions.length;
  const totalPoints = input.questions.reduce(
    (sum, q) => sum + (q.points && q.points > 0 ? q.points : input.pointsPerQuestion),
    0
  );

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: exam, error: examErr } = await supabase
      .from('exams')
      .insert({
        id: examId,
        grade_id: input.gradeId,
        title: input.title,
        description: input.description,
        unit_title: input.unitTitle,
        lesson_title: input.lessonTitle,
        question_count: questionCount,
        points_per_question: input.pointsPerQuestion,
        total_points: totalPoints,
        duration_minutes: input.durationMinutes,
        max_attempts: input.maxAttempts,
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        publish_status: input.publishStatus,
        published_at: input.publishedAt,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (examErr) throw new Error(examErr.message);

    for (let qi = 0; qi < input.questions.length; qi++) {
      const qInput = input.questions[qi];
      const questionId = crypto.randomUUID();
      const qPts = qInput.points && qInput.points > 0 ? qInput.points : input.pointsPerQuestion;
      const { error: qErr } = await supabase.from('questions').insert({
        id: questionId,
        exam_id: examId,
        question_order: qi + 1,
        question_text: qInput.questionText,
        image_path: qInput.imagePath || null,
        points: qPts,
      });
      if (qErr) throw new Error(qErr.message);

      const optionRows = qInput.options.map((opt, oi) => ({
        id: crypto.randomUUID(),
        question_id: questionId,
        option_order: oi + 1,
        option_text: opt.optionText,
        is_correct: Boolean(opt.isCorrect),
      }));
      const { error: optErr } = await supabase.from('question_options').insert(optionRows);
      if (optErr) throw new Error(optErr.message);
    }

    return exam as ExamRecord;
  }

  const db = getSqliteDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO exams (
        id, grade_id, title, description, unit_title, lesson_title,
        question_count, points_per_question, total_points, duration_minutes,
        max_attempts, opens_at, closes_at, publish_status, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      examId,
      input.gradeId,
      input.title,
      input.description,
      input.unitTitle,
      input.lessonTitle,
      questionCount,
      input.pointsPerQuestion,
      totalPoints,
      input.durationMinutes,
      input.maxAttempts,
      input.opensAt,
      input.closesAt,
      input.publishStatus,
      input.publishedAt,
      nowIso,
      nowIso
    );

    const insertQ = db.prepare(
      `INSERT INTO questions (id, exam_id, question_order, question_text, image_path, points)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertOpt = db.prepare(
      `INSERT INTO question_options (id, question_id, option_order, option_text, is_correct)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (let qi = 0; qi < input.questions.length; qi++) {
      const qInput = input.questions[qi];
      const questionId = crypto.randomUUID();
      const qPts = qInput.points && qInput.points > 0 ? qInput.points : input.pointsPerQuestion;
      insertQ.run(questionId, examId, qi + 1, qInput.questionText, qInput.imagePath || null, qPts);
      for (let oi = 0; oi < qInput.options.length; oi++) {
        const opt = qInput.options[oi];
        insertOpt.run(crypto.randomUUID(), questionId, oi + 1, opt.optionText, opt.isCorrect ? 1 : 0);
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const created = await getExamById(examId);
  if (!created) throw new Error('تعذر إنشاء الامتحان.');
  return created;
}

export async function listExams(filters?: {
  gradeId?: number;
  publishedOnly?: boolean;
  limit?: number;
}): Promise<ExamRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    if (filters?.limit) {
      let q = supabase.from('exams').select('*').order('created_at', { ascending: false });
      if (filters.gradeId) q = q.eq('grade_id', filters.gradeId);
      if (filters.publishedOnly) q = q.eq('publish_status', 'published');
      q = q.limit(filters.limit);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []) as ExamRecord[];
    }
    return fetchAllSupabaseRows<ExamRecord>((from, to) => {
      let q = supabase.from('exams').select('*').order('created_at', { ascending: false }).range(from, to);
      if (filters?.gradeId) q = q.eq('grade_id', filters.gradeId);
      if (filters?.publishedOnly) q = q.eq('publish_status', 'published');
      return q;
    });
  }

  const db = getSqliteDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.gradeId) {
    clauses.push('grade_id = ?');
    params.push(filters.gradeId);
  }
  if (filters?.publishedOnly) {
    clauses.push("publish_status = 'published'");
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limitSql = filters?.limit ? `LIMIT ${Number(filters.limit)}` : '';
  const rows = db
    .prepare(`SELECT * FROM exams ${whereSql} ORDER BY created_at DESC ${limitSql}`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteExam);
}

export async function getExamById(examId: string): Promise<ExamRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from('exams').select('*').eq('id', examId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ExamRecord) || null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as Record<string, unknown> | undefined;
  return row ? mapSqliteExam(row) : null;
}

export async function getExamQuestions(
  examId: string,
  options: { includeCorrectAnswers: boolean }
): Promise<
  Array<
    QuestionRecord & {
      options: Array<Omit<QuestionOptionRecord, 'is_correct'> & { is_correct?: boolean }>;
    }
  >
> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('question_order', { ascending: true });
    if (qErr) throw new Error(qErr.message);

    const qIds = (questions || []).map((q) => q.id);
    if (qIds.length === 0) return [];

    const selectCols = options.includeCorrectAnswers
      ? 'id, question_id, option_order, option_text, is_correct'
      : 'id, question_id, option_order, option_text';

    const { data: opts, error: optErr } = await supabase
      .from('question_options')
      .select(selectCols)
      .in('question_id', qIds)
      .order('option_order', { ascending: true });
    if (optErr) throw new Error(optErr.message);

    const byQ = new Map<string, Array<Omit<QuestionOptionRecord, 'is_correct'> & { is_correct?: boolean }>>();
    for (const o of (opts || []) as unknown as Array<Record<string, unknown>>) {
      const qid = String(o.question_id);
      if (!byQ.has(qid)) byQ.set(qid, []);
      const item: Omit<QuestionOptionRecord, 'is_correct'> & { is_correct?: boolean } = {
        id: String(o.id),
        question_id: qid,
        option_order: Number(o.option_order),
        option_text: String(o.option_text),
      };
      if (options.includeCorrectAnswers) {
        item.is_correct = Boolean(o.is_correct);
      }
      byQ.get(qid)!.push(item);
    }

    return (questions || []).map((q) => ({
      ...(q as QuestionRecord),
      options: byQ.get(String(q.id)) || [],
    }));
  }

  const db = getSqliteDb();
  const qRows = db
    .prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY question_order ASC')
    .all(examId) as Array<Record<string, unknown>>;

  if (qRows.length === 0) return [];

  const qIds = qRows.map((q) => String(q.id));
  const placeholders = qIds.map(() => '?').join(', ');
  const optRows = db
    .prepare(
      `SELECT id, question_id, option_order, option_text, is_correct
       FROM question_options
       WHERE question_id IN (${placeholders})
       ORDER BY option_order ASC`
    )
    .all(...qIds) as Array<Record<string, unknown>>;

  const optsByQ = new Map<string, Array<Omit<QuestionOptionRecord, 'is_correct'> & { is_correct?: boolean }>>();
  for (const o of optRows) {
    const qid = String(o.question_id);
    if (!optsByQ.has(qid)) optsByQ.set(qid, []);
    const base: Omit<QuestionOptionRecord, 'is_correct'> & { is_correct?: boolean } = {
      id: String(o.id),
      question_id: qid,
      option_order: Number(o.option_order),
      option_text: String(o.option_text),
    };
    if (options.includeCorrectAnswers) {
      base.is_correct = Boolean(o.is_correct);
    }
    optsByQ.get(qid)!.push(base);
  }

  return qRows.map((q) => {
    const qid = String(q.id);
    return {
      id: qid,
      exam_id: String(q.exam_id),
      question_order: Number(q.question_order),
      question_text: String(q.question_text),
      image_path: q.image_path ? String(q.image_path) : null,
      points: Number(q.points),
      options: optsByQ.get(qid) || [],
    };
  });
}

export async function updateExam(
  examId: string,
  updates: Partial<{
    grade_id: number;
    title: string;
    description: string;
    unit_title: string;
    lesson_title: string;
    duration_minutes: number;
    max_attempts: number | null;
    opens_at: string | null;
    closes_at: string | null;
    publish_status: ExamRecord['publish_status'];
    published_at: string | null;
  }>,
  replacementQuestions?: QuestionInput[]
): Promise<ExamRecord | null> {
  const existing = await getExamById(examId);
  if (!existing) return null;
  const nowIso = new Date().toISOString();

  let questionCount = existing.question_count;
  let totalPoints = existing.total_points;
  if (replacementQuestions && replacementQuestions.length > 0) {
    questionCount = replacementQuestions.length;
    totalPoints = replacementQuestions.reduce(
      (sum, q) => sum + (q.points && q.points > 0 ? q.points : existing.points_per_question),
      0
    );
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from('exams')
      .update({
        ...updates,
        question_count: questionCount,
        total_points: totalPoints,
        updated_at: nowIso,
      })
      .eq('id', examId);
    if (error) throw new Error(error.message);

    if (replacementQuestions && replacementQuestions.length > 0) {
      await supabase.from('questions').delete().eq('exam_id', examId);
      for (let qi = 0; qi < replacementQuestions.length; qi++) {
        const qInput = replacementQuestions[qi];
        const questionId = crypto.randomUUID();
        const qPts = qInput.points && qInput.points > 0 ? qInput.points : existing.points_per_question;
        await supabase.from('questions').insert({
          id: questionId,
          exam_id: examId,
          question_order: qi + 1,
          question_text: qInput.questionText,
          image_path: qInput.imagePath || null,
          points: qPts,
        });
        await supabase.from('question_options').insert(
          qInput.options.map((opt, oi) => ({
            id: crypto.randomUUID(),
            question_id: questionId,
            option_order: oi + 1,
            option_text: opt.optionText,
            is_correct: Boolean(opt.isCorrect),
          }))
        );
      }
    }
    return getExamById(examId);
  }

  const db = getSqliteDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `UPDATE exams SET
        grade_id = ?, title = ?, description = ?, unit_title = ?, lesson_title = ?,
        question_count = ?, total_points = ?, duration_minutes = ?, max_attempts = ?,
        opens_at = ?, closes_at = ?, publish_status = ?, published_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      updates.grade_id ?? existing.grade_id,
      updates.title ?? existing.title,
      updates.description ?? existing.description,
      updates.unit_title ?? existing.unit_title,
      updates.lesson_title ?? existing.lesson_title,
      questionCount,
      totalPoints,
      updates.duration_minutes ?? existing.duration_minutes,
      updates.max_attempts !== undefined ? updates.max_attempts : existing.max_attempts,
      updates.opens_at !== undefined ? updates.opens_at : existing.opens_at,
      updates.closes_at !== undefined ? updates.closes_at : existing.closes_at,
      updates.publish_status ?? existing.publish_status,
      updates.published_at !== undefined ? updates.published_at : existing.published_at,
      nowIso,
      examId
    );

    if (replacementQuestions && replacementQuestions.length > 0) {
      db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);
      const insertQ = db.prepare(
        `INSERT INTO questions (id, exam_id, question_order, question_text, image_path, points)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const insertOpt = db.prepare(
        `INSERT INTO question_options (id, question_id, option_order, option_text, is_correct)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (let qi = 0; qi < replacementQuestions.length; qi++) {
        const qInput = replacementQuestions[qi];
        const questionId = crypto.randomUUID();
        const qPts = qInput.points && qInput.points > 0 ? qInput.points : existing.points_per_question;
        insertQ.run(questionId, examId, qi + 1, qInput.questionText, qInput.imagePath || null, qPts);
        for (let oi = 0; oi < qInput.options.length; oi++) {
          const opt = qInput.options[oi];
          insertOpt.run(crypto.randomUUID(), questionId, oi + 1, opt.optionText, opt.isCorrect ? 1 : 0);
        }
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return getExamById(examId);
}

export async function deleteExam(examId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from('exams').delete().eq('id', examId);
    if (error) throw new Error(error.message);
    return true;
  }
  const db = getSqliteDb();
  const info = db.prepare('DELETE FROM exams WHERE id = ?').run(examId);
  return info.changes > 0;
}

// ---------- Scheduled Publications ----------

export async function upsertSchedule(input: {
  targetType: 'exam' | 'video';
  targetId: string;
  gradeId: number;
  scheduledForUtc: string;
  timezone: string;
}): Promise<ScheduledPublicationRecord> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('scheduled_publications')
      .update({ status: 'cancelled' })
      .eq('target_type', input.targetType)
      .eq('target_id', input.targetId)
      .eq('status', 'pending');

    const { data, error } = await supabase
      .from('scheduled_publications')
      .insert({
        id,
        target_type: input.targetType,
        target_id: input.targetId,
        grade_id: input.gradeId,
        scheduled_for_utc: input.scheduledForUtc,
        timezone: input.timezone,
        status: 'pending',
        created_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ScheduledPublicationRecord;
  }

  const db = getSqliteDb();
  db.prepare(
    `UPDATE scheduled_publications SET status = 'cancelled' WHERE target_type = ? AND target_id = ? AND status = 'pending'`
  ).run(input.targetType, input.targetId);
  db.prepare(
    `INSERT INTO scheduled_publications (id, target_type, target_id, grade_id, scheduled_for_utc, timezone, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, input.targetType, input.targetId, input.gradeId, input.scheduledForUtc, input.timezone, nowIso);
  return {
    id,
    target_type: input.targetType,
    target_id: input.targetId,
    grade_id: input.gradeId,
    scheduled_for_utc: input.scheduledForUtc,
    timezone: input.timezone,
    status: 'pending',
    executed_at: null,
    error_message: null,
    created_at: nowIso,
  };
}

export async function listSchedules(): Promise<ScheduledPublicationRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('scheduled_publications')
      .select('*')
      .order('scheduled_for_utc', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data || []) as ScheduledPublicationRecord[];
  }
  const db = getSqliteDb();
  return db
    .prepare('SELECT * FROM scheduled_publications ORDER BY scheduled_for_utc DESC LIMIT 100')
    .all() as unknown as ScheduledPublicationRecord[];
}

export async function claimDueSchedules(nowIso: string): Promise<ScheduledPublicationRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: due, error } = await supabase
      .from('scheduled_publications')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for_utc', nowIso);
    if (error) throw new Error(error.message);
    const claimed: ScheduledPublicationRecord[] = [];
    for (const item of due || []) {
      const { data: updated } = await supabase
        .from('scheduled_publications')
        .update({ status: 'processing' })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
      if (updated) claimed.push(updated as ScheduledPublicationRecord);
    }
    return claimed;
  }

  const db = getSqliteDb();
  const due = db
    .prepare(`SELECT * FROM scheduled_publications WHERE status = 'pending' AND scheduled_for_utc <= ?`)
    .all(nowIso) as unknown as ScheduledPublicationRecord[];
  const claimed: ScheduledPublicationRecord[] = [];
  for (const item of due) {
    const res = db
      .prepare(`UPDATE scheduled_publications SET status = 'processing' WHERE id = ? AND status = 'pending'`)
      .run(item.id);
    if (res.changes > 0) claimed.push({ ...item, status: 'processing' });
  }
  return claimed;
}

export async function finishSchedule(
  scheduleId: string,
  status: 'published' | 'failed',
  errorMessage?: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('scheduled_publications')
      .update({ status, executed_at: nowIso, error_message: errorMessage || null })
      .eq('id', scheduleId);
    return;
  }
  const db = getSqliteDb();
  db.prepare(
    `UPDATE scheduled_publications SET status = ?, executed_at = ?, error_message = ? WHERE id = ?`
  ).run(status, nowIso, errorMessage || null, scheduleId);
}

export async function cancelSchedule(scheduleId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('scheduled_publications')
      .update({ status: 'cancelled' })
      .eq('id', scheduleId)
      .eq('status', 'pending');
    return;
  }
  const db = getSqliteDb();
  db.prepare(`UPDATE scheduled_publications SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(
    scheduleId
  );
}

// ---------- Notifications ----------

export async function createNotification(input: {
  gradeId?: number | null;
  studentId?: string | null;
  type: string;
  titleAr: string;
  bodyAr: string;
  linkPath?: string | null;
}): Promise<NotificationRecord> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        id,
        grade_id: input.gradeId ?? null,
        student_id: input.studentId ?? null,
        type: input.type,
        title_ar: input.titleAr,
        body_ar: input.bodyAr,
        link_path: input.linkPath ?? null,
        is_read: false,
        created_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as NotificationRecord;
  }

  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO notifications (id, grade_id, student_id, type, title_ar, body_ar, link_path, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    input.gradeId ?? null,
    input.studentId ?? null,
    input.type,
    input.titleAr,
    input.bodyAr,
    input.linkPath ?? null,
    nowIso
  );
  return {
    id,
    grade_id: input.gradeId ?? null,
    student_id: input.studentId ?? null,
    type: input.type,
    title_ar: input.titleAr,
    body_ar: input.bodyAr,
    link_path: input.linkPath ?? null,
    is_read: false,
    created_at: nowIso,
  };
}

export async function listStudentNotifications(studentId: string, gradeId: number): Promise<NotificationRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .or(`student_id.eq.${studentId},and(grade_id.eq.${gradeId},student_id.is.null)`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data || []) as NotificationRecord[];
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE student_id = ? OR (grade_id = ? AND student_id IS NULL)
       ORDER BY created_at DESC LIMIT 50`
    )
    .all(studentId, gradeId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    grade_id: r.grade_id !== null ? Number(r.grade_id) : null,
    student_id: r.student_id ? String(r.student_id) : null,
    type: String(r.type),
    title_ar: String(r.title_ar),
    body_ar: String(r.body_ar),
    link_path: r.link_path ? String(r.link_path) : null,
    is_read: Boolean(r.is_read),
    created_at: String(r.created_at),
  }));
}

export async function listAllNotificationsAdmin(limit = 50): Promise<NotificationRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as NotificationRecord[];
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    grade_id: r.grade_id !== null ? Number(r.grade_id) : null,
    student_id: r.student_id ? String(r.student_id) : null,
    type: String(r.type),
    title_ar: String(r.title_ar),
    body_ar: String(r.body_ar),
    link_path: r.link_path ? String(r.link_path) : null,
    is_read: Boolean(r.is_read),
    created_at: String(r.created_at),
  }));
}

export async function markNotificationRead(notificationId: string, studentId: string, gradeId: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .or(`student_id.eq.${studentId},and(grade_id.eq.${gradeId},student_id.is.null)`);
    return;
  }
  const db = getSqliteDb();
  db.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND (student_id = ? OR (grade_id = ? AND student_id IS NULL))`
  ).run(notificationId, studentId, gradeId);
}
