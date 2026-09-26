import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help/HelpButton";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";

type RunnerConnectStatus = "pending" | "approved" | "expired" | "error";

type RunnerConnectSession = {
  status: RunnerConnectStatus;
  userCode: string;
  expiresAt: string;
  createdAt: string;
  request: {
    displayName: string;
    deviceId: string;
  };
  runner: {
    id: string;
    displayName: string;
    profile: string;
    nodeKind: string;
    deviceId: string | null;
  } | null;
  errorMessage: string | null;
};

function getConnectCode(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get("code") || params.get("user_code") || "")
    .trim()
    .toUpperCase();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
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

export default function RunnerConnect() {
  const { i18n } = useTranslation();
  const isThai =
    i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const { user } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [session, setSession] = useState<RunnerConnectSession | null>(null);
  const [connectCode] = useState(() => getConnectCode());
  const [sessionLoading, setSessionLoading] = useState(Boolean(connectCode));
  const [sessionError, setSessionError] = useState("");
  const [approving, setApproving] = useState(false);

  const accountLabel = user?.email || user?.name || "บัญชีที่ login อยู่";
  const expiresLabel = useMemo(
    () => (session ? formatDateTime(session.expiresAt) : "-"),
    [session]
  );

  async function loadSession(signal?: AbortSignal) {
    if (!connectCode) {
      setSessionLoading(false);
      return;
    }
    setSessionLoading(true);
    try {
      const payload = await fetch(
        `/api/runners/connect/status?user_code=${encodeURIComponent(connectCode)}`,
        { credentials: "include", cache: "no-store", signal }
      ).then(response =>
        readJsonResponse<{ session: RunnerConnectSession }>(response)
      );
      setSession(payload.session);
      setSessionError("");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setSessionError(
          error instanceof Error ? error.message : "โหลดคำขอเชื่อมต่อไม่สำเร็จ"
        );
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

  async function approveConnect() {
    if (!connectCode) return;
    setApproving(true);
    try {
      const payload = await fetch("/api/runners/connect/approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: connectCode }),
      }).then(response =>
        readJsonResponse<{ session: RunnerConnectSession }>(response)
      );
      setSession(payload.session);
      toast.success("อนุญาต Runner แล้ว กลับไปที่ Runner ได้เลย");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "อนุญาต Runner ไม่สำเร็จ"
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/dashboard"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับ Dashboard
          </a>
          <HelpButton
            page="/runners/connect"
            topic="runner-connection"
            variant="outline"
            size="sm"
            label={isThai ? "คู่มือ Runner" : "Runner Help"}
          />
        </div>

        <section className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <Badge className="mb-3 bg-sky-100 text-sky-700 hover:bg-sky-100">
                SmartAIHub Runner
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                เชื่อมต่อ SmartAIHub Runner
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                ตรวจสอบชื่ออุปกรณ์ แล้วกด Allow เพื่ออนุญาตการเชื่อมต่อกลับไปที่
                Runner ระบบยืนยันตัวตนจากบัญชีที่ login
                อยู่และจัดการข้อมูลลับในเครื่อง Runner อัตโนมัติ
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-900">{accountLabel}</div>
              <div>{tenant?.name || "Smart AI Hub"}</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              {session?.status === "approved" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                คำขอเชื่อมต่อ Runner
              </h2>
              <p className="text-sm text-slate-500">
                ตรวจสอบอุปกรณ์และกด Allow เพื่อเชื่อมต่อ
              </p>
            </div>
          </div>

          {!connectCode ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              ยังไม่มีคำขอเชื่อมต่อ กรุณากลับไปที่ Runner แล้วกด Connect
              อีกครั้ง
            </div>
          ) : null}

          {sessionLoading ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังตรวจสอบคำขอเชื่อมต่อ
              </div>
            </div>
          ) : null}

          {sessionError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-start gap-2 font-semibold">
                <XCircle className="mt-0.5 h-4 w-4" />
                {sessionError}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void loadSession()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                โหลดใหม่
              </Button>
            </div>
          ) : null}

          {session ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-slate-500">Runner</div>
                  <div className="font-semibold text-slate-950">
                    {session.request.displayName}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">อุปกรณ์</div>
                  <div className="font-semibold text-slate-950">
                    {session.request.deviceId}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">หมดอายุ</div>
                  <div className="font-semibold text-slate-950">
                    {expiresLabel}
                  </div>
                </div>
              </div>

              {session.status === "approved" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-start gap-2 font-semibold">
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                    เชื่อมต่อสำเร็จ
                  </div>
                  <p className="mt-2">
                    กลับไปที่ Runner ได้เลย ระบบจะรับสถานะการเชื่อมต่ออัตโนมัติ
                  </p>
                </div>
              ) : (
                <Button
                  onClick={approveConnect}
                  disabled={
                    approving || tenantLoading || session.status !== "pending"
                  }
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {approving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Allow this Runner
                </Button>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
