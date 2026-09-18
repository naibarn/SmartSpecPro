import { useMemo, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type RunnerSetupResponse = {
  runnerId: string;
  displayName: string;
  controlPath: string;
  accessToken: string;
  expiresInSeconds: number;
  privateKeyRequiredLocally: boolean;
};

export function RunnerConnectPanel() {
  const [displayName, setDisplayName] = useState("SmartAIHub Runner");
  const [runnerId, setRunnerId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [machineFingerprint, setMachineFingerprint] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [result, setResult] = useState<RunnerSetupResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const controlUrl = useMemo(
    () => (result ? `${window.location.origin}${result.controlPath}` : ""),
    [result]
  );
  const envText = result
    ? [
        "SAH_RUNNER_PROFILE=local_device",
        `SAH_RUNNER_ID=${result.runnerId}`,
        `SAH_RUNNER_DEVICE_ID=${deviceId}`,
        `SAH_RUNNER_CONTROL_URL=${controlUrl}`,
        `SAH_RUNNER_MACHINE_FINGERPRINT=${machineFingerprint}`,
        `SAH_RUNNER_DEVICE_PUBLIC_KEY=${publicKey.replace(/\n/g, "\\n")}`,
        `SAH_RUNNER_ACCESS_TOKEN=${result.accessToken}`,
        "SAH_RUNNER_DEVICE_PRIVATE_KEY=<keep-the-private-key-on-the-runner-host>",
      ].join("\n")
    : "";

  async function createRunner() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/runners/setup", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          runnerId: runnerId.trim() || undefined,
          deviceId,
          machineFingerprint,
          publicKey,
        }),
      });
      const payload = (await response.json()) as
        | RunnerSetupResponse
        | { error?: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error : "Runner setup failed");
      setResult(payload as RunnerSetupResponse);
    } catch {
      setError("สร้างข้อมูลเชื่อมต่อ Runner ไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  async function copySetup() {
    if (!envText) return;
    await navigator.clipboard.writeText(envText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <KeyRound className="h-5 w-5" />
        </span>
        <section>
          <h2 className="text-xl font-semibold text-slate-950">เชื่อมต่อ SmartAIHub Runner</h2>
          <p className="text-sm leading-6 text-slate-600">
            สร้าง credential สำหรับ Runner แยกจาก Worker App และเก็บ private key ไว้บนเครื่อง Runner เท่านั้น
          </p>
        </section>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          ชื่อ Runner
          <Input className="mt-1" value={displayName} onChange={event => setDisplayName(event.target.value)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Runner ID (เว้นว่างให้ระบบสร้าง)
          <Input className="mt-1" value={runnerId} onChange={event => setRunnerId(event.target.value)} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Device ID
          <Input className="mt-1" value={deviceId} onChange={event => setDeviceId(event.target.value)} placeholder="เช่น macbook-pro-01" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Machine fingerprint
          <Input className="mt-1" value={machineFingerprint} onChange={event => setMachineFingerprint(event.target.value)} placeholder="ค่าที่ Runner host สร้างไว้" />
        </label>
      </section>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Device public key (PEM)
        <Textarea
          className="mt-1 min-h-28 font-mono text-xs"
          value={publicKey}
          onChange={event => setPublicKey(event.target.value)}
          placeholder="-----BEGIN PUBLIC KEY-----"
        />
      </label>
      <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ระบบจะไม่รับหรือบันทึก private key และ token จะแสดงสำหรับ setup รอบนี้เท่านั้น
      </p>
      <Button
        type="button"
        className="mt-4"
        onClick={() => void createRunner()}
        disabled={submitting || !displayName.trim() || !deviceId.trim() || !machineFingerprint.trim() || !publicKey.trim()}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
        สร้างข้อมูลเชื่อมต่อ Runner
      </Button>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {result ? (
        <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> สร้าง Runner {result.runnerId} สำเร็จ
          </p>
          <p className="mt-2 text-xs leading-5 text-emerald-800">
            นำค่าเหล่านี้ไปตั้งบนเครื่อง Runner แล้วสั่ง `smartaihub-runner connect` ห้ามส่ง private key กลับเข้าระบบ
          </p>
          <Textarea className="mt-3 min-h-48 bg-white font-mono text-xs" readOnly value={envText} />
          <Button type="button" variant="outline" className="mt-3" onClick={() => void copySetup()}>
            <Copy className="mr-2 h-4 w-4" /> {copied ? "คัดลอกแล้ว" : "คัดลอก setup values"}
          </Button>
        </section>
      ) : null}
    </section>
  );
}
