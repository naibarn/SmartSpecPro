import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";

type GrantStatus = "not_connected" | "pending" | "active" | "expired" | "revoked" | "scope_missing" | "provider_unavailable";

type AuthorizeStartResponse = {
  status?: GrantStatus;
  authorizationUrl?: string;
  authorizationAttemptId?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  grantHashPrefix?: string | null;
  providerAccountLabel?: string | null;
  error?: {
    message?: string;
  };
};

type GrantStatusResponse = {
  status: GrantStatus;
  scopes?: string[];
  expiresAt?: string | null;
  revokedAt?: string | null;
  grantHashPrefix?: string | null;
  authorizationAttemptId?: string | null;
  providerAccountLabel?: string | null;
  message?: string | null;
  error?: {
    message?: string;
  };
};

type GrantEvent = {
  type: string;
  at: string;
  message: string;
};

function copyFor(language: string) {
  const th = language.startsWith("th");
  return {
    title: th ? "เชื่อมต่อ Shopee Connector" : "Connect Shopee Connector",
    subtitle: th
      ? "ยืนยันสิทธิ์ผ่าน browser ก่อนใช้ live connector และเก็บข้อมูลที่อนุญาตไว้เป็น marketplace intelligence"
      : "Confirm browser authorization before using live connector data for marketplace intelligence.",
    status: th ? "สถานะ" : "Status",
    notConnected: th ? "ยังไม่ได้เชื่อมต่อ" : "Not connected",
    authorizationStarted: th ? "เปิดหน้าขอสิทธิ์แล้ว" : "Authorization page opened",
    active: th ? "เชื่อมต่อแล้ว" : "Connected",
    expired: th ? "สิทธิ์หมดอายุ" : "Expired",
    revoked: th ? "ยกเลิกสิทธิ์แล้ว" : "Revoked",
    scopeMissing: th ? "สิทธิ์ไม่ครบ" : "Scope missing",
    providerUnavailable: th ? "Provider ใช้งานไม่ได้" : "Provider unavailable",
    authorize: th ? "Authorize in browser" : "Authorize in browser",
    revoke: th ? "Revoke access" : "Revoke access",
    openLab: th ? "เปิด Connector Lab" : "Open Connector Lab",
    scopeTitle: th ? "ขอบเขตข้อมูลที่จะใช้" : "Data scope",
    retentionTitle: th ? "Retention" : "Retention",
    retention: th ? "Raw payload จะถูก redacted และใช้เพื่อ field discovery เท่านั้น" : "Raw payloads are redacted and used for field discovery only.",
    authorizeStartedToast: th ? "เปิดหน้าขอสิทธิ์แล้ว กลับมาที่ SmartSpecPro หลังยืนยันเสร็จ" : "Authorization page opened. Return to SmartSpecPro after completing the provider flow.",
    complete: th ? "ฉันยืนยันใน provider แล้ว" : "I completed provider authorization",
    completedToast: th ? "ยืนยันสิทธิ์ใน SmartSpecPro แล้ว" : "Connector grant confirmed in SmartSpecPro",
    authorizeStartFailed: th ? "เริ่มขอสิทธิ์ไม่สำเร็จ" : "Could not start authorization",
    revokedToast: th ? "ยกเลิกสิทธิ์แล้ว" : "Access revoked",
    refresh: th ? "Refresh status" : "Refresh status",
    scopes: th ? "Scopes" : "Scopes",
    expiresAt: th ? "หมดอายุ" : "Expires",
    grantHash: th ? "Grant hash" : "Grant hash",
    recentEvents: th ? "เหตุการณ์ล่าสุด" : "Recent events",
    disabledTitle: th ? "Connector authorization ยังไม่เปิดใช้งาน" : "Connector authorization is not enabled",
    disabledBody: th
      ? "เปิด marketplaceConnectorLabEnabled ใน Tenant Feature Flags เพื่อทดสอบ flow นี้"
      : "Enable marketplaceConnectorLabEnabled in Tenant Feature Flags to test this flow.",
  };
}

function language() {
  if (typeof navigator === "undefined") return "en";
  return navigator.language || "en";
}

function statusLabel(status: GrantStatus, copy: ReturnType<typeof copyFor>) {
  if (status === "pending") return copy.authorizationStarted;
  if (status === "active") return copy.active;
  if (status === "expired") return copy.expired;
  if (status === "revoked") return copy.revoked;
  if (status === "scope_missing") return copy.scopeMissing;
  if (status === "provider_unavailable") return copy.providerUnavailable;
  return copy.notConnected;
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

function isInternalAuthorizationUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin
      && parsed.pathname === "/marketplace-capture/intelligence/connect/authorize";
  } catch {
    return url.startsWith("/marketplace-capture/intelligence/connect/authorize");
  }
}

export default function MarketplaceConnectorConnect() {
  const copy = copyFor(language());
  const connectorLabEnabled = useTenantFeatureFlag("marketplaceConnectorLabEnabled");
  const [status, setStatus] = useState<GrantStatus>("not_connected");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [grantHashPrefix, setGrantHashPrefix] = useState<string | null>(null);
  const [authorizationAttemptId, setAuthorizationAttemptId] = useState<string | null>(null);
  const [events, setEvents] = useState<GrantEvent[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [lastAuthorizeUrl, setLastAuthorizeUrl] = useState<string | null>(null);

  function applyGrantStatus(payload: GrantStatusResponse | AuthorizeStartResponse) {
    if (
      payload.status === "not_connected" ||
      payload.status === "pending" ||
      payload.status === "active" ||
      payload.status === "expired" ||
      payload.status === "revoked" ||
      payload.status === "scope_missing" ||
      payload.status === "provider_unavailable"
    ) {
      setStatus(payload.status);
    }
    setScopes(Array.isArray(payload.scopes) ? payload.scopes : []);
    setExpiresAt(payload.expiresAt ?? null);
    setGrantHashPrefix(payload.grantHashPrefix ?? null);
    setAuthorizationAttemptId(payload.authorizationAttemptId ?? null);
  }

  async function refreshStatus() {
    setIsLoadingStatus(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/status");
      const payload = await readJson<GrantStatusResponse>(response);
      if (!response.ok) throw new Error(payload.error?.message || "Could not load connector status");
      applyGrantStatus(payload);
      const eventsResponse = await fetch("/api/marketplace-connectors/shopee/events");
      const eventsPayload = await readJson<{ events?: GrantEvent[] }>(eventsResponse);
      setEvents(Array.isArray(eventsPayload.events) ? eventsPayload.events : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load connector status");
    } finally {
      setIsLoadingStatus(false);
    }
  }

  useEffect(() => {
    if (connectorLabEnabled) void refreshStatus();
  }, [connectorLabEnabled]);

  if (!connectorLabEnabled) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border bg-white p-6 shadow-sm">
          <Badge variant="secondary">marketplaceConnectorLabEnabled</Badge>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal">{copy.disabledTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{copy.disabledBody}</p>
        </section>
      </main>
    );
  }

  async function authorize() {
    setIsAuthorizing(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/authorize/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "shopee" }),
      });
      const payload = await readJson<AuthorizeStartResponse>(response);
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.error?.message || copy.authorizeStartFailed);
      }
      applyGrantStatus(payload);
      if (isInternalAuthorizationUrl(payload.authorizationUrl)) {
        await completeAuthorization(payload.authorizationAttemptId ?? null);
      } else {
        setLastAuthorizeUrl(payload.authorizationUrl);
        window.open(payload.authorizationUrl, "_blank", "noopener,noreferrer");
        toast.success(copy.authorizeStartedToast);
      }
      void refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.authorizeStartFailed);
    } finally {
      setIsAuthorizing(false);
    }
  }

  async function completeAuthorization(attemptId: string | null = authorizationAttemptId) {
    setIsCompleting(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/authorize/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "shopee",
          ...(attemptId ? { authorizationAttemptId: attemptId } : {}),
        }),
      });
      const payload = await readJson<GrantStatusResponse>(response);
      if (!response.ok) throw new Error(payload.error?.message || copy.authorizeStartFailed);
      applyGrantStatus(payload);
      toast.success(copy.completedToast);
      void refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.authorizeStartFailed);
    } finally {
      setIsCompleting(false);
    }
  }

  async function revoke() {
    setIsRevoking(true);
    try {
      const response = await fetch("/api/marketplace-connectors/shopee/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "shopee" }),
      });
      const payload = await readJson<GrantStatusResponse>(response);
      if (!response.ok) throw new Error(payload.error?.message || "Could not revoke connector grant");
      applyGrantStatus(payload);
      toast.success(copy.revokedToast);
      void refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke connector grant");
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="rounded-lg border bg-white p-5 shadow-sm">
          <section className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Shopee</Badge>
            <Badge variant={status === "active" ? "default" : "secondary"}>{statusLabel(status, copy)}</Badge>
          </section>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{copy.subtitle}</p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                {copy.scopeTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="grid gap-3 text-sm text-slate-700">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> Search keyword result fields visible to the authorized connector.</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> Seller, rank, price, review, rating, badge, and raw field diagnostics when available.</li>
                <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /> No external account password or marketplace credential is stored in SmartSpecPro.</li>
              </ul>
              <section className="rounded-md bg-slate-100 p-3 text-sm leading-6 text-slate-700">
                <p className="font-medium">{copy.retentionTitle}</p>
                <p>{copy.retention}</p>
              </section>
              <section className="flex flex-wrap gap-2">
                <Button type="button" onClick={authorize} disabled={isAuthorizing}>
                  {isAuthorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  {copy.authorize}
                </Button>
                {lastAuthorizeUrl ? (
                  <Button asChild type="button" variant="outline">
                    <a href={lastAuthorizeUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {copy.authorizationStarted}
                    </a>
                  </Button>
                ) : null}
                {status === "pending" ? (
                  <Button type="button" variant="outline" onClick={() => void completeAuthorization()} disabled={isCompleting}>
                    {isCompleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {copy.complete}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={refreshStatus} disabled={isLoadingStatus}>
                  {isLoadingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {copy.refresh}
                </Button>
                <Button type="button" variant="destructive" onClick={revoke} disabled={isRevoking}>
                  {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {copy.revoke}
                </Button>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4" />
                {copy.status}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <section className="rounded-md border bg-white p-4">
                <p className="text-xs text-slate-500">Connector</p>
                <p className="mt-1 font-medium">Shopee</p>
              </section>
              <section className="rounded-md border bg-white p-4">
                <p className="text-xs text-slate-500">{copy.status}</p>
                <p className="mt-1 font-medium">{statusLabel(status, copy)}</p>
              </section>
              <section className="rounded-md border bg-white p-4">
                <p className="text-xs text-slate-500">{copy.scopes}</p>
                <p className="mt-1 text-sm">{scopes.length ? scopes.join(", ") : "-"}</p>
              </section>
              <section className="rounded-md border bg-white p-4">
                <p className="text-xs text-slate-500">{copy.expiresAt}</p>
                <p className="mt-1 text-sm">{expiresAt ? new Date(expiresAt).toLocaleString() : "-"}</p>
              </section>
              <section className="rounded-md border bg-white p-4">
                <p className="text-xs text-slate-500">{copy.grantHash}</p>
                <p className="mt-1 font-mono text-sm">{grantHashPrefix ?? "-"}</p>
              </section>
              <section className="rounded-md border bg-white p-4">
                <p className="text-xs text-slate-500">{copy.recentEvents}</p>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {events.length ? events.slice(0, 3).map((event) => (
                    <li key={`${event.type}-${event.at}`}>{event.message}</li>
                  )) : <li>-</li>}
                </ul>
              </section>
              <Button asChild className="w-full">
                <Link href="/marketplace-capture/intelligence/connector-lab">{copy.openLab}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}
