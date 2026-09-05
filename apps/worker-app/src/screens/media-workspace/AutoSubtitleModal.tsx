import { useState, useEffect } from "react";
import type { NleClip, TextPresetStyle } from "../../types/nleProject";

export interface AutoSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoDurationMs: number;
  onApplySubtitles: (clips: NleClip[]) => void;
}

export function AutoSubtitleModal({
  isOpen,
  onClose,
  videoDurationMs,
  onApplySubtitles,
}: AutoSubtitleModalProps) {
  const [language, setLanguage] = useState<"th" | "en" | "auto">("th");
  const [stylePreset, setStylePreset] = useState<TextPresetStyle>("viral_word_highlight");
  const [isTranscribing] = useState(false);
  const [transcribeProgress] = useState(0);

  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isTranscribing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isTranscribing, onClose]);

  if (!isOpen) return null;

  const handleGenerateSubtitles = () => {
    setTranscribeError("การถอดเสียงใน editor นี้ยังไม่พร้อมใช้งาน กรุณาเพิ่มข้อความจริงด้วย Text Overlay");
  };

  return (
    <div className="media-intent-modal-backdrop" onClick={onClose}>
      <div className="media-intent-modal-card auto-subtitle-card" onClick={(e) => e.stopPropagation()}>
        <div className="media-intent-modal-header">
          <div className="modal-title-group">
            <span className="modal-title-icon">🎙️</span>
            <div>
              <h3>สร้าง Subtitle อัตโนมัติ (AI Transcribe)</h3>
              <p className="modal-subtitle">การถอดเสียงอัตโนมัติใน editor นี้ยังไม่พร้อมใช้งาน</p>
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose}>✕</button>
        </div>

        <div className="media-intent-modal-body">
          {transcribeError && (
            <div
              className="transcribe-error-banner"
              role="alert"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "0.8rem",
                marginBottom: "12px",
              }}
            >
              ⚠️ {transcribeError}
            </div>
          )}
          <div className="modal-grid-two">
            <div className="modal-field-block">
              <label className="field-label">ภาษาเสียงพูด (Spoken Language)</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as "th" | "en" | "auto")}>
                <option value="th">🇹🇭 ภาษาไทย (Thai)</option>
                <option value="en">🇺🇸 English</option>
                <option value="auto">🌐 ตรวจจับอัตโนมัติ (Auto-Detect)</option>
              </select>
            </div>

            <div className="modal-field-block">
              <label className="field-label">รูปแบบตัวอักษรยอดนิยม (Preset)</label>
              <select value={stylePreset} onChange={(e) => setStylePreset(e.target.value as TextPresetStyle)}>
                <option value="viral_word_highlight">⚡ Viral Word Highlight (TikTok/Hormozi)</option>
                <option value="impact_top_hook">🔥 Impact Top Hook (ตัวหนาสีเหลืองด้านบน)</option>
                <option value="cinematic_lower_third">🎬 Cinematic Minimal (ขอบเงาสไตล์หนัง)</option>
                <option value="neon_cyber_badge">💎 Neon Glow Badge (กล่องนีออน)</option>
                <option value="call_to_action_pill">🚀 Call-To-Action (ปุ่มกระตุ้นติดตาม)</option>
              </select>
            </div>
          </div>

          <div className="subtitle-preview-box">
            <span className="preview-label">ตัวอย่างการแสดงผลบนจอ 9:16:</span>
            <div className={`mock-subtitle-screen preset-${stylePreset}`}>
              {stylePreset === "viral_word_highlight" && (
                <div className="mock-caption">
                  <span className="word-dim">เคล็ดลับ </span>
                  <span className="word-glow">อันดับหนึ่ง </span>
                  <span className="word-dim">ที่ทุกคนต้องรู้!</span>
                </div>
              )}
              {stylePreset === "impact_top_hook" && (
                <div className="mock-hook">🔥 วิธีเพิ่มยอดวิว 10X ใน 3 วัน!</div>
              )}
              {stylePreset === "cinematic_lower_third" && (
                <div className="mock-cinema">สัมภาษณ์พิเศษ · คุณดรีม</div>
              )}
              {stylePreset === "neon_cyber_badge" && (
                <div className="mock-neon">PROMOTION 50% OFF</div>
              )}
              {stylePreset === "call_to_action_pill" && (
                <div className="mock-cta">👉 สั่งซื้อที่ตะกร้าด้านล่าง</div>
              )}
            </div>
          </div>

          {isTranscribing && (
            <div className="transcribe-progress-block">
              <div className="progress-info">
                <span>กำลังถอดเสียงด้วย Whisper AI...</span>
                <strong>{transcribeProgress}%</strong>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${transcribeProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="media-intent-modal-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isTranscribing}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleGenerateSubtitles()}
            disabled={isTranscribing}
          >
            {isTranscribing ? "⏳ กำลังประมวลผล..." : "✨ ถอดเสียงและวางลง Timeline"}
          </button>
        </div>
      </div>
    </div>
  );
}
