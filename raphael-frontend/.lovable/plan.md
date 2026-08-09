# Plan — Port CANOPY into RAPHAEL

## Scope

Bring the CANOPY frontend's Brigade and Operator pages into this RAPHAEL project, keep their layout/components 1:1, then apply your label/value swaps.

CANOPY page → RAPHAEL route mapping:
- `Brigade.tsx` (map workspace) → `/explorer`
- `Operator.tsx` (fusion console) → `/dashboard`

I will not redesign these pages. Sidebar/topbar (AppShell), loading screen, and other routes stay as-is.

## Step 1 — Dependencies

Install: `cesium`, `resium`, `zustand`, `clsx` (CANOPY uses these). Configure Vite for Cesium static assets (CESIUM_BASE_URL, copy `node_modules/cesium/Build/Cesium/Workers|Assets|Widgets|ThirdParty` to `public/cesium`).

Note: Cesium adds ~3 MB to the bundle and needs a runtime token for high-res imagery (works without one, but with low-res Bing fallback / Natural Earth). I'll wire `VITE_CESIUM_ION_TOKEN` and fall back gracefully if absent.

## Step 2 — Copy CANOPY source 1:1

Copy from project `eefad510-...` into this repo, preserving paths:

- `src/components/`: ActionLog, ApproveBanner, AorMap, CesiumGlobe, CollapsibleStackSection, ConnectionStatus, DebugPanel, DecisionDetail, EmbeddingViz, EventCard, EventFeed, EventTimeline, KBCitationCard, MapStage, MissionAlert, MissionSummary, NarrationPanel, OperatorActionPanel, OrbitalTakeover, ReasoningPanel, ScenarioControls, ScenarioRail, ScenarioTimeline, SeverityRibbon, StatusCard, StressMode, Header
- `src/store/`, `src/hooks/`, `src/data/`, `src/types/`, `src/lib/` (CANOPY's, namespaced to avoid clobbering existing `src/lib/utils.ts`)
- `src/index.css` content merged into `src/styles.css` (CANOPY's `.brigade-shell`, `.operator-shell`, `.panel`, `.app-header`, etc.)

I will rename CANOPY's `src/lib/utils.ts` if it conflicts.

## Step 3 — Wire into TanStack routes

- `src/routes/_app.dashboard.tsx` renders a wrapper that mounts CANOPY's `Operator` body (no `<a href="/brigade">` header — sidebar handles nav).
- `src/routes/_app.explorer.tsx` renders a wrapper that mounts CANOPY's `Brigade` body.
- Strip CANOPY's `app-header` from both pages — the RAPHAEL AppShell topbar already exists.
- Replace `useCanopySocket` WebSocket URL with a no-op / env-gated stub so the build doesn't try to connect to a non-existent backend. Scenario data from `src/data/scenarioLibrary` drives the UI offline (Brigade already supports this).

## Step 4 — RAPHAEL label/value swaps

### Dashboard (`/dashboard`, ported from Operator)

Replace the Anomaly Queue / Decision Rail / ActionLog / EmbeddingViz / ReasoningPanel grid with the RAPHAEL surface, keeping CANOPY's panel styles:

- 4 KPI cards (CANOPY `StatusCard` style):
  - AQI · 142 · WARNING
  - LST · 38.4°C · WARNING
  - NDVI · 0.34 · CRITICAL
  - Composite Risk · 7.8/10 · CRITICAL
- Radar/signal ring axes: Heat Island · Particulate · Vegetation Loss · Water Stress · Urban Pressure
- Pipeline stages: Data Ingest · ML Enrichment · Anomaly Detection · Forecast · Report Ready
- Mini-map label: `SPATIAL SNAPSHOT — Pune Metropolitan Region`, coords `18.5204° N | 73.8567° E`
- System status CTA button text: `TRIGGER INTELLIGENCE CYCLE`

### Explorer (`/explorer`, ported from Brigade)

Keep CesiumGlobe code untouched. Replace panel content:

- Left floating layers panel toggles: LST Layer · NDVI Index · AQI Overlay · CO Concentration · Fire Hotspots · Custom Zones
- Right info panel labels: Zone Profile · Coordinates · AQI · LST · NDVI · Risk Score · Zone Classification
- Bottom timeline label: `TEMPORAL POSITION` (scrubber unchanged)
- Tooltip/label terminology: orbit→zone, signal→reading, target→location, track→observation, RF→atmospheric

All styling, animations, panel collapse behavior, and globe interactions stay as-is.

## Out of scope

- Live WebSocket backend (will run in offline/scenario mode)
- Any change to sidebar, topbar, loading screen, other routes
- New design tokens — CANOPY's CSS is copied verbatim and coexists with RAPHAEL's tokens

## Risk / heads-up

- Cesium asset copy adds a postinstall step and ~3 MB to the published bundle.
- CANOPY's CSS uses class-based theming, not Tailwind tokens — the two systems will coexist; some visual drift from the existing RAPHAEL token palette is expected on these two pages.
- This will take many file writes (~40 component files + store/data/types + CSS merge + route wrappers). I'll proceed in one batch.

Reply "go" to proceed, or tell me what to trim.
