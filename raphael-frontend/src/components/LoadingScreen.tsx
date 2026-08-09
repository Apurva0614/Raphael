import React, { useEffect, useMemo, useRef, useState } from "react";
import mountainBg from "@/assets/raphael-mountains.jpg";

type ModuleKey = "atmosphere" | "hydrology" | "landcover" | "climate" | "biodiversity";
type ModuleStatus = "pending" | "loading" | "complete";

interface ModuleState {
  key: ModuleKey;
  label: string;
  status: ModuleStatus;
}

interface LoadingScreenProps {
  /** Optional WebSocket URL. Defaults to local backend. Set to null to disable. */
  wsUrl?: string | null;
  /** Called after the fade-out animation completes. */
  onComplete?: () => void;
}

const INITIAL_MODULES: ModuleState[] = [
  { key: "atmosphere", label: "ATMOSPHERE", status: "pending" },
  { key: "hydrology", label: "HYDROLOGY", status: "pending" },
  { key: "landcover", label: "LAND COVER", status: "pending" },
  { key: "climate", label: "CLIMATE", status: "pending" },
  { key: "biodiversity", label: "BIODIVERSITY", status: "pending" },
];

const MODULE_MESSAGES: Record<ModuleKey, string> = {
  atmosphere: "Loading Atmospheric Models...",
  hydrology: "Loading Hydrological Models...",
  landcover: "Indexing Land Cover Tiles...",
  climate: "Calibrating Climate Layers...",
  biodiversity: "Syncing Biodiversity Datasets...",
};

export default function LoadingScreen({
  wsUrl = "ws://127.0.0.1:8000/ws/startup",
  onComplete,
}: LoadingScreenProps) {
  const [modules, setModules] = useState<ModuleState[]>(INITIAL_MODULES);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing Environmental Intelligence Core...");
  const [fadingOut, setFadingOut] = useState(false);
  const completedRef = useRef(false);

  // Backend integration with graceful simulated fallback.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let simTimer: ReturnType<typeof setInterval> | null = null;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setProgress(100);
      setStatusText("All systems nominal.");
      setTimeout(() => setFadingOut(true), 800);
      setTimeout(() => onComplete?.(), 800 + 600);
    };

    const applyMessage = (msg: {
      module?: ModuleKey;
      status?: ModuleStatus;
      progress?: number;
      message?: string;
    }) => {
      if (msg.module && msg.status) {
        setModules((prev) =>
          prev.map((m) => (m.key === msg.module ? { ...m, status: msg.status! } : m)),
        );
      }
      if (typeof msg.progress === "number") setProgress(Math.max(0, Math.min(100, msg.progress)));
      if (msg.message) setStatusText(msg.message);
      else if (msg.module) setStatusText(MODULE_MESSAGES[msg.module]);
    };

    const startSimulation = () => {
      const sequence: ModuleKey[] = ["atmosphere", "hydrology", "landcover", "climate", "biodiversity"];
      let idx = 0;
      let pct = 0;
      simTimer = setInterval(() => {
        pct = Math.min(100, pct + 2);
        const stage = Math.min(sequence.length - 1, Math.floor(pct / (100 / sequence.length)));
        const key = sequence[stage];
        setModules((prev) =>
          prev.map((m, i) => {
            if (sequence.indexOf(m.key) < stage) return { ...m, status: "complete" };
            if (sequence.indexOf(m.key) === stage) return { ...m, status: "loading" };
            return m;
          }),
        );
        setProgress(pct);
        setStatusText(MODULE_MESSAGES[key]);
        if (pct >= 100) {
          if (simTimer) clearInterval(simTimer);
          setModules((prev) => prev.map((m) => ({ ...m, status: "complete" })));
          finish();
        }
        idx++;
      }, 140);
    };

    if (wsUrl) {
      try {
        ws = new WebSocket(wsUrl);
        let opened = false;
        const fallback = setTimeout(() => {
          if (!opened) {
            try { ws?.close(); } catch {}
            startSimulation();
          }
        }, 1200);
        ws.onopen = () => {
          opened = true;
          clearTimeout(fallback);
        };
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            applyMessage(data);
            if (data.progress === 100) finish();
          } catch {
            /* ignore malformed */
          }
        };
        ws.onerror = () => {
          clearTimeout(fallback);
          startSimulation();
        };
      } catch {
        startSimulation();
      }
    } else {
      startSimulation();
    }

    return () => {
      if (simTimer) clearInterval(simTimer);
      try { ws?.close(); } catch {}
    };
  }, [wsUrl, onComplete]);

  const allComplete = useMemo(() => modules.every((m) => m.status === "complete"), [modules]);

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden transition-opacity duration-700 ${
        fadingOut ? "opacity-0" : "opacity-100"
      } fade-in-slow`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${mountainBg})` }}
      />
      {/* Atmospheric overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,14,10,0.55) 0%, rgba(8,14,10,0.45) 45%, rgba(8,14,10,0.85) 100%)",
        }}
      />
      {/* Topographic SVG overlay */}
      <TopoOverlay />

      {/* Coordinates */}
      <div className="absolute left-6 bottom-4 font-mono text-[10px] tracking-[0.15em] text-[var(--cream-muted)]/70">
        18.5204° N&nbsp;&nbsp;|&nbsp;&nbsp;73.8567° E
      </div>
      <div className="absolute right-6 bottom-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-[var(--cream-muted)]/70">
        <MountainMark className="h-3 w-3 text-[var(--cream)]" />
        RAPHAEL LABS
      </div>

      {/* Main centered stack */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
        {/* Logo mark */}
        <MountainMark className="h-10 w-10 text-[var(--cream)] opacity-90" />

        {/* Wordmark */}
        <h1
          className="mt-5 text-[clamp(3rem,8vw,6rem)] leading-none tracking-[0.08em] text-[var(--cream)]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
        >
          RAPHAEL
        </h1>

        {/* Subtitle */}
        <div className="mt-4 font-mono text-[11px] tracking-[0.55em] text-[var(--cream-muted)]">
          ENVIRONMENTAL&nbsp;&nbsp;INTELLIGENCE
        </div>

        {/* Divider ornament */}
        <div className="mt-6 flex items-center gap-3 text-[var(--cream-muted)]/40">
          <span className="h-px w-16 bg-current" />
          <span className="h-1 w-1 rotate-45 bg-current" />
          <span className="h-px w-16 bg-current" />
        </div>

        {/* Progress block */}
        <div className="mt-10 w-full max-w-[55vw] min-w-[420px]">
          <div className="mb-2 flex items-end justify-between font-mono text-[10px] tracking-[0.25em] text-[var(--cream-muted)]">
            <span className="uppercase">{statusText}</span>
            <span className="text-[var(--cream)]">{Math.floor(progress)}%</span>
          </div>
          <div
            className="relative h-2 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(30,42,30,0.85)", border: "1px solid rgba(74,124,89,0.25)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #3d6a4b 0%, #4a7c59 50%, #6fa97f 100%)",
                boxShadow: "0 0 12px var(--olive-glow), 0 0 24px rgba(74,124,89,0.45)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(232,220,200,0.5) 50%, transparent 100%)",
                animation: "raphael-progress-shimmer 2.4s linear infinite",
              }}
            />
          </div>
        </div>

        {/* Tagline */}
        <p
          className="mt-12 text-[var(--cream)]/75 italic tracking-wide"
          style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}
        >
          Understanding Earth. Observe. Protect.
        </p>
      </div>

      {/* Module status strip */}
      <div className="absolute bottom-14 left-1/2 z-10 -translate-x-1/2">
        <div
          className="flex items-stretch gap-0 rounded-xl border px-1 py-2"
          style={{
            background: "rgba(13,21,13,0.55)",
            borderColor: "rgba(74,124,89,0.30)",
            backdropFilter: "blur(14px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
          }}
        >
          {modules.map((m, i) => (
            <div key={m.key} className="flex items-center">
              <ModuleChip module={m} />
              {i < modules.length - 1 && (
                <div className="mx-1 h-10 w-px bg-[var(--cream)]/10" />
              )}
            </div>
          ))}
        </div>
        <div
          className={`mt-3 text-center font-mono text-[10px] tracking-[0.3em] transition-colors ${
            allComplete ? "text-[var(--olive)]" : "text-[var(--cream-muted)]/70"
          }`}
        >
          {allComplete ? "● SYSTEMS NOMINAL" : "● INITIALIZING SUBSYSTEMS"}
        </div>
      </div>
    </div>
  );
}

function ModuleChip({ module }: { module: ModuleState }) {
  const Icon = MODULE_ICONS[module.key];
  const statusColor =
    module.status === "complete"
      ? "var(--olive)"
      : module.status === "loading"
      ? "var(--amber-status)"
      : "#555c55";
  const statusLabel =
    module.status === "complete" ? "READY" : module.status === "loading" ? "LOADING" : "PENDING";

  return (
    <div className="flex w-[124px] flex-col items-center gap-1.5 px-3 py-1">
      <Icon className="h-6 w-6 text-[var(--cream)]/85" />
      <div className="font-mono text-[10px] font-semibold tracking-[0.18em] text-[var(--cream)]">
        {module.label}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${module.status !== "pending" ? "status-pulse" : ""}`}
          style={{ background: statusColor, color: statusColor }}
        />
        <span
          className="font-mono text-[9px] tracking-[0.2em]"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

/* ---------- Icons (inline, no library) ---------- */

function MountainMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 42 L22 14 L34 30 L44 18 L60 42 Z" />
      <path d="M18 22 L24 28" opacity="0.6" />
    </svg>
  );
}

const iconBase = "stroke-current";
const IconAtmosphere = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" className={`${iconBase} ${className}`}>
    <path d="M3 9h14a3 3 0 100-6 3 3 0 00-2.83 2" />
    <path d="M2 14h18" /><path d="M5 19h12" />
  </svg>
);
const IconHydrology = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" className={`${iconBase} ${className}`}>
    <path d="M12 3c4 5 6 8.5 6 12a6 6 0 11-12 0c0-3.5 2-7 6-12z" />
  </svg>
);
const IconLand = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" className={`${iconBase} ${className}`}>
    <path d="M3 18l5-7 4 5 3-4 6 6" /><path d="M3 21h18" />
  </svg>
);
const IconClimate = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" className={`${iconBase} ${className}`}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M4.5 19.5l2-2M17.5 6.5l2-2" />
  </svg>
);
const IconBio = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.4" className={`${iconBase} ${className}`}>
    <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z" /><path d="M5 19c4-4 7-7 14-14" />
  </svg>
);

const MODULE_ICONS: Record<ModuleKey, (p: { className?: string }) => React.ReactElement> = {
  atmosphere: IconAtmosphere,
  hydrology: IconHydrology,
  landcover: IconLand,
  climate: IconClimate,
  biodiversity: IconBio,
};

/* ---------- Topographic background SVG ---------- */

function TopoOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: 0.16, color: "var(--cream-muted)" }}
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        {Array.from({ length: 14 }).map((_, i) => {
          const r = 80 + i * 55;
          return (
            <path
              key={`l-${i}`}
              d={`M -100 ${450 + Math.sin(i) * 30} Q 400 ${450 - r * 0.6} 800 ${450 + Math.cos(i) * 40} T 1700 ${450 + Math.sin(i * 1.3) * 50}`}
            />
          );
        })}
        {Array.from({ length: 10 }).map((_, i) => (
          <ellipse
            key={`e-${i}`}
            cx={300 + i * 30}
            cy={600 + i * 8}
            rx={400 + i * 40}
            ry={120 + i * 18}
            opacity={0.55}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <ellipse
            key={`r-${i}`}
            cx={1250 - i * 20}
            cy={320 - i * 6}
            rx={260 + i * 30}
            ry={90 + i * 14}
            opacity={0.45}
          />
        ))}
      </g>
    </svg>
  );
}
