import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import type { DirectoryEntry } from "./MediaExplorerView";
import type { NleClip, TextPresetStyle } from "../../types/nleProject";
import { generateSrt, generateVtt, generateAss, type SubtitleSegmentItem } from "./subtitleFormatters";
import { useWorkerLocale } from "../../app/workerContext";

type SubtitleEngine = "whisper.cpp" | "faster-whisper" | "vibevoice-asr" | "cloud";
type CapabilityState = "checking" | "ready" | "unavailable";
type RawSubtitleWord = { word?: string; text?: string; startMs?: number; endMs?: number; start?: number; end?: number };
type RawSubtitleSegment = { id?: number | string; cueId?: string; speakerId?: string | null; start?: number; end?: number; startMs?: number; endMs?: number; text?: string; words?: RawSubtitleWord[] };

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
  videoDurationMs,
  sourceVideoFile,
  onApplySubtitles,
}: AutoSubtitleModalProps) {
  const locale = useWorkerLocale();
  const t = (th: string, en: string) => locale === "th" ? th : en;
  const [language, setLanguage] = useState<"th" | "en" | "auto">("th");
  const [engine, setEngine] = useState<SubtitleEngine>("whisper.cpp");
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [diarization, setDiarization] = useState(false);
  const [engineCapabilities, setEngineCapabilities] = useState<Record<SubtitleEngine, CapabilityState>>({
    "whisper.cpp": "checking",
    "faster-whisper": "checking",
    "vibevoice-asr": "checking",
    cloud: "checking",
  });
  const [stylePreset, setStylePreset] = useState<TextPresetStyle>("viral_word_highlight");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Store last generated subtitle segments for exporting
  const [generatedSegments, setGeneratedSegments] = useState<SubtitleSegmentItem[]>([]);
  const [pendingSubtitleClips, setPendingSubtitleClips] = useState<NleClip[]>([]);
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

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void Promise.resolve().then(() => invoke<Array<{ engine?: string; status?: string }>>("worker_app_transcription_capabilities"))
      .then((items) => {
        if (!active || !Array.isArray(items)) return;
        setEngineCapabilities(() => {
          const next = {
            "whisper.cpp": "unavailable" as CapabilityState,
            "faster-whisper": "unavailable" as CapabilityState,
            "vibevoice-asr": "unavailable" as CapabilityState,
            cloud: "unavailable" as CapabilityState,
          };
          for (const item of items) {
            // Older runtime manifests called the bundled HyperFrames profile
            // `hyperframes-whisper.cpp`; keep that alias mapped to the same
            // real local engine and never fabricate readiness.
            const normalizedEngine = item.engine === "hyperframes-whisper.cpp" || item.engine === "hyperframes"
              ? "whisper.cpp"
              : item.engine;
            if (normalizedEngine === "whisper.cpp" || normalizedEngine === "faster-whisper" || normalizedEngine === "vibevoice-asr" || normalizedEngine === "cloud") {
              next[normalizedEngine] = item.status === "ready" || item.status === "available" || item.status === "ok" ? "ready" : "unavailable";
            }
          }
          return next;
        });
      })
      .catch(() => {
        if (active) setEngineCapabilities({ "whisper.cpp": "unavailable", "faster-whisper": "unavailable", "vibevoice-asr": "unavailable", cloud: "unavailable" });
      });
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    // Never carry reviewed subtitles across a close or a different source
    // video; applying them to a new media item would violate source lineage.
    if (!isOpen) {
      setGeneratedSegments([]);
      setPendingSubtitleClips([]);
      setTranscribeError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setGeneratedSegments([]);
    setPendingSubtitleClips([]);
    setTranscribeError(null);
  }, [sourceVideoFile?.path]);

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
      const request: Record<string, unknown> = {
        videoPath: sourceVideoFile.path,
        language,
      };
      // Keep the legacy payload byte-for-byte compatible when the default
      // profile is selected. Optional capabilities are explicit at the wire.
      if (engine !== "whisper.cpp") request.engine = engine;
      if (wordTimestamps) request.wordTimestamps = true;
      if (diarization) request.diarization = true;
      const res = await invoke<{
        transcript?: { segments?: RawSubtitleSegment[] };
        text?: string;
        segments?: RawSubtitleSegment[];
        words?: RawSubtitleWord[];
      }>("worker_app_transcribe_audio", request);

      setTranscribeProgress(85);

      const rawSegments: RawSubtitleSegment[] = Array.isArray(res?.transcript?.segments)
        ? [...res.transcript.segments]
        : (Array.isArray(res?.segments) ? [...res.segments] : []);
      if (rawSegments.length === 0 && Array.isArray(res?.words) && res.words.length > 0) {
        const timedWords = res.words
          .map((word) => ({
            word: typeof word.word === "string" ? word.word : (typeof word.text === "string" ? word.text : ""),
            startMs: typeof word.startMs === "number" ? word.startMs : (typeof word.start === "number" ? Math.round(word.start * 1000) : -1),
            endMs: typeof word.endMs === "number" ? word.endMs : (typeof word.end === "number" ? Math.round(word.end * 1000) : -1),
          }))
          .filter((word) => word.word.trim() && word.endMs > word.startMs);
        if (timedWords.length > 0) {
          rawSegments.push({
            startMs: timedWords[0].startMs,
            endMs: timedWords[timedWords.length - 1].endMs,
            text: typeof res.text === "string" ? res.text : timedWords.map((word) => word.word).join(" "),
            words: timedWords,
          });
        }
      }

      if (rawSegments.length === 0) {
        throw new Error("ไม่พบเสียงพูดที่มี timestamp จริงในวิดีโอ");
      }

      const parsedSegments: SubtitleSegmentItem[] = rawSegments.map((s, idx) => {
        const startMs = typeof s.startMs === "number" ? s.startMs : (typeof s.start === "number" ? Math.round(s.start * 1000) : -1);
        const endMs = typeof s.endMs === "number" ? s.endMs : (typeof s.end === "number" ? Math.round(s.end * 1000) : -1);
        if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs) throw new Error("ผลลัพธ์ไม่มีช่วงเวลาเสียงที่ตรวจสอบได้");
        if (videoDurationMs > 0 && endMs > videoDurationMs) throw new Error("timestamp เกินความยาววิดีโอ");
        const words = (Array.isArray(s.words) ? s.words : []).map((w) => ({
          word: typeof w.word === "string" ? w.word : (typeof w.text === "string" ? w.text : ""),
          startMs: typeof w.startMs === "number" ? w.startMs : (typeof w.start === "number" ? Math.round(w.start * 1000) : -1),
          endMs: typeof w.endMs === "number" ? w.endMs : (typeof w.end === "number" ? Math.round(w.end * 1000) : -1),
        })).filter((w) => w.word.trim()
          && Number.isSafeInteger(w.startMs)
          && Number.isSafeInteger(w.endMs)
          && w.startMs >= startMs
          && w.endMs > w.startMs
          && w.endMs <= endMs
          && (videoDurationMs <= 0 || w.endMs <= videoDurationMs));

        const segmentText = (typeof s.text === "string" ? s.text : "").trim() || words.map((word) => word.word).join(" ");
        if (!segmentText.trim()) throw new Error("ผลลัพธ์มี cue ว่างที่ตรวจสอบไม่ได้");
        return {
          id: s.id ?? s.cueId ?? idx,
          startMs,
          endMs,
          text: segmentText,
          speakerId: typeof s.speakerId === "string" ? s.speakerId : null,
          words,
        };
      });

      setGeneratedSegments(parsedSegments);

      // Convert parsed segments to Timeline NLE Clips for track_captions
      const subtitleClips: NleClip[] = parsedSegments.map((seg, idx) => ({
        id: `clip_caption_${Date.now()}_${idx}`,
        name: `Subtitle #${idx + 1}`,
        timelineStartMs: seg.startMs,
        durationMs: seg.endMs - seg.startMs,
        sourceType: "text",
        text: seg.text,
        speakerId: seg.speakerId,
        stylePreset,
        fontSize: 42,
        fontColor: "#ffffff",
        fontFamily: "Prompt",
        textAlign: "center",
        animationEffect: stylePreset === "viral_word_highlight" ? "pop" : "fade",
        words: seg.words,
      }));

      setTranscribeProgress(100);
      setPendingSubtitleClips(subtitleClips);
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

  const handleApplySubtitles = () => {
    if (pendingSubtitleClips.length === 0) return;
    onApplySubtitles(pendingSubtitleClips);
    setPendingSubtitleClips([]);
  };

  return (
    <div className="media-intent-modal-backdrop" onClick={onClose}>
      <div className="media-intent-modal-card auto-subtitle-card" onClick={(e) => e.stopPropagation()}>
        <div className="media-intent-modal-header">
          <div className="modal-title-group">
            <span className="modal-title-icon">🎙️</span>
            <div>
              <h3>{t("สร้าง Subtitle อัตโนมัติ (AI Whisper Transcribe)", "Create subtitles automatically (AI Whisper Transcribe)")}</h3>
              <p className="modal-subtitle">{t("เลือก engine ที่ติดตั้งจริง แล้วตรวจสอบผลก่อนวางลง Timeline", "Choose an installed engine and review the result before placing it on the timeline")}</p>
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
              <label className="field-label" htmlFor="subtitle-engine">{t("เครื่องมือถอดเสียง (ASR engine)", "Speech recognition engine (ASR)")}</label>
              <select id="subtitle-engine" value={engine} onChange={(e) => setEngine(e.target.value as SubtitleEngine)} disabled={isTranscribing}>
                <option value="whisper.cpp" disabled={engineCapabilities["whisper.cpp"] === "unavailable"}>HyperFrames · Whisper.cpp · {engineCapabilities["whisper.cpp"] === "ready" ? "พร้อมใช้ (local)" : engineCapabilities["whisper.cpp"] === "checking" ? "กำลังตรวจสอบ runtime" : "runtime ไม่พร้อมใช้"}</option>
                <option value="faster-whisper" disabled={engineCapabilities["faster-whisper"] !== "ready"}>Faster-Whisper + WhisperX · {engineCapabilities["faster-whisper"] === "ready" ? "พร้อมใช้" : "ยังไม่ติดตั้ง runtime"}</option>
                <option value="vibevoice-asr" disabled={engineCapabilities["vibevoice-asr"] !== "ready"}>VibeVoice-ASR · {engineCapabilities["vibevoice-asr"] === "ready" ? "พร้อมใช้" : "รอ GPU/runtime gate"}</option>
                <option value="cloud" disabled={engineCapabilities.cloud !== "ready"}>Cloud API · {engineCapabilities.cloud === "ready" ? "พร้อมใช้" : "รอ provider/สิทธิ์อัปโหลด"}</option>
              </select>
              <small className="field-hint">ระบบจะไม่ดาวน์โหลดโมเดลหรือสลับไป engine อื่นโดยอัตโนมัติ</small>
            </div>
            <div className="modal-field-block">
              <label className="field-label">{t("ภาษาเสียงพูด (Spoken Language)", "Spoken language")}</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as "th" | "en" | "auto")}>
                <option value="th">🇹🇭 ภาษาไทย (Thai)</option>
                <option value="en">🇺🇸 English</option>
                <option value="auto">🌐 ตรวจจับอัตโนมัติ (Auto-Detect)</option>
              </select>
            </div>

            <div className="modal-field-block">
              <label className="field-label">{t("รูปแบบตัวอักษรยอดนิยม (Preset)", "Text style preset")}</label>
              <select value={stylePreset} onChange={(e) => setStylePreset(e.target.value as TextPresetStyle)}>
                <option value="viral_word_highlight">⚡ Viral Word Highlight (TikTok/Hormozi)</option>
                <option value="impact_top_hook">🔥 Impact Top Hook (ตัวหนาสีเหลืองด้านบน)</option>
                <option value="cinematic_lower_third">🎬 Cinematic Minimal (ขอบเงาสไตล์หนัง)</option>
                <option value="neon_cyber_badge">💎 Neon Glow Badge (กล่องนีออน)</option>
                <option value="call_to_action_pill">🚀 Call-To-Action (ปุ่มกระตุ้นติดตาม)</option>
              </select>
            </div>
          </div>

          <div className="modal-grid-two" style={{ marginTop: "10px" }}>
            <label className="modal-checkbox-row">
              <input type="checkbox" checked={wordTimestamps} onChange={(e) => setWordTimestamps(e.target.checked)} disabled={isTranscribing} />
              <span>เก็บ word-level timestamps (ต้องมีหลักฐานจาก engine)</span>
            </label>
            <label className="modal-checkbox-row">
              <input type="checkbox" checked={diarization} onChange={(e) => setDiarization(e.target.checked)} disabled={isTranscribing} />
              <span>แยกผู้พูด (diarization)</span>
            </label>
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
                ✅ ตรวจผลแล้ว ({generatedSegments.length} ประโยค) {pendingSubtitleClips.length > 0 ? "· กด Apply เพื่อวางลง Timeline · " : "· "}ส่งออกไฟล์ Subtitle:
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
            {t("ยกเลิก", "Cancel")}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleGenerateSubtitles()}
            disabled={isTranscribing || engineCapabilities[engine] === "unavailable"}
          >
            {isTranscribing ? "⏳ กำลังถอดเสียง..." : "✨ ถอดเสียงและตรวจผล"}
          </button>
          {pendingSubtitleClips.length > 0 && (
            <button type="button" className="primary-button" onClick={handleApplySubtitles} disabled={isTranscribing}>
              ✅ Apply ลง Timeline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
