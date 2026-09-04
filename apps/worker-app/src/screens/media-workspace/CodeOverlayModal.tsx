import { useState } from "react";
import { buildOverlayDocument } from "./overlayDocument";
import type { NleClip } from "../../types/nleProject";

export interface CodeOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimeMs: number;
  onAddCodeOverlay: (clip: NleClip) => void;
}

export function CodeOverlayModal({
  isOpen,
  onClose,
  currentTimeMs,
  onAddCodeOverlay,
}: CodeOverlayModalProps) {
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState<"react_css" | "three_js">("react_css");
  const [componentCode, setComponentCode] = useState(
    `<div class="hologram-card">\n  <span class="holo-tag">EXCLUSIVE</span>\n  <h3>โปรโมชั่นพิเศษ 50%</h3>\n  <p>สั่งซื้อเลยวันนี้</p>\n</div>`,
  );
  const [customCss, setCustomCss] = useState(
    `.hologram-card {\n  background: rgba(15, 23, 42, 0.85);\n  border: 2px solid #38bdf8;\n  box-shadow: 0 0 20px rgba(56, 189, 248, 0.6);\n  padding: 16px;\n  border-radius: 12px;\n  color: #fff;\n  text-align: center;\n  animation: floatCard 3s ease-in-out infinite;\n}\n@keyframes floatCard {\n  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-8px); }\n}`,
  );
  const [durationSec, setDurationSec] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handlePromptGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);

    await new Promise((r) => setTimeout(r, 700));

    if (prompt.includes("3d") || prompt.includes("เหรียญ") || prompt.includes("coin") || prompt.includes("three")) {
      setEngine("three_js");
      setComponentCode("/* Three.js WebGL Real-time 3D Golden Coin Spinning */");
    } else {
      setEngine("react_css");
      setComponentCode(
        `<div class="neon-ai-badge">\n  <div class="glow-orb"></div>\n  <span class="neon-text">${prompt}</span>\n</div>`,
      );
      setCustomCss(
        `.neon-ai-badge {\n  background: linear-gradient(135deg, rgba(2,132,199,0.8), rgba(15,118,110,0.8));\n  border: 1px solid #38bdf8;\n  border-radius: 999px;\n  padding: 10px 24px;\n  box-shadow: 0 0 25px rgba(56,189,248,0.7);\n  color: #fff;\n  font-weight: bold;\n  font-size: 1.2rem;\n  animation: pulseNeon 2s infinite;\n}\n@keyframes pulseNeon {\n  0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.05); }\n}`,
      );
    }

    setIsGenerating(false);
  };

  const handleSaveOverlay = () => {
    if (!Number.isFinite(durationSec) || durationSec < 1 || durationSec > 60) return;
    const newClip: NleClip = {
      id: `code_overlay_${Date.now()}`,
      name: prompt.trim() || (engine === "three_js" ? "3D WebGL Overlay" : "React/CSS Overlay"),
      timelineStartMs: currentTimeMs,
      durationMs: durationSec * 1000,
      sourceType: "generated_code",
      codeEngine: engine,
      prompt,
      componentCode,
      customCss,
      transform: {
        x: 0.5,
        y: 0.75,
        scale: 1.0,
        opacity: 1.0,
      },
    };

    onAddCodeOverlay(newClip);
    onClose();
  };

  return (
    <div className="media-intent-modal-backdrop" onClick={onClose}>
      <div className="media-intent-modal-card code-overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="media-intent-modal-header">
          <div className="modal-title-group">
            <span className="modal-title-icon">🎨</span>
            <div>
              <h3>สั่งสร้าง React / CSS / Three.js Overlay</h3>
              <p className="modal-subtitle">สร้างจากเทมเพลตบนเครื่อง หรือแก้ HTML / CSS เพื่อดูตัวอย่างแบบแยก sandbox</p>
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose}>✕</button>
        </div>

        <div className="media-intent-modal-body">
          <div className="modal-field-block">
            <label className="field-label">สั่ง AI สร้าง Overlay ด้วย Prompt (ภาษาไทย หรือ อังกฤษ)</label>
            <div className="button-row">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="เช่น 'ทำ 3D Floating Coin หมุนรอบตัวเอง' หรือ 'ป้ายเตือน Sale 50% แสงนีออน'"
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => void handlePromptGenerate()}
                disabled={isGenerating || !prompt.trim()}
              >
                {isGenerating ? "⏳ กำลังสร้าง..." : "⚡ ใช้เทมเพลต"}
              </button>
            </div>
          </div>

          <div className="modal-grid-two">
            <div className="modal-field-block">
              <label className="field-label">Engine</label>
              <select value={engine} onChange={(e) => setEngine(e.target.value as "react_css" | "three_js")}>
                <option value="react_css">HTML + CSS Animation (ไม่รัน JavaScript)</option>
                <option value="three_js">ตัวอย่างไอคอนเหรียญหมุน</option>
              </select>
            </div>

            <div className="modal-field-block">
              <label className="field-label">ความยาวการแสดงผล (วินาที)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
              />
            </div>
          </div>

          {engine === "react_css" && (
            <div className="code-editor-split">
              <div className="modal-field-block">
                <label className="field-label">HTML Markup</label>
                <textarea
                  className="code-textarea"
                  rows={4}
                  value={componentCode}
                  onChange={(e) => setComponentCode(e.target.value)}
                />
              </div>
              <div className="modal-field-block">
                <label className="field-label">Custom CSS Animation</label>
                <textarea
                  className="code-textarea"
                  rows={4}
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="code-live-preview-box">
            <span className="preview-label">Live Preview ทันที:</span>
            <div className="preview-stage">
              {engine === "three_js" ? (
                <div className="mock-3d-coin-preview">
                  <div className="coin-disc">★</div>
                  <span>ตัวอย่างไอคอนเหรียญหมุน</span>
                </div>
              ) : (
                <iframe title="HTML / CSS preview" sandbox="" referrerPolicy="no-referrer" srcDoc={buildOverlayDocument(componentCode, customCss)} />
              )}
            </div>
          </div>
        </div>

        <div className="media-intent-modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="primary-button" onClick={handleSaveOverlay}>
            💾 เพิ่มลง Track O1 บน Timeline
          </button>
        </div>
      </div>
    </div>
  );
}
