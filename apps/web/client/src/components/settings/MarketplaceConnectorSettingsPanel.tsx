import { Button } from "@/components/ui/button";
import { ExternalLink, KeyRound, Microscope, Play, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type GrantStatus = "not_connected" | "pending" | "active" | "expired" | "revoked" | "scope_missing" | "provider_unavailable";

type GrantResponse = {
  status: GrantStatus;
  scopes?: string[];
  providerAccountLabel?: string | null;
  grantHashPrefix?: string | null;
  authorizationAttemptId?: string | null;
  expiresAt?: string | null;
  message?: string | null;
  authorizationUrl?: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message || "Marketplace connector request failed");
  return payload as T;
}

function isInternalAuthorizationUrl(url: string | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin
      && parsed.pathname === "/marketplace-capture/intelligence/connect/authorize";
  } catch {
    return url.startsWith("/marketplace-capture/intelligence/connect/authorize");
  }
}

export function MarketplaceConnectorSettingsPanel() {
  const [status, setStatus] = useState<GrantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveTest, setLiveTest] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setStatus(await requestJson<GrantResponse>("/api/marketplace-connectors/shopee/status"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load connector status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startAuthorize = async () => {
    setLoading(true);
    try {
      const next = await requestJson<GrantResponse>("/api/marketplace-connectors/shopee/authorize/start", {
        method: "POST",
        body: JSON.stringify({ provider: "shopee" }),
      });
      if (isInternalAuthorizationUrl(next.authorizationUrl)) {
        const completed = await requestJson<GrantResponse>("/api/marketplace-connectors/shopee/authorize/complete", {
          method: "POST",
          body: JSON.stringify({
            provider: "shopee",
            ...(next.authorizationAttemptId ? { authorizationAttemptId: next.authorizationAttemptId } : {}),
          }),
        });
        setStatus(completed);
        toast.success("Connector authorized");
      } else {
        setStatus(next);
        if (next.authorizationUrl) window.open(next.authorizationUrl, "_blank", "noopener,noreferrer");
        toast.success("Authorization page opened");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start authorization");
    } finally {
      setLoading(false);
    }
  };

  const completeAuthorize = async () => {
    setLoading(true);
    try {
      const next = await requestJson<GrantResponse>("/api/marketplace-connectors/shopee/authorize/complete", {
        method: "POST",
        body: JSON.stringify({ provider: "shopee", authorizationAttemptId: status?.authorizationAttemptId ?? undefined }),
      });
      setStatus(next);
      toast.success("Connector authorized");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete authorization");
    } finally {
      setLoading(false);
    }
  };

  const revoke = async () => {
    setLoading(true);
    try {
      setStatus(await requestJson<GrantResponse>("/api/marketplace-connectors/shopee/revoke", {
        method: "POST",
        body: JSON.stringify({ provider: "shopee" }),
      }));
      toast.success("Connector access revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke connector access");
    } finally {
      setLoading(false);
    }
  };

  const checkWritebackReadiness = async () => {
    setLoading(true);
    setLiveTest({ tone: "info", message: "Checking SmartSpecPro write-back readiness..." });
    try {
      const next = await requestJson<GrantResponse>("/api/marketplace-connectors/shopee/status");
      setStatus(next);
      if (next.status !== "active") {
        throw new Error("Write-back grant is not active. Authorize this connection before saving Shopee MCP results.");
      }
      setLiveTest({
        tone: "success",
        message: "Write-back is ready. Use the Shopee app in the OpenAI host, then call SmartSpecPro MCP/API to save the returned search results.",
      });
      toast.success("Marketplace write-back is ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Marketplace write-back readiness check failed";
      setLiveTest({ tone: "error", message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const currentStatus = status?.status ?? "not_connected";
  const active = currentStatus === "active";
  const pending = currentStatus === "pending";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <KeyRound className="h-4 w-4 text-sky-600" />
            Shopee marketplace connector
          </div>
          <p className="max-w-3xl text-sm text-gray-600">
            User-level connection สำหรับทดสอบ field discovery, keyword snapshot และ report evidence โดยไม่เก็บ marketplace password ในระบบ.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-emerald-100 text-emerald-700" : pending ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
          {currentStatus}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Info label="Scopes" value={status?.scopes?.join(", ") || "-"} />
        <Info label="Grant hash" value={status?.grantHashPrefix || "-"} />
        <Info label="Expires" value={status?.expiresAt ? new Date(status.expiresAt).toLocaleString() : "-"} />
        <Info label="Account" value={status?.providerAccountLabel || "Shopee connector"} />
      </div>

      {status?.message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{status.message}</p>}
      {liveTest ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
          liveTest.tone === "success"
            ? "bg-emerald-50 text-emerald-700"
            : liveTest.tone === "error"
              ? "bg-red-50 text-red-700"
              : "bg-sky-50 text-sky-700"
        }`}>
          {liveTest.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={startAuthorize} disabled={loading}>
          <ExternalLink className="mr-2 h-4 w-4" /> Authorize in browser
        </Button>
        {pending && (
          <Button size="sm" variant="outline" onClick={completeAuthorize} disabled={loading}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Confirm authorization
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh status
        </Button>
        <Button size="sm" variant="outline" onClick={checkWritebackReadiness} disabled={loading || !active}>
          <Play className="mr-2 h-4 w-4" /> Check write-back
        </Button>
        <Button size="sm" variant="destructive" onClick={revoke} disabled={loading || currentStatus === "not_connected"}>
          <Trash2 className="mr-2 h-4 w-4" /> Revoke
        </Button>
        <Link href="/marketplace-capture/intelligence/connector-lab">
          <Button size="sm" variant="outline"><Microscope className="mr-2 h-4 w-4" /> Open Connector Lab</Button>
        </Link>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
