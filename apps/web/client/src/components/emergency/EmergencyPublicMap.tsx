import { useEffect, useRef, useState } from "react";
import { Map as MapLibreGL, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./EmergencyPublicMap.css";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { serializeEmergencyMapViewport } from "@smartspec/shared/src/emergency/mapBounds";
import { parseMapContextEnvelope, type MapContextZoomClass } from "@smartspec/shared/src/emergency/mapContext";
import { parseEmergencyMapCommand } from "@smartspec/shared/src/emergency/mapCommands";
import { getEmergencyMapCoordinates, toEmergencyAlertAreaFeatureCollection, toMapContextReference, toPublicMapFeatureCollection, type EmergencyMapItem } from "./emergencyMapFeatures";
import EmergencyMapWorkspace from "./EmergencyMapWorkspace";
import { dispatchEmergencyMapChat } from "./mapChatHandoff";

// Build the worker through Vite so its shared MapLibre module is bundled too;
// copying the package worker as a plain URL leaves a broken relative import in dist.
setWorkerUrl(mapLibreWorkerUrl);

async function loadPublicMapList(signal: AbortSignal): Promise<{ items: Array<Record<string, unknown>>; truncated: boolean; failed: boolean }> {
  const responses = await Promise.all(["public.situations.list", "public.facilities.list", "public.alerts.list"].map(id =>
    fetch(getSpec260ApiPath(id), { credentials: "omit", cache: "no-store", signal })));
  const payloads = await Promise.all(responses.map(async response => response.ok
    ? response.json() as Promise<{ items?: Array<Record<string, unknown>>; truncated?: boolean }>
    : { items: [], truncated: true }));
  return {
    items: payloads.flatMap((payload, index) => (payload.items ?? []).map(item => ({ ...item, kind: ["situation", "facility", "alert"][index] }))),
    truncated: payloads.some(payload => payload.truncated === true),
    failed: responses.some(response => !response.ok),
  };
}

type PublicMapRenderer =
  | { kind: "maplibre-style"; providerId: string; styleUrl: string }
  | { kind: "google-raster-proxy"; providerId: "google"; mapType: "roadmap" | "satellite" | "terrain"; sessionToken: string; tileUrlTemplate: string; sessionExpiresAt: string; tileSize: 256 | 512; attribution: string };
type PublicMapConfiguration = { provider: string; renderer: PublicMapRenderer; center: [number, number]; zoom: number; minZoom: number; maxZoom: number; selectedFrom?: "primary" | "fallback"; fallbackReason?: string; recoveryProbeIntervalSeconds: number };

export default function EmergencyPublicMap({ items, onItemsChange, previewMapType, previewCenter, resetPreviewKey }: {
  items: EmergencyMapItem[];
  onItemsChange: (items: Array<Record<string, unknown>>) => void;
  previewMapType?: "roadmap" | "satellite" | "terrain";
  previewCenter?: [number, number];
  resetPreviewKey?: number;
}) {
  const { t } = useScopedTranslation("emergency");
  const containerRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [styleConfig, setStyleConfig] = useState<PublicMapConfiguration | null>(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [coverageTruncated, setCoverageTruncated] = useState(false);
  const [hasLoadedItems, setHasLoadedItems] = useState(false);
  const [dataFreshness, setDataFreshness] = useState<"current" | "stale" | "unavailable">("unavailable");
  const [selectedItem, setSelectedItem] = useState<EmergencyMapItem | null>(null);
  const [visibleLayers, setVisibleLayers] = useState({ locations: true, alertAreas: true });
  const visibleLayersRef = useRef(visibleLayers);
  visibleLayersRef.current = visibleLayers;
  const mapRevisionRef = useRef(0);
  const lastPublicItemsRef = useRef<Array<Record<string, unknown>>>([]);
  const viewportRequestRef = useRef<AbortController | null>(null);
  const fallbackRequestRef = useRef<AbortController | null>(null);
  const fallbackAttemptedRef = useRef(false);
  const sessionRefreshAttemptedRef = useRef(false);

  const loadFallback = () => {
    viewportRequestRef.current?.abort();
    viewportRequestRef.current = null;
    fallbackRequestRef.current?.abort();
    const request = new AbortController();
    fallbackRequestRef.current = request;
    setCoverageTruncated(false);
    void loadPublicMapList(request.signal).then(result => {
      if (request.signal.aborted || fallbackRequestRef.current !== request) return;
      setHasLoadedItems(true);
      setCoverageTruncated(result.truncated);
      if (!result.failed) {
        setDataFreshness("current");
        onItemsChange(result.items);
      } else {
        setDataFreshness("stale");
        onItemsChange(lastPublicItemsRef.current.length > 0
          ? lastPublicItemsRef.current.map(item => ({ ...item, freshness: "stale" }))
          : result.items.map(item => ({ ...item, freshness: "stale" })));
      }
    }).catch(() => {
      if (request.signal.aborted || fallbackRequestRef.current !== request) return;
      setDataFreshness("stale");
      if (lastPublicItemsRef.current.length > 0) onItemsChange(lastPublicItemsRef.current.map(item => ({ ...item, freshness: "stale" })));
      else onItemsChange([]);
    });
  };

  const getMapConfiguration = async (signal: AbortSignal, fallbackOnly = false): Promise<PublicMapConfiguration> => {
    const query = new URLSearchParams();
    if (previewMapType) query.set("mapType", previewMapType);
    if (fallbackOnly) query.set("fallback", "1");
    const suffix = query.size ? `?${query.toString()}` : "";
    const response = await fetch(`${getSpec260ApiPath("public.map.config")}${suffix}`, {
      credentials: "omit", cache: "no-store", signal,
    });
    if (!response.ok) throw new Error("map_config_unavailable");
    const config = await response.json() as Partial<PublicMapConfiguration>;
    const center = Array.isArray(config.center) ? config.center.map(Number) : [];
    if (!config.renderer || (config.renderer.kind !== "maplibre-style" && config.renderer.kind !== "google-raster-proxy") ||
        center.length !== 2 || center.some(value => !Number.isFinite(value)) || typeof config.zoom !== "number" ||
        typeof config.minZoom !== "number" || typeof config.maxZoom !== "number" ||
        typeof config.recoveryProbeIntervalSeconds !== "number" || config.recoveryProbeIntervalSeconds < 30) {
      throw new Error("map_config_invalid");
    }
    if (config.renderer.kind === "maplibre-style") {
      const url = new URL(config.renderer.styleUrl);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("map_config_invalid");
    } else if (!/^\/api\/public\/emergency\/map\/google\/tiles\/\{z\}\/\{x\}\/\{y\}\?session=[A-Za-z0-9_%._-]+$/.test(config.renderer.tileUrlTemplate) ||
        !config.renderer.sessionToken || ![256, 512].includes(config.renderer.tileSize) || Date.parse(config.renderer.sessionExpiresAt) <= Date.now()) {
      throw new Error("map_config_invalid");
    }
    return { ...config, center: previewCenter ?? [center[0], center[1]] } as PublicMapConfiguration;
  };

  const loadProviderFallback = async (signal?: AbortSignal) => {
    if (fallbackAttemptedRef.current) {
      setMapError(true);
      loadFallback();
      return;
    }
    fallbackAttemptedRef.current = true;
    const controller = signal ? null : new AbortController();
    try {
      const config = await getMapConfiguration(signal ?? controller!.signal, true);
      if (signal?.aborted || controller?.signal.aborted) return;
      setMapError(false);
      setStyleConfig(config);
    } catch {
      if (signal?.aborted || controller?.signal.aborted) return;
      setMapError(true);
      loadFallback();
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fallbackAttemptedRef.current = false;
    sessionRefreshAttemptedRef.current = false;
    void getMapConfiguration(controller.signal)
      .then(config => { setMapError(false); setStyleConfig(config); })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        void loadProviderFallback(controller.signal);
      }).finally(() => { if (!controller.signal.aborted) setConfigChecked(true); });
    return () => controller.abort();
  }, [onItemsChange, previewMapType, previewCenter?.[0], previewCenter?.[1]]);

  useEffect(() => {
    if (!styleConfig || styleConfig.renderer.kind !== "maplibre-style" || styleConfig.selectedFrom !== "fallback" || styleConfig.fallbackReason !== "unavailable") return;
    const request = new AbortController();
    const interval = window.setInterval(() => {
      if (request.signal.aborted) return;
      void getMapConfiguration(request.signal).then(config => {
        if (!request.signal.aborted && config.renderer.kind !== "maplibre-style") {
          sessionRefreshAttemptedRef.current = false;
          setMapError(false);
          setStyleConfig(config);
        }
      }).catch(() => undefined);
    }, Math.max(30, styleConfig.recoveryProbeIntervalSeconds) * 1_000);
    return () => { request.abort(); window.clearInterval(interval); };
  }, [styleConfig, previewMapType, previewCenter?.[0], previewCenter?.[1]]);

  useEffect(() => {
    if (!styleConfig || !containerRef.current) return;
    containerRef.current.style.visibility = styleConfig.renderer.kind === "google-raster-proxy" ? "hidden" : "";
    let map: MapLibreMap;
    const googleClusterMarkers: Marker[] = [];
    let googleClusterSignature = "";
    try {
      const rendererStyle = styleConfig.renderer.kind === "maplibre-style"
        ? styleConfig.renderer.styleUrl
        : {
            version: 8 as const,
            sources: {
              "google-basemap": {
                type: "raster" as const,
                tiles: [styleConfig.renderer.tileUrlTemplate],
                tileSize: styleConfig.renderer.tileSize,
              },
            },
            layers: [{ id: "google-basemap", type: "raster" as const, source: "google-basemap" }],
          };
      map = new MapLibreGL({
        container: containerRef.current,
        style: rendererStyle,
        center: styleConfig.center,
        zoom: styleConfig.zoom,
        minZoom: styleConfig.minZoom,
        maxZoom: styleConfig.maxZoom,
        attributionControl: styleConfig.renderer.kind !== "google-raster-proxy",
      });
    } catch {
      setMapError(true);
      loadFallback();
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), "top-right");
    let recoverGoogleMap: () => void = () => { void loadProviderFallback(); };
    let lastProviderStateCheckAt = 0;
    if (styleConfig.renderer.kind === "google-raster-proxy") {
      let recoveryInProgress = false;
      const recoverExpiredGoogleSession = async () => {
        if (recoveryInProgress) return;
        recoveryInProgress = true;
        const expiresAt = Date.parse(styleConfig.renderer.sessionExpiresAt);
        if (!sessionRefreshAttemptedRef.current && Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000) {
          sessionRefreshAttemptedRef.current = true;
          const refreshController = new AbortController();
          try {
            const refreshed = await getMapConfiguration(refreshController.signal);
            if (refreshed.renderer.kind === "google-raster-proxy" &&
                refreshed.renderer.sessionToken !== styleConfig.renderer.sessionToken) {
              sessionRefreshAttemptedRef.current = false;
              setMapError(false);
              setStyleConfig(refreshed);
              return;
            }
          } catch { /* use the configured provider fallback below */ }
        }
        await loadProviderFallback();
      };
      recoverGoogleMap = () => { void recoverExpiredGoogleSession(); };
      let attributionNode: HTMLDivElement | null = null;
      const attributionControl = {
        onAdd: () => {
          attributionNode = document.createElement("div");
          attributionNode.className = "maplibregl-ctrl google-map-attribution";
          attributionNode.setAttribute("aria-label", "Google Maps data attribution");
          const logo = document.createElement("img");
          logo.src = "/google-maps-logo-outline.svg";
          logo.alt = "Google Maps";
          logo.style.height = "18px";
          logo.style.width = "auto";
          logo.style.flex = "none";
          const copyright = document.createElement("span");
          copyright.dataset.googleMapCopyright = "true";
          copyright.textContent = "Loading map attribution…";
          attributionNode.append(logo, copyright);
          return attributionNode;
        },
        onRemove: () => { attributionNode?.remove(); attributionNode = null; },
      };
      map.addControl(attributionControl, "bottom-right");
      let attributionGeneration = 0;
      let attributionRetryCount = 0;
      let attributionRetryTimer = 0;
      const refreshGoogleAttribution = () => {
        const bounds = map.getBounds();
        const generation = ++attributionGeneration;
        if (attributionRetryTimer) window.clearTimeout(attributionRetryTimer);
        if (containerRef.current) containerRef.current.style.visibility = "hidden";
        const normalizeLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
        const span = bounds.getEast() - bounds.getWest();
        const west = span >= 360 ? -180 : normalizeLongitude(bounds.getWest());
        const east = span >= 360 ? 180 : normalizeLongitude(bounds.getEast());
        const query = new URLSearchParams({
          session: styleConfig.renderer.sessionToken,
          zoom: String(Math.max(0, Math.round(map.getZoom()))),
          north: bounds.getNorth().toFixed(6), south: bounds.getSouth().toFixed(6),
          east: east.toFixed(6), west: west.toFixed(6),
        });
        void fetch(`${getSpec260ApiPath("public.map.google.attribution")}?${query}`, { credentials: "omit", cache: "no-store" })
          .then(async response => {
            if (!response.ok) throw new Error("map_attribution_unavailable");
            const payload = await response.json() as { attribution?: unknown };
            if (typeof payload.attribution !== "string" || !payload.attribution.trim()) throw new Error("map_attribution_invalid");
            if (attributionNode && generation === attributionGeneration) {
              const copyright = attributionNode.querySelector<HTMLElement>("[data-google-map-copyright]");
              if (copyright) copyright.textContent = payload.attribution;
              attributionRetryCount = 0;
              if (containerRef.current) containerRef.current.style.visibility = "visible";
            }
          })
          .catch(() => {
            if (generation !== attributionGeneration) return;
            if (attributionRetryCount < 2) {
              attributionRetryCount += 1;
              attributionRetryTimer = window.setTimeout(refreshGoogleAttribution, 1_500 * attributionRetryCount);
              return;
            }
            setMapError(true);
            map.remove();
            mapRef.current = null;
            setMapReady(false);
            recoverGoogleMap();
          });
      };
      // Request attribution as soon as the map is constructed. Waiting only for
      // MapLibre's `load` event can leave the map hidden forever when the initial
      // raster tile request stalls, even though the attribution endpoint works.
      refreshGoogleAttribution();
      map.on("load", refreshGoogleAttribution);
      map.on("moveend", refreshGoogleAttribution);
      map.once("remove", () => { if (attributionRetryTimer) window.clearTimeout(attributionRetryTimer); });
    }
    const handleMapError = () => {
      if (styleConfig.renderer.kind === "google-raster-proxy") {
        const now = Date.now();
        if (now - lastProviderStateCheckAt < 5_000) return;
        lastProviderStateCheckAt = now;
        const controller = new AbortController();
        void getMapConfiguration(controller.signal).then(nextConfig => {
          const shouldSwitch = nextConfig.renderer.kind !== "google-raster-proxy" ||
            nextConfig.renderer.sessionToken !== styleConfig.renderer.sessionToken;
          if (!shouldSwitch) return;
          if (nextConfig.renderer.kind === "google-raster-proxy") sessionRefreshAttemptedRef.current = false;
          map.remove();
          if (mapRef.current === map) mapRef.current = null;
          setMapError(false);
          setMapReady(false);
          setStyleConfig(nextConfig);
        }).catch(() => undefined);
      } else {
        map.remove();
        mapRef.current = null;
        setMapError(true);
        setMapReady(false);
        loadFallback();
      }
    };
    map.on("error", handleMapError);
    map.on("load", () => {
      map.addSource("emergency-items", {
        type: "geojson", data: toPublicMapFeatureCollection(items),
        cluster: true, clusterMaxZoom: 14, clusterRadius: 48,
      });
      map.addSource("emergency-alert-areas", { type: "geojson", data: toEmergencyAlertAreaFeatureCollection(items) as never });
      map.addLayer({ id: "emergency-alert-area-fill", type: "fill", source: "emergency-alert-areas",
        paint: { "fill-color": "firebrick", "fill-opacity": 0.18 } });
      map.addLayer({ id: "emergency-alert-area-outline", type: "line", source: "emergency-alert-areas",
        paint: { "line-color": "darkred", "line-width": 2, "line-opacity": 0.9 } });
      map.addLayer({ id: "emergency-clusters", type: "circle", source: "emergency-items", filter: ["has", "point_count"],
        paint: { "circle-color": ["step", ["get", "point_count"], "royalblue", 10, "darkorange", 50, "firebrick"],
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 21, 50, 26], "circle-stroke-width": 2, "circle-stroke-color": "white" } });
      if (styleConfig.renderer.kind !== "google-raster-proxy") {
        map.addLayer({ id: "emergency-cluster-count", type: "symbol", source: "emergency-items", filter: ["has", "point_count"],
          layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 }, paint: { "text-color": "white" } });
      }
      map.addLayer({ id: "emergency-points", type: "circle", source: "emergency-items", filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": ["match", ["get", "kind"], "facility", "seagreen", "alert", "firebrick", "royalblue"],
          "circle-radius": 8, "circle-stroke-width": 2, "circle-stroke-color": "white" } });
      map.on("click", "emergency-clusters", event => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const geometry = feature?.geometry;
        if (!feature || typeof clusterId !== "number" || geometry?.type !== "Point") return;
        const center = geometry.coordinates as [number, number];
        const source = map.getSource("emergency-items") as GeoJSONSource;
        void source.getClusterExpansionZoom(clusterId).then(zoom => {
          map.easeTo({ center, zoom });
        }).catch(() => undefined);
      });
      map.on("click", "emergency-points", event => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const properties = feature.properties ?? {};
        const publicRef = properties.publicRef;
        if (typeof publicRef === "string") {
          const matchingItem = lastPublicItemsRef.current.find(item => item.publicRef === publicRef);
          if (matchingItem) setSelectedItem(matchingItem as EmergencyMapItem);
        }
        const popupContent = document.createElement("section");
        const heading = document.createElement("strong");
        heading.textContent = typeof properties.title === "string" ? properties.title : "Emergency location";
        popupContent.append(heading);
        const detail = document.createElement("p");
        detail.textContent = [properties.publicRef, properties.status, properties.freshness].filter(Boolean).join(" · ");
        popupContent.append(detail);
        new Popup({ offset: 12 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(popupContent).addTo(map);
      });
      map.on("mouseenter", "emergency-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "emergency-clusters", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "emergency-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "emergency-points", () => { map.getCanvas().style.cursor = ""; });
      if (styleConfig.renderer.kind === "google-raster-proxy") {
        const updateGoogleClusterLabels = () => {
          const clusters = map.querySourceFeatures("emergency-items", { filter: ["has", "point_count"] })
            .filter(feature => feature.geometry.type === "Point" && typeof feature.properties?.cluster_id === "number")
            .map(feature => ({
              id: Number(feature.properties?.cluster_id),
              count: String(feature.properties?.point_count_abbreviated ?? feature.properties?.point_count ?? ""),
              coordinates: feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : [0, 0] as [number, number],
            }));
          const uniqueClusters = [...new Map(clusters.map(cluster => [cluster.id, cluster])).values()];
          const signature = uniqueClusters.map(cluster => `${cluster.id}:${cluster.count}:${cluster.coordinates.join(",")}`).sort().join("|");
          if (signature === googleClusterSignature) return;
          googleClusterSignature = signature;
          googleClusterMarkers.splice(0).forEach(marker => marker.remove());
          for (const cluster of uniqueClusters) {
            const screenPoint = map.project(cluster.coordinates);
            const attributionWidth = Math.min(map.getContainer().clientWidth * 0.9, 640);
            if (screenPoint.x >= map.getContainer().clientWidth - attributionWidth &&
                screenPoint.y >= map.getContainer().clientHeight - 120) continue;
            const label = document.createElement("span");
            label.className = "emergency-google-cluster-label";
            label.textContent = cluster.count;
            label.setAttribute("aria-hidden", "true");
            googleClusterMarkers.push(new Marker({ element: label, anchor: "center" }).setLngLat(cluster.coordinates).addTo(map));
          }
        };
        map.on("idle", updateGoogleClusterLabels);
        map.once("remove", () => googleClusterMarkers.splice(0).forEach(marker => marker.remove()));
      }
    });
    const fetchViewport = () => {
      const bounds = map.getBounds();
      const center = map.getCenter();
      const bbox = serializeEmergencyMapViewport({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth(),
        centerLongitude: center.lng, centerLatitude: center.lat });
      if (!bbox) return;
      viewportRequestRef.current?.abort();
      const request = new AbortController();
      viewportRequestRef.current = request;
      void fetch(`${getSpec260ApiPath("public.map.list")}?bbox=${encodeURIComponent(bbox)}`, { credentials: "omit", cache: "no-store", signal: request.signal })
        .then(async response => {
          if (!response.ok) throw new Error("map_viewport_unavailable");
          const payload = await response.json() as { items?: Array<Record<string, unknown>>; truncated?: boolean };
          if (request.signal.aborted || viewportRequestRef.current !== request) return;
          setCoverageTruncated(payload.truncated === true);
          setHasLoadedItems(true);
          setDataFreshness("current");
          onItemsChange(payload.items ?? []);
        }).catch(error => {
          if (!(error instanceof DOMException && error.name === "AbortError") &&
              !request.signal.aborted && viewportRequestRef.current === request) {
            map.remove();
            mapRef.current = null;
            setMapReady(false);
            if (styleConfig.renderer.kind === "google-raster-proxy") recoverGoogleMap();
            else { setMapError(true); loadFallback(); }
          }
        });
    };
    map.on("load", () => {
      setMapReady(true);
      fetchViewport();
      for (const [id, visible] of [["emergency-points", visibleLayersRef.current.locations], ["emergency-clusters", visibleLayersRef.current.locations], ["emergency-cluster-count", visibleLayersRef.current.locations], ["emergency-alert-area-fill", visibleLayersRef.current.alertAreas], ["emergency-alert-area-outline", visibleLayersRef.current.alertAreas]] as const) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    });
    map.on("moveend", fetchViewport);
    return () => {
      viewportRequestRef.current?.abort();
      fallbackRequestRef.current?.abort();
      map.off("error", handleMapError);
      map.off("load", fetchViewport);
      map.off("moveend", fetchViewport);
      if (mapRef.current === map) {
        map.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, [styleConfig, onItemsChange, resetPreviewKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    for (const [id, visible] of [["emergency-points", visibleLayers.locations], ["emergency-clusters", visibleLayers.locations], ["emergency-cluster-count", visibleLayers.locations], ["emergency-alert-area-fill", visibleLayers.alertAreas], ["emergency-alert-area-outline", visibleLayers.alertAreas]] as const) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }, [visibleLayers, styleConfig]);

  useEffect(() => {
    if (!styleConfig || !mapRef.current || resetPreviewKey === undefined) return;
    mapRef.current.easeTo({ center: previewCenter ?? styleConfig.center, zoom: styleConfig.zoom, duration: 250 });
  }, [resetPreviewKey]);

  useEffect(() => {
    lastPublicItemsRef.current = items as Array<Record<string, unknown>>;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("emergency-items") as GeoJSONSource | undefined;
    if (source) {
      void source.setData(toPublicMapFeatureCollection(items)).catch(() => undefined);
      const alertAreaSource = map.getSource("emergency-alert-areas") as GeoJSONSource | undefined;
      if (alertAreaSource) void alertAreaSource.setData(toEmergencyAlertAreaFeatureCollection(items) as never).catch(() => undefined);
      if (items.length === 1) {
        const point = getEmergencyMapCoordinates(items[0]);
        if (point) map.easeTo({ center: point, zoom: Math.max(map.getZoom(), 8), duration: 250 });
      }
    }
  }, [items]);

  const changeLayer = (layer: "locations" | "alertAreas", visible: boolean) => {
    const layerIds = layer === "locations"
      ? ["emergency-points", "emergency-clusters", "emergency-cluster-count"]
      : ["emergency-alert-area-fill", "emergency-alert-area-outline"];
    const parsed = layerIds.map(layerId => parseEmergencyMapCommand({ type: visible ? "map.layer.show" : "map.layer.hide", revision: mapRevisionRef.current, layerId }, mapRevisionRef.current));
    if (parsed.every(result => result.ok)) setVisibleLayers(current => ({ ...current, [layer]: visible }));
  };

  const selectItem = (item: EmergencyMapItem) => {
    setSelectedItem(item);
    const center = getEmergencyMapCoordinates(item);
    if (!center) return;
    const parsed = parseEmergencyMapCommand({ type: "map.focus", revision: mapRevisionRef.current, center, zoom: Math.max(mapRef.current?.getZoom() ?? 0, 8) }, mapRevisionRef.current);
    if (parsed.ok) mapRef.current?.easeTo({ center, zoom: parsed.command.zoom as number, duration: 300 });
  };

  const askAI = () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const bounds = map.getBounds();
    const west = Math.max(-180, center.lng - 10);
    const east = Math.min(180, center.lng + 10);
    const south = Math.max(-85, Math.max(bounds.getSouth(), center.lat - 10));
    const north = Math.min(85, Math.min(bounds.getNorth(), center.lat + 10));
    const zoom = map.getZoom();
    const zoomClass: MapContextZoomClass = zoom < 3 ? "WORLD" : zoom < 5 ? "COUNTRY" : zoom < 8 ? "REGION" : zoom < 12 ? "CITY" : zoom < 16 ? "STREET" : "BUILDING";
    const counts = items.reduce((summary, item) => {
      if (item.kind === "alert") summary.hazards += 1;
      else if (item.kind === "facility") summary.resources += 1;
      else summary.incidents += 1;
      return summary;
    }, { incidents: 0, hazards: 0, resources: 0, tasks: 0, services: 0 });
    const selectedReference = selectedItem ? toMapContextReference(selectedItem) : null;
    const context = parseMapContextEnvelope({
      surface: "emergency_map",
      viewport: { bounds: [west, south, east, north], center: [center.lng, center.lat], zoom },
      zoomClass,
      selectedFeatures: selectedReference ? [selectedReference] : [],
      activeLayers: [...(visibleLayers.locations ? ["emergency-points"] : []), ...(visibleLayers.alertAreas ? ["emergency-alert-areas"] : [])],
      filters: [], temporalContext: { mode: "NOW" }, requestedMapMode: "PUBLIC", visibleSummary: counts,
    });
    if (context) dispatchEmergencyMapChat(context);
  };

  if (!styleConfig || mapError) return <section>
    <section className="emergency-map-unavailable" role="status">
      {mapError ? t("map.unavailable") : configChecked ? t("map.notConfigured") : t("state.loading")}
      {dataFreshness === "stale" && <p>{t("map.stale")}</p>}
    </section>
    <EmergencyMapWorkspace items={items} visibleLayers={visibleLayers} selectedItem={selectedItem} onClearSelection={() => setSelectedItem(null)} onLayerChange={changeLayer} onSelectItem={selectItem} onAskAI={askAI} canAskAI={false} />
  </section>;

  return <section className="emergency-public-map-frame" aria-label={t("map.title")}>
    {styleConfig.renderer.kind === "google-raster-proxy" && <p className="emergency-overlay-attribution">Emergency overlays: SmartAIHub</p>}
    <section ref={containerRef} className="emergency-public-map" role="region" aria-label={t("map.interactiveLabel")} />
    {coverageTruncated && <p className="emergency-map-status emergency-map-status-info" role="status">{t("map.coverageTruncated")}</p>}
    {dataFreshness === "stale" && <p className="emergency-map-status emergency-map-status-warning" role="status">{t("map.stale")}</p>}
    {hasLoadedItems && items.length === 0 && <p className="emergency-map-status emergency-map-status-empty" role="status">{t("map.noData")}</p>}
    <EmergencyMapWorkspace items={items} visibleLayers={visibleLayers} selectedItem={selectedItem} onClearSelection={() => setSelectedItem(null)} onLayerChange={changeLayer} onSelectItem={selectItem} onAskAI={askAI} canAskAI={mapReady} />
  </section>;
}
