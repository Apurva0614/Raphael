import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Info, ExternalLink, X } from "lucide-react";

// TODO Antigravity: Wire to GET /api/v1/system/lineage?metric=x&zone_id=y
// Returns: source, acquired_at, cloud_cover, resolution, model_version,
// mlflow_run_id, trained_at, confidence, pipeline_steps[], contributing_factors{}.
// MLflow run ID should deep-link to http://localhost:5000/#/runs/{id}

export type LineageData = {
  source: string;
  acquired: string;
  cloudCover?: string;
  resolution?: string;
  model?: string;
  trained?: string;
  confidence?: string;
  pipeline?: string;
  // ML-derived only
  computation?: string;
  contributing?: string;
  mlflowRun?: string;
};

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', system-ui, sans-serif";

const BG = "#0d150d";
const BORDER = "#1e2d1e";
const TEXT = "#e2e8f0";
const MUTED = "#64748b";
const OLIVE = "#4a7c59";
const CREAM = "#c8b89a";

function Row({ k, v, link }: { k: string; v: React.ReactNode; link?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 12px 1fr",
        gap: 4,
        padding: "2px 0",
        fontFamily: MONO,
        fontSize: 9,
        lineHeight: 1.5,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ color: MUTED, textTransform: "uppercase" }}>{k}</span>
      <span style={{ color: MUTED }}>→</span>
      <span style={{ color: CREAM, wordBreak: "break-word" }}>
        {v}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            style={{ color: OLIVE, marginLeft: 4, display: "inline-flex", verticalAlign: "middle" }}
          >
            <ExternalLink size={9} />
          </a>
        )}
      </span>
    </div>
  );
}

export function DataLineageDrawer({
  data,
  size = 12,
  align = "end",
  title = "[ DATA LINEAGE ]",
}: {
  data: LineageData;
  size?: number;
  align?: "start" | "center" | "end";
  title?: string;
}) {
  const mlLink = data.mlflowRun ? `http://localhost:5000/#/runs/${data.mlflowRun}` : undefined;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Show data lineage"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size + 4,
            height: size + 4,
            padding: 0,
            background: "transparent",
            border: "none",
            color: MUTED,
            cursor: "pointer",
            borderRadius: 2,
            transition: "color 120ms ease, background 120ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = OLIVE;
            (e.currentTarget as HTMLElement).style.background = "rgba(74,124,89,0.12)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = MUTED;
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <Info size={size} strokeWidth={1.6} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            maxWidth: 280,
            minWidth: 240,
            padding: 10,
            color: TEXT,
            fontFamily: SANS,
            boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
            transformOrigin: "var(--radix-popover-content-transform-origin)",
            animation: "lineage-in 140ms ease-out",
            zIndex: 9999,
          }}
        >
          <style>{`
            @keyframes lineage-in {
              from { opacity: 0; transform: scale(0.96); }
              to   { opacity: 1; transform: scale(1); }
            }
          `}</style>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
              paddingBottom: 6,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: OLIVE,
                letterSpacing: "0.15em",
                fontWeight: 700,
              }}
            >
              {title}
            </span>
            <Popover.Close
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                color: MUTED,
                cursor: "pointer",
                padding: 2,
                display: "inline-flex",
              }}
            >
              <X size={11} />
            </Popover.Close>
          </div>

          <Row k="Source" v={data.source} />
          <Row k="Acquired" v={data.acquired} />
          {data.cloudCover && <Row k="Cloud Cover" v={data.cloudCover} />}
          {data.resolution && <Row k="Resolution" v={data.resolution} />}
          {data.model && <Row k="Model" v={data.model} />}
          {data.trained && <Row k="Trained" v={data.trained} />}
          {data.confidence && <Row k="Confidence" v={data.confidence} />}
          {data.pipeline && <Row k="Pipeline" v={data.pipeline} />}

          {(data.computation || data.contributing || data.mlflowRun) && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: `1px dashed ${BORDER}`,
              }}
            >
              {data.computation && <Row k="Computation" v={data.computation} />}
              {data.contributing && <Row k="Contributing" v={data.contributing} />}
              {data.mlflowRun && <Row k="MLflow Run" v={data.mlflowRun} link={mlLink} />}
            </div>
          )}

          <Popover.Arrow width={10} height={5} style={{ fill: BORDER }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------- Preset mock lineage records for the various card sites ----------

export const LINEAGE: Record<string, LineageData> = {
  aqi: {
    source: "OpenAQ v3 + CPCB India",
    acquired: "2026-06-20 11:42 UTC",
    cloudCover: "n/a (ground stations)",
    resolution: "12 stations · point",
    model: "openaq-aggregator-2.3",
    trained: "2026-06-14 09:00 UTC",
    confidence: "85% CI",
    pipeline: "Pull → dedupe → 1h rolling avg → station-weighted",
  },
  lst: {
    source: "MODIS MOD11A1 (NASA Earthdata)",
    acquired: "2026-06-19 14:30 UTC",
    cloudCover: "9% (clear)",
    resolution: "1km",
    model: "modis-lst-resampler-1.4",
    trained: "2026-06-13 02:00 UTC",
    confidence: "80% CI",
    pipeline: "Rasterio → reproject → clip → colormap",
  },
  ndvi: {
    source: "Sentinel-2 L2A (Copernicus)",
    acquired: "2026-06-18 05:21 UTC",
    cloudCover: "3% (clear)",
    resolution: "10m",
    model: "ndvi-bandmath-1.0",
    trained: "n/a (deterministic)",
    confidence: "—",
    pipeline: "S2 B4/B8 → (NIR−R)/(NIR+R) → cloud mask → zonal mean",
  },
  composite: {
    source: "Internal · ml_outputs (composite_risk)",
    acquired: "2026-06-20 11:42 UTC",
    model: "prophet-1.1.5 (run #4821)",
    trained: "2026-06-13 02:00 UTC",
    confidence: "80% CI",
    pipeline: "AQ+LST+NDVI joined → MinMax → weighted sum",
    computation: "Weighted MinMax v1.0",
    contributing: "AQ 40% · LST 35% · NDVI 25%",
    mlflowRun: "abc123def456",
  },
  signalHeat: {
    source: "Isolation Forest · heat anomaly",
    acquired: "2026-06-20 11:00 UTC",
    model: "iforest-heat-2.1 (run #5102)",
    trained: "2026-06-12 22:00 UTC",
    confidence: "87%",
    pipeline: "LST tiles → 7d Δ → IForest → cluster → narrative",
    computation: "Z-score vs 30d baseline",
    contributing: "LST 60% · NDVI 25% · Urban 15%",
    mlflowRun: "5102a7b3c8e1",
  },
  signalPM: {
    source: "Prophet · PM2.5 forecast",
    acquired: "2026-06-20 11:00 UTC",
    model: "prophet-pm25-3.0 (run #5118)",
    trained: "2026-06-19 02:00 UTC",
    confidence: "73%",
    pipeline: "OpenAQ → resample 1h → Prophet w/ wind regressor",
    computation: "Week-over-week delta",
    contributing: "PM2.5 80% · Wind 12% · Traffic 8%",
    mlflowRun: "5118ff90ab21",
  },
  signalVeg: {
    source: "Sentinel-2 NDVI trend",
    acquired: "2026-06-19 05:21 UTC",
    cloudCover: "3%",
    resolution: "10m",
    model: "ndvi-trend-detector-1.2",
    trained: "n/a (deterministic)",
    confidence: "91%",
    pipeline: "NDVI 90d → Mann-Kendall → zonal aggregate",
  },
  riskScoreExplorer: {
    source: "Internal · zones.risk_score",
    acquired: "2026-06-20 11:42 UTC",
    model: "prophet-1.1.5 (run #4821)",
    trained: "2026-06-13 02:00 UTC",
    confidence: "80% CI",
    pipeline: "Zone metrics → normalize → weighted sum → 0-10",
    computation: "Weighted MinMax v1.0",
    contributing: "AQ 40% · LST 35% · NDVI 25%",
    mlflowRun: "abc123def456",
  },
  pm25Forecast: {
    source: "OpenAQ · 24h history + Prophet forecast",
    acquired: "2026-06-20 11:00 UTC",
    model: "prophet-pm25-3.0 (run #5118)",
    trained: "2026-06-19 02:00 UTC",
    confidence: "80% CI · RMSE 12.4",
    pipeline: "Pull → 1h resample → Prophet → 48h horizon",
    computation: "Additive seasonality + wind regressor",
    contributing: "Trend 55% · Daily 25% · Wind 20%",
    mlflowRun: "5118ff90ab21",
  },
  lstForecast: {
    source: "MODIS MOD11A1 + Prophet diurnal",
    acquired: "2026-06-19 14:30 UTC",
    cloudCover: "9%",
    resolution: "1km",
    model: "prophet-lst-2.4 (run #5121)",
    trained: "2026-06-19 03:00 UTC",
    confidence: "80% CI",
    pipeline: "MODIS tiles → zonal mean → Prophet diurnal",
    computation: "Diurnal cycle + 24h trend",
    contributing: "Diurnal 70% · Trend 30%",
    mlflowRun: "5121cc8d7e02",
  },
};
