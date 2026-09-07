import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SmartSpecProjectDraft } from "../../types/nleProject";
import type { AudioQCReport, EpisodeSoundPlan } from "../../types/audioScoring";
import { resolveMusicCueAudio } from "../../services/audioScoring/audioProviderRouter";
import { applySoundPlanToProjectTimeline } from "../../services/audioScoring/audioPlacementEngine";
import { runAudioQualityControl } from "../../services/audioScoring/audioQcEngine";
import { AudioScoringError } from "../../services/audioScoring/smartAiHubSkillClient";

export interface AutoAudioScoringModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: SmartSpecProjectDraft;
  onApplyScoredProject: (updatedProject: SmartSpecProjectDraft) => void;
  seriesId?: string | null;
  workspacePath?: string | null;
  /** Feature 176's approved, hash-bound plan. No plan means no scoring action. */
  approvedPlan?: EpisodeSoundPlan | null;
}

type RuntimeStatus = { ready: boolean; device: string; message: string };
type AudioQueueJob = {
  jobId: string;
  jobType: string;
  status: string;
  phase?: string;
  progressPercent?: number;
  seriesId?: string | null;
  episodeId?: string | null;
  statusReason?: string | null;
  updatedAt?: string;
};

export function AutoAudioScoringModal({
  isOpen,
  onClose,
  project,
  onApplyScoredProject,
  seriesId,
  workspacePath,
  approvedPlan,
}: AutoAudioScoringModalProps) {
  const [runtimeStatus, setRuntimeStatus] = useState("กำลังตรวจสอบ MiniMax Music 3 Runtime...");
  const [isRuntimeReady, setIsRuntimeReady] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [qcReport, setQcReport] = useState<AudioQCReport | null>(null);
  const [scoredProject, setScoredProject] = useState<SmartSpecProjectDraft | null>(null);
  const [queueJobs, setQueueJobs] = useState<AudioQueueJob[]>([]);
  const [queueError, setQueueError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    invoke<RuntimeStatus>("worker_app_get_audio_runtime_status")
      .then((res) => {
        setIsRuntimeReady(res.ready);
        setRuntimeStatus(res.ready ? `● Online (${res.device})` : `Unavailable (${res.message})`);
      })
      .catch((err) => {
        setIsRuntimeReady(false);
        setRuntimeStatus(`Unavailable (${String(err)})`);
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let inFlight = false;
    const loadQueue = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await invoke<{ items?: AudioQueueJob[] }>("worker_app_get_worker_job_summary", {});
        const audioTypes = new Set(["episode_audio_analyze", "minimax_music3_generate", "episode_score_mix"]);
        const items = (result.items ?? []).filter((job) => audioTypes.has(job.jobType))
          .filter((job) => !seriesId || !job.seriesId || job.seriesId === seriesId);
        if (!cancelled) {
          setQueueJobs(items.slice(0, 12));
          setQueueError("");
        }
      } catch (error) {
        if (!cancelled) setQueueError(error instanceof Error ? error.message : String(error));
      } finally {
        inFlight = false;
      }
    };
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isOpen, seriesId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !isScoring) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isScoring, onClose]);

  if (!isOpen) return null;

  const activeQueueJob = queueJobs.find((job) => !["completed", "failed", "canceled", "expired"].includes(job.status));

  const handleRunScoring = async () => {
    setIsScoring(true);
    setQcReport(null);
    setScoredProject(null);

    try {
      if (!approvedPlan) {
        throw new AudioScoringError("SKILL_UNAVAILABLE", "ยังไม่มีแผนอารมณ์ Feature 176 ที่ผ่านการอนุมัติ");
      }
      if (!isRuntimeReady) {
        throw new AudioScoringError("MODEL_NOT_INSTALLED", "MiniMax Music 3 Runtime ยังไม่พร้อมใช้งาน");
      }

      setProgressStep("ตรวจสอบแผนอารมณ์ที่อนุมัติและ provenance...");
      if (approvedPlan.episodeId !== project.projectId && !seriesId) {
        throw new AudioScoringError("PLAN_STALE", "แผนไม่ตรงกับ episode/project ปัจจุบัน");
      }

      setProgressStep(`สร้างเพลงด้วย MiniMax Music 3 จริง (${approvedPlan.cues.length} cues)...`);
      const generatedCues = [];
      for (const cue of approvedPlan.cues) {
        setProgressStep(`กำลังสร้าง cue ${cue.cueId} จาก modelInstruction ที่ผ่าน skill...`);
        const generated = await resolveMusicCueAudio(cue, approvedPlan.authority, [], workspacePath);
        generatedCues.push({
          cueId: cue.cueId,
          audioPath: generated.audioPath,
          durationSeconds: generated.durationSeconds,
          outputSha256: generated.outputSha256,
          measuredLufs: generated.measuredLufs,
          truePeakDb: generated.truePeakDb,
        });
      }

      setProgressStep("วางเฉพาะ score clips ที่เป็นเจ้าของ plan โดยรักษา manual tracks...");
      const mappedProject = applySoundPlanToProjectTimeline({
        project,
        soundPlan: approvedPlan,
        generatedCues,
      });

      setProgressStep("ตรวจ QC จาก measurements จริงของ artifact...");
      const qc = runAudioQualityControl(mappedProject, generatedCues);
      setQcReport(qc);
      if (!qc.passed) {
        throw new AudioScoringError("QC_FAILED", "QC ยังไม่ผ่าน จึงยังไม่อนุญาตให้ Apply ลง Timeline");
      }
      setScoredProject(mappedProject);
      setProgressStep("สร้างและตรวจเพลงจริงสำเร็จ รอผู้ใช้ audition/apply");
    } catch (err) {
      const code = err instanceof AudioScoringError ? `[${err.code}] ` : "";
      setProgressStep(`❌ ${code}${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsScoring(false);
    }
  };

  return (
    <div className="nle-modal-backdrop" onClick={onClose}>
      <div className="nle-modal-card" style={{ maxWidth: "680px" }} onClick={(event) => event.stopPropagation()}>
        <div className="nle-modal-header">
          <div className="nle-modal-title">
            <span>🎵</span>
            <span>{seriesId ? `MiniMax Music 3 Series Scoring (${seriesId})` : "MiniMax Music 3 Scoring"}</span>
          </div>
          <button type="button" className="nle-modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="nle-modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="nle-runtime-status">
            <span>MiniMax Music 3 Direct Runtime</span>
            <strong style={{ color: isRuntimeReady ? "#34d399" : "#fbbf24" }}>{runtimeStatus}</strong>
          </div>
          <div className="nle-plan-status">
            <strong>{approvedPlan ? "Feature 176: Approved plan" : "Feature 176: No approved plan"}</strong>
            <span>{approvedPlan ? `${approvedPlan.cues.length} cues · hash ${approvedPlan.authority.planHash}` : "สร้าง/ตรวจแผนจาก Web และกดอนุมัติก่อน"}</span>
          </div>
          <div className="nle-plan-status" role="status" aria-label="Feature 176 and 177 worker queue">
            <strong>{activeQueueJob ? "Worker queue กำลังประมวลผล" : "Worker queue พร้อมรับผลจาก Web"}</strong>
            <span>
              {activeQueueJob
                ? `${activeQueueJob.jobType} · ${activeQueueJob.status} · ${activeQueueJob.phase ?? "กำลังตรวจขั้นตอน"} · ${activeQueueJob.progressPercent ?? 0}% · Job ${activeQueueJob.jobId}`
                : "เมื่อ Web อนุมัติ Plan งาน ASR → Music3 → Mix/QC จะถูกส่งเข้าคิวอัตโนมัติและไม่ต้องกดสร้างซ้ำที่เครื่องนี้"}
            </span>
            {queueJobs.filter((job) => job.status === "completed").slice(0, 3).map((job) => (
              <span key={job.jobId}>✅ {job.jobType} · completed · Job {job.jobId}</span>
            ))}
            {queueError ? <span role="alert">อ่านสถานะ queue ไม่สำเร็จ: {queueError}</span> : null}
          </div>
          {progressStep && <div className="nle-progress-step">{progressStep}</div>}
          {qcReport && (
            <div className="nle-qc-report">
              <strong>{qcReport.passed ? "✅ QC ผ่านจาก measurements จริง" : "⚠️ QC ไม่ผ่าน/ข้อมูลไม่พอ"}</strong>
              <span>
                status: {qcReport.measurementStatus} · LUFS: {qcReport.integratedLufs == null ? "unknown" : qcReport.integratedLufs.toFixed(1)} · true peak: {qcReport.maxTruePeakDb == null ? "unknown" : `${qcReport.maxTruePeakDb.toFixed(1)} dBTP`}
              </span>
            </div>
          )}
        </div>

        <div className="nle-modal-footer">
          <button type="button" className="nle-tool-btn" onClick={onClose} disabled={isScoring}>ยกเลิก</button>
          {!scoredProject ? (
            <button type="button" className="nle-tool-btn highlight-btn" onClick={handleRunScoring} disabled={isScoring || !approvedPlan || !isRuntimeReady || Boolean(activeQueueJob)}>
              {isScoring ? "⏳ กำลังตรวจและสร้าง..." : activeQueueJob ? "Worker กำลังทำงานใน queue" : "เริ่มสร้างด้วย MiniMax Music 3"}
            </button>
          ) : (
            <button type="button" className="nle-tool-btn highlight-btn" onClick={() => { onApplyScoredProject(scoredProject); onClose(); }}>
              นำผลที่ผ่าน QC ลง Timeline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
