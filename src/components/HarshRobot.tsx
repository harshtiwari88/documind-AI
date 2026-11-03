import React from "react";

interface HarshRobotProps {
  className?: string;
  size?: number;
  mood?: "happy" | "thinking" | "listening" | "waving";
  showBadge?: boolean;
}

export default function HarshRobot({
  className = "w-10 h-10",
  size,
  mood = "happy",
  showBadge = false,
}: HarshRobotProps) {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={style}>
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-md select-none"
      >
        <defs>
          <linearGradient id="hrBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="50%" stopColor="#1e40af" />
            <stop offset="100%" stopColor="#0b132b" />
          </linearGradient>
          <linearGradient id="hrHead" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="60%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="hrCyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f5d4" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <filter id="hrGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Antenna */}
        <line x1="60" y1="22" x2="60" y2="12" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
        <circle
          cx="60"
          cy="10"
          r="5"
          fill={mood === "thinking" ? "#f59e0b" : "#00f5d4"}
          filter="url(#hrGlow)"
          className={mood === "thinking" ? "animate-pulse" : ""}
        />
        <circle cx="60" cy="10" r="2.5" fill="#ffffff" />

        {/* Headphone audio nodes */}
        <rect x="23" y="38" width="6" height="18" rx="3" fill="#38bdf8" />
        <rect x="91" y="38" width="6" height="18" rx="3" fill="#38bdf8" />
        <circle cx="26" cy="47" r="2" fill={mood === "listening" ? "#00f5d4" : "#38bdf8"} />
        <circle cx="94" cy="47" r="2" fill={mood === "listening" ? "#00f5d4" : "#38bdf8"} />

        {/* Head Shell */}
        <rect x="27" y="22" width="66" height="50" rx="18" fill="url(#hrHead)" stroke="#38bdf8" strokeWidth="2" />

        {/* Digital Screen Visor */}
        <rect x="33" y="30" width="54" height="34" rx="12" fill="#020617" stroke="#1e293b" strokeWidth="1.5" />

        {/* Eyes based on mood */}
        {mood === "thinking" ? (
          <>
            <path d="M41 45 Q46 41 51 45" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" filter="url(#hrGlow)" />
            <path d="M69 45 Q74 41 79 45" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" filter="url(#hrGlow)" />
          </>
        ) : mood === "listening" ? (
          <>
            {/* Audio waveform eyes */}
            <line x1="41" y1="46" x2="41" y2="46" stroke="#00f5d4" strokeWidth="3" strokeLinecap="round" />
            <line x1="46" y1="40" x2="46" y2="52" stroke="#00f5d4" strokeWidth="3.5" strokeLinecap="round" filter="url(#hrGlow)" />
            <line x1="51" y1="44" x2="51" y2="48" stroke="#00f5d4" strokeWidth="3" strokeLinecap="round" />

            <line x1="69" y1="44" x2="69" y2="48" stroke="#00f5d4" strokeWidth="3" strokeLinecap="round" />
            <line x1="74" y1="40" x2="74" y2="52" stroke="#00f5d4" strokeWidth="3.5" strokeLinecap="round" filter="url(#hrGlow)" />
            <line x1="79" y1="46" x2="79" y2="46" stroke="#00f5d4" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* Happy eyes */}
            <ellipse cx="46" cy="46" rx="6.5" ry="7" fill="url(#hrCyan)" filter="url(#hrGlow)" />
            <ellipse cx="74" cy="46" rx="6.5" ry="7" fill="url(#hrCyan)" filter="url(#hrGlow)" />
            <circle cx="48" cy="43.5" r="2.5" fill="#ffffff" />
            <circle cx="76" cy="43.5" r="2.5" fill="#ffffff" />
          </>
        )}

        {/* Digital Mouth */}
        <path
          d={mood === "thinking" ? "M54 57 L66 57" : "M54 55 Q60 60 66 55"}
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          filter="url(#hrGlow)"
        />

        {/* Neck */}
        <rect x="52" y="73" width="16" height="6" rx="2" fill="#1e293b" />

        {/* Body Chassis */}
        <rect x="34" y="80" width="52" height="32" rx="10" fill="url(#hrBody)" stroke="#38bdf8" strokeWidth="1.8" />

        {/* Core Reactor */}
        <circle cx="60" cy="94" r="8" fill="#0b132b" stroke="#00f5d4" strokeWidth="1.5" />
        <path d="M57 91 L63 94 L57 97 Z" fill="#00f5d4" filter="url(#hrGlow)" />

        {/* Indicators */}
        <circle cx="44" cy="94" r="2" fill="#38bdf8" />
        <circle cx="76" cy="94" r="2" fill="#00f5d4" />
      </svg>

      {showBadge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900 bg-[#00f5d4] shadow-sm animate-pulse"
          title="Harsh AI Online"
        />
      )}
    </div>
  );
}
