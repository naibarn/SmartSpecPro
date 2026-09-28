import { useCallback, useEffect, useMemo, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

type AdapterStatus = {
  adapterId: string;
  status: string;
  runtime?: string | null;
  device?: string | null;
  modelChecksum?: string | null;
  remediationKey?: string | null;
  modelPath?: string | null;
};

type SpeakerModelStatus = {
  runnerReady: boolean;
  runnerPath?: string | null;
  runnerReason?: string | null;
  adapters: AdapterStatus[];
};

const ADAPTERS = [
  { id: "SileroOnnx", label: "Silero ONNX", description: "VAD ตรวจช่วงเสียงพูด", file: true, extensions: ["onnx"] },
  { id: "MediaPipeFace", label: "MediaPipe Face", description: "ติดตามใบหน้าในวิดีโอ", file: true, extensions: ["task"] },
  { id: "PersonBody", label: "MediaPipe Person / Body", description: "ติดตามตัวบุคคลและท่าทาง", file: true, extensions: ["task"] },
  { id: "PyannoteDiarization", label: "pyannote Diarization", description: "แยกผู้พูดหลายคน (ต้องมี license/token ตาม model)", file: false, extensions: [] },
  { id: "WebRtcVad", label: "WebRTC VAD", description: "VAD แบบ CPU ไม่ต้องใช้ model", file: false, extensions: [] },
  { id: "ActiveSpeakerFusion", label: "Active speaker fusion", description: "รวมผลเสียงและภาพภายใน Worker", file: false, extensions: [] },
] as const;

function statusLabel(status: string, thai: boolean): string {
  const labels: Record<string, [string, string]> = {
    ready: ["พร้อมใช้งาน", "Ready"],
    missing_model: ["ยังไม่มี model", "Model missing"],
    missing_runtime: ["ยังไม่มี dependency", "Dependency missing"],
    gpu_unavailable: ["ไม่พบ GPU ที่ต้องใช้", "GPU unavailable"],
    license_required: ["ต้องยอมรับ license/token", "License/token required"],
    disabled: ["ปิดใช้งาน", "Disabled"],
    error: ["ตรวจไม่สำเร็จ", "Error"],
  };
  return labels[status]?.[thai ? 0 : 1] ?? status;
}

function guidance(adapter: typeof ADAPTERS[number], status: AdapterStatus | undefined, thai: boolean): string {
  if (status?.status === "ready") return thai ? "ตรวจพบ dependency และ model จากเครื่องนี้แล้ว" : "The dependency and model were detected on this machine.";
  if (adapter.id === "PyannoteDiarization") return thai
    ? "รัน `python -m pip install pyannote.audio` ใน environment เดียวกับ runner จากนั้นดาวน์โหลด pipeline ตาม license แล้วเลือกโฟลเดอร์; หากต้องใช้ token ให้ตั้ง `SMARTAIHUB_PYANNOTE_TOKEN` ใน process ของ Worker (แอปไม่บันทึก token)"
    : "Run `python -m pip install pyannote.audio` in the runner environment, download a pipeline under its license, and choose the folder. If required, set `SMARTAIHUB_PYANNOTE_TOKEN` in the Worker process; the app never persists the token.";
  if (adapter.id === "WebRtcVad") return thai
    ? "เปิด PowerShell บนเครื่อง Worker แล้วรัน `python -m pip install webrtcvad-wheels` ใน environment เดียวกับ runner จากนั้นกดตรวจใหม่"
    : "In PowerShell on the Worker, run `python -m pip install webrtcvad-wheels` in the runner environment, then recheck.";
  if (status?.remediationKey === "install_mediapipe_opencv") return thai
    ? "เปิด PowerShell บนเครื่อง Worker แล้วรัน `python -m pip install mediapipe opencv-python-headless` ใน environment เดียวกับ runner ก่อนเลือกไฟล์ .task"
    : "In PowerShell on the Worker, run `python -m pip install mediapipe opencv-python-headless` in the runner environment before selecting the .task file.";
  if (status?.remediationKey === "install_onnxruntime") return thai
    ? "เปิด PowerShell บนเครื่อง Worker แล้วรัน `python -m pip install onnxruntime-gpu numpy` (หรือ onnxruntime สำหรับ CPU) ใน environment เดียวกับ runner ก่อนเลือกไฟล์ .onnx"
    : "In PowerShell on the Worker, run `python -m pip install onnxruntime-gpu numpy` (or onnxruntime for CPU) in the runner environment before selecting the .onnx file.";
  return thai
    ? `ดาวน์โหลด model ที่ตรงกับ ${adapter.label} ลงเครื่อง แล้วเลือกไฟล์จากปุ่มด้านล่าง ระบบจะตรวจไฟล์จริงและ checksum ก่อนเปิดใช้`
    : `Download a compatible ${adapter.label} model, choose it below, and the Worker will verify the real file and checksum before enabling it.`;
}

export function SpeakerModelManagerCard({ locale }: { locale: "th" | "en" }) {
  const thai = locale === "th";
  const [snapshot, setSnapshot] = useState<SpeakerModelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAdapter, setBusyAdapter] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const statusById = useMemo(() => new Map((snapshot?.adapters ?? []).map(item => [item.adapterId, item])), [snapshot]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await invoke<SpeakerModelStatus>("worker_app_get_speaker_model_status"));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseModel = async (adapter: typeof ADAPTERS[number]) => {
    setBusyAdapter(adapter.id);
    setError("");
    setMessage("");
    try {
      const selected = await openFileDialog({
        directory: !adapter.file,
        multiple: false,
        filters: adapter.extensions.length ? [{ name: "Model", extensions: [...adapter.extensions] }] : undefined,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      setSnapshot(await invoke<SpeakerModelStatus>("worker_app_install_speaker_model_from_path", { adapterId: adapter.id, path: selected }));
      setMessage(thai ? `นำเข้าและติดตั้ง ${adapter.label} แล้ว` : `Imported and installed ${adapter.label}.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusyAdapter(null);
    }
  };

  const clearModel = async (adapter: typeof ADAPTERS[number]) => {
    setBusyAdapter(adapter.id);
    setError("");
    try {
      setSnapshot(await invoke<SpeakerModelStatus>("worker_app_clear_speaker_model_path", { adapterId: adapter.id }));
      setMessage(thai ? `ล้าง path ของ ${adapter.label} แล้ว` : `Cleared the ${adapter.label} path.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusyAdapter(null);
    }
  };

  return <article className="panel wide" data-testid="speaker-model-manager">
    <div className="panel-heading inline">
      <div>
        <p className="eyebrow">Feature 179</p>
        <h2>{thai ? "ติดตั้งและตรวจ Speaker-aware models" : "Install and verify speaker-aware models"}</h2>
      </div>
      <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}>
        {loading ? (thai ? "กำลังตรวจ…" : "Checking…") : (thai ? "ตรวจใหม่" : "Recheck")}
      </button>
    </div>
    <p className="subtle">
      {thai
        ? "Runner อยู่ใน Runtime แล้ว แต่ model weights และ dependency ของแต่ละ adapter ติดตั้งแยกบนเครื่อง Worker ระบบไม่ดาวน์โหลดไฟล์ที่มี license โดยอัตโนมัติ และจะไม่เปิดใช้ adapter จนกว่าจะตรวจพบของจริง"
        : "The runner is included in the Runtime, but each adapter's model weights and dependencies are installed separately on the Worker. Licensed files are never downloaded implicitly, and an adapter is not enabled until its real files pass checks."}
    </p>
    {!snapshot?.runnerReady ? <div className="connect-message error" role="alert">{thai ? "ยังไม่พบ speaker-aware runner ที่ใช้งานได้" : "No usable speaker-aware runner was found."}{snapshot?.runnerReason ? ` · ${snapshot.runnerReason}` : ""}</div> : null}
    {error ? <div className="connect-message error" role="alert">{error}</div> : null}
    {message ? <div className="connect-message" role="status">{message}</div> : null}
    <div className="check-list" aria-label={thai ? "สถานะ speaker-aware adapters" : "Speaker-aware adapter status"}>
      {ADAPTERS.map(adapter => {
        const status = statusById.get(adapter.id);
        const ready = status?.status === "ready";
        return <div className="check-row" key={adapter.id}>
          <span className={`status-dot ${ready ? "ok" : "warn"}`} />
          <div style={{ flex: 1 }}>
            <strong>{adapter.label} · {statusLabel(status?.status ?? "error", thai)}</strong>
            <p>{adapter.description}</p>
            <p className="field-help">{guidance(adapter, status, thai)}</p>
            {status?.modelPath ? <p className="field-help"><code>{status.modelPath}</code>{status.modelChecksum ? ` · sha256 ${status.modelChecksum}` : ""}</p> : null}
            {adapter.file ? <div className="button-row">
              <button type="button" className="secondary-button small" onClick={() => void chooseModel(adapter)} disabled={busyAdapter !== null}>
                {busyAdapter === adapter.id ? (thai ? "กำลังนำเข้า…" : "Importing…") : (thai ? "เลือกไฟล์ model" : "Choose model file")}
              </button>
              {status?.modelPath ? <button type="button" className="secondary-button small" onClick={() => void clearModel(adapter)} disabled={busyAdapter !== null}>{thai ? "ล้าง path" : "Clear path"}</button> : null}
            </div> : adapter.id === "PyannoteDiarization" ? <div className="button-row">
              <button type="button" className="secondary-button small" onClick={() => void chooseModel(adapter)} disabled={busyAdapter !== null}>{thai ? "เลือกโฟลเดอร์ pipeline" : "Choose pipeline folder"}</button>
              {status?.modelPath ? <button type="button" className="secondary-button small" onClick={() => void clearModel(adapter)} disabled={busyAdapter !== null}>{thai ? "ล้าง path" : "Clear path"}</button> : null}
            </div> : null}
          </div>
        </div>;
      })}
    </div>
    <details className="runtime-help">
      <summary>{thai ? "คู่มือแก้ปัญหาแบบละเอียด" : "Detailed manual setup guide"}</summary>
      <ol>
        <li>{thai ? "ติดตั้ง Worker App รุ่นล่าสุดและ Runtime ที่มี speaker-aware runner" : "Install the latest Worker App and a Runtime containing the speaker-aware runner."}</li>
        <li>{thai ? "ดาวน์โหลด model จากแหล่งทางการของ adapter ที่ต้องการ เก็บไว้ในโฟลเดอร์ที่ Worker อ่านได้" : "Download models from the adapter's official source and keep them in a folder readable by the Worker."}</li>
        <li>{thai ? "กดเลือกไฟล์หรือโฟลเดอร์ด้านบน ระบบจะบันทึก path ใน app data ไม่เขียนทับไฟล์ต้นฉบับ" : "Choose the file or folder above. The path is stored in app data; the source is never overwritten."}</li>
        <li>{thai ? "กดตรวจใหม่ แล้วกลับไปกด Preflight; ถ้ายังไม่พร้อม ระบบจะแจ้ง adapter และ remediation ที่ขาดก่อนส่งคิว" : "Recheck, then run Preflight. If anything is still missing, the adapter and remediation are shown before queue submission."}</li>
      </ol>
      <p className="field-help">{thai ? "บน Windows/WSL2 ให้ใช้ path ที่ native Worker process เปิดอ่านได้ เช่น C:\\SmartAIHub\\models\\... ไม่ใช่ path Linux ใน WSL โดยตรง" : "On Windows/WSL2, use a path readable by the native Worker process, such as C:\\SmartAIHub\\models\\..., rather than a Linux-only WSL path."}</p>
    </details>
  </article>;
}
