import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
import type { CertificateRecord, GradeRecord, StudentRecord } from '../db/types.ts';

const rawBidi = bidiFactory();
const bidi = rawBidi as typeof rawBidi & {
  getReorderedIndices: (
    text: string,
    embedResult: ReturnType<typeof rawBidi.getEmbeddingLevels>
  ) => number[];
};

const fontsDir = path.resolve(process.cwd(), 'server', 'assets', 'fonts');
const notoRegularBytes = fs.readFileSync(path.join(fontsDir, 'NotoNaskhArabic-Regular.ttf'));
const notoBoldBytes = fs.readFileSync(path.join(fontsDir, 'NotoNaskhArabic-Bold.ttf'));
const dejavuRegularBytes = fs.readFileSync(path.join(fontsDir, 'DejaVuSans.ttf'));
const dejavuBoldBytes = fs.readFileSync(path.join(fontsDir, 'DejaVuSans-Bold.ttf'));

// فحص توافر الحروف داخل خط NotoNaskhArabic عبر fontkit لتجنب أي مربعات مفقودة
const notoRegularInspect = fontkit.create(notoRegularBytes);

const ARABIC_NON_LEFT_JOINERS = new Set([
  '\u0621', // ء
  '\u0622', // آ
  '\u0623', // أ
  '\u0624', // ؤ
  '\u0625', // إ
  '\u0627', // ا
  '\u0629', // ة
  '\u062F', // د
  '\u0630', // ذ
  '\u0631', // ر
  '\u0632', // ز
  '\u0648', // و
  '\u0649', // ى
  '\u0671', // ٱ
  '\uFEF5',
  '\uFEF6',
  '\uFEF7',
  '\uFEF8',
  '\uFEF9',
  '\uFEFA',
  '\uFEFB',
  '\uFEFC',
]);

const LAM_ALEF_PRESENTATION_FORMS: Record<string, [string, string]> = {
  '\u0622': ['\uFEF5', '\uFEF6'], // لآ (isolated, final)
  '\u0623': ['\uFEF7', '\uFEF8'], // لأ (isolated, final)
  '\u0625': ['\uFEF9', '\uFEFA'], // لإ (isolated, final)
  '\u0627': ['\uFEFB', '\uFEFC'], // لا (isolated, final)
};

function isArabicDiacritic(cp: number): boolean {
  return (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670;
}

function isArabicLetter(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x0621 && cp <= 0x064a) || (cp >= 0x0671 && cp <= 0x06d3);
}

/**
 * يستبدل مقاطع (ل + ا/أ/إ/آ) بصيغ العرض العربية الموحدة (Presentation Forms-B)
 * لأن NotoNaskhArabic يفكك اللام ألف عبر GPOS xOffset الذي لا يدعمه pdf-lib، مما يسبب فراغًا داخل الكلمة وإزاحة للسطر.
 */
function fixLamAlefPresentationForms(arabicLogical: string): string {
  const chars = Array.from(arabicLogical);
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (ch === '\u0644' && next && LAM_ALEF_PRESENTATION_FORMS[next]) {
      let prevLetter = '';
      for (let k = i - 1; k >= 0; k -= 1) {
        const cp = chars[k].codePointAt(0) ?? 0;
        if (isArabicDiacritic(cp)) continue;
        prevLetter = chars[k];
        break;
      }
      const joinsFromRight =
        prevLetter !== '' && isArabicLetter(prevLetter) && !ARABIC_NON_LEFT_JOINERS.has(prevLetter);
      const [isolatedForm, finalForm] = LAM_ALEF_PRESENTATION_FORMS[next];
      out += joinsFromRight ? finalForm : isolatedForm;
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function notoSupportsChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  // حروف الربط والتشكيل والفراغات والأحرف العربية الأساسية
  if (cp === 0x20 || cp === 0x0640) return true;
  if (cp >= 0x0660 && cp <= 0x0669) return false; // تُرسم الأرقام عبر DejaVu بترتيبها الصحيح
  if (cp >= 0x30 && cp <= 0x39) return false; // الأرقام الإنجليزية عبر DejaVu
  return notoRegularInspect.hasGlyphForCodePoint(cp);
}

interface VisualChunk {
  text: string;
  useArabicFont: boolean;
}

/**
 * تقسيم السطر إلى مقاطع بصرية من اليسار لليمين وفق معيار Unicode BiDi:
 * - المقاطع العربية (RTL) تُمرَّر بحروفها المنطقية الأصلية إلى خط NotoNaskhArabic لأن fontkit داخل pdf-lib
 *   يقوم تلقائيًا بتشكيل الحروف (OpenType GSUB/GPOS) وعكس ترتيب المقطع العربي بدقة كاملة.
 * - المقاطع اللاتينية والأرقام والرموز (LTR مثل 100% و ARM-2026-...) تُمرَّر لخط DejaVuSans بترتيبها الصحيح.
 */
function buildVisualChunks(rawText: string): VisualChunk[] {
  const cleaned = rawText.replace(/[\r\n]+/g, ' ').trim();
  if (!cleaned) return [];

  const chars = Array.from(cleaned);
  const embed = bidi.getEmbeddingLevels(cleaned, 'rtl');
  const visualIndices = bidi.getReorderedIndices(cleaned, embed);

  const chunks: VisualChunk[] = [];

  for (let i = 0; i < visualIndices.length; ) {
    const idx = visualIndices[i];
    const ch = chars[idx];
    const isRtlLevel = embed.levels[idx] % 2 === 1;
    const isArabicRun = isRtlLevel && notoSupportsChar(ch);

    if (isArabicRun) {
      const collected: string[] = [];
      let j = i;
      while (j < visualIndices.length) {
        const nextIdx = visualIndices[j];
        const nextCh = chars[nextIdx];
        const nextRtl = embed.levels[nextIdx] % 2 === 1;
        if (!nextRtl || !notoSupportsChar(nextCh)) break;
        collected.push(nextCh);
        j += 1;
      }
      // visualIndices يمشي من اليسار لليمين، فترتيب الحروف داخل المقطع العربي يكون معكوسًا بصريًا؛
      // نعيد عكسه للترتيب المنطقي ليقوم fontkit بتشكيله ورسمه بالاتجاه الصحيح دون ازدواجية.
      const logicalArabic = fixLamAlefPresentationForms(collected.reverse().join(''));
      chunks.push({ text: logicalArabic, useArabicFont: true });
      i = j;
    } else {
      // الأرقام الهندية الشرقية (٠-٩) يصنفها fontkit كـ arab ويعكسها؛ نرسم كل رقم مفردًا ليحافظ على ترتيبه
      const cp = ch.codePointAt(0) ?? 0;
      if (cp >= 0x0660 && cp <= 0x0669) {
        chunks.push({ text: ch, useArabicFont: false });
        i += 1;
        continue;
      }

      const collected: string[] = [];
      let j = i;
      while (j < visualIndices.length) {
        const nextIdx = visualIndices[j];
        const nextCh = chars[nextIdx];
        const nextCp = nextCh.codePointAt(0) ?? 0;
        const nextRtl = embed.levels[nextIdx] % 2 === 1;
        const nextIsArabicRun = nextRtl && notoSupportsChar(nextCh);
        if (nextIsArabicRun || (nextCp >= 0x0660 && nextCp <= 0x0669)) break;
        collected.push(nextCh);
        j += 1;
      }
      chunks.push({ text: collected.join(''), useArabicFont: false });
      i = j;
    }
  }

  return chunks;
}

function wrapArabicLines(text: string, maxCharsPerLine = 54): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface CertTheme {
  labelAr: string;
  stampAr: string;
  outerBg: ReturnType<typeof rgb>;
  innerBg: ReturnType<typeof rgb>;
  plaqueBg: ReturnType<typeof rgb>;
  ribbonBg: ReturnType<typeof rgb>;
  ribbonText: ReturnType<typeof rgb>;
  primaryAccent: ReturnType<typeof rgb>;
  secondaryAccent: ReturnType<typeof rgb>;
  titleColor: ReturnType<typeof rgb>;
  studentColor: ReturnType<typeof rgb>;
  bodyColor: ReturnType<typeof rgb>;
  mutedColor: ReturnType<typeof rgb>;
  watermarkColor: ReturnType<typeof rgb>;
  isLightCanvas: boolean;
}

function getCertificateTheme(certType: CertificateRecord['cert_type']): CertTheme {
  switch (certType) {
    case 'top_of_grade':
      return {
        labelAr: 'وسام الصدارة والمركز الأول — لوحة الشرف العليا',
        stampAr: 'المركز الأول',
        outerBg: rgb(0.03, 0.04, 0.07),
        innerBg: rgb(0.06, 0.08, 0.15),
        plaqueBg: rgb(0.09, 0.11, 0.2),
        ribbonBg: rgb(0.62, 0.08, 0.22),
        ribbonText: rgb(0.98, 0.94, 0.8),
        primaryAccent: rgb(0.89, 0.74, 0.26),
        secondaryAccent: rgb(0.75, 0.16, 0.3),
        titleColor: rgb(0.93, 0.79, 0.34),
        studentColor: rgb(0.99, 0.99, 0.99),
        bodyColor: rgb(0.94, 0.95, 0.97),
        mutedColor: rgb(0.72, 0.76, 0.84),
        watermarkColor: rgb(0.89, 0.74, 0.26),
        isLightCanvas: false,
      };
    case 'excellence':
      return {
        labelAr: 'درع التفوق والتميّز — نخبة اللغة العربية',
        stampAr: 'تفوق ممتاز',
        outerBg: rgb(0.02, 0.08, 0.06),
        innerBg: rgb(0.03, 0.13, 0.1),
        plaqueBg: rgb(0.05, 0.17, 0.13),
        ribbonBg: rgb(0.07, 0.28, 0.2),
        ribbonText: rgb(0.92, 0.98, 0.94),
        primaryAccent: rgb(0.86, 0.72, 0.28),
        secondaryAccent: rgb(0.22, 0.82, 0.58),
        titleColor: rgb(0.32, 0.88, 0.65),
        studentColor: rgb(0.98, 0.99, 0.98),
        bodyColor: rgb(0.91, 0.96, 0.94),
        mutedColor: rgb(0.68, 0.8, 0.75),
        watermarkColor: rgb(0.22, 0.82, 0.58),
        isLightCanvas: false,
      };
    case 'achievement':
      return {
        labelAr: 'نوط الإنجاز والاجتياز المعتمد',
        stampAr: 'إنجاز معتمد',
        outerBg: rgb(0.02, 0.05, 0.12),
        innerBg: rgb(0.05, 0.1, 0.21),
        plaqueBg: rgb(0.08, 0.14, 0.28),
        ribbonBg: rgb(0.14, 0.22, 0.38),
        ribbonText: rgb(0.95, 0.97, 1.0),
        primaryAccent: rgb(0.85, 0.89, 0.95),
        secondaryAccent: rgb(0.85, 0.7, 0.26),
        titleColor: rgb(0.91, 0.95, 0.99),
        studentColor: rgb(0.99, 0.99, 1.0),
        bodyColor: rgb(0.9, 0.93, 0.98),
        mutedColor: rgb(0.68, 0.75, 0.86),
        watermarkColor: rgb(0.85, 0.89, 0.95),
        isLightCanvas: false,
      };
    case 'appreciation':
      return {
        labelAr: 'مخطوطة شكر وتقدير رسمية',
        stampAr: 'تقدير خاص',
        outerBg: rgb(0.16, 0.08, 0.05),
        innerBg: rgb(0.98, 0.95, 0.89),
        plaqueBg: rgb(0.95, 0.9, 0.8),
        ribbonBg: rgb(0.52, 0.09, 0.19),
        ribbonText: rgb(0.98, 0.93, 0.78),
        primaryAccent: rgb(0.55, 0.1, 0.2),
        secondaryAccent: rgb(0.72, 0.54, 0.14),
        titleColor: rgb(0.5, 0.08, 0.18),
        studentColor: rgb(0.12, 0.07, 0.04),
        bodyColor: rgb(0.22, 0.14, 0.09),
        mutedColor: rgb(0.42, 0.32, 0.24),
        watermarkColor: rgb(0.72, 0.54, 0.14),
        isLightCanvas: true,
      };
    case 'exam_completion':
    default:
      return {
        labelAr: 'وثيقة اجتياز وإتمام اختبار رسمي',
        stampAr: 'اختبار موثق',
        outerBg: rgb(0.03, 0.05, 0.09),
        innerBg: rgb(0.07, 0.1, 0.16),
        plaqueBg: rgb(0.1, 0.14, 0.22),
        ribbonBg: rgb(0.08, 0.22, 0.34),
        ribbonText: rgb(0.9, 0.97, 1.0),
        primaryAccent: rgb(0.24, 0.74, 0.96),
        secondaryAccent: rgb(0.87, 0.72, 0.27),
        titleColor: rgb(0.4, 0.82, 0.98),
        studentColor: rgb(0.98, 0.99, 1.0),
        bodyColor: rgb(0.9, 0.94, 0.98),
        mutedColor: rgb(0.64, 0.72, 0.82),
        watermarkColor: rgb(0.24, 0.74, 0.96),
        isLightCanvas: false,
      };
  }
}

export async function generateArabicCertificatePdf(params: {
  certificate: CertificateRecord;
  student: StudentRecord;
  grade: GradeRecord;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fontArabicRegular = await doc.embedFont(notoRegularBytes);
  const fontArabicBold = await doc.embedFont(notoBoldBytes);
  const fontLatinRegular = await doc.embedFont(dejavuRegularBytes);
  const fontLatinBold = await doc.embedFont(dejavuBoldBytes);

  // A4 Landscape
  const width = 841.89;
  const height = 595.28;
  const page = doc.addPage([width, height]);
  const certType = params.certificate.cert_type || 'exam_completion';
  const theme = getCertificateTheme(certType);

  // 1. Base Canvas Layers
  page.drawRectangle({ x: 0, y: 0, width, height, color: theme.outerBg });
  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, color: theme.innerBg });

  // Subtle geometric center watermark medallion (low opacity so text stays ultra crisp)
  const wmOpacity = theme.isLightCanvas ? 0.08 : 0.06;
  page.drawCircle({
    x: width / 2,
    y: height / 2 - 12,
    size: 165,
    borderColor: theme.watermarkColor,
    borderWidth: 1.5,
    borderOpacity: wmOpacity,
  });
  page.drawCircle({
    x: width / 2,
    y: height / 2 - 12,
    size: 132,
    borderColor: theme.watermarkColor,
    borderWidth: 0.8,
    borderOpacity: wmOpacity,
  });

  // 2. Type-Specific Ornamental Frame & Corners
  page.drawRectangle({
    x: 26,
    y: 26,
    width: width - 52,
    height: height - 52,
    borderColor: theme.primaryAccent,
    borderWidth: certType === 'top_of_grade' ? 2.6 : 2.1,
  });
  page.drawRectangle({
    x: 35,
    y: 35,
    width: width - 70,
    height: height - 70,
    borderColor: theme.secondaryAccent,
    borderWidth: 0.9,
  });

  if (certType === 'top_of_grade') {
    // Imperial triple frame + golden side pillars & star corner medallions
    page.drawRectangle({
      x: 42,
      y: 42,
      width: width - 84,
      height: height - 84,
      borderColor: theme.primaryAccent,
      borderWidth: 0.6,
      borderOpacity: 0.6,
    });
    for (const sx of [52, width - 52]) {
      page.drawLine({
        start: { x: sx, y: 95 },
        end: { x: sx, y: height - 95 },
        thickness: 2,
        color: theme.secondaryAccent,
      });
    }
    const rosetteCorners: Array<[number, number]> = [
      [42, 42],
      [width - 42, 42],
      [42, height - 42],
      [width - 42, height - 42],
    ];
    for (const [rx, ry] of rosetteCorners) {
      page.drawCircle({
        x: rx,
        y: ry,
        size: 11,
        color: theme.innerBg,
        borderColor: theme.primaryAccent,
        borderWidth: 1.5,
      });
      page.drawSvgPath('M 0 -7 L 2 -2 L 7 0 L 2 2 L 0 7 L -2 2 L -7 0 L -2 -2 Z', {
        x: rx,
        y: ry,
        color: theme.primaryAccent,
      });
    }
  } else if (certType === 'excellence') {
    // Emerald architectural corner arches + diamond ornaments
    const cornerBoxes: Array<[number, number]> = [
      [26, 26],
      [width - 54, 26],
      [26, height - 54],
      [width - 54, height - 54],
    ];
    for (const [cx, cy] of cornerBoxes) {
      page.drawRectangle({
        x: cx,
        y: cy,
        width: 28,
        height: 28,
        borderColor: theme.secondaryAccent,
        borderWidth: 1.3,
        color: theme.outerBg,
      });
      page.drawCircle({
        x: cx + 14,
        y: cy + 14,
        size: 5,
        color: theme.primaryAccent,
      });
    }
  } else if (certType === 'achievement') {
    // Chamfered platinum rails on left and right + geometric corner diamonds
    for (const sx of [48, width - 48]) {
      for (let py = 120; py <= height - 120; py += 36) {
        page.drawSvgPath('M 0 -5 L 4 0 L 0 5 L -4 0 Z', {
          x: sx,
          y: py,
          color: theme.secondaryAccent,
        });
      }
    }
  } else if (certType === 'appreciation') {
    // Classical manuscript corner flourishes & double warm rule
    const corners: Array<[number, number]> = [
      [35, 35],
      [width - 63, 35],
      [35, height - 63],
      [width - 63, height - 63],
    ];
    for (const [cx, cy] of corners) {
      page.drawRectangle({
        x: cx,
        y: cy,
        width: 28,
        height: 28,
        borderColor: theme.primaryAccent,
        borderWidth: 1.4,
        color: theme.plaqueBg,
      });
      page.drawSvgPath('M 0 -6 L 5 0 L 0 6 L -5 0 Z', {
        x: cx + 14,
        y: cy + 14,
        color: theme.secondaryAccent,
      });
    }
  } else {
    // Technical L-brackets at corners for exam completion
    const tick = 22;
    const m = 44;
    const lines: Array<[[number, number], [number, number]]> = [
      [[m, m], [m + tick, m]],
      [[m, m], [m, m + tick]],
      [[width - m, m], [width - m - tick, m]],
      [[width - m, m], [width - m, m + tick]],
      [[m, height - m], [m + tick, height - m]],
      [[m, height - m], [m, height - m - tick]],
      [[width - m, height - m], [width - m - tick, height - m]],
      [[width - m, height - m], [width - m, height - m - tick]],
    ];
    for (const [start, end] of lines) {
      page.drawLine({
        start: { x: start[0], y: start[1] },
        end: { x: end[0], y: end[1] },
        thickness: 2,
        color: theme.primaryAccent,
      });
    }
  }

  // Helper for Arabic BiDi + DejaVu measurement & drawing
  const measureAndDrawLine = (
    rawText: string,
    align: 'center' | 'left' | 'right',
    anchorX: number,
    y: number,
    size: number,
    bold: boolean,
    color: ReturnType<typeof rgb>
  ) => {
    const chunks = buildVisualChunks(rawText);
    const arabicFont: PDFFont = bold ? fontArabicBold : fontArabicRegular;
    const latinFont: PDFFont = bold ? fontLatinBold : fontLatinRegular;

    const measured = chunks.map((chunk) => {
      const font = chunk.useArabicFont ? arabicFont : latinFont;
      const effectiveSize = chunk.useArabicFont ? size : size * 0.86;
      const chunkWidth = font.widthOfTextAtSize(chunk.text, effectiveSize);
      return { ...chunk, font, effectiveSize, chunkWidth };
    });

    const totalWidth = measured.reduce((sum, m) => sum + m.chunkWidth, 0);
    let cursorX = anchorX;
    if (align === 'center') {
      cursorX = anchorX - totalWidth / 2;
    } else if (align === 'right') {
      cursorX = anchorX - totalWidth;
    }

    for (const m of measured) {
      page.drawText(m.text, {
        x: cursorX,
        y,
        size: m.effectiveSize,
        font: m.font,
        color,
      });
      cursorX += m.chunkWidth;
    }
  };

  // 3. Top Type-Specific Crest Emblem
  const emblemX = width / 2;
  const emblemY = height - 74;
  page.drawCircle({
    x: emblemX,
    y: emblemY,
    size: 25,
    borderColor: theme.primaryAccent,
    borderWidth: 1.8,
    color: theme.isLightCanvas ? theme.ribbonBg : theme.outerBg,
  });
  page.drawCircle({
    x: emblemX,
    y: emblemY,
    size: 20,
    borderColor: theme.secondaryAccent,
    borderWidth: 0.8,
  });

  if (certType === 'top_of_grade') {
    // Royal Crown
    page.drawSvgPath('M -13 6 L -15 -6 L -6 1 L 0 -11 L 6 1 L 15 -6 L 13 6 Z', {
      x: emblemX,
      y: emblemY + 2,
      color: theme.primaryAccent,
    });
  } else if (certType === 'excellence') {
    // 8-point Star Crest
    page.drawSvgPath(
      'M 0 -13 L 3.5 -3.5 L 13 0 L 3.5 3.5 L 0 13 L -3.5 3.5 L -13 0 L -3.5 -3.5 Z',
      {
        x: emblemX,
        y: emblemY,
        color: theme.secondaryAccent,
      }
    );
  } else if (certType === 'achievement') {
    // Heraldic Shield
    page.drawSvgPath('M -11 -9 L 11 -9 L 11 1 C 11 8 0 13 0 13 C 0 13 -11 8 -11 1 Z', {
      x: emblemX,
      y: emblemY,
      color: theme.secondaryAccent,
    });
  } else if (certType === 'appreciation') {
    // Calligraphic Quill Nib
    page.drawSvgPath('M 0 -12 L 8 1 L 3 11 L -3 11 L -8 1 Z', {
      x: emblemX,
      y: emblemY,
      color: theme.ribbonText,
    });
  } else {
    // Hexagon + Checkmark
    page.drawSvgPath('M -9 1 L -3 7 L 10 -6 L 7 -9 L -3 1 L -6 -2 Z', {
      x: emblemX,
      y: emblemY,
      color: theme.primaryAccent,
    });
  }

  // 4. Platform Name + Ceremonial Type Ribbon
  measureAndDrawLine(
    'منصة أحمد الرمادي | ملك اللغة العربية',
    'center',
    width / 2,
    height - 118,
    14,
    true,
    theme.isLightCanvas ? theme.primaryAccent : theme.secondaryAccent
  );

  // Ceremonial Ribbon Banner
  const ribbonW = 390;
  const ribbonH = 26;
  const ribbonX = width / 2 - ribbonW / 2;
  const ribbonY = height - 154;
  page.drawRectangle({
    x: ribbonX,
    y: ribbonY,
    width: ribbonW,
    height: ribbonH,
    color: theme.ribbonBg,
    borderColor: theme.primaryAccent,
    borderWidth: 1,
  });
  measureAndDrawLine(theme.labelAr, 'center', width / 2, ribbonY + 7, 11.5, true, theme.ribbonText);

  // 5. Main Certificate Title
  measureAndDrawLine(
    params.certificate.title_ar,
    'center',
    width / 2,
    height - 198,
    29,
    true,
    theme.titleColor
  );

  // Ornamental Divider with center diamond
  page.drawLine({
    start: { x: width / 2 - 170, y: height - 212 },
    end: { x: width / 2 - 14, y: height - 212 },
    thickness: 1,
    color: theme.primaryAccent,
  });
  page.drawSvgPath('M 0 -5 L 6 0 L 0 5 L -6 0 Z', {
    x: width / 2,
    y: height - 212,
    color: theme.secondaryAccent,
  });
  page.drawLine({
    start: { x: width / 2 + 14, y: height - 212 },
    end: { x: width / 2 + 170, y: height - 212 },
    thickness: 1,
    color: theme.primaryAccent,
  });

  // 6. Student Name Honor Plaque
  measureAndDrawLine(
    'تشهد إدارة المنصة بكل فخر واعتزاز بأن الطالب / الطالبة',
    'center',
    width / 2,
    height - 242,
    13.5,
    false,
    theme.mutedColor
  );

  const plaqueW = 540;
  const plaqueH = 82;
  const plaqueX = width / 2 - plaqueW / 2;
  const plaqueY = height - 336;
  page.drawRectangle({
    x: plaqueX,
    y: plaqueY,
    width: plaqueW,
    height: plaqueH,
    color: theme.plaqueBg,
    borderColor: theme.primaryAccent,
    borderWidth: 1.2,
  });
  // Side accent bars on student plaque
  page.drawRectangle({
    x: plaqueX,
    y: plaqueY,
    width: 6,
    height: plaqueH,
    color: theme.secondaryAccent,
  });
  page.drawRectangle({
    x: plaqueX + plaqueW - 6,
    y: plaqueY,
    width: 6,
    height: plaqueH,
    color: theme.secondaryAccent,
  });

  measureAndDrawLine(
    params.student.full_name,
    'center',
    width / 2,
    height - 291,
    25,
    true,
    theme.studentColor
  );
  measureAndDrawLine(
    `المقيد بالصف الدراسي: ${params.grade.name_ar}`,
    'center',
    width / 2,
    height - 322,
    14,
    true,
    theme.isLightCanvas ? theme.primaryAccent : theme.secondaryAccent
  );

  // 7. Reason Section
  measureAndDrawLine(
    'قد استحق هذه الشهادة عن جدارة واستحقاق تقديرًا لـ:',
    'center',
    width / 2,
    height - 364,
    13,
    false,
    theme.mutedColor
  );

  const reasonLines = wrapArabicLines(params.certificate.reason_ar, 56);
  let reasonY = height - 394;
  for (const line of reasonLines.slice(0, 3)) {
    measureAndDrawLine(line, 'center', width / 2, reasonY, 15.5, true, theme.bodyColor);
    reasonY -= 24;
  }

  // 8. Footer Rule & Verification Stamp Seal
  page.drawLine({
    start: { x: 64, y: 128 },
    end: { x: width - 64, y: 128 },
    thickness: 0.7,
    color: theme.primaryAccent,
    opacity: 0.55,
  });

  const issueDateStr = new Date(params.certificate.issued_at).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Left: Serial Number
  measureAndDrawLine('الرقم التسلسلي للشهادة', 'left', 68, 98, 10.5, false, theme.mutedColor);
  measureAndDrawLine(
    params.certificate.serial_number,
    'left',
    68,
    77,
    11.5,
    true,
    theme.isLightCanvas ? theme.primaryAccent : theme.secondaryAccent
  );

  // Official Circular Seal Stamp (Left-Center beside signature)
  const sealX = width / 2 - 175;
  const sealY = 85;
  page.drawCircle({
    x: sealX,
    y: sealY,
    size: 31,
    color: theme.ribbonBg,
    borderColor: theme.primaryAccent,
    borderWidth: 1.6,
  });
  page.drawCircle({
    x: sealX,
    y: sealY,
    size: 26,
    borderColor: theme.secondaryAccent,
    borderWidth: 0.7,
  });
  measureAndDrawLine('ختم رسمي', 'center', sealX, sealY + 6, 8.5, false, theme.ribbonText);
  measureAndDrawLine(theme.stampAr, 'center', sealX, sealY - 9, 9.5, true, theme.ribbonText);

  // Center: Teacher Signature
  measureAndDrawLine('توقيع الأستاذ المشرف', 'center', width / 2 + 20, 102, 10.5, false, theme.mutedColor);
  measureAndDrawLine(
    'أحمد الرمادي — ملك اللغة العربية',
    'center',
    width / 2 + 20,
    78,
    14.5,
    true,
    theme.titleColor
  );
  page.drawLine({
    start: { x: width / 2 - 70, y: 68 },
    end: { x: width / 2 + 110, y: 68 },
    thickness: 0.9,
    color: theme.secondaryAccent,
  });

  // Right: Issue Date
  measureAndDrawLine('تاريخ الإصدار', 'right', width - 68, 98, 10.5, false, theme.mutedColor);
  measureAndDrawLine(
    issueDateStr,
    'right',
    width - 68,
    77,
    11.5,
    true,
    theme.isLightCanvas ? theme.primaryAccent : theme.secondaryAccent
  );

  return doc.save();
}
