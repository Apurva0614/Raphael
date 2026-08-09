// @ts-nocheck
import { useEffect, useRef } from "react";

export interface CompareZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  severity: "critical" | "warning" | "nominal" | "high";
}

function hexIcon(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <polygon points='16,3 28,10 28,22 16,29 4,22 4,10'
      fill='${color}22' stroke='${color}' stroke-width='2.5' stroke-linejoin='round' />
    <circle cx='16' cy='16' r='2.5' fill='${color}' />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// TODO Antigravity: Replace hardcoded coords with zone.centroid from /api/v1/zones/{id}
// Camera altitude from zone.radius_km * 8000
export function CompareGlobe({
  zone,
  onViewerReady,
}: {
  zone: CompareZone;
  onViewerReady?: (viewer: any) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    let settleTimeout: any = null;

    async function mount() {
      console.log("[CompareGlobe] mount start for zone:", zone.id, zone.name, "lon:", zone.lon, "lat:", zone.lat);
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
        sceneMode: Cesium.SceneMode.SCENE2D,
        scene3DOnly: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      });

      viewer.resolutionScale = window.devicePixelRatio || 1;
      try { viewer.scene.postProcessStages.fxaa.enabled = true; } catch {}
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#07100f");
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#07100f");
      viewer.camera.percentageChanged = 0.005; // Make camera changed event fire smoothly for sync

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

      if (cancelled) return;

      const sevColor =
        zone.severity === "critical" ? "#ef4444"
          : zone.severity === "high" ? "#f59e0b"
          : zone.severity === "warning" ? "#d4a853"
          : "#4a7c59";

      const carto = Cesium.Cartographic.fromDegrees(zone.lon, zone.lat);
      Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto])
        .then((sampled) => {
          if (cancelled) return;
          const pos = sampled[0];
          const hasHeight = pos && typeof pos.height === "number" && !isNaN(pos.height);
          const terrainHeight = hasHeight ? pos.height : 0.0;
          const hr = hasHeight ? Cesium.HeightReference.RELATIVE_TO_TERRAIN : Cesium.HeightReference.CLAMP_TO_GROUND;

          const finalPosition = Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, terrainHeight);

          // Point marker
          viewer.entities.add({
            id: `${zone.id}-point`,
            position: finalPosition,
            billboard: {
              image: hexIcon(sevColor),
              width: 28,
              height: 28,
              heightReference: hr,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          // Label
          viewer.entities.add({
            id: `${zone.id}-label`,
            position: finalPosition,
            label: {
              text: zone.name,
              font: "11px JetBrains Mono, monospace",
              fillColor: Cesium.Color.fromCssColorString("#e8dcc8"),
              backgroundColor: Cesium.Color.fromCssColorString("#080c08").withAlpha(0.85),
              showBackground: true,
              backgroundPadding: new Cesium.Cartesian2(8, 4),
              pixelOffset: new Cesium.Cartesian2(0, -28),
              heightReference: hr,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          // Radius ellipse
          viewer.entities.add({
            id: `${zone.id}-zone`,
            position: finalPosition,
            ellipse: {
              semiMinorAxis: zone.radiusKm * 1000,
              semiMajorAxis: zone.radiusKm * 1000,
              material: Cesium.Color.fromCssColorString(sevColor).withAlpha(0.12),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(sevColor).withAlpha(0.6),
              outlineWidth: 1.5,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        })
        .catch((err) => {
          console.error("CompareGlobe terrain sampling failed:", err);
          if (cancelled) return;
          const finalPosition = Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 0.0);
          const hr = Cesium.HeightReference.CLAMP_TO_GROUND;

          // Point marker
          viewer.entities.add({
            id: `${zone.id}-point`,
            position: finalPosition,
            billboard: {
              image: hexIcon(sevColor),
              width: 28,
              height: 28,
              heightReference: hr,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          // Label
          viewer.entities.add({
            id: `${zone.id}-label`,
            position: finalPosition,
            label: {
              text: zone.name,
              font: "11px JetBrains Mono, monospace",
              fillColor: Cesium.Color.fromCssColorString("#e8dcc8"),
              backgroundColor: Cesium.Color.fromCssColorString("#080c08").withAlpha(0.85),
              showBackground: true,
              backgroundPadding: new Cesium.Cartesian2(8, 4),
              pixelOffset: new Cesium.Cartesian2(0, -28),
              heightReference: hr,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          // Radius ellipse
          viewer.entities.add({
            id: `${zone.id}-zone`,
            position: finalPosition,
            ellipse: {
              semiMinorAxis: zone.radiusKm * 1000,
              semiMajorAxis: zone.radiusKm * 1000,
              material: Cesium.Color.fromCssColorString(sevColor).withAlpha(0.12),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(sevColor).withAlpha(0.6),
              outlineWidth: 1.5,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        });

      viewerRef.current = viewer;
      onViewerReady?.(viewer);

      let initialViewApplied = false;
      const radiusDeg = (zone.radiusKm || 10) / 111.0;

      // Request a redraw on container resize (requestRenderMode is on)
      resizeObs = new ResizeObserver((entries) => {
        try {
          viewer.resize();
          viewer.scene.requestRender();

          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) {
              if (!initialViewApplied && !cancelled) {
                if (settleTimeout) clearTimeout(settleTimeout);
                settleTimeout = setTimeout(() => {
                  if (cancelled || !viewer || initialViewApplied) return;
                  
                  // Double check size at execution time to avoid 0x0 canvas errors
                  const curW = containerRef.current?.clientWidth || 0;
                  const curH = containerRef.current?.clientHeight || 0;
                  if (curW <= 0 || curH <= 0) {
                    console.log(
                      `[CompareGlobe] Settle timeout fired but container size is zero (${curW}x${curH}) for zone:`,
                      zone.name
                    );
                    return;
                  }

                  console.log(
                    `[CompareGlobe] Applying view inside settled ResizeObserver for zone:`,
                    zone.id,
                    zone.name,
                    `lat:`, zone.lat,
                    `lon:`, zone.lon
                  );
                  
                  const destRect = Cesium.Rectangle.fromDegrees(
                    zone.lon - radiusDeg * 1.5,
                    zone.lat - radiusDeg * 1.5,
                    zone.lon + radiusDeg * 1.5,
                    zone.lat + radiusDeg * 1.5
                  );
                  
                  viewer.camera.setView({
                    destination: destRect,
                  });
                  viewer.scene.requestRender();

                  initialViewApplied = true;
                  viewer.initialViewApplied = true;
                }, 150);
              }
            } else {
              // Size is 0, cancel any pending timeout
              if (settleTimeout) {
                clearTimeout(settleTimeout);
                settleTimeout = null;
              }
            }
          }
        } catch {}
      });
      resizeObs.observe(containerRef.current);
    }

    void mount();
    return () => {
      cancelled = true;
      if (settleTimeout) clearTimeout(settleTimeout);
      try { resizeObs?.disconnect(); } catch {}
      try {
        viewerRef.current?.entities?.removeAll?.();
        viewerRef.current?.destroy?.();
      } catch {}
      viewerRef.current = null;
    };
  }, [zone.id]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

export default CompareGlobe;
