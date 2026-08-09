import * as React from "react";
import { C, MONO, SANS, Panel, PanelHeader, Pill } from "../_shared/raphael-ui";

const REPORT_TYPES = [
  { icon: "📍", label: "ZONE SCORECARD" },
  { icon: "⚖", label: "COMPARISON MATRIX" },
  { icon: "🔔", label: "ALERT SUMMARY" },
  { icon: "📈", label: "TREND ANALYSIS" },
  { icon: "🗺", label: "SPATIAL BRIEF" },
  { icon: "⚙", label: "CUSTOM ASSEMBLY" },
];

const SECTIONS = [
  "Executive Summary (AI-generated)",
  "Map Snapshot + Active Layers",
  "Zone Scorecard (all indicators)",
  "48H Forecast Charts",
  "Risk Score Breakdown",
  "Anomaly Event Log",
  "Alert History (selected period)",
  "Data Source Citations",
  "Statistical Appendix",
];

const STAGES = [
  { n: "①", name: "DATA COLLECTION", sub: "Fetching observations + ML outputs" },
  { n: "②", name: "SPATIAL ANALYSIS", sub: "Running zone aggregations + risk calc" },
  { n: "③", name: "CHART RENDERING", sub: "Generating ECharts to SVG via pyecharts" },
  { n: "④", name: "MAP CAPTURE", sub: "Playwright headless browser screenshot" },
  { n: "⑤", name: "PDF COMPILATION", sub: "WeasyPrint HTML → PDF render" },
];

// TODO Antigravity: GET /api/v1/reports/list
const ARCHIVE = [
  { name: "Hadapsar Industrial · Zone Scorecard", type: "ZONE", color: C.olive, date: "2026-06-12", size: "2.8MB", pp: 14, lang: "EN", cls: "INTERNAL", zones: "Hadapsar Industrial" },
  { name: "Pune Comparison Brief · NE vs SW", type: "COMP", color: C.blue, date: "2026-06-10", size: "4.1MB", pp: 22, lang: "EN", cls: "INTERNAL", zones: "Pune NE, Kothrud, Katraj" },
  { name: "June Alert Summary · Week 23", type: "ALERT", color: C.red, date: "2026-06-08", size: "1.2MB", pp: 8, lang: "HI", cls: "UNCLASSIFIED", zones: "All regions" },
  { name: "Q2 Trend Analysis · Air Quality", type: "TREND", color: C.amber, date: "2026-06-05", size: "3.4MB", pp: 18, lang: "EN", cls: "INTERNAL", zones: "Pune Metro" },
  { name: "Katraj Hills · Zone Scorecard", type: "ZONE", color: C.olive, date: "2026-06-03", size: "2.6MB", pp: 12, lang: "MR", cls: "RESTRICTED", zones: "Katraj Hills" },
];

export default function ReportsView() {
  const [type, setType] = React.useState(0);
  const [cls, setCls] = React.useState("INTERNAL");
  const [lang, setLang] = React.useState("EN");
  const [fmt, setFmt] = React.useState("PDF A4");
  const [filter, setFilter] = React.useState("ALL");

  return (
    <div className="raphael-scroll" style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "35% 35% 30%", gap: 10 }}>
        {/* LEFT — CONFIGURATOR */}
        <Panel>
          <PanelHeader title="INTELLIGENCE REPORT GENERATOR" />
          <div style={{ padding: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              REPORT TYPE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
              {REPORT_TYPES.map((r, i) => {
                const active = type === i;
                return (
                  <button
                    key={r.label}
                    onClick={() => setType(i)}
                    style={{
                      background: active ? `${C.olive}22` : C.bg,
                      border: `1px solid ${active ? C.olive : C.border}`,
                      color: active ? C.olive : C.text,
                      padding: "8px 6px",
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {r.icon} {r.label}
                  </button>
                );
              })}
            </div>

            <Field label="TARGET ZONE/AREA">
              <input defaultValue="HADAPSAR INDUSTRIAL" style={inputStyle} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <Field label="FROM">
                <input type="date" defaultValue="2026-05-14" style={inputStyle} />
              </Field>
              <Field label="TO">
                <input type="date" defaultValue="2026-06-14" style={inputStyle} />
              </Field>
            </div>
            <Field label="ORGANIZATION">
              <input defaultValue="RAPHAEL OPS" style={inputStyle} />
            </Field>

            <Field label="CLASSIFICATION">
              <div style={{ display: "flex", gap: 4 }}>
                {["UNCLASSIFIED", "INTERNAL", "RESTRICTED"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCls(c)}
                    style={pillBtn(cls === c, c === "RESTRICTED" ? C.red : c === "INTERNAL" ? C.amber : C.olive)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="LANGUAGE">
              <div style={{ display: "flex", gap: 4 }}>
                {["EN", "HI", "DE", "MR"].map((l) => (
                  <button key={l} onClick={() => setLang(l)} style={pillBtn(lang === l)}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              SECTIONS
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.text, lineHeight: 1.7 }}>
              {SECTIONS.map((s) => (
                <div key={s}>☑ {s}</div>
              ))}
            </div>

            <Field label="FORMAT">
              <div style={{ display: "flex", gap: 4 }}>
                {["PDF A4", "PDF LETTER", "CSV"].map((f) => (
                  <button key={f} onClick={() => setFmt(f)} style={pillBtn(fmt === f)}>
                    {f}
                  </button>
                ))}
              </div>
            </Field>

            <button
              style={{
                marginTop: 12,
                width: "100%",
                background: `${C.olive}22`,
                border: `1px solid ${C.olive}`,
                color: C.olive,
                padding: 10,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: "0.18em",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ⚡ GENERATE REPORT
            </button>
            <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: C.muted, textAlign: "center" }}>
              EST. 14 PAGES · ~2.8MB · ~45 SEC
            </div>
          </div>
        </Panel>

        {/* CENTER — PIPELINE */}
        <Panel>
          <PanelHeader title="GENERATION PIPELINE" />
          <div style={{ padding: 14 }}>
            {STAGES.map((s) => (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: MONO,
                    fontSize: 14,
                    color: C.muted,
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 2 }}>{s.sub}</div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>IDLE</div>
              </div>
            ))}
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9, color: C.muted, textAlign: "center", letterSpacing: "0.1em" }}>
              IDLE — AWAITING GENERATION REQUEST
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
            <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              REPORT PREVIEW
            </div>
            <div
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                height: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <svg viewBox="0 0 200 240" width="80" height="100">
                <rect x="10" y="10" width="180" height="220" fill="none" stroke={C.border} />
                <rect x="20" y="20" width="160" height="14" fill={C.olive} opacity={0.4} />
                <line x1="20" y1="48" x2="180" y2="48" stroke={C.muted} strokeOpacity={0.3} />
                <line x1="20" y1="58" x2="170" y2="58" stroke={C.muted} strokeOpacity={0.3} />
                <line x1="20" y1="68" x2="150" y2="68" stroke={C.muted} strokeOpacity={0.3} />
                <rect x="20" y="84" width="160" height="60" fill="none" stroke={C.olive} strokeOpacity={0.4} />
                <line x1="20" y1="156" x2="180" y2="156" stroke={C.muted} strokeOpacity={0.3} />
                <line x1="20" y1="166" x2="170" y2="166" stroke={C.muted} strokeOpacity={0.3} />
                <rect x="20" y="184" width="70" height="40" fill="none" stroke={C.olive} strokeOpacity={0.4} />
                <rect x="100" y="184" width="80" height="40" fill="none" stroke={C.olive} strokeOpacity={0.4} />
              </svg>
              <div style={{ position: "absolute", bottom: 8, fontFamily: MONO, fontSize: 8, color: C.muted, letterSpacing: "0.15em" }}>
                PREVIEW WILL APPEAR HERE
              </div>
            </div>
          </div>
        </Panel>

        {/* RIGHT — ARCHIVE */}
        <Panel>
          <PanelHeader title="INTELLIGENCE ARCHIVE" right="14 REPORTS" />
          <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
            <input
              placeholder="FILTER REPORTS..."
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["ALL", "ZONE", "COMP", "ALERT", "TREND"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={pillBtn(filter === f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div style={{ maxHeight: 600, overflowY: "auto" }}>
            {ARCHIVE.map((r, i) => (
              <div key={i} style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: 600, flex: 1 }}>{r.name}</span>
                  <Pill color={r.color} filled>{r.type}</Pill>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 4 }}>
                  {r.date} · {r.size} · {r.pp}pp
                </div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 2 }}>
                  {r.zones} · <span style={{ color: C.olive }}>{r.lang}</span> ·{" "}
                  <span style={{ color: r.cls === "RESTRICTED" ? C.red : r.cls === "INTERNAL" ? C.amber : C.olive }}>{r.cls}</span>
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                  {["↓", "👁", "🗑"].map((ic) => (
                    <button
                      key={ic}
                      style={{
                        background: C.bg,
                        border: `1px solid ${C.border}`,
                        color: C.muted,
                        padding: "2px 8px",
                        fontFamily: MONO,
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: 10, borderTop: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 9, color: C.muted }}>
            <div style={{ marginBottom: 4 }}>ARCHIVE: 14 REPORTS · 28.4MB / 500MB QUOTA</div>
            <div style={{ height: 3, background: C.border }}>
              <div style={{ width: "5.7%", height: "100%", background: C.olive }} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "6px 8px",
  fontFamily: MONO,
  fontSize: 10,
};

function pillBtn(active: boolean, color: string = C.olive): React.CSSProperties {
  return {
    flex: 1,
    background: active ? `${color}22` : C.bg,
    border: `1px solid ${active ? color : C.border}`,
    color: active ? color : C.muted,
    padding: "5px 8px",
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: "0.1em",
    cursor: "pointer",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: SANS, fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
