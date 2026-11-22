import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const fallbackSessionSecret = crypto.randomBytes(32).toString('hex');

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.argv.includes('--prod')
    ? 'production'
    : process.argv.includes('--test')
      ? 'test'
      : process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  adminAccessCode: (process.env.ADMIN_ACCESS_CODE || '').trim(),
  sessionSecret: (process.env.SESSION_SECRET || '').trim() || fallbackSessionSecret,
  cronSecret: (process.env.CRON_SECRET || '').trim(),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
