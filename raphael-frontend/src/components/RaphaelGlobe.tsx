// @ts-nocheck
import { useEffect, useRef, useState } from "react";


// 1x1 colored PNG data URIs for layer placeholders
// TODO: Replace with real WMS/tile source in Antigravity
const LAYER_TILES: Record<string, string> = {
  lst: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAEElEQVR42mNk+M9Qz8DAAAAGAAH/lFv4XwAAAABJRU5ErkJggg==",
  pm25: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAEElEQVR42mNk+F9fz8DAAAAHAAIBJp8KAQAAAABJRU5ErkJggg==",
  ndvi: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAEElEQVR42mNkYPhfz8AAAAQDAQGAv6vqAAAAAElFTkSuQmCC",
  fire: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAEElEQVR42mNk+M9Qz8AAAAYAAf+UW/hfAAAAAElFTkSuQmCC",
};

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

function hexIcon(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <polygon points='16,3 28,10 28,22 16,29 4,22 4,10'
      fill='${color}22' stroke='${color}' stroke-width='2.5' stroke-linejoin='round' />
    <circle cx='16' cy='16' r='2.5' fill='${color}' />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const HEX_ICONS: Record<string, string> = {
  critical: hexIcon("#e05c4f"),
  warning: hexIcon("#d4a853"),
  nominal: hexIcon("#4a7c59"),
};

const getCirclePoints = (lon: number, lat: number, radiusKm: number) => {
  const points = [];
  const radiusMeters = radiusKm * 1000;
  const latR = radiusMeters / 111320;
  const lonR = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= 64; i++) {
    const theta = (i / 64) * Math.PI * 2;
    points.push(lon + lonR * Math.cos(theta), lat + latR * Math.sin(theta));
  }
  return points;
};

export function RaphaelGlobe({
  layers,
  mode = "3D",
  onCameraChange,
  zones = [],
  showZones = true,
  onZoneSelect,
  onViewerReady,
}: {
  layers: Record<string, boolean>;
  mode?: "2D" | "3D";
  onCameraChange?: (c: { lat: string; lon: string; altKm: string }) => void;
  zones?: ObservationZone[];
  showZones?: boolean;
  onZoneSelect?: (zone: ObservationZone) => void;
  onViewerReady?: (viewer: any) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const imageryRef = useRef<Record<string, any>>({});
  const zonesRef = useRef<ObservationZone[]>(zones);
  const onZoneSelectRef = useRef(onZoneSelect);
  const [contextLost, setContextLost] = useState(false);
  zonesRef.current = zones;
  onZoneSelectRef.current = onZoneSelect;

  // Listen for WebGL context loss on the underlying canvas
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onLost = (e: Event) => { e.preventDefault(); setContextLost(true); };
    const onRestored = () => setContextLost(false);
    const attach = () => {
      const c = root.querySelector("canvas");
      if (!c) return false;
      c.addEventListener("webglcontextlost", onLost as any, false);
      c.addEventListener("webglcontextrestored", onRestored as any, false);
      return true;
    };
    if (!attach()) {
      const id = window.setInterval(() => { if (attach()) window.clearInterval(id); }, 250);
      return () => window.clearInterval(id);
    }
  }, []);


  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let clickHandler: any = null;

    async function mount() {
      if (!containerRef.current) return;
      const Cesium = await import("cesium");
      if (cancelled || !containerRef.current) return;

      const token = (import.meta as any).env?.VITE_CESIUM_ION_TOKEN?.trim();
      if (token) Cesium.Ion.defaultAccessToken = token;

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement("div"),
        sceneMode:
          mode === "2D" ? Cesium.SceneMode.SCENE2D : Cesium.SceneMode.SCENE3D,
        scene3DOnly: mode !== "2D",
        useDefaultRenderLoop: false,
      });

      // Satellite imagery base
      try {
        const provider = await Cesium.createWorldImageryAsync({
          style: Cesium.IonWorldImageryStyle.AERIAL,
        });
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(provider);
      } catch (e) {
        console.error("Failed to load high-resolution aerial imagery:", e);
      }

      // Terrain Clamping
      try {
        viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
      } catch (e) {
        console.error("Failed to load world terrain:", e);
      }

      viewer.resolutionScale = window.devicePixelRatio || 1;
      try {
        viewer.scene.postProcessStages.fxaa.enabled = true;
      } catch {}

      // Section 2A — tile quality dials (pre-tuned for when real Ion lands)
      try {
        viewer.scene.globe.maximumScreenSpaceError = 1.5; // sharper tiles (default 2)
        viewer.scene.globe.tileCacheSize = 1000;          // larger cache, fewer re-fetches
        viewer.scene.globe.preloadSiblings = true;        // smoother panning
      } catch {}

      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#07100f");
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#07100f");
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.showGroundAtmosphere = true;

      // Section 1A — tactical default: Pune metro, ~35km AGL, steep pitch.
      // No orbital curvature; matches CANOPY tactical zoom.
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(73.8567, 18.5204, 35000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-65),
          roll: 0,
        },
      });

      viewer.camera.moveEnd.addEventListener(() => {
        if (!onCameraChange) return;
        const c = viewer.camera.positionCartographic;
        onCameraChange({
          lat: Cesium.Math.toDegrees(c.latitude).toFixed(4),
          lon: Cesium.Math.toDegrees(c.longitude).toFixed(4),
          altKm: (c.height / 1000).toFixed(0),
        });
      });

      // LEFT_CLICK → pick zone entity and fly camera
      clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((evt: any) => {
        const picked = viewer.scene.pick(evt.position);
        const id: string | undefined = picked?.id?.id;
        if (!id) return;
        const zone = zonesRef.current.find(
          (z) => id === `${z.id}-point` || id === `${z.id}-label` || id === `${z.id}-zone`,
        );
        if (!zone) return;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 150000),
          duration: 1.8,
        });
        onZoneSelectRef.current?.(zone);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      viewerRef.current = viewer;
      onViewerReady?.(viewer);

      const tick = () => {
        if (cancelled || viewer.isDestroyed()) return;
        viewer.resize();
        viewer.render();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    void mount();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      try { clickHandler?.destroy?.(); } catch {}
      try {
        viewerRef.current?.entities?.removeAll?.();
        viewerRef.current?.destroy?.();
      } catch {}
      viewerRef.current = null;
      imageryRef.current = {};
    };
  }, [mode]);

  // Sync imagery placeholders to layer toggles
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cancelled = false;
    import("cesium").then((Cesium) => {
      if (cancelled || !viewerRef.current) return;
      const v = viewerRef.current;
      for (const id of Object.keys(LAYER_TILES)) {
        const on = !!layers[id];
        const existing = imageryRef.current[id];
        if (on && !existing) {
          // TODO: Replace with real WMS/tile source in Antigravity
          const provider = new Cesium.SingleTileImageryProvider({
            url: LAYER_TILES[id],
            rectangle: Cesium.Rectangle.fromDegrees(-180, -85, 180, 85),
          });
          const layer = v.imageryLayers.addImageryProvider(provider);
          layer.alpha = 0.3;
          imageryRef.current[id] = layer;
        } else if (!on && existing) {
          try { v.imageryLayers.remove(existing, true); } catch {}
          delete imageryRef.current[id];
        }
      }
    });
    return () => { cancelled = true; };
  }, [layers]);

  // Sync zone entities (point + label + radius ellipse) per zones data
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cancelled = false;
    import("cesium").then((Cesium) => {
      if (cancelled || !viewerRef.current) return;
      const v = viewerRef.current;

      // Remove existing zone entities first (cheap rebuild for data changes)
      const toRemove: any[] = [];
      v.entities.values.forEach((e: any) => {
        const id = e.id as string;
        if (
          typeof id === "string" &&
          (id.endsWith("-point") ||
            id.endsWith("-label") ||
            id.endsWith("-zone") ||
            id.endsWith("-zone-outline") ||
            id.endsWith("-zone-edge-label"))
        ) {
          toRemove.push(e);
        }
      });
      toRemove.forEach((e) => v.entities.remove(e));

      const colorFor = (sev: string) =>
        sev === "critical"
          ? Cesium.Color.RED.withAlpha(0.9)
          : sev === "warning"
            ? Cesium.Color.fromCssColorString("#d4a853").withAlpha(0.9)
            : Cesium.Color.fromCssColorString("#4a7c59").withAlpha(0.9);

      for (const zone of zones) {
        const carto = Cesium.Cartographic.fromDegrees(zone.lon, zone.lat);
        Cesium.sampleTerrainMostDetailed(v.terrainProvider, [carto])
          .then((sampled) => {
            if (cancelled) return;
            const pos = sampled[0];
            const hasHeight = pos && typeof pos.height === "number" && !isNaN(pos.height);
            const terrainHeight = hasHeight ? pos.height : 0.0;
            const hr = hasHeight ? Cesium.HeightReference.RELATIVE_TO_TERRAIN : Cesium.HeightReference.CLAMP_TO_GROUND;

            const finalPosition = Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, terrainHeight);

            v.entities.add({
              id: `${zone.id}-point`,
              position: finalPosition,
              show: showZones,
              billboard: {
                image: HEX_ICONS[zone.severity] ?? HEX_ICONS.nominal,
                width: 28,
                height: 28,
                scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.6, 1.5e7, 0.6),
                translucencyByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 1.5e8, 0.0),
                heightReference: hr,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            v.entities.add({
              id: `${zone.id}-label`,
              position: finalPosition,
              show: showZones,
              label: {
                text: `${zone.name}\nAQI ${zone.aqi} · LST ${zone.lst}°C`,
                font: "11px JetBrains Mono, monospace",
                fillColor: Cesium.Color.fromCssColorString("#e8dcc8"),
                backgroundColor: Cesium.Color.fromCssColorString("#080c08").withAlpha(0.85),
                showBackground: true,
                backgroundPadding: new Cesium.Cartesian2(8, 4),
                pixelOffset: new Cesium.Cartesian2(0, -28),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
                heightReference: hr,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            // 1. Semi-transparent low-opacity fill ellipse
            v.entities.add({
              id: `${zone.id}-zone`,
              position: finalPosition,
              show: showZones,
              ellipse: {
                semiMinorAxis: zone.radiusKm * 1000,
                semiMajorAxis: zone.radiusKm * 1000,
                material:
                  zone.severity === "critical"
                    ? Cesium.Color.RED.withAlpha(0.02)
                    : Cesium.Color.fromCssColorString("#4a7c59").withAlpha(0.02),
                outline: false,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
            });

            // 2. Dashed circle outline polyline
            v.entities.add({
              id: `${zone.id}-zone-outline`,
              show: showZones,
              polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray(
                  getCirclePoints(zone.lon, zone.lat, zone.radiusKm)
                ),
                width: 2.0,
                material: new Cesium.PolylineDashMaterialProperty({
                  color:
                    zone.severity === "critical"
                      ? Cesium.Color.RED
                      : Cesium.Color.fromCssColorString("#a7b96f"),
                  dashLength: 16.0,
                }),
                clampToGround: true,
              },
            });

            // 3. Risk factor / classification label at circle's edge point (east-most)
            const radiusMeters = zone.radiusKm * 1000;
            const lonR = radiusMeters / (111320 * Math.cos((zone.lat * Math.PI) / 180));
            const edgeLon = zone.lon + lonR;
            const edgeLat = zone.lat;

            v.entities.add({
              id: `${zone.id}-zone-edge-label`,
              position: Cesium.Cartesian3.fromDegrees(edgeLon, edgeLat, terrainHeight),
              show: showZones,
              label: {
                text: zone.classification.toUpperCase(),
                font: "9px JetBrains Mono, monospace",
                fillColor:
                  zone.severity === "critical"
                    ? Cesium.Color.RED
                    : Cesium.Color.fromCssColorString("#a7b96f"),
                backgroundColor: Cesium.Color.fromCssColorString("#080c08").withAlpha(0.85),
                showBackground: true,
                backgroundPadding: new Cesium.Cartesian2(6, 3),
                pixelOffset: new Cesium.Cartesian2(10, 0),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
                heightReference: hr,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
          })
          .catch((err) => {
            console.error("Terrain sampling failed:", err);
            if (cancelled) return;
            const finalPosition = Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 0.0);
            const hr = Cesium.HeightReference.CLAMP_TO_GROUND;

            v.entities.add({
              id: `${zone.id}-point`,
              position: finalPosition,
              show: showZones,
              billboard: {
                image: HEX_ICONS[zone.severity] ?? HEX_ICONS.nominal,
                width: 28,
                height: 28,
                scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.6, 1.5e7, 0.6),
                translucencyByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 1.5e8, 0.0),
                heightReference: hr,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            v.entities.add({
              id: `${zone.id}-label`,
              position: finalPosition,
              show: showZones,
              label: {
                text: `${zone.name}\nAQI ${zone.aqi} · LST ${zone.lst}°C`,
                font: "11px JetBrains Mono, monospace",
                fillColor: Cesium.Color.fromCssColorString("#e8dcc8"),
                backgroundColor: Cesium.Color.fromCssColorString("#080c08").withAlpha(0.85),
                showBackground: true,
                backgroundPadding: new Cesium.Cartesian2(8, 4),
                pixelOffset: new Cesium.Cartesian2(0, -28),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
                heightReference: hr,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            v.entities.add({
              id: `${zone.id}-zone`,
              position: finalPosition,
              show: showZones,
              ellipse: {
                semiMinorAxis: zone.radiusKm * 1000,
                semiMajorAxis: zone.radiusKm * 1000,
                material:
                  zone.severity === "critical"
                    ? Cesium.Color.RED.withAlpha(0.02)
                    : Cesium.Color.fromCssColorString("#4a7c59").withAlpha(0.02),
                outline: false,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
            });

            v.entities.add({
              id: `${zone.id}-zone-outline`,
              show: showZones,
              polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray(
                  getCirclePoints(zone.lon, zone.lat, zone.radiusKm)
                ),
                width: 2.0,
                material: new Cesium.PolylineDashMaterialProperty({
                  color:
                    zone.severity === "critical"
                      ? Cesium.Color.RED
                      : Cesium.Color.fromCssColorString("#a7b96f"),
                  dashLength: 16.0,
                }),
                clampToGround: true,
              },
            });

            const radiusMeters = zone.radiusKm * 1000;
            const lonR = radiusMeters / (111320 * Math.cos((zone.lat * Math.PI) / 180));
            const edgeLon = zone.lon + lonR;
            const edgeLat = zone.lat;

            v.entities.add({
              id: `${zone.id}-zone-edge-label`,
              position: Cesium.Cartesian3.fromDegrees(edgeLon, edgeLat, 0.0),
              show: showZones,
              label: {
                text: zone.classification.toUpperCase(),
                font: "9px JetBrains Mono, monospace",
                fillColor:
                  zone.severity === "critical"
                    ? Cesium.Color.RED
                    : Cesium.Color.fromCssColorString("#a7b96f"),
                backgroundColor: Cesium.Color.fromCssColorString("#080c08").withAlpha(0.85),
                showBackground: true,
                backgroundPadding: new Cesium.Cartesian2(6, 3),
                pixelOffset: new Cesium.Cartesian2(10, 0),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
                heightReference: hr,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
          });
      }
    });
    return () => { cancelled = true; };
  }, [zones, showZones]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      {contextLost && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 12,
          background: "rgba(10,15,10,0.92)", color: "#e8dcc8",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12,
          letterSpacing: "0.16em", zIndex: 20,
        }}>
          <div>WEBGL CONTEXT LOST</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 18px", background: "transparent",
              border: "1px solid #4a7c59", color: "#4a7c59",
              fontFamily: "inherit", fontSize: 11, letterSpacing: "0.2em",
              cursor: "pointer", textTransform: "uppercase",
            }}
          >Reload Map</button>
        </div>
      )}
    </div>
  );

}

export default RaphaelGlobe;
