import * as React from "react";
import { C, MONO, SANS, Panel, PanelHeader, MiniBar } from "../_shared/raphael-ui";

// TODO Antigravity: GET /api/v1/system/status (data source health)
const SOURCES = [
  { name: "OpenAQ v3", cat: "AIR QUALITY", status: "NOMINAL", last: "4m ago", next: "56m", records: "284,291", err: 0, on: true },
  { name: "WAQI", cat: "AIR QUALITY", status: "NOMINAL", last: "4m ago", next: "56m", records: "48,204", err: 0, on: true },
  { name: "NASA FIRMS", cat: "FIRE", status: "NOMINAL", last: "1h ago", next: "2h", records: "1,847", err: 0, on: true },
  { name: "Open-Meteo", cat: "WEATHER", status: "NOMINAL", last: "12m ago", next: "48m", records: "12,048", err: 0, on: true },
  { name: "MODIS LST", cat: "SATELLITE", status: "NOMINAL", last: "6h ago", next: "18h", records: "284", err: 0, on: true },
  { name: "Sentinel-2 NDVI", cat: "SATELLITE", status: "DELAYED", last: "2d ago", next: "—", records: "142", err: 3, on: true },
  { name: "GDACS Hazards", cat: "HAZARD", status: "NOMINAL", last: "55m ago", next: "5m", records: "28", err: 0, on: true },
  { name: "GADM Boundaries", cat: "GEOSPATIAL", status: "NOMINAL", last: "14d ago", next: "351d", records: "1,204", err: 0, on: true },
];

const STATUS_COLOR = (s: string) => (s === "NOMINAL" ? C.green : s === "DELAYED" ? C.amber : C.red);

// TODO Antigravity: GET /api/v1/system/status (service health)
const SERVICES = [
  { name: "FastAPI", port: ":8000", status: "RUNNING", uptime: "14H 23M" },
  { name: "Prefect", port: ":4200", status: "RUNNING", uptime: "14H 23M" },
  { name: "MLflow", port: ":5000", status: "RUNNING", uptime: "14H 18M" },
  { name: "Mage.ai", port: ":6789", status: "RUNNING", uptime: "14H 21M" },
  { name: "PostgreSQL", port: "", status: "RUNNING", uptime: "21D 04H" },
  { name: "Cesium CDN", port: "", status: "REACHABLE", uptime: "—" },
];

const USERS = [
  { letter: "A", name: "admin", role: "ADMIN", roleColor: C.red, active: "2m ago" },
  { letter: "B", name: "analyst1", role: "ANALYST", roleColor: C.amber, active: "1h ago" },
  { letter: "C", name: "viewer1", role: "VIEWER", roleColor: C.green, active: "3d ago" },
];

export default function SettingsView() {
  const [countdown, setCountdown] = React.useState(36 * 60 + 48);
  React.useEffect(() => {
    const id = setInterval(() => setCountdown((c) => (c <= 0 ? 60 * 60 : c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="raphael-scroll" style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}>
      {/* TOP ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: 10, marginBottom: 10 }}>
        {/* DATA SOURCES */}
        <Panel>
          <PanelHeader title="DATA SOURCE MANAGEMENT" right={`${SOURCES.length} SOURCES`} />
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 10 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["SOURCE", "CATEGORY", "STATUS", "LAST SYNC", "NEXT", "RECORDS", "ERR", "ON"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "6px 8px",
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
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <td style={{ padding: "6px 8px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{s.name}</td>
                  <td style={{ padding: "6px 8px", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{s.cat}</td>
                  <td style={{ padding: "6px 8px", color: STATUS_COLOR(s.status), borderBottom: `1px solid ${C.border}` }}>
                    ● {s.status}
                  </td>
                  <td style={{ padding: "6px 8px", color: C.text, borderBottom: `1px solid ${C.border}` }}>{s.last}</td>
                  <td style={{ padding: "6px 8px", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{s.next}</td>
                  <td style={{ padding: "6px 8px", color: C.olive, borderBottom: `1px solid ${C.border}` }}>{s.records}</td>
                  <td style={{ padding: "6px 8px", color: s.err > 0 ? C.red : C.muted, borderBottom: `1px solid ${C.border}` }}>{s.err}</td>
                  <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 28,
                        height: 14,
                        background: s.on ? C.olive : C.border,
                        borderRadius: 7,
                        position: "relative",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: s.on ? 16 : 2,
                          width: 10,
                          height: 10,
                          background: C.text,
                          borderRadius: "50%",
                        }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${C.border}` }}>
            {["⚡ SYNC ALL NOW", "⏸ PAUSE ALL", "📋 VIEW LOGS"].map((b) => (
              <button
                key={b}
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
                {b}
              </button>
            ))}
          </div>
        </Panel>

        {/* SYSTEM HEALTH */}
        <Panel>
          <PanelHeader title="SYSTEM HEALTH" />
          <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {SERVICES.map((s) => (
              <div key={s.name} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: C.muted }}>{s.port}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, marginTop: 4 }}>● {s.status}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 2 }}>UPTIME: {s.uptime}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              RESOURCE MONITOR
            </div>
            {[
              { l: "CPU", pct: 34, v: "34%", c: C.olive },
              { l: "RAM", pct: 61, v: "4.8GB / 8GB", c: C.olive },
              { l: "DISK", pct: 18, v: "28GB / 150GB", c: C.olive },
              { l: "DB CONN", pct: 10, v: "2/20", c: C.olive },
            ].map((r) => (
              <div key={r.l} style={{ marginBottom: 6, fontFamily: MONO, fontSize: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: C.muted }}>{r.l}</span>
                  <span style={{ color: C.text }}>{r.v}</span>
                </div>
                <MiniBar pct={r.pct} color={r.pct >= 85 ? C.red : r.pct >= 70 ? C.amber : C.olive} />
              </div>
            ))}
          </div>

          <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 9, color: C.muted, lineHeight: 1.6 }}>
            <div>LAST CYCLE: 23M AGO · DURATION: 4M 12S</div>
            <div>MODELS: Prophet ✓ IsolationForest ✓ KMeans ✓ RiskScorer ✓</div>
            <div>
              NEXT CYCLE:{" "}
              <span style={{ color: C.olive }}>
                {Math.floor(countdown / 60)}M {String(countdown % 60).padStart(2, "0")}S
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* BOTTOM ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {/* STORAGE */}
        <Panel>
          <PanelHeader title="STORAGE MANAGEMENT" />
          <div style={{ padding: 12, fontFamily: MONO, fontSize: 9 }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: C.green }}>●</span>{" "}
              <span style={{ color: C.text }}>raphael.db · 2.4GB · 1,847,291 RECORDS</span>
            </div>
            {[
              { l: "Raw Metrics", v: 90 },
              { l: "Processed Data", v: 180 },
              { l: "Reports", v: 365 },
            ].map((r) => (
              <div key={r.l} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: C.muted }}>{r.l}</span>
                  <span style={{ color: C.olive }}>{r.v} days</span>
                </div>
                <input type="range" min={1} max={365} defaultValue={r.v} style={{ width: "100%", accentColor: C.olive }} />
              </div>
            ))}
            <div style={{ color: C.amber, marginTop: 10 }}>~124MB ELIGIBLE FOR PURGE</div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button style={{ ...btn, borderColor: C.red, color: C.red }}>🗑 PURGE EXPIRED</button>
              <button style={btn}>💾 BACKUP DB</button>
            </div>
          </div>
        </Panel>

        {/* ACCESS */}
        <Panel>
          <PanelHeader title="CONSOLE ACCESS CONTROL" />
          <div style={{ padding: 12 }}>
            {USERS.map((u) => (
              <div
                key={u.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: `1px solid ${C.border}`,
                  fontFamily: MONO,
                  fontSize: 10,
                }}
              >
                <span style={{ color: C.green }}>●</span>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: C.cream,
                  }}
                >
                  {u.letter}
                </span>
                <span style={{ color: C.text, flex: 1 }}>{u.name}</span>
                <span
                  style={{
                    padding: "1px 6px",
                    background: `${u.roleColor}22`,
                    color: u.roleColor,
                    border: `1px solid ${u.roleColor}55`,
                    fontSize: 8,
                    letterSpacing: "0.1em",
                  }}
                >
                  {u.role}
                </span>
                <span style={{ color: C.muted, fontSize: 8 }}>{u.active}</span>
                <span style={{ color: C.muted, cursor: "pointer" }}>✎</span>
                <span style={{ color: C.muted, cursor: "pointer" }}>🗑</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 9 }}>
              <a href="#" style={{ color: C.olive, textDecoration: "none", letterSpacing: "0.1em" }}>
                VIEW ACTIVITY LOG →
              </a>
            </div>
            <button style={{ ...btn, width: "100%", marginTop: 10 }}>+ ADD USER</button>
          </div>
        </Panel>

        {/* APP CONFIG */}
        <Panel>
          <PanelHeader title="APPLICATION CONFIG" />
          <div style={{ padding: 12, fontFamily: MONO, fontSize: 9, lineHeight: 1.7 }}>
            <div style={{ color: C.text, marginBottom: 8 }}>
              RAPHAEL <span style={{ color: C.olive }}>v1.0.0</span> · BUILD 20260613
              <div style={{ color: C.muted, fontSize: 8 }}>TAURI v2 · REACT 18 · FASTAPI 0.111</div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ color: C.muted, letterSpacing: "0.1em" }}>ACTIVE REGION:</div>
              <div style={{ color: C.text }}>PUNE METROPOLITAN</div>
              <button style={{ ...btn, marginTop: 4, padding: "2px 8px", fontSize: 8 }}>CHANGE REGION</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ color: C.muted, letterSpacing: "0.1em", marginBottom: 4 }}>LANGUAGE:</div>
              <div style={{ display: "flex", gap: 4 }}>
                {["EN", "HI", "DE", "MR"].map((l, i) => (
                  <span
                    key={l}
                    style={{
                      padding: "2px 8px",
                      border: `1px solid ${i === 0 ? C.olive : C.border}`,
                      color: i === 0 ? C.olive : C.muted,
                      background: i === 0 ? `${C.olive}22` : C.bg,
                      fontSize: 9,
                    }}
                  >
                    {l} {i === 0 ? "●" : ""}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12, color: C.muted }}>
              <div style={{ color: C.text }}>PUNE CITY TILES · 120MB · Z 0-16</div>
              <div style={{ color: C.text }}>INDIA BASE TILES · 600MB · Z 0-10</div>
              <button style={{ ...btn, marginTop: 4, padding: "2px 8px", fontSize: 8 }}>+ DOWNLOAD REGION</button>
            </div>

            <div style={{ marginTop: 12, color: C.muted }}>
              VERSION CHECK: <span style={{ color: C.green }}>UP TO DATE</span> · 2H AGO
              <div>
                <button style={{ ...btn, marginTop: 4, padding: "2px 8px", fontSize: 8 }}>CHECK FOR UPDATES</button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: C.bg,
  border: `1px solid ${C.olive}`,
  color: C.olive,
  padding: "4px 10px",
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: "0.1em",
  cursor: "pointer",
};
