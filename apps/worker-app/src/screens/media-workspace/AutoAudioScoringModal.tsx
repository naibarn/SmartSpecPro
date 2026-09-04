import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SmartSpecProjectDraft } from "../../types/nleProject";
import type { DramaGenre, AudioQCReport, EpisodeSoundPlan } from "../../types/audioScoring";
import { extractDramaticBeats, type ScriptShotInput } from "../../services/audioScoring/dramaticBeatExtractor";
import { segmentEpisodeSoundPlan } from "../../services/audioScoring/cueSegmenter";
import { extractSfxEvents } from "../../services/audioScoring/sfxExtractor";
import { resolveMusicCueAudio } from "../../services/audioScoring/audioProviderRouter";
import { applySoundPlanToProjectTimeline } from "../../services/audioScoring/audioPlacementEngine";
import { runAudioQualityControl, autoRemixForQcCompliance } from "../../services/audioScoring/audioQcEngine";

export interface AutoAudioScoringModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SmartSpecProjectDraft;
  onApplyScoredProject: (updated: SmartSpecProjectDraft) => void;
}

export function AutoAudioScoringModal({
  isOpen,
  onClose,
  project,
  onApplyScoredProject,
}: AutoAudioScoringModalProps) {
  const [genre, setGenre] = useState<DramaGenre>("romance_ceo");
  const [runtimeStatus, setRuntimeStatus] = useState<string>("กำลังตรวจสอบ MiniMax Runtime...");
  const [isRuntimeReady, setIsRuntimeReady] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [progressStep, setProgressStep] = useState<string>("");
  const [soundPlan, setSoundPlan] = useState<EpisodeSoundPlan | null>(null);
  const [qcReport, setQcReport] = useState<AudioQCReport | null>(null);
  const [scoredProject, setScoredProject] = useState<SmartSpecProjectDraft | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Probe MiniMax 3 Sidecar status via Tauri IPC
    invoke<{ ready: boolean; device: string; message: string }>("worker_app_get_audio_runtime_status")
      .then((res) => {
        setIsRuntimeReady(res.ready);
        setRuntimeStatus(res.ready ? `● Online (${res.device})` : `Standby (${res.message})`);
      })
      .catch((err) => {
        setRuntimeStatus(`Local Fallback Mode (${String(err)})`);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunAutoScoring = async () => {
    setIsScoring(true);
    setProgressStep("วิเคราะห์อารมณ์และจังหวะของเนื้อเรื่อง (Dramatic Beat Extraction)...");

    try {
      // 1. Build script shots from main video track clips
      const v1Track = project.tracks.find((t) => t.id === "track_v1");
      const durationMs = project.canvas.durationMs || 60000;

      const scriptShots: ScriptShotInput[] = (v1Track?.clips && v1Track.clips.length > 0)
        ? v1Track.clips.map((clip, idx) => ({
            shotIndex: idx + 1,
            description: clip.name,
            durationSeconds: clip.durationMs / 1000,
          }))
        : [
            { shotIndex: 1, description: "เปิดฉาก แนะนำตัวละคร", durationSeconds: durationMs / 3000 },
            { shotIndex: 2, description: "ความขัดแย้งและจุดเปลี่ยนระทึกขวัญ", durationSeconds: durationMs / 3000 },
            { shotIndex: 3, description: "จุดคลี่คลายและ Cliffhanger", durationSeconds: durationMs / 3000 },
          ];

      // 2. Extract Emotion Vectors & Segmentation
      const shotIntents = extractDramaticBeats(scriptShots, genre);
      setProgressStep("จัดกลุ่ม Music Cues และออกแบบ Sound Plan แบบภาพยนตร์...");
      await new Promise((r) => setTimeout(r, 400));

      const plan = segmentEpisodeSoundPlan({
        episodeId: project.projectId,
        seriesId: "series_vertical_drama",
        totalDurationMs: durationMs,
        shotIntents,
        genre,
      });
      setSoundPlan(plan);

      // 3. Extract SFX Events
      const sfxEvents = extractSfxEvents(scriptShots);

      // 4. Resolve Music Cues via MiniMax Music 3 Sidecar
      setProgressStep(`กำลังสร้างเพลงประกอบ MiniMax Music 3 (${plan.cues.length} Cues)...`);
      const generatedCues: Array<{ cueId: string; audioPath: string; durationSeconds: number }> = [];

      for (let i = 0; i < plan.cues.length; i++) {
        const cue = plan.cues[i];
        setProgressStep(`กำลัง Generate Music Cue #${i + 1}/${plan.cues.length} (${cue.placement})...`);
        const resolved = await resolveMusicCueAudio(cue, project.mediaPool);
        generatedCues.push({
          cueId: cue.cueId,
          audioPath: resolved.audioPath,
          durationSeconds: resolved.durationSeconds,
        });
      }

      // 5. Automatic Timecode Placement to Timeline Tracks (A2 & A3)
      setProgressStep("จัดวางคลิปเสียงลงบน Timeline (A2 BGM + Auto Ducking & A3 SFX)...");
      const mappedProject = applySoundPlanToProjectTimeline({
        project,
        soundPlan: plan,
        generatedCues,
        sfxEvents,
      });

      // 6. Audio QC & EBU R128 Loudness Verification
      setProgressStep("ตรวจวัดคุณภาพเสียงและมาตรฐาน EBU R128 (-16 LUFS)...");
      const qc = runAudioQualityControl(mappedProject);
      setQcReport(qc);

      // If QC issues, apply safe auto-remix
      const finalProject = qc.passed ? mappedProject : autoRemixForQcCompliance(mappedProject);
      setScoredProject(finalProject);
      setProgressStep("✅ การสร้างดนตรีประกอบและตรวจสอบคุณภาพสำเร็จสมบูรณ์!");
    } catch (err) {
      setProgressStep(`❌ เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsScoring(false);
    }
  };

  const handleApplyToTimeline = () => {
    if (scoredProject) {
      onApplyScoredProject(scoredProject);
      onClose();
    }
  };

  return (
    <div className="nle-modal-backdrop" onClick={onClose}>
      <div className="nle-modal-card" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
        <div className="nle-modal-header">
          <div className="nle-modal-title">
            <span>🎵</span>
            <span>MiniMax Music 3 Auto Audio Scoring (Phase 2 - 6)</span>
          </div>
          <button type="button" className="nle-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="nle-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Runtime Status Pill */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15, 23, 42, 0.6)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.2)" }}>
            <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>MiniMax Music 3 Direct Runtime:</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: isRuntimeReady ? "#34d399" : "#38bdf8" }}>
              {runtimeStatus}
            </span>
          </div>

          {/* Genre Selection */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#e2e8f0", display: "block", marginBottom: "8px" }}>
              แนวซีรีส์แนวตั้ง (Drama Genre):
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              {[
                { id: "romance_ceo", label: "💖 รักโรแมนติก / CEO" },
                { id: "revenge_thriller", label: "🔥 ล้างแค้น / ระทึกขวัญ" },
                { id: "urban_suspense", label: "🏙️ สืบสวน / ชิงไหวพริบ" },
                { id: "historical_palace", label: "👑 ย้อนยุค / วังหลวง" },
                { id: "fantasy_wuxia", label: "⚔️ แฟนตาซี / กำลังภายใน" },
                { id: "comedy_slice_of_life", label: "😂 คอมเมดี้ / ชีวิตประจำวัน" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGenre(item.id as DramaGenre)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: genre === item.id ? "rgba(56, 189, 248, 0.2)" : "rgba(30, 41, 59, 0.6)",
                    border: `1px solid ${genre === item.id ? "#38bdf8" : "rgba(148, 163, 184, 0.2)"}`,
                    color: genre === item.id ? "#38bdf8" : "#f1f5f9",
                    transition: "all 0.12s ease",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Progress or Steps Display */}
          {progressStep && (
            <div style={{ background: "rgba(30, 41, 59, 0.7)", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.3)", fontSize: "0.8rem", color: "#f8fafc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {isScoring && <span className="spinner" style={{ width: "14px", height: "14px" }} />}
                <span>{progressStep}</span>
              </div>
            </div>
          )}

          {/* QC Report Summary */}
          {qcReport && (
            <div style={{ background: "rgba(15, 23, 42, 0.85)", padding: "12px 14px", borderRadius: "8px", border: `1px solid ${qcReport.passed ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <strong style={{ fontSize: "0.84rem", color: qcReport.passed ? "#34d399" : "#fbbf24" }}>
                  {qcReport.passed ? "✅ Audio QC ผ่านมาตรฐาน EBU R128" : "⚠️ ตรวจพบประเด็น และทำการ Auto-Remix แล้ว"}
                </strong>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  LUFS: <strong>{qcReport.integratedLufs}</strong> (Target: -16.0) · True Peak: <strong>{qcReport.maxTruePeakDb} dBTP</strong>
                </span>
              </div>
              <small style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                Dialogue Intelligibility: <strong>{Math.round(qcReport.dialogueIntelligibilityScore * 100)}%</strong> · Auto-Ducking Sidechain A1→A2: <strong>เปิดทำงาน (-16 dB)</strong>
              </small>
            </div>
          )}
        </div>

        <div className="nle-modal-footer">
          <button type="button" className="nle-tool-btn" onClick={onClose} disabled={isScoring}>
            ยกเลิก
          </button>
          {!scoredProject ? (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={handleRunAutoScoring}
              disabled={isScoring}
              style={{ background: "#0284c7", color: "#fff", borderColor: "#38bdf8" }}
            >
              {isScoring ? "⏳ กำลังรัน Auto Scoring..." : "⚡ เริ่มวิเคราะห์และสร้างเพลง (MiniMax 3)"}
            </button>
          ) : (
            <button
              type="button"
              className="nle-tool-btn highlight-btn"
              onClick={handleApplyToTimeline}
              style={{ background: "#059669", color: "#fff", borderColor: "#34d399" }}
            >
              🎉 นำเพลงและ SFX ลง Timeline ทันที
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
