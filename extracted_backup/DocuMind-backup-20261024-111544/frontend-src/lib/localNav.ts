// Offline navigation commands (English/Hindi/Hinglish): no AI call, no document text leaves the device.
const PAGES: [RegExp, string][] = [[/voice studio|वॉइस/i, "voice"], [/editor|एडिटर/i, "editor"], [/assistant|सहायक|ai chat/i, "assistant"], [/compare|तुलना/i, "compare"],
  [/tools|टूल/i, "tools"], [/document|दस्तावेज|my files/i, "documents"], [/setting|सेटिंग/i, "settings"], [/\bhome\b|होम/i, "home"]];
export function localParse(t: string): any | null {
  const s = t.toLowerCase().trim();
  if (/sign ?out|log ?out|साइन आउट|लॉग आउट|logout/.test(s)) return { op: "sign_out" };
  if (/^(run|start|go|chalao|चलाओ|चला दो)(\s+(it|tool|this))?$/.test(s)) return { op: "run_tool" };
  if (/\b(open|go to|goto|show|take me to|kholo|jao|dikhao)\b/.test(s) || /खोलो|खोल|जाओ|दिखाओ/.test(s)) for (const [r, k] of PAGES) if (r.test(s)) return { op: "navigate", route: k };
  return null;
}
