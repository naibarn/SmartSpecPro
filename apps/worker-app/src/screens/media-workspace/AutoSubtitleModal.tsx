import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import type { DirectoryEntry } from "./MediaExplorerView";
import type { NleClip, TextPresetStyle } from "../../types/nleProject";
import { generateSrt, generateVtt, generateAss, type SubtitleSegmentItem } from "./subtitleFormatters";

export interface AutoSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoDurationMs: number;
  sourceVideoFile?: DirectoryEntry | null;
  onApplySubtitles: (clips: NleClip[]) => void;
}

export function AutoSubtitleModal({
  isOpen,
  onClose,
  videoDurationMs: _videoDurationMs,
  sourceVideoFile,
  onApplySubtitles,
}: AutoSubtitleModalProps) {
  const [language, setLanguage] = useState<"th" | "en" | "auto">("th");
  const [stylePreset, setStylePreset] = useState<TextPresetStyle>("viral_word_highlight");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Store last generated subtitle segments for exporting
  const [generatedSegments, setGeneratedSegments] = useState<SubtitleSegmentItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleGenerateSubtitles = async () => {
    if (!sourceVideoFile?.path) {
      setTranscribeError("ระบบถอดเสียง AI ยังไม่พร้อมใช้งาน หรือกรุณาเปิดไฟล์วิดีโอ MP4 ก่อน");
      return;
    }

    setTranscribeError(null);
    setIsTranscribing(true);
    setTranscribeProgress(15);

    try {
      setTranscribeProgress(35);
      const res = await invoke<{
        text?: string;
        segments?: Array<{
          id?: number;
          start?: number;
          end?: number;
          startMs?: number;
          endMs?: number;
          text?: string;
          words?: Array<{ word: string; startMs?: number; endMs?: number; start?: number; end?: number }>;
        }>;
      }>("worker_app_transcribe_audio", {
        videoPath: sourceVideoFile.path,
        language,
        model: "small",
      });

      setTranscribeProgress(85);

      const rawSegments = res?.segments || [];
      if (rawSegments.length === 0 && res?.text) {
        rawSegments.push({
          startMs: 0,
          endMs: 5000,
          text: res.text,
        });
      }

      if (rawSegments.length === 0) {
        throw new Error("ไม่พบเสียงพูดในวิดีโอ หรือ AI ไม่สามารถถอดประโยคได้");
      }

      const parsedSegments: SubtitleSegmentItem[] = rawSegments.map((s, idx) => {
        const startMs = typeof s.startMs === "number" ? s.startMs : Math.round((s.start || 0) * 1000);
        const endMs = typeof s.endMs === "number" ? s.endMs : Math.round((s.end || (startMs / 1000 + 3)) * 1000);
        const words = (s.words || []).map((w) => ({
          word: w.word,
          startMs: typeof w.startMs === "number" ? w.startMs : Math.round((w.start || 0) * 1000),
          endMs: typeof w.endMs === "number" ? w.endMs : Math.round((w.end || 0) * 1000),
        }));

        return {
          id: s.id ?? idx,
          startMs,
          endMs,
          text: s.text || "",
          words,
        };
      });

      setGeneratedSegments(parsedSegments);

      // Convert parsed segments to Timeline NLE Clips for track_captions
      const subtitleClips: NleClip[] = parsedSegments.map((seg, idx) => ({
        id: `clip_caption_${Date.now()}_${idx}`,
        name: `Subtitle #${idx + 1}`,
        timelineStartMs: seg.startMs,
        durationMs: Math.max(800, seg.endMs - seg.startMs),
        sourceType: "text",
        text: seg.text,
        stylePreset,
        fontSize: 42,
        fontColor: "#ffffff",
        fontFamily: "Prompt",
        textAlign: "center",
        animationEffect: stylePreset === "viral_word_highlight" ? "pop" : "fade",
        words: seg.words,
      }));

      setTranscribeProgress(100);
      onApplySubtitles(subtitleClips);
    } catch (err) {
      console.warn("AI Transcribe error:", err);
      setTranscribeError(`การถอดเสียงล้มเหลว: ${String(err)}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleExportSubtitleFile = async (format: "srt" | "vtt" | "ass") => {
    if (generatedSegments.length === 0) {
      setTranscribeError("กรุณากดถอดเสียง Subtitle ก่อนส่งออกไฟล์");
      return;
    }

    setIsExporting(true);
    try {
      let content = "";
      let defaultName = `${sourceVideoFile?.name.replace(/\.[^/.]+$/, "") || "subtitle"}`;

      if (format === "srt") {
        content = generateSrt(generatedSegments);
        defaultName += ".srt";
      } else if (format === "vtt") {
        content = generateVtt(generatedSegments);
        defaultName += ".vtt";
      } else {
        content = generateAss(generatedSegments, { stylePreset });
        defaultName += ".ass";
      }

      const savePath = await saveFileDialog({
        defaultPath: defaultName,
        filters: [
          {
            name: format === "srt" ? "SubRip Subtitle (.srt)" : format === "vtt" ? "WebVTT (.vtt)" : "Advanced SubStation Alpha (.ass)",
            extensions: [format],
          },
        ],
      });

      if (savePath) {
        await invoke("worker_app_save_nle_project", {
          projectPath: savePath,
          content,
        });
      }
    } catch (err) {
      setTranscribeError(`ส่งออกไฟล์ Subtitle ไม่สำเร็จ: ${String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="media-intent-modal-backdrop" onClick={onClose}>
      <div className="media-intent-modal-card auto-subtitle-card" onClick={(e) => e.stopPropagation()}>
        <div className="media-intent-modal-header">
          <div className="modal-title-group">
            <span className="modal-title-icon">🎙️</span>
            <div>
              <h3>สร้าง Subtitle อัตโนมัติ (AI Whisper Transcribe)</h3>
              <p className="modal-subtitle">ถอดเสียงจากวิดีโอจริงอัตโนมัติด้วย AI Whisper โมเดลความแม่นยำสูง</p>
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} disabled={isTranscribing}>✕</button>
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

          {/* Subtitle File Export Toolbar */}
          {generatedSegments.length > 0 && (
            <div
              className="export-subtitles-bar"
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                padding: "10px 14px",
                borderRadius: "8px",
                marginTop: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "#34d399", fontWeight: 700 }}>
                ✅ ถอดเสียงสำเร็จ ({generatedSegments.length} ประโยค) · ส่งออกไฟล์ Subtitle:
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => void handleExportSubtitleFile("srt")}
                  disabled={isExporting}
                  style={{
                    background: "#1e293b",
                    color: "#38bdf8",
                    border: "1px solid #38bdf8",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="ส่งออกไฟล์ Subtitle นำไปใช้ใน CapCut / Premiere / YouTube (.srt)"
                >
                  📄 SRT (.srt)
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportSubtitleFile("vtt")}
                  disabled={isExporting}
                  style={{
                    background: "#1e293b",
                    color: "#38bdf8",
                    border: "1px solid #38bdf8",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="ส่งออกไฟล์ Subtitle นำไปใช้บนเว็บ HTML5 / HLS (.vtt)"
                >
                  🌐 WebVTT (.vtt)
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportSubtitleFile("ass")}
                  disabled={isExporting}
                  style={{
                    background: "#1e293b",
                    color: "#f59e0b",
                    border: "1px solid #f59e0b",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="ส่งออกไฟล์ Subtitle นำไปใช้กับ FFmpeg Hardsub / Aegisub (.ass)"
                >
                  🎨 ASS (.ass)
                </button>
              </div>
            </div>
          )}

          {isTranscribing && (
            <div className="transcribe-progress-block" style={{ marginTop: "14px" }}>
              <div className="progress-info">
                <span>⏳ กำลังถอดเสียงด้วย AI Whisper ในเครื่อง...</span>
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
            {isTranscribing ? "⏳ กำลังถอดเสียง..." : "✨ ถอดเสียงและวางลง Timeline"}
          </button>
        </div>
      </div>
    </div>
  );
}
