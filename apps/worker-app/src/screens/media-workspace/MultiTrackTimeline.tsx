import { splitTimelineClip, trimTimelineClip } from "./timelineEdits";
import React, { useState, useRef, useMemo, useEffect } from "react";
import type { SmartSpecProjectDraft, NleTrack, NleClip, ProjectAsset } from "../../types/nleProject";

export interface MultiTrackTimelineProps {
  project: SmartSpecProjectDraft;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  onSeek: (timeMs: number) => void;
  onTogglePlay: () => void;
  onUpdateProject: (updated: SmartSpecProjectDraft) => void;
  onOpenAutoSubtitles: () => void;
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
  isDuckingActive?: boolean;
  onDropAsset?: (trackId: string, asset: any, dropTimeMs?: number) => void;
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
  isDuckingActive = false,
  onDropAsset,
}: MultiTrackTimelineProps) {
  const timelineTracksRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState<number>(1.0); // 1.0 = fit, up to 4.0
  const [isMediaBinOpen, setIsMediaBinOpen] = useState(false);
  const [soloTrackId, setSoloTrackId] = useState<string | null>(null);

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

  // Expand timeline with 30s tail padding so user can scroll horizontally and drop clips after existing video!
  const effectiveDurationMs = Math.max(1000, durationMs || project.canvas.durationMs || 60000, maxClipEndMs + 30000);

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

  const handleTrackDrop = (trackId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drop-target-active");
    if (project.tracks.find((track) => track.id === trackId)?.locked) return;
    try {
      const dataStr = e.dataTransfer.getData("application/json");
      if (!dataStr) return;
      const asset = JSON.parse(dataStr);
      if (!asset) return;

      let dropTimeMs = currentTimeMs;
      if (timelineTracksRef.current) {
        const rect = timelineTracksRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        dropTimeMs = Math.round(ratio * effectiveDurationMs);
      }

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
  };


  const handlePlaceAssetOnTimeline = (asset: ProjectAsset) => {
    const targetTrackId =
      asset.mediaType === "audio" ? "track_a2" : "track_v2";

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

    onUpdateProject({ ...project, tracks: nextTracks });
    setIsMediaBinOpen(false);
  };

  const handleRemoveAssetFromBin = (assetId: string) => {
    const nextPool = (project.mediaPool ?? []).filter((a) => a.id !== assetId);
    onUpdateProject({ ...project, mediaPool: nextPool });
  };

  const handleImportLocalFiles = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: true, filters: [{ name: "Media", extensions: ["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "aac", "flac", "ogg", "png", "jpg", "jpeg", "webp", "gif", "svg"] }] });
      if (!selected) return;
      const paths = typeof selected === "string" ? [selected] : selected;
      const assets: ProjectAsset[] = paths.map((path, index) => {
        const extension = path.split(".").pop()?.toLowerCase() ?? "";
        const mediaType = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension) ? "image" : ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(extension) ? "audio" : "video";
        return { id: `asset_${Date.now()}_${index}`, name: path.split(/[/\\]/).pop() || path, filePath: path, mediaType, importedAt: new Date().toISOString() };
      });
      onUpdateProject({ ...project, mediaPool: [...(project.mediaPool ?? []), ...assets.filter((asset) => !project.mediaPool?.some((existing) => existing.filePath === asset.filePath))] });
    } catch (err) {
      window.alert(`นำเข้าไฟล์ไม่สำเร็จ: ${String(err)}`);
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

  const mediaPool = project.mediaPool ?? [];

  return (
    <div className="nle-timeline-container">
      {/* Top Production Toolbar */}
      <div className="nle-timeline-header-bar">
        <div className="toolbar-left-group">
          <button
            type="button"
            className="nle-tool-btn play-btn"
            onClick={onTogglePlay}
            title={isPlaying ? "พักชั่วคราว (Space)" : "เล่น (Space)"}
          >
            {isPlaying ? "⏸️ พัก" : "▶️ เล่น"}
          </button>
          <button
            type="button"
            className="nle-tool-btn"
            onClick={handleSplitAtPlayhead}
            title="ตัด/แยกคลิปที่ตำแหน่ง Playhead (Split)"
          >
            ✂️ ตัด (Split)
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
            title="แยกแทร็กเสียงพูดออกจากวิดีโอหลักเป็น Track A1"
          >
            🔊 แยกเสียง
          </button>
        </div>

        <div className="toolbar-center-actions">
          {/* Project Media Bin Button with Count Badge */}
          <button
            type="button"
            className={`nle-tool-btn highlight-btn ${isMediaBinOpen ? "active" : ""}`}
            onClick={() => setIsMediaBinOpen(!isMediaBinOpen)}
            title="เปิด Media Bin เพื่อดูและจัดการไฟล์ที่นำเข้าสู่โปรเจกต์"
          >
            📥 Bin ({mediaPool.length})
          </button>
          {project.tracks.some((t) => !t.locked && (t.type === "video_main" || t.type === "video_broll") && t.clips.length >= 2) && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={handleCreateCompoundClip}
              title="รวมคลิปบนแทร็กวิดีโอเข้าด้วยกันเป็น Compound Clip ก้อนเดียว"
              style={{
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(99, 102, 241, 0.25))",
                borderColor: "#6366f1",
                color: "#a5b4fc",
                fontWeight: 700,
              }}
            >
              📦 รวมคลิป
            </button>
          )}
          <button
            type="button"
            className="nle-tool-btn highlight-btn"
            onClick={onOpenAutoSubtitles}
            title="ถอดเสียงพูดเป็นคำบรรยายอัตโนมัติด้วย Whisper AI"
          >
            🎙️ Subtitle
          </button>
          <button
            type="button"
            className="nle-tool-btn highlight-btn"
            onClick={onOpenCodeOverlayModal}
            title="สั่ง AI สร้าง React / CSS / Three.js Overlay ด้วย Prompt"
          >
            🎨 3D Overlay
          </button>
          <button
            type="button"
            className="nle-tool-btn"
            onClick={onOpenAssetDrawer}
            title="เลือก B-Roll, รูปภาพ หรือ BGM จาก Cloud Library / คอมพิวเตอร์"
          >
            🗂️ Library
          </button>
          {onOpenAudioScoringModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenAudioScoringModal}
              title="สร้างดนตรีประกอบอัตโนมัติด้วย MiniMax Music 3 พร้อม Auto-Ducking & EBU R128 QC"
              style={{
                background: "linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(168, 85, 247, 0.25))",
                borderColor: "#a855f7",
                color: "#d8b4fe",
                fontWeight: 700,
              }}
            >
              🎵 ดนตรี AI
            </button>
          )}
          {onOpenTextOverlayModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenTextOverlayModal}
              title="เพิ่มข้อความบนหน้าจอ เลือกฟอนต์ Google Fonts / ในเครื่อง พร้อม Effects & Presets"
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
              title="เพิ่ม Stock SVG เวกเตอร์ / ปุ่ม Social / Badge ป้ายโปรโมชั่น ลงบนวิดีโอ"
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
              title="เพิ่มแถบเบลอ เซ็นเซอร์ / ปิดบังวัตถุ รองรับ Auto-Tracking ติดตามหน้าคนหรือสินค้าอัตโนมัติ"
              style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(20, 184, 166, 0.2))",
                borderColor: "#10b981",
                color: "#a7f3d0",
                fontWeight: 700,
              }}
            >
              🔒 แถบเบลอ
            </button>
          )}
          {onOpenVoiceoverModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenVoiceoverModal}
              title="ห้องอัดเสียงพากย์สดพร้อมเล่นวิดีโอคู่ขนาน รองรับการทิ้งช่วงที่พูดผิด (Discard Take)"
              style={{
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))",
                borderColor: "#ef4444",
                color: "#fca5a5",
                fontWeight: 700,
              }}
            >
              🎙️ อัดเสียง
            </button>
          )}
          {onOpenAiMediaStudioModal && (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={onOpenAiMediaStudioModal}
              title="SmartAIHub AI Media Studio (สร้างภาพพื้นหลังใส, วิดีโอแนบภาพ 1-3 ภาพ, เสียงดนตรี)"
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
            title="ระบบดูดขอบคลิปและ Playhead อัตโนมัติ (Magnet Snap Active)"
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
              title="ขยาย/ย่อ Timeline"
            />
          </div>
          <button
            type="button"
            className="nle-tool-btn project-btn"
            onClick={onSaveProjectFile}
            title="บันทึกโครงสร้างโปรเจกต์เป็นไฟล์ smartspec-project.json"
          >
            💾 บันทึก
          </button>
          <button
            type="button"
            className="nle-tool-btn capcut-btn"
            onClick={onExportCapCutDraft}
            title="ส่งออกโครงสร้าง Draft ให้เปิดต่อใน CapCut ได้"
          >
            🎬 CapCut
          </button>
          {onOpenProjectSettings && (
            <button
              type="button"
              className="nle-tool-btn project-btn"
              onClick={onOpenProjectSettings}
              title={`ตั้งค่าโปรเจกต์ (${project.canvas.aspectRatio} · ${project.canvas.width}×${project.canvas.height})`}
            >
              ⚙️ Project
            </button>
          )}
        </div>
      </div>

      {/* Project Media Bin Panel */}
      {isMediaBinOpen && (
        <div className="nle-media-bin-panel">
          <div className="media-bin-header">
            <div className="bin-header-left">
              <span className="bin-title">
                📥 Project Media Bin ({mediaPool.length} สื่อในโปรเจกต์)
              </span>
              <button
                type="button"
                className="bin-import-action-btn"
                onClick={() => void handleImportLocalFiles()}
                title="เลือกไฟล์วิดีโอ รูปภาพ หรือเสียงจากเครื่องคอมพิวเตอร์เข้าสู่โปรเจกต์"
              >
                ＋ เพิ่มไฟล์จากเครื่อง
              </button>
              <button
                type="button"
                className="bin-import-action-btn cloud-btn"
                onClick={onOpenAssetDrawer}
                title="ดึงไฟล์จาก Cloud Library หรือประวัติการสร้าง"
              >
                ☁️ ดึงจาก Library
              </button>

            </div>
            <button
              type="button"
              className="bin-close-btn"
              onClick={() => setIsMediaBinOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="media-bin-content">
            {mediaPool.length === 0 ? (
              <div className="bin-empty">
                <span>ยังไม่มีสื่อใน Media Bin ของโปรเจกต์นี้</span>
                <div className="bin-empty-btn-row">
                  <button
                    type="button"
                    className="bin-import-action-btn"
                    onClick={() => void handleImportLocalFiles()}
                  >
                    ＋ เพิ่มไฟล์จากเครื่อง
                  </button>
                  <button
                    type="button"
                    className="bin-import-action-btn cloud-btn"
                    onClick={onOpenAssetDrawer}
                  >
                    ☁️ ดึงจาก Library
                  </button>
                </div>
              </div>
            ) : (
              <div className="bin-items-grid">
                {mediaPool.map((asset) => (
                  <div
                    key={asset.id}
                    className="bin-item-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/json", JSON.stringify(asset));
                    }}
                  >
                    <div className="bin-item-icon">
                      {asset.mediaType === "video" ? "🎬" : asset.mediaType === "audio" ? "🎵" : "🖼️"}
                    </div>
                    <div className="bin-item-details">
                      <strong className="bin-item-name" title={asset.filePath}>
                        {asset.name}
                      </strong>
                      <span className="bin-item-meta">
                        {asset.mediaType.toUpperCase()}
                        {asset.durationMs ? ` · ${(asset.durationMs / 1000).toFixed(1)}s` : ""}
                      </span>
                    </div>
                    <div className="bin-item-actions">
                      <button
                        type="button"
                        className="btn-place-timeline"
                        onClick={() => handlePlaceAssetOnTimeline(asset)}
                        title="วางคลิปนี้ลงใน Timeline ที่ตำแหน่งหัวอ่าน (Playhead)"
                      >
                        ＋ วางที่ Playhead
                      </button>
                      <button
                        type="button"
                        className="btn-remove-bin"
                        onClick={() => handleRemoveAssetFromBin(asset.id)}
                        title="ลบออกจาก Bin"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Multi-Track Stage: Body Split with Fixed Height & Scroll */}
      <div className="nle-timeline-body">
        {/* Left Track Headers (Controls: Mute, Solo, Volume, Ducking) */}
        <div className="nle-track-headers-column">
          <div className="ruler-header-spacer">TRACKS</div>
          {project.tracks.map((track) => (
            <div key={track.id} className={`track-header-item type-${track.type}`}>
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
                        ? "Auto Ducking ทำงานอยู่ (ลดเสียงเพลงเมื่อมีเสียงพูด)"
                        : "เปิด Auto Ducking"
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

        {/* Right Scrollable Timeline Canvas */}
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
                className="track-lane-row"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  e.currentTarget.classList.add("drop-target-active");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("drop-target-active");
                }}
                onDrop={(e) => handleTrackDrop(track.id, e)}
              >
                {track.clips.map((clip) => {
                  const clipLeft = (clip.timelineStartMs / effectiveDurationMs) * 100;
                  const clipWidth = Math.max(1, (clip.durationMs / effectiveDurationMs) * 100);

                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip-block clip-${track.type}`}
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
                              title="แยก Compound Clip กลับเป็นคลิปย่อยเดิม"
                            >
                              📤 แยก
                            </button>
                          )}
                          {!clip.isCompound && (track.type === "video_main" || track.type === "video_broll") && (
                            <button
                              type="button"
                              className={`clip-kenburns-badge-btn ${clip.kenBurns?.enabled ? "active" : ""}`}
                              onClick={(e) => handleToggleClipKenBurns(track.id, clip.id, e)}
                              title={`สลับ Ken Burns: ${clip.kenBurns?.enabled ? clip.kenBurns.panDirection : "ปิด"}`}
                            >
                              🎬 {clip.kenBurns?.enabled ? "KB 🟢" : "KB"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="clip-del-btn"
                            onClick={(e) => handleDeleteClip(track.id, clip.id, e)}
                            title="ลบคลิปนี้"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {clip.isCompound && (
                        <div className="clip-compound-strip">
                          <span>📦 Compound Clip ({clip.subClips?.length || 0} คลิปย่อย)</span>
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
                        title="คลิกค้างแล้วลากเพื่อ Trim In (ย่น/ขยายหัวคลิป)"
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
                        title="คลิกค้างแล้วลากเพื่อ Trim Out (ย่น/ขยายท้ายคลิป)"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
