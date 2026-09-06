import { forwardRef, useEffect, useMemo, useState } from "react";

export type AdapterPolicy = {
  contractVersion: "feature-179-v1";
  vad: { enabledAdapters: AdapterId[]; primary: AdapterId; fallbackPolicy: "deny" | "allow_listed" | "report_unknown"; fallbackAllowList: AdapterId[]; required: boolean };
  diarization: { enabledAdapters: AdapterId[]; primary: AdapterId; fallbackPolicy: "deny" | "allow_listed" | "report_unknown"; fallbackAllowList: AdapterId[]; required: boolean };
  face: { enabledAdapters: AdapterId[]; primary: AdapterId; fallbackPolicy: "deny" | "allow_listed" | "report_unknown"; fallbackAllowList: AdapterId[]; required: boolean };
  person: { enabledAdapters: AdapterId[]; primary: AdapterId; fallbackPolicy: "deny" | "allow_listed" | "report_unknown"; fallbackAllowList: AdapterId[]; required: boolean };
  activeSpeaker: { enabledAdapters: AdapterId[]; primary: AdapterId; fallbackPolicy: "deny" | "allow_listed" | "report_unknown"; fallbackAllowList: AdapterId[]; required: boolean };
  maxScanWindowMs: number;
  maxConcurrentProcesses: number;
};

type WorkflowMode = "subtitle_first" | "speaker_first" | "full_assisted" | "custom";
export type AdapterId = "SileroOnnx" | "FireRedOnnx" | "TenVad" | "WebRtcVad" | "PyannoteDiarization" | "MediaPipeFace" | "PersonBody" | "ActiveSpeakerFusion";
export type SpeakerAwareStageId = "subtitle_editorial_cut" | "vad_scan" | "diarization_scan" | "visual_track_scan" | "active_speaker_fusion" | "condensation_plan" | "speaker_reframe" | "manual_review";
type SubmissionState = "idle" | "preflight" | "queued" | "error";

export const SPEAKER_AWARE_STAGE_DEFINITIONS: Array<{ id: SpeakerAwareStageId; label: string; requires: SpeakerAwareStageId[] }> = [
  { id: "subtitle_editorial_cut", label: "ตัดตาม Subtitle / ASR", requires: [] },
  { id: "vad_scan", label: "ตรวจเสียงพูด / Dead Air", requires: [] },
  { id: "diarization_scan", label: "แยก Speaker หลายคน", requires: ["vad_scan"] },
  { id: "visual_track_scan", label: "ติดตามใบหน้า / ทั้งตัว", requires: [] },
  { id: "active_speaker_fusion", label: "จับคนที่กำลังพูด", requires: ["vad_scan", "visual_track_scan"] },
  { id: "condensation_plan", label: "เสนอเนื้อหากระชับ", requires: ["subtitle_editorial_cut"] },
  { id: "speaker_reframe", label: "วางกรอบและสลับกล้อง", requires: ["active_speaker_fusion"] },
  { id: "manual_review", label: "ตรวจสอบและอนุมัติ", requires: [] },
];

export function validateSpeakerAwareStageSelection(enabled: SpeakerAwareStageId[], order: SpeakerAwareStageId[]): string[] {
  const errors: string[] = [];
  const enabledSet = new Set(enabled);
  const seen = new Set<SpeakerAwareStageId>();
  for (const stage of order) {
    if (!enabledSet.has(stage)) continue;
    const definition = SPEAKER_AWARE_STAGE_DEFINITIONS.find(item => item.id === stage);
    for (const requirement of definition?.requires ?? []) {
      if (!enabledSet.has(requirement)) errors.push(`${stage} ต้องเปิด ${requirement}`);
      else if (!seen.has(requirement)) errors.push(`${stage} ต้องอยู่หลัง ${requirement}`);
    }
    seen.add(stage);
  }
  if (!enabledSet.has("manual_review")) errors.push("ต้องมีขั้นตอนตรวจสอบและอนุมัติ");
  return errors;
}

export interface SpeakerAwareWorkflowPanelProps {
  seriesId?: string | null;
  sourceLabel?: string | null;
  busy?: boolean;
  onRequestScan?: (input: { workflowMode: WorkflowMode; adapters: AdapterId[]; adapterPolicy: AdapterPolicy; requestedStages: string[]; outputStage: string }) => void | Promise<{ jobId?: string; status?: string } | void>;
}

const recipes: Array<{ id: WorkflowMode; th: string; en: string; stages: string[] }> = [
  { id: "subtitle_first", th: "ตัดตาม Subtitle ก่อน (16:9)", en: "Subtitle-first editorial cut (16:9)", stages: ["Subtitle/ASR", "Dead Air + Manual", "Review"] },
  { id: "speaker_first", th: "สแกนผู้พูดก่อน", en: "Speaker-first coverage", stages: ["VAD", "Diarization", "Face/Person", "Review"] },
  { id: "full_assisted", th: "ช่วยวางแผนตัดต่อครบชุด", en: "Full assisted edit", stages: ["Subtitle/ASR", "VAD", "Speakers", "Condense", "Reframe", "Review"] },
  { id: "custom", th: "กำหนดขั้นตอนเอง", en: "Custom stages", stages: ["เลือกขั้นตอนเอง"] },
];

const adapters: Array<{ id: AdapterId; label: string; stage: string }> = [
  { id: "SileroOnnx", label: "Silero ONNX", stage: "VAD" },
  { id: "FireRedOnnx", label: "FireRed ONNX", stage: "VAD" },
  { id: "TenVad", label: "TEN VAD (preview)", stage: "VAD" },
  { id: "WebRtcVad", label: "WebRTC VAD", stage: "Fallback" },
  { id: "PyannoteDiarization", label: "pyannote (หลายผู้พูด)", stage: "Diarization" },
  { id: "MediaPipeFace", label: "MediaPipe Face", stage: "Face" },
  { id: "PersonBody", label: "Person / Body", stage: "ทั้งตัว" },
  { id: "ActiveSpeakerFusion", label: "Active speaker fusion", stage: "VAD + ภาพ" },
];

export const SpeakerAwareWorkflowPanel = forwardRef<HTMLElement, SpeakerAwareWorkflowPanelProps>(function SpeakerAwareWorkflowPanel({ seriesId, sourceLabel, busy = false, onRequestScan }, ref) {
  const [mode, setMode] = useState<WorkflowMode>("subtitle_first");
  const [selectedAdapters, setSelectedAdapters] = useState<AdapterId[]>(["SileroOnnx", "MediaPipeFace", "PersonBody", "ActiveSpeakerFusion"]);
  const [fallbackPolicy, setFallbackPolicy] = useState<"deny" | "allow_listed" | "report_unknown">("deny");
  const [message, setMessage] = useState<string | null>(null);
  const [stageOrder, setStageOrder] = useState<SpeakerAwareStageId[]>(SPEAKER_AWARE_STAGE_DEFINITIONS.map(item => item.id));
  const [enabledStages, setEnabledStages] = useState<SpeakerAwareStageId[]>(["subtitle_editorial_cut", "manual_review"]);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const recipe = useMemo(() => recipes.find((item) => item.id === mode) ?? recipes[0], [mode]);
  const stageErrors = useMemo(() => validateSpeakerAwareStageSelection(enabledStages, stageOrder), [enabledStages, stageOrder]);
  useEffect(() => {
    if (mode === "subtitle_first") setEnabledStages(["subtitle_editorial_cut", "manual_review"]);
    if (mode === "speaker_first") setEnabledStages(["vad_scan", "diarization_scan", "visual_track_scan", "active_speaker_fusion", "manual_review"]);
    if (mode === "full_assisted") setEnabledStages(["subtitle_editorial_cut", "vad_scan", "diarization_scan", "visual_track_scan", "active_speaker_fusion", "condensation_plan", "speaker_reframe", "manual_review"]);
  }, [mode]);
  const toggleAdapter = (id: AdapterId) => setSelectedAdapters((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const buildStagePolicy = (enabled: AdapterId[], primary: AdapterId, required: boolean) => ({
    enabledAdapters: enabled,
    primary,
    fallbackPolicy: fallbackPolicy === "allow_listed" && enabled.filter((item) => item !== primary).length === 0 ? "deny" as const : fallbackPolicy,
    fallbackAllowList: enabled.filter((item) => item !== primary),
    required,
  });
  const submit = async () => {
    if (!sourceLabel) { setMessage("เลือก source video ก่อนเริ่มสแกน"); return; }
    if (selectedAdapters.length === 0) { setMessage("ต้องเลือก Adapter อย่างน้อย 1 ตัว และระบบจะไม่ fallback เอง"); return; }
    if (stageErrors.length > 0) { setMessage(`ลำดับขั้นตอนไม่ถูกต้อง: ${stageErrors[0]}`); return; }
    const vad = selectedAdapters.filter((item) => ["SileroOnnx", "FireRedOnnx", "TenVad", "WebRtcVad"].includes(item));
    const policy: AdapterPolicy = {
      contractVersion: "feature-179-v1",
      vad: buildStagePolicy(vad, (vad[0] ?? "SileroOnnx"), mode !== "subtitle_first"),
      diarization: buildStagePolicy(selectedAdapters.includes("PyannoteDiarization") ? ["PyannoteDiarization"] : [], "PyannoteDiarization", mode === "speaker_first" || mode === "full_assisted"),
      face: buildStagePolicy(selectedAdapters.includes("MediaPipeFace") ? ["MediaPipeFace"] : [], "MediaPipeFace", mode !== "subtitle_first"),
      person: buildStagePolicy(selectedAdapters.includes("PersonBody") ? ["PersonBody"] : [], "PersonBody", mode !== "subtitle_first"),
      activeSpeaker: buildStagePolicy(selectedAdapters.includes("ActiveSpeakerFusion") ? ["ActiveSpeakerFusion"] : [], "ActiveSpeakerFusion", mode === "speaker_first" || mode === "full_assisted"),
      maxScanWindowMs: 60_000,
      maxConcurrentProcesses: 1,
    };
    const requestedStages = stageOrder.filter(stage => enabledStages.includes(stage));
    setSubmissionState("preflight");
    setMessage(`กำลังตรวจ preflight และส่งคิว ${recipe.th} · fallback: ${fallbackPolicy === "deny" ? "ปิด" : fallbackPolicy}`);
    if (!onRequestScan) {
      setSubmissionState("error");
      setMessage("ยังไม่มี source artifact/control-plane สำหรับส่งงานจากหน้าต่างนี้");
      return;
    }
    try {
      const result = await onRequestScan({ workflowMode: mode, adapters: selectedAdapters, adapterPolicy: policy, requestedStages, outputStage: "manual_review" });
      setSubmissionState("queued");
      setLastJobId(result?.jobId ?? null);
      setMessage(`ส่งงาน speaker-aware เข้า Worker queue แล้ว${result?.jobId ? ` · Job ${result.jobId}` : ""}`);
    } catch (error) {
      setSubmissionState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const actionDisabled = busy || submissionState === "preflight" || !sourceLabel || !onRequestScan || stageErrors.length > 0;
  return (
    <section ref={ref} id="speaker-aware-workflow-panel" className="speaker-aware-workflow-panel" aria-labelledby="speaker-aware-workflow-heading">
      <header className="speaker-aware-workflow-header">
        <div>
          <p className="eyebrow">SPEAKER-AWARE MEDIA</p>
          <h3 id="speaker-aware-workflow-heading">วิเคราะห์ผู้พูดและวางแผนตัดต่อ</h3>
          <p className="subtle">เลือกขั้นตอนตามงานจริงได้ ไม่บังคับให้สแกนผู้พูดก่อนตัด Subtitle</p>
        </div>
        <div className="speaker-aware-header-actions">
          <span className="speaker-aware-contract-badge" role="status">Feature 179 · fail-closed</span>
          <button type="button" className="primary-button speaker-aware-header-submit" onClick={submit} disabled={actionDisabled} aria-disabled={actionDisabled}>
            {submissionState === "preflight" ? "กำลังตรวจสอบ…" : "ตรวจ Preflight และส่งคิว"}
          </button>
        </div>
      </header>
      <div className="speaker-aware-workflow-grid">
        <fieldset>
          <legend>Workflow</legend>
          {recipes.map((item) => (
            <label key={item.id} className={`speaker-aware-choice${mode === item.id ? " selected" : ""}`}>
              <input type="radio" name="speaker-aware-workflow" checked={mode === item.id} onChange={() => setMode(item.id)} />
              <span><strong>{item.th}</strong><small>{item.en}</small></span>
            </label>
          ))}
          <p className="speaker-aware-stage-preview">ขั้นตอน: {recipe.stages.join(" → ")}</p>
        </fieldset>
        <fieldset>
          <legend>ขั้นตอนที่เปิดใช้งาน</legend>
          <p className="speaker-aware-help">ลากลำดับไม่ได้ในโหมดนี้ จึงใช้ปุ่มขึ้น/ลงเพื่อควบคุมลำดับอย่างชัดเจน และไม่บังคับให้ทำทุกขั้นตอน</p>
          <div className="speaker-aware-stage-list" aria-label="ลำดับขั้นตอน speaker-aware">
            {stageOrder.map((stage, index) => {
              const definition = SPEAKER_AWARE_STAGE_DEFINITIONS.find(item => item.id === stage)!;
              const enabled = enabledStages.includes(stage);
              return <div key={stage} className={`speaker-aware-stage-row${enabled ? " enabled" : ""}`}>
                <label><input type="checkbox" checked={enabled} onChange={() => setEnabledStages(current => enabled ? current.filter(item => item !== stage) : [...current, stage])} /> <span>{definition.label}</span></label>
                <span className="speaker-aware-stage-actions">
                  <button type="button" onClick={() => setStageOrder(current => { if (index === 0) return current; const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} disabled={index === 0} aria-label={`เลื่อน ${definition.label} ขึ้น`}>↑</button>
                  <button type="button" onClick={() => setStageOrder(current => { if (index === current.length - 1) return current; const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} disabled={index === stageOrder.length - 1} aria-label={`เลื่อน ${definition.label} ลง`}>↓</button>
                </span>
              </div>;
            })}
          </div>
          {stageErrors.length > 0 ? <p className="speaker-aware-warning" role="alert">{stageErrors.join(" · ")}</p> : <p className="speaker-aware-valid" role="status">ลำดับขั้นตอนพร้อมตรวจ Preflight</p>}
        </fieldset>
        <fieldset>
          <legend>Adapter ที่อนุญาตให้ทำงาน</legend>
          <p className="speaker-aware-help">ระบบจะใช้เฉพาะตัวที่เลือกและผ่าน preflight เท่านั้น</p>
          <div className="speaker-aware-adapter-list">
            {adapters.map((adapter) => (
              <label key={adapter.id} className="speaker-aware-adapter-row">
                <input type="checkbox" checked={selectedAdapters.includes(adapter.id)} onChange={() => toggleAdapter(adapter.id)} />
                <span>{adapter.label}</span><small>{adapter.stage} · preflight required</small>
              </label>
            ))}
          </div>
          <label className="speaker-aware-fallback-label" htmlFor="speaker-aware-fallback">Fallback policy</label>
          <select id="speaker-aware-fallback" value={fallbackPolicy} onChange={(event) => setFallbackPolicy(event.target.value as typeof fallbackPolicy)}>
            <option value="deny">ปิด fallback (แนะนำ)</option>
            <option value="allow_listed">ใช้เฉพาะ allow-list</option>
            <option value="report_unknown">รายงาน unknown เท่านั้น</option>
          </select>
        </fieldset>
      </div>
      <footer className="speaker-aware-workflow-footer">
        <span>{sourceLabel ? `Source: ${sourceLabel}` : "เลือก source video ก่อนเริ่มสแกน"}</span>
        <span className="speaker-aware-submission-state" role="status">{submissionState === "queued" ? `เข้าคิวแล้ว${lastJobId ? ` · ${lastJobId.slice(0, 12)}` : ""}` : submissionState === "preflight" ? "กำลังตรวจ Preflight…" : submissionState === "error" ? "ส่งงานไม่สำเร็จ" : "ยังไม่ได้ส่งงาน"}</span>
        <button type="button" className="primary-button" onClick={submit} disabled={actionDisabled} aria-disabled={actionDisabled}>
          {busy || submissionState === "preflight" ? "กำลังตรวจสอบ…" : "ตรวจ Preflight และส่งคิว"}
        </button>
      </footer>
      {message ? <p className="connect-message" role="status" aria-live="polite">{message}</p> : null}
    </section>
  );
});
