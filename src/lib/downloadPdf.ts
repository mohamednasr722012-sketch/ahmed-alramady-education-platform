import { getStoredAdminToken, getStoredStudentToken } from './api';

export async function fetchPdfBlobUrl(url: string): Promise<string> {
  const headers = new Headers();
  const st = getStoredStudentToken();
  if (st) headers.set('x-student-token', st);
  if (url.includes('/admin')) {
    const ad = getStoredAdminToken();
    if (ad) headers.set('x-admin-token', ad);
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = 'تعذر تحميل ملف الشهادة.';
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) msg = json.error;
    } catch {
      // ignore non-json
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function downloadPdfFile(url: string, filename: string): Promise<void> {
  const blobUrl = await fetchPdfBlobUrl(url);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  }
}
