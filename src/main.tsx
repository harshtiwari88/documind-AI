import React, { Component, ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { I18n } from "./lib/i18n";
import { safeStorage } from "./lib/safeStorage";
import "./index.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Harsh AI App caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center bg-[#0b132b] text-white p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#121c38] p-6 text-center space-y-4 shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-red-500/20 text-red-400 font-bold text-xl">
              !
            </div>
            <h2 className="text-xl font-bold">Harsh AI encountered an issue</h2>
            <p className="text-xs text-slate-300">
              {this.state.error?.message || "An unexpected error occurred while loading the application."}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
                onClick={() => {
                  try {
                    safeStorage.removeItem("dm_token");
                  } catch {}
                  window.location.href = "/";
                }}
              >
                Go to Sign In
              </button>
              <button
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                onClick={() => window.location.reload()}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <I18n>
          <AuthProvider>
            <App />
          </AuthProvider>
        </I18n>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
