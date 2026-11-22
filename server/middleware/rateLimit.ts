import type { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, BucketEntry>>();
const MAX_IPS_PER_LIMITER = 25_000;

export function createRateLimiter(options: {
  name: string;
  windowMs: number;
  maxRequests: number;
  messageAr: string;
  keyGenerator?: (req: Request) => string;
}) {
  if (!stores.has(options.name)) {
    stores.set(options.name, new Map());
  }
  const store = stores.get(options.name)!;
  let opsSinceSweep = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const fallbackIp = req.ip || req.socket.remoteAddress || 'unknown';
    const bucketKey = options.keyGenerator ? options.keyGenerator(req) : fallbackIp;
    const now = Date.now();

    opsSinceSweep += 1;
    if (opsSinceSweep >= 200 || store.size > MAX_IPS_PER_LIMITER) {
      opsSinceSweep = 0;
      for (const [key, entry] of store.entries()) {
        if (entry.resetAt <= now) {
          store.delete(key);
        }
      }
      if (store.size > MAX_IPS_PER_LIMITER) {
        const overflow = store.size - MAX_IPS_PER_LIMITER;
        let removed = 0;
        for (const key of store.keys()) {
          store.delete(key);
          removed += 1;
          if (removed >= overflow) break;
        }
      }
    }

    const existing = store.get(bucketKey);
    if (!existing || existing.resetAt <= now) {
      store.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retrySeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.status(429).json({
        error: options.messageAr,
        retryAfterSeconds: retrySeconds,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
