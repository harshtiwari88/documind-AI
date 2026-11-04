import type { FontKey, Line, Block } from "./types";

export interface FontMatchResult {
  rawFontName: string;
  detectedFamily: string;
  detectedCategory: "Sans-Serif" | "Serif" | "Monospace" | "Display";
  matchedStandardFont: FontKey;
  matchedStandardFontName: string;
  confidence: number; // 0 - 100%
  size: number;
  bold: boolean;
  italic: boolean;
  fgColor: string;
  bgColor: string;
  cssFamily: string;
  description: string;
}

export interface FontOption {
  key: FontKey;
  label: string;
  category: "Sans-Serif" | "Serif" | "Monospace";
  cssFamily: string;
  sampleText: string;
}

export const SUPPORTED_FONTS: FontOption[] = [
  {
    key: "helv",
    label: "Helvetica / Arial (Standard Sans)",
    category: "Sans-Serif",
    cssFamily: "Helvetica, Arial, -apple-system, BlinkMacSystemFont, sans-serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
  },
  {
    key: "times",
    label: "Times New Roman (Standard Serif)",
    category: "Serif",
    cssFamily: "'Times New Roman', Times, Georgia, serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
  },
  {
    key: "courier",
    label: "Courier New / Consolas (Monospace)",
    category: "Monospace",
    cssFamily: "'Courier New', Courier, Consolas, Monaco, monospace",
    sampleText: "The quick brown fox jumps over the lazy dog",
  },
];

/**
 * Clean and normalize PDF font names (e.g. "ABCDEF+Arial-BoldMT" -> "Arial", bold: true)
 */
export function parsePdfFontName(rawName: string = ""): {
  cleanName: string;
  family: string;
  isBold: boolean;
  isItalic: boolean;
} {
  // Strip PDF subset prefix (e.g. "EAAAAA+TimesNewRomanPSMT" -> "TimesNewRomanPSMT")
  const stripped = rawName.replace(/^[A-Z]{6}\+/, "").trim();
  const lower = stripped.toLowerCase();

  const isBold = /bold|black|heavy|semibold|demi|w7|w8|w9/i.test(lower);
  const isItalic = /italic|oblique|slanted/i.test(lower);

  // Extract base family
  let family = "Helvetica / Arial";
  if (/courier|mono|consolas|menlo|monaco|typewriter|inconsolata/i.test(lower)) {
    family = "Courier New (Monospace)";
  } else if (/times|georgia|garamond|minion|palatino|cambria|baskerville|serif/i.test(lower) && !/sans/i.test(lower)) {
    family = "Times New Roman (Serif)";
  } else if (/roboto/i.test(lower)) {
    family = "Roboto (Sans-Serif)";
  } else if (/calibri/i.test(lower)) {
    family = "Calibri (Sans-Serif)";
  } else if (/opensans|open-sans/i.test(lower)) {
    family = "Open Sans (Sans-Serif)";
  } else if (/arial/i.test(lower)) {
    family = "Arial (Sans-Serif)";
  } else if (/helvetica/i.test(lower)) {
    family = "Helvetica (Sans-Serif)";
  }

  return {
    cleanName: stripped,
    family,
    isBold,
    isItalic,
  };
}

/**
 * High-precision font matching engine:
 * Maps arbitrary embedded PDF fonts to the closest standard PDF-embedded font
 * for pixel-perfect seamless text replacement.
 */
export function matchFontAttributes(params: {
  rawName?: string;
  fam?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bgColor?: string;
}): FontMatchResult {
  const raw = params.rawName || params.fam || "Helvetica";
  const { cleanName, family, isBold: nameBold, isItalic: nameItalic } = parsePdfFontName(raw);

  const bold = Boolean(params.bold || nameBold);
  const italic = Boolean(params.italic || nameItalic);
  const size = Math.round((params.size || 12) * 10) / 10;
  const fgColor = params.color || "#111827";
  const bgColor = params.bgColor || "#ffffff";

  const lower = (raw + " " + (params.fam || "")).toLowerCase();

  let matchedStandardFont: FontKey = "helv";
  let detectedCategory: FontMatchResult["detectedCategory"] = "Sans-Serif";
  let confidence = 90;
  let description = "Matched to standard sans-serif font.";

  if (/courier|mono|consolas|menlo|monaco|typewriter/i.test(lower)) {
    matchedStandardFont = "courier";
    detectedCategory = "Monospace";
    confidence = /courier/i.test(lower) ? 99 : 94;
    description = `Detected monospace typeface (${cleanName}). Matched to Standard Courier.`;
  } else if (/times|georgia|garamond|minion|palatino|cambria|baskerville/i.test(lower) && !/sans/i.test(lower)) {
    matchedStandardFont = "times";
    detectedCategory = "Serif";
    confidence = /times/i.test(lower) ? 99 : 93;
    description = `Detected serif typeface (${cleanName}). Matched to Standard Times-Roman.`;
  } else {
    matchedStandardFont = "helv";
    detectedCategory = "Sans-Serif";
    confidence = /arial|helvet/i.test(lower) ? 99 : 95;
    description = `Detected sans-serif typeface (${cleanName}). Matched to Standard Helvetica.`;
  }

  const standardNames: Record<FontKey, { normal: string; bold: string; italic: string; boldItalic: string }> = {
    helv: { normal: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", boldItalic: "Helvetica-BoldOblique" },
    times: { normal: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic", boldItalic: "Times-BoldItalic" },
    courier: { normal: "Courier", bold: "Courier-Bold", italic: "Courier-Oblique", boldItalic: "Courier-BoldOblique" },
  };

  const styleSet = standardNames[matchedStandardFont] || standardNames.helv;
  const matchedStandardFontName = bold && italic
    ? styleSet.boldItalic
    : bold
    ? styleSet.bold
    : italic
    ? styleSet.italic
    : styleSet.normal;

  const cssFamily = matchedStandardFont === "times"
    ? "'Times New Roman', Times, Georgia, serif"
    : matchedStandardFont === "courier"
    ? "'Courier New', Courier, Consolas, monospace"
    : "Helvetica, Arial, sans-serif";

  return {
    rawFontName: cleanName || raw,
    detectedFamily: family,
    detectedCategory,
    matchedStandardFont,
    matchedStandardFontName,
    confidence,
    size,
    bold,
    italic,
    fgColor,
    bgColor,
    cssFamily,
    description,
  };
}

/**
 * Match font directly from an editor Line object and sampled colors
 */
export function matchLineFont(line: Line, sampledColors?: { fg: string; bg: string }): FontMatchResult {
  return matchFontAttributes({
    rawName: line.name || line.fam || String(line.font),
    fam: line.fam,
    size: line.s || line.size || 12,
    bold: line.bold,
    italic: line.italic,
    color: sampledColors?.fg || line.color || "#111827",
    bgColor: sampledColors?.bg || "#ffffff",
  });
}

/**
 * Match font from a Block object
 */
export function matchBlockFont(block: Block, sampledColors?: { fg: string; bg: string }): FontMatchResult {
  const firstLine = block.lines?.[0];
  return matchFontAttributes({
    rawName: firstLine?.name || firstLine?.fam || block.kind,
    fam: firstLine?.fam,
    size: block.size || firstLine?.s || 12,
    bold: block.lines ? block.lines.every(l => l.bold) : false,
    italic: block.lines ? block.lines.some(l => l.italic) : false,
    color: sampledColors?.fg || "#111827",
    bgColor: sampledColors?.bg || "#ffffff",
  });
}
