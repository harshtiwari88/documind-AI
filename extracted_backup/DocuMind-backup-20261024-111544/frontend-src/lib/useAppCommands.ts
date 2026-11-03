import { useNavigate } from "react-router-dom"; import { useAuth } from "./auth"; import { useT } from "./i18n"; import { list } from "./docs";
export const APP_OPS = new Set(["navigate", "open_tool", "run_tool", "open_document", "sign_out", "set_ui_language"]);
const ROUTES: Record<string, string> = { home: "/", editor: "/editor", voice: "/voice", assistant: "/assistant", compare: "/compare", tools: "/tools", documents: "/documents", settings: "/settings" };
// App-level voice commands. Browsers do not allow voice to open a file picker, so tools open pre-filled and wait for you to choose a file.
export function useAppCommands() {
  const nav = useNavigate(), { signOut } = useAuth(), { setLang } = useT();
  async function run(c: any): Promise<string> {
    switch (c.op) {
      case "navigate": nav(ROUTES[c.route] || "/"); return `Opened ${c.route}.`;
      case "open_tool": nav("/tools?" + new URLSearchParams({ tool: c.tool, ...(c.fields || {}) })); return "Tool opened. Choose your file, then say “run”.";
      case "run_tool": window.dispatchEvent(new Event("dm-run-tool")); return "Running the tool…";
      case "open_document": {
        const n = String(c.name || "").toLowerCase(), d = (await list()).find(x => x.name.toLowerCase().includes(n));
        if (!d) return `No saved document matches “${c.name}”.`; nav("/editor?doc=" + d.id); return `Opened ${d.name}.`;
      }
      case "sign_out": signOut(); return "Signed out.";
      case "set_ui_language": setLang(c.lang); return "Interface language changed.";
    }
    return "";
  }
  return { run, isApp: (op: string) => APP_OPS.has(op) };
}
