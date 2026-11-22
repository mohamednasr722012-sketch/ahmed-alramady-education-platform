import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { env, isSupabaseConfigured } from './server/config/env.ts';
import {
  ADMIN_COOKIE_NAME,
  STUDENT_COOKIE_NAME,
  extractTokenFromRequest,
} from './server/middleware/auth.ts';
import { hashSessionToken } from './server/services/password.ts';
import { verifyOriginMiddleware } from './server/middleware/originCheck.ts';
import { createRateLimiter } from './server/middleware/rateLimit.ts';
import { closeSqliteDb, getSqliteDb } from './server/db/sqliteAdapter.ts';
import authRoutes from './server/routes/auth.routes.ts';
import publicRoutes from './server/routes/public.routes.ts';
import studentRoutes from './server/routes/student.routes.ts';
import adminRoutes from './server/routes/admin.routes.ts';
import { runDuePublicationsOnce, startPublicationScheduler } from './server/jobs/publicationScheduler.ts';

export async function createAppServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // تهيئة قاعدة البيانات مبكرًا عند التشغيل المحلي
  if (!isSupabaseConfigured()) {
    getSqliteDb();
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(verifyOriginMiddleware);

  const sessionBurstLimiter = createRateLimiter({
    name: 'api_session_burst',
    windowMs: 10_000,
    maxRequests: 250,
    messageAr: 'الضغط مرتفع جدًا حاليًا من جلستك، يرجى التريث لحظات ثم المحاولة مجددًا.',
    keyGenerator: (req) => {
      const sToken = extractTokenFromRequest(req, STUDENT_COOKIE_NAME, 'x-student-token');
      if (sToken) return `stu:${hashSessionToken(sToken).slice(0, 16)}`;
      const aToken = extractTokenFromRequest(req, ADMIN_COOKIE_NAME, 'x-admin-token');
      if (aToken) return `adm:${hashSessionToken(aToken).slice(0, 16)}`;
      return `anon:${req.ip || 'unknown'}`;
    },
  });

  const anonNatBurstLimiter = createRateLimiter({
    name: 'api_anon_nat_burst',
    windowMs: 10_000,
    maxRequests: 4000,
    messageAr: 'الضغط مرتفع جدًا حاليًا من هذه الشبكة، يرجى التريث لحظات ثم المحاولة مجددًا.',
    keyGenerator: (req) => `anon:${req.ip || 'unknown'}`,
  });

  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/media/')) {
      next();
      return;
    }
    const hasSession =
      Boolean(extractTokenFromRequest(req, STUDENT_COOKIE_NAME, 'x-student-token')) ||
      Boolean(extractTokenFromRequest(req, ADMIN_COOKIE_NAME, 'x-admin-token'));
    if (hasSession) {
      sessionBurstLimiter(req, res, next);
      return;
    }
    anonNatBurstLimiter(req, res, next);
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: isSupabaseConfigured() ? 'supabase' : 'local_preview',
      serverTimeIso: new Date().toISOString(),
    });
  });

  // مسار Cron آمن للاستدعاء من Vercel Cron أو مشغّل خارجي بمفتاح CRON_SECRET
  app.post('/api/cron/publish', async (req, res, next) => {
    try {
      const secret = req.get('x-cron-secret') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!env.cronSecret || secret !== env.cronSecret) {
        res.status(401).json({ error: 'غير مصرح.' });
        return;
      }
      const result = await runDuePublicationsOnce();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api', publicRoutes); // يخدم /api/media/:bucket/:filename
  app.use('/api/student', studentRoutes);
  app.use('/api/admin', adminRoutes);

  // Error Handler (handles malformed JSON cleanly as 400 without crashing)
  app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'صيغة البيانات المرسلة غير صالحة.' });
      return;
    }
    console.error('[Server Error]', err);
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 500).json({
      error: err.message || 'حدث خطأ داخلي في الخادم.',
    });
  });

  if (env.nodeEnv === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (env.nodeEnv === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('', 'server.ts'));

if (isDirectEntry) {
  createAppServer()
    .then((app) => {
      startPublicationScheduler();
      const httpServer = app.listen(env.port, '0.0.0.0', 2048, () => {
        console.log(
          `[منصة أحمد الرمادي] الخادم يعمل على المنفذ ${env.port} (${
            isSupabaseConfigured() ? 'Supabase متصل' : 'وضع المعاينة المحلي'
          })`
        );
      });

      httpServer.keepAliveTimeout = 65_000;
      httpServer.headersTimeout = 66_000;
      httpServer.requestTimeout = 120_000;

      const shutdown = (signal: string) => {
        console.log(`[Server] استلام إشارة ${signal} — إغلاق آمن للخادم وقاعدة البيانات...`);
        httpServer.close(() => {
          closeSqliteDb();
          process.exit(0);
        });
        setTimeout(() => {
          closeSqliteDb();
          process.exit(1);
        }, 8000).unref();
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('فشل تشغيل الخادم:', err);
      process.exit(1);
    });
}
