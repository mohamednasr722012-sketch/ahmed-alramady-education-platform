import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function verifyOriginMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Allow non-browser / integration requests that don't carry Origin (or check Origin when present)
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }

  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  if (!host) {
    next();
    return;
  }

  try {
    const parsedOrigin = new URL(origin);
    const originHost = parsedOrigin.host;
    if (
      originHost === host ||
      parsedOrigin.hostname === 'localhost' ||
      parsedOrigin.hostname === '127.0.0.1'
    ) {
      next();
      return;
    }
  } catch {
    // invalid origin
  }

  res.status(403).json({ error: 'طلب مرفوض لعدم تطابق مصدر الطلب.' });
}
