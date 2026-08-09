import * as React from "react";

// ============================================================================
// SHARED RAPHAEL DESIGN TOKENS & PRIMITIVES
// ============================================================================

export const C = {
  bg: "#0a0f0a",
  surface: "#0d150d",
  surfaceAlt: "#111a11",
  border: "#1e2d1e",
  borderHi: "#2a3d2a",
  hover: "#152015",
  rowHover: "#1a2d1a",
  olive: "#4a7c59",
  oliveDim: "#3a6347",
  text: "#e2e8f0",
  cream: "#c8b89a",
  muted: "#64748b",
  amber: "#f59e0b",
  red: "#ef4444",
  green: "#10b981",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  yellow: "#eab308",
  orange: "#fb923c",
};

export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const SANS = "'Inter', system-ui, sans-serif";

export const SEV: Record<string, string> = {
  critical: C.red,
  high: C.amber,
  moderate: C.yellow,
  low: C.olive,
  nominal: C.muted,
  info: C.blue,
  warning: C.amber,
};

export function Panel({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: `1px solid ${C.border}`,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.muted,
            fontWeight: 600,
          }}
        >
          [ {title} ]
        </span>
        {sub && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              color: C.muted,
              opacity: 0.7,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </span>
        )}
      </div>
      {right && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: C.muted,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

export function Pill({
  children,
  color = C.muted,
  filled = false,
}: {
  children: React.ReactNode;
  color?: string;
  filled?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        border: `1px solid ${color}55`,
        background: filled ? `${color}22` : C.bg,
        color,
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        borderRadius: 2,
      }}
    >
      {children}
    </span>
  );
}

export function MiniBar({
  pct,
  color,
  height = 3,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height,
        background: C.border,
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: "100%",
          background: color,
        }}
      />
    </div>
  );
}

export function TodoTag({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 8,
        color: C.muted,
        opacity: 0.5,
        padding: "4px 8px",
        letterSpacing: "0.05em",
      }}
    >
      // {children}
    </div>
  );
}

export function MockBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        border: `1px solid ${C.amber}55`,
        background: `${C.amber}11`,
        color: C.amber,
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        borderRadius: 2,
        fontWeight: 600,
        lineHeight: 1,
        verticalAlign: "middle",
      }}
    >
      MOCK DATA
    </span>
  );
}

export function MockBanner({ message = "Currently displaying mock values." }: { message?: string }) {
  return (
    <div
      style={{
        marginBottom: 10,
        padding: "8px 12px",
        background: "rgba(245, 158, 11, 0.04)",
        border: `1px solid ${C.amber}33`,
        borderRadius: 4,
        fontFamily: MONO,
        fontSize: 10,
        color: C.amber,
        letterSpacing: "0.05em",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>MOCK DATA ACTIVE: {message}</span>
      <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 700, textTransform: "uppercase" }}>SOURCE: MOCK</span>
    </div>
  );
}
export function EmptyState({ regionName }: { regionName?: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        padding: 40,
        height: "100%",
        width: "100%",
        background: C.bg,
      }}
    >
      <Panel style={{ maxWidth: 500, padding: 24, textAlign: "center", borderLeft: `3px solid ${C.amber}` }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.amber, marginBottom: 12, fontWeight: 700 }}>
          [ NO OBSERVATION ZONES DEFINED ]
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.text, lineHeight: 1.6, marginBottom: 16 }}>
          The active region <strong>{regionName || "Selected Region"}</strong> does not have any observation zones configured in the database yet.
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>
          To populate zones, run the database seed script:
          <div style={{ background: C.surfaceAlt, padding: 8, marginTop: 8, borderRadius: 2, border: `1px solid ${C.border}`, color: C.olive, textAlign: "left" }}>
            python scripts/seed.py --fresh
          </div>
        </div>
      </Panel>
    </div>
  );
}
