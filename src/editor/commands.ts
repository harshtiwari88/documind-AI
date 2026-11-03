import type { Align, FontKey, ShapeKind, Tool } from "./types";

// One command vocabulary shared by the offline parser below and the backend /ai/command endpoint (same op names).
export interface Cmd {
  op: string; page?: number; text?: string; target?: string; ordinal?: number; hint?: string; color?: string;
  bold?: boolean; italic?: boolean; underline?: boolean; size?: number; delta?: number; align?: Align; font?: FontKey;
  position?: string; shape?: ShapeKind; deg?: number; kind?: "heading" | "text"; to?: number; dir?: "up" | "down"; value?: number;
  crop?: number[]; tool?: Tool; question?: string; assumed?: string;
}
export interface ParseCtx { pageCount: number; cur: number; hasSelection: boolean }
export type Need = "text" | "color" | "target" | "page";
export type ParseResult = { cmd: Cmd } | { clarify: { question: string; partial: Cmd; need: Need } } | { none: true };

export const COLORS: Record<string, string> = {
  red: "#e03131", blue: "#1d4ed8", "light blue": "#4dabf7", "dark blue": "#1e3a8a", navy: "#1e3a8a", green: "#2f9e44", "dark green": "#1b5e20", black: "#000000", white: "#ffffff",
  orange: "#f76707", purple: "#7048e8", violet: "#7048e8", yellow: "#fcc419", pink: "#e64980", magenta: "#d6336c", gray: "#6b7280", grey: "#6b7280",
  brown: "#8d5a2b", teal: "#0c8599", cyan: "#1098ad", gold: "#e0a100", maroon: "#800000",
};
const colorRe = new RegExp("(?:#[0-9a-f]{6}\\b|\\b(?:" + Object.keys(COLORS).sort((a, b) => b.length - a.length).join("|") + ")\\b)", "i");
export function findColor(t: string): { hex: string; name: string } | null {
  const m = colorRe.exec(t); if (!m) return null; const n = m[0].toLowerCase();
  return { hex: n.startsWith("#") ? n : COLORS[n], name: n };
}

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10 };
const tokNum = (w: string): number | null => { w = w.toLowerCase(); const d = /^(\d+)(?:st|nd|rd|th)?$/.exec(w); return d ? +d[1] : NUM[w] ?? null; };
const ORD = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\\d+(?:st|nd|rd|th)";
const PAGE_WORD = "page|pg|पेज|पृष्ठ";

/** Finds a page reference ("page two", "the last page", "this page") and returns it with the phrase removed. */
export function pageRef(s: string, ctx: ParseCtx): { page?: number; rest: string; relative?: boolean } {
  const rules: [RegExp, (m: RegExpExecArray) => number | null, boolean?][] = [
    [/(?:\b(?:on|in|at|to|of|for|from)\s+)?(?:the\s+)?\b(?:last|final|aakhri|akhri|antim|आखिरी|अंतिम)\s+(?:page|पेज)\b/iu, () => ctx.pageCount],
    [new RegExp("(?:\\b(?:on|in|at|to|of|for|from)\\s+)?(?:the\\s+)?\\b(" + ORD + ")\\s+(?:" + PAGE_WORD + ")(?![\\p{L}\\p{N}])", "iu"), m => tokNum(m[1])],
    [/(?:\b(?:on|in|at|to|of|for|from)\s+)?(?:the\s+)?\b(?:this|current)\s+page\b/i, () => ctx.cur, true],
    [/(?:\b(?:to|on|go to)\s+)?(?:the\s+)?\bnext\s+page\b/i, () => Math.min(ctx.pageCount, ctx.cur + 1), true],
    [/(?:\b(?:to|on|go to)\s+)?(?:the\s+)?\b(?:previous|prior)\s+page\b/i, () => Math.max(1, ctx.cur - 1), true],
    [new RegExp("(?:\\b(?:on|in|at|to|of|for|from|after|before)\\s+)?(?:" + PAGE_WORD + ")\\s*(?:no\\.?|number|num|#|नंबर)?\\s*([\\p{L}\\p{M}\\p{N}]+)", "iu"), m => tokNum(m[1])],
    [new RegExp("([\\p{L}\\p{M}\\p{N}]+)\\s*(?:number\\s*|नंबर\\s*)?(?:पेज)", "iu"), m => tokNum(m[1])],
  ];
  for (const [re0, f, rel] of rules) {
    const re = new RegExp(re0.source, re0.flags.includes("g") ? re0.flags : re0.flags + "g"); let m: RegExpExecArray | null;
    while ((m = re.exec(s))) { const p = f(m); if (p != null) return { page: p, rest: (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(), relative: !!rel }; if (m[0].length === 0) re.lastIndex++; }
  }
  return { rest: s };
}

export interface TargetSpec { target: string; ordinal?: number; hint?: string }
const ORD_PARA = new RegExp("\\b(?:the\\s+)?(?:(" + ORD + "|last|final|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:paragraph|para)|(?:paragraph|para)\\s*(?:no\\.?|number|#)?\\s*(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|last))\\b", "i");
/** Understands "the title", "this paragraph", "paragraph 2", "the last paragraph", "the word total", quoted phrases. */
export function findTarget(t: string): TargetSpec | null {
  let m: RegExpExecArray | null;
  if ((m = /["“]([^"”]+)["”]/.exec(t))) return { target: m[1].trim() };
  if ((m = ORD_PARA.exec(t))) { const w = (m[1] || m[2]).toLowerCase(); return { target: "paragraph", ordinal: /last|final/.test(w) ? -1 : tokNum(w) ?? undefined }; }
  if ((m = /\b(?:this|that|the\s+selected|selected|current)\s+(paragraph|heading|title|text|line|element|item|shape|image|picture|signature|selection|block|word|comment|note|highlight)\b/i.exec(t))) return { target: "selection", hint: m[1].toLowerCase() };
  if (/\b(?:the\s+)?(?:main\s+heading|title|headline)\b/i.test(t)) return { target: "title" };
  if (/\b(?:the\s+)?(?:heading|subheading|header)\b/i.test(t)) return { target: "heading" };
  if (/\b(?:the\s+)?(?:paragraph|para|body\s*text|body)\b/i.test(t)) return { target: "paragraph" };
  if ((m = /\b(?:the\s+)?(?:words?|phrase|text|sentence|line)\s+(.+)$/i.exec(t))) return { target: m[1].replace(/^["“]|["”]$/g, "").trim() };
  if (/\b(?:it|this|that|selection|selected)$/i.test(t)) return { target: "selection" };
  return null;
}

const FILLER = /^(?:(?:hey|ok|okay|please|kindly|now|then|and|so|just|can you|could you|would you|will you|i want to|i want you to|i'd like to|i would like to|let's|lets|go ahead and)\b[ ,]*)+/i;
const MISSING = /^(?:(?:this|that|the|some|a|an|new|my|following|here|there)\s*)*(?:text|heading|title|paragraph|content|sentence|words?|line|something|it)?$/i;
const POS = /\b(?:(?:at|in|on|to|near)\s+)?(?:the\s+)?(top|bottom|middle|center|centre|end)(?:\s+of(?:\s+the)?\s+(?:page|document|sheet))?\b/i;
const positionOf = (s: string) => { const m = POS.exec(s); if (!m) return { pos: undefined as string | undefined, rest: s }; const p = m[1].toLowerCase();
  return { pos: p === "centre" ? "center" : p === "middle" ? "center" : p, rest: (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim() }; };

const FONTS: [RegExp, FontKey][] = [[/\b(?:times|serif|georgia)\b/i, "times"], [/\b(?:courier|mono(?:space)?|typewriter)\b/i, "courier"], [/\b(?:helvetica|arial|sans(?:[- ]serif)?)\b/i, "helv"]];

export const SUGGESTIONS = ["Add a heading at the top", "Change the title color to blue", "Highlight the first paragraph", "Add a new page", "Rotate page 1", "Undo the last change", "Download the updated PDF"];
export const HELP = "Try: “add a heading saying Annual Report at the top”, “change the title color to blue”, “highlight paragraph 2”, “underline the word total”, “insert text Hello on page 2”, “add a new page”, “rotate page 3”, “delete page 2”, “add a confidential watermark”, “add page numbers”, “draw a rectangle”, “add my signature”, “find budget”, “undo”, “download the PDF”.";

export function parseCommand(raw: string, ctx: ParseCtx): ParseResult {
  const original = raw.trim().replace(/\s+/g, " ");
  const body0 = original.replace(/[०-९]/g, d => "०१२३४५६७८९".indexOf(d).toString()).replace(FILLER, "").replace(/[.!?]+$/, "").trim();
  if (!body0) return { none: true };
  let t = body0.toLowerCase();
  const has = (r: RegExp) => r.test(t);

  if (/^(?:yes|yeah|yep|confirm|confirmed|do it|go ahead|proceed|sure|correct|that's right)$/.test(t)) return { cmd: { op: "confirm" } };
  if (/^(?:no|nope|cancel|stop|never ?mind|don't|do not|abort|leave it)$/.test(t)) return { cmd: { op: "cancel" } };
  if (has(/\b(?:what can you do|help|commands|what can i say)\b/)) return { cmd: { op: "help" } };
  if (has(/\bundo\b|\brevert\b|take (?:that|it) back|पूर्ववत|पीछे|wapas|वापस|pichhle/u)) return { cmd: { op: "undo" } };
  if (has(/\bredo\b|dobara|दोबारा/u)) return { cmd: { op: "redo" } };
  if (has(/\b(?:download|export)\b|डाउनलोड/u) || (has(/\bsave\b|सेव/u) && !has(/signature/))) return { cmd: { op: "download" } };
  let m: RegExpExecArray | null;
  if ((m = /\bzoom\s*(?:to|at)?\s*(\d{2,3})\s*(?:%|percent)?/.exec(t))) return { cmd: { op: "zoom_to", value: +m[1] } };
  if (has(/zoom in|\bbada\b|बड़ा|badha|make the page bigger/u)) return { cmd: { op: "zoom_in" } };
  if (has(/zoom out|chhota|छोटा|ghata|make the page smaller/u)) return { cmd: { op: "zoom_out" } };
  if (has(/\b(?:fit|zoom)\b.*\b(?:width|screen|window|page)\b|\bfit to\b/)) return { cmd: { op: "zoom_fit" } };

  /* page numbers / watermark / header / footer / background are document-wide */
  if (has(/\bpage numbers?\b|\bnumber (?:the )?pages\b|page number daalo/)) return { cmd: { op: "page_numbers", text: has(/\b(?:remove|delete|hide|clear|no|off|disable)\b/) ? "" : undefined } };
  if (has(/watermark/)) {
    if (has(/\b(?:remove|delete|clear|hide)\b/)) return { cmd: { op: "watermark", text: "" } };
    const q = /["“]([^"”]+)["”]/.exec(body0) || /(?:add|put|apply|insert|place|make)\s+(?:a\s+|an\s+|the\s+)?(.+?)\s+watermark/i.exec(body0) || /watermark\s+(?:saying|says|with|text|as|that says|reading)?\s*(.+)$/i.exec(body0);
    const txt = q?.[1]?.replace(/^(?:a|an|the|this|that|some)$/i, "").trim();
    if (txt) return { cmd: { op: "watermark", text: txt.toUpperCase().slice(0, 60) } };
    return { clarify: { question: "What should the watermark say? For example: Confidential, Draft, Copy.", partial: { op: "watermark" }, need: "text" } };
  }
  if ((m = /\b(header|footer)\b/.exec(t)) && has(/\b(?:add|set|put|insert|write|make|change)\b/) && !has(/\bheader\b.*\b(?:heading|title)\b/)) {
    const op = m[1] === "header" ? "set_header" : "set_footer";
    const q = /["“]([^"”]+)["”]/.exec(body0) || /\b(?:saying|says|reading|with|as|called|text)\s+(.+)$/i.exec(body0) || new RegExp("\\b" + m[1] + "\\s+(?!that|which)(.+)$", "i").exec(body0);
    const txt = q?.[1]?.trim();
    if (has(/\b(?:remove|delete|clear)\b/)) return { cmd: { op, text: "" } };
    if (txt && !MISSING.test(txt)) return { cmd: { op, text: txt.slice(0, 120) } };
    return { clarify: { question: `What should the ${m[1]} say on every page?`, partial: { op }, need: "text" } };
  }
  if (has(/\b(?:page )?background\b/) && has(/\b(?:colou?r|make|set|change|turn|paint)\b/)) {
    const c = findColor(t); if (c) return { cmd: { op: "set_background", color: c.hex } };
    if (has(/\b(?:remove|clear|none|white)\b/)) return { cmd: { op: "set_background", color: "" } };
    return { clarify: { question: "Which background colour? For example: light yellow isn't available, try yellow, gray or white.", partial: { op: "set_background" }, need: "color" } };
  }

  /* page-level operations */
  const pr = pageRef(body0, ctx);
  const tt = pr.rest.toLowerCase();
  if (/^(?:add|insert|create|append|make|new)\b(?!.*\b(?:text|heading|title|paragraph|note|comment|numbers?|header|footer|caption|label|sentence|line|image|picture|signature|shape|rectangle|circle|arrow)\b).*\b(?:page|पेज)\b/iu.test(body0) || /^(?:new|blank|empty)\s+page$/.test(t) || /blank|खाली|khali|naya page|नया पेज/u.test(t) && /(?:page|पेज)/u.test(t))
    return { cmd: { op: "add_blank", page: /\b(?:after|below|following)\b/.test(t) ? pr.page : undefined } };
  if ((has(/\b(?:rotate|ghuma)\b|घुमा|रोटेट/u) || (has(/\b(?:turn|flip)\b/) && has(/\bpage\b/))) && !has(/\b(?:image|picture|photo|signature|shape|text|heading|title|paragraph)\b/)) {
    const deg = has(/\b(?:left|counter|anti|-?\s*90\s*(?:degrees?)?\s*(?:left|ccw))/) ? -90 : has(/\b180\b|upside|half turn/) ? 180 : 90;
    return { cmd: { op: "rotate_page", page: pr.page, deg, assumed: pr.page ? undefined : "current page" } };
  }
  if (has(/\b(?:delete|remove|drop|discard|get rid of)\b|हटा|\bhata|mita|मिटा|डिलीट/u) && /(?:\bpage\b|पेज)/u.test(t)) return { cmd: { op: "delete_page", page: pr.page, assumed: pr.page ? undefined : "current page" } };
  if (has(/\b(?:duplicate|copy|clone)\b|कॉपी|nakal|नकल/u) && /(?:\bpage\b|पेज)/u.test(t)) return { cmd: { op: "duplicate_page", page: pr.page, assumed: pr.page ? undefined : "current page" } };
  if (has(/\bextract\b|\bsave\b.*\bonly\b/) && /\bpage\b/.test(t)) return { cmd: { op: "extract_page", page: pr.page, assumed: pr.page ? undefined : "current page" } };
  if (has(/\bmove\b|\bshift\b/) && /\bpage\b/.test(t)) {
    const up = has(/\bup\b|\bearlier\b|\bforward\b|\bleft\b/), down = has(/\bdown\b|\blater\b|\bback\b|\bright\b/);
    const to = /\b(?:to|at)\s+(?:the\s+)?(?:position\s+)?(top|front|start|beginning|bottom|end|last|\w+)\b(?!\s+page)/.exec(tt);
    let dest: number | undefined; if (to) dest = /top|front|start|beginning/.test(to[1]) ? 1 : /bottom|end|last/.test(to[1]) ? ctx.pageCount : tokNum(to[1]) ?? undefined;
    const aft = /\bafter\s+(?:page\s+)?(\w+)/.exec(tt); if (aft && tokNum(aft[1])) dest = (tokNum(aft[1]) as number) + 1;
    if (dest || up || down) return { cmd: { op: "move_page", page: pr.page ?? ctx.cur, to: dest, dir: up ? "up" : down ? "down" : undefined } };
  }
  if (has(/\b(?:go to|goto|open|show|jump to|take me to|scroll to|jao|dikhao)\b|जाओ|दिखाओ/u) && pr.page) return { cmd: { op: "goto", page: pr.page } };
  if (/^(?:next|previous|prior)\s+page$/.test(t) || /^(?:first|last)\s+page$/.test(t) || /^(?:page|go to page)\s+\w+$/.test(t)) if (pr.page) return { cmd: { op: "goto", page: pr.page } };

  /* tools that need manual input */
  if (has(/\bsignature\b|\bsign (?:the |this )?(?:document|pdf|here|page)\b/) && has(/\b(?:add|insert|place|put|sign|my|use|create|draw)\b/)) return { cmd: { op: "add_signature", page: pr.page } };
  if (has(/\b(?:add|insert|place|put|upload)\b.*\b(?:image|picture|photo|logo)\b/)) return { cmd: { op: "add_image" } };
  if (has(/\bcrop\b/) && has(/\b(?:image|picture|photo)\b/)) {
    const side = /\bleft\b/.test(t) ? 0 : /\btop\b/.test(t) ? 1 : /\bright\b/.test(t) ? 2 : /\bbottom\b/.test(t) ? 3 : -1, pc = /(\d+)\s*(?:%|percent)/.exec(t)?.[1];
    if (side >= 0 && pc) { const c = [0, 0, 0, 0]; c[side] = +pc; return { cmd: { op: "crop_image", crop: c } }; }
    return { clarify: { question: "Which side and how much? For example: “crop 10 percent from the left”.", partial: { op: "crop_image" }, need: "text" } };
  }
  if ((m = /\b(?:use|select|switch to|activate|pick|choose|start|open)\s+(?:the\s+)?(highlighter|pen|pencil|draw(?:ing)?|text|select(?:ion)?|eraser|underline|strike(?:through)?|note|comment|shape)(?:\s+tool)?$/.exec(t))) {
    const k = m[1]; const tool: Tool = /highlight/.test(k) ? "hl" : /pen|pencil|draw/.test(k) ? "draw" : /^text/.test(k) ? "text" : /select/.test(k) ? "select" : /eraser/.test(k) ? "erase" : /underline/.test(k) ? "ul" : /strike/.test(k) ? "st" : /shape/.test(k) ? "shape" : "note";
    return { cmd: { op: "set_tool", tool } };
  }

  /* shapes */
  if ((m = /\b(rectangle|box|square|circle|ellipse|oval|line|arrow)\b/.exec(t)) && has(/\b(?:draw|add|insert|put|place|make|create)\b/) && !has(/\b(?:text|heading|title|paragraph)\b/)) {
    const k = m[1], shape: ShapeKind = /circle|ellipse|oval/.test(k) ? "ell" : k === "line" ? "line" : k === "arrow" ? "arrow" : "rect";
    return { cmd: { op: "add_shape", shape, color: findColor(t)?.hex, page: pr.page } };
  }
  if (/^(?:draw|sketch|doodle)$/.test(t)) return { cmd: { op: "set_tool", tool: "draw" } };

  /* search */
  if ((m = /^(?:find|search(?: for)?|look for|locate|dhundo|खोजो|ढूंढो)\s+(.+)$/i.exec(body0))) return { cmd: { op: "search", text: m[1].replace(/^["“]|["”]$/g, "").trim() } };

  /* markup: highlight / underline / strike */
  if ((m = /\b(highlight|underline|strike ?through|strike out|strike|cross out)\b/.exec(t)) && !has(/\bremove\b|\bdelete\b|\bclear\b/)) {
    const op = m[1] === "highlight" ? "highlight" : m[1] === "underline" ? "underline" : "strikethrough";
    const noCol = pr.rest.replace(new RegExp("\\s+\\b(?:in|with|using|as)\\s+(?:the\\s+)?(?:colou?r\\s+)?" + colorRe.source, "i"), "");
    const tg = findTarget(noCol) || (has(/\b(?:it|this|that)\b|^(?:highlight|underline|strike\w*)$/) ? { target: "selection" } : null);
    const col = findColor(t.replace(/\bhighlight\b/, ""));
    if (tg) return { cmd: { op, target: tg.target, ordinal: tg.ordinal, hint: tg.hint, page: pr.page, color: col?.hex } };
    const phrase = noCol.replace(/^(?:highlight|underline|strike ?through|strike out|strike|cross out)\s+(?:the\s+)?/i, "").trim();
    if (phrase && !MISSING.test(phrase)) return { cmd: { op, target: phrase, page: pr.page, color: col?.hex } };
    return { clarify: { question: `What should I ${m[1]}? Click a paragraph on the page, or say “the title”, “paragraph 2” or the exact words.`, partial: { op, page: pr.page }, need: "target" } };
  }

  /* delete an element */
  if (has(/^(?:delete|remove|erase|clear|get rid of)\b/) && !has(/\bpage\b/)) {
    const tg = findTarget(pr.rest) || (has(/\b(?:it|this|that)\b/) ? { target: "selection" } : null);
    if (tg) return { cmd: { op: "delete_target", target: tg.target, ordinal: tg.ordinal, hint: tg.hint, page: pr.page } };
    return { clarify: { question: "What should I delete? Select an item on the page, or say “the title”, “paragraph 2” or the exact words.", partial: { op: "delete_target", page: pr.page }, need: "target" } };
  }

  /* replace text */
  if ((m = /\breplace\s+(?:the\s+)?(?:words?\s+|text\s+|phrase\s+)?["“]?(.+?)["”]?\s+with\s+["“]?(.+?)["”]?$/i.exec(pr.rest))) { const tg = findTarget(m[1]); return { cmd: { op: "replace_text", target: tg ? tg.target : m[1].trim(), ordinal: tg?.ordinal, text: m[2].trim(), page: pr.page } }; }
  if (!has(/\bcolou?r\b/) && (m = /^(?:change|set|rename|edit|update|make)\s+(?:the\s+)?(.+?)\s+(?:text\s+)?(?:to|into|say|read)\s+["“]?(.+?)["”]?$/i.exec(pr.rest))) {
    const tg = findTarget(m[1]); const val = m[2].trim();
    const isStyle = !!findColor(val.toLowerCase()) && val.split(" ").length <= 2 || /^(?:bold|italic|bigger|larger|smaller|centered?|left|right|times|courier|helvetica|arial)$/i.test(val);
    if (tg && !isStyle) return { cmd: { op: "replace_text", target: tg.target, ordinal: tg.ordinal, text: val, page: pr.page } };
  }

  /* add text / heading / note */
  const addVerb = /^(?:add|insert|write|put|type|create|place|enter|append)\b/.test(t) || /(?:likho|likh do|लिखो|लिख दो)$/u.test(t);
  if (addVerb) {
    const hi = /^(.+?)\s*(?:likho|likh do|लिखो|लिख दो)$/iu.exec(body0);
    const obj = /\b(heading|title|headline|subtitle|text|paragraph|sentence|line|caption|label|note|comment|word|words)\b/.exec(t);
    const kindWord = obj?.[1] || "";
    const isNote = /^(?:note|comment)$/.test(kindWord), isHead = /^(?:heading|title|headline|subtitle)$/.test(kindWord);
    const q = /["“]([^"”]+)["”]/.exec(body0);
    let text = hi ? hi[1].trim() : q ? q[1].trim() : "";
    let pos = positionOf(pr.rest).pos;
    if (!text) {
      let cleaned = positionOf(pr.rest).rest;
      const kw = /\b(?:saying|says|that says|which says|reading|that reads|called|titled|named|with the text|with text|text|containing|:)\s*[:\-]?\s*(.+)$/i.exec(cleaned);
      if (kw) text = kw[1].trim();
      else if (obj) { const after = cleaned.slice(cleaned.toLowerCase().indexOf(obj[0]) + obj[0].length).replace(/^\s*(?:to|of|for|on|in|at|saying|:)\s+/i, "").trim(); text = after; }
      else { text = cleaned.replace(/^(?:add|insert|write|put|type|create|place|enter|append)\s+(?:a\s+|the\s+|this\s+)?/i, "").trim(); }
      text = positionOf(text).rest.replace(/^(?:a|an|the|this|that|some|new)\s+(?=\S)/i, (x) => (MISSING.test(text) ? x : "")).trim();
      if (MISSING.test(text) || /^(?:on|in|at|to)$/i.test(text)) text = "";
    }
    if (isNote) { if (text) return { cmd: { op: "add_comment", text, page: pr.page } }; return { clarify: { question: "What should the comment say?", partial: { op: "add_comment", page: pr.page }, need: "text" } }; }
    if (obj || hi || text) {
      const base: Cmd = { op: "add_text", kind: isHead ? "heading" : "text", position: pos ?? (isHead ? "top" : undefined), page: pr.page, size: kindWord === "subtitle" ? 18 : undefined };
      if (text) return { cmd: { ...base, text: text.slice(0, 500) } };
      return { clarify: { question: isHead ? `What should the heading say${pos ? " at the " + pos : ""}?` : `What text should I insert${pr.page ? " on page " + pr.page : ""}?`, partial: base, need: "text" } };
    }
  }

  /* styling of an element: colour, bold, italic, size, alignment, font */
  const col = findColor(t.replace(/\b(?:highlight)\b/, ""));
  const colorWords = has(/\bcolou?r\b|\bpaint\b|\bturn\b/) || (col && has(/\b(?:make|change|set|turn)\b/));
  const boldOff = has(/\b(?:un-?bold|remove (?:the )?bold|not bold|no bold)\b/), boldOn = !boldOff && has(/\bbold\b|बोल्ड/u);
  const italicOff = has(/\b(?:un-?italic|remove (?:the )?italic|not italic)\b/), italicOn = !italicOff && has(/\bitalics?\b/);
  const sizeAbs = /\b(?:font\s*)?size\s*(?:to|of|=|at)?\s*(\d{1,3})\b|\b(\d{1,3})\s*(?:pt|points?)\b/.exec(t);
  const by = /\bby\s+(\d{1,2})\b/.exec(t);
  const grow = has(/\b(?:bigger|larger|increase|enlarge|grow|raise)\b/), shrink = has(/\b(?:smaller|decrease|reduce|shrink|lower)\b/);
  const al = /\b(?:align\w*\s+(?:it\s+|the\s+\w+\s+)?(?:to\s+(?:the\s+)?)?(left|right|center|centre)|(center|centre|left|right)[- ]align\w*|(center|centre)\s+(?:it|the\s+\w+|this))\b/.exec(t);
  const fnt = has(/\b(?:font|typeface|use|switch to)\b/) ? FONTS.find(([r]) => r.test(t)) : undefined;
  const styled = !!(colorWords && col) || boldOn || boldOff || italicOn || italicOff || sizeAbs || ((grow || shrink) && has(/\b(?:font|size|text|it|heading|title|paragraph)\b/)) || al || fnt;
  if (styled || (colorWords && !col)) {
    const found = findTarget(pr.rest), STYLE_WORD = /^(?:bigger|larger|smaller|bolder|bold|italic|centered?|left|right)$/i;   // "make the text bigger" must not search for a phrase called "bigger"
    const tg = (found && !STYLE_WORD.test(found.target)) ? found : { target: "selection" as const, hint: undefined as string | undefined, ordinal: undefined as number | undefined };
    if (colorWords && !col && !boldOn && !boldOff && !italicOn && !italicOff && !sizeAbs && !al && !fnt)
      return { clarify: { question: "Which colour? For example: red, blue, green, black, orange, purple.", partial: { op: "set_style", target: tg.target, ordinal: tg.ordinal, hint: tg.hint, page: pr.page }, need: "color" } };
    const c: Cmd = { op: "set_style", target: tg.target, ordinal: tg.ordinal, hint: tg.hint, page: pr.page };
    if (col && (colorWords || has(/\bmake\b|\bchange\b|\bset\b/))) c.color = col.hex;
    if (boldOn) c.bold = true; if (boldOff) c.bold = false; if (italicOn) c.italic = true; if (italicOff) c.italic = false;
    if (sizeAbs) c.size = +(sizeAbs[1] || sizeAbs[2]); else if (grow) c.delta = by ? +by[1] : 2; else if (shrink) c.delta = by ? -by[1] : -2;
    if (al) c.align = ((al[1] || al[2] || al[3]).replace("centre", "center")) as Align;
    if (fnt) c.font = fnt[1];
    return { cmd: c };
  }

  /* legacy bare navigation ("page 3") and unknown */
  if (pr.page && /^(?:page|पेज)\s*\S+$/iu.test(t)) return { cmd: { op: "goto", page: pr.page } };
  return { none: true };
}

/** Applies the user's answer to a pending clarification question. Returns the completed command or a new question. */
export function fillClarification(c: { partial: Cmd; need: Need }, answer: string, ctx: ParseCtx): ParseResult {
  const a = answer.trim().replace(/[.!?]+$/, ""), p = { ...c.partial };
  if (c.need === "text") {
    const q = /["“]([^"”]+)["”]/.exec(a); p.text = (q ? q[1] : a).replace(/^(?:it should say|say|saying|it says|the text is|text is)\s+/i, "").trim();
    if (p.op === "crop_image") { const r = parseCommand("crop " + a + " image", ctx); if ("cmd" in r) return r; return { clarify: { question: "Which side and how much? For example: “10 percent from the left”.", partial: p, need: "text" } }; }
    if (p.op === "watermark") p.text = p.text.toUpperCase();
    return p.text ? { cmd: p } : { clarify: { question: "I didn't catch the text. Please say it again.", partial: c.partial, need: "text" } };
  }
  if (c.need === "color") { const col = findColor(a); if (col) return { cmd: { ...p, color: col.hex } };
    return { clarify: { question: "I didn't recognise that colour. Try red, blue, green, black, orange, purple, gray or a hex code like #ff8800.", partial: c.partial, need: "color" } }; }
  if (c.need === "target") { const tg = findTarget(a) || (a && !MISSING.test(a) && a.length < 80 ? { target: a.replace(/^(?:the\s+)?(?:words?|phrase|text)\s+/i, "") } : null);
    if (tg) return { cmd: { ...p, target: tg.target, ordinal: tg.ordinal, hint: tg.hint } };
    return { clarify: { question: "I couldn't tell which element you mean. Say “the title”, “paragraph 2”, or the exact words.", partial: c.partial, need: "target" } }; }
  if (c.need === "page") { const n = tokNum(a.replace(/^(?:page\s+)/i, "")); if (n) return { cmd: { ...p, page: n } }; return { clarify: { question: "Which page number?", partial: c.partial, need: "page" } }; }
  return { none: true };
}

export function describe(c: Cmd, ctx: ParseCtx): string {
  const pg = (n = c.page) => `page ${n ?? ctx.cur}`, tgt = () => c.target === "selection" ? "the selected item" : c.target === "paragraph" ? (c.ordinal ? (c.ordinal === -1 ? "the last paragraph" : `paragraph ${c.ordinal}`) : "the paragraph") : c.target === "title" || c.target === "heading" ? `the ${c.target}` : `“${c.target}”`;
  const hex = c.color ? Object.entries(COLORS).find(([, v]) => v === c.color)?.[0] || c.color : "";
  switch (c.op) {
    case "add_text": return `Add ${c.kind === "heading" ? "a heading" : "text"} “${c.text}”${c.position ? " at the " + c.position : ""} on ${pg()}`;
    case "set_style": { const bits = [c.color && `colour ${hex}`, c.bold !== undefined && (c.bold ? "bold" : "not bold"), c.italic !== undefined && (c.italic ? "italic" : "not italic"), c.size && `size ${c.size}`, c.delta && `size ${c.delta > 0 ? "+" : ""}${c.delta}`, c.align && `${c.align} aligned`, c.font && `font ${c.font}`].filter(Boolean); return `Set ${tgt()} to ${bits.join(", ") || "the new style"}`; }
    case "highlight": return `Highlight ${tgt()}${c.page ? " on " + pg() : ""}`;
    case "underline": return `Underline ${tgt()}${c.page ? " on " + pg() : ""}`;
    case "strikethrough": return `Strike through ${tgt()}${c.page ? " on " + pg() : ""}`;
    case "replace_text": return `Replace ${tgt()} with “${c.text}”`;
    case "delete_target": return `Delete ${tgt()}`;
    case "rotate_page": return `Rotate ${pg()} ${c.deg === 180 ? "180°" : c.deg === -90 ? "90° counter-clockwise" : "90° clockwise"}${c.assumed ? ` (${c.assumed})` : ""}`;
    case "delete_page": return `Delete ${pg()}${c.assumed ? ` (${c.assumed})` : ""} — you can undo`;
    case "duplicate_page": return `Duplicate ${pg()}`;
    case "extract_page": return `Download only ${pg()}`;
    case "move_page": return `Move ${pg()} ${c.to ? "to position " + c.to : c.dir}`;
    case "add_blank": return `Add a blank page after ${pg(c.page ?? ctx.cur)}`;
    case "goto": return `Go to ${pg()}`;
    case "undo": return "Undo the last change"; case "redo": return "Redo";
    case "download": return "Download the updated PDF";
    case "zoom_in": return "Zoom in"; case "zoom_out": return "Zoom out"; case "zoom_fit": return "Fit page to width"; case "zoom_to": return `Zoom to ${c.value}%`;
    case "watermark": return c.text ? `Add the watermark “${c.text}” to every page` : "Remove the watermark";
    case "page_numbers": return c.text === "" ? "Remove page numbers" : "Add page numbers to every page";
    case "set_header": return c.text ? `Set header “${c.text}”` : "Remove header"; case "set_footer": return c.text ? `Set footer “${c.text}”` : "Remove footer";
    case "set_background": return c.color ? `Set page background ${hex}` : "Remove page background";
    case "add_shape": return `Draw ${({ rect: "a rectangle", ell: "an ellipse", line: "a line", arrow: "an arrow" } as any)[c.shape || "rect"]} on ${pg()}`;
    case "add_comment": return `Add the comment “${c.text}” on ${pg()}`;
    case "add_signature": return "Add a signature"; case "add_image": return "Add an image";
    case "crop_image": return "Crop the selected image"; case "search": return `Search for “${c.text}”`;
    case "set_tool": return `Switch to the ${c.tool} tool`; case "show_history": return "Show edit history";
    case "set_font": return `Set font ${c.font || ""}`;
    default: return c.op.replace(/_/g, " ");
  }
}
