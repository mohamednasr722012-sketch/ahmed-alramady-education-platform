export interface ParsedVideoPlayback {
  kind: 'iframe' | 'video';
  src: string;
  providerLabel: string;
  autoThumbnailUrl: string | null;
  externalOpenUrl?: string | null;
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
        const id = parts[1];
        return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractGoogleDriveId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const isDriveHost =
      host === 'drive.google.com' ||
      host === 'docs.google.com' ||
      host === 'drive.usercontent.google.com';
    if (!isDriveHost) return null;

    const match = u.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) return match[1];

    const dMatch = u.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch?.[1]) return dMatch[1];

    const qId = u.searchParams.get('id');
    if (qId && /^[a-zA-Z0-9_-]{10,}$/.test(qId)) return qId;
  } catch {
    return null;
  }
  return null;
}

export function extractVimeoId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      const numeric = [...parts].reverse().find((p) => /^\d{5,}$/.test(p));
      return numeric || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseVideoPlayback(rawUrl: string | null | undefined): ParsedVideoPlayback | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    return {
      kind: 'iframe',
      src: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0`,
      providerLabel: 'يوتيوب (مجاني بلا حدود)',
      autoThumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      externalOpenUrl: `https://www.youtube.com/watch?v=${ytId}`,
    };
  }

  const driveId = extractGoogleDriveId(trimmed);
  if (driveId) {
    return {
      kind: 'iframe',
      src: `https://drive.google.com/file/d/${driveId}/preview`,
      providerLabel: 'جوجل درايف (مجاني)',
      autoThumbnailUrl: null,
      externalOpenUrl: `https://drive.google.com/file/d/${driveId}/view`,
    };
  }

  const vimeoId = extractVimeoId(trimmed);
  if (vimeoId) {
    return {
      kind: 'iframe',
      src: `https://player.vimeo.com/video/${vimeoId}`,
      providerLabel: 'Vimeo',
      autoThumbnailUrl: null,
      externalOpenUrl: `https://vimeo.com/${vimeoId}`,
    };
  }

  return {
    kind: 'video',
    src: trimmed,
    providerLabel: trimmed.startsWith('/api/media/') ? 'ملف مرفوع على الخادم' : 'رابط فيديو مباشر',
    autoThumbnailUrl: null,
    externalOpenUrl: null,
  };
}
