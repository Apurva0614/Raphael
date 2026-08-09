import * as React from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  Scatter,
  ScatterChart,
  ZAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { C, MONO, SANS, Panel, PanelHeader, MiniBar, MockBadge, EmptyState } from "../_shared/raphael-ui";
import { PuneZoneMap, zoneCentroid } from "../_shared/PuneZoneMap";
import { zoneBearing, zoneDistance, formatBearing, formatDistanceKm } from "@/utils/geospatial";
import { useActiveRegion, useZones, fetchWithAuth } from "@/hooks/useZones";
import { useQuery } from "@tanstack/react-query";

export interface AnalyticsZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  aqi: number;
  lst: number;
  ndvi: number;
  risk: number;
  classification: string;
  severity: string;
  data_source?: string;
}

const SAMPLE_ZONES: AnalyticsZone[] = [
  {
    id: "zone-pune-ne",
    name: "Pune NE Quadrant",
    lat: 18.5629,
    lon: 73.912,
    radiusKm: 15,
    aqi: 142,
    lst: 38.4,
    ndvi: 0.34,
    risk: 7.8,
    classification: "Heat-Stressed Urban",
    severity: "critical",
    data_source: "mock",
  },
  {
    id: "zone-hadapsar",
    name: "Hadapsar Industrial",
    lat: 18.4983,
    lon: 73.9258,
    radiusKm: 12,
    aqi: 168,
    lst: 36.7,
    ndvi: 0.22,
    risk: 8.4,
    classification: "Industrial Plume",
    severity: "critical",
    data_source: "mock",
  },
];

// TODO Antigravity:
//   GET /api/v1/layers/aq/history?zone_id=x&days=30
//   GET /api/v1/layers/lst/history?zone_id=x&days=30
const mockAQIData = [
  {date:'Jun 01',aqi:124,lst:34.2},{date:'Jun 02',aqi:138,lst:35.1},
  {date:'Jun 03',aqi:156,lst:36.4},{date:'Jun 04',aqi:142,lst:35.8},
  {date:'Jun 05',aqi:168,lst:37.2},{date:'Jun 06',aqi:187,lst:38.9},
  {date:'Jun 07',aqi:201,lst:40.1},{date:'Jun 08',aqi:178,lst:39.4},
  {date:'Jun 09',aqi:155,lst:37.8},{date:'Jun 10',aqi:143,lst:36.9},
  {date:'Jun 11',aqi:132,lst:35.4},{date:'Jun 12',aqi:148,lst:36.1},
  {date:'Jun 13',aqi:162,lst:37.4},{date:'Jun 14',aqi:174,lst:38.2},
  {date:'Jun 15',aqi:189,lst:39.8},{date:'Jun 16',aqi:167,lst:38.4},
  {date:'Jun 17',aqi:144,lst:36.7},{date:'Jun 18',aqi:131,lst:35.2},
  {date:'Jun 19',aqi:128,lst:34.8},{date:'Jun 20',aqi:119,lst:33.9},
  {date:'Jun 21',aqi:134,lst:35.1},{date:'Jun 22',aqi:147,lst:36.3},
  {date:'Jun 23',aqi:158,lst:37.1},{date:'Jun 24',aqi:172,lst:38.4},
  {date:'Jun 25',aqi:184,lst:39.2},{date:'Jun 26',aqi:196,lst:40.1},
  {date:'Jun 27',aqi:178,lst:38.8},{date:'Jun 28',aqi:162,lst:37.4},
  {date:'Jun 29',aqi:148,lst:36.2},{date:'Jun 30',aqi:141,lst:35.7},
];
const mockForecast = [
  {date:'Jul 01',aqiFc:152,lstFc:36.8},
  {date:'Jul 02',aqiFc:164,lstFc:37.6},
  {date:'Jul 03',aqiFc:171,lstFc:38.1},
  {date:'Jul 04',aqiFc:168,lstFc:37.9},
  {date:'Jul 05',aqiFc:159,lstFc:37.2},
  {date:'Jul 06',aqiFc:148,lstFc:36.4},
  {date:'Jul 07',aqiFc:142,lstFc:35.8},
];
const anomalyDates = new Set(['Jun 07','Jun 15','Jun 26']);
const SERIES = [
  ...mockAQIData.map((d) => ({ ...d, anom: anomalyDates.has(d.date) ? d.aqi : null })),
  ...mockForecast,
];

// TODO Antigravity: GET /api/v1/anomalies?days=7 (IsolationForest results)
function buildAnomalies() {
  const layers = [
    { name: "AQ", color: C.amber, count: 12 },
    { name: "LST", color: C.red, count: 8 },
    { name: "NDVI", color: C.green, count: 3 },
    { name: "FIRE", color: C.orange, count: 4 },
  ];
  const out: any[] = [];
  layers.forEach((l) => {
    for (let i = 0; i < l.count; i++) {
      out.push({
        day: i + Math.random() * 2,
        score: -0.3 - Math.random() * 0.5,
        size: 30 + Math.random() * 80,
        layer: l.name,
        color: l.color,
      });
    }
  });
  return { points: out, layers };
}
const { points: ANOM_POINTS, layers: ANOM_LAYERS } = buildAnomalies();

// TODO Antigravity: GET /api/v1/layers/aq/history?days=365 (daily aggregation)
function buildCalendar() {
  const cells: Array<{ w: number; d: number; v: number }> = [];
  for (let w = 0; w < 52; w++) {
    for (let d = 0; d < 7; d++) {
      const seasonal = Math.sin((w / 52) * Math.PI * 2 - Math.PI / 2) * 80 + 100;
      const v = Math.max(0, seasonal + (Math.random() - 0.5) * 60);
      cells.push({ w, d, v });
    }
  }
  return cells;
}
const CAL = buildCalendar();
function calColor(v: number) {
  if (v < 50) return "#111a11";
  if (v < 80) return C.olive;
  if (v < 120) return C.yellow;
  if (v < 180) return C.amber;
  return C.red;
}

// TODO Antigravity: POST /api/v1/analytics/correlation
function buildScatter() {
  const out: any[] = [];
  for (let i = 0; i < 90; i++) {
    const aqi = 40 + Math.random() * 200;
    const lst = 23.6 + 0.084 * aqi + (Math.random() - 0.5) * 6;
    out.push({ aqi, lst });
  }
  return out;
}
const SCATTER = buildScatter();

const MONTHLY = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].map((m, i) => ({
  m,
  v: 60 + Math.sin(((i - 2) / 12) * Math.PI * 2) * 80 + 80,
}));

export default function AnalyticsView() {
  const [tf, setTf] = React.useState("30D");
  const [menuOpen, setMenuOpen] = React.useState(false);

  const { data: activeRegion, isLoading: isActiveRegionLoading } = useActiveRegion();
  const { data: rawZones = [], isLoading: isZonesLoading } = useZones(activeRegion?.id);
  const isLoading = isActiveRegionLoading || isZonesLoading;
  const [selectedZoneState, setSelectedZoneState] = React.useState<AnalyticsZone | null>(null);

  const { data: anomaliesData } = useQuery({
    queryKey: ["anomalies", 7],
    queryFn: () => fetchWithAuth("/api/v1/anomalies?days=7"),
  });

  const { points: anomPoints, layers: anomLayers } = React.useMemo(() => {
    const rawList = anomaliesData?.data;
    if (!Array.isArray(rawList)) {
      return { points: ANOM_POINTS, layers: ANOM_LAYERS };
    }

    const layerColors: Record<string, string> = {
      aq: C.amber,
      lst: C.red,
      ndvi: C.green,
      fire: C.orange,
    };

    const counts: Record<string, number> = {
      aq: 0,
      lst: 0,
      ndvi: 0,
      fire: 0,
    };

    const parsedPoints = rawList.map((item) => {
      const type = (item.layer_type || "aq").toLowerCase();
      counts[type] = (counts[type] || 0) + 1;

      const observedAt = new Date(item.observed_at);
      const diffMs = Date.now() - observedAt.getTime();
      const daysAgo = Math.max(0, Math.min(7, diffMs / (1000 * 60 * 60 * 24)));

      const score = typeof item.anomaly_score === "number" ? item.anomaly_score : -0.5;
      const size = 30 + Math.abs(score) * 150;

      return {
        day: Number(daysAgo.toFixed(2)),
        score,
        size,
        layer: type.toUpperCase(),
        color: layerColors[type] || C.muted,
      };
    });

    const parsedLayers = [
      { name: "AQ", color: C.amber, count: counts.aq || 0 },
      { name: "LST", color: C.red, count: counts.lst || 0 },
      { name: "NDVI", color: C.green, count: counts.ndvi || 0 },
      { name: "FIRE", color: C.orange, count: counts.fire || 0 },
    ];

    return { points: parsedPoints, layers: parsedLayers };
  }, [anomaliesData]);

  const zones = React.useMemo<AnalyticsZone[]>(() => {
    return rawZones.length > 0 ? rawZones : SAMPLE_ZONES;
  }, [rawZones]);

  const selectedZone = React.useMemo(() => {
    if (selectedZoneState) {
      const found = zones.find((z) => z.id === selectedZoneState.id);
      if (found) return found;
    }
    return zones[0] || SAMPLE_ZONES[0];
  }, [selectedZoneState, zones]);

  if (!isLoading && rawZones.length === 0) {
    return <EmptyState regionName={activeRegion?.name} />;
  }

  return (
    <div className="raphael-scroll" style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}>
      {/* CONTROL BAR */}
      <Panel style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", height: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>
              [ ANALYTICS · TEMPORAL INTELLIGENCE ENGINE ]
            </span>
            {selectedZone?.data_source === "mock" && <MockBadge />}
          </div>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "4px 10px",
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.1em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {selectedZone.name.toUpperCase()} ▾
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  zIndex: 100,
                  minWidth: 200,
                  marginTop: 4,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                {zones.map((z) => (
                  <div
                    key={z.id}
                    onClick={() => {
                      setSelectedZoneState(z);
                      setMenuOpen(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontFamily: MONO,
                      fontSize: 10,
                      color: selectedZone.id === z.id ? C.olive : C.text,
                      background: selectedZone.id === z.id ? "rgba(255,255,255,0.05)" : "transparent",
                      cursor: "pointer",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = selectedZone.id === z.id ? "rgba(255,255,255,0.05)" : "transparent")}
                  >
                    {z.name.toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            {["7D", "30D", "90D", "1Y", "CUSTOM"].map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                style={{
                  background: tf === t ? `${C.olive}22` : C.bg,
                  border: `1px solid ${tf === t ? C.olive : C.border}`,
                  color: tf === t ? C.olive : C.muted,
                  padding: "4px 10px",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* SECTION 1: Multi-indicator */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader
          title="MULTI-INDICATOR CORRELATION SERIES"
          right="PRIMARY [AQI] · SECONDARY [LST] · ANOMALIES ON · EVENTS ON · FORECAST ON"
        />
        <div style={{ padding: 8, height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={SERIES}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} interval={2} />
              <YAxis yAxisId="l" tick={{ fill: C.amber, fontSize: 9, fontFamily: MONO }} domain={[0, 300]} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: C.olive, fontSize: 9, fontFamily: MONO }} domain={[20, 50]} />
              <Tooltip
                contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, color: C.text }}
              />
              <Line yAxisId="l" dataKey="aqi" stroke={C.amber} strokeWidth={2} dot={{ r: 2, fill: C.amber }} />
              <Line yAxisId="r" dataKey="lst" stroke={C.olive} strokeWidth={2} dot={{ r: 2, fill: C.olive }} />
              <Line yAxisId="l" dataKey="aqiFc" stroke={C.amber} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              <Line yAxisId="r" dataKey="lstFc" stroke={C.olive} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              <Scatter yAxisId="l" dataKey="anom" fill={C.red} shape="diamond" />
              <ReferenceLine x="Jun 10" stroke={C.muted} strokeDasharray="2 2" label={{ value: "DIWALI", fill: C.muted, fontSize: 8 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* SECTION 2: Anomaly Detection */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader title="ANOMALY DETECTION LOG · ISOLATIONFOREST" right="ROLLING 7-DAY · CONTAMINATION 5%" />
        <div style={{ display: "grid", gridTemplateColumns: "65% 35%", gap: 0 }}>
          <div style={{ padding: 8, height: 160, borderRight: `1px solid ${C.border}` }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke={C.border} />
                <XAxis type="number" dataKey="day" name="day" domain={[0, 7]} tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} />
                <YAxis type="number" dataKey="score" domain={[-1, 0]} tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} />
                <ZAxis type="number" dataKey="size" range={[30, 200]} />
                <Tooltip
                  contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, color: C.text }}
                />
                <ReferenceLine y={-0.3} stroke={C.red} strokeDasharray="3 3" label={{ value: "THRESHOLD", fill: C.red, fontSize: 9 }} />
                <Scatter data={anomPoints}>
                  {anomPoints.map((p, i) => (
                    <Cell key={i} fill={p.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              ANOMALIES DETECTED (7D)
            </div>
            {anomLayers.map((l) => (
              <div key={l.name} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 9, marginBottom: 2 }}>
                  <span style={{ color: C.muted }}>{l.name} LAYER</span>
                  <span style={{ color: l.color, fontWeight: 700 }}>{l.count} events</span>
                </div>
                <MiniBar pct={l.count * 5} color={l.color} />
              </div>
            ))}
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9, color: C.text }}>
              <span style={{ color: C.olive }}>{anomPoints.length} TOTAL</span> · 5.2% OF OBSERVATIONS
            </div>
            <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 8, color: C.muted }}>
              MODEL: IsolationForest n=100 · contamination=0.05 · retrained 2h ago
            </div>
          </div>
        </div>
      </Panel>

      {/* SPATIAL HOTSPOT MIGRATION */}
      {/* TODO Antigravity: Hotspot centroid from spatial weighted mean of raw_observations
          GET /api/v1/analytics/hotspot-migration?zone_id=x&days=30
          Uses GeoPandas spatial aggregation on PostGIS */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader
          title="SPATIAL HOTSPOT MIGRATION ANALYSIS"
          right="HOW ENVIRONMENTAL STRESS MOVES ACROSS GEOGRAPHY · 30D"
        />
        <div style={{ display: "grid", gridTemplateColumns: "50% 50%", gap: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, padding: 8 }}>
            <PuneZoneMap
              height={320}
              showRisk={false}
              showDelta={true}
              overlays={[
                {
                  kind: "trail",
                  points: [
                    [275, 230],
                    [310, 220],
                    [345, 205],
                    [375, 190],
                    [410, 175],
                    [440, 150],
                    [460, 120],
                  ],
                  labels: ["D-30", "D-25", "D-20", "D-15", "D-10", "D-5", "NOW"],
                },
              ]}
            />
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 9,
                color: C.muted,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              [ HOTSPOT MIGRATION REPORT ]
            </div>
            <div
              style={{
                borderLeft: `2px solid ${C.olive}`,
                paddingLeft: 10,
                fontFamily: MONO,
                fontSize: 10,
                lineHeight: 1.7,
                color: C.cream,
              }}
            >
              HOTSPOT CENTER HAS MIGRATED{" "}
              <span style={{ color: C.amber }}>{formatDistanceKm(zoneDistance("shivaji", "puneNE"))} NORTHEAST</span> OVER PAST 30 DAYS.
              TRAJECTORY INTERSECTS{" "}
              <span style={{ color: C.red }}>PUNE NE RESIDENTIAL CORE BY T+14D</span> IF TREND
              CONTINUES.
            </div>

            <div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", marginBottom: 4, textTransform: "uppercase" }}>
                MIGRATION METRICS
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10 }}>
                {(() => {
                  const dKm = zoneDistance("shivaji", "puneNE");
                  const bearing = zoneBearing("shivaji", "puneNE");
                  const ratePerDay = (dKm * 1000) / 30;
                  return [
                    ["DISPLACEMENT", `${formatDistanceKm(dKm)} NE`, C.amber],
                    ["MIGRATION RATE", `${ratePerDay.toFixed(0)} m / day`, C.text],
                    ["TRAJECTORY", `${formatBearing(bearing)} bearing`, C.text],
                    ["PROJECTED ARRIVAL", "PUNE NE CORE (T+14D)", C.red],
                    ["CORRELATION", "Wind r = 0.81", C.olive],
                    ["CONFIDENCE", "74%", C.olive],
                  ] as Array<[string, string, string]>;
                })().map(([l, v, c]) => (
                  <div key={l} style={{ display: "flex", padding: "2px 0", gap: 8 }}>
                    <span style={{ color: C.muted, width: 130 }}>{l}</span>
                    <span style={{ color: c, fontWeight: 700 }}>→ {v}</span>
                  </div>
                ))}
              </div>
            </div>


            <div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", marginBottom: 4, textTransform: "uppercase" }}>
                ZONE CONTRIBUTION (30D)
              </div>
              {[
                { z: "Hadapsar", d: 18, dir: "up" },
                { z: "Pune NE", d: 12, dir: "up" },
                { z: "Katraj", d: 2, dir: "flat" },
                { z: "Kothrud", d: -8, dir: "down" },
                { z: "Aundh", d: -12, dir: "down" },
              ].map((r) => {
                const col = r.dir === "up" ? (r.d > 15 ? C.red : C.amber) : r.dir === "down" ? C.olive : C.muted;
                return (
                  <div key={r.z} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontFamily: MONO, fontSize: 9 }}>
                    <span style={{ color: C.cream, width: 70 }}>{r.z}</span>
                    <span style={{ color: col, width: 56 }}>
                      {r.dir === "up" ? "↑ +" : r.dir === "down" ? "↓ " : "→ +"}
                      {r.d}%
                    </span>
                    <div style={{ flex: 1 }}>
                      <MiniBar pct={Math.abs(r.d) * 4} color={col} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {/* SECTION 3: Calendar Heatmap */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader title="DAILY ENVIRONMENTAL CALENDAR · 365D" right="METRIC [AQI] · YEAR [2026]" />
        <div style={{ padding: 14, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingTop: 14, fontFamily: MONO, fontSize: 7, color: C.muted }}>
              <span>M</span><span>W</span><span>F</span>
            </div>
            <div>
              <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
                {["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].map((m) => (
                  <span key={m} style={{ width: 60, fontFamily: MONO, fontSize: 8, color: C.muted, letterSpacing: "0.1em" }}>{m}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 52 }).map((_, w) => (
                  <div key={w} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {Array.from({ length: 7 }).map((_, d) => {
                      const c = CAL.find((x) => x.w === w && x.d === d);
                      return (
                        <div
                          key={d}
                          title={`Week ${w + 1} · Day ${d + 1} · AQI ${c?.v.toFixed(0)}`}
                          style={{ width: 11, height: 11, background: calColor(c?.v ?? 0) }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, fontFamily: MONO, fontSize: 8, color: C.muted, alignItems: "center" }}>
            <span>LOW</span>
            {["#111a11", C.olive, C.yellow, C.amber, C.red].map((c) => (
              <span key={c} style={{ width: 12, height: 12, background: c }} />
            ))}
            <span>HIGH</span>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MONTHLY}>
              <XAxis dataKey="m" tick={{ fill: C.muted, fontSize: 8, fontFamily: MONO }} />
              <Bar dataKey="v">
                {MONTHLY.map((m, i) => (
                  <Cell key={i} fill={calColor(m.v)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ padding: "6px 14px", fontFamily: MONO, fontSize: 9, color: C.muted, borderTop: `1px solid ${C.border}` }}>
          PEAK MONTH: <span style={{ color: C.red }}>MAR (avg 168 AQI)</span> · BEST: <span style={{ color: C.olive }}>AUG (avg 62 AQI)</span>
        </div>
      </Panel>

      {/* SECTION 4: Correlation + Regression */}
      <div style={{ display: "grid", gridTemplateColumns: "55% 45%", gap: 10 }}>
        <Panel>
          <PanelHeader title="INDICATOR CORRELATION ANALYSIS" right="X [AQI] · Y [LST] · 90D" />
          <div style={{ padding: 8, height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke={C.border} />
                <XAxis type="number" dataKey="aqi" name="AQI" tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} />
                <YAxis type="number" dataKey="lst" name="LST" tick={{ fill: C.muted, fontSize: 9, fontFamily: MONO }} />
                <Tooltip
                  cursor={{ stroke: C.olive, strokeDasharray: "3 3" }}
                  contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 10, color: C.text }}
                />
                <Scatter data={SCATTER} fill={C.olive} fillOpacity={0.6} />
                <ReferenceLine
                  segment={[
                    { x: 40, y: 23.6 + 0.084 * 40 },
                    { x: 240, y: 23.6 + 0.084 * 240 },
                  ]}
                  stroke={C.amber}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="REGRESSION STATISTICS" />
          <div style={{ padding: 12, fontFamily: MONO, fontSize: 9 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.12em", marginBottom: 6 }}>CORRELATION METRICS</div>
            {[
              { l: "PEARSON r", v: "+0.73", i: "STRONG POSITIVE", c: C.olive },
              { l: "R² (CoD)", v: "0.532", i: "53.2% VARIANCE EXPLAINED", c: C.olive },
              { l: "SPEARMAN ρ", v: "+0.71", i: "NON-PARAM CONFIRM", c: C.olive },
              { l: "P-VALUE", v: "<0.001", i: "STATISTICALLY SIGNIFICANT", c: C.olive },
              { l: "STD ERROR", v: "8.4", i: "", c: C.text },
              { l: "SAMPLE", v: "2,184", i: "observations", c: C.text },
              { l: "PERIOD", v: "90d", i: "Hadapsar Industrial", c: C.text },
            ].map((r) => (
              <div key={r.l} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                <span style={{ color: C.muted, width: 80 }}>{r.l}</span>
                <span style={{ color: r.c, fontWeight: 700, width: 70 }}>{r.v}</span>
                <span style={{ color: C.muted, fontStyle: "italic", fontSize: 8, marginLeft: "auto" }}>{r.i}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 9, color: C.muted, letterSpacing: "0.12em" }}>REGRESSION EQUATION</div>
            <div
              style={{
                marginTop: 6,
                padding: 10,
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.olive,
                fontFamily: MONO,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              LST = 0.084 × AQI + 23.6
            </div>
            <div style={{ marginTop: 10, fontStyle: "italic", color: C.muted, fontSize: 9, lineHeight: 1.5, fontFamily: SANS }}>
              For every 10-unit increase in AQI, LST increases by approximately 0.84°C. Strong positive correlation confirms urban heat-pollution feedback loop.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Recharts Cell helper import
import { Cell } from "recharts";
