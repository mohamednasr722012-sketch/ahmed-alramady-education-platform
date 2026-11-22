import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.ts';
import { getSqliteDb } from './sqliteAdapter.ts';
import { fetchAllSupabaseRows } from './supabasePager.ts';
import { compactArabicName } from '../services/password.ts';
import type {
  AuditLogRecord,
  GradeRecord,
  SessionRecord,
  StudentRecord,
  StudentStatus,
  UserRoleCode,
} from './types.ts';

export class DuplicateFieldError extends Error {
  field: 'full_name' | 'phone_number';
  constructor(field: 'full_name' | 'phone_number', message: string) {
    super(message);
    this.field = field;
  }
}

function mapSqliteStudent(row: Record<string, unknown>): StudentRecord {
  return {
    id: String(row.id),
    profile_id: String(row.profile_id),
    grade_id: Number(row.grade_id),
    full_name: String(row.full_name),
    normalized_full_name: String(row.normalized_full_name),
    phone_number: String(row.phone_number),
    password_hash: String(row.password_hash),
    must_change_password: Boolean(row.must_change_password),
    status: (row.status as StudentStatus) || 'active',
    last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listGrades(): Promise<GradeRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('grades')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as GradeRecord[];
  }
  const db = getSqliteDb();
  const rows = db.prepare('SELECT * FROM grades ORDER BY sort_order ASC').all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name_ar: String(r.name_ar),
    description_ar: String(r.description_ar),
    sort_order: Number(r.sort_order),
    is_active: Boolean(r.is_active),
  }));
}

export async function getGradeById(gradeId: number): Promise<GradeRecord | null> {
  const grades = await listGrades();
  return grades.find((g) => g.id === gradeId) || null;
}

export async function updateGrade(
  gradeId: number,
  updates: { name_ar?: string; description_ar?: string; is_active?: boolean }
): Promise<GradeRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('grades')
      .update(updates)
      .eq('id', gradeId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GradeRecord) || null;
  }
  const db = getSqliteDb();
  const current = await getGradeById(gradeId);
  if (!current) return null;
  db.prepare(
    `UPDATE grades SET name_ar = ?, description_ar = ?, is_active = ? WHERE id = ?`
  ).run(
    updates.name_ar ?? current.name_ar,
    updates.description_ar ?? current.description_ar,
    updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : current.is_active ? 1 : 0,
    gradeId
  );
  return getGradeById(gradeId);
}

export async function registerStudent(input: {
  gradeId: number;
  fullName: string;
  normalizedFullName: string;
  phoneNumber: string;
  passwordHash: string;
}): Promise<StudentRecord> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const inputCompact = compactArabicName(input.fullName);

  if (supabase) {
    const { data: existingName } = await supabase
      .from('students')
      .select('id')
      .or(`normalized_full_name.eq."${input.normalizedFullName}",compact_full_name.eq."${inputCompact}"`)
      .limit(1)
      .maybeSingle();
    if (existingName) {
      throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
    }

    const { data: existingPhone } = await supabase
      .from('students')
      .select('id')
      .eq('phone_number', input.phoneNumber)
      .maybeSingle();
    if (existingPhone) {
      throw new DuplicateFieldError('phone_number', 'رقم الهاتف مسجل بالفعل.');
    }

    const profileId = crypto.randomUUID();
    const { error: profErr } = await supabase.from('profiles').insert({
      id: profileId,
      role_id: 1,
      full_name: input.fullName,
      created_at: nowIso,
    });
    if (profErr) throw new Error(profErr.message);

    const { data: created, error: studErr } = await supabase
      .from('students')
      .insert({
        id: crypto.randomUUID(),
        profile_id: profileId,
        grade_id: input.gradeId,
        full_name: input.fullName,
        normalized_full_name: input.normalizedFullName,
        compact_full_name: inputCompact,
        phone_number: input.phoneNumber,
        password_hash: input.passwordHash,
        must_change_password: false,
        status: 'active',
        last_activity_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();

    if (studErr) {
      await supabase.from('profiles').delete().eq('id', profileId);
      const msg = studErr.message.toLowerCase();
      if (msg.includes('normalized_full_name') || msg.includes('compact_full_name')) {
        throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
      }
      if (msg.includes('phone_number')) {
        throw new DuplicateFieldError('phone_number', 'رقم الهاتف مسجل بالفعل.');
      }
      throw new Error(studErr.message);
    }

    return created as StudentRecord;
  }

  const db = getSqliteDb();
  const existingName = db
    .prepare('SELECT id FROM students WHERE normalized_full_name = ? OR compact_full_name = ?')
    .get(input.normalizedFullName, inputCompact) as { id: string } | undefined;
  if (existingName) {
    throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
  }

  const existingPhone = db
    .prepare('SELECT id FROM students WHERE phone_number = ?')
    .get(input.phoneNumber) as { id: string } | undefined;
  if (existingPhone) {
    throw new DuplicateFieldError('phone_number', 'رقم الهاتف مسجل بالفعل.');
  }

  const profileId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO profiles (id, role_id, full_name, created_at) VALUES (?, 1, ?, ?)`
    ).run(profileId, input.fullName, nowIso);
    db.prepare(
      `INSERT INTO students (
        id, profile_id, grade_id, full_name, normalized_full_name, compact_full_name, phone_number,
        password_hash, must_change_password, status, last_activity_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)`
    ).run(
      studentId,
      profileId,
      input.gradeId,
      input.fullName,
      input.normalizedFullName,
      inputCompact,
      input.phoneNumber,
      input.passwordHash,
      nowIso,
      nowIso,
      nowIso
    );
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('normalized_full_name') || msg.includes('compact_full_name')) {
      throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
    }
    if (msg.includes('phone_number')) {
      throw new DuplicateFieldError('phone_number', 'رقم الهاتف مسجل بالفعل.');
    }
    throw err;
  }

  const created = await findStudentById(studentId);
  if (!created) throw new Error('تعذر إنشاء حساب الطالب.');
  return created;
}

export async function findStudentByNormalizedName(normalizedName: string): Promise<StudentRecord | null> {
  const compact = normalizedName.replace(/\s+/g, '');
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('normalized_full_name', normalizedName)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as StudentRecord;

    const { data: compactMatch, error: compactErr } = await supabase
      .from('students')
      .select('*')
      .eq('compact_full_name', compact)
      .maybeSingle();
    if (compactErr) throw new Error(compactErr.message);
    return (compactMatch as StudentRecord) || null;
  }
  const db = getSqliteDb();
  const row = db
    .prepare('SELECT * FROM students WHERE normalized_full_name = ?')
    .get(normalizedName) as Record<string, unknown> | undefined;
  if (row) return mapSqliteStudent(row);
  const compactRow = db
    .prepare('SELECT * FROM students WHERE compact_full_name = ?')
    .get(compact) as Record<string, unknown> | undefined;
  return compactRow ? mapSqliteStudent(compactRow) : null;
}

export async function findStudentById(studentId: string): Promise<StudentRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as StudentRecord) || null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as Record<string, unknown> | undefined;
  return row ? mapSqliteStudent(row) : null;
}

export async function listStudents(filters?: {
  gradeId?: number;
  search?: string;
  status?: StudentStatus;
}): Promise<StudentRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    return fetchAllSupabaseRows<StudentRecord>((from, to) => {
      let q = supabase.from('students').select('*').order('created_at', { ascending: false }).range(from, to);
      if (filters?.gradeId) q = q.eq('grade_id', filters.gradeId);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.search && filters.search.trim()) {
        const term = filters.search.trim();
        q = q.or(`full_name.ilike.%${term}%,phone_number.ilike.%${term}%`);
      }
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
  if (filters?.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    clauses.push('(full_name LIKE ? OR normalized_full_name LIKE ? OR phone_number LIKE ?)');
    params.push(term, term, term);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM students ${whereSql} ORDER BY created_at DESC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapSqliteStudent);
}

export async function listStudentsPaginated(filters: {
  gradeId?: number;
  search?: string;
  status?: StudentStatus;
  page: number;
  pageSize: number;
}): Promise<{ students: StudentRecord[]; total: number }> {
  const offset = (filters.page - 1) * filters.pageSize;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    let q = supabase
      .from('students')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + filters.pageSize - 1);
    if (filters.gradeId) q = q.eq('grade_id', filters.gradeId);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      q = q.or(`full_name.ilike.%${term}%,phone_number.ilike.%${term}%`);
    }
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { students: (data || []) as StudentRecord[], total: count ?? (data?.length || 0) };
  }

  const db = getSqliteDb();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.gradeId) {
    clauses.push('grade_id = ?');
    params.push(filters.gradeId);
  }
  if (filters.status) {
    clauses.push('status = ?');
    params.push(filters.status);
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    clauses.push('(full_name LIKE ? OR normalized_full_name LIKE ? OR phone_number LIKE ?)');
    params.push(term, term, term);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const countRow = db
    .prepare(`SELECT COUNT(*) AS c FROM students ${whereSql}`)
    .get(...params) as { c: number };
  const rows = db
    .prepare(`SELECT * FROM students ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, filters.pageSize, offset) as Array<Record<string, unknown>>;
  return { students: rows.map(mapSqliteStudent), total: Number(countRow.c) };
}

export async function updateStudent(
  studentId: string,
  updates: {
    fullName?: string;
    normalizedFullName?: string;
    phoneNumber?: string;
    gradeId?: number;
    status?: StudentStatus;
    lastActivityAt?: string;
  }
): Promise<StudentRecord | null> {
  const existing = await findStudentById(studentId);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const nextNormalized = updates.normalizedFullName ?? existing.normalized_full_name;
  const nextCompact = nextNormalized.replace(/\s+/g, '');

  const supabase = getSupabaseAdmin();
  if (supabase) {
    if (updates.normalizedFullName !== undefined) {
      const { data: conflict } = await supabase
        .from('students')
        .select('id')
        .neq('id', studentId)
        .or(`normalized_full_name.eq."${nextNormalized}",compact_full_name.eq."${nextCompact}"`)
        .limit(1)
        .maybeSingle();
      if (conflict) {
        throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
      }
    }

    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (updates.fullName !== undefined) patch.full_name = updates.fullName;
    if (updates.normalizedFullName !== undefined) {
      patch.normalized_full_name = updates.normalizedFullName;
      patch.compact_full_name = nextCompact;
    }
    if (updates.phoneNumber !== undefined) patch.phone_number = updates.phoneNumber;
    if (updates.gradeId !== undefined) patch.grade_id = updates.gradeId;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.lastActivityAt !== undefined) patch.last_activity_at = updates.lastActivityAt;

    const { data, error } = await supabase
      .from('students')
      .update(patch)
      .eq('id', studentId)
      .select('*')
      .single();
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('normalized_full_name') || msg.includes('compact_full_name')) {
        throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
      }
      if (msg.includes('phone_number')) {
        throw new DuplicateFieldError('phone_number', 'رقم الهاتف مسجل بالفعل.');
      }
      throw new Error(error.message);
    }
    if (updates.fullName !== undefined) {
      await supabase.from('profiles').update({ full_name: updates.fullName }).eq('id', existing.profile_id);
    }
    return data as StudentRecord;
  }

  const db = getSqliteDb();
  if (updates.normalizedFullName !== undefined) {
    const conflict = db
      .prepare(
        'SELECT id FROM students WHERE id != ? AND (normalized_full_name = ? OR compact_full_name = ?)'
      )
      .get(studentId, nextNormalized, nextCompact) as { id: string } | undefined;
    if (conflict) {
      throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
    }
  }
  try {
    db.prepare(
      `UPDATE students SET
        full_name = ?,
        normalized_full_name = ?,
        compact_full_name = ?,
        phone_number = ?,
        grade_id = ?,
        status = ?,
        last_activity_at = ?,
        updated_at = ?
      WHERE id = ?`
    ).run(
      updates.fullName ?? existing.full_name,
      nextNormalized,
      nextCompact,
      updates.phoneNumber ?? existing.phone_number,
      updates.gradeId ?? existing.grade_id,
      updates.status ?? existing.status,
      updates.lastActivityAt ?? existing.last_activity_at,
      nowIso,
      studentId
    );
    if (updates.fullName !== undefined) {
      db.prepare('UPDATE profiles SET full_name = ? WHERE id = ?').run(updates.fullName, existing.profile_id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('normalized_full_name') || msg.includes('compact_full_name')) {
      throw new DuplicateFieldError('full_name', 'هذا الاسم مسجل بالفعل، برجاء تسجيل الدخول إلى حسابك.');
    }
    if (msg.includes('phone_number')) {
      throw new DuplicateFieldError('phone_number', 'رقم الهاتف مسجل بالفعل.');
    }
    throw err;
  }

  return findStudentById(studentId);
}

export async function setStudentPassword(
  studentId: string,
  passwordHash: string,
  mustChangePassword: boolean
): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase
      .from('students')
      .update({
        password_hash: passwordHash,
        must_change_password: mustChangePassword,
        updated_at: nowIso,
      })
      .eq('id', studentId);
    if (error) throw new Error(error.message);
    return;
  }
  const db = getSqliteDb();
  db.prepare(
    `UPDATE students SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?`
  ).run(passwordHash, mustChangePassword ? 1 : 0, nowIso, studentId);
}

export async function createUserSession(input: {
  subjectType: UserRoleCode;
  subjectId: string;
  tokenHash: string;
  deviceLabel: string;
  ipAddress: string | null;
  expiresAt: string;
}): Promise<SessionRecord> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        id,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        token_hash: input.tokenHash,
        device_label: input.deviceLabel,
        ip_address: input.ipAddress,
        expires_at: input.expiresAt,
        created_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as SessionRecord;
  }
  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO user_sessions (id, subject_type, subject_id, token_hash, device_label, ip_address, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.subjectType,
    input.subjectId,
    input.tokenHash,
    input.deviceLabel,
    input.ipAddress,
    input.expiresAt,
    nowIso
  );
  return {
    id,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    token_hash: input.tokenHash,
    device_label: input.deviceLabel,
    ip_address: input.ipAddress,
    expires_at: input.expiresAt,
    revoked_at: null,
    created_at: nowIso,
  };
}

export async function getActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SessionRecord) || null;
  }
  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT * FROM user_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`
    )
    .get(tokenHash, nowIso) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    subject_type: row.subject_type as UserRoleCode,
    subject_id: String(row.subject_id),
    token_hash: String(row.token_hash),
    device_label: String(row.device_label),
    ip_address: row.ip_address ? String(row.ip_address) : null,
    expires_at: String(row.expires_at),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    created_at: String(row.created_at),
  };
}

export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('user_sessions').update({ revoked_at: nowIso }).eq('token_hash', tokenHash);
    return;
  }
  const db = getSqliteDb();
  db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ?').run(nowIso, tokenHash);
}

export async function revokeAllStudentSessions(studentId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('user_sessions')
      .update({ revoked_at: nowIso })
      .eq('subject_type', 'student')
      .eq('subject_id', studentId)
      .is('revoked_at', null);
    return;
  }
  const db = getSqliteDb();
  db.prepare(
    `UPDATE user_sessions SET revoked_at = ? WHERE subject_type = 'student' AND subject_id = ? AND revoked_at IS NULL`
  ).run(nowIso, studentId);
}

export async function purgeExpiredSessions(): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('user_sessions').delete().lt('expires_at', nowIso);
    return;
  }
  const db = getSqliteDb();
  db.prepare(`DELETE FROM user_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).run(
    nowIso,
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString()
  );
}

export async function getPlatformSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value_json')
      .eq('key', key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.value_json as T) : null;
  }
  const db = getSqliteDb();
  const row = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined;
  return row ? (JSON.parse(row.value_json) as T) : null;
}

export async function setPlatformSetting(key: string, value: Record<string, unknown>): Promise<void> {
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from('platform_settings').upsert({
      key,
      value_json: value,
      updated_at: nowIso,
    });
    if (error) throw new Error(error.message);
    return;
  }
  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO platform_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), nowIso);
}

export async function insertAuditLog(entry: {
  actorRole: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('audit_logs').insert({
      id,
      actor_role: entry.actorRole,
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      metadata_json: entry.metadata || {},
      ip_address: entry.ipAddress || null,
      created_at: nowIso,
    });
    return;
  }
  const db = getSqliteDb();
  db.prepare(
    `INSERT INTO audit_logs (id, actor_role, actor_id, action, target_type, target_id, metadata_json, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.actorRole,
    entry.actorId,
    entry.action,
    entry.targetType,
    entry.targetId,
    JSON.stringify(entry.metadata || {}),
    entry.ipAddress || null,
    nowIso
  );
}

export async function listAuditLogs(limit = 60): Promise<AuditLogRecord[]> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as AuditLogRecord[];
  }
  const db = getSqliteDb();
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    actor_role: String(r.actor_role),
    actor_id: String(r.actor_id),
    action: String(r.action),
    target_type: String(r.target_type),
    target_id: String(r.target_id),
    metadata_json: JSON.parse(String(r.metadata_json || '{}')),
    ip_address: r.ip_address ? String(r.ip_address) : null,
    created_at: String(r.created_at),
  }));
}

export async function getPlatformOverviewStats(grades: GradeRecord[]): Promise<{
  totals: {
    students: number;
    activeStudents: number;
    exams: number;
    publishedExams: number;
    videos: number;
    publishedVideos: number;
    results: number;
    certificates: number;
    pendingSchedules: number;
  };
  perGradeStats: Array<{
    gradeId: number;
    gradeName: string;
    studentsCount: number;
    activeStudentsCount: number;
    examsCount: number;
    videosCount: number;
    resultsCount: number;
    avgPercentage: number;
  }>;
}> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const [studRows, examRows, vidRows, resRows, certCountRes, schedCountRes] = await Promise.all([
      fetchAllSupabaseRows<{ grade_id: number; status: string }>((from, to) =>
        supabase.from('students').select('grade_id, status').range(from, to)
      ),
      fetchAllSupabaseRows<{ grade_id: number; publish_status: string }>((from, to) =>
        supabase.from('exams').select('grade_id, publish_status').range(from, to)
      ),
      fetchAllSupabaseRows<{ grade_id: number; publish_status: string }>((from, to) =>
        supabase.from('videos').select('grade_id, publish_status').range(from, to)
      ),
      fetchAllSupabaseRows<{ grade_id: number; percentage: number }>((from, to) =>
        supabase.from('exam_results').select('grade_id, percentage').range(from, to)
      ),
      supabase.from('certificates').select('id', { count: 'exact', head: true }),
      supabase.from('scheduled_publications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const perGradeStats = grades.map((g) => {
      const gs = studRows.filter((s) => s.grade_id === g.id);
      const ge = examRows.filter((e) => e.grade_id === g.id);
      const gv = vidRows.filter((v) => v.grade_id === g.id);
      const gr = resRows.filter((r) => r.grade_id === g.id);
      const avgPct =
        gr.length > 0
          ? Number((gr.reduce((s, r) => s + Number(r.percentage), 0) / gr.length).toFixed(1))
          : 0;
      return {
        gradeId: g.id,
        gradeName: g.name_ar,
        studentsCount: gs.length,
        activeStudentsCount: gs.filter((s) => s.status === 'active').length,
        examsCount: ge.length,
        videosCount: gv.length,
        resultsCount: gr.length,
        avgPercentage: avgPct,
      };
    });

    return {
      totals: {
        students: studRows.length,
        activeStudents: studRows.filter((s) => s.status === 'active').length,
        exams: examRows.length,
        publishedExams: examRows.filter((e) => e.publish_status === 'published').length,
        videos: vidRows.length,
        publishedVideos: vidRows.filter((v) => v.publish_status === 'published').length,
        results: resRows.length,
        certificates: certCountRes.count ?? 0,
        pendingSchedules: schedCountRes.count ?? 0,
      },
      perGradeStats,
    };
  }

  const db = getSqliteDb();
  const studAgg = db
    .prepare(
      `SELECT grade_id, COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
       FROM students GROUP BY grade_id`
    )
    .all() as Array<{ grade_id: number; total: number; active: number }>;
  const examAgg = db
    .prepare(
      `SELECT grade_id, COUNT(*) AS total, SUM(CASE WHEN publish_status = 'published' THEN 1 ELSE 0 END) AS published
       FROM exams GROUP BY grade_id`
    )
    .all() as Array<{ grade_id: number; total: number; published: number }>;
  const vidAgg = db
    .prepare(
      `SELECT grade_id, COUNT(*) AS total, SUM(CASE WHEN publish_status = 'published' THEN 1 ELSE 0 END) AS published
       FROM videos GROUP BY grade_id`
    )
    .all() as Array<{ grade_id: number; total: number; published: number }>;
  const resAgg = db
    .prepare(`SELECT grade_id, COUNT(*) AS total, COALESCE(AVG(percentage), 0) AS avg_pct FROM exam_results GROUP BY grade_id`)
    .all() as Array<{ grade_id: number; total: number; avg_pct: number }>;

  const certCount = (db.prepare('SELECT COUNT(*) AS c FROM certificates').get() as { c: number }).c;
  const pendingSchedCount = (
    db.prepare("SELECT COUNT(*) AS c FROM scheduled_publications WHERE status = 'pending'").get() as { c: number }
  ).c;

  const studMap = new Map(studAgg.map((r) => [Number(r.grade_id), r]));
  const examMap = new Map(examAgg.map((r) => [Number(r.grade_id), r]));
  const vidMap = new Map(vidAgg.map((r) => [Number(r.grade_id), r]));
  const resMap = new Map(resAgg.map((r) => [Number(r.grade_id), r]));

  let totalStudents = 0;
  let activeStudents = 0;
  let totalExams = 0;
  let publishedExams = 0;
  let totalVideos = 0;
  let publishedVideos = 0;
  let totalResults = 0;

  const perGradeStats = grades.map((g) => {
    const s = studMap.get(g.id);
    const e = examMap.get(g.id);
    const v = vidMap.get(g.id);
    const r = resMap.get(g.id);
    const studentsCount = Number(s?.total || 0);
    const activeStudentsCount = Number(s?.active || 0);
    const examsCount = Number(e?.total || 0);
    const videosCount = Number(v?.total || 0);
    const resultsCount = Number(r?.total || 0);
    totalStudents += studentsCount;
    activeStudents += activeStudentsCount;
    totalExams += examsCount;
    publishedExams += Number(e?.published || 0);
    totalVideos += videosCount;
    publishedVideos += Number(v?.published || 0);
    totalResults += resultsCount;

    return {
      gradeId: g.id,
      gradeName: g.name_ar,
      studentsCount,
      activeStudentsCount,
      examsCount,
      videosCount,
      resultsCount,
      avgPercentage: resultsCount > 0 ? Number(Number(r?.avg_pct || 0).toFixed(1)) : 0,
    };
  });

  return {
    totals: {
      students: totalStudents,
      activeStudents,
      exams: totalExams,
      publishedExams,
      videos: totalVideos,
      publishedVideos,
      results: totalResults,
      certificates: Number(certCount),
      pendingSchedules: Number(pendingSchedCount),
    },
    perGradeStats,
  };
}
