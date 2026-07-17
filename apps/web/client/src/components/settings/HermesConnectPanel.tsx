/**
 * HermesConnectPanel — Settings → AI Providers → "Grok via Hermes"
 * (Feature 135, section-10).
 *
 * Structure (spec §4.2): availability header (fail-closed disabled
 * explanation), connection list (status/scope/capability, default toggles,
 * probe/disconnect, entitlement/reauth copy blocks), a per-scope connect flow
 * (one-time consent → device-code screen → done/error), and an admin-only
 * sub-panel for `server_shared` (the SINGLE authoritative surface for admin
 * mutations — connect shared / quota / disable. Section-12's
 * `HermesWorkerAdminPanel` in AdminMonitoring is read-only observability and
 * links here for changes).
 *
 * Never logs/toasts/persists the device user code — component state only.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Cable,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { hermesErrorCopy, type HermesMediaErrorCode } from "@shared/hermesMedia";
import { formatHermesErrorForToast, presentHermesError } from "@/lib/hermesErrorPresentation";

type HermesScope = "server_shared" | "server_personal" | "private_worker";

const SCOPE_LABEL: Record<HermesScope, string> = {
  server_shared: "ส่วนกลาง",
  server_personal: "ส่วนตัวบนเซิร์ฟเวอร์",
  private_worker: "เครื่องของฉัน",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "กำลังเชื่อมต่อ",
  authorized: "เชื่อมต่อแล้ว",
  reauth_required: "ต้องเชื่อมต่อใหม่",
  entitlement_restricted: "ถูกจำกัดสิทธิ์",
  disconnected: "ยกเลิกการเชื่อมต่อแล้ว",
  error: "เกิดข้อผิดพลาด",
};

/** Thai-locale timestamp for `capabilitySummary.probedAt` — same convention
 *  (Gregorian calendar, Asia/Bangkok) as `McpConnectPanel.tsx`'s own
 *  `formatThaiDateTime`, duplicated per this feature's established
 *  "duplicate small per-surface helpers" convention. */
function formatThaiDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    calendar: "gregory",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Renders `capabilitySummary.lastGenerationTest` (Feature 135 §6.1) as a
 *  single Thai line for the capability summary — success gets the probed
 *  timestamp via `formatThaiDateTime`; failure resolves the frozen error
 *  code to its human Thai copy via `presentHermesError` (never a bare code).
 *  Returns `null` when no test has ever been run for the connection. */
function formatLastGenerationTestLine(
  test: HermesConnectionRow["capabilitySummary"]["lastGenerationTest"],
): string | null {
  if (!test) return null;
  const assetLabel = test.assetType === "image" ? "ภาพ" : "วิดีโอ";
  if (test.ok) {
    const at = formatThaiDateTime(test.at);
    return at ? `ทดสอบสร้าง${assetLabel}สำเร็จ ${at} น.` : `ทดสอบสร้าง${assetLabel}สำเร็จ`;
  }
  const presentation = presentHermesError({ errorCode: test.errorCode });
  return presentation
    ? `ทดสอบสร้าง${assetLabel}ไม่สำเร็จ: ${presentation.th}`
    : `ทดสอบสร้าง${assetLabel}ไม่สำเร็จ`;
}

/** mm:ss countdown to `expiresAt` (or a fixed "expired" string past zero).
 *  Pure/exported for direct unit testing without mounting the device-code
 *  screen. */
export function formatHermesDeviceCodeCountdown(
  expiresAt: string | null | undefined,
  nowMs: number,
): string {
  if (!expiresAt) return "";
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return "";
  const remainingSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  if (remainingSeconds <= 0) return "หมดอายุแล้ว";
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface HermesConnectionRow {
  id: string;
  scope: HermesScope;
  status: string;
  accountLabel: string | null;
  accountHint: string | null;
  defaultForImage: boolean;
  defaultForVideo: boolean;
  entitlementStatus: string | null;
  assignedWorkerId: string | null;
  assignedWorkerOnline: boolean;
  capabilitySummary: {
    probedAt: string | null;
    imageEnabled: boolean;
    videoEnabled: boolean;
    maxEditReferences: number | null;
    /** Feature 135 §6.1 — most recent live "test generation" liveness-check
     *  result for this connection, `null` when one has never been run. */
    lastGenerationTest: {
      assetType: "image" | "video";
      ok: boolean;
      at: string;
      errorCode?: HermesMediaErrorCode;
    } | null;
  };
  dailyJobQuota: number | null;
  createdAt: string;
  authorizedAt: string | null;
}

interface HermesConnectedWorkerRow {
  workerId: string;
  displayName: string;
  status: string;
}

const CONSENT_NOTICE_TH =
  "prompt และรูปอ้างอิงของงานที่ส่งผ่านการเชื่อมต่อนี้จะถูกส่งไปยัง xAI ภายใต้บัญชี Grok ที่เชื่อมต่อ และอยู่ภายใต้ข้อกำหนดของ xAI";
const CONSENT_NOTICE_EN =
  "Prompts and reference images for jobs sent through this connection will be transmitted to xAI under the connected Grok account, subject to xAI's terms.";
const SHARED_SCOPE_ADDENDUM_TH =
  "บัญชีนี้เป็นบัญชีกลาง — prompt และรูปของผู้ใช้ทุกคนใน tenant ที่ใช้ pool นี้จะถูกส่งผ่านบัญชี Grok นี้";
const DISCONNECT_PENDING_NOTICE_TH =
  "จะยกเลิกการเชื่อมต่อเมื่องานบนเครื่องทำงานเสร็จ";
const CONTACT_ADMIN_NOTICE_TH = "ติดต่อผู้ดูแลระบบ";
const CONTACT_ADMIN_NOTICE_EN = "Contact your admin";

/** `server_shared` rows are visible tenant-wide (any member can see them in
 *  the connection list), but only an admin may drive their connect flow —
 *  the server's `startHermesConnect` throws FORBIDDEN for a non-admin
 *  `server_shared` request. This gates the "เชื่อมต่อใหม่/Reconnect" CTA so a
 *  non-admin never walks the whole consent + device-code UI only to hit a
 *  raw server error at the end; `server_personal`/`private_worker` rows have
 *  no such restriction (the caller always owns those). */
function canReconnectScope(scope: HermesScope, isAdmin: boolean): boolean {
  return scope === "server_shared" ? isAdmin : true;
}

export function HermesConnectPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const availability = trpc.hermesConnections.getAvailability.useQuery();
  const connections = trpc.hermesConnections.listConnections.useQuery(undefined, {
    retry: false,
  });
  const connectedWorkers = trpc.users.listConnectedWorkers.useQuery(undefined, {
    retry: false,
  });
  const adminConnections = trpc.hermesConnections.adminList.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
  });

  const [flowScope, setFlowScope] = useState<HermesScope | null>(null);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [connectingConnectionId, setConnectingConnectionId] = useState<string | null>(null);
  const [quotaDraftByConnectionId, setQuotaDraftByConnectionId] = useState<Record<string, string>>({});

  const onlineWorkers = ((connectedWorkers.data?.workers ?? []) as HermesConnectedWorkerRow[]).filter(
    (worker) => worker.status === "online",
  );

  const startConnect = trpc.hermesConnections.startConnect.useMutation({
    onSuccess: (result) => {
      setConnectingConnectionId(result.connectionId);
    },
    onError: (error) => toast.error(error.message),
  });

  const connectStatus = trpc.hermesConnections.getConnectStatus.useQuery(
    { connectionId: connectingConnectionId ?? "" },
    {
      enabled: Boolean(connectingConnectionId),
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const status = query.state.data?.status;
        return status && status !== "pending" ? false : 2500;
      },
    },
  );

  const setDefault = trpc.hermesConnections.setDefault.useMutation({
    onSuccess: async () => {
      toast.success("ตั้งค่าบัญชีเริ่มต้นแล้ว");
      await utils.hermesConnections.listConnections.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const disconnect = trpc.hermesConnections.disconnect.useMutation({
    onSuccess: async () => {
      toast.info(DISCONNECT_PENDING_NOTICE_TH);
      await utils.hermesConnections.listConnections.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const probe = trpc.hermesConnections.probe.useMutation({
    onSuccess: async () => {
      toast.success("ตรวจสอบการเชื่อมต่อแล้ว");
      await utils.hermesConnections.listConnections.invalidate();
    },
    onError: (error) => {
      // A live test-generation call can hit HERMES_RATE_LIMITED (with a
      // retryAfterSeconds hint) or any other typed code, not just the plain
      // probe's connection errors — route through the same
      // presentHermesError/formatHermesErrorForToast path every other
      // Hermes surface in this codebase uses instead of leaking the raw
      // "[HERMES_X] ..." message.
      const hermesPresentation = presentHermesError(error);
      toast.error(
        hermesPresentation ? formatHermesErrorForToast(hermesPresentation, "th") : error.message,
      );
    },
  });
  const adminSetQuota = trpc.hermesConnections.adminSetQuota.useMutation({
    onSuccess: async () => {
      toast.success("บันทึกโควต้าแล้ว");
      await utils.hermesConnections.adminList.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const adminDisable = trpc.hermesConnections.adminDisable.useMutation({
    onSuccess: async () => {
      toast.success("ปิดใช้งานบัญชีนี้แล้ว");
      await utils.hermesConnections.adminList.invalidate();
      await utils.hermesConnections.listConnections.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // Terminal `authorized` → success toast + invalidate + reset the flow.
  // Guarded by a ref so this fires exactly once per connectingConnectionId
  // even while the (now-stopped) polling query keeps returning cached data.
  const authorizedHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connectingConnectionId) return;
    if (
      connectStatus.data?.status === "authorized" &&
      authorizedHandledRef.current !== connectingConnectionId
    ) {
      authorizedHandledRef.current = connectingConnectionId;
      toast.success("เชื่อมต่อบัญชี Grok สำเร็จ");
      void utils.hermesConnections.listConnections.invalidate();
      setFlowScope(null);
      setConnectingConnectionId(null);
    }
  }, [connectStatus.data?.status, connectingConnectionId, utils]);

  function openConnectFlow(scope: HermesScope) {
    setFlowScope(scope);
    setConsentAcknowledged(false);
    setConnectingConnectionId(null);
    setSelectedWorkerId(onlineWorkers.length === 1 ? onlineWorkers[0].workerId : null);
  }

  function closeConnectFlow() {
    setFlowScope(null);
    setConsentAcknowledged(false);
    setSelectedWorkerId(null);
    setConnectingConnectionId(null);
  }

  function confirmConsentAndConnect() {
    if (!flowScope || !consentAcknowledged) return;
    if (flowScope === "private_worker" && !selectedWorkerId) return;
    startConnect.mutate({
      scope: flowScope,
      consentAcknowledged: true,
      ...(flowScope === "private_worker" && selectedWorkerId
        ? { workerId: selectedWorkerId }
        : {}),
    });
  }

  if (availability.data && availability.data.enabled === false) {
    return (
      <DashboardCard className="p-5">
        <div className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-950">Grok via Hermes</h2>
        </div>
        <p
          className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-600"
          data-testid="hermes-panel-disabled-explanation"
        >
          ฟีเจอร์นี้ปิดอยู่ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ
        </p>
      </DashboardCard>
    );
  }

  const connectionRows = (connections.data ?? []) as HermesConnectionRow[];
  const scopes = availability.data?.scopes;

  return (
    <DashboardCard className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-violet-600" />
            <h2 className="text-base font-semibold text-gray-950">Grok via Hermes</h2>
            <Badge variant="outline">Hermes</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            เชื่อมต่อบัญชี Grok ของคุณผ่าน Hermes worker เพื่อสร้างภาพและวิดีโอโดยใช้เครดิตของบัญชีนั้นเอง
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => connections.refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Connection list */}
      <div className="mt-4 space-y-3">
        {connectionRows.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-gray-500">
            ยังไม่มีบัญชี Grok ที่เชื่อมต่อ
          </div>
        ) : (
          connectionRows.map((row) => {
            const lastGenerationTestLine = formatLastGenerationTestLine(
              row.capabilitySummary.lastGenerationTest,
            );
            return (
            <div
              key={row.id}
              className="rounded-md border p-3"
              data-testid={`hermes-connection-row-${row.id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={row.status === "authorized" ? "default" : "outline"}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
                <Badge variant="outline">{SCOPE_LABEL[row.scope]}</Badge>
                <span className="font-medium text-gray-950">
                  {row.accountLabel ?? row.accountHint ?? row.id}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {`ภาพ: ${row.capabilitySummary.imageEnabled ? "รองรับ" : "ไม่รองรับ"} · วิดีโอ: ${row.capabilitySummary.videoEnabled ? "รองรับ" : "ไม่รองรับ"}`}
                {row.capabilitySummary.maxEditReferences != null
                  ? ` · อ้างอิงสูงสุด ${row.capabilitySummary.maxEditReferences}`
                  : ""}
                {formatThaiDateTime(row.capabilitySummary.probedAt)
                  ? ` · ตรวจสอบล่าสุด ${formatThaiDateTime(row.capabilitySummary.probedAt)} น.`
                  : ""}
              </div>
              {lastGenerationTestLine ? (
                <div
                  className={`mt-1 text-xs ${
                    row.capabilitySummary.lastGenerationTest?.ok ? "text-emerald-600" : "text-red-600"
                  }`}
                  data-testid={`hermes-generation-test-result-${row.id}`}
                >
                  {lastGenerationTestLine}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label={`ตั้งเป็นค่าเริ่มต้นสำหรับภาพ — ${row.accountLabel ?? row.id}`}
                    checked={row.defaultForImage}
                    onChange={() => setDefault.mutate({ connectionId: row.id, assetType: "image" })}
                  />
                  ค่าเริ่มต้น (ภาพ)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label={`ตั้งเป็นค่าเริ่มต้นสำหรับวิดีโอ — ${row.accountLabel ?? row.id}`}
                    checked={row.defaultForVideo}
                    onChange={() => setDefault.mutate({ connectionId: row.id, assetType: "video" })}
                  />
                  ค่าเริ่มต้น (วิดีโอ)
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={probe.isPending}
                  onClick={() => probe.mutate({ connectionId: row.id })}
                >
                  {probe.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  ตรวจสอบ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={probe.isPending}
                  data-testid={`hermes-test-image-button-${row.id}`}
                  onClick={() => probe.mutate({ connectionId: row.id, testGeneration: "image" })}
                >
                  {probe.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  ทดสอบสร้างภาพ
                </Button>
                {row.capabilitySummary.videoEnabled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={probe.isPending}
                    data-testid={`hermes-test-video-button-${row.id}`}
                    onClick={() => probe.mutate({ connectionId: row.id, testGeneration: "video" })}
                  >
                    {probe.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    ทดสอบสร้างวิดีโอ
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600"
                  onClick={() => disconnect.mutate({ connectionId: row.id })}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  ยกเลิกการเชื่อมต่อ
                </Button>
              </div>

              {row.status === "entitlement_restricted" ? (
                <div
                  className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
                  data-testid={`hermes-entitlement-restricted-${row.id}`}
                >
                  <p>{hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").th}</p>
                  <p className="mt-1 text-amber-700">
                    {hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").en}
                  </p>
                  {canReconnectScope(row.scope, isAdmin) ? (
                    <Button size="sm" className="mt-2" onClick={() => openConnectFlow(row.scope)}>
                      เชื่อมต่อใหม่
                    </Button>
                  ) : (
                    <p
                      className="mt-2 text-amber-700"
                      data-testid={`hermes-reconnect-contact-admin-${row.id}`}
                    >
                      {CONTACT_ADMIN_NOTICE_TH} / {CONTACT_ADMIN_NOTICE_EN}
                    </p>
                  )}
                </div>
              ) : null}

              {row.status === "reauth_required" ? (
                <div
                  className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800"
                  data-testid={`hermes-reauth-required-${row.id}`}
                >
                  <p>{hermesErrorCopy("HERMES_REAUTH_REQUIRED").th}</p>
                  {canReconnectScope(row.scope, isAdmin) ? (
                    <Button size="sm" className="mt-2" onClick={() => openConnectFlow(row.scope)}>
                      เชื่อมต่อใหม่
                    </Button>
                  ) : (
                    <p
                      className="mt-2 text-red-700"
                      data-testid={`hermes-reconnect-contact-admin-${row.id}`}
                    >
                      {CONTACT_ADMIN_NOTICE_TH} / {CONTACT_ADMIN_NOTICE_EN}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            );
          })
        )}
      </div>

      {/* Connect flow entry points — server_shared is admin-only and lives
          exclusively in the admin sub-panel below (single authoritative
          mutation surface). */}
      <div className="mt-4 space-y-2">
        {(["server_personal", "private_worker"] as HermesScope[]).map((scope) => {
          const scopeAvailable =
            scope === "server_personal" ? scopes?.serverPersonal : scopes?.privateWorker;
          return (
            <div
              key={scope}
              className="flex items-center justify-between rounded-md border p-3"
              data-testid={`hermes-connect-entry-${scope}`}
            >
              <span className="text-sm font-medium text-gray-900">{SCOPE_LABEL[scope]}</span>
              {scopeAvailable ? (
                <Button size="sm" data-testid={`hermes-connect-button-${scope}`} onClick={() => openConnectFlow(scope)}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  เชื่อมต่อ
                </Button>
              ) : (
                <span className="text-xs text-gray-400" data-testid={`hermes-connect-disabled-${scope}`}>
                  ไม่พร้อมใช้งาน
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Consent step */}
      {flowScope && !connectingConnectionId ? (
        <div
          className="mt-4 rounded-md border p-3"
          data-testid={`hermes-consent-${flowScope}`}
        >
          <p className="text-sm text-gray-800">{CONSENT_NOTICE_TH}</p>
          <p className="mt-1 text-xs text-gray-500">{CONSENT_NOTICE_EN}</p>
          {flowScope === "server_shared" ? (
            <p
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
              data-testid="hermes-consent-shared-addendum"
            >
              {SHARED_SCOPE_ADDENDUM_TH}
            </p>
          ) : null}

          {flowScope === "private_worker" ? (
            <div className="mt-3" data-testid="hermes-private-worker-selector">
              <label className="text-xs font-medium text-gray-700">เลือก Worker (ออนไลน์)</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={selectedWorkerId ?? ""}
                onChange={(event) => setSelectedWorkerId(event.target.value || null)}
              >
                <option value="">เลือก Worker</option>
                {onlineWorkers.map((worker) => (
                  <option key={worker.workerId} value={worker.workerId}>
                    {worker.displayName}
                  </option>
                ))}
              </select>
              {onlineWorkers.length === 0 ? (
                <p className="mt-1 text-xs text-red-600">ไม่มี Worker ที่ออนไลน์อยู่ในขณะนี้</p>
              ) : null}
            </div>
          ) : null}

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label="รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI"
              checked={consentAcknowledged}
              onChange={(event) => setConsentAcknowledged(event.target.checked)}
            />
            ฉันรับทราบและยินยอม
          </label>

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={
                !consentAcknowledged ||
                startConnect.isPending ||
                (flowScope === "private_worker" && !selectedWorkerId)
              }
              onClick={confirmConsentAndConnect}
            >
              {startConnect.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              ยืนยันและเชื่อมต่อ
            </Button>
            <Button size="sm" variant="outline" onClick={closeConnectFlow}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : null}

      {/* Device-code screen */}
      {connectingConnectionId ? (
        <div className="mt-4 rounded-md border p-3" data-testid="hermes-device-code-screen">
          {connectStatus.data?.errorCode ? (
            (() => {
              const presentation = presentHermesError({ errorCode: connectStatus.data?.errorCode });
              if (!presentation) return null;
              return (
                <div data-testid="hermes-connect-error">
                  <p className="text-sm text-red-700">{presentation.th}</p>
                  <p className="mt-1 text-xs text-red-600">{presentation.en}</p>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      const scope = flowScope;
                      setConnectingConnectionId(null);
                      if (scope) openConnectFlow(scope);
                    }}
                  >
                    ลองใหม่ / Reconnect
                  </Button>
                </div>
              );
            })()
          ) : (
            <>
              <p className="text-sm text-gray-700">
                {STATUS_LABEL[connectStatus.data?.status ?? "pending"]}
              </p>
              {connectStatus.data?.verificationUrl ? (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => window.open(connectStatus.data?.verificationUrl, "_blank", "noopener")}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  เปิดหน้าเชื่อมต่อของ xAI
                </Button>
              ) : null}
              {connectStatus.data?.userCode ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-2 py-1 font-mono text-sm" data-testid="hermes-user-code">
                    {connectStatus.data.userCode}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const code = connectStatus.data?.userCode;
                      if (code) void navigator.clipboard?.writeText(code);
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    คัดลอก
                  </Button>
                </div>
              ) : null}
              {connectStatus.data?.expiresAt ? (
                <p className="mt-2 text-xs text-gray-500" data-testid="hermes-device-code-countdown">
                  {formatHermesDeviceCodeCountdown(connectStatus.data.expiresAt, Date.now())}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* Admin sub-panel — the single authoritative surface for admin
          mutations (connect shared / quota / disable). */}
      {isAdmin ? (
        <div className="mt-6 rounded-md border p-3" data-testid="hermes-admin-subpanel">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4" />
            จัดการบัญชีกลาง (Admin)
          </div>
          <Button
            size="sm"
            className="mt-2"
            data-testid="hermes-admin-connect-shared"
            onClick={() => openConnectFlow("server_shared")}
          >
            เชื่อมต่อบัญชีกลาง
          </Button>
          <div className="mt-3 space-y-2">
            {(adminConnections.data ?? []).map((row) => {
              const draft = quotaDraftByConnectionId[row.id] ?? (row.dailyJobQuota != null ? String(row.dailyJobQuota) : "");
              return (
                <div key={row.id} className="rounded-md border p-2" data-testid={`hermes-admin-row-${row.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{row.accountLabel ?? row.accountHint ?? row.id}</span>
                    <Badge variant="outline">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      aria-label={`Daily job quota for ${row.accountLabel ?? row.id}`}
                      className="w-28 rounded-md border px-2 py-1 text-sm"
                      inputMode="numeric"
                      placeholder="Unlimited"
                      value={draft}
                      onChange={(event) => {
                        const numeric = event.target.value.replace(/\D/g, "");
                        setQuotaDraftByConnectionId((current) => ({ ...current, [row.id]: numeric }));
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        adminSetQuota.mutate({
                          connectionId: row.id,
                          dailyJobQuota: draft === "" ? null : Number(draft),
                        })
                      }
                    >
                      บันทึกโควต้า
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      onClick={() => adminDisable.mutate({ connectionId: row.id })}
                    >
                      ปิดใช้งาน
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </DashboardCard>
  );
}
