import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.ts';
import { getSqliteDb } from './sqliteAdapter.ts';
import { fetchAllSupabaseRows } from './supabasePager.ts';
import type {
  BadgeRecord,
  BadgeRuleType,
  BadgeTier,
  CertType,
  CertificateRecord,
  ExamAttemptRecord,
  ExamResultRecord,
  StudentAnswerRecord,
  StudentBadgeRecord,
} from './types.ts';

function mapSqliteAttempt(r: Record<string, unknown>): ExamAttemptRecord {
  return {
    id: String(r.id),
    exam_id: String(r.exam_id),
    student_id: String(r.student_id),
    grade_id: Number(r.grade_id),
    attempt_number: Number(r.attempt_number),
    status: r.status as ExamAttemptRecord['status'],
    started_at: String(r.started_at),
    expires_at: String(r.expires_at),
    submitted_at: r.submitted_at ? String(r.submitted_at) : null,
    duration_ms: r.duration_ms !== null ? Number(r.duration_ms) : null,
  };
}

function mapSqliteResult(r: Record<string, unknown>): ExamResultRecord {
  return {
    id: String(r.id),
    attempt_id: String(r.attempt_id),
    exam_id: String(r.exam_id),
    student_id: String(r.student_id),
    grade_id: Number(r.grade_id),
    earned_score: Number(r.earned_score),
    max_score: Number(r.max_score),
    correct_count: Number(r.correct_count),
    wrong_count: Number(r.wrong_count),
    percentage: Number(r.percentage),
    duration_ms: Number(r.duration_ms),
    submitted_at: String(r.submitted_at),
  };
}

function mapSqliteBadge(r: Record<string, unknown>): BadgeRecord {
  return {
    id: String(r.id),
    code: String(r.code),
    title_ar: String(r.title_ar),
    description_ar: String(r.description_ar),
    tier: r.tier as BadgeTier,
    rule_type: r.rule_type as BadgeRuleType,
    rule_threshold: Number(r.rule_threshold),
    secondary_threshold: r.secondary_threshold !== null ? Number(r.secondary_threshold) : null,
    is_system: Boolean(r.is_system),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at),
  };
}

// ---------- Attempts & Answers ----------

export async function listStudentAttemptsForExam(examId: string, studentId: string): Promise<ExamAttemptRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .order('attempt_number', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as ExamAttemptRecord[];
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ? ORDER BY attempt_number ASC')
    .all(examId, studentId) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteAttempt);
}

export async function listAllStudentAttempts(studentId: string): Promise<ExamAttemptRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    return fetchAllSupabaseRows<ExamAttemptRecord>((from, to) =>
      supabase
        .from('exam_attempts')
        .select('*')
        .eq('student_id', studentId)
        .order('attempt_number', { ascending: true })
        .range(from, to)
    );
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT * FROM exam_attempts WHERE student_id = ? ORDER BY attempt_number ASC')
    .all(studentId) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteAttempt);
}

export async function getAttemptById(attemptId: string): Promise<ExamAttemptRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from('exam_attempts').select('*').eq('id', attemptId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ExamAttemptRecord) || null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(attemptId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSqliteAttempt(row) : null;
}

export async function createExamAttempt(input: {
  examId: string;
  studentId: string;
  gradeId: number;
  attemptNumber: number;
  startedAt: string;
  expiresAt: string;
}): Promise<ExamAttemptRecord> {
  const id = crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('exam_attempts')
      .insert({
        id,
        exam_id: input.examId,
        student_id: input.studentId,
        grade_id: input.gradeId,
        attempt_number: input.attemptNumber,
        status: 'in_progress',
        started_at: input.startedAt,
        expires_at: input.expiresAt,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as ExamAttemptRecord;
  }

  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO exam_attempts (id, exam_id, student_id, grade_id, attempt_number, status, started_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?)`
  ).run(id, input.examId, input.studentId, input.gradeId, input.attemptNumber, input.startedAt, input.expiresAt);
  const created = await getAttemptById(id);
  if (!created) throw new Error('تعذر بدء المحاولة.');
  return created;
}

export async function upsertStudentAnswer(input: {
  attemptId: string;
  questionId: string;
  selectedOptionId: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from('student_answers').upsert(
      {
        id: crypto.randomUUID(),
        attempt_id: input.attemptId,
        question_id: input.questionId,
        selected_option_id: input.selectedOptionId,
        saved_at: nowIso,
      },
      { onConflict: 'attempt_id,question_id' }
    );
    if (error) throw new Error(error.message);
    return;
  }

  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO student_answers (id, attempt_id, question_id, selected_option_id, saved_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(attempt_id, question_id)
     DO UPDATE SET selected_option_id = excluded.selected_option_id, saved_at = excluded.saved_at`
  ).run(crypto.randomUUID(), input.attemptId, input.questionId, input.selectedOptionId, nowIso);
}

export async function listAttemptAnswers(attemptId: string): Promise<StudentAnswerRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from('student_answers').select('*').eq('attempt_id', attemptId);
    if (error) throw new Error(error.message);
    return (data || []) as StudentAnswerRecord[];
  }
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attemptId) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    attempt_id: String(r.attempt_id),
    question_id: String(r.question_id),
    selected_option_id: String(r.selected_option_id),
    is_correct_snapshot: r.is_correct_snapshot !== null ? Boolean(r.is_correct_snapshot) : null,
    saved_at: String(r.saved_at),
  }));
}

export async function finalizeAttemptAndSaveResult(input: {
  attemptId: string;
  examId: string;
  studentId: string;
  gradeId: number;
  status: 'submitted' | 'expired';
  submittedAt: string;
  durationMs: number;
  earnedScore: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  percentage: number;
  answerSnapshots: Array<{ questionId: string; isCorrect: boolean }>;
}): Promise<ExamResultRecord> {
  const resultId = crypto.randomUUID();
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: updatedAttempt, error: attErr } = await supabase
      .from('exam_attempts')
      .update({
        status: input.status,
        submitted_at: input.submittedAt,
        duration_ms: input.durationMs,
      })
      .eq('id', input.attemptId)
      .eq('status', 'in_progress')
      .select('id')
      .maybeSingle();

    if (attErr) throw new Error(attErr.message);
    if (!updatedAttempt) {
      const { data: existingResult } = await supabase
        .from('exam_results')
        .select('*')
        .eq('attempt_id', input.attemptId)
        .maybeSingle();
      if (existingResult) return existingResult as ExamResultRecord;
    }

    if (input.answerSnapshots.length > 0) {
      await Promise.all(
        input.answerSnapshots.map((snap) =>
          supabase
            .from('student_answers')
            .update({ is_correct_snapshot: snap.isCorrect })
            .eq('attempt_id', input.attemptId)
            .eq('question_id', snap.questionId)
        )
      );
    }

    const { data: savedResult, error: resErr } = await supabase
      .from('exam_results')
      .insert({
        id: resultId,
        attempt_id: input.attemptId,
        exam_id: input.examId,
        student_id: input.studentId,
        grade_id: input.gradeId,
        earned_score: input.earnedScore,
        max_score: input.maxScore,
        correct_count: input.correctCount,
        wrong_count: input.wrongCount,
        percentage: input.percentage,
        duration_ms: input.durationMs,
        submitted_at: input.submittedAt,
      })
      .select('*')
      .single();
    if (resErr) throw new Error(resErr.message);
    return savedResult as ExamResultRecord;
  }

  const db = getSqliteDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const upd = db
      .prepare(
        `UPDATE exam_attempts SET status = ?, submitted_at = ?, duration_ms = ?
         WHERE id = ? AND status = 'in_progress'`
      )
      .run(input.status, input.submittedAt, input.durationMs, input.attemptId);

    if (upd.changes === 0) {
      const existing = db.prepare('SELECT * FROM exam_results WHERE attempt_id = ?').get(input.attemptId) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        db.exec('COMMIT;');
        return mapSqliteResult(existing);
      }
    }

    const updAns = db.prepare(
      `UPDATE student_answers SET is_correct_snapshot = ? WHERE attempt_id = ? AND question_id = ?`
    );
    for (const snap of input.answerSnapshots) {
      updAns.run(snap.isCorrect ? 1 : 0, input.attemptId, snap.questionId);
    }

    db.prepare(
      `INSERT INTO exam_results (
        id, attempt_id, exam_id, student_id, grade_id, earned_score, max_score,
        correct_count, wrong_count, percentage, duration_ms, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      resultId,
      input.attemptId,
      input.examId,
      input.studentId,
      input.gradeId,
      input.earnedScore,
      input.maxScore,
      input.correctCount,
      input.wrongCount,
      input.percentage,
      input.durationMs,
      input.submittedAt
    );
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const row = db.prepare('SELECT * FROM exam_results WHERE id = ?').get(resultId) as Record<string, unknown>;
  return mapSqliteResult(row);
}

// ---------- Results ----------

export async function listResultsForStudent(studentId: string, gradeId: number): Promise<ExamResultRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('exam_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('grade_id', gradeId)
      .order('submitted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as ExamResultRecord[];
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT * FROM exam_results WHERE student_id = ? AND grade_id = ? ORDER BY submitted_at DESC')
    .all(studentId, gradeId) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteResult);
}

export async function listResultsByGradeOrExam(filters?: {
  gradeId?: number;
  examId?: string;
}): Promise<ExamResultRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    return fetchAllSupabaseRows<ExamResultRecord>((from, to) => {
      let q = supabase.from('exam_results').select('*').order('submitted_at', { ascending: false }).range(from, to);
      if (filters?.gradeId) q = q.eq('grade_id', filters.gradeId);
      if (filters?.examId) q = q.eq('exam_id', filters.examId);
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
  if (filters?.examId) {
    clauses.push('exam_id = ?');
    params.push(filters.examId);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM exam_results ${whereSql} ORDER BY submitted_at DESC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteResult);
}

export async function listResultsForStudentIds(studentIds: string[]): Promise<ExamResultRecord[]> {
  if (studentIds.length === 0) return [];
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const out: ExamResultRecord[] = [];
    for (let i = 0; i < studentIds.length; i += 200) {
      const chunk = studentIds.slice(i, i + 200);
      const rows = await fetchAllSupabaseRows<ExamResultRecord>((from, to) =>
        supabase.from('exam_results').select('*').in('student_id', chunk).range(from, to)
      );
      out.push(...rows);
    }
    return out;
  }
  const db = getSqliteDb();
  const out: ExamResultRecord[] = [];
  for (let i = 0; i < studentIds.length; i += 200) {
    const chunk = studentIds.slice(i, i + 200);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT * FROM exam_results WHERE student_id IN (${placeholders})`)
      .all(...chunk) as Array<Record<string, unknown>>;
    out.push(...rows.map(mapSqliteResult));
  }
  return out;
}

export async function listGradeLeaderboardRows(gradeId: number): Promise<
  Array<{
    student_id: string;
    full_name: string;
    exam_id: string;
    earned_score: number;
    max_score: number;
    duration_ms: number;
  }>
> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    return fetchAllSupabaseRows<{
      student_id: string;
      exam_id: string;
      earned_score: number;
      max_score: number;
      duration_ms: number;
      students: { full_name: string; status: string } | null;
    }>((from, to) =>
      supabase
        .from('exam_results')
        .select('student_id, exam_id, earned_score, max_score, duration_ms, students!inner(full_name, status)')
        .eq('grade_id', gradeId)
        .eq('students.status', 'active')
        .range(from, to)
    ).then((rows) =>
      rows.map((r) => ({
        student_id: r.student_id,
        full_name: r.students?.full_name || 'طالب',
        exam_id: r.exam_id,
        earned_score: Number(r.earned_score),
        max_score: Number(r.max_score),
        duration_ms: Number(r.duration_ms),
      }))
    );
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT r.student_id, s.full_name, r.exam_id, r.earned_score, r.max_score, r.duration_ms
       FROM exam_results r
       JOIN students s ON s.id = r.student_id
       WHERE r.grade_id = ? AND s.status = 'active'`
    )
    .all(gradeId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    student_id: String(r.student_id),
    full_name: String(r.full_name),
    exam_id: String(r.exam_id),
    earned_score: Number(r.earned_score),
    max_score: Number(r.max_score),
    duration_ms: Number(r.duration_ms),
  }));
}

export async function getResultByAttemptId(attemptId: string): Promise<ExamResultRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('exam_results')
      .select('*')
      .eq('attempt_id', attemptId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ExamResultRecord) || null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM exam_results WHERE attempt_id = ?').get(attemptId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSqliteResult(row) : null;
}

// ---------- Badges & Certificates ----------

export async function listBadges(activeOnly = false): Promise<BadgeRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    let q = supabase.from('badges').select('*').order('created_at', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as BadgeRecord[];
  }
  const db = getSqliteDb();
  const whereSql = activeOnly ? 'WHERE is_active = 1' : '';
  const rows = db.prepare(`SELECT * FROM badges ${whereSql} ORDER BY created_at ASC`).all() as Array<
    Record<string, unknown>
  >;
  return rows.map(mapSqliteBadge);
}

export async function createCustomBadge(input: {
  code: string;
  titleAr: string;
  descriptionAr: string;
  tier: BadgeTier;
  ruleType: BadgeRuleType;
  ruleThreshold: number;
  secondaryThreshold?: number | null;
}): Promise<BadgeRecord> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('badges')
      .insert({
        id,
        code: input.code,
        title_ar: input.titleAr,
        description_ar: input.descriptionAr,
        tier: input.tier,
        rule_type: input.ruleType,
        rule_threshold: input.ruleThreshold,
        secondary_threshold: input.secondaryThreshold ?? null,
        is_system: false,
        is_active: true,
        created_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as BadgeRecord;
  }

  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO badges (id, code, title_ar, description_ar, tier, rule_type, rule_threshold, secondary_threshold, is_system, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`
  ).run(
    id,
    input.code,
    input.titleAr,
    input.descriptionAr,
    input.tier,
    input.ruleType,
    input.ruleThreshold,
    input.secondaryThreshold ?? null,
    nowIso
  );
  const created = db.prepare('SELECT * FROM badges WHERE id = ?').get(id) as Record<string, unknown>;
  return mapSqliteBadge(created);
}

export async function listStudentBadges(studentId: string): Promise<StudentBadgeRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('student_badges')
      .select('*')
      .eq('student_id', studentId)
      .order('earned_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as StudentBadgeRecord[];
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT * FROM student_badges WHERE student_id = ? ORDER BY earned_at DESC')
    .all(studentId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    student_id: String(r.student_id),
    badge_id: String(r.badge_id),
    exam_id: r.exam_id ? String(r.exam_id) : null,
    earned_at: String(r.earned_at),
  }));
}

export async function awardBadgeIfNotExists(input: {
  studentId: string;
  badgeId: string;
  examId?: string | null;
}): Promise<boolean> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: existing } = await supabase
      .from('student_badges')
      .select('id')
      .eq('student_id', input.studentId)
      .eq('badge_id', input.badgeId)
      .maybeSingle();
    if (existing) return false;

    const { error } = await supabase.from('student_badges').insert({
      id,
      student_id: input.studentId,
      badge_id: input.badgeId,
      exam_id: input.examId ?? null,
      earned_at: nowIso,
    });
    if (error) return false;
    return true;
  }

  const db = getSqliteDb();
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO student_badges (id, student_id, badge_id, exam_id, earned_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, input.studentId, input.badgeId, input.examId ?? null, nowIso);
  return res.changes > 0;
}

export async function listCertificates(filters?: {
  studentId?: string;
  gradeId?: number;
}): Promise<CertificateRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    return fetchAllSupabaseRows<CertificateRecord>((from, to) => {
      let q = supabase.from('certificates').select('*').order('issued_at', { ascending: false }).range(from, to);
      if (filters?.studentId) q = q.eq('student_id', filters.studentId);
      if (filters?.gradeId) q = q.eq('grade_id', filters.gradeId);
      return q;
    });
  }
  const db = getSqliteDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.studentId) {
    clauses.push('student_id = ?');
    params.push(filters.studentId);
  }
  if (filters?.gradeId) {
    clauses.push('grade_id = ?');
    params.push(filters.gradeId);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM certificates ${whereSql} ORDER BY issued_at DESC`)
    .all(...params) as unknown as CertificateRecord[];
}

export async function getCertificateById(certId: string): Promise<CertificateRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from('certificates').select('*').eq('id', certId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CertificateRecord) || null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM certificates WHERE id = ?').get(certId) as
    | CertificateRecord
    | undefined;
  return row || null;
}

export async function getCertificateBySerial(serialNumber: string): Promise<CertificateRecord | null> {
  const normalized = serialNumber.trim().toUpperCase();
  if (!normalized) return null;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('serial_number', normalized)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CertificateRecord) || null;
  }
  const db = getSqliteDb();
  const row = db
    .prepare('SELECT * FROM certificates WHERE UPPER(serial_number) = ?')
    .get(normalized) as CertificateRecord | undefined;
  return row || null;
}

function generateCertificateSerial(): string {
  return `ARM-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function issueCertificateIfNotExists(input: {
  studentId: string;
  gradeId: number;
  certType: CertType;
  titleAr: string;
  reasonAr: string;
  referenceKey: string;
}): Promise<{ issued: boolean; certificate: CertificateRecord }> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();

  if (supabase) {
    const { data: existing } = await supabase
      .from('certificates')
      .select('*')
      .eq('student_id', input.studentId)
      .eq('cert_type', input.certType)
      .eq('reference_key', input.referenceKey)
      .maybeSingle();
    if (existing) {
      return { issued: false, certificate: existing as CertificateRecord };
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      const serial = generateCertificateSerial();
      const { data, error } = await supabase
        .from('certificates')
        .insert({
          id,
          serial_number: serial,
          student_id: input.studentId,
          grade_id: input.gradeId,
          cert_type: input.certType,
          title_ar: input.titleAr,
          reason_ar: input.reasonAr,
          reference_key: input.referenceKey,
          issued_at: nowIso,
        })
        .select('*')
        .single();
      if (!error) {
        return { issued: true, certificate: data as CertificateRecord };
      }
      if (!error.message.toLowerCase().includes('serial_number') || attempt === 3) {
        throw new Error(error.message);
      }
    }
    throw new Error('تعذر توليد رقم تسلسلي فريد للشهادة.');
  }

  const db = getSqliteDb();
  const existing = db
    .prepare(
      'SELECT * FROM certificates WHERE student_id = ? AND cert_type = ? AND reference_key = ?'
    )
    .get(input.studentId, input.certType, input.referenceKey) as CertificateRecord | undefined;
  if (existing) {
    return { issued: false, certificate: existing };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const serial = generateCertificateSerial();
    try {
      db.prepare(
        `INSERT INTO certificates (id, serial_number, student_id, grade_id, cert_type, title_ar, reason_ar, reference_key, issued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, serial, input.studentId, input.gradeId, input.certType, input.titleAr, input.reasonAr, input.referenceKey, nowIso);
      const created = (await getCertificateById(id))!;
      return { issued: true, certificate: created };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('serial_number') || attempt === 3) throw err;
    }
  }
  throw new Error('تعذر توليد رقم تسلسلي فريد للشهادة.');
}
