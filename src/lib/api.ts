export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const STUDENT_TOKEN_KEY = 'ramady_student_token';
const ADMIN_TOKEN_KEY = 'ramady_admin_token';

export function setStoredStudentToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(STUDENT_TOKEN_KEY, token);
    else window.localStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

export function getStoredStudentToken(): string | null {
  try {
    return window.localStorage.getItem(STUDENT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

export function getStoredAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = new Headers(options.headers || {});
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (!headers.has('x-student-token')) {
    const st = getStoredStudentToken();
    if (st) headers.set('x-student-token', st);
  }
  if (url.includes('/admin') && !headers.has('x-admin-token')) {
    const ad = getStoredAdminToken();
    if (ad) headers.set('x-admin-token', ad);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed.error === 'string' && parsed.error
        ? parsed.error
        : 'حدث خطأ أثناء الاتصال بالخادم.';
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as T;
}
