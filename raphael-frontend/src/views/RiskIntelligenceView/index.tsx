import * as React from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { C, MONO, SANS, SEV, Panel, PanelHeader, Pill, MiniBar, MockBanner, EmptyState } from "../_shared/raphael-ui";
import { PuneZoneMap, zoneCentroid } from "../_shared/PuneZoneMap";
import { zoneBearing, zoneDistance, formatBearing, formatDistanceKm } from "@/utils/geospatial";
import { DataLineageDrawer, LINEAGE } from "@/components/DataLineageDrawer";
import { useActiveRegion, useZones, fetchWithAuth } from "@/hooks/useZones";
import { useQuery } from "@tanstack/react-query";

const STATIC_ZONES = [
  { name: "Hadapsar Industrial", risk: 9.2, threat: "critical", stressor: "Industrial Emissions", pop: 284000, aqi: 187, lst: 41.2, ndvi: 0.18, delta: 0.4 },
  { name: "Pune NE Quadrant", risk: 7.8, threat: "high", threat_level: "high", stressor: "Heat Island + AQ", pop: 412000, aqi: 142, lst: 38.4, ndvi: 0.34, delta: 0.2 },
  { name: "Katraj Hills", risk: 5.1, threat: "moderate", threat_level: "moderate", stressor: "Traffic Emissions", pop: 156000, aqi: 98, lst: 35.1, ndvi: 0.61, delta: 0.0 },
  { name: "Shivajinagar", risk: 4.3, threat: "moderate", threat_level: "moderate", stressor: "Mixed Urban", pop: 203000, aqi: 89, lst: 34.8, ndvi: 0.44, delta: -0.1 },
  { name: "Kothrud Residential", risk: 2.3, threat: "low", threat_level: "low", stressor: "Seasonal Dust", pop: 318000, aqi: 64, lst: 32.2, ndvi: 0.52, delta: -0.3 },
  { name: "Aundh", risk: 1.8, threat: "nominal", threat_level: "nominal", stressor: "—", pop: 189000, aqi: 51, lst: 31.4, ndvi: 0.58, delta: -0.2 },
];

const THREAT_BLOCK: Record<string, string> = {
  critical: "██",
  high: "▓▓",
  moderate: "▒▒",
  low: "░░",
  nominal: "░░",
};

// TODO Antigravity: GET /api/v1/system/insights?region_id=pune (stressor attribution)
const ATTRIBUTION = [
  { name: "Industrial Emissions", value: 31, color: C.red },
  { name: "Vehicular Traffic", value: 27, color: C.amber },
  { name: "Biomass Burning", value: 18, color: C.yellow },
  { name: "Urban Heat Islands", value: 14, color: C.olive },
  { name: "Meteorological", value: 10, color: C.violet },
];

// TODO Antigravity: GET /api/v1/layers/weather/current
const ATMO = [
  { l: "WIND SPEED", v: "12 km/h NE", i: "affects dispersion", color: C.text },
  { l: "HUMIDITY", v: "62%", i: "affects PM formation", color: C.text },
  { l: "MIXING HEIGHT", v: "820m", i: "LOW — trapping pollutants", color: C.amber, highlight: true },
  { l: "UV INDEX", v: "6 HIGH", i: "affects ozone formation", color: C.text },
];

// TODO Antigravity: GET /api/v1/zones?region_id=pune (current + 30d + forecast)
const RADAR = [
  { axis: "HADAPSAR", current: 9.2, baseline: 8.8, forecast: 9.5 },
  { axis: "PUNE NE", current: 7.8, baseline: 7.6, forecast: 8.4 },
  { axis: "KATRAJ", current: 5.1, baseline: 5.1, forecast: 5.0 },
  { axis: "SHIVAJI", current: 4.3, baseline: 4.4, forecast: 4.2 },
  { axis: "KOTHRUD", current: 2.3, baseline: 2.6, forecast: 2.1 },
  { axis: "AUNDH", current: 1.8, baseline: 2.0, forecast: 1.7 },
];

// TODO Antigravity: GET /api/v1/layers/aq/forecast?zone_id=x&hours=48
// + /api/v1/layers/aq/history?hours_back=24
function buildPM25(): Array<{ t: string; idx: number; hist?: number; fc?: number; up?: number; lo?: number }> {
  const arr: any[] = [];
  for (let i = -24; i <= 48; i++) {
    const t = i < 0 ? `${i}H` : `T+${i}H`;
    const base = 80 + Math.sin(i / 6) * 35 + (i > 0 ? i * 1.6 : 0);
    if (i <= 0) arr.push({ t, idx: i, hist: Math.max(20, base + (Math.random() - 0.5) * 12) });
    else {
      const fc = Math.max(20, base + (Math.random() - 0.5) * 8);
      arr.push({ t, idx: i, fc, up: fc + 18 + i * 0.4, lo: Math.max(10, fc - 18 - i * 0.3) });
    }
  }
  return arr;
}
const PM25 = buildPM25();

// TODO Antigravity: GET /api/v1/layers/lst/forecast?zone_id=x&hours=72
function buildLST(): Array<any> {
  const arr: any[] = [];
  for (let i = -24; i <= 72; i++) {
    const hourOfDay = ((i % 24) + 24) % 24;
    const diurnal = 33 + Math.sin(((hourOfDay - 8) / 24) * Math.PI * 2) * 9;
    const t = i < 0 ? `${i}H` : `T+${i}H`;
    if (i <= 0) arr.push({ t, idx: i, hist: diurnal + (Math.random() - 0.5) * 1.5 });
    else {
      const fc = diurnal + (Math.random() - 0.5) * 1.2;
      arr.push({ t, idx: i, fc, up: fc + 2.5, lo: fc - 2.5 });
    }
  }
  return arr;
}
const LST = buildLST();

// TODO Antigravity: Replace plumeMockData with response from
// POST /api/v1/risk/plume-dispersion
// { source_zone_id, wind_speed, wind_bearing, stability_class }
// Backend computes stability class from Open-Meteo solar radiation + wind speed,
// then Gaussian plume equation for sigmaY/sigmaZ/concentration at each distance band.
const plumeMockData = {
  stabilityClass: "C" as const,
  stabilityLabel: "Slightly Unstable",
  sigmaY: [0.8, 1.6, 2.4, 3.1, 3.8],
  sigmaZ: [0.5, 0.9, 1.3, 1.7, 2.0],
  distances: [1, 2, 3, 4, 5],
  centerlineConc: [142, 118, 89, 67, 51],
};

const STABILITY_CLASSES: Array<{ k: "A" | "B" | "C" | "D" | "E" | "F"; label: string; color: string }> = [
  { k: "A", label: "VERY UNSTABLE", color: "#ef4444" },
  { k: "B", label: "UNSTABLE", color: "#ef4444" },
  { k: "C", label: "SLIGHTLY UNSTABLE", color: "#f59e0b" },
  { k: "D", label: "NEUTRAL", color: "#f59e0b" },
  { k: "E", label: "STABLE", color: "#3b82f6" },
  { k: "F", label: "VERY STABLE", color: "#3b82f6" },
];
function stabilityColor(k: string): string {
  return STABILITY_CLASSES.find((s) => s.k === k)?.color ?? "#f59e0b";
}


export default function RiskIntelligenceView() {
  const { data: activeRegion, isLoading: isActiveRegionLoading } = useActiveRegion();
  const { data: zones = [], isLoading: isZonesLoading } = useZones(activeRegion?.id);
  const isLoading = isActiveRegionLoading || isZonesLoading;
  const [selected, setSelected] = React.useState(0);

  const { data: propagationData } = useQuery({
    queryKey: ["riskPropagation"],
    queryFn: () => fetchWithAuth("/api/v1/risk/propagation"),
  });

  const plumeData = React.useMemo(() => {
    const apiData = propagationData?.data;
    if (!apiData) {
      return plumeMockData;
    }

    const profiles = apiData.profiles || [];
    const sigmaY = profiles.map((p: any) => p.sigma_y ?? 0);
    const sigmaZ = profiles.map((p: any) => p.sigma_z ?? 0);
    const distances = profiles.map((p: any) => p.distance_km ?? 0);
    const centerlineConc = profiles.map((p: any) => p.peak_concentration ?? 0);

    return {
      stabilityClass: (apiData.stability_class ?? "C") as any,
      stabilityLabel: apiData.stability_label ?? "Slightly Unstable",
      sigmaY: sigmaY.length > 0 ? sigmaY : plumeMockData.sigmaY,
      sigmaZ: sigmaZ.length > 0 ? sigmaZ : plumeMockData.sigmaZ,
      distances: distances.length > 0 ? distances : plumeMockData.distances,
      centerlineConc: centerlineConc.length > 0 ? centerlineConc : plumeMockData.centerlineConc,
    };
  }, [propagationData]);

  const ZONES = React.useMemo(() => {
    const list = zones.length > 0 ? zones : STATIC_ZONES;
    return list.map((z: any) => ({
      ...z,
      name: z.name,
      risk: z.risk,
      threat: z.severity || z.threat || "nominal",
      stressor: z.classification || z.stressor || "Mixed Urban",
      pop: z.data_source === "mock" && z.properties?.pop ? z.properties.pop : (typeof z.pop === "number" ? z.pop : "—"),
      delta: z.data_source === "mock" && z.properties?.delta !== undefined ? z.properties.delta : (typeof z.delta === "number" ? z.delta : "—"),
      aqi: z.aqi,
      lst: z.lst,
      ndvi: z.ndvi,
    }));
  }, [zones]);

  const zone = ZONES[selected] || ZONES[0];

  const totalPop = React.useMemo(() => {
    const validPops = ZONES.map(z => typeof z.pop === 'number' ? z.pop : 0);
    const sum = validPops.reduce((a, b) => a + b, 0);
    return sum > 0 ? sum.toLocaleString() : "N/A";
  }, [ZONES]);

  const criticalCount = React.useMemo(() => {
    return ZONES.filter(z => z.threat === "critical").length;
  }, [ZONES]);

  const highCount = React.useMemo(() => {
    return ZONES.filter(z => z.threat === "high" || z.threat === "warning").length;
  }, [ZONES]);

  const isMock = zones.length > 0 && zones[0].data_source === "mock";

  if (!isLoading && zones.length === 0) {
    return <EmptyState regionName={activeRegion?.name} />;
  }

  return (
    <div className="raphael-scroll" style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}>
      {isMock && (
        <MockBanner message="Ingestion pipeline has not been executed for Pune. Currently displaying mock values." />
      )}
      {/* TOP ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "35% 30% 35%", gap: 10, marginBottom: 10 }}>
        {/* TOP LEFT — Zone Threat Assessment */}
        <Panel>
          <PanelHeader
            title="ZONE THREAT ASSESSMENT"
            right="SORTED BY COMPOSITE RISK INDEX · AUTO-REFRESH 5M"
          />
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: MONO,
                fontSize: 10,
              }}
            >
              <thead>
                <tr style={{ background: C.bg }}>
                  {["ZONE", "RISK", "THREAT", "STRESSOR", "POP", "AQI", "LST", "NDVI", "24H Δ"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 6px",
                        textAlign: "left",
                        color: C.muted,
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 9,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ZONES.map((z, i) => {
                  const active = i === selected;
                  return (
                    <tr
                      key={z.name}
                      onClick={() => setSelected(i)}
                      style={{
                        cursor: "pointer",
                        background: active ? `${C.olive}22` : "transparent",
                        borderLeft: active ? `2px solid ${C.olive}` : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = C.rowHover;
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <td style={{ padding: "6px", color: C.text, borderBottom: `1px solid ${C.border}` }}>
                        {z.name}
                      </td>
                      <td style={{ padding: "6px", color: SEV[z.threat], fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>
                        {z.risk.toFixed(1)}
                      </td>
                      <td style={{ padding: "6px", color: SEV[z.threat], borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ marginRight: 4 }}>{THREAT_BLOCK[z.threat]}</span>
                        {z.threat.toUpperCase()}
                      </td>
                      <td style={{ padding: "6px", color: C.cream, fontFamily: SANS, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>
                        {z.stressor}
                      </td>
                      <td style={{ padding: "6px", color: C.text, borderBottom: `1px solid ${C.border}` }}>
                        {typeof z.pop === "number" ? z.pop.toLocaleString() : z.pop}
                      </td>
                      <td style={{ padding: "6px", color: C.amber, borderBottom: `1px solid ${C.border}` }}>{z.aqi}</td>
                      <td style={{ padding: "6px", color: C.red, borderBottom: `1px solid ${C.border}` }}>{z.lst}°</td>
                      <td style={{ padding: "6px", color: C.olive, borderBottom: `1px solid ${C.border}` }}>{z.ndvi}</td>
                      <td
                        style={{
                          padding: "6px",
                          color: typeof z.delta === "number" ? (z.delta > 0 ? C.red : z.delta < 0 ? C.olive : C.muted) : C.muted,
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        {typeof z.delta === "number"
                          ? `${z.delta > 0 ? "↑" : z.delta < 0 ? "↓" : "→"} ${z.delta >= 0 ? "+" : ""}${z.delta.toFixed(1)}`
                          : z.delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            style={{
              padding: "8px 14px",
              borderTop: `1px solid ${C.border}`,
              fontFamily: MONO,
              fontSize: 9,
              color: C.muted,
              letterSpacing: "0.05em",
            }}
          >
            TOTAL POPULATION UNDER ELEVATED RISK:{" "}
            <span style={{ color: C.amber }}>{totalPop}</span> · CRITICAL ZONES:{" "}
            <span style={{ color: C.red }}>{criticalCount}</span> · HIGH ZONES:{" "}
            <span style={{ color: C.amber }}>{highCount}</span> · ZONE SCAN: 23M AGO
          </div>
        </Panel>

        {/* TOP CENTER — Stressor Attribution */}
        <Panel>
          <PanelHeader title="STRESSOR ATTRIBUTION MATRIX" />
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ position: "relative", height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ATTRIBUTION}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {ATTRIBUTION.map((a, i) => (
                      <Cell key={i} fill={a.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  pointerEvents: "none",
                  fontFamily: MONO,
                }}
              >
                <div style={{ fontSize: 18, color: C.text, fontWeight: 700 }}>82</div>
                <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.15em" }}>ANOMALY</div>
                <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.15em" }}>EVENTS</div>
              </div>
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              {ATTRIBUTION.map((a) => (
                <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 9 }}>
                  <span style={{ width: 8, height: 8, background: a.color }} />
                  <span style={{ flex: 1, color: C.text }}>{a.name}</span>
                  <span style={{ color: a.color, fontWeight: 700 }}>{a.value}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: 12 }}>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 9,
                color: C.muted,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              ATMOSPHERIC CONDITIONS
            </div>
            {ATMO.map((a) => (
              <div
                key={a.l}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "3px 0",
                  fontFamily: MONO,
                  fontSize: 9,
                  background: a.highlight ? `${C.amber}10` : "transparent",
                  paddingLeft: a.highlight ? 4 : 0,
                  borderLeft: a.highlight ? `2px solid ${C.amber}` : "2px solid transparent",
                }}
              >
                <span style={{ color: C.muted, width: 100 }}>{a.l}</span>
                <span style={{ color: C.muted }}>→</span>
                <span style={{ color: a.color, fontWeight: 700, width: 80 }}>{a.v}</span>
                <span style={{ color: C.muted, fontStyle: "italic", fontSize: 8, marginLeft: "auto" }}>
                  [{a.i}]
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* TOP RIGHT — Severity Radar */}
        <Panel>
          <PanelHeader title="MULTI-ZONE SEVERITY COMPARISON" right="CURRENT vs 30D BASELINE" />
          <div style={{ padding: 8 }}>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={RADAR}>
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis
                    dataKey="axis"
                    tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }}
                  />
                  <Radar dataKey="baseline" stroke={C.olive} fill={C.olive} fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 3" />
                  <Radar dataKey="forecast" stroke={C.amber} fill={C.amber} fillOpacity={0.08} strokeWidth={1} strokeDasharray="2 2" />
                  <Radar dataKey="current" stroke={C.red} fill={C.red} fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 10, padding: "0 8px 6px", flexWrap: "wrap" }}>
              {[
                { l: "CURRENT", c: C.red, s: "solid" },
                { l: "30D BASELINE", c: C.olive, s: "dashed" },
                { l: "7D FORECAST", c: C.amber, s: "dotted" },
              ].map((x) => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 8, color: C.muted }}>
                  <span style={{ width: 14, borderTop: `2px ${x.s} ${x.c}` }} />
                  {x.l}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              padding: "8px 14px",
              borderTop: `1px solid ${C.border}`,
              fontFamily: MONO,
              fontSize: 9,
              color: C.muted,
              lineHeight: 1.6,
            }}
          >
            WORST DEGRADATION: <span style={{ color: C.red }}>HADAPSAR +0.4</span> ·
            MOST IMPROVED: <span style={{ color: C.olive }}>KOTHRUD -0.3</span> ·
            FORECAST PEAK: <span style={{ color: C.amber }}>PUNE NE (T+18H)</span>
          </div>
        </Panel>
      </div>

      {/* THREAT VECTOR PROPAGATION */}
      {/* TODO Antigravity: Wind data from /api/v1/layers/weather/current
          Gaussian plume dispersion model: backend/ml/dispersion.py
          Infrastructure from OSM Overpass /api/v1/layers/urban/current
          GET /api/v1/risk/propagation?source_zone=x&wind_speed=12&wind_bearing=45 */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader
          title="THREAT VECTOR PROPAGATION ANALYSIS"
          right="WIND-DRIVEN DISPERSION MODEL · REAL-TIME"
        />
        <div style={{ display: "grid", gridTemplateColumns: "55% 45%", gap: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, padding: 8 }}>
            <PuneZoneMap
              height={340}
              overlays={[
                {
                  kind: "highway",
                  points: [
                    [475, 280],
                    [420, 200],
                    [380, 140],
                    [455, 95],
                  ],
                  label: "NH-9 TRAFFIC CORRIDOR",
                },
                {
                  kind: "gaussianPlume",
                  from: zoneCentroid("hadapsar"),
                  to: zoneCentroid("puneNE"),
                  sigmaY: plumeData.sigmaY,
                  centerlineConc: plumeData.centerlineConc,
                  tailScale: 1.15,
                },
                {
                  kind: "wind",
                  from: zoneCentroid("hadapsar"),
                  to: zoneCentroid("puneNE"),
                  arrows: 4,
                },
                {
                  kind: "infra",
                  items: [
                    { x: 480, y: 110, label: "KEM HOSPITAL" },
                    { x: 290, y: 210, label: "PUNE UNIVERSITY" },
                    { x: 250, y: 380, label: "KHADAKWASLA RES." },
                  ],
                },
              ]}
            />
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* ATMOSPHERIC STABILITY */}
            <div
              style={{
                border: `1px solid ${C.border}`,
                background: C.bg,
                padding: 10,
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  color: C.muted,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                ATMOSPHERIC STABILITY
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    padding: "6px 10px",
                    border: `1px solid ${stabilityColor(plumeData.stabilityClass)}`,
                    background: `${stabilityColor(plumeData.stabilityClass)}1A`,
                    color: stabilityColor(plumeData.stabilityClass),
                    fontFamily: MONO,
                    letterSpacing: "0.15em",
                    fontWeight: 700,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  CLASS {plumeData.stabilityClass}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      color: stabilityColor(plumeData.stabilityClass),
                      fontWeight: 700,
                    }}
                  >
                    {plumeData.stabilityLabel.toUpperCase()}
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {STABILITY_CLASSES.map((s) => {
                      const active = s.k === plumeData.stabilityClass;
                      return (
                        <div
                          key={s.k}
                          title={`${s.k} · ${s.label}`}
                          style={{
                            width: 16,
                            height: 16,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: `1px solid ${active ? s.color : C.border}`,
                            background: active ? `${s.color}33` : "transparent",
                            color: active ? s.color : C.muted,
                            fontFamily: MONO,
                            fontSize: 9,
                            fontWeight: 700,
                          }}
                        >
                          {s.k}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: MONO,
                  fontSize: 8,
                  color: C.muted,
                  letterSpacing: "0.05em",
                  fontStyle: "italic",
                }}
              >
                Derived from wind speed + solar radiation (Pasquill-Gifford method)
              </div>
            </div>

            <div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  color: C.muted,
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                [ DISPERSION ANALYSIS ]
              </div>
              <div
                style={{
                  borderLeft: `2px solid ${C.olive}`,
                  paddingLeft: 10,
                  fontFamily: MONO,
                  fontSize: 10,
                  lineHeight: 1.7,
                  color: C.text,
                }}
              >
                <div>
                  ORIGIN: <span style={{ color: C.red }}>HADAPSAR INDUSTRIAL (PM2.5 SOURCE)</span>
                </div>
                <div>
                  VECTOR: <span style={{ color: C.amber }}>NE @ 12 km/h</span> · BEARING:{" "}
                  <span style={{ color: C.amber }}>{formatBearing(zoneBearing("hadapsar", "puneNE"))}</span>
                </div>
                <div>
                  PROJECTED IMPACT: <span style={{ color: C.amber }}>PUNE NE QUADRANT</span> ·{" "}
                  DIST <span style={{ color: C.amber }}>{formatDistanceKm(zoneDistance("hadapsar", "puneNE"))}</span>
                </div>
                <div>
                  ESTIMATED ARRIVAL: <span style={{ color: C.red }}>T+{(zoneDistance("hadapsar", "puneNE") / 12 * 60).toFixed(0)}M</span> at current wind
                </div>
                <div>
                  MIXING HEIGHT: <span style={{ color: C.amber }}>820m (TRAPPING LAYER ACTIVE)</span>
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  color: C.muted,
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                AT-RISK INFRASTRUCTURE
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 9 }}>
                <thead>
                  <tr>
                    {["NAME", "ZONE", "DIST", "POP", "RISK"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "4px 6px",
                          color: C.muted,
                          fontSize: 8,
                          letterSpacing: "0.1em",
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { n: "KEM Hospital", z: "Pune NE", d: formatDistanceKm(zoneDistance("hadapsar", "puneNE")), p: "—", r: "HIGH", c: C.amber },
                    { n: "Pune Univ.", z: "Shivajinagar", d: formatDistanceKm(zoneDistance("hadapsar", "shivaji")), p: "12,000", r: "MOD", c: C.yellow },
                    { n: "Khadakwasla", z: "Katraj", d: formatDistanceKm(zoneDistance("hadapsar", "katraj")), p: "Water", r: "LOW", c: C.olive },
                  ].map((row) => (
                    <tr key={row.n}>
                      <td style={{ padding: "4px 6px", color: C.cream, borderBottom: `1px solid ${C.border}` }}>{row.n}</td>
                      <td style={{ padding: "4px 6px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{row.z}</td>
                      <td style={{ padding: "4px 6px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{row.d}</td>
                      <td style={{ padding: "4px 6px", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{row.p}</td>
                      <td style={{ padding: "4px 6px", color: row.c, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{row.r}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  color: C.muted,
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                PLUME FORECAST · PUNE NE CENTROID
              </div>
              {(() => {
                const series = [142, 158, 174, 189, 201, 178];
                const labels = ["NOW", "T+2H", "T+4H", "T+6H", "T+12H", "T+24H"];
                const max = 220;
                const W = 100;
                const H = 36;
                const pts = series
                  .map((v, i) => `${(i / (series.length - 1)) * W},${H - (v / max) * H}`)
                  .join(" ");
                return (
                  <div>
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 50 }}>
                      <polyline points={pts} fill="none" stroke={C.amber} strokeWidth="1" />
                      {series.map((v, i) => (
                        <circle
                          key={i}
                          cx={(i / (series.length - 1)) * W}
                          cy={H - (v / max) * H}
                          r="0.8"
                          fill={C.amber}
                        />
                      ))}
                      <line x1={(1 / 5) * W} y1="0" x2={(1 / 5) * W} y2={H} stroke={C.red} strokeWidth="0.4" strokeDasharray="1 1" />
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 2 }}>
                      {labels.map((l, i) => (
                        <span key={l} style={{ color: i === 1 ? C.red : C.muted }}>
                          {l}
                          <br />
                          <span style={{ color: C.amber }}>{series[i]}</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: C.red, letterSpacing: "0.1em" }}>
                      ⚠ PLUME ARRIVAL AT PUNE NE: T+2.4H
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: MONO,
                        fontSize: 9,
                        color: C.muted,
                        letterSpacing: "0.08em",
                      }}
                    >
                      DISPERSION COEFFICIENT: <span style={{ color: C.cream }}>σy={plumeData.sigmaY[2]}km</span>{" "}
                      <span style={{ color: C.cream }}>σz={plumeData.sigmaZ[2]}km</span> @ 3KM
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </Panel>

      {/* BOTTOM ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {/* PM2.5 FORECAST */}
        <Panel>
          <PanelHeader
            title="PM2.5 · 48H PREDICTIVE FORECAST"
            right={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>{`PROPHET · 80% CI · ${zone.name.toUpperCase()}`}</span>
                <DataLineageDrawer data={LINEAGE.pm25Forecast} />
              </span>
            }
          />
          <div style={{ padding: 8, height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={PM25}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="t" tick={{ fill: C.muted, fontSize: 8, fontFamily: MONO }} interval={6} />
                <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} domain={[0, 300]} />
                <Tooltip
                  contentStyle={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    fontFamily: MONO,
                    fontSize: 10,
                    color: C.text,
                  }}
                />
                <ReferenceLine y={15} stroke={C.green} strokeDasharray="3 3" label={{ value: "WHO", fill: C.green, fontSize: 9 }} />
                <ReferenceLine y={60} stroke={C.amber} strokeDasharray="3 3" label={{ value: "NAAQS", fill: C.amber, fontSize: 9 }} />
                <ReferenceLine y={150} stroke={C.red} strokeDasharray="3 3" label={{ value: "HAZARDOUS", fill: C.red, fontSize: 9 }} />
                <ReferenceLine x="T+0H" stroke="#ffffff" strokeOpacity={0.3} strokeDasharray="2 2" label={{ value: "NOW", fill: C.olive, fontSize: 9 }} />
                <ReferenceArea x1="T+14H" x2="T+22H" fill={C.red} fillOpacity={0.05} label={{ value: "EXCEEDANCE WINDOW", fill: C.red, fontSize: 9 }} />
                <Area dataKey="up" stroke="none" fill={C.amber} fillOpacity={0.06} />
                <Line dataKey="up" stroke={C.amber} strokeOpacity={0.35} strokeDasharray="3 3" dot={false} strokeWidth={1} />
                <Line dataKey="lo" stroke={C.amber} strokeOpacity={0.35} strokeDasharray="3 3" dot={false} strokeWidth={1} />
                <Line dataKey="hist" stroke={C.muted} strokeWidth={1.5} dot={false} />
                <Line dataKey="fc" stroke={C.amber} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              padding: "8px 14px",
              borderTop: `1px solid ${C.border}`,
              fontFamily: MONO,
              fontSize: 8,
              color: C.muted,
              letterSpacing: "0.05em",
            }}
          >
            TRAINING OBS: 2,184 · RMSE: 12.4 · MAE: 9.1 · CONFIDENCE: 80% · LAST TRAINED: 1H AGO
          </div>
        </Panel>

        {/* LST FORECAST */}
        <Panel>
          <PanelHeader
            title="LST · 72H THERMAL FORECAST"
            right={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>{`PROPHET · DIURNAL · ${zone.name.toUpperCase()}`}</span>
                <DataLineageDrawer data={LINEAGE.lstForecast} />
              </span>
            }
          />
          <div style={{ padding: 8, height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={LST}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="t" tick={{ fill: C.muted, fontSize: 8, fontFamily: MONO }} interval={8} />
                <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} domain={[20, 55]} />
                <Tooltip
                  contentStyle={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    fontFamily: MONO,
                    fontSize: 10,
                    color: C.text,
                  }}
                />
                <ReferenceLine y={35} stroke={C.olive} strokeDasharray="3 3" label={{ value: "ELEVATED", fill: C.olive, fontSize: 9 }} />
                <ReferenceLine y={42} stroke={C.amber} strokeDasharray="3 3" label={{ value: "HEAT STRESS", fill: C.amber, fontSize: 9 }} />
                <ReferenceLine y={48} stroke={C.red} strokeDasharray="3 3" label={{ value: "EXTREME", fill: C.red, fontSize: 9 }} />
                <ReferenceLine x="T+0H" stroke="#ffffff" strokeOpacity={0.3} strokeDasharray="2 2" label={{ value: "NOW", fill: C.olive, fontSize: 9 }} />
                <ReferenceArea x1="T+8H" x2="T+14H" fill={C.amber} fillOpacity={0.04} label={{ value: "HEAT STRESS WINDOW", fill: C.amber, fontSize: 9 }} />
                <Area dataKey="up" stroke="none" fill={C.olive} fillOpacity={0.06} />
                <Line dataKey="up" stroke={C.olive} strokeOpacity={0.35} strokeDasharray="3 3" dot={false} strokeWidth={1} />
                <Line dataKey="lo" stroke={C.olive} strokeOpacity={0.35} strokeDasharray="3 3" dot={false} strokeWidth={1} />
                <Line dataKey="hist" stroke={C.muted} strokeWidth={1.5} dot={false} />
                <Line dataKey="fc" stroke={C.olive} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div
            style={{
              padding: "8px 14px",
              borderTop: `1px solid ${C.border}`,
              fontFamily: MONO,
              fontSize: 8,
              color: C.muted,
              letterSpacing: "0.05em",
            }}
          >
            URBAN HEAT ISLAND INTENSITY: <span style={{ color: C.red }}>+4.2°C</span> · RURAL BASELINE: 28.1°C · SURFACE ALBEDO: 0.18 (LOW)
          </div>
        </Panel>
      </div>
    </div>
  );
}
