import React, { useState } from "react";
import { usePWAInstall } from "../lib/usePWAInstall";
import { Icon } from "../editor/icons";

interface Props {
  variant?: "button" | "banner" | "compact";
  className?: string;
}

export const PWAInstallButton: React.FC<Props> = ({ variant = "button", className = "" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already installed as standalone PWA, hide install prompt
  if (isInstalled) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  if (variant === "compact") {
    if (isInstallable) {
      return (
        <button
          onClick={handleInstall}
          disabled={installing}
          className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-blue-500 hover:to-cyan-400 transition ${className}`}
          title="Install Harsh AI on your device"
        >
          <Icon n="down" size={14} />
          <span>{installing ? "Installing…" : "Install App"}</span>
        </button>
      );
    }
    if (isIOS) {
      return (
        <>
          <button
            onClick={() => setShowIOSGuide(true)}
            className={`flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-950/40 transition ${className}`}
            title="Install Harsh AI on iPhone / iPad"
          >
            <Icon n="down" size={14} />
            <span>Install on iOS</span>
          </button>
          {showIOSGuide && (
            <IOSGuideModal onClose={() => setShowIOSGuide(false)} />
          )}
        </>
      );
    }
    return null;
  }

  if (variant === "banner") {
    if (!isInstallable && !isIOS) return null;
    return (
      <div className={`relative flex items-center justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#0b132b] via-[#1c2541] to-[#0b132b] p-4 shadow-lg text-white ${className}`}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/20 text-[#00f5d4]">
            <Icon n="bolt" size={20} />
          </div>
          <div>
            <div className="font-semibold text-sm text-white">Install Harsh AI App</div>
            <div className="text-xs text-slate-300">Fast offline access, zero clutter, instant desktop & mobile launch</div>
          </div>
        </div>
        <div>
          {isInstallable && (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-2 rounded-xl bg-[#00f5d4] px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:bg-[#38bdf8] transition"
            >
              <Icon n="down" size={15} />
              {installing ? "Installing…" : "Install Now"}
            </button>
          )}
          {isIOS && (
            <button
              onClick={() => setShowIOSGuide(true)}
              className="flex items-center gap-2 rounded-xl border border-cyan-400 bg-white/10 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-white/20 transition"
            >
              <Icon n="down" size={15} />
              How to Install
            </button>
          )}
        </div>
        {showIOSGuide && <IOSGuideModal onClose={() => setShowIOSGuide(false)} />}
      </div>
    );
  }

  // Default button
  if (isInstallable) {
    return (
      <button
        onClick={handleInstall}
        disabled={installing}
        className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-blue-500 hover:to-cyan-400 transition ${className}`}
      >
        <Icon n="down" size={16} />
        {installing ? "Installing…" : "Install Harsh AI"}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-slate-800 transition ${className}`}
        >
          <Icon n="down" size={16} />
          Install on iOS
        </button>
        {showIOSGuide && <IOSGuideModal onClose={() => setShowIOSGuide(false)} />}
      </>
    );
  }

  return null;
};

function IOSGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[#0b132b] p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/20 text-[#00f5d4]">
            <Icon n="bolt" size={18} />
          </span>
          <h3 className="text-lg font-bold">Install Harsh AI on iPhone / iPad</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          1. Tap the <strong>Share</strong> icon (square with arrow pointing up) in Safari's bottom toolbar.<br />
          2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
          3. Tap <strong>Add</strong> in the top-right corner to finish.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
