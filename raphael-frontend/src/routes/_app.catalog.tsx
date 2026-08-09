import { createFileRoute } from "@tanstack/react-router";
import { C, MONO, SANS, Panel, PanelHeader } from "@/views/_shared/raphael-ui";

function CatalogView() {
  return (
    <div className="raphael-scroll" style={{ padding: 12, background: C.bg, color: C.text, fontFamily: SANS, height: "100%" }}>
      <Panel style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
          <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>
            [ DATA CATALOG · CUSTOM IMPORT PIPELINE ]
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                padding: "3px 8px",
                background: `${C.green}22`,
                border: `1px solid ${C.green}55`,
                color: C.green,
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.1em",
              }}
            >
              MAGE.AI :6789 ● CONNECTED
            </span>
            <span
              style={{
                padding: "3px 8px",
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.muted,
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: "0.1em",
              }}
            >
              PIPELINES: 5 ACTIVE
            </span>
          </div>
        </div>
        <div style={{ padding: "0 14px 10px", fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.05em" }}>
          5 IMPORT FORMATS: <span style={{ color: C.olive }}>CSV · GEOJSON · KML · SHAPEFILE · EXCEL</span> · Last import: 2H AGO · Total imported records:{" "}
          <span style={{ color: C.text }}>4,821</span>
        </div>
      </Panel>

      {/* TODO Antigravity: GET http://localhost:6789/api/pipelines */}
      <Panel style={{ padding: 0 }}>
        <PanelHeader title="MAGE.AI PIPELINE CONSOLE" />
        <iframe
          src="about:blank"
          title="Mage.ai"
          style={{ width: "100%", height: 600, border: "none", background: C.bg }}
        />
        <div style={{ padding: 10, fontFamily: MONO, fontSize: 9, color: C.muted, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          // TODO Antigravity: iframe src="http://localhost:6789" when Mage.ai service is reachable
        </div>
      </Panel>
    </div>
  );
}

export const Route = createFileRoute("/_app/catalog")({ component: CatalogView });
