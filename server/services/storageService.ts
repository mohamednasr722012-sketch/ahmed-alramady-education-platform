import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.ts';

export type StorageBucket = 'videos' | 'thumbnails' | 'question-images';

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), '.data', 'uploads');

function ensureLocalBucketDir(bucket: StorageBucket): string {
  const dir = path.resolve(LOCAL_UPLOAD_ROOT, bucket);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveSafeLocalUploadPath(bucket: StorageBucket, filename: string): string {
  const baseDir = ensureLocalBucketDir(bucket);
  const safeName = path.basename(filename);
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('مسار ملف غير صالح');
  }
  return resolved;
}

export async function uploadFileToStorage(params: {
  bucket: StorageBucket;
  originalName: string;
  mimeType: string;
  filePath?: string;
  buffer?: Buffer;
}): Promise<{ storagePath: string; fileSizeBytes: number }> {
  const ext = path.extname(params.originalName).toLowerCase() || '.bin';
  const objectName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const payloadBuffer = params.filePath
      ? await fs.promises.readFile(params.filePath)
      : params.buffer;
    if (!payloadBuffer) {
      throw new Error('لم يتم توفير بيانات الملف للرفع.');
    }
    const { error } = await supabase.storage
      .from(params.bucket)
      .upload(objectName, payloadBuffer, {
        contentType: params.mimeType,
        upsert: false,
      });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('maximum allowed size') || msg.includes('payload too large') || msg.includes('413')) {
        throw new Error(
          'حجم الملف يتجاوز حد الرفع المباشر في الخطة المجانية (50 ميجابايت)؛ استخدم تبويب (رابط مجاني بلا حدود) عبر يوتيوب أو جوجل درايف.'
        );
      }
      throw new Error(`فشل رفع الملف إلى Supabase Storage: ${error.message}`);
    }
    return {
      storagePath: `${params.bucket}/${objectName}`,
      fileSizeBytes: payloadBuffer.length,
    };
  }

  const targetPath = resolveSafeLocalUploadPath(params.bucket, objectName);
  if (params.filePath) {
    try {
      await fs.promises.rename(params.filePath, targetPath);
    } catch {
      await fs.promises.copyFile(params.filePath, targetPath);
      await fs.promises.unlink(params.filePath).catch(() => undefined);
    }
    const stat = await fs.promises.stat(targetPath);
    return {
      storagePath: `local:${params.bucket}/${objectName}`,
      fileSizeBytes: stat.size,
    };
  }

  if (!params.buffer) {
    throw new Error('لم يتم توفير بيانات الملف للحفظ.');
  }
  await fs.promises.writeFile(targetPath, params.buffer);
  return {
    storagePath: `local:${params.bucket}/${objectName}`,
    fileSizeBytes: params.buffer.length,
  };
}

export async function deleteFileFromStorage(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;

  if (storagePath.startsWith('local:')) {
    const rel = storagePath.slice('local:'.length);
    const [bucket, ...rest] = rel.split('/');
    const filename = rest.join('/');
    if ((bucket === 'videos' || bucket === 'thumbnails' || bucket === 'question-images') && filename) {
      const target = resolveSafeLocalUploadPath(bucket, filename);
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }
    return;
  }

  const supabase = getSupabaseAdmin();
  if (supabase && storagePath.includes('/')) {
    const [bucket, ...rest] = storagePath.split('/');
    const objectName = rest.join('/');
    await supabase.storage.from(bucket).remove([objectName]);
  }
}

export async function resolvePlaybackOrAssetUrl(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('/assets/')) {
    return storagePath;
  }
  if (storagePath.startsWith('local:')) {
    const rel = storagePath.slice('local:'.length);
    return `/api/media/${rel}`;
  }

  const supabase = getSupabaseAdmin();
  if (supabase && storagePath.includes('/')) {
    const [bucket, ...rest] = storagePath.split('/');
    const objectName = rest.join('/');
    if (bucket === 'videos') {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectName, 60 * 60 * 3);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } else {
      const { data } = supabase.storage.from(bucket).getPublicUrl(objectName);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }
  }

  return null;
}
