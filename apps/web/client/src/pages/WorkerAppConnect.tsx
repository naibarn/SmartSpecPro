import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, Download, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/HelpButton";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

type WorkerConnectStatus = "pending" | "approved" | "denied" | "expired" | "error";

type WorkerConnectSession = {
  status: WorkerConnectStatus;
  userCode: string;
  expiresAt: string;
  createdAt: string;
  worker: {
    id: string;
    displayName: string;
    runtimeType: string;
    machineName: string | null;
  } | null;
  request: {
    displayName: string;
    runtimeType: string;
    machineName: string | null;
    sharingMode: string;
  };
  errorMessage: string | null;
};

type WorkerAppRelease = {
  version: string;
  fileName: string;
  fileSizeBytes: number;
  updatedAt: string;
  downloadUrl: string;
};

function formatBytes(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatRuntimeLabel(runtimeType: string): string {
  if (runtimeType === "desktop_zeroclaw_managed") {
    return "Smart AI Hub Worker App";
  }
  return runtimeType || "-";
}

function getConnectCode(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get("code") || params.get("user_code") || "").trim().toUpperCase();
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error?.message === "string"
        ? payload.error.message
      : typeof payload?.error === "string"
        ? payload.error
        : "Request failed";
    throw new Error(message);
  }
  return payload as T;
}

export default function WorkerAppConnect() {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const { user } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [session, setSession] = useState<WorkerConnectSession | null>(null);
  const [connectCode] = useState(() => getConnectCode());
  const [sessionLoading, setSessionLoading] = useState(Boolean(connectCode));
  const [sessionError, setSessionError] = useState("");
  const [approving, setApproving] = useState(false);
  const [release, setRelease] = useState<WorkerAppRelease | null>(null);
  const [releaseError, setReleaseError] = useState("");
  const [releaseLoading, setReleaseLoading] = useState(true);

  const brandName = tenant?.name || "Smart AI Hub";
  const accountLabel = user?.email || user?.name || (user?.id ? `User #${user.id}` : "บัญชีที่ login อยู่");
  const workspaceId = String(tenant?.id ?? user?.currentTenantId ?? "").trim();
  const workspaceName = tenant?.name || brandName;
  const workspaceDomain = tenant?.primaryDomain || "";

  const expiresLabel = useMemo(
    () => session ? formatDateTime(session.expiresAt) : "-",
    [session],
  );

  async function loadSession(signal?: AbortSignal) {
    if (!connectCode) {
      setSessionLoading(false);
      setSessionError("");
      return;
    }
    setSessionLoading(true);
    try {
      const payload = await fetch(
        `/api/workers/connect/status?user_code=${encodeURIComponent(connectCode)}`,
        { credentials: "include", cache: "no-store", signal },
      ).then((response) => readJsonResponse<{ session: WorkerConnectSession }>(response));
      setSession(payload.session);
      setSessionError("");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setSessionError(error instanceof Error ? error.message : "โหลดคำขอเชื่อมต่อไม่สำเร็จ");
      }
    } finally {
      setSessionLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [connectCode]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setReleaseLoading(true);
    fetch("/api/desktop-releases/worker-app/latest", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => readJsonResponse<{ release: WorkerAppRelease | null }>(response))
      .then((payload) => {
        if (!cancelled) {
          setRelease(payload.release ?? null);
          setReleaseError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setReleaseError(error instanceof Error ? error.message : "โหลดไฟล์ติดตั้งไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReleaseLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  async function approveConnect() {
    if (!connectCode) return;
    if (!workspaceId) {
      toast.error("ไม่พบ workspace จาก URL นี้ กรุณาเปิดลิงก์จาก workspace ที่ต้องการเชื่อมต่ออีกครั้ง");
      return;
    }
    setApproving(true);
    try {
      const payload = await fetch("/api/workers/connect/approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: connectCode, tenantId: workspaceId }),
      }).then((response) => readJsonResponse<{ session: WorkerConnectSession }>(response));
      setSession(payload.session);
      toast.success("อนุญาต Worker App แล้ว กลับไปที่แอปได้เลย");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "อนุญาต Worker App ไม่สำเร็จ");
    } finally {
      setApproving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/dashboard"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับ Dashboard
          </a>
          <HelpButton
            page="/workers/connect"
            topic="grok-via-hermes-worker-app"
            variant="outline"
            size="sm"
            label={isThai ? "คู่มือ Worker App" : "Worker App Help"}
          />
        </div>

        <section className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <Badge className="mb-3 bg-sky-100 text-sky-700 hover:bg-sky-100">
                Smart AI Hub Worker App
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                เชื่อมต่อ Worker App ด้วย Browser Approval
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                เปิดหน้านี้จาก Worker App แล้วกดอนุญาต ระบบจะเชื่อมต่อกลับไปที่แอปให้อัตโนมัติ
                โดยไม่ต้อง copy key, token, username, password หรือ cookie ใด ๆ
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-900">{accountLabel}</div>
              <div>{brandName}</div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                {session?.status === "approved" ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">คำขอเชื่อมต่อ Worker App</h2>
                <p className="text-sm text-slate-500">ตรวจสอบเครื่องและกด Allow เพื่อให้แอปเชื่อมต่อเอง</p>
              </div>
            </div>

            {!connectCode ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                ยังไม่มีรหัสเชื่อมต่อ กรุณากลับไปที่ Smart AI Hub Worker App แล้วกด Connect เพื่อเปิดหน้านี้ใหม่
              </div>
            ) : null}

            {sessionLoading ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังโหลดคำขอเชื่อมต่อ
                </div>
              </div>
            ) : null}

            {sessionError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div className="flex items-start gap-2 font-semibold">
                  <XCircle className="mt-0.5 h-4 w-4" />
                  {sessionError}
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadSession()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  โหลดใหม่
                </Button>
              </div>
            ) : null}

            {session ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-slate-500">Worker</div>
                      <div className="font-semibold text-slate-950">{session.request.displayName}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Machine</div>
                      <div className="font-semibold text-slate-950">{session.request.machineName || "-"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Runtime</div>
                      <div className="font-semibold text-slate-950">
                        {formatRuntimeLabel(session.request.runtimeType)}
                      </div>
                      <div className="text-xs text-slate-500">{session.request.runtimeType}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">หมดอายุ</div>
                      <div className="font-semibold text-slate-950">{expiresLabel}</div>
                    </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">Workspace</div>
                    <p className="text-xs leading-5 text-slate-500">
                      ระบบกำหนด workspace ให้อัตโนมัติจาก URL ที่เปิดหน้านี้
                    </p>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {workspaceName}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">
                  <div className="font-medium">{tenantLoading ? "กำลังตรวจสอบ workspace..." : workspaceName}</div>
                  <div className="text-xs text-slate-500">
                    {workspaceDomain || (workspaceId ? `Workspace ID ${workspaceId}` : "ยังไม่พบ workspace จาก URL")}
                  </div>
                </div>
              </div>

                {session.status === "approved" ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <div className="flex items-start gap-2 font-semibold">
                      <CheckCircle2 className="mt-0.5 h-4 w-4" />
                      เชื่อมต่อสำเร็จ
                    </div>
                    <p className="mt-2">กลับไปที่ Worker App ได้เลย แอปจะรับ token และเปลี่ยนเป็นสถานะ connected อัตโนมัติ</p>
                  </div>
                ) : (
                  <Button onClick={approveConnect} disabled={approving || tenantLoading || !workspaceId || session.status !== "pending"} className="bg-emerald-700 text-white hover:bg-emerald-800">
                    {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Allow this Worker App
                  </Button>
                )}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">ติดตั้ง Worker App</h2>
                <p className="text-sm text-slate-500">Windows installer ล่าสุด</p>
              </div>
            </div>

            {releaseLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                กำลังโหลดไฟล์ติดตั้งล่าสุด...
              </div>
            ) : release ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="font-medium text-slate-950">{release.fileName}</div>
                  <div className="mt-1 text-slate-600">
                    Version {release.version} · {formatBytes(release.fileSizeBytes)}
                  </div>
                  <div className="mt-1 text-slate-500">อัปเดต {formatDateTime(release.updatedAt)}</div>
                </div>
                <a
                  href={release.downloadUrl}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Worker App
                </a>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {releaseError || "ยังไม่พบไฟล์ติดตั้ง Worker App"}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
