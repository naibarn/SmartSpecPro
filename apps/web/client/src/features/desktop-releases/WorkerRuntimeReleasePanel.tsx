import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  CloudUpload,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Upload,
  XCircle,
} from "lucide-react";

import { DashboardSurface } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  workerRuntimeIdValues,
  workerRuntimeReleaseCatalogSchema,
  workerRuntimeReleaseUploadSchema,
  workerRuntimeSigningKeyCatalogSchema,
  type WorkerRuntimeChannel,
  type WorkerRuntimeId,
  type WorkerRuntimeReleaseCatalog,
  type WorkerRuntimeReleaseAsset,
  type WorkerRuntimeSigningKeyCatalog,
} from "@shared/workerRuntimeReleases";

const labels: Record<WorkerRuntimeId, string> = {
  "hyperframes-wsl2": "Windows / WSL2",
  "hyperframes-windows-x64": "Windows native",
  "hyperframes-macos-arm64": "macOS arm64",
};

function expectedFileName(runtimeId: WorkerRuntimeId, version: string): string {
  return `smart-ai-hub-worker-runtime-${runtimeId}-${version}.zip`;
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024).toFixed(0)} KB`;
}

async function readJson(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload?.error?.details?.checks as
      | Array<{ status: string; message: string }>
      | undefined;
    const detailText = details
      ?.filter(check => check.status === "error")
      .map(check => check.message)
      .join(" ");
    throw new Error(
      detailText ||
        payload?.error?.message ||
        payload?.error ||
        "Worker runtime operation failed"
    );
  }
  return payload;
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/zip");
    request.upload.onprogress = event => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`Storage upload failed (${request.status}).`));
    request.onerror = () => reject(new Error("Storage upload failed."));
    request.onabort = () => reject(new Error("Storage upload was cancelled."));
    request.send(file);
  });
}

export function WorkerRuntimeReleasePanel() {
  const [catalog, setCatalog] = useState<WorkerRuntimeReleaseCatalog | null>(
    null
  );
  const [signingKey, setSigningKey] =
    useState<WorkerRuntimeSigningKeyCatalog | null>(null);
  const [publicKeyText, setPublicKeyText] = useState("");
  const [publicKeyFileName, setPublicKeyFileName] = useState("");
  const [signingKeyLoading, setSigningKeyLoading] = useState(true);
  const [signingKeyBusy, setSigningKeyBusy] = useState(false);
  const [runtimeId, setRuntimeId] =
    useState<WorkerRuntimeId>("hyperframes-wsl2");
  const [channel, setChannel] = useState<WorkerRuntimeChannel>("stable");
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/worker-runtime/releases", {
        credentials: "include",
      });
      setCatalog(
        workerRuntimeReleaseCatalogSchema.parse(
          await readJson(response)
        ) as WorkerRuntimeReleaseCatalog
      );
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not load runtime releases.",
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshSigningKey = async () => {
    setSigningKeyLoading(true);
    try {
      const response = await fetch("/api/admin/worker-runtime/signing-key", {
        credentials: "include",
      });
      const next = workerRuntimeSigningKeyCatalogSchema.parse(
        await readJson(response)
      ) as WorkerRuntimeSigningKeyCatalog;
      setSigningKey(next);
      if (next.active) setPublicKeyText(next.active.publicKey);
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not load the runtime signing key.",
      });
    } finally {
      setSigningKeyLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    void refreshSigningKey();
  }, []);

  const expectedName = useMemo(
    () => expectedFileName(runtimeId, version.trim() || "VERSION"),
    [runtimeId, version]
  );
  const selectedFileNameMismatch = Boolean(
    file && version.trim() && file.name !== expectedName
  );

  const upload = async () => {
    if (!file) {
      setMessage({
        kind: "error",
        text: "เลือกไฟล์ ZIP ของ runtime ก่อนอัปโหลด",
      });
      return;
    }
    if (!version.trim()) {
      setMessage({
        kind: "error",
        text: "กรุณาระบุ version ให้ตรงกับชื่อไฟล์",
      });
      return;
    }
    try {
      const metadata = workerRuntimeReleaseUploadSchema.parse({
        version: version.trim(),
        runtimeId,
        platform: runtimeId === "hyperframes-macos-arm64" ? "macos" : "windows",
        channel,
        fileName: file.name,
        contentType: file.type || "application/zip",
        fileSizeBytes: file.size,
      });
      setBusy(true);
      setProgress(0);
      setMessage(null);
      const presignResponse = await fetch(
        "/api/admin/worker-runtime/releases/upload-url",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
        }
      );
      const presign = await readJson(presignResponse);
      if (presign.uploadUrl && presign.storageKey) {
        await uploadWithProgress(presign.uploadUrl, file, setProgress);
        const completeResponse = await fetch(
          "/api/admin/worker-runtime/releases/upload/complete",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...metadata,
              storageKey: presign.storageKey,
            }),
          }
        );
        await readJson(completeResponse);
      } else {
        const body = new FormData();
        body.append("version", metadata.version);
        body.append("runtimeId", metadata.runtimeId);
        body.append("platform", metadata.platform);
        body.append("channel", metadata.channel);
        body.append("file", file, file.name);
        const uploadResponse = await fetch(
          "/api/admin/worker-runtime/releases/upload",
          {
            method: "POST",
            credentials: "include",
            body,
          }
        );
        await readJson(uploadResponse);
      }
      setMessage({
        kind: "success",
        text: "ตรวจสอบและบันทึก runtime สำเร็จแล้ว — กด Publish ในประวัติ release เพื่อเปิดใช้งาน",
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Runtime upload failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const selectPublicKeyFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > 16_384) {
      setMessage({
        kind: "error",
        text: "ไฟล์ public key มีขนาดใหญ่เกินไป (สูงสุด 16 KB)",
      });
      event.target.value = "";
      return;
    }
    try {
      setPublicKeyText(await selected.text());
      setPublicKeyFileName(selected.name);
      setMessage(null);
    } catch {
      setMessage({
        kind: "error",
        text: "อ่านไฟล์ public key ไม่สำเร็จ",
      });
    }
  };

  const savePublicKey = async () => {
    if (!publicKeyText.trim()) {
      setMessage({
        kind: "error",
        text: "เลือกไฟล์หรือวางข้อมูล Ed25519 public key ก่อนบันทึก",
      });
      return;
    }
    if (
      signingKey?.active &&
      signingKey.active.publicKey.trim() !== publicKeyText.trim() &&
      !window.confirm(
        "กำลังเปลี่ยน runtime trust key เดิม การเปลี่ยนนี้มีผลกับ release ที่จะตรวจสอบต่อไป ยืนยันหรือไม่?"
      )
    ) {
      return;
    }
    try {
      setSigningKeyBusy(true);
      setMessage(null);
      const response = await fetch("/api/admin/worker-runtime/signing-key", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: publicKeyText }),
      });
      const next = workerRuntimeSigningKeyCatalogSchema.parse(
        await readJson(response)
      ) as WorkerRuntimeSigningKeyCatalog;
      setSigningKey(next);
      setPublicKeyText(next.active?.publicKey ?? "");
      setPublicKeyFileName("");
      setMessage({
        kind: "success",
        text: "บันทึก public key สำเร็จ ระบบเก็บเฉพาะ public key และ fingerprint",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "บันทึก public key ไม่สำเร็จ",
      });
    } finally {
      setSigningKeyBusy(false);
    }
  };

  const action = async (
    release: WorkerRuntimeReleaseAsset,
    operation: "publish" | "withdraw"
  ) => {
    try {
      setBusy(true);
      const response = await fetch(
        `/api/admin/worker-runtime/releases/${release.id}/${operation}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      );
      await readJson(response);
      setMessage({
        kind: "success",
        text:
          operation === "publish" ? "เผยแพร่ runtime แล้ว" : "ถอน runtime แล้ว",
      });
      await refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Runtime release action failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardSurface className="overflow-hidden">
      <div className="border-b border-slate-200/80 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">
              Worker App runtime
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Runtime releases & repair source
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              อัปโหลด ZIP ที่ build และ sign แล้วแยกตาม platform ได้ใน release
              เดียวกัน ระบบจะตรวจไฟล์ Whisper.cpp, large-v3, manifest และ
              signature ก่อนให้กด Publish
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refresh();
              void refreshSigningKey();
            }}
            disabled={loading || busy || signingKeyLoading || signingKeyBusy}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          {workerRuntimeIdValues.map(id => {
            const current = catalog?.currentByRuntime[id] ?? null;
            const available = Boolean(current);
            return (
              <div
                key={id}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {labels[id]}
                  </p>
                  {available ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {available
                    ? `Current ${current?.version}`
                    : "Not available / pending build"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
            <div className="text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-900">
                Windows พร้อมใช้งานก่อน, macOS แสดงสถานะ Pending ได้
              </p>
              <p>
                ไม่ต้องแก้ env และไม่มีช่องใส่ private key ใน UI —
                ผู้ดูแลอัปโหลด artifact ที่ sign แล้วเท่านั้น
              </p>
            </div>
          </div>
        </div>

        <section
          aria-labelledby="runtime-signing-key-heading"
          className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Runtime trust key
                </p>
                <h3
                  id="runtime-signing-key-heading"
                  className="mt-1 text-lg font-semibold text-slate-900"
                >
                  Public key สำหรับตรวจ release signature
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
                  ใส่ได้ทั้งไฟล์ public key หรือ copy/paste
                  ข้อมูลลงในช่องด้านล่าง ระบบจะรับเฉพาะ Ed25519 public key
                  และจะไม่รับหรือเก็บ private key
                </p>
              </div>
            </div>
            <Badge
              className={
                signingKey?.active
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }
            >
              {signingKeyLoading
                ? "กำลังตรวจสอบ"
                : signingKey?.active
                  ? "Configured"
                  : "ยังไม่ได้ตั้งค่า"}
            </Badge>
          </div>

          <details className="mt-4 rounded-xl border border-amber-200 bg-white/70 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              คู่มือสร้าง key อย่างปลอดภัย
            </summary>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <p>
                รันคำสั่งบนเครื่องของ Admin ที่จะเก็บ private key แล้วเก็บไฟล์
                private ไว้นอกระบบและห้าม upload เข้ามาในหน้านี้
              </p>
              <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                <code>
                  {
                    "openssl genpkey -algorithm ED25519 -out worker-runtime-signing-private.pem\nopenssl pkey -in worker-runtime-signing-private.pem -pubout -out worker-runtime-signing-public.pem\nchmod 600 worker-runtime-signing-private.pem"
                  }
                </code>
              </pre>
              <p className="text-xs text-slate-600">
                นำเฉพาะไฟล์ <code>worker-runtime-signing-public.pem</code> มา
                upload หรือ copy ข้อมูลมา paste จากนั้นตรวจ fingerprint
                ให้ตรงกับ key ที่ Admin เก็บไว้
              </p>
            </div>
          </details>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div>
              <Label htmlFor="runtime-public-key-file">
                Upload public key file
              </Label>
              <Input
                id="runtime-public-key-file"
                className="mt-2 bg-white"
                type="file"
                accept=".pem,.pub,.txt,application/x-pem-file,text/plain"
                onChange={event => void selectPublicKeyFile(event)}
                disabled={signingKeyBusy}
              />
              <p className="mt-2 text-xs text-slate-600">
                {publicKeyFileName || "รองรับไฟล์ PEM / TXT ที่มี public key"}
              </p>
            </div>
            <div>
              <Label htmlFor="runtime-public-key-text">
                หรือวาง public key ที่นี่
              </Label>
              <Textarea
                id="runtime-public-key-text"
                className="mt-2 min-h-32 bg-white font-mono text-xs"
                value={publicKeyText}
                onChange={event => {
                  setPublicKeyText(event.target.value);
                  setPublicKeyFileName("");
                }}
                placeholder="-----BEGIN PUBLIC KEY-----"
                spellCheck={false}
                disabled={signingKeyBusy}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-xs leading-5 text-slate-600">
              <p className="font-semibold text-rose-700">
                ห้ามวางหรือ upload ไฟล์ที่มีคำว่า PRIVATE KEY
              </p>
              {signingKey?.active ? (
                <p className="mt-1 break-all">
                  Active fingerprint (SHA-256):{" "}
                  {signingKey.active.fingerprintSha256}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={() => void savePublicKey()}
              disabled={
                signingKeyBusy || signingKeyLoading || !publicKeyText.trim()
              }
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {signingKeyBusy ? "กำลังบันทึก…" : "บันทึก public key"}
            </Button>
          </div>

          {signingKey?.history.length ? (
            <div className="mt-4 border-t border-amber-200 pt-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                ประวัติ key ที่เคยใช้
              </p>
              <ul className="mt-1 space-y-1">
                {signingKey.history.map(record => (
                  <li key={record.keyId} className="break-all">
                    {record.keyId} · retired {record.retiredAt}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <div className="grid gap-4 rounded-2xl border border-slate-200 p-4 lg:grid-cols-4">
          <div>
            <Label htmlFor="runtime-version">Version</Label>
            <Input
              id="runtime-version"
              className="mt-2"
              value={version}
              onChange={event => setVersion(event.target.value)}
              placeholder="2026.08.31.1"
            />
          </div>
          <div>
            <Label htmlFor="runtime-target">Runtime target</Label>
            <select
              id="runtime-target"
              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={runtimeId}
              onChange={event =>
                setRuntimeId(event.target.value as WorkerRuntimeId)
              }
            >
              {workerRuntimeIdValues.map(id => (
                <option key={id} value={id}>
                  {labels[id]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="runtime-channel">Channel</Label>
            <select
              id="runtime-channel"
              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={channel}
              onChange={event =>
                setChannel(event.target.value as WorkerRuntimeChannel)
              }
            >
              <option value="stable">stable</option>
              <option value="beta">beta</option>
              <option value="nightly">nightly</option>
            </select>
          </div>
          <div>
            <Label htmlFor="runtime-file">Signed ZIP</Label>
            <Input
              ref={fileInputRef}
              id="runtime-file"
              className="mt-2"
              type="file"
              accept=".zip,application/zip"
              onChange={event => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="lg:col-span-4 flex flex-col gap-2 text-xs text-slate-500">
            <span>
              Expected filename:{" "}
              <code className="rounded bg-slate-100 px-1">{expectedName}</code>
              {file ? ` · ${formatBytes(file.size)}` : ""}
            </span>
            {selectedFileNameMismatch ? (
              <span className="text-rose-600">
                ชื่อไฟล์ไม่ตรงกับ runtime/version ที่เลือก
              </span>
            ) : null}
            <Button
              type="button"
              className="w-fit"
              onClick={() => void upload()}
              disabled={
                busy || selectedFileNameMismatch || !file || !version.trim()
              }
            >
              <CloudUpload className="mr-2 h-4 w-4" />
              {busy ? `Uploading ${progress}%` : "Upload & validate"}
            </Button>
          </div>
        </div>

        {message ? (
          <div
            className={`rounded-xl border p-3 text-sm ${message.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
          >
            {message.text}
          </div>
        ) : null}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              Release history
            </h3>
            <Badge variant="outline">
              {catalog?.releases.length ?? 0} artifacts
            </Badge>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading runtime releases…</p>
          ) : catalog?.releases.length ? (
            <div className="space-y-3">
              {catalog.releases.map(release => (
                <div
                  key={release.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {release.version}
                      </span>
                      <Badge variant="outline">
                        {labels[release.runtimeId]}
                      </Badge>
                      <Badge variant="outline">{release.channel}</Badge>
                      <Badge
                        className={
                          release.isPublished
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }
                      >
                        {release.isPublished
                          ? "Published"
                          : "Validated / pending"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {release.fileName} · {formatBytes(release.fileSizeBytes)}
                    </p>
                    <div
                      className="mt-2 flex flex-wrap gap-1"
                      aria-label="Runtime validation checks"
                    >
                      {release.validationChecks.map(check => (
                        <span
                          key={`${release.id}-${check.id}`}
                          title={check.message}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${check.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                        >
                          {check.status === "ok" ? "✓" : "!"} {check.id}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {release.isPublished ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void action(release, "withdraw")}
                      >
                        Withdraw
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => void action(release, "publish")}
                      >
                        Publish
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              <Upload className="mx-auto mb-2 h-5 w-5" />
              ยังไม่มี runtime artifact ที่ผ่าน validation
            </div>
          )}
        </div>
      </div>
    </DashboardSurface>
  );
}
