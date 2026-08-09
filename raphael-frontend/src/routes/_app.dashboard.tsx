import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "@/hooks/useZones";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { Zap } from "lucide-react";
import { DataLineageDrawer, LINEAGE, type LineageData } from "@/components/DataLineageDrawer";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

// ============================================================================
// PALANTIR-GOTHAM ENVIRONMENTAL OPS CENTER
// TODO[Antigravity]: All mock data below to be replaced by FastAPI feeds.
// ============================================================================

const COLORS = {
  bg: "#0a0f0a",
  surface: "#0d150d",
  border: "#1e2d1e",
  cyan: "#4a7c59",
  amber: "#f59e0b",
  red: "#ef4444",
  green: "#10b981",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  text: "#e2e8f0",
  muted: "#64748b",
};

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', system-ui, sans-serif";

// TODO[Antigravity]: GET /api/zones
const ZONES = [
  { name: "Hadapsar Industrial", score: 9.2, sev: "critical" },
  { name: "Pune NE Quadrant", score: 7.8, sev: "high" },
  { name: "Katraj Hills", score: 5.1, sev: "moderate" },
  { name: "Shivajinagar", score: 4.3, sev: "moderate" },
  { name: "Kothrud Residential", score: 2.3, sev: "low" },
  { name: "Aundh", score: 1.8, sev: "nominal" },
] as const;

const SEV_COLOR: Record<string, string> = {
  critical: COLORS.red,
  high: "#fb923c",
  moderate: COLORS.amber,
  low: "#84cc16",
  nominal: COLORS.green,
};

// TODO[Antigravity]: GET /api/risk-vectors
const RADAR_DATA = [
  { axis: "HEAT ISLAND", v: 82, vInner: 41 },
  { axis: "PARTICULATE", v: 74, vInner: 37 },
  { axis: "VEGETATION", v: 66, vInner: 33 },
  { axis: "WATER STRESS", v: 58, vInner: 29 },
  { axis: "URBAN PRESSURE", v: 71, vInner: 36 },
];

const ATTRIBUTION = [
  { label: "Heat", pct: 32, color: COLORS.red },
  { label: "Particulate", pct: 24, color: COLORS.amber },
  { label: "Vegetation", pct: 18, color: COLORS.green },
  { label: "Water", pct: 14, color: COLORS.blue },
  { label: "Urban", pct: 12, color: COLORS.violet },
];

const PIPELINE = [
  { label: "DATA INGEST", state: "done" },
  { label: "ML ENRICHMENT", state: "done" },
  { label: "ANOMALY DETECTION", state: "active" },
  { label: "FORECAST", state: "pending" },
  { label: "REPORT", state: "pending" },
] as const;

const SYSTEMS = [
  { name: "OpenAQ Feed", status: "NOMINAL", info: "synced 4m ago", tone: "green" },
  { name: "NASA FIRMS", status: "NOMINAL", info: "synced 1h ago", tone: "green" },
  { name: "ML Engine", status: "PROCESSING", info: "cycle active", tone: "cyan" },
  { name: "Forecast Model", status: "NOMINAL", info: "updated 23m ago", tone: "green" },
] as const;

// terminal-style sensor sparkline: 12 points jittering around a center value
const spark = (center: number, slope = 0, seed = 1) =>
  Array.from({ length: 12 }, (_, i) => {
    const noise = (Math.sin(i * 7.3 + seed * 13.7) + Math.sin(i * 2.1 + seed * 3.1)) * 0.5;
    return { x: i, y: +(center + slope * i + noise * (center * 0.06)).toFixed(2) };
  });

const AQI_TREND = spark(142, 0.6, 1);
const LST_TREND = spark(38.4, 0.05, 2);
const NDVI_TREND = spark(0.42, -0.008, 3);

// ---------------------------------------------------------------------------- helpers

function PanelHeader({ title, tag, lineage }: { title: string; tag?: string; lineage?: LineageData }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span style={{ color: COLORS.cyan, fontFamily: MONO, fontSize: 10 }}>[</span>
        <h3
          style={{
            fontFamily: SANS,
            fontSize: 10,
            letterSpacing: "0.12em",
            color: COLORS.muted,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {title}
        </h3>
        <span style={{ color: COLORS.cyan, fontFamily: MONO, fontSize: 10 }}>]</span>
        {lineage && <DataLineageDrawer data={lineage} />}
      </div>
      {tag && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 8,
            padding: "2px 6px",
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
            color: COLORS.muted,
            letterSpacing: "0.08em",
          }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="ops-panel"
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatusDot({ tone }: { tone: "green" | "amber" | "red" | "cyan" }) {
  const c =
    tone === "green" ? COLORS.green : tone === "amber" ? COLORS.amber : tone === "red" ? COLORS.red : COLORS.cyan;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: c,
        boxShadow: `0 0 8px ${c}`,
        animation: "ops-pulse 1.6s ease-in-out infinite",
      }}
    />
  );
}

// ============================================================================ MAIN

function DashboardPage() {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [countdown, setCountdown] = useState(47 * 60 + 22);
  const [cycleState, setCycleState] = useState<'idle' | 'triggering' | 'triggered' | 'error'>('idle');

  const { data: intelStatus, refetch: refetchIntelStatus } = useQuery({
    queryKey: ["intelligenceStatus"],
    queryFn: () => fetchWithAuth("/api/v1/system/intelligence/status"),
    refetchInterval: 10000,
  });

  const pipeline = useMemo(() => {
    const data = intelStatus?.data;
    const lastRun = data?.last_run;
    const stages = data?.stages || {};
    const anomalyCounts = data?.anomaly_counts || {};

    const mapVal = (val: string | undefined): "done" | "active" | "pending" => {
      if (val === "complete") return "done";
      if (val === "active") return "active";
      return "pending";
    };

    if (!lastRun) {
      return [
        { label: "DATA INGEST", state: "pending" as const },
        { label: "ML CLUSTER", state: "pending" as const },
        { label: "ANOMALY DETECT", state: "pending" as const },
        { label: "RISK SCORE", state: "pending" as const },
        { label: "PLUME DISPATCH", state: "pending" as const },
      ];
    }

    const totalAnomalies = Object.values(anomalyCounts).reduce(
      (acc: number, cur: any) => acc + (typeof cur === "number" ? cur : 0),
      0
    );

    return [
      { label: "DATA INGEST", state: "done" as const },
      { label: "ML CLUSTER", state: mapVal(stages.kmeans_clustering) },
      { label: "ANOMALY DETECT", state: totalAnomalies > 0 ? ("done" as const) : ("pending" as const) },
      { label: "RISK SCORE", state: mapVal(stages.risk_score) },
      { label: "PLUME DISPATCH", state: mapVal(stages.gaussian_plume) },
    ];
  }, [intelStatus]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      setCountdown((c) => (c > 0 ? c - 1 : 60 * 60));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleTriggerCycle = async () => {
    setCycleState('triggering');
    try {
      const res = await fetch(
        'http://127.0.0.1:8000/api/v1/system/intelligence/run',
        { 
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('raphael_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (res.ok) {
        setCycleState('triggered');
        refetchIntelStatus();
        setTimeout(() => setCycleState('idle'), 3000);
      } else {
        setCycleState('error');
        setTimeout(() => setCycleState('idle'), 3000);
      }
    } catch {
      setCycleState('error');
      setTimeout(() => setCycleState('idle'), 3000);
    }
  };

  const timeStr = useMemo(
    () =>
      now.toISOString().replace("T", " ").slice(0, 19) + " UTC",
    [now],
  );

  const cdStr = useMemo(() => {
    const h = Math.floor(countdown / 3600);
    const m = Math.floor((countdown % 3600) / 60);
    const s = countdown % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [countdown]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: SANS,
        display: "grid",
        gridTemplateRows: "48px 55fr 45fr",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes ops-pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @keyframes ops-scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes ops-scan-bar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes ops-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes ops-trigger-pulse {
          0%, 100% { border-color: #4a7c59; box-shadow: 0 0 0 rgba(74,124,89,0); }
          50% { border-color: #2d4a35; box-shadow: 0 0 14px rgba(74,124,89,0.35); }
        }
        .ops-panel { transition: border-color 160ms ease, box-shadow 160ms ease; }
        .ops-panel:hover { border-color: rgba(74,124,89,0.25); box-shadow: 0 0 12px rgba(74,124,89,0.10); }
        .ops-trigger {
          width: 100%; height: 36px;
          background: ${COLORS.bg};
          border: 1px solid ${COLORS.cyan};
          color: ${COLORS.cyan};
          font-family: ${MONO};
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer;
          transition: background 160ms ease, box-shadow 160ms ease;
          animation: ops-trigger-pulse 2s ease-in-out infinite;
        }
        .ops-trigger:hover {
          background: rgba(74,124,89,0.08);
          box-shadow: 0 0 18px rgba(74,124,89,0.30);
        }
        .ops-map-wrap { cursor: pointer; transition: border-color 160ms ease, box-shadow 160ms ease; }
        .ops-map-wrap:hover { border-color: ${COLORS.cyan}; box-shadow: 0 0 16px rgba(74,124,89,0.25); }
        .ops-map-wrap:hover .ops-map-tip { opacity: 1; }
        .ops-bracket::before, .ops-bracket::after {
          content: ''; position: absolute; width: 10px; height: 10px;
          border-color: ${COLORS.cyan}; border-style: solid; border-width: 0;
        }
        .ops-bracket-tl::before { top: 4px; left: 4px; border-top-width: 1px; border-left-width: 1px; }
        .ops-bracket-tr::after  { top: 4px; right: 4px; border-top-width: 1px; border-right-width: 1px; }
        .ops-bracket-bl::before { bottom: 4px; left: 4px; border-bottom-width: 1px; border-left-width: 1px; }
        .ops-bracket-br::after  { bottom: 4px; right: 4px; border-bottom-width: 1px; border-right-width: 1px; }
      `}</style>

      {/* ============================================ ROW 1 — HEADER STRIP */}
      <div
        style={{
          height: 48,
          borderBottom: `1px solid ${COLORS.border}`,
          background: `${COLORS.surface}`,
          backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px)`,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "0 18px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.16em",
        }}
      >
        <div style={{ color: COLORS.muted, textTransform: "uppercase" }}>
          Environmental Operations Center
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.text }}>
          <StatusDot tone="green" />
          <span style={{ textTransform: "uppercase" }}>
            SYSTEM NOMINAL · LAST RUN: {intelStatus?.data?.last_run ? intelStatus.data.last_run.slice(0, 19) + " UTC" : "NONE"}
          </span>
        </div>
        <div style={{ justifySelf: "end", display: "flex", gap: 16, color: COLORS.text }}>
          <span>{timeStr}</span>
          <span style={{ color: "#c8b89a" }}>18.5204°N 73.8567°E</span>
        </div>
      </div>

      {/* ============================================ ROW 2 — PRIMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "22% 28% 28% 22%",
          gap: 10,
          padding: 10,
          minHeight: 0,
        }}
      >
        {/* ---- COL 1: ZONE RISK MATRIX */}
        <Panel>
          <PanelHeader title="Zone Risk Matrix" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            {ZONES.map((z) => {
              const c = SEV_COLOR[z.sev];
              return (
                <div
                  key={z.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 70px 38px",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    background: COLORS.bg,
                    borderLeft: `3px solid ${c}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: 11,
                      color: COLORS.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {z.name}
                  </span>
                  <div
                    style={{
                      height: 4,
                      background: COLORS.border,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: `${z.score * 10}%`,
                        background: c,
                        boxShadow: `0 0 6px ${c}80`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      color: c,
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {z.score.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: MONO,
              fontSize: 9,
              color: COLORS.red,
              letterSpacing: "0.12em",
            }}
          >
            3 ZONES REQUIRE ATTENTION
          </div>
          <div
            style={{
              marginTop: 6,
              height: 2,
              background: COLORS.border,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                background: COLORS.cyan,
                boxShadow: `0 0 6px ${COLORS.cyan}`,
                animation: "ops-scan-bar 8s linear infinite",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: MONO,
              fontSize: 8,
              color: COLORS.cyan,
              letterSpacing: "0.18em",
              animation: "ops-blink 1.2s ease-in-out infinite",
            }}
          >
            SCANNING...
          </div>
        </Panel>

        {/* ---- COL 2: RADAR + ATTRIBUTION */}
        <Panel>
          <PanelHeader title="Risk Vector Analysis · 5-Axis" />
          <div style={{ flex: 1, minHeight: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={RADAR_DATA} outerRadius="78%">
                <PolarGrid stroke={COLORS.border} />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontFamily: MONO, fontSize: 9, fill: COLORS.muted, letterSpacing: 1 }}
                />
                {/* depth layer — inner polygon at 50% scale */}
                <Radar
                  dataKey="vInner"
                  stroke="none"
                  fill={COLORS.cyan}
                  fillOpacity={0.08}
                  isAnimationActive={false}
                />
                <Radar
                  dataKey="v"
                  stroke={COLORS.cyan}
                  strokeWidth={2.5}
                  fill={COLORS.cyan}
                  fillOpacity={0.4}
                  dot={{ r: 4, fill: COLORS.cyan, stroke: COLORS.cyan }}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {ATTRIBUTION.map((a) => (
              <div
                key={a.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 40px",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    color: COLORS.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {a.label}
                </span>
                <div style={{ height: 6, background: COLORS.border, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${a.pct}%`,
                      background: a.color,
                      boxShadow: `0 0 8px ${a.color}60`,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: COLORS.text,
                    textAlign: "right",
                  }}
                >
                  {a.pct}%
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* ---- COL 3: PIPELINE + SYSTEMS + TRIGGER */}
        <Panel>
          <PanelHeader title={`Intelligence Pipeline · Last Run: ${intelStatus?.data?.last_run ? intelStatus.data.last_run.slice(0, 16) : "None"}`} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              alignItems: "center",
              position: "relative",
              padding: "10px 0",
            }}
          >
            {/* connecting line */}
            <div
              style={{
                position: "absolute",
                top: 20,
                left: "10%",
                right: "10%",
                height: 1,
                background: COLORS.border,
              }}
            />
            {pipeline.map((p) => {
              const isDone = p.state === "done";
              const isActive = p.state === "active";
              const c = isDone || isActive ? COLORS.cyan : COLORS.border;
              return (
                <div
                  key={p.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: isDone ? COLORS.cyan : isActive ? COLORS.cyan : COLORS.bg,
                      border: `1px solid ${c}`,
                      boxShadow: isActive ? `0 0 12px ${COLORS.cyan}` : isDone ? `0 0 6px ${COLORS.cyan}80` : "none",
                      animation: isActive ? "ops-pulse 1.4s ease-in-out infinite" : "none",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      color: isDone || isActive ? COLORS.text : COLORS.muted,
                      textAlign: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    {p.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 6,
              fontFamily: SANS,
              fontSize: 9,
              letterSpacing: "0.12em",
              color: COLORS.muted,
              textTransform: "uppercase",
              borderTop: `1px solid ${COLORS.border}`,
              paddingTop: 8,
            }}
          >
            System Status
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, flex: 1 }}>
            {SYSTEMS.map((s) => (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 10,
                }}
              >
                <StatusDot tone={s.tone as "green" | "cyan"} />
                <span style={{ color: COLORS.text, minWidth: 110 }}>{s.name}:</span>
                <span style={{ color: s.tone === "cyan" ? COLORS.cyan : COLORS.green }}>
                  {s.status}
                </span>
                <span style={{ color: COLORS.muted }}>— {s.info}</span>
              </div>
            ))}
          </div>

          <button
            className="ops-trigger"
            style={{ marginTop: 10 }}
            onClick={handleTriggerCycle}
            disabled={cycleState !== 'idle'}
          >
            {cycleState === 'idle' && "⚡ TRIGGER INTELLIGENCE CYCLE"}
            {cycleState === 'triggering' && "CONTACTING BACKEND..."}
            {cycleState === 'triggered' && "✓ CYCLE INITIATED"}
            {cycleState === 'error' && "✗ CONNECTION FAILED — RETRY"}
          </button>
        </Panel>

        {/* ---- COL 4: SPATIAL */}
        {/* TODO Antigravity: Replace SVG with Cesium minimap instance
            centered on activeRegion coordinates from /api/v1/regions/active
            onClick: navigate to /explorer?region={activeRegion.id} */}
        <Panel>
          <PanelHeader title="Spatial Snapshot" />
          <div
            className="ops-bracket ops-bracket-tl ops-bracket-tr ops-bracket-bl ops-bracket-br ops-map-wrap"
            onClick={() => navigate({ to: "/explorer" })}
            style={{
              position: "relative",
              flex: 1,
              minHeight: 160,
              background: "#0a0f0a",
              border: `1px solid ${COLORS.border}`,
              overflow: "hidden",
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 140" preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, display: "block" }}>
              <defs>
                <pattern id="topo-mini" width="22" height="22" patternUnits="userSpaceOnUse">
                  <path d="M0 16 Q5 4 11 16 T22 16" fill="none" stroke="#c8b89a" strokeWidth="0.5" opacity="0.06" />
                  <path d="M0 10 Q5 -2 11 10 T22 10" fill="none" stroke="#c8b89a" strokeWidth="0.5" opacity="0.06" />
                </pattern>
              </defs>
              {/* topographic background texture */}
              <rect width="200" height="140" fill="url(#topo-mini)" />

              {/* abstract urban zone polygons — olive outline */}
              <g fill="none" stroke="#4a7c59" strokeOpacity="0.4" strokeWidth="0.7">
                <polygon points="30,40 70,28 95,46 88,72 56,80 28,66" />
                <polygon points="95,46 140,38 158,60 150,88 110,92 88,72" />
                <polygon points="56,80 88,72 110,92 96,118 64,116 44,100" />
                <polygon points="110,92 150,88 168,108 156,128 120,124" />
                {/* arterial roads */}
                <path d="M10,70 Q60,60 100,72 T196,80" />
                <path d="M100,10 Q108,50 100,72 T112,134" />
                <path d="M20,120 Q70,100 110,92 T180,40" />
              </g>

              {/* central crosshair / reticle */}
              <g stroke="#4a7c59" strokeOpacity="0.55" strokeWidth="0.6" fill="none">
                <circle cx="100" cy="70" r="10" />
                <circle cx="100" cy="70" r="18" strokeDasharray="2 3" />
                <line x1="100" y1="54" x2="100" y2="62" />
                <line x1="100" y1="78" x2="100" y2="86" />
                <line x1="84" y1="70" x2="92" y2="70" />
                <line x1="108" y1="70" x2="116" y2="70" />
              </g>

              {/* zone dots */}
              {/* NE: Hadapsar — critical (red, pulsing) */}
              <g>
                <circle cx="148" cy="48" r="6" fill="#ef4444" opacity="0.35">
                  <animate attributeName="r" values="5;10;5" dur="1.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.45;0;0.45" dur="1.6s" repeatCount="indefinite" />
                </circle>
                <circle cx="148" cy="48" r="3" fill="#ef4444" />
                <text x="154" y="46" fontFamily={MONO} fontSize="5" fill="#ef4444" letterSpacing="0.5">HADAPSAR</text>
              </g>
              {/* CENTER: Shivajinagar — amber */}
              <g>
                <circle cx="100" cy="70" r="2.5" fill="#f59e0b" />
                <text x="106" y="68" fontFamily={MONO} fontSize="5" fill="#f59e0b" letterSpacing="0.5">SHIVAJINAGAR</text>
              </g>
              {/* SW: Kothrud — green */}
              <g>
                <circle cx="56" cy="96" r="2.5" fill="#10b981" />
                <text x="20" y="94" fontFamily={MONO} fontSize="5" fill="#10b981" letterSpacing="0.5">KOTHRUD</text>
              </g>
              {/* S: Katraj — amber */}
              <g>
                <circle cx="108" cy="120" r="2.5" fill="#f59e0b" />
                <text x="114" y="122" fontFamily={MONO} fontSize="5" fill="#f59e0b" letterSpacing="0.5">KATRAJ</text>
              </g>
            </svg>

            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 8,
                fontFamily: MONO,
                fontSize: 8,
                color: COLORS.muted,
                letterSpacing: "0.16em",
              }}
            >
              PUNE METROPOLITAN REGION
            </div>
            <div
              className="ops-map-tip"
              style={{
                position: "absolute",
                bottom: 6,
                right: 8,
                fontFamily: MONO,
                fontSize: 8,
                color: COLORS.cyan,
                letterSpacing: "0.16em",
                opacity: 0,
                transition: "opacity 160ms ease",
              }}
            >
              OPEN IN EXPLORER →
            </div>
          </div>
        </Panel>
      </div>

      {/* ============================================ ROW 3 — SECONDARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
          padding: "0 10px 10px",
          minHeight: 0,
        }}
      >
        {/* AQI */}
        {/* TODO Antigravity: Pull from /api/v1/layers/aq/current
            PM2.5, PM10, NO2 from raw_observations by parameter field */}
        <MetricPanel
          title="AQI · PM2.5"
          tag="OpenAQ / WAQI"
          value="142"
          valueColor={COLORS.amber}
          subtitle="UNHEALTHY · 24H AVG"
          subtitleColor={COLORS.amber}
          trend={AQI_TREND}
          trendColor={COLORS.amber}
          lineage={LINEAGE.aqi}
          rows={[
            { label: "PM2.5", value: "89.4 μg/m³", pct: 60, color: COLORS.red },
            { label: "PM10", value: "124.1 μg/m³", pct: 75, color: COLORS.amber },
            { label: "NO₂", value: "48.2 μg/m³", pct: 40, color: COLORS.amber },
          ]}
          pills={[
            { dot: COLORS.green, text: "12 STATIONS ACTIVE" },
            { dot: COLORS.cyan, text: "CPCB INDIA FEED" },
          ]}
          footer="↑ 8.2% VS YESTERDAY"
          footerColor={COLORS.red}
        />

        {/* LST */}
        {/* TODO Antigravity: Pull from /api/v1/layers/lst/current
            Day/night from MODIS MOD11A1 LST_Day_1km + LST_Night_1km bands */}
        <MetricPanel
          title="LST · Thermal"
          tag="MODIS / NASA"
          value="38.4°C"
          valueColor="#00d4ff"
          subtitle="ABOVE BASELINE · +3.1°C"
          subtitleColor={COLORS.amber}
          trend={LST_TREND}
          trendColor="#00d4ff"
          lineage={LINEAGE.lst}
          rows={[
            { label: "DAY LST", value: "38.4°C", pct: 70, color: COLORS.amber },
            { label: "NIGHT LST", value: "24.1°C", pct: 35, color: COLORS.cyan },
            { label: "BASELINE", value: "35.3°C", pct: 60, color: COLORS.muted },
          ]}
          pills={[
            { dot: COLORS.cyan, text: "MODIS DAILY" },
            { dot: COLORS.green, text: "1KM RESOLUTION" },
          ]}
          extra={
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: MONO,
                fontSize: 9,
                color: COLORS.amber,
                letterSpacing: "0.1em",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: COLORS.amber,
                  boxShadow: `0 0 6px ${COLORS.amber}`,
                  animation: "ops-pulse 1.4s ease-in-out infinite",
                }}
              />
              ⚠ 3 THERMAL ANOMALIES DETECTED
            </div>
          }
        />

        {/* NDVI */}
        {/* TODO Antigravity: Pull from /api/v1/layers/ndvi/current
            Classification bands from Sentinel-2 processed tiles */}
        <MetricPanel
          title="NDVI · Green Cover"
          tag="Sentinel-2"
          value="0.34"
          valueColor={COLORS.red}
          subtitle="DECLINING · LAST 30D"
          subtitleColor={COLORS.red}
          trend={NDVI_TREND}
          trendColor={COLORS.green}
          lineage={LINEAGE.ndvi}
          rows={[
            { label: "DENSE VEG", value: "12%", pct: 12, color: COLORS.green },
            { label: "SPARSE VEG", value: "31%", pct: 31, color: COLORS.cyan },
            { label: "BARE/URBAN", value: "57%", pct: 57, color: COLORS.red },
          ]}
          pills={[
            { dot: COLORS.green, text: "SENTINEL-2" },
            { dot: COLORS.cyan, text: "10M RES" },
          ]}
          extra={
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: MONO,
                fontSize: 8,
                color: COLORS.muted,
                letterSpacing: "0.08em",
              }}
            >
              {[
                { c: COLORS.green, label: "Forest" },
                { c: COLORS.cyan, label: "Agriculture" },
                { c: COLORS.red, label: "Urban" },
              ].map((s) => (
                <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: s.c, display: "inline-block" }} />
                  {s.label}
                </span>
              ))}
            </div>
          }
        />


        {/* COMPOSITE RISK */}
        {/* TODO Antigravity: Pull from /api/v1/layers/composite/risk
            contributions object from ml_outputs explanation field */}
        <Panel>
          <PanelHeader title="Composite Risk Score" tag="ML ENGINE" lineage={LINEAGE.composite} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 48, color: COLORS.red, lineHeight: 1, fontWeight: 600 }}>
              7.8
            </span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: COLORS.muted }}>/10</span>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: COLORS.red,
              letterSpacing: "0.12em",
              marginTop: 4,
            }}
          >
            HIGH RISK · NE QUADRANT
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "8px 0" }}>
            <RadialArc value={78} color={COLORS.red} />
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              color: COLORS.muted,
              letterSpacing: "0.12em",
              marginBottom: 4,
            }}
          >
            CONTRIBUTING FACTORS:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { label: "AQ WEIGHT", value: "34.2pts", pct: 44, color: COLORS.amber },
              { label: "LST WEIGHT", value: "26.4pts", pct: 34, color: COLORS.red },
              { label: "NDVI WEIGHT", value: "17.4pts", pct: 22, color: COLORS.green },
            ].map((r) => (
              <DataRow key={r.label} row={r} />
            ))}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: MONO,
              fontSize: 8,
              color: COLORS.muted,
              letterSpacing: "0.1em",
            }}
          >
            MODEL: WEIGHTED MINMAX v1.0
          </div>
        </Panel>

        {/* AI EXPLAINABILITY */}
        <Panel>
          <PanelHeader title="AI Signal Attribution" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            {[
              {
                tone: COLORS.red,
                text: "Heat-stressed urban zones intensifying — NH-9 corridor",
                conf: 87,
                lineage: LINEAGE.signalHeat,
              },
              {
                tone: COLORS.amber,
                text: "PM2.5 trending +14% week-over-week in NE sector",
                conf: 73,
                lineage: LINEAGE.signalPM,
              },
              {
                tone: COLORS.green,
                text: "Aravalli buffer vegetation stable — no intervention",
                conf: 91,
                lineage: LINEAGE.signalVeg,
              },
            ].map((i) => (
              <div
                key={i.text}
                style={{
                  display: "grid",
                  gridTemplateColumns: "10px 1fr 18px 36px",
                  alignItems: "start",
                  gap: 8,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: i.tone,
                    boxShadow: `0 0 6px ${i.tone}`,
                    marginTop: 4,
                  }}
                />
                <span style={{ fontFamily: SANS, fontSize: 11, color: COLORS.text, lineHeight: 1.4 }}>
                  {i.text}
                </span>
                <span style={{ marginTop: 1 }}>
                  <DataLineageDrawer data={i.lineage} />
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: i.tone,
                    textAlign: "right",
                  }}
                >
                  {i.conf}%
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${COLORS.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.muted, letterSpacing: "0.12em" }}>
              NEXT CYCLE IN <span style={{ color: COLORS.cyan, marginLeft: 4 }}>{cdStr}</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8, color: COLORS.muted, letterSpacing: "0.1em" }}>
              POWERED BY PROPHET + ISOLATION FOREST
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================ subcomponents

type DetailRow = { label: string; value: string; pct: number; color: string };
type DetailPill = { dot: string; text: string };

function DataRow({ row }: { row: DetailRow }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr 70px",
        alignItems: "center",
        gap: 8,
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      <span style={{ color: COLORS.muted, letterSpacing: "0.06em" }}>{row.label}</span>
      <div style={{ height: 3, background: "#1e2d1e", position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${Math.max(0, Math.min(100, row.pct))}%`,
            background: row.color,
            boxShadow: `0 0 6px ${row.color}80`,
          }}
        />
      </div>
      <span style={{ color: row.color, textAlign: "right", fontWeight: 600 }}>{row.value}</span>
    </div>
  );
}

function PillRow({ pills }: { pills: DetailPill[] }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      {pills.map((p) => (
        <span
          key={p.text}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 6px",
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            fontFamily: MONO,
            fontSize: 8,
            color: COLORS.muted,
            letterSpacing: "0.08em",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: p.dot,
              boxShadow: `0 0 4px ${p.dot}`,
            }}
          />
          {p.text}
        </span>
      ))}
    </div>
  );
}

function MetricPanel({
  title,
  tag,
  value,
  valueColor,
  subtitle,
  subtitleColor,
  trend,
  trendColor,
  footer,
  footerColor,
  rows,
  pills,
  extra,
  lineage,
}: {
  title: string;
  tag: string;
  value: string;
  valueColor: string;
  subtitle: string;
  subtitleColor: string;
  trend: { x: number; y: number }[];
  trendColor: string;
  footer?: string;
  footerColor?: string;
  rows?: DetailRow[];
  pills?: DetailPill[];
  extra?: React.ReactNode;
  lineage?: LineageData;
}) {
  const mean = trend.reduce((s, d) => s + d.y, 0) / trend.length;
  return (
    <Panel>
      <PanelHeader title={title} tag={tag} lineage={lineage} />
      <div
        style={{
          fontFamily: MONO,
          fontSize: 38,
          color: valueColor,
          lineHeight: 1,
          fontWeight: 600,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: subtitleColor,
          letterSpacing: "0.12em",
          marginTop: 4,
          marginBottom: 6,
        }}
      >
        {subtitle}
      </div>
      <div style={{ height: 48, flex: "0 0 48px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <ReferenceLine
              y={mean}
              stroke="#1e2d1e"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke={trendColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {rows && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {rows.map((r) => (
            <DataRow key={r.label} row={r} />
          ))}
        </div>
      )}

      {pills && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
          <PillRow pills={pills} />
        </div>
      )}

      {extra}

      {footer && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: footerColor,
            letterSpacing: "0.1em",
            marginTop: 4,
          }}
        >
          {footer}
        </div>
      )}
    </Panel>
  );
}

function RadialArc({ value, color }: { value: number; color: string }) {
  const size = 110;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // 270 deg sweep, starting at 135deg
  const start = 135;
  const end = 135 + 270;
  const valEnd = start + (270 * value) / 100;
  const polar = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const arc = (a1: number, a2: number) => {
    const [x1, y1] = polar(a1);
    const [x2, y2] = polar(a2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <svg width={size} height={size}>
      <path d={arc(start, end)} stroke={COLORS.border} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      <path
        d={arc(start, valEnd)}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={18}
        fill={color}
        fontWeight={600}
      >
        {value}%
      </text>
    </svg>
  );
}
