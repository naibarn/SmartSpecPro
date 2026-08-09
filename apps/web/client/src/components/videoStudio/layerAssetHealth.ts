import { useEffect, useMemo, useState } from "react";

import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

export type LayerAssetAvailability = "checking" | "available" | "missing";
type ProbeResult = true | false | null;

const PROBE_TIMEOUT_MS = 5000;
const availabilityCache = new Map<string, ProbeResult>();

function isMediaLayer(
  layer: RemotionLayer
): layer is Extract<RemotionLayer, { type: "image" | "video" }> {
  return layer.type === "image" || layer.type === "video";
}

/** Checks a same-origin storage URL without downloading its media body. */
export async function probeLayerAsset(
  url: string,
  signal?: AbortSignal
): Promise<ProbeResult> {
  if (typeof window === "undefined" || typeof window.fetch !== "function")
    return null;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    PROBE_TIMEOUT_MS
  );
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await window.fetch(url, {
      method: "HEAD",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (response.ok) return true;
    if (
      response.status === 404 ||
      (response.status >= 400 && response.status < 500)
    )
      return false;
    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Returns only ids proven missing; transient network failures stay unknown. */
export function useMissingLayerIds(
  document: VideoProjectDocument
): ReadonlySet<string> {
  const sources = useMemo(() => {
    const result: Array<{ id: string; src: string }> = [];
    for (const scene of document.scenes) {
      for (const layer of scene.layers) {
        if (isMediaLayer(layer)) result.push({ id: layer.id, src: layer.src });
      }
    }
    return result;
  }, [document]);
  const sourceKey = sources
    .map(({ id, src }) => `${id}\u0000${src}`)
    .join("\u0001");
  const [statusById, setStatusById] = useState<
    Record<string, LayerAssetAvailability>
  >({});

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatusById(() => {
      const next: Record<string, LayerAssetAvailability> = {};
      for (const { id, src } of sources) {
        const cached = availabilityCache.get(src);
        next[id] =
          cached === true
            ? "available"
            : cached === false
              ? "missing"
              : "checking";
      }
      return next;
    });
    for (const { id, src } of sources) {
      const cached = availabilityCache.get(src);
      if (cached !== undefined) continue;
      void probeLayerAsset(src, controller.signal).then(result => {
        if (cancelled || result === null) return;
        availabilityCache.set(src, result);
        setStatusById(previous => ({
          ...previous,
          [id]: result ? "available" : "missing",
        }));
      });
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `sourceKey` is the stable dependency for the derived source list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  return useMemo(
    () =>
      new Set(
        Object.entries(statusById)
          .filter(([, status]) => status === "missing")
          .map(([id]) => id)
      ),
    [statusById]
  );
}
