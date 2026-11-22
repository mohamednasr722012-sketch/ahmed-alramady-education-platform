declare module 'arabic-persian-reshaper' {
  const reshaper: {
    ArabicShaper: {
      convertArabic(text: string): string;
    };
  };
  export default reshaper;
}

declare module 'bidi-js' {
  export interface BidiInstance {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl' | 'auto'): {
      levels: Uint8Array;
      paragraphs: Array<{ start: number; end: number; level: number }>;
    };
    getReorderedString(
      text: string,
      embedLevels: {
        levels: Uint8Array;
        paragraphs: Array<{ start: number; end: number; level: number }>;
      }
    ): string;
  }
  export default function bidiFactory(): BidiInstance;
}
