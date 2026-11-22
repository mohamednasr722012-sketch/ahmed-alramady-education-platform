import { Router } from 'express';
import {
  ADMIN_COOKIE_NAME,
  STUDENT_COOKIE_NAME,
  clearAuthCookie,
  createHashedAdminPasscode,
  getAdminPasscodeStatus,
  requireStudent,
  setAuthCookie,
  verifyAdminPasscode,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import {
  DuplicateFieldError,
  createUserSession,
  findStudentByNormalizedName,
  getActiveSessionByTokenHash,
  getGradeById,
  getPlatformSetting,
  insertAuditLog,
  registerStudent,
  revokeSessionByTokenHash,
  setPlatformSetting,
  setStudentPassword,
  updateStudent,
} from '../db/usersRepo.ts';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  isValidPhone,
  normalizeArabicName,
  normalizePhone,
  validateQuadName,
  verifyPassword,
} from '../services/password.ts';

const router = Router();
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const ADMIN_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 hours

const loginAccountRateLimiter = createRateLimiter({
  name: 'student_login_account',
  windowMs: 10 * 60 * 1000,
  maxRequests: 25,
  messageAr: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول لهذا الحساب، يرجى الانتظار قليلًا.',
  keyGenerator: (req) => {
    const rawName = String(req.body?.fullName || '').trim();
    const norm = rawName ? normalizeArabicName(rawName) : 'anon';
    return `${req.ip || 'unknown'}:${norm}`;
  },
});

const natAuthLimiter = createRateLimiter({
  name: 'student_nat_auth',
  windowMs: 10 * 60 * 1000,
  maxRequests: 5000,
  messageAr: 'الضغط مرتفع جدًا على شبكة الإنترنت الحالية، يرجى المحاولة بعد لحظات.',
  keyGenerator: (req) => `nat:${req.ip || 'unknown'}`,
});

const adminRateLimiter = createRateLimiter({
  name: 'admin_login',
  windowMs: 15 * 60 * 1000,
  maxRequests: 8,
  messageAr: 'تم حظر محاولات الدخول لغرفة الإدارة مؤقتًا لحماية النظام.',
});

router.post('/register', natAuthLimiter, loginAccountRateLimiter, async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
    const phoneRaw = String(req.body?.phoneNumber || '').trim();
    const gradeId = Number(req.body?.gradeId);
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    const nameCheck = validateQuadName(fullName);
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error || 'يرجى إدخال الاسم الرباعي كاملًا.', field: 'full_name' });
      return;
    }
    if (!isValidPhone(phoneRaw)) {
      res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح.' });
      return;
    }
    const grade = await getGradeById(gradeId);
    if (!grade || !grade.is_active) {
      res.status(400).json({ error: 'الصف الدراسي المختار غير صالح.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'كلمتا المرور غير متطابقتين.' });
      return;
    }

    const normalizedFullName = normalizeArabicName(fullName);
    const phoneNumber = normalizePhone(phoneRaw);
    const passwordHash = hashPassword(password);

    const student = await registerStudent({
      gradeId,
      fullName,
      normalizedFullName,
      phoneNumber,
      passwordHash,
    });

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    await createUserSession({
      subjectType: 'student',
      subjectId: student.id,
      tokenHash,
      deviceLabel: String(req.get('user-agent') || 'متصفح ويب').slice(0, 120),
      ipAddress: req.ip || null,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
    });

    setAuthCookie(req, res, STUDENT_COOKIE_NAME, token, SESSION_MAX_AGE_MS);
    res.status(201).json({
      token,
      student: {
        id: student.id,
        fullName: student.full_name,
        phoneNumber: student.phone_number,
        gradeId: student.grade_id,
        gradeName: grade.name_ar,
        mustChangePassword: student.must_change_password,
      },
    });
  } catch (err) {
    if (err instanceof DuplicateFieldError) {
      res.status(409).json({ error: err.message, field: err.field });
      return;
    }
    next(err);
  }
});

router.post('/login', natAuthLimiter, loginAccountRateLimiter, async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
    const password = String(req.body?.password || '');

    if (!fullName || !password) {
      res.status(400).json({ error: 'يرجى إدخال الاسم الرباعي وكلمة المرور.' });
      return;
    }

    const normalized = normalizeArabicName(fullName);
    const student = await findStudentByNormalizedName(normalized);
    if (!student || !verifyPassword(password, student.password_hash)) {
      res.status(401).json({ error: 'الاسم الرباعي أو كلمة المرور غير صحيحة.' });
      return;
    }
    if (student.status === 'suspended') {
      res.status(403).json({ error: 'تم إيقاف هذا الحساب مؤقتًا، يرجى التواصل مع الأستاذ.' });
      return;
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    await createUserSession({
      subjectType: 'student',
      subjectId: student.id,
      tokenHash,
      deviceLabel: String(req.get('user-agent') || 'متصفح ويب').slice(0, 120),
      ipAddress: req.ip || null,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
    });

    await updateStudent(student.id, { lastActivityAt: new Date().toISOString() });
    const grade = await getGradeById(student.grade_id);

    setAuthCookie(req, res, STUDENT_COOKIE_NAME, token, SESSION_MAX_AGE_MS);
    res.json({
      token,
      student: {
        id: student.id,
        fullName: student.full_name,
        phoneNumber: student.phone_number,
        gradeId: student.grade_id,
        gradeName: grade?.name_ar || '',
        mustChangePassword: student.must_change_password,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cookieToken = req.cookies?.[STUDENT_COOKIE_NAME];
    const headerToken = req.get('x-student-token') || (req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '');
    const token = typeof cookieToken === 'string' && cookieToken.length >= 32 ? cookieToken : headerToken;

    if (!token || token.length < 32) {
      res.json({ student: null });
      return;
    }

    const session = await getActiveSessionByTokenHash(hashSessionToken(token));
    if (!session || session.subject_type !== 'student') {
      res.json({ student: null });
      return;
    }

    const { findStudentById } = await import('../db/usersRepo.ts');
    const student = await findStudentById(session.subject_id);
    if (!student || student.status === 'suspended') {
      res.json({ student: null });
      return;
    }
    const grade = await getGradeById(student.grade_id);
    res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        phoneNumber: student.phone_number,
        gradeId: student.grade_id,
        gradeName: grade?.name_ar || '',
        mustChangePassword: student.must_change_password,
        createdAt: student.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireStudent, async (req: AuthenticatedRequest, res, next) => {
  try {
    const student = req.student!;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!student.must_change_password) {
      if (!currentPassword || !verifyPassword(currentPassword, student.password_hash)) {
        res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
        return;
      }
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'كلمتا المرور غير متطابقتين.' });
      return;
    }

    await setStudentPassword(student.id, hashPassword(newPassword), false);
    res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح.' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token =
      req.cookies?.[STUDENT_COOKIE_NAME] ||
      req.get('x-student-token') ||
      req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (typeof token === 'string' && token.length >= 32) {
      await revokeSessionByTokenHash(hashSessionToken(token));
    }
    clearAuthCookie(req, res, STUDENT_COOKIE_NAME);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Admin Gate Auth ----------

router.get('/admin/status', async (req, res, next) => {
  try {
    const status = await getAdminPasscodeStatus();
    const token =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      req.get('x-admin-token') ||
      req.get('authorization')?.replace(/^Bearer\s+/i, '');

    let authenticated = false;
    if (typeof token === 'string' && token.length >= 32) {
      const session = await getActiveSessionByTokenHash(hashSessionToken(token));
      authenticated = Boolean(session && session.subject_type === 'teacher_admin');
    }

    res.json({ ...status, authenticated });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/setup', adminRateLimiter, async (req, res, next) => {
  try {
    const status = await getAdminPasscodeStatus();
    if (status.configured) {
      res.status(409).json({ error: 'تمت تهيئة رمز غرفة الإدارة مسبقًا.' });
      return;
    }

    const passcode = String(req.body?.passcode || '').trim();
    const confirmPasscode = String(req.body?.confirmPasscode || '').trim();
    if (passcode.length < 6) {
      res.status(400).json({ error: 'يجب أن يتكون رمز الإدارة من 6 خانات على الأقل.' });
      return;
    }
    if (passcode !== confirmPasscode) {
      res.status(400).json({ error: 'رمزا الإدارة غير متطابقين.' });
      return;
    }

    const { hash, id } = createHashedAdminPasscode(passcode);
    await setPlatformSetting('admin_security', { hash, updatedAt: new Date().toISOString() });

    const token = generateSessionToken();
    await createUserSession({
      subjectType: 'teacher_admin',
      subjectId: id,
      tokenHash: hashSessionToken(token),
      deviceLabel: String(req.get('user-agent') || 'إدارة المنصة').slice(0, 120),
      ipAddress: req.ip || null,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_MAX_AGE_MS).toISOString(),
    });

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'admin_passcode_claimed',
      targetType: 'platform_settings',
      targetId: 'admin_security',
      ipAddress: req.ip || null,
    });

    setAuthCookie(req, res, ADMIN_COOKIE_NAME, token, ADMIN_SESSION_MAX_AGE_MS);
    res.status(201).json({ token, authenticated: true });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/login', adminRateLimiter, async (req, res, next) => {
  try {
    const passcode = String(req.body?.passcode || '').trim();
    const status = await getAdminPasscodeStatus();
    if (!status.configured) {
      res.status(400).json({ error: 'لم تتم تهيئة رمز الإدارة بعد.', unconfigured: true });
      return;
    }

    const valid = await verifyAdminPasscode(passcode);
    if (!valid) {
      await insertAuditLog({
        actorRole: 'anonymous',
        actorId: 'unknown',
        action: 'admin_login_failed',
        targetType: 'admin_gate',
        targetId: 'gate',
        ipAddress: req.ip || null,
      });
      res.status(401).json({ error: 'رمز دخول غرفة الإدارة غير صحيح.' });
      return;
    }

    const token = generateSessionToken();
    const adminSubjectId =
      (await getPlatformSetting<{ id?: string }>('admin_identity'))?.id ||
      '00000000-0000-0000-0000-000000000001';

    await createUserSession({
      subjectType: 'teacher_admin',
      subjectId: adminSubjectId,
      tokenHash: hashSessionToken(token),
      deviceLabel: String(req.get('user-agent') || 'إدارة المنصة').slice(0, 120),
      ipAddress: req.ip || null,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_MAX_AGE_MS).toISOString(),
    });

    await insertAuditLog({
      actorRole: 'teacher_admin',
      actorId: 'admin',
      action: 'admin_login_success',
      targetType: 'admin_gate',
      targetId: 'gate',
      ipAddress: req.ip || null,
    });

    setAuthCookie(req, res, ADMIN_COOKIE_NAME, token, ADMIN_SESSION_MAX_AGE_MS);
    res.json({ token, authenticated: true });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/logout', async (req, res, next) => {
  try {
    const token =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      req.get('x-admin-token') ||
      req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (typeof token === 'string' && token.length >= 32) {
      await revokeSessionByTokenHash(hashSessionToken(token));
    }
    clearAuthCookie(req, res, ADMIN_COOKIE_NAME);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
