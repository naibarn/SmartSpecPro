/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P3, §4.13 launchers
 * (G9). Probes a picked video/audio asset's OWN duration client-side (via a
 * detached `<video>`/`<audio>` element's `loadedmetadata` event) so the
 * background-video launcher can honour "duration = the document duration, or
 * the clip's own if shorter" (task brief §2) — `VideoStudioPickerAsset`
 * (`VideoStudioAssetPicker.tsx`) carries no `durationMs` field, so this is
 * the only client-side way to learn it without a new tRPC field.
 *
 * Deliberately its OWN file (not inlined in `TimelineStagePanel.tsx`): that
 * panel already has a local `document` variable holding the
 * `VideoProjectDocument` state, which would shadow the DOM global `document`
 * this helper needs to call `createElement` on.
 *
 * Never throws — resolves `null` on any error/timeout so a launcher can
 * always fall back to the document's own duration.
 */
const PROBE_TIMEOUT_MS = 4000;

export function probeMediaDurationMs(
  url: string,
  kind: "video" | "audio",
): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const el = window.document.createElement(kind);
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      if (timeoutId) clearTimeout(timeoutId);
    }
    function finish(value: number | null) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }
    function onLoaded() {
      finish(Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : null);
    }
    function onError() {
      finish(null);
    }

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("error", onError);
    el.preload = "metadata";
    el.src = url;
    // A hung network request must never block a launcher click.
    timeoutId = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
  });
}
