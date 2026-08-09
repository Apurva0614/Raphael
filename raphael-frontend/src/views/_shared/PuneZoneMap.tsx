import * as React from "react";
import { C, MONO } from "./raphael-ui";

// Shared Pune zone polygon map for GEOINT panels.
// Approximate geographic layout in a 600x420 SVG viewBox.

export type ZoneKey = "hadapsar" | "puneNE" | "katraj" | "shivaji" | "kothrud" | "aundh";

export type ZoneThreat = "critical" | "high" | "moderate" | "low" | "nominal";

const FILL: Record<ZoneThreat, string> = {
  critical: "rgba(239,68,68,0.15)",
  high: "rgba(245,158,11,0.12)",
  moderate: "rgba(234,179,8,0.08)",
  low: "rgba(74,124,89,0.06)",
  nominal: "rgba(74,124,89,0.06)",
};
const STROKE: Record<ZoneThreat, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  moderate: "#eab308",
  low: "#4a7c59",
  nominal: "#4a7c59",
};

export type ZoneDef = {
  key: ZoneKey;
  name: string;
  short: string;
  path: string;
  centroid: [number, number];
  risk?: number;
  threat: ZoneThreat;
  deltaPct?: number; // 30d intensity change
};

export const PUNE_ZONES: ZoneDef[] = [
  {
    key: "aundh",
    name: "Aundh",
    short: "AUN",
    path: "M40,40 L160,30 L200,80 L150,130 L60,120 Z",
    centroid: [115, 75],
    risk: 1.8,
    threat: "nominal",
    deltaPct: -12,
  },
  {
    key: "puneNE",
    name: "Pune NE",
    short: "PNE",
    path: "M340,30 L560,40 L570,150 L460,170 L350,140 Z",
    centroid: [455, 95],
    risk: 7.8,
    threat: "high",
    deltaPct: 12,
  },
  {
    key: "shivaji",
    name: "Shivajinagar",
    short: "SHI",
    path: "M210,150 L340,140 L350,230 L240,250 L190,200 Z",
    centroid: [275, 195],
    risk: 4.3,
    threat: "moderate",
    deltaPct: 2,
  },
  {
    key: "kothrud",
    name: "Kothrud",
    short: "KOT",
    path: "M40,180 L190,200 L210,290 L130,330 L40,290 Z",
    centroid: [115, 250],
    risk: 2.3,
    threat: "low",
    deltaPct: -8,
  },
  {
    key: "katraj",
    name: "Katraj",
    short: "KAT",
    path: "M220,290 L380,280 L400,380 L260,390 L210,340 Z",
    centroid: [305, 335],
    risk: 5.1,
    threat: "moderate",
    deltaPct: 2,
  },
  {
    key: "hadapsar",
    name: "Hadapsar",
    short: "HAD",
    path: "M400,200 L570,190 L575,350 L420,370 L380,290 Z",
    centroid: [475, 280],
    risk: 9.2,
    threat: "critical",
    deltaPct: 18,
  },
];

// Single source of truth for zone polygon geometry, keyed by zone id.
// All three GEOINT panels (Risk Intel, Analytics, Compare) consume this via
// the shared <PuneZoneMap/> — update polygon shapes / label anchors HERE only.
//
// TODO Antigravity: zonePolygons should be computed from real zone boundary
// geometry (GeoJSON from /api/v1/zones) projected to SVG canvas coordinates —
// see d3.geoPath()/d3.geoMercator() for projecting lat/lon boundary rings to
// screen-space SVG paths. This replaces hardcoded hexagon shapes with real
// ward/district boundaries for any region.
export const zonePolygons: Record<ZoneKey, { path: string; labelPos: [number, number] }> =
  PUNE_ZONES.reduce(
    (acc, z) => {
      acc[z.key] = { path: z.path, labelPos: z.centroid };
      return acc;
    },
    {} as Record<ZoneKey, { path: string; labelPos: [number, number] }>,
  );

// Risk-driven visual weight: critical zones pop, nominal zones recede.
function riskWeight(risk?: number): { fillOpacity: number; strokeWidth: number } {
  const r = risk ?? 0;
  if (r >= 8) return { fillOpacity: 0.22, strokeWidth: 2 };
  if (r >= 5) return { fillOpacity: 0.14, strokeWidth: 1.5 };
  return { fillOpacity: 0.07, strokeWidth: 1 };
}

// Risk-driven typography for the numeric value inside each polygon.
function riskTypography(risk?: number): {
  fontSize: number;
  fontWeight: number;
  glow: string | undefined;
} {
  const r = risk ?? 0;
  if (r >= 8) return { fontSize: 16, fontWeight: 700, glow: "0 0 6px rgba(239,68,68,0.7)" };
  if (r >= 5) return { fontSize: 14, fontWeight: 700, glow: "0 0 5px rgba(245,158,11,0.6)" };
  return { fontSize: 12, fontWeight: 400, glow: undefined };
}

export type Infra = { x: number; y: number; label: string };

type Overlay =
  | { kind: "wind"; from: [number, number]; to: [number, number]; arrows?: number }
  | { kind: "plume"; from: [number, number]; to: [number, number]; color?: string }
  | {
      kind: "gaussianPlume";
      from: [number, number];
      to: [number, number];
      // Parametric Gaussian plume — sigmaY (km crosswind) at successive
      // distance bands, plus centerline concentration (μg/m³).
      sigmaY: number[];
      centerlineConc: number[];
      // Optional: extend the plume past `to` by this fraction (downwind tail).
      tailScale?: number;
      color?: string;
    }
  | { kind: "highway"; points: Array<[number, number]>; label?: string }
  | { kind: "infra"; items: Infra[] }
  | { kind: "trail"; points: Array<[number, number]>; labels?: string[] }
  | { kind: "connector"; a: [number, number]; b: [number, number]; label?: string };

export function PuneZoneMap({
  height = 280,
  highlight,
  overlays = [],
  showRisk = true,
  showDelta = false,
}: {
  height?: number;
  highlight?: ZoneKey[];
  overlays?: Overlay[];
  showRisk?: boolean;
  showDelta?: boolean;
}) {
  const gradId = React.useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 600 420"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height, background: C.bg, display: "block" }}
    >
      <defs>
        <pattern id={`grid-${gradId}`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e2d1e" strokeWidth="0.5" />
        </pattern>
        <radialGradient id={`plume-${gradId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(239,68,68,0.45)" />
          <stop offset="60%" stopColor="rgba(239,68,68,0.12)" />
          <stop offset="100%" stopColor="rgba(239,68,68,0)" />
        </radialGradient>
        <marker
          id={`arrow-${gradId}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
        </marker>
        <marker
          id={`arrowMuted-${gradId}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.muted} />
        </marker>
      </defs>

      <rect width="600" height="420" fill={`url(#grid-${gradId})`} opacity="0.6" />

      {/* compass */}
      <g transform="translate(548,368)" fontFamily={MONO} fill={C.muted}>
        <circle r="28" fill="rgba(10,15,10,0.55)" stroke={C.border} strokeWidth="1" />
        <circle r="28" fill="none" stroke={C.olive} strokeOpacity="0.35" strokeWidth="0.5" />
        <line x1="0" y1="-22" x2="0" y2="22" stroke={C.border} strokeWidth="0.5" />
        <line x1="-22" y1="0" x2="22" y2="0" stroke={C.border} strokeWidth="0.5" />
        <path d="M 0,-20 L 5,4 L 0,-3 L -5,4 Z" fill={C.olive} />
        <text
          textAnchor="middle"
          y="-30"
          fontSize="11"
          fontWeight={700}
          fill={C.cream}
          letterSpacing="0.15em"
        >
          N
        </text>
      </g>


      {/* Plume — render before zones so zones overlay it but plume softly shows */}
      {overlays
        .filter((o) => o.kind === "plume")
        .map((o, i) => {
          if (o.kind !== "plume") return null;
          const [fx, fy] = o.from;
          const [tx, ty] = o.to;
          const cx = (fx + tx) / 2;
          const cy = (fy + ty) / 2;
          const dx = tx - fx;
          const dy = ty - fy;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <g key={`plume-${i}`} transform={`translate(${cx},${cy}) rotate(${angle})`}>
              <ellipse cx="0" cy="0" rx={len * 0.7} ry={len * 0.28} fill={`url(#plume-${gradId})`} />
            </g>
          );
        })}

      {/* Gaussian plume — parametric tapered shape from sigmaY + centerline conc */}
      {overlays
        .filter((o) => o.kind === "gaussianPlume")
        .map((o, i) => {
          if (o.kind !== "gaussianPlume") return null;
          const [fx, fy] = o.from;
          const [tx, ty] = o.to;
          const dx = tx - fx;
          const dy = ty - fy;
          const baseLen = Math.sqrt(dx * dx + dy * dy) || 1;
          const tailScale = o.tailScale ?? 1.0;
          // Extend axis by tailScale so the plume tapers past the impact zone.
          const ex = fx + dx * tailScale;
          const ey = fy + dy * tailScale;
          const len = baseLen * tailScale;
          // Unit along-axis and perpendicular
          const ux = (ex - fx) / len;
          const uy = (ey - fy) / len;
          const px = -uy;
          const py = ux;

          const N = o.sigmaY.length;
          // Scale sigmaY (km) to SVG units. Choose so the widest band is
          // about 35% of the source→target distance — keeps the plume
          // legible without swallowing the map.
          const maxSigma = Math.max(...o.sigmaY);
          const widthScale = (baseLen * 0.35) / Math.max(maxSigma, 0.1);
          const peakConc = Math.max(...o.centerlineConc);
          const baseColor = o.color ?? "239,68,68"; // red

          const samples = o.sigmaY.map((sy, k) => {
            const t = k / (N - 1);
            const cx = fx + (ex - fx) * t;
            const cy = fy + (ey - fy) * t;
            const half = sy * widthScale;
            return {
              cx,
              cy,
              up: [cx + px * half, cy + py * half] as [number, number],
              lo: [cx - px * half, cy - py * half] as [number, number],
              conc: o.centerlineConc[k],
              t,
            };
          });

          // Build a smoothed polygon: upper edge forward then lower edge back.
          const upper = samples.map((s) => s.up);
          const lower = [...samples].reverse().map((s) => s.lo);
          const all = [...upper, ...lower];
          const pathParts: string[] = [`M ${all[0][0].toFixed(1)} ${all[0][1].toFixed(1)}`];
          for (let k = 1; k < all.length; k++) {
            const prev = all[k - 1];
            const curr = all[k];
            const mx = (prev[0] + curr[0]) / 2;
            const my = (prev[1] + curr[1]) / 2;
            pathParts.push(`Q ${prev[0].toFixed(1)} ${prev[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`);
          }
          pathParts.push("Z");
          const polyPath = pathParts.join(" ");

          // Per-band gradient along the axis driven by concentration.
          const gradAngle = (Math.atan2(ey - fy, ex - fx) * 180) / Math.PI;
          const localGradId = `gplume-${gradId}-${i}`;
          // Concentration-driven contour fractions (75/50/25% of peak).
          const contourTargets = [0.75, 0.5, 0.25];
          // Find axis fraction t where centerline conc crosses each target.
          const findT = (target: number) => {
            const goal = peakConc * target;
            for (let k = 0; k < N - 1; k++) {
              const a = o.centerlineConc[k];
              const b = o.centerlineConc[k + 1];
              if ((a >= goal && b <= goal) || (a <= goal && b >= goal)) {
                const f = (a - goal) / (a - b || 1);
                return (k + f) / (N - 1);
              }
            }
            return null;
          };

          return (
            <g key={`gplume-${i}`}>
              <defs>
                <linearGradient
                  id={localGradId}
                  gradientUnits="userSpaceOnUse"
                  x1={fx}
                  y1={fy}
                  x2={ex}
                  y2={ey}
                  gradientTransform={`rotate(${gradAngle - gradAngle})`}
                >
                  {samples.map((s, k) => (
                    <stop
                      key={k}
                      offset={`${(s.t * 100).toFixed(1)}%`}
                      stopColor={`rgba(${baseColor},${(0.05 + (s.conc / peakConc) * 0.45).toFixed(3)})`}
                    />
                  ))}
                  <stop offset="100%" stopColor={`rgba(${baseColor},0)`} />
                </linearGradient>
              </defs>
              <path
                d={polyPath}
                fill={`url(#${localGradId})`}
                stroke={`rgba(${baseColor},0.35)`}
                strokeWidth="0.6"
              />
              {/* Contour cross-bars at 75/50/25% concentration */}
              {contourTargets.map((target, ci) => {
                const tt = findT(target);
                if (tt == null) return null;
                const cx = fx + (ex - fx) * tt;
                const cy = fy + (ey - fy) * tt;
                // Interpolate width at tt
                const seg = tt * (N - 1);
                const lo = Math.floor(seg);
                const hi = Math.min(N - 1, lo + 1);
                const f = seg - lo;
                const sy = o.sigmaY[lo] * (1 - f) + o.sigmaY[hi] * f;
                const half = sy * widthScale;
                const x1 = cx + px * half;
                const y1 = cy + py * half;
                const x2 = cx - px * half;
                const y2 = cy - py * half;
                const isAmber = target >= 0.5;
                return (
                  <g key={`contour-${ci}`}>
                    <path
                      d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                      fill="none"
                      stroke={isAmber ? "#f59e0b" : "#4a7c59"}
                      strokeOpacity={0.55}
                      strokeWidth="0.7"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={x2 + (px > 0 ? -4 : 4)}
                      y={y2 - 2}
                      fontFamily={MONO}
                      fontSize="6"
                      fill={isAmber ? "#f59e0b" : "#4a7c59"}
                      opacity={0.85}
                      textAnchor={px > 0 ? "end" : "start"}
                    >
                      {Math.round(target * 100)}%
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}



      {/* Zone polygons */}
      {PUNE_ZONES.map((z) => {
        const isHi = !highlight || highlight.includes(z.key);
        const opacity = isHi ? 1 : 0.35;
        const w = riskWeight(z.risk);
        const typo = riskTypography(z.risk);
        const baseFill = STROKE[z.threat]; // use stroke color as fill base for opacity scaling
        return (
          <g key={z.key} opacity={opacity}>
            <path
              d={z.path}
              fill={baseFill}
              fillOpacity={w.fillOpacity}
              stroke={STROKE[z.threat]}
              strokeWidth={isHi ? w.strokeWidth : Math.max(0.6, w.strokeWidth * 0.5)}
            />
            <text
              x={z.centroid[0]}
              y={z.centroid[1]}
              textAnchor="middle"
              fontFamily={MONO}
              fontSize="9"
              fill={C.cream}
              letterSpacing="0.1em"
              style={{ textTransform: "uppercase" }}
            >
              {z.name}
            </text>
            {showRisk && z.risk !== undefined && (
              <text
                x={z.centroid[0]}
                y={z.centroid[1] + 14}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize={typo.fontSize}
                fill={STROKE[z.threat]}
                fontWeight={typo.fontWeight}
                style={typo.glow ? { filter: `drop-shadow(${typo.glow})` } : undefined}
              >
                {z.risk.toFixed(1)}
              </text>
            )}
            {showDelta && z.deltaPct !== undefined && (
              <text
                x={z.centroid[0]}
                y={z.centroid[1] + 26}
                textAnchor="middle"
                fontFamily={MONO}
                fontSize="8"
                fill={z.deltaPct > 5 ? C.red : z.deltaPct < -5 ? C.olive : C.muted}
                fontWeight={700}
              >
                {z.deltaPct > 0 ? "↑ +" : z.deltaPct < 0 ? "↓ " : "→ "}
                {z.deltaPct}%
              </text>
            )}
          </g>
        );
      })}


      {/* Highway */}
      {overlays
        .filter((o) => o.kind === "highway")
        .map((o, i) => {
          if (o.kind !== "highway") return null;
          const d = o.points.map((p, j) => `${j === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
          const mid = o.points[Math.floor(o.points.length / 2)];
          return (
            <g key={`hwy-${i}`}>
              <path d={d} fill="none" stroke={C.muted} strokeWidth="1.5" strokeDasharray="8 4" opacity="0.75" />
              {o.label && (
                <text
                  x={mid[0]}
                  y={mid[1] - 6}
                  fontFamily={MONO}
                  fontSize="7"
                  fill={C.muted}
                  letterSpacing="0.1em"
                  textAnchor="middle"
                >
                  {o.label}
                </text>
              )}
            </g>
          );
        })}

      {/* Wind arrows */}
      {overlays
        .filter((o) => o.kind === "wind")
        .map((o, i) => {
          if (o.kind !== "wind") return null;
          const [fx, fy] = o.from;
          const [tx, ty] = o.to;
          const n = o.arrows ?? 3;
          const arrows = [];
          for (let k = 0; k < n; k++) {
            const offset = (k - (n - 1) / 2) * 18;
            // perpendicular offset
            const dx = tx - fx;
            const dy = ty - fy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const px = -dy / len;
            const py = dx / len;
            const x1 = fx + px * offset;
            const y1 = fy + py * offset;
            const x2 = tx + px * offset;
            const y2 = ty + py * offset;
            arrows.push(
              <line
                key={k}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                markerEnd={`url(#arrow-${gradId})`}
                opacity={0.85}
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.2s" repeatCount="indefinite" />
              </line>,
            );
          }
          return <g key={`wind-${i}`}>{arrows}</g>;
        })}

      {/* Infra */}
      {overlays
        .filter((o) => o.kind === "infra")
        .map((o, i) => {
          if (o.kind !== "infra") return null;
          return (
            <g key={`infra-${i}`}>
              {o.items.map((it, j) => (
                <g key={j} transform={`translate(${it.x},${it.y})`}>
                  <rect x="-4" y="-4" width="8" height="8" fill={C.cream} opacity="0.85" />
                  <rect x="-3" y="-3" width="6" height="6" fill={C.bg} />
                  <text
                    x="8"
                    y="3"
                    fontFamily={MONO}
                    fontSize="7"
                    fill={C.cream}
                    letterSpacing="0.08em"
                  >
                    {it.label}
                  </text>
                </g>
              ))}
            </g>
          );
        })}

      {/* Migration trail */}
      {overlays
        .filter((o) => o.kind === "trail")
        .map((o, i) => {
          if (o.kind !== "trail") return null;
          const d = o.points.map((p, j) => `${j === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
          return (
            <g key={`trail-${i}`}>
              <path d={d} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.55" />
              {o.points.map((p, j) => {
                const isLast = j === o.points.length - 1;
                const r = 3 + (j / o.points.length) * 4;
                return (
                  <g key={j}>
                    <circle
                      cx={p[0]}
                      cy={p[1]}
                      r={r}
                      fill={isLast ? "#f59e0b" : C.muted}
                      stroke={isLast ? "#f59e0b" : "transparent"}
                      opacity={isLast ? 1 : 0.45 + (j / o.points.length) * 0.5}
                    />
                    {o.labels?.[j] && (
                      <text
                        x={p[0]}
                        y={p[1] - r - 4}
                        fontFamily={MONO}
                        fontSize="7"
                        fill={isLast ? "#f59e0b" : C.muted}
                        textAnchor="middle"
                        fontWeight={isLast ? 700 : 400}
                      >
                        {o.labels[j]}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

      {/* Connector line between two zones */}
      {overlays
        .filter((o) => o.kind === "connector")
        .map((o, i) => {
          if (o.kind !== "connector") return null;
          const [ax, ay] = o.a;
          const [bx, by] = o.b;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          return (
            <g key={`con-${i}`}>
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke={C.muted}
                strokeWidth="1.2"
                strokeDasharray="5 4"
                markerEnd={`url(#arrowMuted-${gradId})`}
              />
              <circle cx={ax} cy={ay} r="3" fill={C.amber} />
              <circle cx={bx} cy={by} r="3" fill={C.red} />
              {o.label && (
                <text
                  x={mx}
                  y={my - 6}
                  fontFamily={MONO}
                  fontSize="8"
                  fill={C.cream}
                  textAnchor="middle"
                  letterSpacing="0.1em"
                >
                  {o.label}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}

// Convenience: get centroid of a zone by key
export function zoneCentroid(key: ZoneKey): [number, number] {
  const z = PUNE_ZONES.find((z) => z.key === key)!;
  return z.centroid;
}
