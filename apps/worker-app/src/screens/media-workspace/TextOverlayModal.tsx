import React, { useState } from "react";
import type { NleClip } from "../../types/nleProject";

interface TextOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTextClip: (clip: NleClip) => void;
  currentTimeMs: number;
}

export const GOOGLE_FONTS = [
  { label: "Kanit (โมเดิร์น ยอดนิยมไทย)", value: "'Kanit', sans-serif" },
  { label: "Prompt (เรียบหรู ทันสมัย)", value: "'Prompt', sans-serif" },
  { label: "Sarabun (ทางการ อ่านง่าย)", value: "'Sarabun', sans-serif" },
  { label: "Mitr (โค้งมน สดใส)", value: "'Mitr', sans-serif" },
  { label: "Chonburi (ตัวหนา คลาสสิก)", value: "'Chonburi', cursive" },
  { label: "Montserrat (Clean Geometric)", value: "'Montserrat', sans-serif" },
  { label: "Inter (Tech UI Minimal)", value: "'Inter', sans-serif" },
  { label: "Poppins (Friendly Bold)", value: "'Poppins', sans-serif" },
  { label: "Bebas Neue (Tall Impact)", value: "'Bebas Neue', sans-serif" },
  { label: "Oswald (Condensed Strong)", value: "'Oswald', sans-serif" },
];

export const SYSTEM_FONTS = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', sans-serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "System Default", value: "system-ui, sans-serif" },
];

export const TEXT_PRESETS = [
  {
    id: "tiktok_viral",
    name: "⚡ TikTok Punchy",
    desc: "เหลืองขอบดำ หนา มีมิติ",
    fontFamily: "'Kanit', sans-serif",
    fontSize: 48,
    fontColor: "#facc15",
    backgroundColor: "transparent",
    strokeColor: "#000000",
    strokeWidth: 4,
    shadowColor: "rgba(0,0,0,0.9)",
    shadowBlur: 8,
    shadowOffsetX: 3,
    shadowOffsetY: 4,
    animationEffect: "pop" as const,
  },
  {
    id: "youtube_hook",
    name: "🔴 YouTube Hook",
    desc: "ขาวบนกล่องแดง โดดเด่น",
    fontFamily: "'Prompt', sans-serif",
    fontSize: 44,
    fontColor: "#ffffff",
    backgroundColor: "rgba(239, 68, 68, 0.95)",
    strokeColor: "#000000",
    strokeWidth: 2,
    shadowColor: "rgba(0,0,0,0.8)",
    shadowBlur: 10,
    shadowOffsetX: 2,
    shadowOffsetY: 3,
    animationEffect: "slide_up" as const,
  },
  {
    id: "cyber_neon",
    name: "💎 Cyber Neon",
    desc: "ฟ้านีออน เรืองแสง Glow",
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 46,
    fontColor: "#22d3ee",
    backgroundColor: "transparent",
    strokeColor: "#0891b2",
    strokeWidth: 1,
    shadowColor: "#06b6d4",
    shadowBlur: 18,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    animationEffect: "glow_pulse" as const,
  },
  {
    id: "minimal_luxury",
    name: "👑 Minimal Gold",
    desc: "ทองเรียบหรู ละมุนตา",
    fontFamily: "'Sarabun', sans-serif",
    fontSize: 40,
    fontColor: "#fbbf24",
    backgroundColor: "transparent",
    strokeColor: "transparent",
    strokeWidth: 0,
    shadowColor: "rgba(0,0,0,0.6)",
    shadowBlur: 6,
    shadowOffsetX: 1,
    shadowOffsetY: 2,
    animationEffect: "fade" as const,
  },
  {
    id: "glass_pill",
    name: "🏷️ Glassmorphism",
    desc: "กล่องดำมน โปร่งแสงหรู",
    fontFamily: "'Inter', sans-serif",
    fontSize: 36,
    fontColor: "#ffffff",
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    strokeColor: "transparent",
    strokeWidth: 0,
    shadowColor: "rgba(0,0,0,0.5)",
    shadowBlur: 12,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    animationEffect: "pop" as const,
  },
  {
    id: "retro_arcade",
    name: "👾 Retro Arcade",
    desc: "ชมพู Retro ตัวหนา",
    fontFamily: "'Chonburi', cursive",
    fontSize: 44,
    fontColor: "#f43f5e",
    backgroundColor: "transparent",
    strokeColor: "#ffffff",
    strokeWidth: 2,
    shadowColor: "#4c0519",
    shadowBlur: 0,
    shadowOffsetX: 4,
    shadowOffsetY: 4,
    animationEffect: "bounce" as const,
  },
];

export function TextOverlayModal({
  isOpen,
  onClose,
  onAddTextClip,
  currentTimeMs,
}: TextOverlayModalProps) {
  const [text, setText] = useState("หัวข้อข้อความโดนใจ (Text Hook)");
  const [fontFamily, setFontFamily] = useState("'Kanit', sans-serif");
  const [fontSize, setFontSize] = useState(48);
  const [fontColor, setFontColor] = useState("#facc15");
  const [backgroundColor, setBackgroundColor] = useState("transparent");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [shadowColor, setShadowColor] = useState("rgba(0,0,0,0.85)");
  const [shadowBlur, setShadowBlur] = useState(8);
  const [shadowOffsetX, setShadowOffsetX] = useState(3);
  const [shadowOffsetY, setShadowOffsetY] = useState(3);
  const [animationEffect, setAnimationEffect] = useState<
    "none" | "fade" | "pop" | "slide_up" | "typewriter" | "glow_pulse" | "bounce"
  >("pop");
  const [positionPreset, setPositionPreset] = useState<"top" | "center" | "lower_third" | "custom">("top");
  const [posX, setPosX] = useState(0.5);
  const [posY, setPosY] = useState(0.22);
  const [durationSec, setDurationSec] = useState(4.0);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: (typeof TEXT_PRESETS)[0]) => {
    setFontFamily(preset.fontFamily);
    setFontSize(preset.fontSize);
    setFontColor(preset.fontColor);
    setBackgroundColor(preset.backgroundColor);
    setStrokeColor(preset.strokeColor);
    setStrokeWidth(preset.strokeWidth);
    setShadowColor(preset.shadowColor);
    setShadowBlur(preset.shadowBlur);
    setShadowOffsetX(preset.shadowOffsetX);
    setShadowOffsetY(preset.shadowOffsetY);
    setAnimationEffect(preset.animationEffect);
  };

  const handlePositionPreset = (pos: "top" | "center" | "lower_third") => {
    setPositionPreset(pos);
    if (pos === "top") {
      setPosX(0.5);
      setPosY(0.20);
    } else if (pos === "center") {
      setPosX(0.5);
      setPosY(0.50);
    } else if (pos === "lower_third") {
      setPosX(0.5);
      setPosY(0.80);
    }
  };

  const handleCreateClip = () => {
    const newClip: NleClip = {
      id: `text_${Date.now()}`,
      name: `✍️ ${text.slice(0, 18) || "ข้อความ"}`,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: Math.round(durationSec * 1000),
      sourceType: "text",
      text,
      fontFamily,
      fontSize,
      fontColor,
      backgroundColor,
      strokeColor,
      strokeWidth,
      shadowColor,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      animationEffect,
      transform: {
        x: posX,
        y: posY,
        scale: 1.0,
        opacity: 1.0,
      },
    };

    onAddTextClip(newClip);
    onClose();
  };

  return (
    <div className="nle-modal-overlay" onClick={onClose}>
      <div className="nle-modal-card text-overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nle-modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">✍️</span>
            <h3>เพิ่มข้อความบนจอ (Text & Title Hook)</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="nle-modal-body">
          {/* Live Preview Box */}
          <div className="text-preview-stage">
            <div className="text-preview-label">👁️ ตัวอย่างผลลัพธ์ (Live Preview):</div>
            <div className="text-preview-canvas">
              <div
                className={`preview-text-rendered anim-${animationEffect}`}
                style={{
                  fontFamily,
                  fontSize: `${Math.round(fontSize * 0.75)}px`,
                  color: fontColor,
                  backgroundColor: backgroundColor !== "transparent" ? backgroundColor : undefined,
                  WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
                  textShadow: shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0
                    ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}`
                    : undefined,
                  padding: backgroundColor !== "transparent" ? "6px 16px" : undefined,
                  borderRadius: backgroundColor !== "transparent" ? "12px" : undefined,
                }}
              >
                {text || "ตัวอย่างข้อความ"}
              </div>
            </div>
          </div>

          {/* Text Input */}
          <div className="modal-form-group">
            <label className="form-label">ข้อความที่ต้องการแสดง:</label>
            <textarea
              className="text-input-field"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="พิมพ์ข้อความ เช่น 'เทคนิคเด็ดที่คุณต้องรู้!'"
            />
          </div>

          {/* Presets Row */}
          <div className="modal-form-group">
            <label className="form-label">สไตล์ยอดนิยม (Presets):</label>
            <div className="text-presets-grid">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="preset-card-btn"
                  onClick={() => handleApplyPreset(p)}
                >
                  <span className="preset-card-name">{p.name}</span>
                  <span className="preset-card-desc">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Selection & Size */}
          <div className="modal-form-row">
            <div className="form-col">
              <label className="form-label">ฟอนต์ (Font Family):</label>
              <select
                className="font-select-field"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              >
                <optgroup label="🌐 Google Fonts (ไทย & สากลยอดนิยม)">
                  {GOOGLE_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="💻 ฟอนต์ในเครื่อง (System Fonts)">
                  {SYSTEM_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="form-col">
              <label className="form-label">ขนาดตัวอักษร: {fontSize}px</label>
              <input
                type="range"
                min={20}
                max={120}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="slider-range-input"
              />
            </div>
          </div>

          {/* Colors, Stroke & Shadow */}
          <div className="modal-form-row">
            <div className="form-col">
              <label className="form-label">สีตัวอักษร:</label>
              <div className="color-picker-row">
                <input
                  type="color"
                  value={fontColor}
                  onChange={(e) => setFontColor(e.target.value)}
                  className="color-box-input"
                />
                <span className="color-val-label">{fontColor}</span>
              </div>
            </div>
            <div className="form-col">
              <label className="form-label">สีพื้นหลังข้อความ:</label>
              <div className="color-picker-row">
                <button
                  type="button"
                  className={`bg-toggle-pill ${backgroundColor === "transparent" ? "active" : ""}`}
                  onClick={() => setBackgroundColor("transparent")}
                >
                  ไม่มี
                </button>
                <input
                  type="color"
                  value={backgroundColor === "transparent" ? "#0f172a" : backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="color-box-input"
                />
              </div>
            </div>
            <div className="form-col">
              <label className="form-label">ขอบตัวอักษร (Stroke): {strokeWidth}px</label>
              <div className="color-picker-row">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="color-box-input"
                />
                <input
                  type="range"
                  min={0}
                  max={8}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
                  className="slider-range-input"
                  style={{ width: "80px" }}
                />
              </div>
            </div>
          </div>

          {/* Shadow & Animation Effects */}
          <div className="modal-form-row">
            <div className="form-col">
              <label className="form-label">เอฟเฟกต์แอนิเมชัน (Animation):</label>
              <select
                className="font-select-field"
                value={animationEffect}
                onChange={(e) => setAnimationEffect(e.target.value as any)}
              >
                <option value="none">นิ่ง (Static)</option>
                <option value="fade">✨ ค่อยๆ ปรากฏ (Fade In)</option>
                <option value="pop">💥 เด้งขยายขึ้น (Pop Scale)</option>
                <option value="slide_up">⬆️ เลื่อนขึ้นจากล่าง (Slide Up)</option>
                <option value="typewriter">⌨️ พิมพ์ดีด (Typewriter)</option>
                <option value="glow_pulse">🌟 เรืองแสงกระพริบ (Glow Pulse)</option>
                <option value="bounce">🏀 ดึ๋งต่อเนื่อง (Bounce Loop)</option>
              </select>
            </div>
            <div className="form-col">
              <label className="form-label">ตำแหน่งข้อความ (Position):</label>
              <div className="pos-preset-group">
                <button
                  type="button"
                  className={`pos-chip ${positionPreset === "top" ? "active" : ""}`}
                  onClick={() => handlePositionPreset("top")}
                >
                  พาดหัวบน
                </button>
                <button
                  type="button"
                  className={`pos-chip ${positionPreset === "center" ? "active" : ""}`}
                  onClick={() => handlePositionPreset("center")}
                >
                  กึ่งกลาง
                </button>
                <button
                  type="button"
                  className={`pos-chip ${positionPreset === "lower_third" ? "active" : ""}`}
                  onClick={() => handlePositionPreset("lower_third")}
                >
                  แถบล่าง
                </button>
              </div>
            </div>
            <div className="form-col">
              <label className="form-label">ระยะเวลาแสดงผล: {durationSec.toFixed(1)} วินาที</label>
              <input
                type="range"
                min={1.0}
                max={15.0}
                step={0.5}
                value={durationSec}
                onChange={(e) => setDurationSec(parseFloat(e.target.value))}
                className="slider-range-input"
              />
            </div>
          </div>
        </div>

        <div className="nle-modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="modal-confirm-btn" onClick={handleCreateClip}>
            ➕ เพิ่มข้อความลงวิดีโอ (Track T1)
          </button>
        </div>
      </div>
    </div>
  );
}
