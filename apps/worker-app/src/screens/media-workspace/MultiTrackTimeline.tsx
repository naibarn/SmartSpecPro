import { useWorkerLocale } from "../../app/workerContext";
import { splitTimelineClip, trimTimelineClip } from "./timelineEdits";
import { isProjectFilePath } from "./projectPersistence";
import { normalizeDisplayPath } from "./sourcePath";
import React, { useState, useRef, useMemo, useEffect } from "react";
import type { SmartSpecProjectDraft, NleTrack, NleClip, ProjectAsset } from "../../types/nleProject";
import {
  canMoveTimelineClip,
  canPlaceMediaOnTrack,
  chooseAssetTargetTrack,
  moveTimelineClip,
  normalizeTimelineDropAsset,
} from "./mediaWorkspaceTimeline";

const TIMELINE_CLIP_MIME = "application/x-smartspec-timeline-clip";

type TimelinePointerDrag = {
  sourceTrackId: string;
  clipId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  pointerOffsetMs: number;
  moved: boolean;
  targetTrackId: string;
  timelineStartMs: number;
};

export interface MultiTrackTimelineProps {
  project: SmartSpecProjectDraft;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  onSeek: (timeMs: number) => void;
  onTogglePlay: () => void;
  onUpdateProject: (updated: SmartSpecProjectDraft) => void;
  onOpenAutoSubtitles: () => void;
  onOpenVoiceGuidedVisualMatch?: () => void;
  onOpenCodeOverlayModal: () => void;
  onOpenAssetDrawer: () => void;
  onDetachAudio: () => void;
  onOpenAudioScoringModal?: () => void;
  onOpenTextOverlayModal?: () => void;
  onOpenStockSvgModal?: () => void;
  onOpenBlurOverlayModal?: () => void;
  onOpenVoiceoverModal?: () => void;
  onOpenAiMediaStudioModal?: () => void;
  onSaveProjectFile: () => void;
  onExportCapCutDraft: () => void;
  onOpenProjectSettings?: () => void;
  isMediaBinOpen?: boolean;
  onOpenMediaBin?: () => void;
  onCloseMediaBin?: () => void;
  isDuckingActive?: boolean;
  onDropAsset?: (trackId: string, asset: any, dropTimeMs?: number) => void;
  onAddAssetClip?: (trackId: string, clip: NleClip) => void | Promise<void>;
}

function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 30);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
}

export function MultiTrackTimeline({
  project,
  currentTimeMs,
  durationMs,
  isPlaying,
  onSeek,
  onTogglePlay,
  onUpdateProject,
  onOpenAutoSubtitles,
  onOpenVoiceGuidedVisualMatch,
  onOpenCodeOverlayModal,
  onOpenAssetDrawer,
  onDetachAudio,
  onOpenAudioScoringModal,
  onOpenTextOverlayModal,
  onOpenStockSvgModal,
  onOpenBlurOverlayModal,
  onOpenVoiceoverModal,
  onOpenAiMediaStudioModal,
  onSaveProjectFile,
  onExportCapCutDraft,
  onOpenProjectSettings,
  isMediaBinOpen = true,
  onOpenMediaBin,
  onCloseMediaBin,
  isDuckingActive = false,
  onDropAsset,
  onAddAssetClip,
}: MultiTrackTimelineProps) {
  const locale = useWorkerLocale();
  const t = (th: string, en: string) => locale === "th" ? th : en;
  const timelineTracksRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState<number>(1.0); // 1.0 = fit, up to 4.0
  const [soloTrackId, setSoloTrackId] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const [selectedTargetTrackId, setSelectedTargetTrackId] = useState<string | null>("track_v1");
  const pointerDragRef = useRef<TimelinePointerDrag | null>(null);
  const [pointerDraggingClip, setPointerDraggingClip] = useState<{ trackId: string; clipId: string } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ targetTrackId: string; timelineStartMs: number } | null>(null);
  const [pointerDragTargetTrackId, setPointerDragTargetTrackId] = useState<string | null>(null);

  const [trimmingClip, setTrimmingClip] = useState<{
    trackId: string;
    clipId: string;
    edge: "left" | "right";
    initialStartX: number;
    initialStartMs: number;
    initialDurationMs: number;
    initialTrimInMs: number;
    initialTrimOutMs: number;
  } | null>(null);

  const maxClipEndMs = useMemo(() => {
    let maxEnd = 0;
    for (const t of project.tracks) {
      for (const c of t.clips) {
        maxEnd = Math.max(maxEnd, c.timelineStartMs + c.durationMs);
      }
    }
    return maxEnd;
  }, [project.tracks]);

  // The canvas duration is the edited timeline duration. Prefer it over the
  // source-player duration so a dead-air cut does not leave a ruler that is
  // longer than the clips shown below it. A clip placed beyond the canvas is
  // still allowed to extend the visible range, but never gets an arbitrary
  // 30-second tail that makes clip lengths look wrong.
  const effectiveDurationMs = Math.max(
    1000,
    project.canvas.durationMs || durationMs || 60000,
    maxClipEndMs,
  );

  useEffect(() => {
    setSelectedTargetTrackId((current) => {
      if (current && project.tracks.some((track) => track.id === current && !track.locked)) return current;
      return project.tracks.find((track) => track.id === "track_v1" && !track.locked)?.id
        ?? project.tracks.find((track) => !track.locked)?.id
        ?? null;
    });
    setSelectedClip((current) => {
      if (!current) return current;
      const track = project.tracks.find((candidate) => candidate.id === current.trackId);
      return track?.clips.some((clip) => clip.id === current.clipId) ? current : null;
    });
  }, [project.tracks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target instanceof HTMLButtonElement
        || target?.isContentEditable
      ) return;
      if (!selectedClip) return;
      const track = project.tracks.find((candidate) => candidate.id === selectedClip.trackId);
      if (!track || track.locked) return;

      event.preventDefault();
      onUpdateProject({
        ...project,
        tracks: project.tracks.map((candidate) => candidate.id === selectedClip.trackId
          ? { ...candidate, clips: candidate.clips.filter((clip) => clip.id !== selectedClip.clipId) }
          : candidate),
      });
      setSelectedClip(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onUpdateProject, project, selectedClip]);

  // Mouse Move & Up for Mouse Drag Trimming (In / Out)
  useEffect(() => {
    if (!trimmingClip) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineTracksRef.current) return;
      const rect = timelineTracksRef.current.getBoundingClientRect();
      const deltaX = e.clientX - trimmingClip.initialStartX;
      if (rect.width <= 0) return;
      const deltaMs = Math.round((deltaX / rect.width) * effectiveDurationMs);

      const updatedTracks = project.tracks.map((t) => {
        if (t.id !== trimmingClip.trackId || t.locked) return t;
        const updatedClips = t.clips.map((c) => {
          if (c.id !== trimmingClip.clipId) return c;

          const original = { ...c, timelineStartMs: trimmingClip.initialStartMs, durationMs: trimmingClip.initialDurationMs, trimInMs: trimmingClip.initialTrimInMs, trimOutMs: trimmingClip.initialTrimOutMs };
          const sourceDuration = project.mediaPool?.find((asset) => asset.filePath === c.sourcePath)?.durationMs;
          return trimTimelineClip(original, trimmingClip.edge, deltaMs, sourceDuration);
        });
        return { ...t, clips: updatedClips };
      });

      onUpdateProject({ ...project, tracks: updatedTracks });
    };

    const handleMouseUp = () => {
      setTrimmingClip(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [trimmingClip, effectiveDurationMs, onUpdateProject, project]);

  const getDropTimeMs = (clientX: number) => {
    if (!timelineTracksRef.current) return Math.round(currentTimeMs);
    const rect = timelineTracksRef.current.getBoundingClientRect();
    if (rect.width <= 0) return Math.round(currentTimeMs);
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * effectiveDurationMs);
  };

  const getPointerDrop = (clientX: number, clientY: number, drag: TimelinePointerDrag) => {
    const hovered = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-track-id]");
    const targetTrackId = hovered?.dataset.trackId ?? drag.targetTrackId;
    const targetTrack = project.tracks.find((track) => track.id === targetTrackId);
    const sourceTrack = project.tracks.find((track) => track.id === drag.sourceTrackId);
    if (!targetTrack || !sourceTrack || !canMoveTimelineClip(sourceTrack, targetTrack)) return null;
    let timelineStartMs = Math.max(0, getDropTimeMs(clientX) - drag.pointerOffsetMs);
    const movingClip = sourceTrack.clips.find((clip) => clip.id === drag.clipId);
    const width = timelineTracksRef.current?.getBoundingClientRect().width ?? 0;
    const thresholdMs = width > 0 ? effectiveDurationMs * 8 / width : 0;
    const anchors = [0, currentTimeMs, ...targetTrack.clips.filter((clip) => clip.id !== drag.clipId).flatMap((clip) => [clip.timelineStartMs, clip.timelineStartMs + clip.durationMs])];
    const unsnappedStartMs = timelineStartMs;
    let bestDistance = thresholdMs;
    for (const anchor of anchors) {
      for (const candidate of [anchor, anchor - (movingClip?.durationMs ?? 0)]) {
        const distance = Math.abs(candidate - unsnappedStartMs);
        if (candidate >= 0 && distance < bestDistance) {
          bestDistance = distance;
          timelineStartMs = candidate;
        }
      }
    }
    return { targetTrackId, timelineStartMs };

  };

  useEffect(() => {
    if (!pointerDraggingClip) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (Math.abs(event.clientX - drag.startClientX) > 4 || Math.abs(event.clientY - drag.startClientY) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const nextDrop = getPointerDrop(event.clientX, event.clientY, drag);
      drag.targetTrackId = nextDrop?.targetTrackId ?? drag.targetTrackId;
      drag.timelineStartMs = nextDrop?.timelineStartMs ?? drag.timelineStartMs;
      setPointerDragTargetTrackId(nextDrop?.targetTrackId ?? null);
      setDragPreview(nextDrop);
    };

    const finishPointerDrag = (event: PointerEvent, canceled = false) => {
      const drag = pointerDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const nextDrop = !canceled && drag.moved
        ? getPointerDrop(event.clientX, event.clientY, drag)
        : null;
      if (nextDrop) {
        const nextTracks = moveTimelineClip(
          project.tracks,
          drag.sourceTrackId,
          drag.clipId,
          nextDrop.targetTrackId,
          nextDrop.timelineStartMs,
        );
        if (nextTracks !== project.tracks) {
          onUpdateProject({ ...project, tracks: nextTracks });
          setSelectedClip({ trackId: nextDrop.targetTrackId, clipId: drag.clipId });
          setSelectedTargetTrackId(nextDrop.targetTrackId);
        }
      }
      setDragPreview(null);
      pointerDragRef.current = null;
      setPointerDraggingClip(null);
      setPointerDragTargetTrackId(null);
    };

    const handlePointerUp = (event: PointerEvent) => finishPointerDrag(event);
    const handlePointerCancel = (event: PointerEvent) => finishPointerDrag(event, true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [pointerDraggingClip, project, effectiveDurationMs, onUpdateProject]);

  const handleClipPointerDown = (trackId: string, clip: NleClip, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, .clip-trim-handle")) return;
    const timelineRect = timelineTracksRef.current?.getBoundingClientRect();
    const clipRect = event.currentTarget.getBoundingClientRect();
    const pointerOffsetMs = timelineRect && timelineRect.width > 0
      ? Math.max(0, Math.min(effectiveDurationMs, ((event.clientX - clipRect.left) / timelineRect.width) * effectiveDurationMs))
      : 0;
    event.preventDefault();
    event.stopPropagation();
    pointerDragRef.current = {
      sourceTrackId: trackId,
      clipId: clip.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pointerOffsetMs,
      moved: false,
      targetTrackId: trackId,
      timelineStartMs: clip.timelineStartMs,
    };
    setSelectedClip({ trackId, clipId: clip.id });
    setSelectedTargetTrackId(trackId);
    setPointerDraggingClip({ trackId, clipId: clip.id });
    setPointerDragTargetTrackId(trackId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleTrackDrop = (trackId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drop-target-active");
    const targetTrack = project.tracks.find((track) => track.id === trackId);
    if (!targetTrack || targetTrack.locked) return;
    setSelectedTargetTrackId(trackId);

    try {
      const timelineClipData = e.dataTransfer.getData(TIMELINE_CLIP_MIME);
      const dropTimeMs = getDropTimeMs(e.clientX);
      if (timelineClipData) {
        const payload = JSON.parse(timelineClipData) as { trackId?: string; clipId?: string };
        if (!payload.trackId || !payload.clipId) return;
        const nextTracks = moveTimelineClip(project.tracks, payload.trackId, payload.clipId, trackId, dropTimeMs);
        if (nextTracks !== project.tracks) {
          onUpdateProject({ ...project, tracks: nextTracks });
          setSelectedClip({ trackId, clipId: payload.clipId });
        }
        return;
      }

      const dataStr = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
      if (!dataStr) return;
      const asset = normalizeTimelineDropAsset(JSON.parse(dataStr));
      if (!asset) return;
      const mediaType = asset.mediaType || "video";
      if (!canPlaceMediaOnTrack(targetTrack, mediaType)) return;
      onDropAsset?.(trackId, asset, dropTimeMs);
    } catch (err) {
      console.warn("Track drop error:", err);
    }
  };

  // Playhead percentage (0 to 100%)
  const playheadPercent = Math.min(100, Math.max(0, (currentTimeMs / effectiveDurationMs) * 100));

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineTracksRef.current) return;
    const rect = timelineTracksRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Math.round(ratio * effectiveDurationMs));
  };

  const handleTrackVolumeChange = (trackId: string, volume: number) => {
    const nextTracks = project.tracks.map((t) => (t.id === trackId ? { ...t, volume } : t));
    onUpdateProject({ ...project, tracks: nextTracks });
  };

  const handleTrackMuteToggle = (trackId: string) => {
    const nextTracks = project.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t));
    onUpdateProject({ ...project, tracks: nextTracks });
  };

  const preSoloMute = useRef<Map<string, boolean> | null>(null);
  const handleTrackSoloToggle = (trackId: string) => {
    if (soloTrackId === trackId) {
      setSoloTrackId(null);
      const nextTracks = project.tracks.map((t) => ({ ...t, muted: preSoloMute.current?.get(t.id) ?? t.muted }));
      preSoloMute.current = null;
      onUpdateProject({ ...project, tracks: nextTracks });
    } else {
      if (!preSoloMute.current) preSoloMute.current = new Map(project.tracks.map((track) => [track.id, track.muted]));
      setSoloTrackId(trackId);
      const nextTracks = project.tracks.map((t) => ({
        ...t,
        muted: t.id !== trackId,
      }));
      onUpdateProject({ ...project, tracks: nextTracks });
    }
  };

  const handleToggleDucking = (trackId: string) => {
    const nextTracks = project.tracks.map((t) => {
      if (t.id === trackId && t.ducking) {
        return {
          ...t,
          ducking: { ...t.ducking, enabled: !t.ducking.enabled },
        };
      }
      return t;
    });
    onUpdateProject({ ...project, tracks: nextTracks });
  };

  const handleDeleteClip = (trackId: string, clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTracks = project.tracks.map((t) => {
      if (t.id === trackId && !t.locked) {
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      return t;
    });
    onUpdateProject({ ...project, tracks: nextTracks });
    setSelectedClip(null);
  };


  const handlePlaceAssetOnTimeline = (asset: ProjectAsset) => {
    const targetTrackId = chooseAssetTargetTrack(project.tracks, asset.mediaType, selectedTargetTrackId);
    if (!targetTrackId) return;
    const defaultDuration = asset.durationMs && asset.durationMs > 0 ? asset.durationMs : 5000;
    const newClip: NleClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: asset.name,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: defaultDuration,
      sourceType: "local_file",
      sourcePath: asset.filePath,
      volume: 1.0,
      transform: {
        x: 0.5,
        y: 0.5,
        scale: 1.0,
        opacity: 1.0,
      },
    };

    const nextTracks = project.tracks.map((t) => {
      if (t.id === targetTrackId && !t.locked) {
        return { ...t, clips: [...t.clips, newClip] };
      }
      return t;
    });

    if (onAddAssetClip) {
      void onAddAssetClip(targetTrackId, newClip);
    } else {
      onUpdateProject({ ...project, tracks: nextTracks });
    }
    setSelectedTargetTrackId(targetTrackId);
  };

  const handleRemoveAssetFromBin = (assetId: string) => {
    const nextPool = (project.mediaPool ?? []).filter((a) => a.id !== assetId);
    onUpdateProject({ ...project, mediaPool: nextPool });
  };

  const handleImportLocalFiles = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const selected = await open({ multiple: true, filters: [{ name: "Media", extensions: ["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "aac", "flac", "ogg", "png", "jpg", "jpeg", "webp", "gif", "svg"] }] });
      if (!selected) return;
      const rawPaths = typeof selected === "string" ? [selected] : selected;
      const paths = rawPaths.filter((p) => !isProjectFilePath(p));
      if (paths.length < rawPaths.length) {
        window.alert("ไฟล์โปรเจกต์ (.json/.videoproject.json) ไม่สามารถนำเข้าสู่ Media Bin ได้");
      }
      if (paths.length === 0) return;
      
      const newAssets: ProjectAsset[] = await Promise.all(
        paths.map(async (path, index) => {
          const extension = path.split(".").pop()?.toLowerCase() ?? "";
          const mediaType: "video" | "audio" | "image" = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)
            ? "image"
            : ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(extension)
            ? "audio"
            : "video";

          let durationMs: number | undefined = undefined;
          if (mediaType !== "image") {
            try {
              const src = convertFileSrc(path);
              durationMs = await new Promise<number | undefined>((resolve) => {
                const mediaEl = document.createElement(mediaType === "audio" ? "audio" : "video");
                mediaEl.preload = "metadata";
                mediaEl.src = src;
                mediaEl.onloadedmetadata = () => {
                  if (mediaEl.duration && !isNaN(mediaEl.duration) && isFinite(mediaEl.duration)) {
                    resolve(Math.round(mediaEl.duration * 1000));
                  } else {
                    resolve(undefined);
                  }
                };
                mediaEl.onerror = () => resolve(undefined);
              });
            } catch {
              // ignore measurement error
            }
          }

          return {
            id: `asset_${Date.now()}_${index}`,
            name: path.split(/[/\\]/).pop() || path,
            filePath: path,
            mediaType,
            durationMs,
            importedAt: new Date().toISOString(),
          };
        })
      );

      const existingPaths = new Set((project.mediaPool ?? []).map((a) => a.filePath));
      const filtered = newAssets.filter((a) => !existingPaths.has(a.filePath));
      onUpdateProject({
        ...project,
        mediaPool: [...(project.mediaPool ?? []), ...filtered],
      });
    } catch (err) {
      window.alert(`${t("นำเข้าไฟล์ไม่สำเร็จ", "Import failed")}: ${String(err)}`);
    }
  };

  const handleCreateCompoundClip = () => {
    const targetTrack = project.tracks.find(
      (t) => !t.locked && (t.type === "video_main" || t.type === "video_broll") && t.clips.length >= 2
    );
    if (!targetTrack) return;

    const sortedClips = [...targetTrack.clips].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
    const startMs = sortedClips[0].timelineStartMs;
    const lastClip = sortedClips[sortedClips.length - 1];
    const totalDurationMs = Math.max(...sortedClips.map((clip) => clip.timelineStartMs + clip.durationMs)) - startMs;

    const compoundClip: NleClip = {
      id: `compound_${Date.now()}`,
      name: `📦 Compound Clip (${sortedClips.length} คลิป)`,
      timelineStartMs: startMs,
      durationMs: totalDurationMs,
      sourceType: "local_file",
      isCompound: true,
      subClips: sortedClips,
    };

    const nextTracks = project.tracks.map((t) => {
      if (t.id === targetTrack.id) {
        return { ...t, clips: [compoundClip] };
      }
      return t;
    });

    onUpdateProject({ ...project, tracks: nextTracks });
  };

  const handleDecomposeCompoundClip = (trackId: string, clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTracks = project.tracks.map((t) => {
      if (t.id === trackId && !t.locked) {
        const nextClips: NleClip[] = [];
        for (const c of t.clips) {
          if (c.id === clipId && c.isCompound && c.subClips && c.subClips.length > 0) {
            nextClips.push(...c.subClips);
          } else {
            nextClips.push(c);
          }
        }
        return { ...t, clips: nextClips };
      }
      return t;
    });
    onUpdateProject({ ...project, tracks: nextTracks });
  };

  const handleToggleClipKenBurns = (trackId: string, clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTracks = project.tracks.map((t) => {
      if (t.id === trackId && !t.locked) {
        const nextClips = t.clips.map((c) => {
          if (c.id !== clipId) return c;
          const cur = c.kenBurns;
          if (!cur || !cur.enabled) {
            return {
              ...c,
              kenBurns: {
                enabled: true,
                startScale: 1.0,
                endScale: 1.15,
                panDirection: "zoom_in" as const,
              },
            };
          }
          if (cur.panDirection === "zoom_in") {
            return {
              ...c,
              kenBurns: {
                enabled: true,
                startScale: 1.15,
                endScale: 1.0,
                panDirection: "zoom_out" as const,
              },
            };
          }
          if (cur.panDirection === "zoom_out") {
            return {
              ...c,
              kenBurns: {
                enabled: true,
                startScale: 1.0,
                endScale: 1.16,
                panDirection: "diagonal_product" as const,
              },
            };
          }
          return {
            ...c,
            kenBurns: undefined,
          };
        });
        return { ...t, clips: nextClips };
      }
      return t;
    });
    onUpdateProject({ ...project, tracks: nextTracks });
  };

  const handleSplitAtPlayhead = () => {
    let hasSplit = false;
    const nextTracks = project.tracks.map((track) => {
      if (track.locked) return track;
      const clips = track.clips.flatMap((clip) => {
        const split = splitTimelineClip(clip, currentTimeMs);
        if (split.length > 1) hasSplit = true;
        return split;
      });
      return { ...track, clips };
    });
    if (hasSplit) onUpdateProject({ ...project, tracks: nextTracks });
  };

  // Ruler tick intervals
  const rulerTicks = useMemo(() => {
    const ticks: Array<{ timeMs: number; label: string; percent: number }> = [];
    const intervalSec = zoom > 2 ? 2 : zoom > 1.4 ? 5 : 10;
    const totalSec = Math.ceil(effectiveDurationMs / 1000);

    for (let s = 0; s <= totalSec; s += intervalSec) {
      const ms = s * 1000;
      ticks.push({
        timeMs: ms,
        label: formatTimecode(ms).slice(0, 5),
        percent: (ms / effectiveDurationMs) * 100,
      });
    }
    return ticks;
  }, [effectiveDurationMs, zoom]);

  const mediaPool = (project.mediaPool ?? []).filter((a) => !isProjectFilePath(a.filePath));

  return (
    <div className="nle-timeline-container">
      {/* Top Production Toolbar */}
      <div className="nle-timeline-header-bar">
        <div className="toolbar-left-group">
          <button
            type="button"
            className="nle-tool-btn play-btn"
            onClick={onTogglePlay}
            title={isPlaying ? t("พักชั่วคราว (Space)", "Pause (Space)") : t("เล่น (Space)", "Play (Space)")}
          >
            {isPlaying ? t("⏸️ พัก", "⏸️ Pause") : t("▶️ เล่น", "▶️ Play")}
          </button>
          {onOpenVoiceGuidedVisualMatch && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenVoiceGuidedVisualMatch}
              title={t("จับคู่ภาพกับเสียงพูดตามความหมายและเวลา แล้วแสดงตัวอย่างก่อนใช้", "Match slide images to speech meaning and timing, then preview before applying")}
            >
              🧠 Visual Match
            </button>
          )}
          <button
            type="button"
            className="nle-tool-btn"
            onClick={handleSplitAtPlayhead}
            title={t("ตัด/แยกคลิปที่ตำแหน่ง Playhead (Split)", "Split clip at playhead")}
          >
            {t("✂️ ตัด (Split)", "✂️ Split")}
          </button>
          <div className="nle-timecode-display">
            <span className="tc-current">{formatTimecode(currentTimeMs)}</span>
            <span className="tc-divider">/</span>
            <span className="tc-total">{formatTimecode(effectiveDurationMs)}</span>
          </div>
          <button
            type="button"
            className="nle-tool-btn action-detach"
            onClick={onDetachAudio}
            title={t("แยกแทร็กเสียงพูดออกจากวิดีโอหลักเป็น Track A1", "Detach dialogue audio from the main video to Track A1")}
          >
            {t("🔊 แยกเสียง", "🔊 Detach audio")}
          </button>
        </div>

        <div className="toolbar-center-actions">
          {/* Persistent Project Media Bin status; the full panel is docked on the right. */}
          <button
            type="button"
            className="nle-tool-btn highlight-btn active nle-bin-status"
            onClick={() => onOpenMediaBin?.()}
            title={isMediaBinOpen ? t("Media Bin เปิดอยู่ทางขวาของ Workspace", "Media Bin is open on the right") : t("เปิด Media Bin แบบเต็มความสูงทางขวา", "Open full-height Media Bin on the right")}
          >
            📥 Bin ({mediaPool.length})
          </button>
          {project.tracks.some((t) => !t.locked && (t.type === "video_main" || t.type === "video_broll") && t.clips.length >= 2) && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={handleCreateCompoundClip}
              title={t("รวมคลิปบนแทร็กวิดีโอเข้าด้วยกันเป็น Compound Clip ก้อนเดียว", "Combine video track clips into one compound clip")}
              style={{
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(99, 102, 241, 0.25))",
                borderColor: "#6366f1",
                color: "#a5b4fc",
                fontWeight: 700,
              }}
            >
              {t("📦 รวมคลิป", "📦 Combine clips")}
            </button>
          )}
          <button
            type="button"
            className="nle-tool-btn highlight-btn"
            onClick={onOpenAutoSubtitles}
            title={t("ถอดเสียงพูดเป็นคำบรรยายอัตโนมัติด้วย Whisper AI", "Transcribe speech into subtitles with Whisper AI")}
          >
            🎙️ Subtitle
          </button>
          <button
            type="button"
            className="nle-tool-btn highlight-btn"
            onClick={onOpenCodeOverlayModal}
            title={t("สั่ง AI สร้าง React / CSS / Three.js Overlay ด้วย Prompt", "Generate a React / CSS / Three.js overlay from a prompt")}
          >
            🎨 3D Overlay
          </button>
          <button
            type="button"
            className="nle-tool-btn"
            onClick={onOpenAssetDrawer}
            title={t("เลือก B-Roll, รูปภาพ หรือ BGM จาก Cloud Library / คอมพิวเตอร์", "Choose B-roll, images or music from Cloud Library or your computer")}
          >
            🗂️ Library
          </button>
          {onOpenAudioScoringModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenAudioScoringModal}
              title={t("สร้างดนตรีประกอบอัตโนมัติด้วย MiniMax Music 3 พร้อม Auto-Ducking & EBU R128 QC", "Generate music with MiniMax Music 3, auto-ducking and EBU R128 QC")}
              style={{
                background: "linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(168, 85, 247, 0.25))",
                borderColor: "#a855f7",
                color: "#d8b4fe",
                fontWeight: 700,
              }}
            >
              {t("🎵 ดนตรี AI", "🎵 AI Music")}
            </button>
          )}
          {onOpenTextOverlayModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenTextOverlayModal}
              title={t("เพิ่มข้อความบนหน้าจอ เลือกฟอนต์ Google Fonts / ในเครื่อง พร้อม Effects & Presets", "Add text with Google or system fonts, effects and presets")}
              style={{
                background: "linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(244, 63, 94, 0.2))",
                borderColor: "#f43f5e",
                color: "#fecdd3",
                fontWeight: 700,
              }}
            >
              ✍️ Text
            </button>
          )}
          {onOpenStockSvgModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenStockSvgModal}
              title={t("เพิ่ม Stock SVG เวกเตอร์ / ปุ่ม Social / Badge ป้ายโปรโมชั่น ลงบนวิดีโอ", "Add stock SVG vectors, social buttons and promotional badges")}
              style={{
                background: "linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.2))",
                borderColor: "#f59e0b",
                color: "#fde68a",
                fontWeight: 700,
              }}
            >
              ⭐ Stock SVG
            </button>
          )}
          {onOpenBlurOverlayModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenBlurOverlayModal}
              title={t("เพิ่มแถบเบลอ เซ็นเซอร์ / ปิดบังวัตถุ รองรับ Auto-Tracking ติดตามหน้าคนหรือสินค้าอัตโนมัติ", "Add blur or censor overlays with automatic face or product tracking")}
              style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(20, 184, 166, 0.2))",
                borderColor: "#10b981",
                color: "#a7f3d0",
                fontWeight: 700,
              }}
            >
              {t("🔒 แถบเบลอ", "🔒 Blur")}
            </button>
          )}
          {onOpenVoiceoverModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenVoiceoverModal}
              title={t("ห้องอัดเสียงพากย์สดพร้อมเล่นวิดีโอคู่ขนาน รองรับการทิ้งช่วงที่พูดผิด (Discard Take)", "Record voiceover alongside video playback and discard unwanted takes")}
              style={{
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))",
                borderColor: "#ef4444",
                color: "#fca5a5",
                fontWeight: 700,
              }}
            >
              {t("🎙️ อัดเสียง", "🎙️ Record")}
            </button>
          )}
          {onOpenAiMediaStudioModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenAiMediaStudioModal}
              title={t("SmartAIHub AI Media Studio (สร้างภาพพื้นหลังใส, วิดีโอแนบภาพ 1-3 ภาพ, เสียงดนตรี)", "SmartAIHub AI Media Studio (transparent images, video with 1–3 references, music)")}
              style={{
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(139, 92, 246, 0.25))",
                borderColor: "#a855f7",
                color: "#e9d5ff",
                fontWeight: 700,
              }}
            >
              ✨ AI Studio
            </button>
          )}
        </div>

        <div className="toolbar-right-group">
          <span
            className="track-badge"
            title={t("ระบบดูดขอบคลิปและ Playhead อัตโนมัติ (Magnet Snap Active)", "Snap to clip edges and the playhead")}
            style={{ background: "rgba(56, 189, 248, 0.15)", borderColor: "#38bdf8", color: "#38bdf8", cursor: "default" }}
          >
            🧲 Snap
          </span>
          <div className="zoom-slider-wrap">
            <span className="zoom-icon">🔍</span>
            <input
              type="range"
              min="1"
              max="3.5"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              title={t("ขยาย/ย่อ Timeline", "Zoom timeline")}
            />
          </div>
          <button
            type="button"
            className="nle-tool-btn project-btn"
            onClick={onSaveProjectFile}
            title={t("บันทึกโครงสร้างโปรเจกต์เป็นไฟล์ videoproject.json", "Save project as videoproject.json")}
          >
            {t("💾 บันทึก", "💾 Save")}
          </button>
          <button
            type="button"
            className="nle-tool-btn capcut-btn"
            onClick={onExportCapCutDraft}
            title={t("ส่งออกโครงสร้าง Draft ให้เปิดต่อใน CapCut ได้", "Export draft for editing in CapCut")}
          >
            🎬 CapCut
          </button>
          {onOpenProjectSettings && (
            <button
              type="button"
              className="nle-tool-btn project-btn"
              onClick={onOpenProjectSettings}
              title={`${t("ตั้งค่าโปรเจกต์", "Project settings")} (${project.canvas.aspectRatio} · ${project.canvas.width}×${project.canvas.height})`}
            >
              ⚙️ Project
            </button>
          )}
        </div>
      </div>

      {/* Main Multi-Track Stage: flexible height; the Bin list scrolls independently */}
      <div className="nle-timeline-body">
        {/* Full-height Media Bin docked to the application right edge, like Library. */}
        {isMediaBinOpen && (
          <aside className="nle-media-bin-sidebar" aria-label="Media Bin">
            <div className="media-bin-sidebar-header">
              <span className="bin-title">
                📥 Media Bin ({mediaPool.length})
              </span>
              <div className="media-bin-sidebar-actions">
                <button
                  type="button"
                  className="bin-btn-compact"
                  onClick={() => void handleImportLocalFiles()}
                  title={t("เลือกไฟล์จากเครื่องคอมพิวเตอร์เข้าสู่โปรเจกต์", "Import files from your computer")}
                >
                  {t("＋ เครื่อง", "＋ Computer")}
                </button>
                <button
                  type="button"
                  className="bin-btn-compact cloud-btn"
                  onClick={onOpenAssetDrawer}
                  title={t("ดึงไฟล์จาก Cloud Library หรือประวัติการสร้าง", "Import from Cloud Library or generation history")}
                >
                  ☁️ Lib
                </button>
                <button
                  type="button"
                  className="drawer-collapse-btn"
                  onClick={() => onCloseMediaBin?.()}
                  title={t("ยุบปิด Media Bin ไปทางขวา", "Collapse Media Bin to the right")}
                >
                  {t("▶ ยุบแผง", "▶ Collapse")}
                </button>
              </div>
            </div>

            <div className="media-bin-target-row">
              <label htmlFor="media-bin-target-track">{t("วางลงแทร็ก:", "Target track:")}</label>
              <select
                id="media-bin-target-track"
                value={selectedTargetTrackId ?? ""}
                onChange={(event) => setSelectedTargetTrackId(event.target.value || null)}
              >
                {project.tracks.filter((track) => !track.locked).map((track) => (
                  <option key={track.id} value={track.id}>{track.name}</option>
                ))}
              </select>
            </div>

            <div className="media-bin-sidebar-content">
              {mediaPool.length === 0 ? (
                <div className="bin-empty-sidebar">
                  <span className="bin-empty-icon">📂</span>
                  <span>{t("ยังไม่มีสื่อใน Bin", "No media in Bin")}</span>
                  <div className="bin-empty-actions">
                    <button
                      type="button"
                      className="bin-btn-compact"
                      onClick={() => void handleImportLocalFiles()}
                    >
                      {t("＋ เพิ่มไฟล์", "＋ Add files")}
                    </button>
                    <button
                      type="button"
                      className="bin-btn-compact cloud-btn"
                      onClick={onOpenAssetDrawer}
                    >
                      ☁️ Library
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bin-items-sidebar-list">
                  {mediaPool.map((asset) => (
                    <div
                      key={asset.id}
                      className="bin-item-card-sidebar"
                      draggable
                      onDragStart={(e) => {
                        const payload = JSON.stringify(asset);
                        e.dataTransfer.setData("application/json", payload);
                        e.dataTransfer.setData("text/plain", payload);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title={`${t("ลากไปวางบนแทร็ก V1, V2, A1", "Drag onto V1, V2 or A1")}\n${normalizeDisplayPath(asset.filePath)}`}
                    >
                      <div className="bin-card-top-row">
                        <span className="bin-item-icon">
                          {asset.mediaType === "video" ? "🎬" : asset.mediaType === "audio" ? "🎵" : "🖼️"}
                        </span>
                        <div className="bin-item-details">
                          <strong className="bin-item-name" title={normalizeDisplayPath(asset.filePath)}>
                            {asset.name}
                          </strong>
                          <span className="bin-item-meta">
                            {asset.mediaType.toUpperCase()}
                            {asset.durationMs ? ` · ${(asset.durationMs / 1000).toFixed(1)}s` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-remove-bin"
                          onClick={() => handleRemoveAssetFromBin(asset.id)}
                          title={t("ลบออกจาก Bin", "Remove from Bin")}
                        >
                          🗑️
                        </button>
                      </div>

                      <div className="bin-card-actions-row">
                        <button
                          type="button"
                          className="btn-place-timeline-compact"
                          onClick={() => handlePlaceAssetOnTimeline(asset)}
                          title={t("วางคลิปนี้ลงใน Timeline ที่ตำแหน่งหัวอ่าน (Playhead)", "Insert this clip at the playhead")}
                        >
                          {t("＋ วางที่ Playhead", "＋ Insert at playhead")}
                        </button>
                        <span className="drag-hint" title={t("คลิกค้างแล้วลากไปวางบนแทร็ก Timeline ทางขวา", "Drag onto a timeline track on the right")}>
                          {t("ลากลงแทร็ก ➔", "Drag to track ➔")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Left Track Headers (Controls: Mute, Solo, Volume, Ducking) */}
        <div className="nle-track-headers-column">
          <div className="ruler-header-spacer">TRACKS</div>
          {project.tracks.map((track) => (
            <div
              key={track.id}
              className={`track-header-item type-${track.type} ${selectedTargetTrackId === track.id ? "selected-target-track" : ""}`}
              onClick={() => setSelectedTargetTrackId(track.id)}
              title={`${t("แทร็กปลายทาง", "Target track")}: ${track.name}`}
            >
              <div className="track-title-row">
                <span className="track-badge">
                  {track.type === "video_main"
                    ? "V1"
                    : track.type === "video_broll"
                    ? "V2"
                    : track.type === "code_overlay"
                    ? "O1"
                    : track.type === "text_subtitle"
                    ? "T1"
                    : track.type === "audio_voice"
                    ? "A1"
                    : track.type === "audio_music"
                    ? "A2"
                    : "A3"}
                </span>
                <span className="track-name" title={track.name}>
                  {track.name}
                </span>
              </div>

              <div className="track-controls-row">
                <button
                  type="button"
                  className={`track-ctrl-btn ${track.muted ? "active-mute" : ""}`}
                  onClick={() => handleTrackMuteToggle(track.id)}
                  title="Mute Track"
                >
                  M
                </button>
                <button
                  type="button"
                  className={`track-ctrl-btn ${soloTrackId === track.id ? "active-mute" : ""}`}
                  onClick={() => handleTrackSoloToggle(track.id)}
                  title="Solo Track"
                >
                  S
                </button>

                {track.ducking && (
                  <button
                    type="button"
                    className={`ducking-status-pill ${
                      track.ducking.enabled ? "enabled" : ""
                    } ${isDuckingActive && track.ducking.enabled ? "ducking-live" : ""}`}
                    onClick={() => handleToggleDucking(track.id)}
                    title={
                      track.ducking.enabled
                        ? t("Auto Ducking ทำงานอยู่ (ลดเสียงเพลงเมื่อมีเสียงพูด)", "Auto ducking active (lower music during speech)")
                        : t("เปิด Auto Ducking", "Enable auto ducking")
                    }
                  >
                    🦆 {isDuckingActive && track.ducking.enabled ? "DUCKING" : "DUCK"}
                  </button>
                )}

                <div className="track-vol-slider-wrap">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={track.volume}
                    onChange={(e) => handleTrackVolumeChange(track.id, Number(e.target.value))}
                    title={`Volume: ${Math.round(track.volume * 100)}%`}
                  />
                  <span className="vol-text">{Math.round(track.volume * 100)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Timeline Canvas */}
        <div
          className="nle-tracks-content-column"
          onClick={handleTimelineClick}
        >
          {/* Playhead Scrubber */}
          <div className="nle-playhead" style={{ left: `${playheadPercent}%` }}>
            <div className="playhead-handle" />
            <div className="playhead-line" />
          </div>

          {/* Time Ruler */}
          <div className="nle-time-ruler" style={{ width: `${zoom * 100}%` }}>
            {rulerTicks.map((tick, i) => (
              <div
                key={i}
                className="ruler-tick"
                style={{ left: `${tick.percent}%` }}
              >
                <div className="tick-mark" />
                <span className="tick-label">{tick.label}</span>
              </div>
            ))}
          </div>

          {/* Track Lanes */}
          <div
            className="nle-track-lanes"
            ref={timelineTracksRef}
            style={{ width: `${zoom * 100}%` }}
          >
            {project.tracks.map((track) => (
              <div
                key={track.id}
                data-track-id={track.id}
                className={`track-lane-row ${selectedTargetTrackId === track.id ? "selected-target-track" : ""} ${pointerDragTargetTrackId === track.id ? "pointer-drag-target" : ""}`}
                onMouseDown={() => setSelectedTargetTrackId(track.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = e.dataTransfer.types.includes(TIMELINE_CLIP_MIME) ? "move" : "copy";
                  e.currentTarget.classList.add("drop-target-active");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("drop-target-active");
                }}
                onDrop={(e) => handleTrackDrop(track.id, e)}
              >
                {dragPreview?.targetTrackId === track.id && pointerDraggingClip && (() => {
                  const clip = project.tracks.find((t) => t.id === pointerDraggingClip.trackId)?.clips.find((c) => c.id === pointerDraggingClip.clipId);
                  return clip ? <aside data-testid="timeline-drag-preview" className={`timeline-clip-block clip-${track.type}`} style={{ pointerEvents: "none", zIndex: 31, left: `${dragPreview.timelineStartMs / effectiveDurationMs * 100}%`, width: `${Math.max(1, clip.durationMs / effectiveDurationMs * 100)}%` }}>{clip.name} · {formatTimecode(dragPreview.timelineStartMs)}</aside> : null;
                })()}
                {track.clips.map((clip) => {
                  const clipLeft = (clip.timelineStartMs / effectiveDurationMs) * 100;
                  const clipWidth = Math.max(1, (clip.durationMs / effectiveDurationMs) * 100);

                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip-block clip-${track.type} ${selectedClip?.trackId === track.id && selectedClip.clipId === clip.id ? "selected-timeline-clip" : ""} ${pointerDraggingClip?.trackId === track.id && pointerDraggingClip.clipId === clip.id ? "pointer-dragging" : ""}`}
                      onPointerDown={(event) => handleClipPointerDown(track.id, clip, event)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClip({ trackId: track.id, clipId: clip.id });
                        setSelectedTargetTrackId(track.id);
                      }}
                      style={{
                        left: `${clipLeft}%`,
                        width: `${clipWidth}%`,
                      }}
                      title={`${clip.name} (${(clip.durationMs / 1000).toFixed(1)}s)`}
                    >
                      <div className="clip-header">
                        <span className="clip-title">{clip.name}</span>
                        <div className="clip-header-actions">
                          {clip.isCompound && (
                            <button
                              type="button"
                              className="clip-decompose-btn"
                              onClick={(e) => handleDecomposeCompoundClip(track.id, clip.id, e)}
                              title={t("แยก Compound Clip กลับเป็นคลิปย่อยเดิม", "Decompose compound clip into original clips")}
                            >
                              {t("📤 แยก", "📤 Decompose")}
                            </button>
                          )}
                          {!clip.isCompound && (track.type === "video_main" || track.type === "video_broll") && (
                            <button
                              type="button"
                              className={`clip-kenburns-badge-btn ${clip.kenBurns?.enabled ? "active" : ""}`}
                              onClick={(e) => handleToggleClipKenBurns(track.id, clip.id, e)}
                              title={`${t("สลับ", "Toggle")} Ken Burns: ${clip.kenBurns?.enabled ? clip.kenBurns.panDirection : t("ปิด", "Off")}`}
                            >
                              🎬 {clip.kenBurns?.enabled ? "KB 🟢" : "KB"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="clip-del-btn"
                            onClick={(e) => handleDeleteClip(track.id, clip.id, e)}
                            title={t("ลบคลิปนี้", "Delete this clip")}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {clip.isCompound && (
                        <div className="clip-compound-strip">
                          <span>📦 Compound Clip ({clip.subClips?.length || 0} {t("คลิปย่อย", "clips")})</span>
                        </div>
                      )}

                      {track.type === "audio_voice" && (
                        <div className="clip-audio-wave-representation">
                          {Array.from({ length: 16 }).map((_, w) => (
                            <span
                              key={w}
                              className="mock-wave-bar"
                              style={{ height: `${Math.sin(w * 0.8) * 40 + 50}%` }}
                            />
                          ))}
                        </div>
                      )}

                      {track.type === "code_overlay" && (
                        <div className="clip-code-badge">
                          {clip.codeEngine === "three_js" ? "🌐 Three.js 3D" : "⚛️ React/CSS"}
                        </div>
                      )}

                      {/* Mouse Drag Trim Handles (Left: Trim In, Right: Trim Out) */}
                      <div
                        className="clip-trim-handle trim-handle-left"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTrimmingClip({
                            trackId: track.id,
                            clipId: clip.id,
                            edge: "left",
                            initialStartX: e.clientX,
                            initialStartMs: clip.timelineStartMs,
                            initialDurationMs: clip.durationMs,
                            initialTrimInMs: clip.trimInMs ?? 0,
                            initialTrimOutMs: clip.trimOutMs ?? (clip.trimInMs ?? 0) + clip.durationMs * (clip.speed ?? 1),
                          });
                        }}
                        title={t("คลิกค้างแล้วลากเพื่อ Trim In (ย่น/ขยายหัวคลิป)", "Drag to trim the start of the clip")}
                      />
                      <div
                        className="clip-trim-handle trim-handle-right"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTrimmingClip({
                            trackId: track.id,
                            clipId: clip.id,
                            edge: "right",
                            initialStartX: e.clientX,
                            initialStartMs: clip.timelineStartMs,
                            initialDurationMs: clip.durationMs,
                            initialTrimInMs: clip.trimInMs ?? 0,
                            initialTrimOutMs: clip.trimOutMs ?? (clip.trimInMs ?? 0) + clip.durationMs * (clip.speed ?? 1),
                          });
                        }}
                        title={t("คลิกค้างแล้วลากเพื่อ Trim Out (ย่น/ขยายท้ายคลิป)", "Drag to trim the end of the clip")}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Flex order keeps the persistent Media Bin docked on the right of the canvas. */}
      </div>
    </div>
  );
}
