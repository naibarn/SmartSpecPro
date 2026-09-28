import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SmartSpecProjectDraft, NleClip } from "../../types/nleProject";
import { useWorkerLocale } from "../../app/workerContext";
import {
  buildVoiceClipMaps,
  buildVoiceGuidedVisualPlan,
  mapTranscriptToTimeline,
  type ImageAnalysis,
  type VoiceGuidedVisualPlan,
  type VoiceTranscriptSegment,
} from "./voiceGuidedVisualMatch";

type NativeAnalysis = ImageAnalysis & { assetFingerprint?: string };

export interface VoiceGuidedVisualMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SmartSpecProjectDraft;
  onApplyPlan: (plan: VoiceGuidedVisualPlan, mode: "original" | "reordered") => void;
  undoProject: SmartSpecProjectDraft | null;
  onUndo: () => void;
}

function imageClip(clip: NleClip): boolean {
  const path = (clip.sourcePath ?? clip.sourceUrl ?? "").split(/[?#]/, 1)[0].toLowerCase();
  return Boolean(clip.sourcePath) && /\.(png|jpe?g|webp|gif|bmp|avif)$/u.test(path) && !clip.text && !clip.isBlurOverlay;
}

function fingerprintForClip(clip: NleClip): string {
  return `${clip.id}|${clip.sourcePath ?? clip.sourceUrl ?? ""}|${clip.trimInMs ?? 0}|${clip.trimOutMs ?? 0}`.slice(0, 160);
}

function parseSegments(response: any): VoiceTranscriptSegment[] {
  const raw = Array.isArray(response?.transcript?.segments) ? response.transcript.segments : response?.segments;
  if (!Array.isArray(raw)) return [];
  return raw.map((segment: any) => ({
    text: typeof segment?.text === "string" ? segment.text.trim() : "",
    startMs: typeof segment?.startMs === "number" ? segment.startMs : Math.round(Number(segment?.start ?? 0) * 1000),
    endMs: typeof segment?.endMs === "number" ? segment.endMs : Math.round(Number(segment?.end ?? 0) * 1000),
    words: Array.isArray(segment?.words) ? segment.words.map((word: any) => ({
      text: typeof word?.text === "string" ? word.text : String(word?.word ?? ""),
      startMs: typeof word?.startMs === "number" ? word.startMs : Math.round(Number(word?.start ?? 0) * 1000),
      endMs: typeof word?.endMs === "number" ? word.endMs : Math.round(Number(word?.end ?? 0) * 1000),
    })).filter((word: any) => word.text.trim() && word.endMs > word.startMs) : undefined,
  })).filter((segment: VoiceTranscriptSegment) => segment.text && segment.endMs > segment.startMs);
}

export function VoiceGuidedVisualMatchModal({ isOpen, onClose, project, onApplyPlan, undoProject, onUndo }: VoiceGuidedVisualMatchModalProps) {
  const locale = useWorkerLocale();
  const t = (th: string, en: string) => locale === "th" ? th : en;
  const [status, setStatus] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<VoiceGuidedVisualPlan | null>(null);

  const voiceClips = useMemo(() => project.tracks.filter((track) => track.type === "audio_voice").flatMap((track) => track.clips).filter((clip) => clip.sourcePath), [project]);
  const visualClips = useMemo(() => project.tracks.filter((track) => track.type === "video_broll" || track.type === "video_main").flatMap((track) => track.clips).filter(imageClip), [project]);

  useEffect(() => {
    if (!isOpen) {
      setStatus("idle");
      setProgress(0);
      setError(null);
      setPlan(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const analyze = async () => {
    if (!voiceClips.length || !visualClips.length) {
      setError(t("ต้องมี track เสียงพูดและภาพอย่างน้อยหนึ่งภาพ", "Add a voice track and at least one local image slide first."));
      setStatus("error");
      return;
    }
    setStatus("working");
    setError(null);
    try {
      const mappedSegments: VoiceTranscriptSegment[] = [];
      for (const clip of voiceClips) {
        const response = await invoke<any>("worker_app_transcribe_audio", { videoPath: clip.sourcePath, language: "auto", wordTimestamps: true });
        mappedSegments.push(...mapTranscriptToTimeline(parseSegments(response), buildVoiceClipMaps({ id: clip.id, type: "audio_voice", name: clip.name, muted: false, locked: false, volume: 1, clips: [clip] })));
      }
      if (!mappedSegments.length) throw new Error(t("ไม่พบช่วงเสียงพูดที่มีเวลา", "HyperFrames returned no timed speech segments."));
      setProgress(35);
      const analyses: ImageAnalysis[] = [];
      for (let index = 0; index < visualClips.length; index += 1) {
        const clip = visualClips[index];
        const response = await invoke<NativeAnalysis>("worker_app_analyze_visual_match_image", { filePath: clip.sourcePath, assetFingerprint: fingerprintForClip(clip) });
        analyses.push({ ...response, assetId: clip.id, fingerprint: response.assetFingerprint ?? fingerprintForClip(clip) });
        setProgress(35 + Math.round(((index + 1) / visualClips.length) * 55));
      }
      setPlan(buildVoiceGuidedVisualPlan({
        transcript: mappedSegments,
        voiceMaps: [{ clipId: "mapped", sourceStartMs: 0, sourceEndMs: Math.max(project.canvas.durationMs, ...mappedSegments.map((segment) => segment.endMs)), timelineStartMs: 0, speed: 1 }],
        analyses,
        originalOrder: visualClips.map((clip) => clip.id),
        projectRevision: project.updatedAt,
      }));
      setProgress(100);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  };

  return (
    <div className="nle-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="project-settings-modal" role="dialog" aria-modal="true" aria-labelledby="voice-visual-match-title" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 920, width: "94%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <header className="project-settings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 id="voice-visual-match-title">🧠 {t("จับคู่ภาพตามเสียงพูด", "Voice-guided visual match")}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label={t("ปิด", "Close")}>×</button>
        </header>
        <div style={{ padding: 18, overflowY: "auto" }}>
          <p>{t("ระบบจะถอดเสียงด้วย HyperFrames วิเคราะห์ภาพด้วย skill และแสดงตัวอย่างก่อนแก้ Timeline", "HyperFrames transcribes the voice, a vision skill analyzes each image, and a preview is shown before the timeline changes.")}</p>
          <p style={{ opacity: 0.75 }}>{t(`พบเสียง ${voiceClips.length} คลิป และภาพ ${visualClips.length} คลิป`, `${voiceClips.length} voice clip(s), ${visualClips.length} image clip(s) found.`)}</p>
          {status === "working" && <p role="status">⏳ {t("กำลังวิเคราะห์", "Analyzing")}… {progress}%</p>}
          {error && <p role="alert" style={{ color: "#fca5a5" }}>⚠️ {error}</p>}
          {plan && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ padding: 10, border: "1px solid rgba(148,163,184,.25)", borderRadius: 8 }}>
                <strong>{plan.reorderEligible ? t("พบลำดับใหม่ที่ confidence สูง", "A high-confidence reorder was found") : t("คงลำดับภาพเดิมเพื่อความปลอดภัย", "Original order retained for safety")}</strong>
                <div style={{ marginTop: 8, fontSize: 13 }}>{plan.warnings.join(" · ")}</div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {plan.windows.map((window) => (
                  <article key={`${window.assetId}-${window.startMs}`} style={{ padding: 10, border: "1px solid rgba(148,163,184,.18)", borderRadius: 8 }}>
                    <div><strong>{window.assetId}</strong> · {(window.startMs / 1000).toFixed(1)}s–{(window.endMs / 1000).toFixed(1)}s · {Math.round(window.evidence.confidence * 100)}%</div>
                    <div style={{ opacity: 0.85 }}>{window.transcriptText}</div>
                    <small>{window.evidence.reasons.join(" · ")}</small>
                  </article>
                ))}
              </div>
              <div>{t("ลำดับเดิม", "Original order")}: {plan.originalOrder.join(" → ")}</div>
              <div>{t("ลำดับที่เสนอ", "Proposed order")}: {plan.proposedOrder.join(" → ")}</div>
            </div>
          )}
        </div>
        <footer style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 14, borderTop: "1px solid rgba(148,163,184,.15)" }}>
          <button type="button" className="nle-tool-btn" onClick={() => void analyze()} disabled={status === "working"}>{t("วิเคราะห์และสร้าง Preview", "Analyze and preview")}</button>
          {plan && <button type="button" className="nle-tool-btn" onClick={() => onApplyPlan(plan, "original")}>{t("ใช้เวลาโดยลำดับเดิม", "Apply original order timing")}</button>}
          {plan?.reorderEligible && <button type="button" className="nle-tool-btn highlight-btn" onClick={() => onApplyPlan(plan, "reordered")}>{t("ยืนยันลำดับใหม่", "Apply reordered plan")}</button>}
          {undoProject && <button type="button" className="nle-tool-btn" onClick={onUndo}>{t("Undo Visual Match", "Undo visual match")}</button>}
          <button type="button" className="nle-tool-btn" onClick={onClose}>{t("ยกเลิก", "Cancel")}</button>
        </footer>
      </section>
    </div>
  );
}
