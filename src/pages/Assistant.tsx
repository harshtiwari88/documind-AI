import { useEffect, useRef, useState } from "react";
import { post, postJson } from "../lib/api";
import { Doc, add, list } from "../lib/docs";
import { Icon } from "../editor/icons";
import HarshRobot from "../components/HarshRobot";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  sources?: { doc?: string; page?: number; snippet?: string }[];
  isError?: boolean;
}

const QUICK_CHIPS = [
  { id: "summary", label: "Summarize Document", prompt: "Please provide a comprehensive summary of this document with key bullet points and takeaways." },
  { id: "mcq", label: "Generate 5 MCQs", prompt: "Generate 5 high-yield Multiple Choice Questions (A, B, C, D) based on this document with answers and explanations." },
  { id: "notes", label: "Study Notes", prompt: "Create structured study revision notes covering key concepts, formulas, and definitions from this document." },
  { id: "flashcards", label: "Make Flashcards", prompt: "Generate interactive study flashcards in Q&A format based on the most important facts in this document." },
  { id: "viva", label: "Viva Questions", prompt: "Generate 6 tough viva / oral examination questions with model high-scoring answers from this content." },
  { id: "simplify", label: "Explain in Simple Words", prompt: "Explain the main ideas in this document in very simple, beginner-friendly terms with relatable analogies." },
  { id: "hinglish", label: "Explain in Hinglish", prompt: "Is document ka main concept aur summary aasan Hinglish (Hindi-English mix) me explain karo." },
  { id: "equations", label: "Formulas & Code", prompt: "Extract and explain all formulas, mathematical equations, or technical algorithms step-by-step." },
];

export default function Assistant() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("none");
  const [language, setLanguage] = useState<"auto" | "hinglish" | "english" | "hindi">("auto");
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem("harsh_ai_chat_history");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: "welcome",
        role: "assistant",
        text: "Namaste! I am **Harsh AI** – your intelligent document and study companion.\n\nYou can upload any PDF to ask questions, generate **5 MCQs**, **flashcards**, **study notes**, **summaries**, or **viva questions**.\n\nI also speak fluent **Hinglish**, **Hindi**, and **English**. How can I help you today?",
        timestamp: Date.now(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Persist chat history in localStorage
  useEffect(() => {
    try {
      localStorage.setItem("harsh_ai_chat_history", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Load user documents
  useEffect(() => {
    list().then((d) => {
      setDocs(d);
      if (d.length > 0 && selectedDocId === "none") {
        setSelectedDocId(d[0].id);
      }
    });
  }, []);

  const activeDoc = docs.find((d) => d.id === selectedDocId);

  async function handleDirectUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    try {
      const newDoc = await add(file);
      const updated = await list();
      setDocs(updated);
      setSelectedDocId(newDoc.id);

      // Add a system announcement message in chat
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `📄 Document **"${newDoc.name}"** (${Math.round(newDoc.size / 1024)} KB) has been loaded into my active workspace. What would you like to explore or generate from it?`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      alert(err?.message || "Failed to upload document.");
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage(customPrompt?: string, taskOverride?: string) {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || busy) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: textToSend,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setBusy(true);

    try {
      // Build history payload for Gemini multi-turn context
      const chatHistory = newHistory.slice(-6).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        text: m.text,
      }));

      let res: any;

      if (activeDoc && activeDoc.file) {
        // If an active document is selected, send multipart with file and message
        const fd = new FormData();
        fd.append("file", new File([activeDoc.file], activeDoc.name, { type: "application/pdf" }));
        fd.append("message", textToSend);
        fd.append("task", taskOverride || "chat");
        fd.append("language", language);
        fd.append("doc_name", activeDoc.name);

        res = await post("/ai/chat", fd);
      } else {
        // Freeform chat without document
        res = await postJson("/ai/chat", {
          message: textToSend,
          history: chatHistory,
          task: taskOverride || "chat",
          language,
        });
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: res.reply || "Done.",
        sources: res.sources,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `⚠️ **Error:** ${err?.message || "Unable to reach Harsh AI. Please check your internet connection and try again."}`,
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function clearHistory() {
    if (!confirm("Are you sure you want to clear your Harsh AI chat history?")) return;
    const initial: Message[] = [
      {
        id: "welcome",
        role: "assistant",
        text: "Chat cleared! How can Harsh AI assist you with your documents or studies today?",
        timestamp: Date.now(),
      },
    ];
    setMessages(initial);
    localStorage.removeItem("harsh_ai_chat_history");
  }

  function exportChat(format: "markdown" | "txt") {
    let content = `# Harsh AI Conversation Export\nGenerated: ${new Date().toLocaleString()}\nDocument: ${activeDoc?.name || "General Assistant"}\n\n`;
    messages.forEach((m) => {
      content += `### ${m.role === "user" ? "You" : "Harsh AI"} [${new Date(m.timestamp).toLocaleTimeString()}]\n\n${m.text}\n\n---\n\n`;
    });

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HarshAI-Conversation-${new Date().toISOString().slice(0, 10)}.${format === "markdown" ? "md" : "txt"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function retryLast() {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) {
      sendMessage(lastUserMessage.text);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0b132b] text-slate-100">
      {/* Top Header Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0d1838] px-4 py-3 shadow-md md:px-6">
        <div className="flex items-center gap-3">
          <HarshRobot size={38} mood={busy ? "thinking" : "happy"} showBadge />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold leading-none tracking-tight text-white">Harsh AI</h1>
              <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold text-[#00f5d4]">
                Companion
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Your Intelligent Document & AI Companion
            </p>
          </div>
        </div>

        {/* Right Controls: Document Selector & Language */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Document Selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs">
            <Icon n="pages" size={14} className="text-cyan-400" />
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 outline-none max-w-[140px] truncate cursor-pointer"
              title="Select active document for Harsh AI to analyze"
            >
              <option value="none" className="bg-[#0b132b] text-slate-300">
                💬 General Companion (No PDF)
              </option>
              {docs.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#0b132b] text-white">
                  📄 {d.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded p-1 text-cyan-400 hover:bg-slate-800 transition"
              title="Upload new PDF directly into chat"
              disabled={uploadBusy}
            >
              <Icon n="plus" size={13} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={handleDirectUpload}
            />
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs">
            <span className="text-slate-400">Lang:</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="bg-transparent text-xs text-cyan-300 outline-none cursor-pointer"
            >
              <option value="auto" className="bg-[#0b132b]">Auto</option>
              <option value="hinglish" className="bg-[#0b132b]">Hinglish</option>
              <option value="english" className="bg-[#0b132b]">English</option>
              <option value="hindi" className="bg-[#0b132b]">Hindi</option>
            </select>
          </div>

          {/* Export & Clear dropdown options */}
          <button
            onClick={() => exportChat("markdown")}
            className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition"
            title="Export conversation as Markdown"
          >
            <Icon n="down" size={13} />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={clearHistory}
            className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-xs text-rose-300 hover:bg-rose-950/30 transition"
            title="Clear chat history"
          >
            <Icon n="trash" size={13} />
          </button>
        </div>
      </header>

      {/* Main Chat Scroll Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={`flex gap-3 max-w-4xl mx-auto ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="mt-1">
                  <HarshRobot size={32} mood={m.isError ? "thinking" : "happy"} />
                </div>
              )}

              <div className={`group relative max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
                isUser
                  ? "bg-gradient-to-r from-blue-600 to-[#1e40af] text-white rounded-tr-none"
                  : m.isError
                  ? "bg-red-950/60 border border-red-800 text-red-200 rounded-tl-none"
                  : "bg-[#14213d] border border-slate-800 text-slate-100 rounded-tl-none"
              }`}>
                {/* Message Header for Assistant */}
                {!isUser && (
                  <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-1.5 mb-2 text-[11px] text-cyan-300 font-semibold">
                    <span>Harsh AI</span>
                    <span className="text-slate-500 font-normal">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}

                {/* Content with Markdown-style rendering */}
                <div className="whitespace-pre-wrap break-words font-sans space-y-2">
                  {formatMarkdownContent(m.text)}
                </div>

                {/* Grounding Source Citations */}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 border-t border-slate-700/60 pt-2 text-xs text-cyan-300">
                    <span className="font-semibold text-slate-400">Sources: </span>
                    {m.sources.map((s, idx) => (
                      <span key={idx} className="mr-2 inline-block rounded bg-cyan-950/60 px-2 py-0.5 border border-cyan-800/40 text-[11px]">
                        {s.doc || "Document"} {s.page ? `p.${s.page}` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions Toolbar */}
                <div className={`mt-2 flex items-center gap-2 pt-1 border-t ${isUser ? "border-white/10 text-blue-200" : "border-slate-800 text-slate-400"}`}>
                  <button
                    onClick={() => copyText(m.id, m.text)}
                    className="flex items-center gap-1 text-[11px] hover:text-white transition"
                    title="Copy to clipboard"
                  >
                    <Icon n={copiedId === m.id ? "check" : "copy"} size={12} className={copiedId === m.id ? "text-[#00f5d4]" : ""} />
                    <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                  </button>

                  {!isUser && m.isError && (
                    <button
                      onClick={retryLast}
                      className="flex items-center gap-1 text-[11px] text-amber-300 hover:underline"
                    >
                      <Icon n="reload" size={12} />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="flex gap-3 max-w-4xl mx-auto justify-start items-center">
            <HarshRobot size={32} mood="thinking" />
            <div className="rounded-2xl bg-[#14213d] border border-slate-800 px-4 py-3 text-xs text-cyan-300 flex items-center gap-2 shadow-md">
              <span className="h-2 w-2 rounded-full bg-[#00f5d4] animate-ping" />
              <span>Harsh AI is thinking & synthesizing answer…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Suggested Quick Prompt Chips */}
      <div className="border-t border-slate-800/80 bg-[#0d1838]/70 px-4 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] text-slate-400 shrink-0 font-medium">Quick Prompts:</span>
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => sendMessage(chip.prompt, chip.id)}
              disabled={busy}
              className="shrink-0 rounded-xl border border-slate-700/80 bg-[#162544] px-3 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-400 hover:bg-[#1e345e] hover:text-white transition disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Input Area */}
      <footer className="border-t border-slate-800 bg-[#0d1838] p-3 md:p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-2 rounded-2xl border border-slate-700 bg-[#0b132b] p-2 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20 transition">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeDoc
                  ? `Ask Harsh AI anything about "${activeDoc.name}" or speak in Hinglish/English…`
                  : "Ask Harsh AI anything (general assistant, summaries, notes, or equations)…"
              }
              className="flex-1 resize-none bg-transparent px-2 text-sm text-white placeholder:text-slate-500 outline-none max-h-32"
            />

            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={busy || !input.trim()}
                className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Send message (Enter)"
              >
                <Icon n="paperclip" size={16} />
              </button>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-slate-500">
            <span>
              {activeDoc ? `Active document: ${activeDoc.name}` : "Companion mode: active without document"}
            </span>
            <span>Press Enter to send, Shift+Enter for new line</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Clean text formatting for markdown lists, bold headers, and code sections
function formatMarkdownContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/, "");
      return (
        <pre
          key={index}
          className="my-2 rounded-xl bg-[#070d1e] p-3 text-xs font-mono text-cyan-200 overflow-x-auto border border-slate-800"
        >
          <code>{code}</code>
        </pre>
      );
    }

    // Bold formatting and bullet list enhancement
    return (
      <span key={index}>
        {part.split("\n").map((line, lIdx) => {
          if (line.startsWith("### ")) {
            return (
              <h4 key={lIdx} className="text-cyan-300 font-bold text-sm mt-2 mb-1">
                {line.slice(4)}
              </h4>
            );
          }
          if (line.startsWith("## ")) {
            return (
              <h3 key={lIdx} className="text-[#00f5d4] font-extrabold text-base mt-2 mb-1">
                {line.slice(3)}
              </h3>
            );
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <div key={lIdx} className="flex items-start gap-1.5 ml-2 my-0.5">
                <span className="text-cyan-400">•</span>
                <span>{renderInlineBold(line.slice(2))}</span>
              </div>
            );
          }
          return (
            <div key={lIdx} className={line.trim() === "" ? "h-1.5" : ""}>
              {renderInlineBold(line)}
            </div>
          );
        })}
      </span>
    );
  });
}

function renderInlineBold(text: string) {
  const chunks = text.split(/(\*\*.*?\*\*)/g);
  return chunks.map((chunk, i) => {
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return (
        <strong key={i} className="text-white font-semibold">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return chunk;
  });
}
