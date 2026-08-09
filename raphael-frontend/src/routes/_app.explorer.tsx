import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useActiveRegion, useZones } from "@/hooks/useZones";
import {
  Search, Play, Pause, RefreshCw, GitCompare, Download, Bell,
  ChevronDown, X, Star, Wind,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const RaphaelGlobe = lazy(() =>
  import("@/components/RaphaelGlobe").then((m) => ({ default: m.RaphaelGlobe })),
);
import { LocateButton } from "@/views/_shared/LocateButton";
import { DataLineageDrawer, LINEAGE } from "@/components/DataLineageDrawer";
import { MockBadge } from "@/views/_shared/raphael-ui";

// Zone data injected here by Antigravity from FastAPI /api/zones
// Shape must match ObservationZone interface in RaphaelGlobe.tsx
export interface ObservationZone {
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
  severity: "nominal" | "warning" | "critical";
}

const SAMPLE_ZONES: ObservationZone[] = [
  {
    id: "zone-001",
    name: "Pune NE Quadrant",
    lat: 18.5629,
    lon: 73.9120,
    radiusKm: 15,
    aqi: 142,
    lst: 38.4,
    ndvi: 0.34,
    risk: 7.8,
    classification: "Heat-Stressed Urban",
    severity: "critical",
  },
  {
    id: "zone-002",
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
  },
  {
    id: "zone-003",
    name: "Kothrud Residential",
    lat: 18.5074,
    lon: 73.8077,
    radiusKm: 10,
    aqi: 96,
    lst: 32.1,
    ndvi: 0.52,
    risk: 5.4,
    classification: "Moderate Risk",
    severity: "warning",
  },
  {
    id: "zone-004",
    name: "Katraj Hills",
    lat: 18.4529,
    lon: 73.8567,
    radiusKm: 14,
    aqi: 58,
    lst: 27.9,
    ndvi: 0.71,
    risk: 2.6,
    classification: "Nominal",
    severity: "nominal",
  },
];
// TODO: Replace static array with API fetch from
// http://127.0.0.1:8000/api/zones on mount

export const Route = createFileRoute("/_app/explorer")({
  component: ExplorerPage,
});

// Layer definitions ---------------------------------------------------------
type Layer = {
  id: string; name: string; color: string; opacity?: boolean;
};
type Group = { label: string; layers: Layer[] };

const GROUPS: Group[] = [
  {
    label: "Environmental",
    layers: [
      { id: "lst", name: "Land Surface Temp", color: "#e05c4f", opacity: true },
      { id: "pm25", name: "Air Quality PM2.5", color: "#a370d6", opacity: true },
      { id: "ndvi", name: "NDVI Green Cover", color: "#6da079", opacity: true },
      { id: "fire", name: "Fire / Heat Anomalies", color: "#ff8a3d", opacity: true },
    ],
  },
  {
    label: "Meteorological",
    layers: [
      { id: "precip", name: "Precipitation", color: "#4a8fd6" },
      { id: "wind", name: "Wind Vectors", color: "#5fd4d6" },
      { id: "urban", name: "Urban Density", color: "#e0c14a" },
    ],
  },
  {
    label: "Intelligence",
    layers: [
      { id: "risk", name: "Risk Score AI", color: "#d4a853" },
      { id: "stations", name: "AQ Stations", color: "#4ad6b8" },
    ],
  },
];

const TICKS = [
  { pct: 0, label: "-72h" },
  { pct: 25, label: "-24h" },
  { pct: 50, label: "NOW" },
  { pct: 70, label: "+24h" },
  { pct: 85, label: "+72h" },
  { pct: 100, label: "+360" },
];

const AQI_TREND = [
  { d: "D-6", v: 110 }, { d: "D-5", v: 128 }, { d: "D-4", v: 95 },
  { d: "D-3", v: 142 }, { d: "D-2", v: 158 }, { d: "D-1", v: 138 },
  { d: "D0", v: 142 },
];

const REASONING = [
  "[t+0.00] ingest pune-grid v23 ok",
  "[t+0.12] lst tile 18.5/73.8 deltaT +2.4°C",
  "[t+0.31] ndvi anomaly cluster N=3",
  "[t+0.44] pm2.5 station #SH-02 → 168 μg/m³",
  "[t+0.61] risk model v2.1 → 7.8/10",
  "[t+0.78] classification: Heat-Stressed Urban",
  "[t+0.91] reasoning trace flushed",
];

// Haversine distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function ExplorerPage() {
  const [layerOn, setLayerOn] = useState<Record<string, boolean>>({
    lst: true, ndvi: false, pm25: true, fire: false,
    precip: false, wind: true, urban: false, risk: true, stations: false,
  });
  const [opacity, setOpacity] = useState<Record<string, number>>({
    lst: 70, ndvi: 60, pm25: 80, fire: 50,
  });
  const [time, setTime] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"2D" | "3D">("3D");
  const [basemap, setBasemap] = useState<"sat" | "dark" | "light">("dark");
  const [bookmarked, setBookmarked] = useState(false);
  const [camera, setCamera] = useState({ lat: "18.5204", lon: "73.8567", altKm: "35" });

  const { data: activeRegion } = useActiveRegion();
  const { data: rawZones = [] } = useZones(activeRegion?.id);
  const zones: ObservationZone[] = useMemo(() => {
    return rawZones.length > 0 ? rawZones : SAMPLE_ZONES;
  }, [rawZones]);

  const [selectedZoneState, setSelectedZoneState] = useState<ObservationZone | null>(null);
  const selectedZone = useMemo(() => {
    if (selectedZoneState) {
      const found = zones.find(z => z.id === selectedZoneState.id);
      if (found) return found;
    }
    return zones[0] || SAMPLE_ZONES[0];
  }, [selectedZoneState, zones]);

  const setSelectedZone = (z: ObservationZone) => {
    setSelectedZoneState(z);
  };

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Minutes since the selected zone was "synced" — drives banner MET counter.
  const [zoneSyncedAt, setZoneSyncedAt] = useState<number>(Date.now());
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => { setZoneSyncedAt(Date.now()); }, [selectedZone.id]);
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const metMin = Math.max(0, Math.floor((nowTick - zoneSyncedAt) / 60_000));

  const bannerBg = useMemo(() => {
    if (selectedZone.severity === "critical") {
      return "linear-gradient(90deg, rgba(239, 68, 68, 0.04) 0%, transparent 100%), rgba(8, 12, 8, 0.78)";
    }
    if (selectedZone.severity === "warning") {
      return "linear-gradient(90deg, rgba(212, 168, 83, 0.04) 0%, transparent 100%), rgba(8, 12, 8, 0.78)";
    }
    return "rgba(8, 12, 8, 0.78)";
  }, [selectedZone.severity]);

  const bannerBorderLeft = useMemo(() => {
    if (selectedZone.severity === "critical") {
      return "4px solid #ef4444";
    }
    if (selectedZone.severity === "warning") {
      return "4px solid #d4a853";
    }
    return undefined;
  }, [selectedZone.severity]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setTime((t) => (t >= 100 ? 0 : t + 1));
    }, 120);
    return () => clearInterval(id);
  }, [playing]);

  const tlRef = useRef<HTMLDivElement | null>(null);
  const globeWrapRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const [bellOpen, setBellOpen] = useState(false);

  // Nominatim Search Box States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Handle Nominatim search with a 350ms debounce and AbortController / requestId guards.
  // Uses countrycodes=in for India scoping (no viewbox distortion).
  // Viewbox bias is only applied for very short queries (< 4 chars)
  // to help disambiguate common neighborhood names near Pune.
  // NOTE: Nominatim's public instance allows max 1 req/sec; the 350ms
  // debounce is sufficient for demo use. Self-host for production scale.
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestId = ++requestIdRef.current;

    const delayDebounceId = setTimeout(async () => {
      try {
        const q = encodeURIComponent(searchQuery);
        const url = `http://127.0.0.1:8000/api/v1/geocode?q=${q}`;

        const res = await fetch(url, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];

        if (requestId !== requestIdRef.current) return;
        setSearchResults(results);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error("Geocoding search failed:", err);
        if (requestId === requestIdRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(delayDebounceId);
    };
  }, [searchQuery]);

  // Click outside to collapse search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelectLocation = (loc: any) => {
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (isNaN(lat) || isNaN(lon)) return;

    // 1. Move Cesium camera
    const v = viewerRef.current;
    if (v) {
      void import("cesium").then((Cesium) => {
        try {
          v.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, 15000),
            orientation: {
              heading: 0,
              pitch: Cesium.Math.toRadians(-65),
              roll: 0,
            },
            duration: 1.5,
          });
        } catch (e) {
          console.error("Camera flyTo failed:", e);
        }
      });
    }

    // 2. Select the nearest zone if within 25km
    let nearestZone: ObservationZone | null = null;
    let minDistance = Infinity;

    for (const zone of zones) {
      const dist = calculateDistance(lat, lon, zone.lat, zone.lon);
      if (dist < minDistance) {
        minDistance = dist;
        nearestZone = zone;
      }
    }

    if (nearestZone && minDistance <= 25) {
      setSelectedZone(nearestZone);
    }

    // 3. Clear search UI state
    setSearchQuery("");
    setSearchResults([]);
    setSearchFocused(false);
  };

  const handleSync = () => {
    const v = viewerRef.current;
    if (!v) return;
    try { v.zoomTo(v.entities); } catch {}
  };

  const handleZoom = (dir: 1 | -1) => {
    const v = viewerRef.current;
    if (!v) return;
    try {
      const h = v.camera.positionCartographic.height;
      const delta = h * 0.3;
      if (dir > 0) v.camera.zoomIn(delta);
      else v.camera.zoomOut(delta);
    } catch {}
  };

  const handleFocusMap = () => {
    const v = viewerRef.current;
    if (!v) return;
    void import("cesium").then((Cesium) => {
      try {
        v.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(selectedZone.lon, selectedZone.lat, 18000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-65), roll: 0 },
          duration: 1.4,
        });
      } catch {}
    });
  };

  // Original locked target — Pune NE Quadrant, ~35km AGL (matches RaphaelGlobe init).
  const handleRecenter = () => {
    const v = viewerRef.current;
    if (!v) return;
    void import("cesium").then((Cesium) => {
      try {
        v.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(73.9120, 18.5629, 35000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-65), roll: 0 },
          duration: 1.2,
        });
      } catch {}
    });
  };

  const handleExport = async () => {
    if (!globeWrapRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(globeWrapRef.current, {
        backgroundColor: "#07100f",
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `raphael-globe-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("export failed", err);
    }
  };

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setTime(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  const layerProps = useMemo(() => layerOn, [layerOn]);

  const bottomStrip = (
    <div className="expl2-bottom-charts">
      <div className="expl2-mini">
        <div className="expl2-mini__h">Surface Temperature</div>
        <div className="expl2-colorbar lst" />
        <div className="expl2-scale"><span>15°C</span><span>30°C</span><span>45°C</span></div>
      </div>
      <div className="expl2-mini">
        <div className="expl2-mini__h">NDVI Green Cover</div>
        <div className="expl2-colorbar ndvi" />
        <div className="expl2-scale"><span>0.0</span><span>0.5</span><span>1.0</span></div>
      </div>
      <div className="expl2-mini">
        <div className="expl2-mini__h">Precipitation Forecast</div>
        <div className="expl2-bars">
          <div><i style={{ height: "30%" }} /><span>Today</span></div>
          <div><i style={{ height: "60%" }} /><span>+1d</span></div>
          <div><i style={{ height: "20%" }} /><span>+2d</span></div>
        </div>
      </div>
      <div className="expl2-mini">
        <div className="expl2-mini__h">Wind &amp; Weather</div>
        <div className="expl2-wind">
          <div className="expl2-wind__arrow" style={{ transform: "rotate(45deg)" }}>
            <Wind size={16} />
          </div>
          <div className="expl2-wind__stats">
            12 km/h NE<br />
            Humidity 62%<br />
            UV Index 7
          </div>
        </div>
      </div>
      <div className="expl2-mini">
        <div className="expl2-mini__h" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Reasoning Trace</span><span>{REASONING.length} LINES</span>
        </div>
        <div className="expl2-trace">
          {REASONING.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );


  return (
    <div className="canopy-scope" style={{ position: "absolute", inset: 0 }}>
      <div className="expl2-shell">
        {/* TOP TOOLBAR */}
        <div className="expl2-topbar">
          <div className="expl2-search" ref={searchRef} style={{ position: "relative" }}>
            <Search size={13} color="#9fb0a3" />
            <input
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchFocused(true);
              }}
              onFocus={() => setSearchFocused(true)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--cream-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                  marginRight: 4
                }}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
            <span className="expl2-kbd">Ctrl K</span>

            {/* Dropdown Results */}
            {searchFocused && searchQuery.trim().length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: "100%",
                  maxHeight: 220,
                  overflowY: "auto",
                  background: "#080c08",
                  border: "1px solid rgba(154,190,180,0.25)",
                  borderRadius: 4,
                  zIndex: 100,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  scrollbarWidth: "thin",
                  scrollbarColor: "var(--olive) transparent",
                }}
              >
                {searchLoading ? (
                  <div style={{ padding: "8px 12px", color: "var(--cream-muted)" }}>
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: "8px 12px", color: "var(--cream-muted)" }}>
                    No results found
                  </div>
                ) : (
                  searchResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectLocation(r)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "8px 12px",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        borderTop: i > 0 ? "1px solid rgba(154,190,180,0.08)" : "none",
                        color: "var(--cream)",
                        cursor: "pointer",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        transition: "background 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(74,124,89,0.15)";
                        e.currentTarget.style.color = "var(--olive)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--cream)";
                      }}
                    >
                      {r.display_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button className="expl2-chip" type="button">
            IN PUNE MH <ChevronDown size={12} />
          </button>
          <div className="expl2-timeline">
            <button
              className="expl2-playbtn"
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <div className="expl2-tlrange" ref={tlRef} onClick={onTrackClick}>
              <div className="expl2-tlrange__track">
                <div className="expl2-tlrange__fill" style={{ width: `${time}%` }} />
                <div className="expl2-tlrange__handle" style={{ left: `${time}%` }} />
              </div>
              <div className="expl2-tlrange__ticks">
                {TICKS.map((t) => (
                  <div
                    key={t.label}
                    className="expl2-tlrange__tick"
                    style={{ position: "absolute", left: `${t.pct}%` }}
                  >
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button className="expl2-iconbtn" title="Sync / Zoom to zones" type="button" onClick={handleSync}><RefreshCw size={14} /></button>
          <button className="expl2-iconbtn" title="Compare" type="button"><GitCompare size={14} /></button>
          <button className="expl2-iconbtn" title="Export PNG" type="button" onClick={handleExport}><Download size={14} /></button>
          <div style={{ position: "relative" }}>
            <button
              className="expl2-iconbtn"
              title="Notifications"
              type="button"
              onClick={() => setBellOpen((o) => !o)}
            >
              <Bell size={14} />
              <span style={{
                position: "absolute", top: 2, right: 2, width: 6, height: 6,
                borderRadius: "50%", background: "#e05c4f",
              }} />
            </button>
            {bellOpen && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  width: 280, background: "#080c08",
                  border: "1px solid rgba(154,190,180,0.25)", borderRadius: 6,
                  padding: 10, zIndex: 50,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                  fontFamily: "var(--font-mono)", fontSize: 11,
                }}
              >
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  color: "var(--cream-muted)", letterSpacing: "0.16em",
                  marginBottom: 8,
                }}>
                  <span>ZONE ALERTS</span>
                  <span>{zones.filter((z) => z.severity !== "nominal").length}</span>
                </div>
                {zones.map((z) => {
                  const c = z.severity === "critical" ? "#e05c4f"
                    : z.severity === "warning" ? "#d4a853" : "#6da079";
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => { setSelectedZone(z); setBellOpen(false); }}
                      style={{
                        display: "flex", width: "100%", alignItems: "center",
                        gap: 8, padding: "6px 4px", background: "transparent",
                        border: "none", borderTop: "1px solid rgba(154,190,180,0.08)",
                        color: "var(--cream)", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: c, boxShadow: `0 0 6px ${c}`,
                      }} />
                      <span style={{ flex: 1 }}>{z.name}</span>
                      <span style={{ color: c }}>{z.severity.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MAIN ROW: left rail | globe area | right rail */}
        <div className="expl2-mainrow">
          <div className="expl2-rail">
            {!leftOpen && (
              <button
                type="button"
                className="expl2-rail__tab"
                onClick={() => setLeftOpen(true)}
                aria-label="Open layers panel"
              >
                LAYERS
              </button>
            )}
          </div>
          <div className="expl2-main">
          <div className="expl2-globewrap" ref={globeWrapRef}>
            <Suspense fallback={<div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--cream-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.24em", fontSize: 11 }}>LOADING GLOBE…</div>}>
              <RaphaelGlobe
                layers={layerProps}
                mode={mode}
                onCameraChange={setCamera}
                zones={zones}
                showZones={!!layerOn.risk}
                onZoneSelect={setSelectedZone}
                onViewerReady={(v) => { viewerRef.current = v; }}
              />
            </Suspense>
          </div>

          <button
            className="expl2-23btn"
            type="button"
            onClick={() => setMode((m) => (m === "3D" ? "2D" : "3D"))}
            style={{ top: 90, right: 14 }}
          >
            {mode} ⇄ {mode === "3D" ? "2D" : "3D"}
          </button>

          {/* SECTION 1E — Zone status update banner (top, between panels) */}
          <div
            className="expl2-banner"
            style={{
              position: "absolute",
              top: 14,
              left: leftOpen ? 248 : 50,
              right: rightOpen ? 308 : 50,
              height: 64,
              zIndex: 7,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 14px",
              background: bannerBg,
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(74,124,89,0.32)",
              borderLeft: bannerBorderLeft,
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              color: "var(--cream)",
              transition: "left .25s ease, right .25s ease",
              pointerEvents: "auto",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, letterSpacing: "0.22em", color: "#d4a853",
                textTransform: "uppercase", marginBottom: 4,
              }}>
                ZONE STATUS UPDATE
              </div>
              <div style={{
                fontSize: 11.5, color: "var(--cream)", lineHeight: 1.35,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {selectedZone.classification} — monitor AQI {selectedZone.aqi}, LST {selectedZone.lst}°C, NDVI {selectedZone.ndvi.toFixed(2)} across {selectedZone.name}.
              </div>
            </div>
            <div style={{ width: 1, height: 38, background: "rgba(154,190,180,0.22)" }} />
            <div style={{
              display: "flex", flexDirection: "column", gap: 3,
              fontSize: 10, color: "var(--cream-muted)", letterSpacing: "0.12em",
            }}>
              <span>MET {metMin}M</span>
              <span style={{
                display: "inline-block", padding: "1px 6px",
                border: "1px solid rgba(154,190,180,0.25)", borderRadius: 10,
                color: "var(--cream)", fontSize: 9, letterSpacing: "0.16em",
              }}>
                {selectedZone.severity.toUpperCase()}
              </span>
            </div>
            <div style={{
              padding: "4px 8px",
              border: `1px solid ${selectedZone.severity === "critical" ? "#e05c4f" : "#d4a853"}`,
              color: selectedZone.severity === "critical" ? "#e05c4f" : "#d4a853",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            }}>
              {Math.round(selectedZone.risk * 10)}% CONF
            </div>
            <button
              type="button"
              onClick={handleFocusMap}
              style={{
                background: "rgba(8,12,8,0.6)",
                border: "1px solid rgba(74,124,89,0.55)",
                color: "var(--olive)",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 10, letterSpacing: "0.2em",
                cursor: "pointer", textTransform: "uppercase",
              }}
            >
              FOCUS MAP
            </button>
            {/* TODO Antigravity: wire banner from
                GET /api/v1/zones/{active_zone}/scorecard */}
          </div>

          {/* SECTION 1C — Zoom controls, bottom-right above bottombar */}
          <div
            style={{
              position: "absolute", right: rightOpen ? 308 : 14, bottom: 60, zIndex: 8,
              display: "flex", flexDirection: "column", gap: 4,
              transition: "right .25s ease",
            }}
          >
            {[
              { sym: "+", dir: 1 as const, label: "Zoom in" },
              { sym: "−", dir: -1 as const, label: "Zoom out" },
            ].map((b) => (
              <button
                key={b.sym}
                type="button"
                aria-label={b.label}
                onClick={() => handleZoom(b.dir)}
                style={{
                  width: 32, height: 32,
                  background: "#080c08",
                  border: "1px solid #1e2d1e",
                  color: "var(--cream)",
                  fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 1,
                  cursor: "pointer", transition: "border-color .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4a7c59")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e2d1e")}
              >
                {b.sym}
              </button>
            ))}
          </div>

          {/* Locate / recenter — bottom-left of globe */}
          <div
            style={{
              position: "absolute", left: leftOpen ? 248 : 14, bottom: 60, zIndex: 8,
              transition: "left .25s ease",
            }}
          >
            <LocateButton title="Recenter on Pune NE" onClick={handleRecenter} />
          </div>


          {/* LEFT PANEL */}
          {leftOpen && (
          <aside className="expl2-left">
            <div className="expl2-panel__head">
              <span>MAP LAYERS</span>
              <button
                className="expl2-iconbtn"
                type="button"
                style={{ width: 22, height: 22 }}
                onClick={() => setLeftOpen(false)}
                aria-label="Collapse layers panel"
              >
                <X size={12} />
              </button>
            </div>
            <div className="expl2-panel__body">
              {GROUPS.map((g) => (
                <div key={g.label} className="expl2-group">
                  <div className="expl2-group__label">{g.label}</div>
                  {g.layers.map((l) => (
                    <div key={l.id} className="expl2-layer">
                      <div className="expl2-layer__row">
                        <span className="expl2-dot" style={{ background: l.color, boxShadow: `0 0 6px ${l.color}` }} />
                        <span className="expl2-layer__name">{l.name}</span>
                        <div
                          className="expl2-switch"
                          data-on={layerOn[l.id] ? "true" : "false"}
                          role="button"
                          tabIndex={0}
                          onClick={() => setLayerOn((s) => ({ ...s, [l.id]: !s[l.id] }))}
                        />
                      </div>
                      {l.opacity && layerOn[l.id] && (
                        <div className="expl2-opacity">
                          <div
                            className="expl2-opacity__fill"
                            style={{ width: `${opacity[l.id] ?? 80}%` }}
                          />
                          <input
                            type="range" min={0} max={100}
                            value={opacity[l.id] ?? 80}
                            onChange={(e) => setOpacity((s) => ({ ...s, [l.id]: Number(e.target.value) }))}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="expl2-basemaps">
              {[
                { k: "sat", lbl: "Satellite", bg: "linear-gradient(135deg,#1a3a2a,#2a5a3a)" },
                { k: "dark", lbl: "Dark", bg: "linear-gradient(135deg,#0a0f0a,#1a1f1a)" },
                { k: "light", lbl: "Light", bg: "linear-gradient(135deg,#d8d0c0,#a8a090)" },
              ].map((b) => (
                <div
                  key={b.k}
                  className="expl2-basemap"
                  data-on={basemap === b.k ? "true" : "false"}
                  style={{ background: b.bg }}
                  onClick={() => setBasemap(b.k as any)}
                >
                  {b.lbl}
                </div>
              ))}
            </div>
            <div className="expl2-readout">
              <span>LAT {camera.lat}</span>
              <span>LON {camera.lon}</span>
              <span>ALT {camera.altKm}km</span>
            </div>
          </aside>
          )}

          {/* RIGHT PANEL */}
          {rightOpen && (
          <aside className="expl2-right">
            <div className="expl2-panel__head">
              <span>ZONE PROFILE</span>
              <button
                className="expl2-iconbtn"
                type="button"
                style={{ width: 22, height: 22 }}
                onClick={() => setRightOpen(false)}
                aria-label="Collapse zone profile"
              >
                <X size={12} />
              </button>
            </div>
            <div className="expl2-panel__body" style={{ flex: 1 }}>
              <div className="expl2-zone-h">
                <div>
                  <div className="expl2-zone-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {selectedZone.name}
                    {(selectedZone as any).data_source === "mock" && <MockBadge />}
                  </div>
                  <div className="expl2-zone-sub">
                    {selectedZone.severity.toUpperCase()} · LST {selectedZone.lst}°C · {selectedZone.radiusKm}KM
                  </div>
                </div>
                <button
                  className="expl2-iconbtn"
                  type="button"
                  onClick={() => setBookmarked((b) => !b)}
                  style={{ width: 26, height: 26 }}
                >
                  <Star size={13} fill={bookmarked ? "#d4a853" : "none"} color={bookmarked ? "#d4a853" : "#9fb0a3"} />
                </button>
              </div>

              <div className="expl2-metricgrid">
                <Metric k="AQI" v={String(selectedZone.aqi)} tag={selectedZone.aqi > 150 ? "CRITICAL" : selectedZone.aqi > 100 ? "WARNING" : "NOMINAL"} tagColor={selectedZone.aqi > 150 ? "#e05c4f" : selectedZone.aqi > 100 ? "#d4a853" : "#6da079"} pct={Math.min(100, selectedZone.aqi / 3)} />
                <Metric k="LST" v={`${selectedZone.lst}°`} tag={selectedZone.lst > 35 ? "WARNING" : "NOMINAL"} tagColor={selectedZone.lst > 35 ? "#d4a853" : "#6da079"} pct={Math.min(100, (selectedZone.lst / 50) * 100)} />
                <Metric k="NDVI" v={selectedZone.ndvi.toFixed(2)} tag={selectedZone.ndvi < 0.4 ? "CRITICAL" : "NOMINAL"} tagColor={selectedZone.ndvi < 0.4 ? "#e05c4f" : "#6da079"} pct={selectedZone.ndvi * 100} />
                <Metric k="RISK" v={selectedZone.risk.toFixed(1)} tag={selectedZone.severity.toUpperCase()} tagColor={selectedZone.severity === "critical" ? "#e05c4f" : selectedZone.severity === "warning" ? "#d4a853" : "#6da079"} pct={selectedZone.risk * 10} />
              </div>

              <div className="expl2-risk">
                <div
                  className="expl2-metric__k"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span>Risk Score (AI)</span>
                  <DataLineageDrawer data={LINEAGE.riskScoreExplorer} />
                </div>
                <div className="expl2-risk__v">{Math.round(selectedZone.risk * 10)}<span style={{ color: "var(--cream-muted)", fontSize: 12 }}> /100</span></div>
                <div className="expl2-risk__bar"><i style={{ width: `${selectedZone.risk * 10}%`, background: "linear-gradient(90deg,#d4a853,#e05c4f)" }} /></div>
                <div className="expl2-metric__tag" style={{ color: selectedZone.severity === "critical" ? "#e05c4f" : "#d4a853" }}>{selectedZone.classification.toUpperCase()}</div>
                <div className="expl2-risk__expl">
                  Composite of elevated LST, declining NDVI, and PM2.5 above WHO limits.
                  Wind stagnation amplifies particulate retention across NCT.
                </div>
              </div>

              <div className="expl2-section">
                <div className="expl2-section__h">Recent Alerts</div>
                <div className="expl2-alerts-empty">No active alerts</div>
              </div>

              <div className="expl2-section">
                <div className="expl2-section__h">AQI Trend (7 Days)</div>
                <div style={{ height: 80 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={AQI_TREND} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                      <defs>
                        <linearGradient id="aqiFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a370d6" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="#a370d6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="d" tick={{ fill: "#9fb0a3", fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#9fb0a3", fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ background: "#0d1717", border: "1px solid rgba(154,190,180,0.3)", fontSize: 11 }} />
                      <Area type="monotone" dataKey="v" stroke="#a370d6" strokeWidth={2} fill="url(#aqiFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="expl2-section">
                <div className="expl2-section__h">AI Insights</div>
                <div className="expl2-insights">
                  <div className="expl2-insight"><i style={{ background: "#e05c4f" }} />PM2.5 trending +14% week-over-week in NCT core.</div>
                  <div className="expl2-insight"><i style={{ background: "#d4a853" }} />Heat-island intensifying along NH-9 corridor.</div>
                  <div className="expl2-insight"><i style={{ background: "#6da079" }} />Vegetation buffer in Aravalli foothills stable.</div>
                </div>
              </div>
            </div>
          </aside>
          )}

          {/* (bottom mini-charts moved below globe — see bottomStrip) */}

          <div className="expl2-bottombar" style={{ right: rightOpen ? 308 : 56, left: leftOpen ? 248 : 14 }}>
            <span>T+{Math.round(time)}%</span>
            <span style={{ flex: 1 }}>Temporal Position · 360h observation window</span>
            <span>SYNCED · {new Date().toUTCString().split(" ")[4]} UTC</span>
          </div>
          </div>
          <div className="expl2-rail">
            {!rightOpen && (
              <button
                type="button"
                className="expl2-rail__tab"
                onClick={() => setRightOpen(true)}
                aria-label="Open zone profile"
                style={{ transform: "rotate(180deg)" }}
              >
                ZONE PROFILE
              </button>
            )}
          </div>
        </div>
        {/* BOTTOM STRIP — sits BELOW the globe, not over it */}
        {bottomStrip}
      </div>
    </div>
  );
}

function Metric({
  k, v, tag, tagColor, pct,
}: { k: string; v: string; tag: string; tagColor: string; pct: number }) {
  return (
    <div className="expl2-metric">
      <div className="expl2-metric__k">{k}</div>
      <div className="expl2-metric__v">{v}</div>
      <div className="expl2-metric__bar"><i style={{ width: `${pct}%`, background: tagColor }} /></div>
      <div className="expl2-metric__tag" style={{ color: tagColor }}>{tag}</div>
    </div>
  );
}
