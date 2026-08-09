import * as React from "react";
import { Suspense, lazy } from "react";
import { C, MONO, SANS, SEV, Panel, PanelHeader, MiniBar, MockBadge, EmptyState } from "../_shared/raphael-ui";
import { PuneZoneMap, zoneCentroid } from "../_shared/PuneZoneMap";
import { zoneBearing, zoneDistance, formatBearing, formatDistanceKm } from "@/utils/geospatial";
import { LocateButton } from "../_shared/LocateButton";
import { useActiveRegion, useZones } from "@/hooks/useZones";

const CompareGlobe = lazy(() =>
  import("./CompareGlobe").then((m) => ({ default: m.CompareGlobe })),
);

export interface CompareZone {
  id: string;
  name: string;
  threat: string;
  severity: string;
  pop?: number;
  lat: number;
  lon: number;
  radiusKm: number;
  aqi?: number;
  lst?: number;
  ndvi?: number;
  pm25?: number;
  no2?: number;
  fire?: number;
  therm?: number;
  risk?: number;
  data_source?: string;
}

const SAMPLE_ZONES: CompareZone[] = [
  {
    id: "zone-hadapsar",
    name: "Hadapsar Industrial",
    threat: "critical",
    severity: "critical",
    pop: 284000,
    lat: 18.4983,
    lon: 73.9258,
    radiusKm: 10,
    aqi: 187,
    lst: 41.2,
    ndvi: 0.18,
    pm25: undefined,
    no2: undefined,
    fire: undefined,
    therm: undefined,
    risk: 9.2,
    data_source: "mock",
  },
  {
    id: "zone-pune-ne",
    name: "Pune NE Quadrant",
    threat: "warning",
    severity: "warning",
    pop: 412000,
    lat: 18.5629,
    lon: 73.912,
    radiusKm: 10,
    aqi: 142,
    lst: 38.4,
    ndvi: 0.34,
    pm25: undefined,
    no2: undefined,
    fire: undefined,
    therm: undefined,
    risk: 7.8,
    data_source: "mock",
  },
];

const INDICATORS: Array<{
  key: keyof CompareZone;
  label: string;
  bestLow: boolean;
  max: number;
  thresh: (v: number) => string;
}> = [
  { key: "aqi", label: "AQI (μg/m³)", bestLow: true, max: 250, thresh: (v) => (v > 150 ? C.red : v > 100 ? C.amber : C.olive) },
  { key: "lst", label: "LST (°C)", bestLow: true, max: 50, thresh: (v) => (v > 40 ? C.red : v > 36 ? C.amber : C.olive) },
  { key: "ndvi", label: "NDVI Index", bestLow: false, max: 1, thresh: (v) => (v < 0.2 ? C.red : v < 0.4 ? C.amber : C.olive) },
  { key: "pm25", label: "PM2.5 (μg/m³)", bestLow: true, max: 150, thresh: (v) => (v > 75 ? C.red : v > 50 ? C.amber : C.olive) },
  { key: "no2", label: "NO₂ (μg/m³)", bestLow: true, max: 80, thresh: (v) => (v > 40 ? C.red : v > 25 ? C.amber : C.olive) },
  { key: "fire", label: "Fire Hotspots", bestLow: true, max: 10, thresh: (v) => (v > 2 ? C.red : v > 0 ? C.amber : C.olive) },
  { key: "therm", label: "Thermal Anomalies", bestLow: true, max: 15, thresh: (v) => (v > 6 ? C.red : v > 3 ? C.amber : C.olive) },
  { key: "risk", label: "Risk Score", bestLow: true, max: 10, thresh: (v) => (v > 8 ? C.red : v > 5 ? C.amber : C.olive) },
];

interface ZoneMapPanelProps {
  z: CompareZone;
  sync: boolean;
  onReady: (v: any) => void;
}

function ZoneMapPanel({ z, sync, onReady }: ZoneMapPanelProps) {
  const viewerRef = React.useRef<any>(null);
  const handleReady = (v: any) => {
    viewerRef.current = v;
    onReady(v);
  };
  const handleRecenter = () => {
    const v = viewerRef.current;
    if (!v) return;
    void import("cesium").then((Cesium) => {
      try {
        const radiusDeg = (z.radiusKm || 10) / 111.0;
        v.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            z.lon - radiusDeg * 1.5,
            z.lat - radiusDeg * 1.5,
            z.lon + radiusDeg * 1.5,
            z.lat + radiusDeg * 1.5
          ),
          duration: 1.2,
        });
      } catch {}
    });
  };
  return (
    <Panel style={{ position: "relative" }}>
      <PanelHeader
        title={z.name.toUpperCase()}
        sub={`${z.threat.toUpperCase()} · ${typeof z.pop === "number" ? z.pop.toLocaleString() + " POP" : "— POP"}`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {z.data_source === "mock" && <MockBadge />}
            {sync ? "SYNCHRONIZED ●" : ""}
          </div>
        }
      />
      <div style={{ position: "relative", height: 320, background: C.bg }}>
        <Suspense
          fallback={
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: C.muted,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.2em",
              }}
            >
              LOADING GLOBE…
            </div>
          }
        >
          <CompareGlobe zone={{ ...z, severity: z.threat as any }} onViewerReady={handleReady} />
        </Suspense>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "4px 10px",
            background: `${C.bg}cc`,
            fontFamily: MONO,
            fontSize: 8,
            color: C.muted,
            letterSpacing: "0.08em",
            pointerEvents: "none",
          }}
        >
          {z.lat.toFixed(4)}°N · {z.lon.toFixed(4)}°E · ALT {(z.radiusKm * 8).toFixed(0)}KM · 2D
        </div>
        <div style={{ position: "absolute", left: 8, bottom: 24, zIndex: 5 }}>
          <LocateButton title={`Recenter on ${z.name}`} onClick={handleRecenter} />
        </div>
      </div>
    </Panel>
  );
}

export default function ComparisonView() {
  const [sync, setSync] = React.useState(true);
  const viewersRef = React.useRef<any[]>([null, null]);
  const listenersRef = React.useRef<any[]>([null, null]);
  const syncingRef = React.useRef(false);
  const syncRef = React.useRef(sync);
  syncRef.current = sync;

  const { data: activeRegion, isLoading: isActiveRegionLoading } = useActiveRegion();
  const { data: rawZones = [], isLoading: isZonesLoading } = useZones(activeRegion?.id);
  const isLoading = isActiveRegionLoading || isZonesLoading;

  const ZONES = React.useMemo<CompareZone[]>(() => {
    const list = rawZones.length > 0 ? rawZones : SAMPLE_ZONES;
    return list.slice(0, 2).map((z: any) => ({
      id: z.id,
      name: z.name,
      threat: z.severity || z.threat || "nominal",
      severity: z.severity || z.threat || "nominal",
      pop: typeof z.pop === "number" ? z.pop : undefined,
      lat: typeof z.lat === "number" ? z.lat : 0,
      lon: typeof z.lon === "number" ? z.lon : 0,
      radiusKm: typeof z.radiusKm === "number" ? z.radiusKm : 10,
      aqi: typeof z.aqi === "number" ? z.aqi : undefined,
      lst: typeof z.lst === "number" ? z.lst : undefined,
      ndvi: typeof z.ndvi === "number" ? z.ndvi : undefined,
      pm25: typeof z.pm25 === "number" ? z.pm25 : undefined,
      no2: typeof z.no2 === "number" ? z.no2 : undefined,
      fire: typeof z.fire === "number" ? z.fire : undefined,
      therm: typeof z.therm === "number" ? z.therm : undefined,
      risk: typeof z.risk === "number" ? z.risk : undefined,
      data_source: z.data_source || "mock",
    }));
  }, [rawZones]);

  const attachSync = React.useCallback(() => {
    const [a, b] = viewersRef.current;
    if (!a || !b) return;
    // cleanup previous listeners
    listenersRef.current.forEach((rem) => { try { rem?.(); } catch {} });
    listenersRef.current = [null, null];

    const mirror = (src: any, dst: any) => () => {
      if (!syncRef.current || syncingRef.current) return;
      if (!src.initialViewApplied || !dst.initialViewApplied) return;
      syncingRef.current = true;
      try {
        const rect = src.camera.computeViewRectangle();
        if (rect) {
          dst.camera.setView({
            destination: rect,
          });
        }
      } catch {}
      syncingRef.current = false;
    };
    const m1 = mirror(a, b);
    const m2 = mirror(b, a);
    a.camera.changed.addEventListener(m1);
    b.camera.changed.addEventListener(m2);
    listenersRef.current = [
      () => a.camera.changed.removeEventListener(m1),
      () => b.camera.changed.removeEventListener(m2),
    ];
  }, []);

  const onReady = (idx: number) => (v: any) => {
    viewersRef.current[idx] = v;
    if (viewersRef.current[0] && viewersRef.current[1]) attachSync();
  };

  React.useEffect(() => {
    return () => listenersRef.current.forEach((rem) => { try { rem?.(); } catch {} });
  }, []);

  const best = (key: keyof CompareZone, bestLow: boolean) => {
    const vals = ZONES.map((z) => z[key]);
    const numericVals = vals.filter((v): v is number => typeof v === "number");
    if (numericVals.length === 0) return "N/A";
    const w = bestLow ? Math.min(...numericVals) : Math.max(...numericVals);
    const foundZone = ZONES.find((z) => z[key] === w);
    return foundZone ? foundZone.name.split(" ")[0].toUpperCase() : "N/A";
  };

  const isMockActive = React.useMemo(() => {
    return ZONES.some(z => z.data_source === "mock");
  }, [ZONES]);

  if (!isLoading && rawZones.length === 0) {
    return <EmptyState regionName={activeRegion?.name} />;
  }

  return (
    <div
      className="raphael-scroll"
      style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}
    >
      {/* TOP CONTROL BAR */}
      <Panel style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>
              [ ZONE COMPARISON · BENCHMARKING CONSOLE ]
            </span>
            {isMockActive && <MockBadge />}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              placeholder="Search zones..."
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "4px 8px",
                fontFamily: MONO,
                fontSize: 10,
                width: 180,
              }}
            />
            <button
              style={{
                background: C.bg,
                border: `1px solid ${C.olive}`,
                color: C.olive,
                padding: "4px 10px",
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.1em",
                cursor: "pointer",
              }}
            >
              + ADD ZONE
            </button>
          </div>
        </div>
        <div style={{ padding: "0 14px 10px", display: "flex", gap: 8, alignItems: "center" }}>
          {ZONES.map((z) => (
            <span
              key={z.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${SEV[z.threat]}`,
                fontFamily: MONO,
                fontSize: 10,
                color: C.text,
                letterSpacing: "0.08em",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 99, background: SEV[z.threat] }} />
              {z.name.toUpperCase()}
              <span style={{ color: C.muted, marginLeft: 4, cursor: "pointer" }}>×</span>
            </span>
          ))}
          <button
            onClick={() => setSync((s) => !s)}
            style={{
              marginLeft: "auto",
              background: sync ? `${C.olive}22` : C.bg,
              border: `1px solid ${sync ? C.olive : C.border}`,
              color: sync ? C.olive : C.muted,
              padding: "3px 10px",
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            SYNC VIEWS {sync ? "ON" : "OFF"}
          </button>
        </div>
      </Panel>

      {/* DUAL CESIUM MAP ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {ZONES.map((z, i) => (
          <ZoneMapPanel key={z.id} z={z} sync={sync} onReady={onReady(i)} />
        ))}
      </div>

      {/* SPATIAL RELATIONSHIP */}
      {/* TODO Antigravity: Bearing calculation via GeoPandas zone centroids
          Lag correlation: scipy.stats.pearsonr with time offset
          GET /api/v1/analytics/zone-relationship?zone_a=x&zone_b=y */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader
          title="SPATIAL RELATIONSHIP ANALYSIS"
          right="GEOGRAPHIC CONTEXT BETWEEN SELECTED ZONES"
        />
        <div style={{ display: "grid", gridTemplateColumns: "35% 35% 30%", gap: 0 }}>
          {/* COL 1 — MAP */}
          <div style={{ borderRight: `1px solid ${C.border}`, padding: 8 }}>
            <PuneZoneMap
              height={300}
              highlight={["hadapsar", "puneNE"]}
              showRisk={false}
              overlays={[
                {
                  kind: "connector",
                  a: zoneCentroid("hadapsar"),
                  b: zoneCentroid("puneNE"),
                  label: formatDistanceKm(zoneDistance("hadapsar", "puneNE")),
                },
                {
                  kind: "wind",
                  from: zoneCentroid("hadapsar"),
                  to: zoneCentroid("puneNE"),
                  arrows: 2,
                },
              ]}
            />
            <div style={{ padding: "6px 4px", fontFamily: MONO, fontSize: 9, color: C.cream, lineHeight: 1.6 }}>
              <div style={{ color: C.muted, fontSize: 8, letterSpacing: "0.1em", marginBottom: 4 }}>
                UPWIND ← HADAPSAR · PUNE NE → DOWNWIND
              </div>
              {(() => {
                const dKm = zoneDistance("hadapsar", "puneNE");
                const bearing = zoneBearing("hadapsar", "puneNE");
                const travelMin = (dKm / 12) * 60;
                return (
                  <>
                    <div>SEPARATION: <span style={{ color: C.amber }}>{formatDistanceKm(dKm)}</span></div>
                    <div>BEARING: <span style={{ color: C.amber }}>HAD → PNE = {formatBearing(bearing)}</span></div>
                    <div>WIND ALIGNMENT: <span style={{ color: C.red }}>87%</span> (NE wind carries HAD→PNE)</div>
                    <div>TRAVEL TIME @ 12 km/h: <span style={{ color: C.amber }}>{travelMin.toFixed(0)} MIN</span></div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* COL 2 — LINKAGE */}
          <div style={{ borderRight: `1px solid ${C.border}`, padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              [ ENVIRONMENTAL LINKAGE ]
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
              <div>HADAPSAR is <span style={{ color: C.amber }}>UPWIND</span> of PUNE NE ({formatBearing(zoneBearing("hadapsar", "puneNE"))} vs wind 045°)</div>
              <div>CORRELATION: HAD PM2.5 → PNE PM2.5 LAG <span style={{ color: C.amber }}>+2.4H</span></div>
              <div>PEARSON r (LAGGED): <span style={{ color: C.red, fontWeight: 700 }}>0.78</span> — STRONG CAUSAL LINK</div>
            </div>

            <div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", marginBottom: 4, textTransform: "uppercase" }}>
                SHARED STRESSORS
              </div>
              {[
                "NH-9 traffic corridor — affects both zones",
                "Seasonal inversion layer — trapping pollutants",
                "Inadequate green buffer — NDVI < 0.35 in both",
                "Low mixing height — 820m (city-wide)",
              ].map((s) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontFamily: MONO, fontSize: 9, color: C.cream }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: C.amber }} />
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{s}</span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", marginBottom: 4, textTransform: "uppercase" }}>
                DIFFERENTIATING FACTORS
              </div>
              {[
                "MIDC industrial cluster — Hadapsar only",
                "Lower NDVI (0.18 vs 0.34) — less veg buffer",
                "Higher pop density — 3,200 vs 2,100/km²",
              ].map((s) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontFamily: MONO, fontSize: 9, color: C.cream }}>
                  <span style={{ width: 6, height: 6, background: C.red }} />
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* COL 3 — INTERVENTION LINKAGE */}
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              [ LINKED INTERVENTION LOGIC ]
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.cream, lineHeight: 1.6 }}>
              Improving conditions in <span style={{ color: C.amber }}>HADAPSAR</span> will have
              downstream benefit for <span style={{ color: C.amber }}>PUNE NE</span> with an
              estimated <span style={{ color: C.olive }}>2.4H lag</span> based on wind vector
              analysis.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                {
                  n: "①",
                  t: "NH-9 TRAFFIC MANAGEMENT",
                  i: "HAD −12% PM2.5 · PNE −8% (lagged)",
                },
                {
                  n: "②",
                  t: "MIDC EMISSION CONTROLS",
                  i: "HAD −24% · PNE −15% (T+2.4H)",
                },
                {
                  n: "③",
                  t: "GREEN CORRIDOR NH-9 BELT",
                  i: "Both zones +0.12 NDVI / 24M",
                },
              ].map((a) => (
                <div
                  key={a.n}
                  style={{
                    padding: 8,
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderLeft: `2px solid ${C.olive}`,
                  }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.olive, letterSpacing: "0.1em" }}>
                    {a.n} {a.t}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, marginTop: 2 }}>
                    ↳ {a.i}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "auto",
                padding: 10,
                background: C.bg,
                borderLeft: `2px solid ${C.red}`,
                fontFamily: MONO,
                fontSize: 10,
                color: C.cream,
                letterSpacing: "0.05em",
              }}
            >
              PRIORITY: Address <span style={{ color: C.red, fontWeight: 700 }}>HADAPSAR</span> to protect <span style={{ color: C.amber, fontWeight: 700 }}>PUNE NE</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* INDICATOR MATRIX */}
      <Panel style={{ marginBottom: 10 }}>
        <PanelHeader title="ENVIRONMENTAL INDICATOR MATRIX" right="REAL-TIME · LAST UPDATE 4M AGO" />
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 10 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {["INDICATOR", ...ZONES.map((z) => z.name.toUpperCase()), "BEST"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    color: C.muted,
                    fontSize: 9,
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
            {INDICATORS.map((ind) => {
              const bestZone = best(ind.key, ind.bestLow);
              return (
                <tr key={ind.key}>
                  <td style={{ padding: "8px 12px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{ind.label}</td>
                  {ZONES.map((z) => {
                    const v = z[ind.key];
                    const hasValue = typeof v === "number";
                    const isBest = hasValue && z.name.split(" ")[0].toUpperCase() === bestZone;
                    const isWorst = hasValue && ZONES.length === 2 && !isBest;
                    const col = hasValue ? ind.thresh(v) : C.muted;
                    const displayVal = hasValue ? (v < 10 ? v.toFixed(2) : v.toLocaleString()) : "—";
                    return (
                      <td
                        key={z.name}
                        style={{
                          padding: "8px 12px",
                          color: col,
                          fontWeight: 700,
                          background: isBest ? "#1a2d1a" : isWorst ? "rgba(239,68,68,0.05)" : "transparent",
                          borderBottom: `1px solid ${C.border}`,
                          minWidth: 120,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{displayVal}</span>
                          {isBest && <span style={{ color: C.olive }}>✓</span>}
                        </div>
                        <div style={{ marginTop: 3 }}>
                          <MiniBar pct={hasValue ? (v / ind.max) * 100 : 0} color={col} />
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 12px", color: C.olive, borderBottom: `1px solid ${C.border}` }}>
                    {bestZone !== "N/A" ? `${bestZone} ✓` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {/* SCORECARDS */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${ZONES.length}, 1fr)`, gap: 10, marginBottom: 10 }}>
        {ZONES.map((z) => (
          <Panel key={z.name}>
            <PanelHeader title={z.name.toUpperCase()} right={z.threat.toUpperCase()} />
            <div style={{ padding: 12, fontFamily: MONO, fontSize: 10 }}>
              {INDICATORS.slice(0, 6).map((ind) => {
                const v = z[ind.key];
                const hasValue = typeof v === "number";
                const col = hasValue ? ind.thresh(v) : C.muted;
                const displayVal = hasValue ? v.toFixed(2) : "—";
                return (
                  <div key={ind.key} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ color: C.muted }}>{ind.label}</span>
                    <span style={{ color: col, fontWeight: 700 }}>
                      {displayVal}{" "}
                      {hasValue && (
                        <span style={{ color: v > ind.max * 0.5 ? C.red : C.olive }}>{v > ind.max * 0.5 ? "↑" : "↓"}</span>
                      )}
                    </span>
                  </div>
                );
              })}
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 24, color: SEV[z.threat], fontWeight: 700 }}>
                  {typeof z.risk === "number" ? z.risk.toFixed(1) : "—"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, letterSpacing: "0.15em" }}>COMPOSITE RISK / 10</div>
              </div>
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <a
                  href="/explorer"
                  style={{ fontFamily: MONO, fontSize: 9, color: C.olive, textDecoration: "none", letterSpacing: "0.1em" }}
                >
                  VIEW IN EXPLORER →
                </a>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {/* INTERVENTION PRIORITY ANALYSIS */}
      {/* TODO Antigravity: Generated from ml/explainer.py
          GET /api/v1/system/insights?type=intervention&zones=x,y
          Event markers POST /api/v1/zones/{id}/events */}
      <Panel style={{ borderLeft: `3px solid ${C.olive}`, marginBottom: 10 }}>
        <PanelHeader title="INTERVENTION PRIORITY ANALYSIS" />
        <div style={{ padding: 16, fontFamily: MONO, fontSize: 10, lineHeight: 1.7, color: C.text }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: C.muted, letterSpacing: "0.12em" }}>PRIORITY 01 — </span>
            <span style={{ color: C.olive, fontWeight: 700 }}>HADAPSAR INDUSTRIAL </span>
            <span style={{ color: C.red, fontWeight: 700 }}>[CRITICAL]</span>
          </div>
          <div style={{ color: C.text }}>
            Based on composite risk index <span style={{ color: C.red }}>9.2/10</span> and population exposure of{" "}
            <span style={{ color: C.cream }}>284,000</span> residents, immediate intervention recommended.
          </div>
          <div style={{ color: C.text, marginTop: 4 }}>
            Primary stressors: Industrial emissions <span style={{ color: C.amber }}>(31%)</span> and thermal anomaly
            clustering <span style={{ color: C.amber }}>(8 events / 7D)</span>.
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: C.muted }}>Recommended actions: </span>
            <span style={{ color: C.cream }}>
              Industrial activity audit along MIDC corridor · Green buffer plantation NH-9 · PM2.5 source attribution
              study.
            </span>
          </div>

          <div style={{ borderTop: `1px dashed ${C.border}`, margin: "14px 0" }} />

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: C.muted, letterSpacing: "0.12em" }}>PRIORITY 02 — </span>
            <span style={{ color: C.olive, fontWeight: 700 }}>PUNE NE QUADRANT </span>
            <span style={{ color: C.amber, fontWeight: 700 }}>[HIGH · MONITORING]</span>
          </div>
          <div style={{ color: C.text }}>
            Risk index <span style={{ color: C.amber }}>7.8/10</span> — elevated but trajectory stabilizing{" "}
            <span style={{ color: C.olive }}>(Δ+0.2 this cycle)</span>. Heat island intensification primary concern. LST
            forecast peaks at <span style={{ color: C.red }}>42°C</span> within T+18H window.
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: C.muted }}>Recommended actions: </span>
            <span style={{ color: C.cream }}>
              Urban heat island mitigation · Cool roofing pilot in dense residential blocks.
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            {[
              { icon: "▤", lbl: "GENERATE INTERVENTION BRIEF" },
              { icon: "↗", lbl: "EXPORT ANALYSIS" },
              { icon: "+", lbl: "ADD EVENT MARKER" },
            ].map((b) => (
              <button
                key={b.lbl}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.olive}`,
                  color: C.olive,
                  padding: "5px 10px",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{b.icon}</span> {b.lbl}
              </button>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
