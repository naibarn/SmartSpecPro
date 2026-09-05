import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NleCanvas, SmartSpecProjectDraft } from "../../types/nleProject";

export interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SmartSpecProjectDraft | null;
  currentAspectRatio: "9:16" | "16:9" | "1:1" | "source";
  boundSeriesId?: string | null;
  onSaveSettings: (settings: {
    title: string;
    canvas: NleCanvas;
    seriesId?: string | null;
  }) => void;
}

export type PlatformPresetId = "tiktok_shorts_reels" | "youtube_widescreen" | "ig_square" | "social_portrait" | "cinema_ultrawide" | "custom";
export type ResolutionQuality = "480p" | "720p" | "1080p" | "2k" | "4k" | "8k" | "custom";
export type AspectRatioType = "9:16" | "16:9" | "1:1" | "4:5" | "21:9" | "custom";

interface PlatformPresetOption {
  id: PlatformPresetId;
  name: string;
  platformTag: string;
  ratio: AspectRatioType;
  defaultWidth: number;
  defaultHeight: number;
  icon: string;
  desc: string;
}

const PLATFORM_PRESETS: PlatformPresetOption[] = [
  {
    id: "tiktok_shorts_reels",
    name: "TikTok / Shorts / Reels",
    platformTag: "Vertical 9:16",
    ratio: "9:16",
    defaultWidth: 1080,
    defaultHeight: 1920,
    icon: "📱",
    desc: "1080 × 1920 (FHD แนวตั้ง) สำหรับ TikTok, YouTube Shorts, FB/IG Reels",
  },
  {
    id: "youtube_widescreen",
    name: "YouTube / TV / Widescreen",
    platformTag: "Landscape 16:9",
    ratio: "16:9",
    defaultWidth: 1920,
    defaultHeight: 1080,
    icon: "🖥️",
    desc: "1920 × 1080 (FHD แนวนอน) มาตรฐาน YouTube, TV และเว็บบอร์ด",
  },
  {
    id: "ig_square",
    name: "Instagram Feed (1:1)",
    platformTag: "Square 1:1",
    ratio: "1:1",
    defaultWidth: 1080,
    defaultHeight: 1080,
    icon: "⏹️",
    desc: "1080 × 1080 (สี่เหลี่ยมจัตุรัส) สำหรับ Instagram Feed, Facebook Post",
  },
  {
    id: "social_portrait",
    name: "Social Portrait (4:5)",
    platformTag: "Portrait 4:5",
    ratio: "4:5",
    defaultWidth: 1080,
    defaultHeight: 1350,
    icon: "📷",
    desc: "1080 × 1350 สำหรับ Instagram Portrait Feed และ FB Mobile",
  },
  {
    id: "cinema_ultrawide",
    name: "Cinema Ultrawide (21:9)",
    platformTag: "Ultrawide 21:9",
    ratio: "21:9",
    defaultWidth: 2560,
    defaultHeight: 1080,
    icon: "🎬",
    desc: "2560 × 1080 (จอกว้างภาพยนตร์) สำหรับวิดีโอระดับสตูดิโอ",
  },
  {
    id: "custom",
    name: "Custom (กำหนดขนาดเอง)",
    platformTag: "Custom W×H",
    ratio: "custom",
    defaultWidth: 1080,
    defaultHeight: 1920,
    icon: "⚙️",
    desc: "ระบุพิกเซลความกว้างและความสูงตามต้องการ (เช่น 1080×1920)",
  },
];

const RESOLUTION_MATRIX: Record<ResolutionQuality, Record<AspectRatioType, { w: number; h: number; label: string }>> = {
  "480p": {
    "9:16": { w: 480, h: 854, label: "480 × 854 (480p SD)" },
    "16:9": { w: 854, h: 480, label: "854 × 480 (480p SD)" },
    "1:1": { w: 480, h: 480, label: "480 × 480 (480p SD)" },
    "4:5": { w: 480, h: 600, label: "480 × 600 (480p SD)" },
    "21:9": { w: 854, h: 366, label: "854 × 366 (480p SD)" },
    "custom": { w: 480, h: 854, label: "480p SD" },
  },
  "720p": {
    "9:16": { w: 720, h: 1280, label: "720 × 1280 (720p HD)" },
    "16:9": { w: 1280, h: 720, label: "1280 × 720 (720p HD)" },
    "1:1": { w: 720, h: 720, label: "720 × 720 (720p HD)" },
    "4:5": { w: 720, h: 900, label: "720 × 900 (720p HD)" },
    "21:9": { w: 1280, h: 548, label: "1280 × 548 (720p HD)" },
    "custom": { w: 720, h: 1280, label: "720p HD" },
  },
  "1080p": {
    "9:16": { w: 1080, h: 1920, label: "1080 × 1920 (1080p Full HD)" },
    "16:9": { w: 1920, h: 1080, label: "1920 × 1080 (1080p Full HD)" },
    "1:1": { w: 1080, h: 1080, label: "1080 × 1080 (1080p Full HD)" },
    "4:5": { w: 1080, h: 1350, label: "1080 × 1350 (1080p Full HD)" },
    "21:9": { w: 2560, h: 1080, label: "2560 × 1080 (1080p Ultrawide)" },
    "custom": { w: 1080, h: 1920, label: "1080p Full HD" },
  },
  "2k": {
    "9:16": { w: 1440, h: 2560, label: "1440 × 2560 (2K QHD)" },
    "16:9": { w: 2560, h: 1440, label: "2560 × 1440 (2K QHD)" },
    "1:1": { w: 1440, h: 1440, label: "1440 × 1440 (2K QHD)" },
    "4:5": { w: 1440, h: 1800, label: "1440 × 1800 (2K QHD)" },
    "21:9": { w: 3440, h: 1440, label: "3440 × 1440 (2K Ultrawide)" },
    "custom": { w: 1440, h: 2560, label: "2K QHD" },
  },
  "4k": {
    "9:16": { w: 2160, h: 3840, label: "2160 × 3840 (4K Ultra HD)" },
    "16:9": { w: 3840, h: 2160, label: "3840 × 2160 (4K Ultra HD)" },
    "1:1": { w: 2160, h: 2160, label: "2160 × 2160 (4K Ultra HD)" },
    "4:5": { w: 2160, h: 2700, label: "2160 × 2700 (4K Ultra HD)" },
    "21:9": { w: 5120, h: 2160, label: "5120 × 2160 (4K Ultrawide)" },
    "custom": { w: 2160, h: 3840, label: "4K Ultra HD" },
  },
  "8k": {
    "9:16": { w: 4320, h: 7680, label: "4320 × 7680 (8K Ultra)" },
    "16:9": { w: 7680, h: 4320, label: "7680 × 4320 (8K Ultra)" },
    "1:1": { w: 4320, h: 4320, label: "4320 × 4320 (8K Ultra)" },
    "4:5": { w: 4320, h: 5400, label: "4320 × 5400 (8K Ultra)" },
    "21:9": { w: 10240, h: 4320, label: "10240 × 4320 (8K Ultrawide)" },
    "custom": { w: 4320, h: 7680, label: "8K Ultra" },
  },
  "custom": {
    "9:16": { w: 1080, h: 1920, label: "กำหนดความละเอียดเอง" },
    "16:9": { w: 1920, h: 1080, label: "กำหนดความละเอียดเอง" },
    "1:1": { w: 1080, h: 1080, label: "กำหนดความละเอียดเอง" },
    "4:5": { w: 1080, h: 1350, label: "กำหนดความละเอียดเอง" },
    "21:9": { w: 2560, h: 1080, label: "กำหนดความละเอียดเอง" },
    "custom": { w: 1080, h: 1920, label: "กำหนดความละเอียดเอง" },
  },
};

export function ProjectSettingsModal({
  isOpen,
  onClose,
  project,
  currentAspectRatio,
  boundSeriesId,
  onSaveSettings,
}: ProjectSettingsModalProps) {
  const [title, setTitle] = useState(project?.title || "Video Project");
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioType>("9:16");
  const [selectedQuality, setSelectedQuality] = useState<ResolutionQuality>("1080p");
  const [width, setWidth] = useState<number>(1080);
  const [height, setHeight] = useState<number>(1920);
  const [fps, setFps] = useState<number>(30);
  const [backgroundColor, setBackgroundColor] = useState<string>("#000000");

  // Series Binding Option States
  const [isSeriesBound, setIsSeriesBound] = useState<boolean>(Boolean(boundSeriesId || project?.metadata?.seriesId));
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(boundSeriesId || project?.metadata?.seriesId || "");
  const [availableSeriesList, setAvailableSeriesList] = useState<Array<{ seriesId: string; title: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;
    invoke<{ items?: Array<{ seriesId: string; title: string }> }>("worker_app_list_series")
      .then((res) => {
        const rawList = res?.items || (Array.isArray(res) ? res : []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const mapped = rawList.map((s) => ({ seriesId: String(s.seriesId), title: s.title || `ซีรีส์ #${s.seriesId}` }));
          setAvailableSeriesList(mapped);
          setSelectedSeriesId((curr) => curr || mapped[0]?.seriesId || "");
        } else {
          setAvailableSeriesList([]);
        }
      })
      .catch((err) => {
        console.warn("Failed to load series list in ProjectSettingsModal:", err);
        setAvailableSeriesList([]);
      });
  }, [isOpen]);

  useEffect(() => {
    if (boundSeriesId !== undefined && boundSeriesId !== null) {
      setIsSeriesBound(Boolean(boundSeriesId));
      if (boundSeriesId) setSelectedSeriesId(boundSeriesId);
    } else if (project?.metadata?.seriesId !== undefined && project?.metadata?.seriesId !== null) {
      setIsSeriesBound(Boolean(project.metadata.seriesId));
      if (project.metadata.seriesId) setSelectedSeriesId(project.metadata.seriesId);
    }
  }, [boundSeriesId, project?.metadata?.seriesId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (project?.canvas) {
      const w = project.canvas.width || 1080;
      const h = project.canvas.height || 1920;
      setWidth(w);
      setHeight(h);
      setFps(project.canvas.fps || 30);
      const r = project.canvas.aspectRatio || "9:16";
      setSelectedRatio(r as AspectRatioType);
      setBackgroundColor(project.canvas.backgroundColor || "#000000");

      // Deduce quality level
      if (w === 1080 && h === 1920) setSelectedQuality("1080p");
      else if (w === 1920 && h === 1080) setSelectedQuality("1080p");
      else if (w === 2160 && h === 3840) setSelectedQuality("4k");
      else if (w === 3840 && h === 2160) setSelectedQuality("4k");
      else if (w === 720 && h === 1280) setSelectedQuality("720p");
      else if (w === 1280 && h === 720) setSelectedQuality("720p");
      else if (w === 480 && h === 854) setSelectedQuality("480p");
      else if (w === 854 && h === 480) setSelectedQuality("480p");
      else if (w === 1440 && h === 2560) setSelectedQuality("2k");
      else if (w === 2560 && h === 1440) setSelectedQuality("2k");
      else if (w === 4320 && h === 7680) setSelectedQuality("8k");
      else if (w === 7680 && h === 4320) setSelectedQuality("8k");
      else setSelectedQuality("custom");
    } else {
      if (currentAspectRatio === "16:9") {
        setWidth(1920);
        setHeight(1080);
        setSelectedRatio("16:9");
        setSelectedQuality("1080p");
      } else {
        setWidth(1080);
        setHeight(1920);
        setSelectedRatio("9:16");
        setSelectedQuality("1080p");
      }
    }
  }, [project, currentAspectRatio, isOpen]);

  if (!isOpen) return null;

  const applyRatioAndQuality = (targetRatio: AspectRatioType, targetQuality: ResolutionQuality) => {
    setSelectedRatio(targetRatio);
    setSelectedQuality(targetQuality);

    if (targetRatio === "custom" || targetQuality === "custom") {
      return;
    }

    const item = RESOLUTION_MATRIX[targetQuality]?.[targetRatio];
    if (item) {
      setWidth(item.w);
      setHeight(item.h);
    }
  };

  const handleSelectPlatformPreset = (preset: PlatformPresetOption) => {
    if (preset.id === "custom") {
      setSelectedRatio("custom");
      setSelectedQuality("custom");
    } else {
      const q = selectedQuality === "custom" ? "1080p" : selectedQuality;
      applyRatioAndQuality(preset.ratio, q);
    }
  };

  const handleSelectAspectPill = (ratio: AspectRatioType) => {
    const q = selectedQuality === "custom" ? "1080p" : selectedQuality;
    applyRatioAndQuality(ratio, q);
  };

  const handleSelectQualityPill = (quality: ResolutionQuality) => {
    const r = selectedRatio === "custom" ? "9:16" : selectedRatio;
    applyRatioAndQuality(r, quality);
  };

  const handleSave = () => {
    const validWidth = Math.max(320, Math.min(7680, Number(width) || 1080));
    const validHeight = Math.max(240, Math.min(4320, Number(height) || 1920));
    const validFps = [24, 25, 30, 50, 60].includes(Number(fps)) ? Number(fps) : 30;

    let derivedRatio: AspectRatioType = "custom";
    const computed = validWidth / validHeight;
    if (Math.abs(computed - 9 / 16) < 0.05) derivedRatio = "9:16";
    else if (Math.abs(computed - 16 / 9) < 0.05) derivedRatio = "16:9";
    else if (Math.abs(computed - 1.0) < 0.05) derivedRatio = "1:1";
    else if (Math.abs(computed - 4 / 5) < 0.05) derivedRatio = "4:5";
    else if (Math.abs(computed - 21 / 9) < 0.08) derivedRatio = "21:9";

    const canvas: NleCanvas = {
      width: validWidth,
      height: validHeight,
      fps: validFps,
      aspectRatio: derivedRatio,
      durationMs: project?.canvas?.durationMs || 60000,
      backgroundColor,
    };

    const targetSeriesId = isSeriesBound ? (selectedSeriesId.trim() || availableSeriesList[0]?.seriesId || null) : null;

    onSaveSettings({
      title: title.trim() || "Untitled Project",
      canvas,
      seriesId: targetSeriesId,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop nle-modal-backdrop" onClick={onClose}>
      <div className="project-settings-modal" style={{ maxWidth: "720px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header" style={{ padding: "16px 20px" }}>
          <div className="modal-title-box">
            <span className="modal-title-icon" style={{ fontSize: "1.4rem" }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#f8fafc" }}>
                ตั้งค่าโปรเจกต์ (Project & Canvas Settings)
              </h3>
              <p className="modal-subtitle" style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                กำหนดแพลตฟอร์มปลายทาง, สัดส่วนหน้าจอ (Aspect Ratio), ความละเอียด (Resolution) และอัตราเฟรม (FPS)
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-scrollable" style={{ padding: "20px", maxHeight: "78vh", overflowY: "auto" }}>
          {/* Project Title */}
          <div className="settings-field-group">
            <label className="field-label" htmlFor="project-title-input" style={{ fontWeight: 600, color: "#e2e8f0", fontSize: "0.85rem", marginBottom: "6px", display: "block" }}>
              ชื่อโปรเจกต์ (Project Title)
            </label>
            <input
              id="project-title-input"
              type="text"
              className="settings-text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ระบุชื่อโปรเจกต์ เช่น TikTok Video Episode 01"
              style={{ width: "100%", padding: "9px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#f8fafc" }}
            />
          </div>

          {/* Series ID Workspace Binding Option */}
          <div className="settings-field-group" style={{ background: "rgba(15, 23, 42, 0.7)", padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.25)", marginBottom: "18px" }}>
            <label className="field-label" style={{ color: "#38bdf8", fontWeight: 700, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.88rem" }}>
              <span>🎬</span> การผูก Series กับ Workspace (SeriesID Binding)
            </label>
            <div style={{ display: "flex", gap: "16px", marginBottom: isSeriesBound ? "10px" : "0", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.82rem", color: "#e2e8f0" }}>
                <input
                  type="radio"
                  name="seriesBindingOption"
                  checked={!isSeriesBound}
                  onChange={() => setIsSeriesBound(false)}
                />
                <span>ไม่ผูกกับ Series (Standalone Workspace)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.82rem", color: "#e2e8f0" }}>
                <input
                  type="radio"
                  name="seriesBindingOption"
                  checked={isSeriesBound}
                  onChange={() => setIsSeriesBound(true)}
                />
                <span>ผูกกับ Series (เชื่อมข้อมูลช็อต & Spec 176/177)</span>
              </label>
            </div>

            {isSeriesBound && (
              <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
                <select
                  className="settings-text-input"
                  style={{ flex: 1, padding: "8px 12px", background: "#0f172a", border: "1px solid rgba(148, 163, 184, 0.3)", color: "#f8fafc", borderRadius: "6px" }}
                  value={selectedSeriesId}
                  onChange={(e) => setSelectedSeriesId(e.target.value)}
                >
                  {availableSeriesList.map((s) => (
                    <option key={s.seriesId} value={s.seriesId}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  💡 Auto-filter วิดีโอช็อตของ Series นี้ และใช้ Spec 176/177 สำหรับสร้างดนตรี
                </div>
              </div>
            )}
          </div>

          {/* Section 1: Platform Presets Grid */}
          <div className="settings-field-group" style={{ marginBottom: "18px" }}>
            <label className="field-label" style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.88rem", marginBottom: "8px", display: "block" }}>
              1. เลือกงานวิดีโอตามแพลตฟอร์มยอดนิยม (Video Target Platform)
            </label>
            <div className="presets-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
              {PLATFORM_PRESETS.map((p) => {
                const isMatch = p.id !== "custom" && selectedRatio === p.ratio && (width === p.defaultWidth || height === p.defaultHeight);
                const isSelected = isMatch || (p.id === "custom" && (selectedRatio === "custom" || selectedQuality === "custom"));

                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`preset-card ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelectPlatformPreset(p)}
                    style={{
                      background: isSelected ? "rgba(14, 165, 233, 0.18)" : "#1e293b",
                      border: isSelected ? "2px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.2)",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div className="preset-card-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="preset-icon" style={{ fontSize: "1.2rem" }}>{p.icon}</span>
                      <span className="preset-aspect-pill" style={{ background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", padding: "2px 6px", borderRadius: "4px", fontSize: "0.68rem", fontWeight: 700 }}>
                        {p.platformTag}
                      </span>
                    </div>
                    <div className="preset-name" style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.83rem" }}>{p.name}</div>
                    <div className="preset-dims" style={{ color: "#38bdf8", fontSize: "0.72rem", fontFamily: "monospace" }}>
                      {p.id !== "custom" ? `${p.defaultWidth} × ${p.defaultHeight}` : "กำหนดเอง"}
                    </div>
                    <div className="preset-desc" style={{ color: "#94a3b8", fontSize: "0.68rem", lineHeight: 1.3 }}>{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Aspect Ratio Selection Pills */}
          <div className="settings-field-group" style={{ marginBottom: "18px" }}>
            <label className="field-label" style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.88rem", marginBottom: "8px", display: "block" }}>
              2. สัดส่วนภาพ (Aspect Ratio)
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { r: "9:16", label: "📱 9:16 (แนวตั้ง Vertical)" },
                { r: "16:9", label: "🖥️ 16:9 (แนวนอน Widescreen)" },
                { r: "1:1", label: "⏹️ 1:1 (จัตุรัส Square)" },
                { r: "4:5", label: "📷 4:5 (พอร์ตเทรต Portrait)" },
                { r: "21:9", label: "🎬 21:9 (ซีเนม่า Cinema)" },
                { r: "custom", label: "⚙️ Custom (กำหนดเอง)" },
              ].map((opt) => (
                <button
                  key={opt.r}
                  type="button"
                  onClick={() => handleSelectAspectPill(opt.r as AspectRatioType)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "6px",
                    border: selectedRatio === opt.r ? "1.5px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.25)",
                    background: selectedRatio === opt.r ? "rgba(14, 165, 233, 0.2)" : "#1e293b",
                    color: selectedRatio === opt.r ? "#38bdf8" : "#cbd5e1",
                    fontWeight: selectedRatio === opt.r ? 700 : 500,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Resolution Quality Presets (480p, 720p, 1080p, 2K, 4K, 8K) */}
          <div className="settings-field-group" style={{ marginBottom: "18px" }}>
            <label className="field-label" style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "0.88rem", marginBottom: "8px", display: "block" }}>
              3. เลือกความละเอียดภาพ (Video Resolution Quality)
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { q: "480p", label: "480p SD", desc: "ประหยัดพท." },
                { q: "720p", label: "720p HD", desc: "HD มาตรฐาน" },
                { q: "1080p", label: "1080p Full HD ⭐", desc: "แนะนำสำหรับโซเชียล" },
                { q: "2k", label: "2K QHD", desc: "คมชัดสูง" },
                { q: "4k", label: "4K Ultra HD ✨", desc: "คุณภาพระดับสตูดิโอ" },
                { q: "8k", label: "8K Ultra", desc: "สูงสุด 4320p/7680p" },
                { q: "custom", label: "Custom", desc: "ระบุ W×H เอง" },
              ].map((opt) => (
                <button
                  key={opt.q}
                  type="button"
                  onClick={() => handleSelectQualityPill(opt.q as ResolutionQuality)}
                  style={{
                    flex: "1 1 110px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: selectedQuality === opt.q ? "2px solid #10b981" : "1px solid rgba(148, 163, 184, 0.2)",
                    background: selectedQuality === opt.q ? "rgba(16, 185, 129, 0.18)" : "#1e293b",
                    color: selectedQuality === opt.q ? "#34d399" : "#e2e8f0",
                    fontWeight: selectedQuality === opt.q ? 700 : 500,
                    fontSize: "0.8rem",
                    textAlign: "center",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.label}</span>
                  <span style={{ fontSize: "0.68rem", opacity: 0.8, color: selectedQuality === opt.q ? "#a7f3d0" : "#94a3b8" }}>
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Dimensions Inputs & Flip Button */}
          <div className="settings-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
            <div className="settings-field-group">
              <label className="field-label" htmlFor="canvas-width-input" style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.82rem", marginBottom: "4px", display: "block" }}>
                ความกว้างพิกเซล (Width px)
              </label>
              <input
                id="canvas-width-input"
                type="number"
                step="2"
                min="320"
                max="7680"
                className="settings-text-input"
                value={width}
                onChange={(e) => {
                  setWidth(Number(e.target.value));
                  setSelectedRatio("custom");
                  setSelectedQuality("custom");
                }}
                style={{ width: "100%", padding: "8px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#f8fafc", fontFamily: "monospace", fontSize: "0.95rem" }}
              />
            </div>
            <div className="settings-field-group">
              <label className="field-label" htmlFor="canvas-height-input" style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.82rem", marginBottom: "4px", display: "block" }}>
                ความสูงพิกเซล (Height px)
              </label>
              <input
                id="canvas-height-input"
                type="number"
                step="2"
                min="240"
                max="4320"
                className="settings-text-input"
                value={height}
                onChange={(e) => {
                  setHeight(Number(e.target.value));
                  setSelectedRatio("custom");
                  setSelectedQuality("custom");
                }}
                style={{ width: "100%", padding: "8px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#f8fafc", fontFamily: "monospace", fontSize: "0.95rem" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "18px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn-flip-orientation"
              onClick={() => {
                const temp = width;
                setWidth(height);
                setHeight(temp);
                setSelectedRatio("custom");
                setSelectedQuality("custom");
              }}
              title="สลับแนวตั้งและแนวนอน (Flip Width & Height)"
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                background: "rgba(51, 65, 85, 0.6)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                color: "#38bdf8",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🔄 สลับแนวตั้ง/แนวนอน ({width}×{height} → {height}×{width})
            </button>
          </div>

          {/* FPS & Background Color */}
          <div className="settings-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "18px" }}>
            <div className="settings-field-group">
              <label className="field-label" style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.82rem", marginBottom: "6px", display: "block" }}>
                อัตราเฟรม (Frame Rate FPS)
              </label>
              <div className="fps-pills-row" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[24, 25, 30, 50, 60].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`fps-pill ${fps === rate ? "active" : ""}`}
                    onClick={() => setFps(rate)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: fps === rate ? "1.5px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.2)",
                      background: fps === rate ? "rgba(56, 189, 248, 0.2)" : "#1e293b",
                      color: fps === rate ? "#38bdf8" : "#cbd5e1",
                      fontSize: "0.78rem",
                      fontWeight: fps === rate ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {rate} FPS {rate === 30 ? "(แนะนำ)" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field-group">
              <label className="field-label" style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "0.82rem", marginBottom: "6px", display: "block" }}>
                สีพื้นหลัง Canvas (Background Color)
              </label>
              <div className="bg-picker-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  style={{ background: "#000000", border: backgroundColor === "#000000" ? "2px solid #38bdf8" : "1px solid #334155", color: "#fff", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem" }}
                  onClick={() => setBackgroundColor("#000000")}
                  title="สีดำ (มาตรฐานวิดีโอ)"
                >
                  ⬛ ดำ
                </button>
                <button
                  type="button"
                  style={{ background: "#ffffff", border: backgroundColor === "#ffffff" ? "2px solid #38bdf8" : "1px solid #cbd5e1", color: "#000", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem" }}
                  onClick={() => setBackgroundColor("#ffffff")}
                  title="สีขาว"
                >
                  ⬜ ขาว
                </button>
                <button
                  type="button"
                  style={{ background: "#1e293b", border: backgroundColor === "#1e293b" ? "2px solid #38bdf8" : "1px solid #334155", color: "#fff", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem" }}
                  onClick={() => setBackgroundColor("#1e293b")}
                  title="เทาเข้ม Slate"
                >
                  ◼️ Slate
                </button>
                <input
                  type="color"
                  value={backgroundColor.startsWith("#") ? backgroundColor : "#000000"}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  title="เลือกสีพื้นหลังแบบกำหนดเอง"
                  style={{ width: "36px", height: "30px", border: "none", borderRadius: "6px", cursor: "pointer", padding: 0 }}
                />
              </div>
            </div>
          </div>

          {/* Quick Summary Banner */}
          <div className="settings-summary-banner" style={{ background: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "8px", padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div className="summary-col" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="summary-label" style={{ fontSize: "0.7rem", color: "#94a3b8" }}>สัดส่วน & แพลตฟอร์ม</span>
              <span className="summary-value" style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8" }}>
                {width < height
                  ? "📱 9:16 แนวตั้ง (TikTok/Shorts)"
                  : width > height
                  ? "🖥️ 16:9 แนวนอน (YouTube/TV)"
                  : "⏹️ 1:1 จัตุรัส (Instagram)"}
              </span>
            </div>
            <div className="summary-col" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="summary-label" style={{ fontSize: "0.7rem", color: "#94a3b8" }}>ความละเอียดจริงที่จะ Render</span>
              <span className="summary-value highlight" style={{ fontSize: "0.92rem", fontWeight: 800, color: "#10b981", fontFamily: "monospace" }}>
                {width} × {height} px
              </span>
            </div>
            <div className="summary-col" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="summary-label" style={{ fontSize: "0.7rem", color: "#94a3b8" }}>เฟรมเรตและออดิโอ</span>
              <span className="summary-value" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#e2e8f0" }}>
                {fps} FPS · 48 kHz AAC
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid rgba(148, 163, 184, 0.15)" }}>
          <button type="button" className="btn-cancel" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", background: "#334155", color: "#f8fafc", border: "none", cursor: "pointer", fontWeight: 600 }}>
            ยกเลิก
          </button>
          <button type="button" className="btn-confirm-save" onClick={handleSave} style={{ padding: "8px 20px", borderRadius: "6px", background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", color: "#ffffff", border: "none", cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 8px rgba(2, 132, 199, 0.4)" }}>
            💾 บันทึกการตั้งค่าโปรเจกต์
          </button>
        </div>
      </div>
    </div>
  );
}
