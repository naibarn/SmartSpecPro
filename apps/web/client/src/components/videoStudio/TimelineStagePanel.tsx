/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1+P2.
 *
 * The 8th, explicitly-optional stage (§2.1 D1): composes the controlled
 * `<Player>` preview (`RemotionProjectPreview`, reused per §4.4 — this
 * surface never draws its own canvas) with a `TransformOverlay` for the
 * selected clip, the permanent layer-budget meter (`LayerBudgetMeter`,
 * §4.6), the drag/trim-capable `Timeline` (§4.1-§4.5), the permanent
 * form-based `LayerListPanel` (§2.1 D3) and the `LayerInspectorPanel`.
 * Selection is ONE shared model (`selectedClipId` + `selectedClipIds` for
 * multi-select highlighting) lifted here.
 *
 * P2 additions this file owns directly (the rest live in the sub-
 * components above):
 *  - `useTimelineHistory` — undo/redo (G7/AC15), Ctrl+Z / Ctrl+Shift+Z +
 *    visible buttons, depth >=50 for free (see that hook's docstring).
 *  - Keyboard (§4.5): arrow = 1 frame, shift+arrow = 1s on the selected
 *    clip; Ctrl+D duplicate; Ctrl+C/Ctrl+V copy-paste across scenes (pastes
 *    at the current playhead, same band).
 *  - Autosave on ~1.5s idle (§4.5/RK4) via `saveDocument` — REQUIRED
 *    because `RenderPanel` disables preview/render while `hasUnsavedChanges`
 *    is true. Paused while a drag gesture is open (`history.isGestureOpen`)
 *    and while a conflict is pending resolution. On `CONFLICT`, offers
 *    `เก็บการแก้ไขของฉันไว้` (§4.13): reloads the server's document and
 *    re-applies this session's `scene.layers[]` onto it (everything else —
 *    narration, captions, scene timing, motion — comes from the fresh
 *    server copy), never silently discarding a drag.
 *  - Debounced recompile (§4.4): `compileProject` only ever reflects the
 *    SAVED document (both this panel's and `RenderPanel`'s query are gated
 *    `enabled: !hasUnsavedChanges`), so a true recompile can only happen
 *    once autosave has committed. This file keeps a local `compiledConfig`
 *    snapshot, patches it OPTIMISTICALLY (position/size/rotation/opacity/
 *    timing/type-specific fields, matched by layer id) on every edit for
 *    instant preview feedback with NO server round trip, then — 400ms after
 *    an autosave succeeds, not per pointermove — invalidates/refetches
 *    `compileProject` to replace the optimistic patch with the confirmed
 *    compiled config (also picks up anything the optimistic patch can't
 *    approximate: new layers, band/z-order changes, template swaps).
 *
 * Multi-select (§4.5) is shift-click highlighting shared across the
 * timeline/inspector/layer list; dragging a selected clip moves the selected
 * group together while locked members are skipped. Duplicate and copy/paste
 * operate on the single primary selection.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";

import { trpc } from "@/lib/trpc";
import { LayerBudgetMeter } from "./LayerBudgetMeter";
import {
  AudioTrackInspectorPanel,
  LayerInspectorPanel,
  type InspectorBrandKit,
} from "./LayerInspectorPanel";
import { LayerListPanel, type LayerListFieldKey } from "./LayerListPanel";
import { probeMediaDurationMs } from "./mediaDurationProbe";
import { RemotionProjectPreview } from "./RemotionProjectPreview";
import { Timeline } from "./Timeline";
import {
  TIMELINE_PRESETS,
  resolveTextStyle,
  type TimelinePresetId,
} from "./timelinePresets";
import { TransformOverlay } from "./TransformOverlay";
import {
  addLayer,
  addMusicAudioTrack,
  bringForward,
  duplicateLayer,
  removeAudioTrack,
  removeLayer,
  replaceLayerSource,
  renameLayer,
  resizeLayer,
  sendBackward,
  setAudioTrackDucking,
  setAudioTrackFades,
  setAudioTrackGainDb,
  setAudioTrackSpan,
  setLayerHidden,
  setLayerLocked,
  setLayerProps,
  moveLayer,
  type LayerRef,
} from "./timelineEdits";
import { useTimelineHistory } from "./useTimelineHistory";
import { useMissingLayerIds } from "./layerAssetHealth";
import {
  bandForLayer,
  collectAuthoredLayerClips,
  msToFrames,
  projectTimeline,
  type TimelineClip,
  type TimelineClipRef,
} from "./timelineProjection";
import {
  VideoStudioAssetPicker,
  type VideoStudioAssetKind,
  type VideoStudioPickerAsset,
  type VideoStudioTimelineAsset,
} from "./VideoStudioAssetPicker";
import { computeSafeAreaRect } from "./videoStudioSafeArea";
import {
  describeViError,
  pickCopy,
  videoStudioCopy,
  type VideoStudioLang,
} from "./videoStudioCopy";
import type { SnapCandidate } from "@/presentation-canvas/snap/SnapEngine";
import type {
  RemotionLayer,
  RemotionTemplateConfig,
} from "@shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { uploadMedia } from "@/components/editor/uploadMedia";

/** §4.14 breakpoints — mirrors the page-level product-panel threshold
 *  pattern (`VideoStudioWorkspacePage.tsx`), just with two cut points
 *  instead of one. */
const NARROW_MAX_WIDTH_PX = 1024;
const MID_MAX_WIDTH_PX = 1280;

/** §4.5 autosave idle delay. */
const AUTOSAVE_IDLE_MS = 1500;
/** §4.4 — debounced recompile AFTER autosave commits, not per pointermove. */
const RECOMPILE_AFTER_SAVE_MS = 400;

function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? MID_MAX_WIDTH_PX : window.innerWidth
  );
  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function findLayer(
  document: VideoProjectDocument,
  ref: LayerRef
): RemotionLayer | null {
  const scene = document.scenes.find(s => s.sceneId === ref.sceneId);
  return scene?.layers.find(l => l.id === ref.layerId) ?? null;
}

function refFromClipRef(ref: TimelineClipRef): LayerRef | null {
  return ref.kind === "layer"
    ? { sceneId: ref.sceneId, layerId: ref.layerId }
    : null;
}

/** Locates a just-added layer's owning scene by scanning the RESULT
 *  document (`addLayer`/preset `apply()` return the layer id, but not which
 *  scene absorbed it — re-deriving here mirrors the existing `handlePaste`
 *  pattern below rather than adding a third way to compute the same thing). */
function findLayerSceneId(
  document: VideoProjectDocument,
  layerId: string
): string | null {
  return (
    document.scenes.find(s => s.layers.some(l => l.id === layerId))?.sceneId ??
    null
  );
}

/** P3 G9 launchers — which `VideoStudioAssetPicker` kind each opens. `text`
 *  is omitted: it authors a layer directly with no asset needed. */
const LAUNCHER_ASSET_KIND: Record<
  "background" | "logo" | "music" | "concat",
  VideoStudioAssetKind
> = {
  background: "video",
  logo: "image",
  music: "audio",
  concat: "video",
};

/** Which layer-authored fields changed between two documents, by layer id —
 *  drives the §4.4 optimistic compiled-config patch. Cheap JSON compare is
 *  fine here: the layer budget is a hard 40-layer ceiling (§3.5). */
function changedLayerIds(
  before: VideoProjectDocument,
  after: VideoProjectDocument
): Map<string, RemotionLayer> {
  const beforeById = new Map<string, string>();
  for (const scene of before.scenes) {
    for (const layer of scene.layers)
      beforeById.set(layer.id, JSON.stringify(layer));
  }
  const changed = new Map<string, RemotionLayer>();
  for (const scene of after.scenes) {
    for (const layer of scene.layers) {
      if (beforeById.get(layer.id) !== JSON.stringify(layer))
        changed.set(layer.id, layer);
    }
  }
  return changed;
}

/** Patches matching entries (by id) of an already-compiled config's flat
 *  `layers[]` with a changed authored layer's current fields — the §4.4
 *  "optimistic client-side patch" (never a recompile). New layers (no
 *  matching id yet) are left for the next real recompile, not synthesized
 *  here — approximating a template/caption/z-order reflow is out of scope
 *  for a same-tick patch. */
function patchCompiledConfig(
  config: RemotionTemplateConfig,
  changed: Map<string, RemotionLayer>,
  document: VideoProjectDocument
): RemotionTemplateConfig {
  if (changed.size === 0) return config;
  const fps = document.format.fps;
  // Absolute start frame per changed layer id, from the live projection
  // (handles scene re-homing the same way the timeline itself does).
  const absoluteById = new Map<
    string,
    { startFrame: number; durationFrames: number }
  >();
  for (const { clip } of collectAuthoredLayerClips(document)) {
    if (clip.ref.kind !== "layer") continue;
    if (!changed.has(clip.ref.layerId)) continue;
    absoluteById.set(clip.ref.layerId, {
      startFrame: msToFrames(clip.startMs, fps),
      durationFrames: Math.max(1, msToFrames(clip.durationMs, fps)),
    });
  }
  const nextLayers = config.layers.map(layer => {
    const updated = changed.get(layer.id);
    if (!updated) return layer;
    const absolute = absoluteById.get(layer.id);
    return {
      ...layer,
      ...updated,
      ...(absolute
        ? {
            startFrame: absolute.startFrame,
            durationFrames: absolute.durationFrames,
          }
        : {}),
    } as RemotionLayer;
  });
  return { ...config, layers: nextLayers };
}

/** §4.13 conflict recovery — takes the FRESH server document and re-applies
 *  this session's `scene.layers[]` onto it per scene id, so everything else
 *  (narration, captions, scene timing, motion) comes from the server's
 *  latest copy while every hand-placed clip survives. Scenes are never
 *  added/removed/reordered by any `timelineEdits.ts` op (that module's own
 *  invariant), so a same-sceneId swap is always safe here. */
function reapplyLocalLayersOntoFresh(
  freshDocument: VideoProjectDocument,
  localDocument: VideoProjectDocument
): VideoProjectDocument {
  const localBySceneId = new Map(
    localDocument.scenes.map(s => [s.sceneId, s.layers] as const)
  );
  return {
    ...freshDocument,
    scenes: freshDocument.scenes.map(scene => ({
      ...scene,
      layers: localBySceneId.get(scene.sceneId) ?? scene.layers,
    })),
  };
}

export interface TimelineStagePanelProps {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  hasUnsavedChanges: boolean;
  /** §4.13 "Generation job running" — the one legitimate whole-surface
   *  read-only state (an AI stage rewrites scene timings underneath the
   *  user, §4.9.2). Derived by the caller from the same
   *  `getActiveGenerationJob` poll every other stage already uses. Also
   *  pauses autosave (never write into a document an AI stage is about to
   *  rewrite). */
  isGenerationJobActive: boolean;
  /** P2 — the workspace page's `baseRevision`, needed for autosave's
   *  optimistic-concurrency `saveDocument` call. */
  baseRevision: number | null;
  /** P2 — every edit made on this stage is pushed back up immediately (this
   *  is the source of truth other stages/the manual Save button read), even
   *  before autosave commits it to the server. */
  onDocumentChange: (document: VideoProjectDocument) => void;
  /** P2 — called after autosave (or conflict-recovery) commits, so the
   *  parent can sync its own `baseRevision`/"saved" bookkeeping the same
   *  way it does after the manual Save button. */
  onRevisionSaved: (revision: number, document: VideoProjectDocument) => void;
}

export function TimelineStagePanel({
  lang,
  projectId,
  document: documentProp,
  hasUnsavedChanges,
  isGenerationJobActive,
  baseRevision,
  onDocumentChange,
  onRevisionSaved,
}: TimelineStagePanelProps) {
  const width = useViewportWidth();
  const isNarrow = width < NARROW_MAX_WIDTH_PX;
  const isMid = !isNarrow && width < MID_MAX_WIDTH_PX;
  const [isLayerListOpen, setIsLayerListOpen] = useState(false);

  const utils = trpc.useUtils();
  const history = useTimelineHistory(documentProp);
  const document = history.document;
  const missingLayerIds = useMissingLayerIds(document);

  // Keep the parent's draft in sync with EVERY edit (not just autosaved
  // ones) — RenderPanel/other stages/the manual Save button all read the
  // parent's draft. Resets `history` (dropping undo) only when the parent's
  // `document` prop is a genuinely EXTERNAL change (a different object
  // reference than the one this hook itself just produced) — e.g. the
  // conflict-reload path in `VideoStudioWorkspacePage`, or switching stages
  // and back after another panel edited the document.
  const lastEmittedRef = useRef(document);
  useEffect(() => {
    if (documentProp !== lastEmittedRef.current) {
      history.reset(documentProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentProp]);
  useEffect(() => {
    lastEmittedRef.current = document;
    onDocumentChange(document);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [currentMs, setCurrentMs] = useState(0);
  const [assetDropError, setAssetDropError] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const clipboardRef = useRef<RemotionLayer | null>(null);

  const projection = useMemo(() => projectTimeline(document), [document]);
  const hasHandAuthoredLayers = document.scenes.some(
    scene => scene.layers.length > 0
  );

  // P3 §4.5 background concatenation (G3) — the LAST clip (by end time) on
  // the background track, or `null` before any background clip exists (in
  // which case "ต่อคลิป" has nothing to append to and the `ใส่วิดีโอพื้นหลัง`
  // launcher is the entry point instead).
  const lastBackgroundClip = useMemo(() => {
    const track = projection.tracks.find(t => t.kind === "background");
    if (!track || track.clips.length === 0) return null;
    return track.clips.reduce((latest, clip) =>
      clip.startMs + clip.durationMs > latest.startMs + latest.durationMs
        ? clip
        : latest
    );
  }, [projection]);

  const selectedClipRef: TimelineClipRef | null = useMemo(() => {
    if (!selectedClipId) return null;
    for (const { clip } of collectAuthoredLayerClips(document)) {
      if (clip.id === selectedClipId) return clip.ref;
    }
    return null;
  }, [document, selectedClipId]);
  const selectedLayerRef: LayerRef | null = selectedClipRef
    ? refFromClipRef(selectedClipRef)
    : null;
  const selectedLayer = selectedLayerRef
    ? findLayer(document, selectedLayerRef)
    : null;
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const { clip } of collectAuthoredLayerClips(document)) {
      if (clip.id === selectedClipId) return clip;
    }
    return null;
  }, [document, selectedClipId]);

  // ---- P3 §4.8/§6 — audio row selected in the timeline (narration/music
  // only; `sfx` events have no gainDb/span/ducking/fades and are never
  // routed to the inspector). `collectAuthoredLayerClips` deliberately
  // excludes audio rows (its own docstring), so this is looked up directly
  // against `document.audioTracks` by index instead. ----
  const selectedAudioTrackIndex = useMemo(() => {
    const match = /^audio:(\d+)$/.exec(selectedClipId ?? "");
    if (!match) return null;
    const idx = Number(match[1]);
    const track = document.audioTracks[idx];
    return track && track.kind !== "sfx" ? idx : null;
  }, [selectedClipId, document]);
  const selectedAudioTrack =
    selectedAudioTrackIndex != null
      ? (document.audioTracks[selectedAudioTrackIndex] as Extract<
          (typeof document.audioTracks)[number],
          { kind: "narration" | "music" }
        >)
      : null;
  const selectedAudioClip = useMemo(() => {
    if (selectedAudioTrackIndex == null) return null;
    const track = projection.tracks.find(
      t => t.kind === "audio" && t.clips.some(c => c.id === selectedClipId)
    );
    return track?.clips.find(c => c.id === selectedClipId) ?? null;
  }, [projection, selectedAudioTrackIndex, selectedClipId]);

  // ---- Brand kit (§4.8) — resolve the attached kit's locks for the
  // inspector's colour/font constraint. ----
  const brandKitsQuery = trpc.videoProjects.brandKits.list.useQuery();
  const brandKit: InspectorBrandKit | null = useMemo(() => {
    const id = document.brandKitId ? Number(document.brandKitId) : null;
    if (!id || !Number.isInteger(id)) return null;
    const rows = (brandKitsQuery.data ?? []) as Array<{
      id: number;
      colors?: { primary?: string } | null;
      fonts?: { body?: string } | null;
      locks?: { colors?: boolean; fonts?: boolean } | null;
    }>;
    return rows.find(row => row.id === id) ?? null;
  }, [document.brandKitId, brandKitsQuery.data]);

  // ---- P3 launchers (G9) + presets + concat — budget gate (§4.6/AC11) ----
  // Same query key `LayerBudgetMeter` uses, so this never issues a second
  // network request — just reads the already-cached non-throwing count.
  // Every launcher/preset below adds exactly ONE layer (or one audio track,
  // which the server-side count treats as one layer, §3.5), so
  // `compiledTotal >= max` is the exact "would exceed the budget" test.
  const budgetQuery = trpc.videoProjects.getLayerBudget.useQuery({ projectId });
  const budgetFull = Boolean(
    budgetQuery.data && budgetQuery.data.compiledTotal >= budgetQuery.data.max
  );

  const [activeAssetLauncher, setActiveAssetLauncher] = useState<
    "background" | "logo" | "music" | "concat" | null
  >(null);
  const [watermarkSlotToEdit, setWatermarkSlotToEdit] = useState<
    "primary" | "secondary"
  >("primary");
  const [replacementLayerRef, setReplacementLayerRef] =
    useState<LayerRef | null>(null);

  // ---- Compiled config + optimistic patch + debounced recompile (§4.4) ----
  const compileQuery = trpc.videoProjects.compileProject.useQuery(
    { projectId },
    { enabled: !hasUnsavedChanges, retry: false }
  );
  const [compiledConfig, setCompiledConfig] =
    useState<RemotionTemplateConfig | null>(null);
  useEffect(() => {
    if (compileQuery.data?.kind === "single")
      setCompiledConfig(compileQuery.data.config);
  }, [compileQuery.data]);

  // A layer-budget split is an implementation detail of the compiler, not a
  // reason to remove the editor preview. RemotionProjectPreview concatenates
  // these parts in-browser while keeping the same composition per part.
  const previewConfigs = useMemo(() => {
    if (compileQuery.data?.kind === "segmented") return compileQuery.data.parts;
    return compiledConfig ? [compiledConfig] : [];
  }, [compileQuery.data, compiledConfig]);

  const prevDocForPatchRef = useRef(document);
  useEffect(() => {
    const before = prevDocForPatchRef.current;
    prevDocForPatchRef.current = document;
    if (before === document) return;
    const changed = changedLayerIds(before, document);
    if (changed.size === 0) return;
    setCompiledConfig(prev =>
      prev ? patchCompiledConfig(prev, changed, document) : prev
    );
  }, [document]);

  const flagsQuery = trpc.tenantFeatureFlags.getFeatureFlags.useQuery();
  const renderFlagOff =
    flagsQuery.data?.remotionRenderVideoJobEnabled === false;

  useEffect(() => {
    const previewConfig = previewConfigs[0];
    if (!previewConfig) return;
    playerRef.current?.seekTo(msToFrames(currentMs, previewConfig.fps));
  }, [currentMs, previewConfigs]);

  // ---- Autosave (§4.5) + conflict recovery (§4.13/RK4) ----
  const baseRevisionRef = useRef(baseRevision);
  useEffect(() => {
    baseRevisionRef.current = baseRevision;
  }, [baseRevision]);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [conflictPending, setConflictPending] = useState(false);
  const recompileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDocumentMutation = trpc.videoProjects.saveDocument.useMutation({
    onSuccess: result => {
      baseRevisionRef.current = result.revision;
      setAutosaveStatus("saved");
      onRevisionSaved(result.revision, document);
      if (recompileTimerRef.current) clearTimeout(recompileTimerRef.current);
      recompileTimerRef.current = setTimeout(() => {
        utils.videoProjects.compileProject.invalidate({ projectId });
      }, RECOMPILE_AFTER_SAVE_MS);
    },
    onError: error => {
      if (error.data?.code === "CONFLICT") {
        setConflictPending(true);
      } else {
        setAutosaveStatus("error");
      }
    },
  });

  const triggerAutosave = useCallback(() => {
    if (
      isGenerationJobActive ||
      conflictPending ||
      saveDocumentMutation.isPending
    )
      return;
    if (baseRevisionRef.current == null) return;
    setAutosaveStatus("saving");
    saveDocumentMutation.mutate({
      projectId,
      baseRevision: baseRevisionRef.current,
      document,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, isGenerationJobActive, conflictPending, projectId]);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Re-arms the ~1.5s idle autosave timer. Called both from the
   *  document-change effect below AND directly from every gesture-end
   *  handler (drag/resize/transform) — `useTimelineHistory().endGesture()`
   *  does not itself trigger a re-render (see that hook's `bus.breakMerge()`
   *  call), so the `[document]` effect alone would never re-fire once a
   *  drag ends without a further document change; calling this explicitly
   *  closes that gap so autosave reliably starts counting the moment the
   *  gesture (not just the document) settles. */
  const scheduleAutosave = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (history.isGestureOpen() || isGenerationJobActive || conflictPending)
      return;
    idleTimerRef.current = setTimeout(triggerAutosave, AUTOSAVE_IDLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerationJobActive, conflictPending, triggerAutosave]);

  useEffect(() => {
    scheduleAutosave();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  const endGesture = useCallback(() => {
    history.endGesture();
    scheduleAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleAutosave]);

  async function handleKeepMyEdits() {
    const fresh = await utils.videoProjects.get.fetch({ projectId });
    const freshDocument = (fresh?.document ??
      null) as VideoProjectDocument | null;
    if (!fresh || !freshDocument) return;
    const merged = reapplyLocalLayersOntoFresh(freshDocument, document);
    baseRevisionRef.current = fresh.revision;
    history.reset(merged);
    onRevisionSaved(fresh.revision, merged);
    setConflictPending(false);
  }

  // ---- Editing plumbing shared by Timeline drag, LayerListPanel and the
  // inspector — every call routes through `history.apply` so undo/redo and
  // gesture-coalescing (drag = one step) stay centralized in one place. ----
  const applyDiscrete = useCallback(
    (op: (doc: VideoProjectDocument) => VideoProjectDocument) => {
      history.apply(op);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );

  function handleTimelineSelect(
    clip: TimelineClip,
    event: { shiftKey: boolean }
  ) {
    if (event.shiftKey) {
      setSelectedClipIds(prev => {
        const next = new Set(prev);
        if (selectedClipId) next.add(selectedClipId);
        if (next.has(clip.id)) next.delete(clip.id);
        else next.add(clip.id);
        return next;
      });
      setSelectedClipId(clip.id);
      return;
    }
    setSelectedClipIds(new Set([clip.id]));
    setSelectedClipId(clip.id);
  }
  function handleLayerListSelect(_ref: TimelineClipRef, clipId: string) {
    setSelectedClipIds(new Set([clipId]));
    setSelectedClipId(clipId);
  }

  function handleLayerListChange(
    ref: TimelineClipRef,
    field: LayerListFieldKey,
    value: number
  ) {
    const layerRef = refFromClipRef(ref);
    if (!layerRef) return;
    if (field === "startMs") {
      applyDiscrete(doc => moveLayer(doc, layerRef, value));
      return;
    }
    if (field === "durationMs") {
      const clip = projection.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === `layer:${layerRef.sceneId}:${layerRef.layerId}`);
      const startMs = clip?.startMs ?? 0;
      applyDiscrete(doc =>
        resizeLayer(doc, layerRef, "end", startMs + Math.max(1, value))
      );
      return;
    }
    applyDiscrete(doc => setLayerProps(doc, layerRef, { [field]: value }));
  }

  function handleDuplicate(ref: LayerRef | null) {
    if (!ref) return;
    history.apply(doc => {
      const result = duplicateLayer(doc, ref);
      setSelectedClipId(`layer:${ref.sceneId}:${result.layerId}`);
      return result.document;
    });
  }

  function handleRemove(ref: LayerRef | null) {
    if (!ref) return;
    applyDiscrete(doc => removeLayer(doc, ref));
    setSelectedClipId(null);
    setSelectedClipIds(new Set());
  }

  function handlePaste() {
    const source = clipboardRef.current;
    if (!source) return;
    const band = bandForLayer(source);
    history.apply(doc => {
      const {
        type,
        id: _sourceId,
        startFrame: _sf,
        durationFrames,
        name,
        role: _role,
        zIndex: _z,
        ...rest
      } = source as RemotionLayer & Record<string, unknown>;
      const result = addLayer(doc, {
        // NewLayerInput's discriminated union is satisfied structurally by
        // spreading the copied layer's own type-specific fields.
        layer: { type, ...rest } as Parameters<typeof addLayer>[1]["layer"],
        absoluteStartMs: currentMs,
        durationMs: Math.max(1, (durationFrames / doc.format.fps) * 1000),
        band,
        name: name ? `${name} copy` : undefined,
      });
      setSelectedClipId(
        `layer:${doc.scenes.find(s => s.layers.some(l => l.id === result.layerId))?.sceneId ?? ""}:${result.layerId}`
      );
      return result.document;
    });
  }

  // ---- P3 §4.8/§6 audio-track controls (timeline row + inspector) — every
  // handler routes through `applyDiscrete`/`history.apply` like every other
  // edit in this file, so undo/redo (G7) and autosave (§4.5) cover audio
  // edits identically to layer edits. Never a group-drag/gesture concern
  // here (no pointer gesture exists for these controls, see
  // `TimelineTracks.tsx`'s docstring), so `applyDiscrete` (one undo step per
  // call) is always correct, not `history.apply` with a merge id. ----
  function handleAudioGainChange(trackIndex: number, gainDb: number) {
    applyDiscrete(doc => setAudioTrackGainDb(doc, trackIndex, gainDb));
  }
  function handleAudioDuckingChange(trackIndex: number, ducking: boolean) {
    applyDiscrete(doc => setAudioTrackDucking(doc, trackIndex, ducking));
  }
  function handleAudioSpanChange(
    trackIndex: number,
    span: { startMs: number | null; endMs: number | null }
  ) {
    applyDiscrete(doc => setAudioTrackSpan(doc, trackIndex, span));
  }
  function handleAudioFadesChange(
    trackIndex: number,
    fades: { fadeInMs: number; fadeOutMs: number }
  ) {
    applyDiscrete(doc => setAudioTrackFades(doc, trackIndex, fades));
  }
  function handleAudioRemove(trackIndex: number) {
    applyDiscrete(doc => removeAudioTrack(doc, trackIndex));
    setSelectedClipId(null);
    setSelectedClipIds(new Set());
  }

  // ---- P3 launchers (G9), presets, background concatenation (G3) ----
  // All go through `history.apply`/`addLayer`/`timelineEdits.ts` ops — never
  // a hand-built layer object — and select the new clip immediately, same
  // convention as `handleDuplicate`/`handlePaste` above.
  function selectLayerAfterAdd(
    nextDocument: VideoProjectDocument,
    layerId: string
  ) {
    const sceneId = findLayerSceneId(nextDocument, layerId) ?? "";
    const clipId = `layer:${sceneId}:${layerId}`;
    setSelectedClipId(clipId);
    setSelectedClipIds(new Set([clipId]));
  }

  function handleBackgroundPick(asset: VideoStudioPickerAsset) {
    setActiveAssetLauncher(null);
    void (async () => {
      const probedMs = await probeMediaDurationMs(asset.storageUrl, "video");
      // §2's rule: document duration, or the clip's OWN duration if shorter.
      const durationMs = Math.max(
        1,
        probedMs != null
          ? Math.min(document.format.durationMs, probedMs)
          : document.format.durationMs
      );
      history.apply(doc => {
        const result = addLayer(doc, {
          layer: { type: "video", src: asset.storageUrl },
          absoluteStartMs: 0,
          durationMs,
          band: "background",
          name: pickCopy(lang, videoStudioCopy.timelineLauncherBackground),
        });
        selectLayerAfterAdd(result.document, result.layerId);
        return result.document;
      });
    })();
  }

  function handleLogoPick(asset: VideoStudioPickerAsset) {
    setActiveAssetLauncher(null);
    history.apply(doc => {
      // Watermarks are project-level render overlays, like Vertical Drama's
      // primary slot.  Keeping the asset id in the document means the
      // compiler can render it on every segment and it never consumes the
      // user's 40 authored-layer budget or drifts when scenes are edited.
      const primary = doc.watermark ?? {
        enabled: true,
        assetId: asset.assetId,
        position: "top_right" as const,
        opacity: 0.45,
        scalePct: 10,
        marginPx: 32,
      };
      if (watermarkSlotToEdit === "secondary") {
        return {
          ...doc,
          watermark: {
            ...primary,
            enabled: true,
            secondary: {
              enabled: true,
              assetId: asset.assetId,
              position: "bottom_right",
              opacity: 0.45,
              scalePct: 10,
              marginPx: 32,
              ...(doc.watermark?.secondary
                ? {
                    position: doc.watermark.secondary.position,
                    opacity: doc.watermark.secondary.opacity,
                    scalePct: doc.watermark.secondary.scalePct,
                    marginPx: doc.watermark.secondary.marginPx,
                  }
                : {}),
            },
          },
        };
      }
      return {
        ...doc,
        watermark: { ...primary, enabled: true, assetId: asset.assetId },
      };
    });
  }

  function handleReplacementPick(asset: VideoStudioPickerAsset) {
    const ref = replacementLayerRef;
    setActiveAssetLauncher(null);
    setReplacementLayerRef(null);
    if (!ref) return;
    applyDiscrete(doc => replaceLayerSource(doc, ref, asset.storageUrl));
  }

  function handleMusicPick(asset: VideoStudioPickerAsset) {
    setActiveAssetLauncher(null);
    // Writes `document.audioTracks`, NOT `scene.layers` (§4.8) — no
    // scene.layers[] selection to make afterward. Omitting startMs/endMs
    // means the track spans (and, per the compiler, loops across) the
    // whole document, per §2's requirement.
    applyDiscrete(doc => addMusicAudioTrack(doc, asset.assetId));
  }

  function handleTextLauncher() {
    if (budgetFull) return;
    history.apply(doc => {
      const rect = computeSafeAreaRect(doc.content.platformPreset);
      const width = 60;
      const height = 14;
      const result = addLayer(doc, {
        layer: {
          type: "text",
          content: pickCopy(lang, videoStudioCopy.timelineLauncherText),
          textAlign: "center",
          ...resolveTextStyle(brandKit),
        },
        absoluteStartMs: currentMs,
        durationMs: Math.max(
          1,
          Math.min(3000, doc.format.durationMs - currentMs)
        ),
        band: "overlay",
        geometry: {
          x: rect.left + (rect.right - rect.left - width) / 2,
          y: rect.top,
          width,
          height,
        },
        name: pickCopy(lang, videoStudioCopy.timelineLauncherText),
      });
      selectLayerAfterAdd(result.document, result.layerId);
      return result.document;
    });
  }

  function handleExternalAssetDrop(
    asset: VideoStudioTimelineAsset,
    atMs: number
  ) {
    if (asset.kind !== "image" && asset.kind !== "video") return;
    setAssetDropError(false);
    const startMs = Math.min(
      Math.max(0, atMs),
      Math.max(0, document.format.durationMs - 1)
    );
    void (async () => {
      const probedMs =
        asset.kind === "video"
          ? await probeMediaDurationMs(asset.storageUrl, "video")
          : null;
      const durationMs = Math.max(
        1,
        Math.min(document.format.durationMs - startMs, probedMs ?? 3000)
      );
      history.apply(doc => {
        const result = addLayer(doc, {
          layer:
            asset.kind === "video"
              ? { type: "video", src: asset.storageUrl }
              : { type: "image", src: asset.storageUrl, fit: "contain" },
          absoluteStartMs: startMs,
          durationMs,
          band: asset.kind === "video" ? "background" : "overlay",
          name: asset.kind === "video" ? "วิดีโอจากคลัง" : "ภาพจากคลัง",
        });
        selectLayerAfterAdd(result.document, result.layerId);
        return result.document;
      });
    })();
  }

  function handleExternalFileDrop(file: File, atMs: number) {
    const kind = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("image/")
        ? "image"
        : null;
    if (!kind) {
      setAssetDropError(true);
      return;
    }
    void (async () => {
      try {
        const uploaded = await uploadMedia(file, {
          metadata: { videoStudioImport: true },
        });
        handleExternalAssetDrop(
          {
            assetId: uploaded.assetId,
            storageUrl: uploaded.url,
            sha256: "",
            kind,
            thumbnailUrl: uploaded.thumbnailUrl ?? undefined,
          },
          atMs
        );
      } catch {
        setAssetDropError(true);
      }
    })();
  }

  function handleConcatPick(asset: VideoStudioPickerAsset) {
    setActiveAssetLauncher(null);
    if (!lastBackgroundClip || lastBackgroundClip.ref.kind !== "layer") return;
    const prevRef: LayerRef = {
      sceneId: lastBackgroundClip.ref.sceneId,
      layerId: lastBackgroundClip.ref.layerId,
    };
    const prevLayer = findLayer(document, prevRef);
    const absoluteStartMs =
      lastBackgroundClip.startMs + lastBackgroundClip.durationMs;
    void (async () => {
      const probedMs = await probeMediaDurationMs(asset.storageUrl, "video");
      // No document-duration ceiling here (unlike the first background
      // clip) — concatenation is explicitly how a background outlives one
      // scene/one document-length span (§4.5 G3); falls back to a nominal
      // 3s when the probe can't determine the source's own length.
      const durationMs = Math.max(1, probedMs ?? 3000);
      history.apply(doc => {
        const result = addLayer(doc, {
          layer: { type: "video", src: asset.storageUrl },
          absoluteStartMs,
          durationMs,
          band: "background",
          // Same geometry/band as the clip it continues — a hard cut, same
          // full-bleed strip, never implying a transition (§4.5).
          geometry: prevLayer
            ? {
                x: prevLayer.x,
                y: prevLayer.y,
                width: prevLayer.width,
                height: prevLayer.height,
                rotationDeg: prevLayer.rotationDeg,
                opacity: prevLayer.opacity,
              }
            : undefined,
          name: pickCopy(lang, videoStudioCopy.timelineConcatenate),
        });
        selectLayerAfterAdd(result.document, result.layerId);
        return result.document;
      });
    })();
  }

  function handleApplyPreset(id: TimelinePresetId) {
    if (budgetFull) return;
    const definition = TIMELINE_PRESETS.find(p => p.id === id);
    if (!definition) return;
    history.apply(doc => {
      const result = definition.apply(doc, brandKit);
      if (result.layerIds[0])
        selectLayerAfterAdd(result.document, result.layerIds[0]);
      return result.document;
    });
  }

  // Shared row-action handlers passed identically to every LayerListPanel
  // instance (narrow / mid-collapsed / wide) — one definition, no drift.
  const layerListActions = {
    onChange: handleLayerListChange,
    onRename: (ref: TimelineClipRef, name: string) => {
      const layerRef = refFromClipRef(ref);
      if (layerRef) applyDiscrete(doc => renameLayer(doc, layerRef, name));
    },
    onToggleLock: (ref: TimelineClipRef) => {
      const layerRef = refFromClipRef(ref);
      const layer = layerRef ? findLayer(document, layerRef) : null;
      if (layerRef && layer)
        applyDiscrete(doc => setLayerLocked(doc, layerRef, !layer.locked));
    },
    onToggleHidden: (ref: TimelineClipRef) => {
      const layerRef = refFromClipRef(ref);
      const layer = layerRef ? findLayer(document, layerRef) : null;
      if (layerRef && layer)
        applyDiscrete(doc => setLayerHidden(doc, layerRef, !layer.hidden));
    },
    onBringForward: (ref: TimelineClipRef) => {
      const layerRef = refFromClipRef(ref);
      if (layerRef) applyDiscrete(doc => bringForward(doc, layerRef));
    },
    onSendBackward: (ref: TimelineClipRef) => {
      const layerRef = refFromClipRef(ref);
      if (layerRef) applyDiscrete(doc => sendBackward(doc, layerRef));
    },
    onDuplicate: (ref: TimelineClipRef) => handleDuplicate(refFromClipRef(ref)),
    onRemove: (ref: TimelineClipRef) => handleRemove(refFromClipRef(ref)),
    missingLayerIds,
    onReplaceMissing: (ref: TimelineClipRef) => {
      const layerRef = refFromClipRef(ref);
      const layer = layerRef ? findLayer(document, layerRef) : null;
      if (
        !layerRef ||
        !layer ||
        (layer.type !== "image" && layer.type !== "video")
      )
        return;
      const clipId = `layer:${layerRef.sceneId}:${layerRef.layerId}`;
      setSelectedClipId(clipId);
      setSelectedClipIds(new Set([clipId]));
      setReplacementLayerRef(layerRef);
      setActiveAssetLauncher(layer.type === "video" ? "background" : "logo");
    },
  };

  // ---- Keyboard (§4.5) ----
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isFormField = Boolean(
        target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      );
      const meta = event.ctrlKey || event.metaKey;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
        return;
      }
      if (isFormField) return;

      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handleDuplicate(selectedLayerRef);
        return;
      }
      if (meta && event.key.toLowerCase() === "c") {
        if (selectedLayer) clipboardRef.current = selectedLayer;
        return;
      }
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        handlePaste();
        return;
      }

      if (!selectedLayerRef || !selectedClip) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const fps = document.format.fps;
        const stepMs = event.shiftKey
          ? 1000
          : Math.max(1, Math.round(1000 / fps));
        const deltaMs = event.key === "ArrowLeft" ? -stepMs : stepMs;
        const ref = selectedLayerRef;
        const targetMs = Math.max(0, selectedClip.startMs + deltaMs);
        applyDiscrete(doc => moveLayer(doc, ref, targetMs));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, selectedLayerRef, selectedClip, selectedLayer]);

  // ---- Transform overlay geometry + snap candidates ----
  const overlayGeometry =
    selectedLayer && selectedClipRef?.kind === "layer"
      ? {
          x: selectedLayer.x,
          y: selectedLayer.y,
          width: selectedLayer.width,
          height: selectedLayer.height,
          rotationDeg: selectedLayer.rotationDeg,
        }
      : null;
  const snapCandidates: SnapCandidate[] = useMemo(() => {
    if (!selectedLayerRef) return [];
    return collectAuthoredLayerClips(document)
      .filter(
        ({ clip }) =>
          clip.ref.kind === "layer" &&
          clip.ref.layerId !== selectedLayerRef.layerId
      )
      .map(({ layer }) => ({
        id: layer.id,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      }));
  }, [document, selectedLayerRef]);

  const showLoadingSkeleton =
    hasUnsavedChanges === false &&
    compileQuery.isLoading &&
    previewConfigs.length === 0;

  return (
    <div data-testid="vs-timeline-stage" className="flex flex-col gap-4">
      <Text type="supporting" color="secondary">
        {pickCopy(lang, videoStudioCopy.stageComposeHelper)}
      </Text>

      <HStack justify="between" align="center" wrap="wrap">
        <HStack gap={1}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="vs-undo"
            isDisabled={!history.canUndo}
            label={pickCopy(lang, videoStudioCopy.timelineUndo)}
            onClick={() => history.undo()}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="vs-redo"
            isDisabled={!history.canRedo}
            label={pickCopy(lang, videoStudioCopy.timelineRedo)}
            onClick={() => history.redo()}
          />
        </HStack>
        <Text
          type="supporting"
          color="secondary"
          data-testid="vs-autosave-status"
        >
          {autosaveStatus === "saving"
            ? pickCopy(lang, videoStudioCopy.timelineAutosaveSaving)
            : autosaveStatus === "saved"
              ? pickCopy(lang, videoStudioCopy.timelineAutosaveSaved)
              : autosaveStatus === "error"
                ? pickCopy(lang, videoStudioCopy.timelineAutosaveError)
                : ""}
        </Text>
      </HStack>

      {conflictPending ? (
        <Banner
          data-testid="vs-timeline-conflict-banner"
          status="error"
          title={pickCopy(lang, videoStudioCopy.timelineConflictTitle)}
          description={pickCopy(lang, videoStudioCopy.timelineConflictBody)}
          endContent={
            <Button
              variant="secondary"
              size="sm"
              data-testid="vs-timeline-conflict-keep-mine"
              label={pickCopy(lang, videoStudioCopy.timelineConflictKeepMine)}
              onClick={handleKeepMyEdits}
            />
          }
        />
      ) : null}

      {isGenerationJobActive ? (
        <Banner
          data-testid="vs-timeline-readonly-banner"
          status="info"
          title={pickCopy(lang, videoStudioCopy.timelineReadOnlyGenerating)}
        />
      ) : null}

      {!isGenerationJobActive && renderFlagOff ? (
        <Banner
          data-testid="vs-timeline-flag-off-note"
          status="warning"
          title={pickCopy(lang, videoStudioCopy.timelineRenderFlagOffNote)}
        />
      ) : null}

      {isNarrow ? (
        <Banner
          data-testid="vs-timeline-narrow-banner"
          status="info"
          title={pickCopy(lang, videoStudioCopy.timelineNarrowScreenBanner)}
        />
      ) : null}

      {/* §4.14 — narrow: LayerListPanel first (primary surface). */}
      {isNarrow ? (
        <LayerListPanel
          lang={lang}
          document={document}
          selectedClipId={selectedClipId}
          onSelect={handleLayerListSelect}
          editable={!isGenerationJobActive}
          {...layerListActions}
        />
      ) : null}

      <LayerBudgetMeter lang={lang} projectId={projectId} />

      {/* P3 G9 — the four launchers + named presets + background
          concatenation, reachable BOTH here (a persistent toolbar, per the
          task brief's "must ALSO be reachable when the timeline is
          non-empty") and via the empty-state card below (§4.13's "highest
          value screen", which now only carries the framing copy — the
          buttons themselves live in exactly one place so there is never a
          second, out-of-sync set of launcher handlers). */}
      <Card data-testid="vs-timeline-launcher-toolbar">
        <VStack gap={2}>
          <Text type="body" weight="medium">
            {pickCopy(lang, videoStudioCopy.timelineLauncherToolbarTitle)}
          </Text>
          <HStack gap={2} wrap="wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="vs-launcher-background"
              isDisabled={isGenerationJobActive || budgetFull}
              label={pickCopy(lang, videoStudioCopy.timelineLauncherBackground)}
              onClick={() => setActiveAssetLauncher("background")}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="vs-launcher-text"
              isDisabled={isGenerationJobActive || budgetFull}
              label={pickCopy(lang, videoStudioCopy.timelineLauncherText)}
              onClick={handleTextLauncher}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="vs-launcher-logo"
              isDisabled={isGenerationJobActive || budgetFull}
              label={pickCopy(lang, videoStudioCopy.timelineLauncherLogo)}
              onClick={() => {
                setWatermarkSlotToEdit("primary");
                setActiveAssetLauncher("logo");
              }}
            />
            {document.watermark?.enabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="vs-launcher-secondary-logo"
                isDisabled={isGenerationJobActive}
                label="เพิ่มลายน้ำที่สอง"
                onClick={() => {
                  setWatermarkSlotToEdit("secondary");
                  setActiveAssetLauncher("logo");
                }}
              />
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="vs-launcher-music"
              isDisabled={isGenerationJobActive || budgetFull}
              label={pickCopy(lang, videoStudioCopy.timelineLauncherMusic)}
              onClick={() => setActiveAssetLauncher("music")}
            />
            {lastBackgroundClip ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="vs-concat-clip"
                isDisabled={isGenerationJobActive || budgetFull}
                label={pickCopy(lang, videoStudioCopy.timelineConcatenate)}
                onClick={() => setActiveAssetLauncher("concat")}
              />
            ) : null}
          </HStack>

          {budgetFull ? (
            <Text
              type="supporting"
              color="secondary"
              data-testid="vs-launcher-budget-full"
            >
              {pickCopy(lang, videoStudioCopy.timelineLauncherBudgetFull)}
            </Text>
          ) : null}
          {lastBackgroundClip ? (
            <Text type="supporting" color="secondary">
              {pickCopy(lang, videoStudioCopy.timelineConcatenateHint)}
            </Text>
          ) : null}

          <Text type="supporting" color="secondary" weight="medium">
            {pickCopy(lang, videoStudioCopy.timelinePresetsTitle)}
          </Text>
          <HStack gap={2} wrap="wrap">
            {TIMELINE_PRESETS.map(preset => (
              <Button
                key={preset.id}
                type="button"
                variant="ghost"
                size="sm"
                data-testid="vs-preset"
                data-preset-id={preset.id}
                isDisabled={isGenerationJobActive || budgetFull}
                label={pickCopy(lang, preset.label)}
                onClick={() => handleApplyPreset(preset.id)}
              />
            ))}
          </HStack>
        </VStack>
      </Card>

      {document.watermark?.enabled ? (
        <Card variant="muted" padding={2} data-testid="vs-watermark-settings">
          <VStack gap={2}>
            <Text type="body" weight="medium">
              ลายน้ำโปรเจกต์
            </Text>
            <HStack gap={2} wrap="wrap" align="end">
              <label className="grid gap-1 text-sm">
                <span>ตำแหน่ง</span>
                <select
                  value={document.watermark.position}
                  onChange={event =>
                    history.apply(doc => ({
                      ...doc,
                      watermark: doc.watermark
                        ? {
                            ...doc.watermark,
                            position: event.target.value as NonNullable<
                              typeof doc.watermark
                            >["position"],
                          }
                        : doc.watermark,
                    }))
                  }
                  className="rounded-md border px-2 py-1.5"
                >
                  {[
                    ["top_left", "บนซ้าย"],
                    ["top_center", "บนกลาง"],
                    ["top_right", "บนขวา"],
                    ["middle_left", "กลางซ้าย"],
                    ["middle_center", "กลาง"],
                    ["middle_right", "กลางขวา"],
                    ["bottom_left", "ล่างซ้าย"],
                    ["bottom_center", "ล่างกลาง"],
                    ["bottom_right", "ล่างขวา"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>
                  ความทึบ {Math.round(document.watermark.opacity * 100)}%
                </span>
                <input
                  type="range"
                  min="20"
                  max="80"
                  value={Math.round(document.watermark.opacity * 100)}
                  onChange={event =>
                    history.apply(doc => ({
                      ...doc,
                      watermark: doc.watermark
                        ? {
                            ...doc.watermark,
                            opacity: Number(event.target.value) / 100,
                          }
                        : doc.watermark,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>ขนาด {document.watermark.scalePct}%</span>
                <input
                  type="range"
                  min="5"
                  max="20"
                  value={document.watermark.scalePct}
                  onChange={event =>
                    history.apply(doc => ({
                      ...doc,
                      watermark: doc.watermark
                        ? {
                            ...doc.watermark,
                            scalePct: Number(event.target.value),
                          }
                        : doc.watermark,
                    }))
                  }
                />
              </label>
            </HStack>
            <Text type="supporting" color="secondary">
              ลายน้ำจะติดตลอดวิดีโอ รวมทุกช่วง render และถูกล็อกเป็น brand
              overlay
            </Text>
          </VStack>
        </Card>
      ) : null}

      {activeAssetLauncher ? (
        <VideoStudioAssetPicker
          lang={lang}
          open
          onOpenChange={open => {
            if (!open) {
              setActiveAssetLauncher(null);
              setReplacementLayerRef(null);
            }
          }}
          kind={LAUNCHER_ASSET_KIND[activeAssetLauncher]}
          title={
            replacementLayerRef
              ? pickCopy(lang, videoStudioCopy.timelineReplaceMissingAssetTitle)
              : activeAssetLauncher === "background" ||
                  activeAssetLauncher === "concat"
                ? pickCopy(
                    lang,
                    videoStudioCopy.timelineLauncherBackgroundPickerTitle
                  )
                : activeAssetLauncher === "logo"
                  ? pickCopy(
                      lang,
                      videoStudioCopy.timelineLauncherLogoPickerTitle
                    )
                  : pickCopy(
                      lang,
                      videoStudioCopy.timelineLauncherMusicPickerTitle
                    )
          }
          onPick={
            replacementLayerRef
              ? handleReplacementPick
              : activeAssetLauncher === "background"
                ? handleBackgroundPick
                : activeAssetLauncher === "logo"
                  ? handleLogoPick
                  : activeAssetLauncher === "music"
                    ? handleMusicPick
                    : handleConcatPick
          }
          data-testid="vs-launcher-asset-picker"
        />
      ) : null}

      {missingLayerIds.size > 0 ? (
        <Banner
          data-testid="vs-timeline-missing-asset-banner"
          status="error"
          title={pickCopy(lang, videoStudioCopy.timelineMissingAssetBanner)}
        />
      ) : null}

      {compileQuery.data?.kind === "segmented" ? (
        <Banner
          data-testid="vs-timeline-segmented-warning"
          status="success"
          title={pickCopy(lang, videoStudioCopy.timelineSegmentedNotSupported)}
        />
      ) : null}

      {compileQuery.isError && previewConfigs.length === 0 ? (
        <Banner
          status="error"
          title={pickCopy(lang, videoStudioCopy.compileError)}
          description={describeViError(lang, compileQuery.error.message)}
        />
      ) : null}

      {showLoadingSkeleton ? (
        <div
          data-testid="vs-timeline-loading-skeleton"
          className="flex flex-col gap-2"
        >
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.timelineLoadingSkeleton)}
          </Text>
          <Skeleton height={240} width="100%" radius={2} />
          {projection.tracks.map(track => (
            <Skeleton key={track.id} height={40} width="100%" radius={1} />
          ))}
        </div>
      ) : (
        <>
          {previewConfigs.length > 0 ? (
            <div
              className={`relative mx-auto w-full ${previewConfigs[0]!.width > previewConfigs[0]!.height ? "max-w-3xl" : "max-w-md"} overflow-hidden rounded-2xl border border-border/60 bg-slate-950 p-1.5 shadow-xl shadow-slate-950/15`}
              data-testid="vs-timeline-preview-frame"
            >
              <RemotionProjectPreview
                config={
                  previewConfigs.length === 1
                    ? previewConfigs[0]!
                    : previewConfigs
                }
                playerRef={playerRef}
              />
              <TransformOverlay
                lang={lang}
                geometry={overlayGeometry}
                locked={Boolean(selectedLayer?.locked)}
                snapCandidates={snapCandidates}
                onChange={patch => {
                  if (!selectedLayerRef) return;
                  history.apply(doc =>
                    setLayerProps(doc, selectedLayerRef, patch)
                  );
                }}
                onGestureStart={() =>
                  history.beginGesture(
                    `vs-transform-${selectedLayerRef?.layerId ?? "none"}`
                  )
                }
                onGestureEnd={endGesture}
              />
            </div>
          ) : null}

          {!hasHandAuthoredLayers ? (
            // §4.13 "Empty" state — not an error, the highest-value screen
            // in the feature. The four G9 launchers (plus presets/concat)
            // are wired in the persistent toolbar ABOVE (rendered
            // unconditionally, so they're already visible here too) — this
            // card carries only the framing copy, never a second/duplicate
            // set of buttons.
            <Card data-testid="vs-timeline-empty-launchers">
              <VStack gap={2}>
                <Text type="body" weight="medium">
                  {pickCopy(lang, videoStudioCopy.timelineEmptyTitle)}
                </Text>
                <Text type="supporting" color="secondary">
                  {pickCopy(lang, videoStudioCopy.timelineEmptyBody)}
                </Text>
              </VStack>
            </Card>
          ) : null}

          <div className="grid gap-4">
            <Timeline
              lang={lang}
              projection={projection}
              currentMs={currentMs}
              onPlayheadChange={setCurrentMs}
              selectedClipId={selectedClipId}
              selectedClipIds={selectedClipIds}
              onSelect={handleTimelineSelect}
              captionsBurnIn={document.captions.burnIn}
              document={document}
              dragEnabled={!isNarrow && !isGenerationJobActive}
              onApply={op => history.apply(op)}
              onGestureStart={gestureId => history.beginGesture(gestureId)}
              onGestureEnd={endGesture}
              onAudioGainChange={handleAudioGainChange}
              onAudioDuckingChange={handleAudioDuckingChange}
              onAudioSpanToggle={handleAudioSpanChange}
              onAudioRemove={handleAudioRemove}
              audioControlsDisabled={isGenerationJobActive}
              missingLayerIds={missingLayerIds}
              onExternalAssetDrop={handleExternalAssetDrop}
              onExternalFileDrop={handleExternalFileDrop}
            />
          </div>
          {assetDropError ? (
            <Banner
              status="error"
              title={pickCopy(lang, videoStudioCopy.assetImportError)}
              endContent={
                <Button
                  variant="ghost"
                  size="sm"
                  label={pickCopy(lang, videoStudioCopy.dismiss)}
                  onClick={() => setAssetDropError(false)}
                />
              }
            />
          ) : null}

          {selectedAudioTrack && selectedAudioTrackIndex != null ? (
            <AudioTrackInspectorPanel
              lang={lang}
              track={selectedAudioTrack}
              startMs={selectedAudioClip?.startMs ?? 0}
              durationMs={
                selectedAudioClip?.durationMs ?? document.format.durationMs
              }
              documentDurationMs={document.format.durationMs}
              onGainChange={gainDb =>
                handleAudioGainChange(selectedAudioTrackIndex, gainDb)
              }
              onDuckingChange={ducking =>
                handleAudioDuckingChange(selectedAudioTrackIndex, ducking)
              }
              onSpanChange={span =>
                handleAudioSpanChange(selectedAudioTrackIndex, span)
              }
              onFadesChange={fades =>
                handleAudioFadesChange(selectedAudioTrackIndex, fades)
              }
              onRemove={() => handleAudioRemove(selectedAudioTrackIndex)}
            />
          ) : (
            <LayerInspectorPanel
              lang={lang}
              layer={selectedLayer}
              startMs={selectedClip?.startMs ?? 0}
              durationMs={selectedClip?.durationMs ?? 0}
              brandKit={brandKit}
              onPatch={patch => {
                if (selectedLayerRef)
                  applyDiscrete(doc =>
                    setLayerProps(doc, selectedLayerRef, patch)
                  );
              }}
              onRename={name => {
                if (selectedLayerRef)
                  applyDiscrete(doc =>
                    renameLayer(doc, selectedLayerRef, name)
                  );
              }}
              onMoveStart={newStartMs => {
                if (selectedLayerRef)
                  applyDiscrete(doc =>
                    moveLayer(doc, selectedLayerRef, newStartMs)
                  );
              }}
              onResizeEnd={newEndMs => {
                if (selectedLayerRef)
                  applyDiscrete(doc =>
                    resizeLayer(doc, selectedLayerRef, "end", newEndMs)
                  );
              }}
              onToggleLock={() => {
                if (selectedLayerRef && selectedLayer) {
                  applyDiscrete(doc =>
                    setLayerLocked(doc, selectedLayerRef, !selectedLayer.locked)
                  );
                }
              }}
              onToggleHidden={() => {
                if (selectedLayerRef && selectedLayer) {
                  applyDiscrete(doc =>
                    setLayerHidden(doc, selectedLayerRef, !selectedLayer.hidden)
                  );
                }
              }}
              onBringForward={() => {
                if (selectedLayerRef)
                  applyDiscrete(doc => bringForward(doc, selectedLayerRef));
              }}
              onSendBackward={() => {
                if (selectedLayerRef)
                  applyDiscrete(doc => sendBackward(doc, selectedLayerRef));
              }}
              onDuplicate={() => handleDuplicate(selectedLayerRef)}
              onRemove={() => handleRemove(selectedLayerRef)}
            />
          )}

          {!isNarrow && isMid ? (
            <VStack gap={2}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                label={pickCopy(lang, videoStudioCopy.layerListTitle)}
                aria-expanded={isLayerListOpen}
                onClick={() => setIsLayerListOpen(prev => !prev)}
              />
              {isLayerListOpen ? (
                <LayerListPanel
                  lang={lang}
                  document={document}
                  selectedClipId={selectedClipId}
                  onSelect={handleLayerListSelect}
                  editable={!isGenerationJobActive}
                  {...layerListActions}
                />
              ) : null}
            </VStack>
          ) : null}

          {!isNarrow && !isMid ? (
            <LayerListPanel
              lang={lang}
              document={document}
              selectedClipId={selectedClipId}
              onSelect={handleLayerListSelect}
              editable={!isGenerationJobActive}
              {...layerListActions}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
