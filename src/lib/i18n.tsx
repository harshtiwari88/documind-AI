import { createContext, useContext, useEffect, useState } from "react";
import { safeStorage } from "./safeStorage";

// Add a language = add one object here. Untranslated keys fall back to English. UI strings only; voice languages are separate.
const D: Record<string, Record<string, string>> = {
  en: { home: "Home", editor: "Editor", voice: "Voice Studio", assistant: "AI Assistant", compare: "Compare & Search", tools: "PDF Tools", documents: "My Documents", settings: "Settings", signOut: "Sign out", upload: "Upload PDF" },
  hi: { home: "होम", editor: "एडिटर", voice: "वॉइस स्टूडियो", assistant: "एआई सहायक", tools: "पीडीएफ टूल्स", documents: "मेरे दस्तावेज़", settings: "सेटिंग्स", signOut: "साइन आउट", upload: "पीडीएफ अपलोड करें" },
  es: { home: "Inicio", editor: "Editor", voice: "Estudio de voz", assistant: "Asistente IA", tools: "Herramientas", documents: "Mis documentos", settings: "Ajustes", signOut: "Salir", upload: "Subir PDF" },
  ar: { home: "الرئيسية", editor: "المحرر", voice: "استوديو الصوت", assistant: "المساعد الذكي", tools: "أدوات PDF", documents: "مستنداتي", settings: "الإعدادات", signOut: "خروج", upload: "رفع PDF" },
};
export const UI_LANGS = [["en", "English"], ["hi", "हिन्दी"], ["es", "Español"], ["ar", "العربية"]];
const Ctx = createContext<any>(null);
export const useT = () => useContext(Ctx);
export function I18n({ children }: any) {
  const [lang, setLang] = useState(() => safeStorage.getItem("ui_lang") || "en");
  useEffect(() => { 
    try {
      document.documentElement.lang = lang; 
      document.documentElement.dir = ["ar", "ur"].includes(lang) ? "rtl" : "ltr"; 
      safeStorage.setItem("ui_lang", lang);
    } catch {}
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t: (k: string) => D[lang]?.[k] ?? D.en[k] ?? k }}>{children}</Ctx.Provider>;
}
