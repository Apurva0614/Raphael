import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { C, MONO, SANS, SEV, Panel, PanelHeader, Pill } from "../_shared/raphael-ui";

const METRICS = [
  { k: "AQI", v: "142" },
  { k: "LST", v: "38.4°" },
  { k: "NDVI", v: "0.34" },
  { k: "PM2.5", v: "89.4" },
  { k: "FIRE RISK", v: "MED" },
  { k: "RISK SCORE", v: "7.8" },
];
const OPS = [">", "<", "≥", "≤", "Δ>", "Δ<"];
const WINDOWS = ["ALWAYS", "BUSINESS 09-18", "NIGHT 22-06", "WEEKEND", "CUSTOM"];

// TODO Antigravity: GET /api/v1/alerts/rules
const RULES = [
  { rule: "AQI > 150 · HADAPSAR · ALWAYS", sev: "critical", created: "2D AGO", triggers: 3 },
  { rule: "LST > 42°C · PUNE NE · BUSINESS", sev: "warning", created: "5D AGO", triggers: 12 },
  { rule: "NDVI < 0.20 · KATRAJ · ALWAYS", sev: "warning", created: "1W AGO", triggers: 4 },
  { rule: "Δ AQI > 25 · ALL ZONES · ALWAYS", sev: "info", created: "3D AGO", triggers: 8 },
];

// TODO Antigravity: GET /api/v1/alerts/events (SSE: /api/v1/alerts/stream)
const ALERTS = [
  { id: 1, ts: "14:22:08", zone: "HADAPSAR INDUSTRIAL", msg: "AQI exceeded 150 threshold", metric: "AQI", val: "187", sev: "critical", rule: "AQI HAZARD", dur: "3H 42M", ack: false },
  { id: 2, ts: "13:48:14", zone: "PUNE NE QUADRANT", msg: "LST exceeded 42°C threshold", metric: "LST", val: "44.2°C", sev: "critical", rule: "LST HEAT STRESS", dur: "2H 14M", ack: false },
  { id: 3, ts: "12:11:02", zone: "KATRAJ HILLS", msg: "NDVI dropped below 0.20", metric: "NDVI", val: "0.18", sev: "warning", rule: "VEGETATION LOSS", dur: "—", ack: false },
  { id: 4, ts: "11:54:33", zone: "HADAPSAR INDUSTRIAL", msg: "PM2.5 anomaly detected", metric: "PM2.5", val: "94.1", sev: "warning", rule: "PM2.5 SPIKE", dur: "1H 02M", ack: false },
  { id: 5, ts: "10:08:21", zone: "SHIVAJINAGAR", msg: "AQI delta exceeded 25 in 1H", metric: "ΔAQI", val: "+31", sev: "info", rule: "RAPID CHANGE", dur: "—", ack: true },
  { id: 6, ts: "09:32:09", zone: "PUNE NE QUADRANT", msg: "Thermal anomaly cluster", metric: "LST", val: "41.8°C", sev: "warning", rule: "LST HEAT STRESS", dur: "—", ack: true },
];

const TRIGGER_FREQ = [
  { d: "JUN 08", c: 3, w: 1, i: 0 },
  { d: "JUN 09", c: 1, w: 2, i: 1 },
  { d: "JUN 10", c: 4, w: 3, i: 1 },
  { d: "JUN 11", c: 2, w: 2, i: 0 },
  { d: "JUN 12", c: 0, w: 1, i: 2 },
  { d: "JUN 13", c: 2, w: 2, i: 1 },
  { d: "JUN 14", c: 2, w: 1, i: 0 },
];

export default function AlertsView() {
  const [metric, setMetric] = React.useState("AQI");
  const [op, setOp] = React.useState(">");
  const [win, setWin] = React.useState("ALWAYS");
  const [sev, setSev] = React.useState<"info" | "warning" | "critical">("warning");
  const [tab, setTab] = React.useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [countdown, setCountdown] = React.useState(272);

  React.useEffect(() => {
    const id = setInterval(() => setCountdown((c) => (c <= 0 ? 300 : c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const counts = {
    ALL: ALERTS.length,
    CRITICAL: ALERTS.filter((a) => a.sev === "critical").length,
    WARNING: ALERTS.filter((a) => a.sev === "warning").length,
    INFO: ALERTS.filter((a) => a.sev === "info").length,
  };

  const filtered = tab === "ALL" ? ALERTS : ALERTS.filter((a) => a.sev === tab.toLowerCase());

  return (
    <div className="raphael-scroll" style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "30% 40% 30%", gap: 10 }}>
        {/* LEFT — RULE ENGINE */}
        <Panel>
          <PanelHeader title="ALERT RULE ENGINE" />
          <div style={{ padding: 12 }}>
            {/* METRIC */}
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>METRIC</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 12 }}>
              {METRICS.map((m) => {
                const active = metric === m.k;
                return (
                  <button
                    key={m.k}
                    onClick={() => setMetric(m.k)}
                    style={{
                      background: active ? `${C.olive}22` : C.bg,
                      border: `1px solid ${active ? C.olive : C.border}`,
                      color: active ? C.olive : C.text,
                      padding: "6px 4px",
                      fontFamily: MONO,
                      fontSize: 9,
                      cursor: "pointer",
                      letterSpacing: "0.08em",
                    }}
                  >
                    <div>{m.k}</div>
                    <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{m.v}</div>
                  </button>
                );
              })}
            </div>

            {/* OPERATOR */}
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>OPERATOR</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {OPS.map((o) => (
                <button
                  key={o}
                  onClick={() => setOp(o)}
                  style={{
                    flex: 1,
                    background: op === o ? `${C.olive}22` : C.bg,
                    border: `1px solid ${op === o ? C.olive : C.border}`,
                    color: op === o ? C.olive : C.text,
                    padding: "6px 0",
                    fontFamily: MONO,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {o}
                </button>
              ))}
            </div>

            {/* THRESHOLD */}
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>THRESHOLD</div>
            <input
              defaultValue="150"
              style={{
                width: "100%",
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.olive,
                padding: "6px 8px",
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 4,
              }}
            />
            <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, marginBottom: 12 }}>
              WHO 24h LIMIT: 15 μg/m³ · NAAQS: 60 μg/m³
            </div>

            {/* ZONE */}
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>ZONE</div>
            <input
              placeholder="Search zones..."
              style={{
                width: "100%",
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "6px 8px",
                fontFamily: MONO,
                fontSize: 10,
                marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
              <Pill color={C.olive} filled>HADAPSAR ×</Pill>
              <Pill color={C.olive} filled>PUNE NE ×</Pill>
            </div>

            {/* TIME WINDOW */}
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>TIME WINDOW</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWin(w)}
                  style={{
                    background: win === w ? `${C.olive}22` : C.bg,
                    border: `1px solid ${win === w ? C.olive : C.border}`,
                    color: win === w ? C.olive : C.muted,
                    padding: "4px 8px",
                    fontFamily: MONO,
                    fontSize: 8,
                    cursor: "pointer",
                    letterSpacing: "0.08em",
                  }}
                >
                  {w}
                </button>
              ))}
            </div>

            {/* SEVERITY */}
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>SEVERITY</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {(["info", "warning", "critical"] as const).map((s) => {
                const col = SEV[s];
                const active = sev === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSev(s)}
                    style={{
                      flex: 1,
                      background: active ? `${col}22` : C.bg,
                      border: `1px solid ${active ? col : C.border}`,
                      color: active ? col : C.muted,
                      padding: "8px 4px",
                      fontFamily: MONO,
                      fontSize: 9,
                      cursor: "pointer",
                      letterSpacing: "0.1em",
                    }}
                  >
                    ◉ {s.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* NOTIFICATIONS */}
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.text, marginBottom: 12 }}>
              <div>☑ System tray notification</div>
              <div>☑ Dashboard badge</div>
              <div style={{ color: C.muted }}>☐ Email digest (disabled)</div>
            </div>

            <button
              style={{
                width: "100%",
                background: `${C.olive}22`,
                border: `1px solid ${C.olive}`,
                color: C.olive,
                padding: 10,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.15em",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + CREATE RULE
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <PanelHeader title="ACTIVE RULES" right="4 RULES" />
            {RULES.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  borderLeft: `3px solid ${SEV[r.sev]}`,
                  borderBottom: i < RULES.length - 1 ? `1px solid ${C.border}` : "none",
                }}
              >
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.text }}>{r.rule}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 2 }}>
                  CREATED {r.created} · TRIGGERED {r.triggers}× THIS WEEK
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* CENTER — LIVE FEED */}
        <Panel>
          <PanelHeader title="LIVE ALERT FEED" right={<span style={{ color: C.green }}>SSE CONNECTED ●</span>} />
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
            {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === t ? `2px solid ${C.olive}` : "2px solid transparent",
                  color: tab === t ? C.olive : C.muted,
                  padding: "8px 0",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                }}
              >
                {t} {counts[t]}
              </button>
            ))}
          </div>

          {/* CRITICAL BANNER */}
          <div
            style={{
              margin: 10,
              padding: 10,
              border: `1px solid ${C.red}`,
              borderLeft: `4px solid ${C.red}`,
              background: `${C.red}10`,
              fontFamily: MONO,
              fontSize: 10,
              color: C.text,
              animation: "rphPulse 2s ease-in-out infinite",
            }}
          >
            <div style={{ color: C.red, fontWeight: 700, letterSpacing: "0.1em" }}>⚠ ACTIVE EXCEEDANCE — HADAPSAR INDUSTRIAL</div>
            <div style={{ marginTop: 4, color: C.muted, fontSize: 9 }}>
              AQI <span style={{ color: C.red, fontWeight: 700 }}>187</span> (THRESHOLD: 150) · DURATION: 3H 42M · POPULATION EXPOSED: 284,000
            </div>
          </div>

          {/* FEED */}
          <div style={{ maxHeight: 540, overflowY: "auto" }}>
            {filtered.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: "10px 12px",
                  borderLeft: `3px solid ${SEV[a.sev]}`,
                  borderBottom: `1px solid ${C.border}`,
                  opacity: a.ack ? 0.5 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>{a.ts}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: 700 }}>{a.zone}</span>
                </div>
                <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10 }}>
                  <span style={{ color: C.olive }}>{a.metric}</span>{" "}
                  <span style={{ color: C.text }}>exceeded threshold · Current: </span>
                  <span style={{ color: SEV[a.sev], fontWeight: 700 }}>{a.val}</span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: C.muted, textDecoration: a.ack ? "line-through" : "none" }}>
                    TRIGGER · RULE: {a.rule} · DURATION: {a.dur}
                  </span>
                  {!a.ack && (
                    <button
                      style={{
                        background: C.bg,
                        border: `1px solid ${C.olive}`,
                        color: C.olive,
                        padding: "2px 8px",
                        fontFamily: MONO,
                        fontSize: 8,
                        cursor: "pointer",
                        letterSpacing: "0.15em",
                      }}
                    >
                      ACK
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${C.border}` }}>
            <button
              style={{
                background: C.bg,
                border: `1px solid ${C.olive}`,
                color: C.olive,
                padding: "4px 10px",
                fontFamily: MONO,
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              EXPORT CSV
            </button>
            <button
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.muted,
                padding: "4px 10px",
                fontFamily: MONO,
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              CLEAR ACKNOWLEDGED
            </button>
          </div>
        </Panel>

        {/* RIGHT — ANALYTICS */}
        <Panel>
          <PanelHeader title="ALERT INTELLIGENCE" />
          <div style={{ padding: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              TRIGGER FREQUENCY · 7D
            </div>
            <div style={{ height: 110 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TRIGGER_FREQ}>
                  <XAxis dataKey="d" tick={{ fill: C.muted, fontSize: 8, fontFamily: MONO }} />
                  <Bar dataKey="i" stackId="a" fill={C.blue} />
                  <Bar dataKey="w" stackId="a" fill={C.amber} />
                  <Bar dataKey="c" stackId="a" fill={C.red} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, marginTop: 4 }}>
              PEAK: <span style={{ color: C.red }}>8 ALERTS ON JUN 10</span>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              TOP TRIGGERED RULES
            </div>
            {[
              { rank: 1, rule: "LST > 42°C", triggers: 12, zones: 3, color: C.amber },
              { rank: 2, rule: "AQI > 150", triggers: 8, zones: 2, color: C.red },
              { rank: 3, rule: "NDVI < 0.20", triggers: 4, zones: 1, color: C.olive },
            ].map((r) => (
              <div key={r.rank} style={{ marginBottom: 6, fontFamily: MONO, fontSize: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.text }}>{r.rank}. {r.rule}</span>
                  <span style={{ color: r.color, fontWeight: 700 }}>{r.triggers}×</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 3, background: C.border }}>
                    <div style={{ width: `${r.triggers * 7}%`, height: "100%", background: r.color }} />
                  </div>
                  <span style={{ color: C.muted, fontSize: 8 }}>{r.zones} ZONES</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              ZONE ALERT HEATMAP
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {["HADAPSAR", "PUNE NE", "KATRAJ", "SHIVAJI", "KOTHRUD", "AUNDH"].map((z, i) => (
                <div key={z} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 60, fontFamily: MONO, fontSize: 8, color: C.muted }}>{z}</span>
                  {Array.from({ length: 7 }).map((_, d) => {
                    const v = Math.floor(Math.random() * 6) - i;
                    const col = v <= 0 ? "#111a11" : v <= 2 ? C.olive : v <= 4 ? C.amber : C.red;
                    return <div key={d} style={{ flex: 1, height: 14, background: col }} />;
                  })}
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, padding: 12, fontFamily: MONO, fontSize: 9, color: C.muted, lineHeight: 1.6 }}>
            EVALUATOR STATUS: <span style={{ color: C.green }}>RUNNING</span> · LAST CHECK: 5M AGO
            <br />
            RULES EVALUATED: 4 · NEXT CHECK:{" "}
            <span style={{ color: C.olive }}>
              {Math.floor(countdown / 60)}M {String(countdown % 60).padStart(2, "0")}S
            </span>
          </div>
        </Panel>
      </div>

      <style>{`@keyframes rphPulse { 0%,100% { box-shadow: 0 0 0 0 ${C.red}40 } 50% { box-shadow: 0 0 0 6px ${C.red}00 } }`}</style>
    </div>
  );
}
