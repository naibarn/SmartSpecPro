import React, { useState, useEffect } from "react";
import type { NleCanvas, SmartSpecProjectDraft } from "../../types/nleProject";

export interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SmartSpecProjectDraft | null;
  currentAspectRatio: "9:16" | "16:9" | "1:1" | "source";
  onSaveSettings: (settings: {
    title: string;
    canvas: NleCanvas;
  }) => void;
}

interface PresetOption {
  id: string;
  name: string;
  ratio: "9:16" | "16:9" | "1:1" | "4:5" | "21:9" | "custom";
  aspectLabel: string;
  width: number;
  height: number;
  icon: string;
  desc: string;
}

const PRESET_OPTIONS: PresetOption[] = [
  {
    id: "shorts_1080p",
    name: "Shorts / TikTok / Reels",
    ratio: "9:16",
    aspectLabel: "9:16",
    width: 1080,
    height: 1920,
    icon: "📱",
    desc: "1080 × 1920 (FHD แนวตั้ง) สำหรับ TikTok, YouTube Shorts, Reels",
  },
  {
    id: "youtube_1080p",
    name: "YouTube / Widescreen",
    ratio: "16:9",
    aspectLabel: "16:9",
    width: 1920,
    height: 1080,
    icon: "🖥️",
    desc: "1920 × 1080 (FHD แนวนอน) มาตรฐาน YouTube และจอภาพ",
  },
  {
    id: "shorts_4k",
    name: "4K Shorts Ultra HD",
    ratio: "9:16",
    aspectLabel: "9:16",
    width: 2160,
    height: 3840,
    icon: "✨",
    desc: "2160 × 3840 (4K แนวตั้ง) คุณภาพสูงพิเศษ",
  },
  {
    id: "youtube_4k",
    name: "4K UHD Landscape",
    ratio: "16:9",
    aspectLabel: "16:9",
    width: 3840,
    height: 2160,
    icon: "🎬",
    desc: "3840 × 2160 (4K UHD) ภาพยนตร์ระดับสตูดิโอ",
  },
  {
    id: "square_1080p",
    name: "Instagram Square (1:1)",
    ratio: "1:1",
    aspectLabel: "1:1",
    width: 1080,
    height: 1080,
    icon: "⏹️",
    desc: "1080 × 1080 (สี่เหลี่ยมจัตุรัส) สำหรับ Feed โซเชียล",
  },
  {
    id: "portrait_4_5",
    name: "Social Portrait (4:5)",
    ratio: "4:5",
    aspectLabel: "4:5",
    width: 1080,
    height: 1350,
    icon: "📷",
    desc: "1080 × 1350 สำหรับ Instagram Portrait Feed",
  },
  {
    id: "custom",
    name: "Custom (กำหนดเอง)",
    ratio: "custom",
    aspectLabel: "Custom",
    width: 1080,
    height: 1920,
    icon: "⚙️",
    desc: "ระบุความกว้างและความสูงตามต้องการ",
  },
];

export function ProjectSettingsModal({
  isOpen,
  onClose,
  project,
  currentAspectRatio,
  onSaveSettings,
}: ProjectSettingsModalProps) {
  const [title, setTitle] = useState(project?.title || "SmartSpec NLE Project");
  const [selectedRatio, setSelectedRatio] = useState<string>("9:16");
  const [width, setWidth] = useState<number>(1080);
  const [height, setHeight] = useState<number>(1920);
  const [fps, setFps] = useState<number>(30);
  const [backgroundColor, setBackgroundColor] = useState<string>("#000000");

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
      setWidth(project.canvas.width || 1080);
      setHeight(project.canvas.height || 1920);
      setFps(project.canvas.fps || 30);
      setSelectedRatio(project.canvas.aspectRatio || "9:16");
      setBackgroundColor(project.canvas.backgroundColor || "#000000");
    } else {
      if (currentAspectRatio === "16:9") {
        setWidth(1920);
        setHeight(1080);
        setSelectedRatio("16:9");
      } else {
        setWidth(1080);
        setHeight(1920);
        setSelectedRatio("9:16");
      }
    }
  }, [project, currentAspectRatio, isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: PresetOption) => {
    setSelectedRatio(preset.ratio);
    if (preset.id !== "custom") {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  };

  const handleSave = () => {
    const validWidth = Math.max(320, Math.min(7680, Number(width) || 1080));
    const validHeight = Math.max(240, Math.min(4320, Number(height) || 1920));
    const validFps = [24, 25, 30, 50, 60].includes(Number(fps)) ? Number(fps) : 30;

    let derivedRatio: "9:16" | "16:9" | "1:1" | "4:5" | "custom" = "custom";
    const computed = validWidth / validHeight;
    if (Math.abs(computed - 9 / 16) < 0.05) derivedRatio = "9:16";
    else if (Math.abs(computed - 16 / 9) < 0.05) derivedRatio = "16:9";
    else if (Math.abs(computed - 1.0) < 0.05) derivedRatio = "1:1";
    else if (Math.abs(computed - 4 / 5) < 0.05) derivedRatio = "4:5";

    const canvas: NleCanvas = {
      width: validWidth,
      height: validHeight,
      fps: validFps,
      aspectRatio: derivedRatio,
      durationMs: project?.canvas?.durationMs || 60000,
      backgroundColor,
    };

    onSaveSettings({
      title: title.trim() || "Untitled Project",
      canvas,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop nle-modal-backdrop" onClick={onClose}>
      <div className="project-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-box">
            <span className="modal-title-icon">⚙️</span>
            <div>
              <h3>ตั้งค่าโปรเจกต์ (Project & Canvas Settings)</h3>
              <p className="modal-subtitle">
                กำหนดสัดส่วนหน้าจอ ความละเอียด (Resolution) และอัตราเฟรม (FPS) ของงาน
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-scrollable">
          {/* Project Title */}
          <div className="settings-field-group">
            <label className="field-label" htmlFor="project-title-input">
              ชื่อโปรเจกต์ (Project Title)
            </label>
            <input
              id="project-title-input"
              type="text"
              className="settings-text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ระบุชื่อโปรเจกต์ เช่น TikTok Episode 01"
            />
          </div>

          {/* Presets Grid */}
          <div className="settings-field-group">
            <label className="field-label">สัดส่วนและพรีเซ็ตยอดนิยม (Presets)</label>
            <div className="presets-cards-grid">
              {PRESET_OPTIONS.map((p) => {
                const isMatch = p.id !== "custom" && width === p.width && height === p.height;
                const isSelected = isMatch || (p.id === "custom" && (selectedRatio === "custom" || !PRESET_OPTIONS.some(opt => opt.id !== "custom" && opt.width === width && opt.height === height)));

                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`preset-card ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <div className="preset-card-top">
                      <span className="preset-icon">{p.icon}</span>
                      <span className="preset-aspect-pill">{p.aspectLabel}</span>
                    </div>
                    <div className="preset-name">{p.name}</div>
                    <div className="preset-dims">
                      {p.id !== "custom" ? `${p.width} × ${p.height}` : "กำหนดเอง"}
                    </div>
                    <div className="preset-desc">{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Dimensions & Aspect Details */}
          <div className="settings-two-col">
            <div className="settings-field-group">
              <label className="field-label" htmlFor="canvas-width-input">
                ความกว้าง Canvas (Width px)
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
                }}
              />
            </div>
            <div className="settings-field-group">
              <label className="field-label" htmlFor="canvas-height-input">
                ความสูง Canvas (Height px)
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
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn-flip-orientation"
              onClick={() => {
                const temp = width;
                setWidth(height);
                setHeight(temp);
                setSelectedRatio("custom");
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

          {/* FPS & Background */}
          <div className="settings-two-col">
            <div className="settings-field-group">
              <label className="field-label">อัตราเฟรม (Frame Rate)</label>
              <div className="fps-pills-row">
                {[24, 30, 60].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`fps-pill ${fps === rate ? "active" : ""}`}
                    onClick={() => setFps(rate)}
                  >
                    {rate} FPS {rate === 30 ? "(แนะนำ)" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field-group">
              <label className="field-label">สีพื้นหลัง Canvas (Background)</label>
              <div className="bg-picker-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className={`bg-color-btn ${backgroundColor === "#000000" ? "active" : ""}`}
                  style={{ background: "#000000" }}
                  onClick={() => setBackgroundColor("#000000")}
                  title="สีดำ (มาตรฐานวิดีโอ)"
                >
                  ⬛ ดำ
                </button>
                <button
                  type="button"
                  className={`bg-color-btn ${backgroundColor === "#ffffff" ? "active" : ""}`}
                  style={{ background: "#ffffff", color: "#000" }}
                  onClick={() => setBackgroundColor("#ffffff")}
                  title="สีขาว"
                >
                  ⬜ ขาว
                </button>
                <button
                  type="button"
                  className={`bg-color-btn ${backgroundColor === "#1e293b" ? "active" : ""}`}
                  style={{ background: "#1e293b" }}
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
                  style={{ width: "36px", height: "32px", border: "none", borderRadius: "6px", cursor: "pointer", padding: 0 }}
                />
              </div>
            </div>
          </div>


          {/* Quick Summary Banner */}
          <div className="settings-summary-banner">
            <div className="summary-col">
              <span className="summary-label">สัดส่วนที่เลือก</span>
              <span className="summary-value">
                {width < height
                  ? "📱 9:16 แนวตั้ง (Shorts)"
                  : width > height
                  ? "🖥️ 16:9 แนวนอน (Widescreen)"
                  : "⏹️ 1:1 จัตุรัส"}
              </span>
            </div>
            <div className="summary-col">
              <span className="summary-label">ความละเอียดพิกเซล</span>
              <span className="summary-value highlight">
                {width} × {height} px
              </span>
            </div>
            <div className="summary-col">
              <span className="summary-label">เฟรมเรตและเสียง</span>
              <span className="summary-value">{fps} fps · 48 kHz</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn-confirm-save" onClick={handleSave}>
            💾 บันทึกการตั้งค่าโปรเจกต์
          </button>
        </div>
      </div>
    </div>
  );
}
