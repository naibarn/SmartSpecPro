/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P3, §7's P3 row.
 * Named, deterministic, format-aware presets — each a PURE function
 * `(document, brandKit) -> { document, layerIds }` that adds ONE OR TWO
 * correctly-banded layers via `timelineEdits.ts`'s `addLayer` (never
 * hand-built layer objects, per the task brief). No tRPC, no asset picker —
 * every preset is reachable in a single click because none of them need an
 * external asset (watermark uses the store's TEXT, not a logo image; the
 * image-based logo/watermark case is the `ใส่โลโก้/ลายน้ำ` launcher, not a
 * preset).
 *
 * **Safe area (§4.6's enumerated presets).** Positions come from
 * `computeSafeAreaRect` (`videoStudioSafeArea.ts`), a verbatim client-side
 * copy of the server's `PLATFORM_SAFE_AREA_INSETS` — the exact rectangle the
 * QA repair applier's safe-area clamp enforces (§4.9.1), so a preset-placed
 * layer is never immediately flagged by the very first repair round.
 *
 * **CTA id decision (task brief §3 CAUTION):** `closingCta` deliberately
 * produces an id WITHOUT the `_cta` suffix. `timelineEdits.ts`'s
 * `addLayer`/`generateLayerId` already defensively THROW/mangle an id
 * ending in `_cta` (see that module's docstring), so opting a preset-placed
 * CTA text layer into the compiler's brand CTA lock
 * (`layer.id.endsWith("_cta")`, `videoProjectCompiler.ts:534`) would require
 * fighting that existing guard rather than using it — and the brand CTA
 * lock is a separate, not-yet-wired-into-this-UI feature (§4.8's brand-lock
 * caution only documents `locks.colors`/`locks.fonts`, never a CTA lock
 * surfaced anywhere in `LayerInspectorPanel`/`BrandKitDialog`). Avoiding the
 * suffix keeps this preset's output ordinary, inspectable, editable text —
 * consistent, not accidental.
 *
 * **Brand locks (§4.8).** Every text layer this module creates resolves its
 * `color`/`fontFamily` through `resolveTextStyle`, which forces the brand
 * kit's locked token when `locks.colors`/`locks.fonts` is on — mirroring
 * `LayerInspectorPanel`'s constrained-control behaviour — so a preset can
 * never author a layer that makes the document uncompilable
 * (`enforceBrandLocks` throws otherwise, §4.8).
 */
import type { InspectorBrandKit } from "./LayerInspectorPanel";
import { addLayer, type AddLayerResult, type NewLayerInput } from "./timelineEdits";
import { computeSafeAreaRect } from "./videoStudioSafeArea";
import { videoStudioCopy } from "./videoStudioCopy";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

export type TimelinePresetId =
  | "promoPriceTopRight"
  | "storeWatermark"
  | "openingText3s"
  | "closingCta"
  | "subtitleBackdrop";

export interface TimelinePresetResult {
  document: VideoProjectDocument;
  /** Every layer id the preset added, in the order added — the caller
   *  selects the first one immediately (same "select the new clip" UX as
   *  the G9 launchers). */
  layerIds: string[];
}

export interface TimelinePresetDefinition {
  id: TimelinePresetId;
  label: { th: string; en: string };
  /** How many NEW layers this preset adds — the caller checks this against
   *  the remaining layer budget BEFORE calling `apply` (§4.6/AC11: blocked
   *  with the inline remedy, never a toast, never a partially-applied
   *  preset that then fails the 40-layer ceiling mid-way). */
  layerCount: 1 | 2;
  apply: (document: VideoProjectDocument, brandKit: InspectorBrandKit | null) => TimelinePresetResult;
}

/** Forces the brand kit's locked color/font when the corresponding lock is
 *  on (§4.8) — `undefined` otherwise, which lets `RemotionTextLayerSchema`'s
 *  own defaults (`color: "#ffffff"`, `fontFamily: "Inter"`) apply. Exported
 *  so `TimelineStagePanel.tsx`'s `ใส่ข้อความ` launcher (which authors a text
 *  layer directly, not through a preset) applies the SAME brand-lock
 *  constraint instead of re-implementing it. */
export function resolveTextStyle(brandKit: InspectorBrandKit | null): {
  color?: string;
  fontFamily?: string;
} {
  const colorLocked = Boolean(brandKit?.locks?.colors) && Boolean(brandKit?.colors?.primary);
  const fontLocked = Boolean(brandKit?.locks?.fonts) && Boolean(brandKit?.fonts?.body);
  return {
    color: colorLocked ? (brandKit?.colors?.primary as string) : undefined,
    fontFamily: fontLocked ? (brandKit?.fonts?.body as string) : undefined,
  };
}

function addOne(
  document: VideoProjectDocument,
  args: Parameters<typeof addLayer>[1],
): TimelinePresetResult {
  const result: AddLayerResult = addLayer(document, args);
  return { document: result.document, layerIds: [result.layerId] };
}

/** `ราคาโปรมุมบนขวา` — a promo price badge, top-right corner, inside the
 *  safe area, spanning the whole video. */
function promoPriceTopRight(
  document: VideoProjectDocument,
  brandKit: InspectorBrandKit | null,
): TimelinePresetResult {
  const rect = computeSafeAreaRect(document.content.platformPreset);
  const width = 30;
  const height = 12;
  const layer: NewLayerInput = {
    type: "text",
    content: "ราคาพิเศษ",
    textAlign: "center",
    fontWeight: "bold",
    ...resolveTextStyle(brandKit),
  };
  return addOne(document, {
    layer,
    absoluteStartMs: 0,
    durationMs: document.format.durationMs,
    band: "overlay",
    geometry: { x: rect.right - width, y: rect.top, width, height },
    name: "ราคาโปรมุมบนขวา",
  });
}

/** `ลายน้ำร้านค้า` — a small, semi-transparent, LOCKED store-name watermark
 *  in the brand band, bottom-right corner, inside the safe area, spanning
 *  the whole video. Text-based (not an image) so this preset stays a pure,
 *  synchronous function — a logo IMAGE watermark is the `ใส่โลโก้/ลายน้ำ`
 *  launcher, which needs the asset picker and therefore can't be a preset. */
function storeWatermark(
  document: VideoProjectDocument,
  brandKit: InspectorBrandKit | null,
): TimelinePresetResult {
  const rect = computeSafeAreaRect(document.content.platformPreset);
  const width = 24;
  const height = 8;
  const layer: NewLayerInput = {
    type: "text",
    content: "ร้านค้าของคุณ",
    textAlign: "right",
    fontWeight: "normal",
    ...resolveTextStyle(brandKit),
  };
  const result = addOne(document, {
    layer,
    absoluteStartMs: 0,
    durationMs: document.format.durationMs,
    band: "brand",
    geometry: { x: rect.right - width, y: rect.bottom - height, width, height, opacity: 0.85 },
    name: "ลายน้ำร้านค้า",
  });
  // Watermarks are meant to sit undisturbed — locked by default, same
  // convention as the `ใส่โลโก้/ลายน้ำ` launcher (task brief §2).
  return lockNewLayers(result);
}

/** `ข้อความเปิด 3 วินาทีแรก` — opening text, overlay band, top-center inside
 *  the safe area, for the FIRST 3 seconds only. */
function openingText3s(
  document: VideoProjectDocument,
  brandKit: InspectorBrandKit | null,
): TimelinePresetResult {
  const rect = computeSafeAreaRect(document.content.platformPreset);
  const width = 70;
  const height = 14;
  const durationMs = Math.min(3000, document.format.durationMs);
  const layer: NewLayerInput = {
    type: "text",
    content: "ข้อความเปิดเรื่อง",
    textAlign: "center",
    fontWeight: "bold",
    ...resolveTextStyle(brandKit),
  };
  return addOne(document, {
    layer,
    absoluteStartMs: 0,
    durationMs,
    band: "overlay",
    geometry: { x: rect.left + (rect.right - rect.left - width) / 2, y: rect.top, width, height },
    name: "ข้อความเปิด 3 วินาทีแรก",
  });
}

/** `CTA ปิดท้าย` — closing call-to-action text, overlay band, bottom-center
 *  inside the safe area, for the LAST 3 seconds (or the whole video if it's
 *  shorter than 3s). See module docstring for the `_cta` id decision. */
function closingCta(
  document: VideoProjectDocument,
  brandKit: InspectorBrandKit | null,
): TimelinePresetResult {
  const rect = computeSafeAreaRect(document.content.platformPreset);
  const width = 70;
  const height = 14;
  const durationMs = Math.min(3000, document.format.durationMs);
  const absoluteStartMs = Math.max(0, document.format.durationMs - durationMs);
  const layer: NewLayerInput = {
    type: "text",
    content: "กดสั่งซื้อเลยตอนนี้",
    textAlign: "center",
    fontWeight: "bold",
    ...resolveTextStyle(brandKit),
  };
  return addOne(document, {
    layer,
    absoluteStartMs,
    durationMs,
    band: "overlay",
    geometry: {
      x: rect.left + (rect.right - rect.left - width) / 2,
      y: rect.bottom - height,
      width,
      height,
    },
    name: "CTA ปิดท้าย",
  });
}

/** `แถบซับไทเทิลพื้นหลังทึบ` — an opaque backdrop bar sitting exactly where
 *  the compiler places burned-in caption text (`x5 y76 w90 h20`,
 *  `videoProjectCompiler.ts:295-303`), so captions stay readable over a busy
 *  background. Placed in the overlay band (zIndex 100-499), which — like
 *  every band this editor manages — stays strictly BELOW the compiler's
 *  reserved `zIndex: 900` caption text, so the bar always renders behind the
 *  subtitle text itself. Spans the whole video; a `motionGraphic` rect is
 *  the only supported "flat color box" primitive (§3.4). */
function subtitleBackdrop(document: VideoProjectDocument): TimelinePresetResult {
  const layer: NewLayerInput = {
    type: "motionGraphic",
    shape: "rect",
    color: "#000000",
    loopAnimation: "none",
  };
  return addOne(document, {
    layer,
    absoluteStartMs: 0,
    durationMs: document.format.durationMs,
    band: "overlay",
    // Mirrors the compiler's fixed caption-layer rect exactly (§3.3).
    geometry: { x: 5, y: 76, width: 90, height: 20, opacity: 0.6 },
    name: "แถบซับไทเทิลพื้นหลังทึบ",
  });
}

/** Marks every layer a preset just added as `locked: true` — used by
 *  `storeWatermark`. Re-reads the layer back out of the returned document
 *  (rather than threading a "locked" option through `addLayer`, which every
 *  other caller of that function does not need) to keep `AddLayerArgs`
 *  unchanged for the launchers. */
function lockNewLayers(result: TimelinePresetResult): TimelinePresetResult {
  const ids = new Set(result.layerIds);
  const document: VideoProjectDocument = {
    ...result.document,
    scenes: result.document.scenes.map((scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => (ids.has(layer.id) ? { ...layer, locked: true } : layer)),
    })),
  };
  return { document, layerIds: result.layerIds };
}

/** The full preset list, in the exact order §7's P3 row enumerates them. */
export const TIMELINE_PRESETS: readonly TimelinePresetDefinition[] = [
  {
    id: "promoPriceTopRight",
    label: videoStudioCopy.timelinePresetPromoPrice,
    layerCount: 1,
    apply: promoPriceTopRight,
  },
  {
    id: "storeWatermark",
    label: videoStudioCopy.timelinePresetStoreWatermark,
    layerCount: 1,
    apply: storeWatermark,
  },
  {
    id: "openingText3s",
    label: videoStudioCopy.timelinePresetOpeningText,
    layerCount: 1,
    apply: openingText3s,
  },
  {
    id: "closingCta",
    label: videoStudioCopy.timelinePresetClosingCta,
    layerCount: 1,
    apply: closingCta,
  },
  {
    id: "subtitleBackdrop",
    label: videoStudioCopy.timelinePresetSubtitleBackdrop,
    layerCount: 1,
    apply: (document) => subtitleBackdrop(document),
  },
];
