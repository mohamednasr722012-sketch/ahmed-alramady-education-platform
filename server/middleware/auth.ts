import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.ts';
import {
  findStudentById,
  getActiveSessionByTokenHash,
  getPlatformSetting,
} from '../db/usersRepo.ts';
import type { StudentRecord } from '../db/types.ts';
import { hashPassword, hashSessionToken, safeCompareStrings, verifyPassword } from '../services/password.ts';

export const STUDENT_COOKIE_NAME = 'ramady_student_session';
export const ADMIN_COOKIE_NAME = 'ramady_admin_session';

export interface AuthenticatedRequest extends Request {
  student?: StudentRecord;
  studentSessionHash?: string;
  adminSession?: { id: string; tokenHash: string };
}

export function extractTokenFromRequest(
  req: Request,
  cookieName: string,
  headerName: string
): string | null {
  const cookieToken = req.cookies?.[cookieName];
  if (typeof cookieToken === 'string' && cookieToken.length >= 32) {
    return cookieToken;
  }
  const customHeader = req.get(headerName);
  if (typeof customHeader === 'string' && customHeader.length >= 32) {
    return customHeader;
  }
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length >= 32) return token;
  }
  return null;
}

export function isHttpsRequest(req: Request): boolean {
  const xfProto = req.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  if (xfProto) return xfProto === 'https';
  if (req.secure) return true;
  const origin = req.get('origin');
  if (origin) return origin.startsWith('https://');
  const referer = req.get('referer');
  if (referer) return referer.startsWith('https://');
  const host = (req.get('host') || '').toLowerCase();
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    return false;
  }
  return env.appUrl.toLowerCase().startsWith('https://');
}

export function setAuthCookie(
  req: Request,
  res: Response,
  name: string,
  token: string,
  maxAgeMs: number
): void {
  const expires = new Date(Date.now() + maxAgeMs).toUTCString();
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  if (isHttpsRequest(req)) {
    // Partitioned + SameSite=None + Secure ensures cookies work reliably inside HTTPS iframes & production HTTPS
    res.append(
      'Set-Cookie',
      `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAgeSec}; Expires=${expires}`
    );
  } else {
    // Plain HTTP (e.g., local http://localhost:3000) requires omitting Secure so browsers accept the cookie
    res.append(
      'Set-Cookie',
      `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}; Expires=${expires}`
    );
  }
}

export function clearAuthCookie(req: Request, res: Response, name: string): void {
  if (isHttpsRequest(req)) {
    res.append(
      'Set-Cookie',
      `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    );
  } else {
    res.append(
      'Set-Cookie',
      `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    );
  }
}

export async function resolveOptionalMediaActor(
  req: Request
): Promise<{ role: 'teacher_admin' } | { role: 'student'; student: StudentRecord } | null> {
  const adminToken = extractTokenFromRequest(req, ADMIN_COOKIE_NAME, 'x-admin-token');
  if (adminToken) {
    const session = await getActiveSessionByTokenHash(hashSessionToken(adminToken));
    if (session && session.subject_type === 'teacher_admin') {
      return { role: 'teacher_admin' };
    }
  }
  const studentToken = extractTokenFromRequest(req, STUDENT_COOKIE_NAME, 'x-student-token');
  if (studentToken) {
    const session = await getActiveSessionByTokenHash(hashSessionToken(studentToken));
    if (session && session.subject_type === 'student') {
      const student = await findStudentById(session.subject_id);
      if (student && student.status === 'active') {
        return { role: 'student', student };
      }
    }
  }
  return null;
}

export async function requireStudent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromRequest(req, STUDENT_COOKIE_NAME, 'x-student-token');
    if (!token) {
      res.status(401).json({ error: 'برجاء تسجيل الدخول أولًا.' });
      return;
    }
    const tokenHash = hashSessionToken(token);
    const session = await getActiveSessionByTokenHash(tokenHash);
    if (!session || session.subject_type !== 'student') {
      res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجددًا.' });
      return;
    }
    const student = await findStudentById(session.subject_id);
    if (!student) {
      res.status(401).json({ error: 'حساب الطالب غير موجود.' });
      return;
    }
    if (student.status === 'suspended') {
      res.status(403).json({ error: 'تم إيقاف هذا الحساب مؤقتًا من قِبل الإدارة.' });
      return;
    }
    req.student = student;
    req.studentSessionHash = tokenHash;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePasswordUpdated(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.student?.must_change_password) {
    res.status(403).json({
      error: 'يجب تغيير كلمة المرور المؤقتة قبل المتابعة.',
      mustChangePassword: true,
    });
    return;
  }
  next();
}

export async function requireTeacherAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromRequest(req, ADMIN_COOKIE_NAME, 'x-admin-token');
    if (!token) {
      res.status(401).json({ error: 'يتطلب الدخول إلى غرفة الإدارة مصادقة صالحة.' });
      return;
    }
    const tokenHash = hashSessionToken(token);
    const session = await getActiveSessionByTokenHash(tokenHash);
    if (!session || session.subject_type !== 'teacher_admin') {
      res.status(403).json({ error: 'غير مصرح لك بالوصول إلى غرفة الإدارة.' });
      return;
    }
    req.adminSession = { id: session.id, tokenHash };
    next();
  } catch (err) {
    next(err);
  }
}

export async function getAdminPasscodeStatus(): Promise<{
  configured: boolean;
  source: 'env' | 'db' | 'unconfigured';
}> {
  if (env.adminAccessCode) {
    return { configured: true, source: 'env' };
  }
  const dbSetting = await getPlatformSetting<{ hash?: string }>('admin_security');
  if (dbSetting?.hash) {
    return { configured: true, source: 'db' };
  }
  return { configured: false, source: 'unconfigured' };
}

export async function verifyAdminPasscode(passcode: string): Promise<boolean> {
  if (!passcode) return false;
  if (env.adminAccessCode) {
    return safeCompareStrings(passcode, env.adminAccessCode);
  }
  const dbSetting = await getPlatformSetting<{ hash?: string }>('admin_security');
  if (dbSetting?.hash) {
    return verifyPassword(passcode, dbSetting.hash);
  }
  return false;
}

export function createHashedAdminPasscode(passcode: string): { hash: string; id: string } {
  return {
    hash: hashPassword(passcode),
    id: crypto.randomUUID(),
  };
}
