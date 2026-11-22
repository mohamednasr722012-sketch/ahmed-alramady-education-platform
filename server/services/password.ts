import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function generateTemporaryPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function normalizeArabicName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g, '') // invisible directional / zero-width marks
    .replace(/\u0640/g, '') // tatweel / kashida (ـ)
    .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics (tashkeel)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[ہھۀ]/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function compactArabicName(name: string): string {
  return normalizeArabicName(name).replace(/\s+/g, '');
}

export function normalizePhone(phone: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const converted = phone.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
  let cleaned = converted.replace(/[\s\-()]/g, '').trim();
  if (cleaned.startsWith('+20')) {
    cleaned = '0' + cleaned.slice(3).replace(/^0+/, '');
  } else if (cleaned.startsWith('0020')) {
    cleaned = '0' + cleaned.slice(4).replace(/^0+/, '');
  } else if (/^201[0125]\d{8}$/.test(cleaned)) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

export function validateQuadName(name: string): { valid: boolean; error?: string } {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF\u0640]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!cleaned || !/^[\p{L}\s]+$/u.test(cleaned)) {
    return {
      valid: false,
      error: 'يرجى إدخال الاسم الرباعي بحروف صحيحة دون أرقام أو رموز.',
    };
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 4 || !parts.every((p) => p.length >= 2)) {
    return {
      valid: false,
      error: 'يرجى إدخال الاسم الرباعي كاملًا (أربعة مقاطع على الأقل، وكل مقطع من حرفين فأكثر).',
    };
  }

  const normalizedParts = parts.map((p) => normalizeArabicName(p)).filter(Boolean);
  const counts = new Map<string, number>();
  let maxFreq = 0;
  for (const part of normalizedParts) {
    const nextCount = (counts.get(part) || 0) + 1;
    counts.set(part, nextCount);
    if (nextCount > maxFreq) maxFreq = nextCount;
  }

  if (maxFreq >= 3) {
    return {
      valid: false,
      error: 'لا يمكن تكرار نفس الاسم أكثر من مرتين داخل الاسم الرباعي؛ يرجى كتابة الاسم الحقيقي كاملًا.',
    };
  }

  if (counts.size < 3) {
    return {
      valid: false,
      error: 'يرجى كتابة الاسم الرباعي الحقيقي (اسم الطالب والأب والجد واللقب) دون تكرار.',
    };
  }

  return { valid: true };
}

export function isValidQuadName(name: string): boolean {
  return validateQuadName(name).valid;
}

export function isValidPhone(phone: string): boolean {
  const cleaned = normalizePhone(phone);
  return /^(\+?\d{10,15})$/.test(cleaned);
}
