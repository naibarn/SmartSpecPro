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
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import { HelpButton } from "@/components/help/HelpButton";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Cable,
  ChevronDown,
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

const SCOPE_LABEL_EN: Record<HermesScope, string> = {
  server_shared: "Shared account",
  server_personal: "Personal server account",
  private_worker: "My worker",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "กำลังเชื่อมต่อ",
  authorized: "เชื่อมต่อแล้ว",
  reauth_required: "ต้องเชื่อมต่อใหม่",
  entitlement_restricted: "ถูกจำกัดสิทธิ์",
  disconnected: "ยกเลิกการเชื่อมต่อแล้ว",
  error: "เกิดข้อผิดพลาด",
};

const STATUS_LABEL_EN: Record<string, string> = {
  pending: "Connecting",
  authorized: "Connected",
  reauth_required: "Reconnect required",
  entitlement_restricted: "Entitlement restricted",
  disconnected: "Disconnected",
  error: "Error",
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

function formatConnectionDateTime(
  value: string | null | undefined,
  isThai: boolean,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(isThai ? "th-TH" : "en-GB", {
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
const SHARED_SCOPE_ADDENDUM_EN =
  "This is the tenant's central account. Prompts and reference images from every tenant member using this pool are sent through this Grok account.";
const DISCONNECT_PENDING_NOTICE_TH =
  "จะยกเลิกการเชื่อมต่อเมื่องานบนเครื่องทำงานเสร็จ";
const CONTACT_ADMIN_NOTICE_TH = "ติดต่อผู้ดูแลระบบ";
const CONTACT_ADMIN_NOTICE_EN = "Contact your admin";
const HISTORY_PAGE_SIZE = 5;
const TERMINAL_CONNECTION_STATUSES = new Set(["error", "disconnected"]);

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
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const scopeLabels = isThai ? SCOPE_LABEL : SCOPE_LABEL_EN;
  const statusLabels = isThai ? STATUS_LABEL : STATUS_LABEL_EN;
  const copy = {
    description: isThai
      ? "เชื่อมต่อบัญชี Grok ของคุณผ่าน Hermes worker เพื่อสร้างภาพและวิดีโอโดยใช้เครดิตของบัญชีนั้นเอง"
      : "Connect your Grok account through a Hermes worker to generate images and videos with that account's own quota.",
    disabledTitle: isThai ? "ยังตั้งค่าไม่ครบ" : "Setup is incomplete",
    disabledIntro: isThai
      ? "Grok via Hermes ยังเปิดใช้งานไม่ได้ ตรวจสอบรายการด้านล่าง"
      : "Grok via Hermes cannot be used yet. Check the items below.",
    platformGate: isThai ? "เปิดใช้งานฝั่งแพลตฟอร์ม" : "Platform enablement",
    tenantGate: isThai ? "เปิดให้ tenant นี้ใช้งาน" : "Tenant rollout",
    privateScope: isThai ? "เปิด Private worker scope" : "Private-worker scope",
    workerOnline: isThai ? "Worker app ออนไลน์" : "Worker app online",
    grokConnected: isThai ? "เชื่อมต่อบัญชี Grok" : "Grok account connected",
    ready: isThai ? "พร้อม" : "Ready",
    actionRequired: isThai ? "ต้องดำเนินการ" : "Action required",
    adminPath: isThai
      ? "ผู้ดูแลระบบ: ไปที่ Admin Settings → Infrastructure → Tasks → Enable Grok via Hermes"
      : "Admin: go to Admin Settings → Infrastructure → Tasks → Enable Grok via Hermes.",
    tenantPath: isThai
      ? "ผู้ดูแล tenant: ไปที่ Admin → Tenants → Feature Flags → Grok via Hermes — Tenant rollout"
      : "Tenant admin: go to Admin → Tenants → Feature Flags → Grok via Hermes — Tenant rollout.",
    privatePath: isThai
      ? "ผู้ดูแลระบบ: เปิด Private worker ใน Advanced operator settings"
      : "Admin: enable Private worker under Advanced operator settings.",
    workerPath: isThai
      ? "เปิด Worker app บนเครื่องของคุณและรอให้สถานะเป็น Online"
      : "Open the Worker app on your computer and wait until it shows Online.",
    accountPath: isThai
      ? "เลือก “เครื่องของฉัน” ด้านล่าง แล้วทำขั้นตอนเชื่อมต่อบัญชี Grok"
      : "Choose “My worker” below and complete the Grok connection flow.",
    noAccounts: isThai ? "ยังไม่มีบัญชี Grok ที่เชื่อมต่อ" : "No Grok account is connected yet.",
    noActiveAccounts: isThai ? "ยังไม่มีบัญชี Grok ที่กำลังใช้งาน" : "There is no active Grok connection.",
    historyTitle: isThai ? "ประวัติการเชื่อมต่อ" : "Connection history",
    historyDescription: isThai
      ? "รายการที่เกิดข้อผิดพลาดหรือยกเลิกแล้ว แสดงใหม่ไปเก่า"
      : "Failed and disconnected records, newest first.",
    showMoreHistory: (count: number) => isThai
      ? `แสดงเพิ่มอีก ${count} รายการ`
      : `Show ${count} more`,
    historyCreatedAt: isThai ? "สร้างเมื่อ" : "Created",
    connect: isThai ? "เชื่อมต่อ" : "Connect",
    unavailable: isThai ? "ไม่พร้อมใช้งาน" : "Unavailable",
    selectWorker: isThai ? "เลือก Worker (ออนไลน์)" : "Select an online worker",
    selectWorkerPlaceholder: isThai ? "เลือก Worker" : "Select a worker",
    noWorker: isThai ? "ไม่มี Worker ที่ออนไลน์อยู่ในขณะนี้" : "No worker is currently online.",
    acknowledge: isThai ? "ฉันรับทราบและยินยอม" : "I understand and consent",
    acknowledgeAria: isThai
      ? "รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI"
      : "Acknowledge and consent to sending data to xAI",
    confirmConnect: isThai ? "ยืนยันและเชื่อมต่อ" : "Confirm and connect",
    cancel: isThai ? "ยกเลิก" : "Cancel",
    reconnect: isThai ? "เชื่อมต่อใหม่" : "Reconnect",
    openXai: isThai ? "เปิดหน้าเชื่อมต่อของ xAI" : "Open xAI connection page",
    copyCode: isThai ? "คัดลอก" : "Copy",
    refresh: isThai ? "รีเฟรช" : "Refresh",
    language: isThai ? "English" : "ไทย",
    serverWorker: isThai ? "Hermes worker ส่วนกลางออนไลน์" : "Managed Hermes server worker online",
    serverWorkerReady: isThai
      ? "ติดตั้ง Hermes และผ่านการตรวจสอบแล้ว"
      : "Hermes is installed and passed its runtime check.",
    serverWorkerNotConfigured: isThai
      ? "ยังไม่ได้จับคู่ worker ส่วนกลางใน Admin Settings"
      : "No managed server worker is paired in Admin Settings.",
    serverWorkerOffline: isThai
      ? "worker ส่วนกลางออฟไลน์ กรุณาให้ผู้ดูแลตรวจสอบ service"
      : "The managed server worker is offline. Ask an admin to check the service.",
    serverWorkerCapability: isThai
      ? "Hermes บน worker ไม่ผ่านการตรวจสอบหรือยังไม่พร้อม"
      : "Hermes on the managed worker failed its runtime check or is unavailable.",
    modeCentralTitle: isThai ? "บัญชีกลางของ tenant" : "Tenant central account",
    modeCentralDescription: isThai
      ? "ผู้ดูแลเชื่อมต่อบัญชี Grok หนึ่งบัญชีให้ทุกคนใน tenant ใช้ร่วมกัน โควต้าและประวัติฝั่ง xAI เป็นของบัญชีกลาง งานประมวลผลบนเซิร์ฟเวอร์ส่วนกลาง"
      : "One admin-connected Grok account is shared by everyone in this tenant. Its xAI quota and account history are shared, and jobs run on the managed server.",
    modePersonalTitle: isThai ? "บัญชีส่วนตัวบนเซิร์ฟเวอร์" : "Personal account on server",
    modePersonalDescription: isThai
      ? "บัญชี Grok และโควต้าเป็นของคุณ โปรไฟล์แยกจากผู้ใช้อื่น แต่งานประมวลผลบนเซิร์ฟเวอร์ส่วนกลาง"
      : "Your Grok account stays personal while jobs run on the managed server. Its profile and quota are isolated from other users.",
    modePrivateTitle: isThai ? "บัญชีส่วนตัวบนเครื่องของฉัน" : "Personal account on my computer",
    modePrivateDescription: isThai
      ? "บัญชีและโควต้าเป็นของคุณ งานทำบนคอมพิวเตอร์ของคุณผ่าน Worker App และต้องเปิดแอปไว้ในสถานะ Online"
      : "Jobs run on your own computer through Worker App. Your Grok account and quota stay personal, and Worker App must remain online.",
    setupWorkerApp: isThai ? "ติดตั้งและตั้งค่า Worker App" : "Set up Worker App",
    centralConnect: isThai ? "เชื่อมต่อบัญชีกลาง" : "Connect central account",
    centralUnavailable: isThai
      ? "เปิดปุ่มนี้ได้เมื่อ worker ส่วนกลางออนไลน์และเปิด Shared pool แล้ว"
      : "This action becomes available when the managed worker is online and Shared pool is enabled.",
    managedByAdmin: isThai ? "ผู้ดูแล tenant เป็นผู้เชื่อมต่อและจัดการ" : "Connected and managed by a tenant admin",
    waitingForAuthorization: isThai
      ? "กำลังเตรียมการยืนยันตัวตนกับ xAI กรุณารอสักครู่"
      : "Preparing xAI authorization. Please wait.",
    connectionProgress: (elapsed: number, timeout?: number) => isThai
      ? `ดำเนินการแล้ว ${elapsed} วินาที${timeout ? ` จากเวลาสูงสุด ${timeout} วินาที` : ""}`
      : `Elapsed ${elapsed} seconds${timeout ? ` of a ${timeout}-second limit` : ""}`,
    connectionStage: (stage: string) => isThai
      ? `ขั้นตอน: ${stage}`
      : `Stage: ${stage}`,
    connectionLifetime: (authorizedAt: string | null) => {
      const connectedAt = formatConnectionDateTime(authorizedAt, isThai);
      return isThai
        ? `เชื่อมต่อ${connectedAt ? `เมื่อ ${connectedAt}` : "แล้ว"} · วันหมดอายุ: xAI ไม่ได้ระบุ ระบบจะแจ้งให้เชื่อมต่อใหม่เมื่อเซสชันใช้ไม่ได้`
        : `Connected${connectedAt ? ` at ${connectedAt}` : ""} · Expiry: not supplied by xAI. The system will request reconnection if the session becomes invalid.`;
    },
  };
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const authorizedHandledRef = useRef<string | null>(null);

  const onlineWorkers = ((connectedWorkers.data?.workers ?? []) as HermesConnectedWorkerRow[]).filter(
    (worker) => worker.status === "online",
  );
  const connectionRows = (connections.data ?? []) as HermesConnectionRow[];
  const activeConnectionRows = connectionRows.filter(
    (row) => !TERMINAL_CONNECTION_STATUSES.has(row.status),
  );
  const historyConnectionRows = connectionRows
    .filter((row) => TERMINAL_CONNECTION_STATUSES.has(row.status))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const visibleHistoryRows = historyConnectionRows.slice(0, historyLimit);
  const remainingHistoryCount = Math.max(0, historyConnectionRows.length - visibleHistoryRows.length);
  const hasAuthorizedConnection = connectionRows.some((row) => row.status === "authorized");
  const pendingConnection = activeConnectionRows.find((row) => row.status === "pending");
  const serverWorkerReason = availability.data?.serverWorker?.reason === "not_configured"
    || availability.data?.serverWorker?.reason === "not_found"
    ? copy.serverWorkerNotConfigured
    : availability.data?.serverWorker?.reason === "offline"
      ? copy.serverWorkerOffline
      : copy.serverWorkerCapability;

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
      refetchInterval: (query: { state: { data?: { status?: string; errorCode?: string } } }) => {
        const status = query.state.data?.status;
        if (query.state.data?.errorCode) return false;
        return status && status !== "pending" ? false : 2500;
      },
    },
  );

  // A connection attempt is durable server state. Resume it after navigation
  // or page reload instead of losing the polling state held by this component.
  useEffect(() => {
    if (connectingConnectionId || flowScope || !pendingConnection) return;
    // listConnections can still contain the pre-invalidation pending row for
    // one render after getConnectStatus has reported authorized. Do not
    // resurrect that completed attempt and leave the device-code spinner open.
    if (authorizedHandledRef.current === pendingConnection.id) return;
    setFlowScope(pendingConnection.scope);
    setConnectingConnectionId(pendingConnection.id);
  }, [
    connectingConnectionId,
    flowScope,
    pendingConnection?.id,
    pendingConnection?.scope,
  ]);

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
    const gateRows = [
      {
        label: copy.platformGate,
        ready: availability.data.platformEnabled,
        guidance: copy.adminPath,
      },
      {
        label: copy.tenantGate,
        ready: availability.data.tenantEnabled,
        guidance: copy.tenantPath,
      },
    ];
    return (
      <DashboardCard className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-950">Grok via Hermes</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <HelpButton
              page="/settings"
              topic="grok-via-hermes-connections"
              variant="outline"
              size="sm"
              label={isThai ? "คู่มือ Grok via Hermes" : "Grok via Hermes Help"}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void i18n.changeLanguage(isThai ? "en" : "th")}
            >
              {copy.language}
            </Button>
          </div>
        </div>
        <div
          className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-600"
          data-testid="hermes-panel-disabled-explanation"
        >
          <p className="font-medium text-gray-900">{copy.disabledTitle}</p>
          <p className="mt-1">{copy.disabledIntro}</p>
          <ul className="mt-3 space-y-2">
            {gateRows.map((row) => (
              <li key={row.label}>
                <span className="font-medium">
                  {row.ready ? "✓" : "○"} {row.label} — {row.ready ? copy.ready : copy.actionRequired}
                </span>
                {!row.ready ? <p className="mt-0.5 text-xs">{row.guidance}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </DashboardCard>
    );
  }

  const scopes = availability.data?.scopes;
  const readinessRows = [
    { label: copy.platformGate, ready: Boolean(availability.data?.platformEnabled), guidance: copy.adminPath },
    { label: copy.tenantGate, ready: Boolean(availability.data?.tenantEnabled), guidance: copy.tenantPath },
    {
      label: copy.serverWorker,
      ready: Boolean(availability.data?.serverWorker?.ready),
      guidance: availability.data?.serverWorker?.ready ? copy.serverWorkerReady : serverWorkerReason,
    },
    { label: copy.privateScope, ready: Boolean(scopes?.privateWorker), guidance: copy.privatePath },
    { label: copy.workerOnline, ready: onlineWorkers.length > 0, guidance: copy.workerPath },
    { label: copy.grokConnected, ready: hasAuthorizedConnection, guidance: copy.accountPath },
  ];

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
            {copy.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HelpButton
            page="/settings"
            topic="grok-via-hermes-connections"
            variant="outline"
            size="sm"
            label={isThai ? "คู่มือ Grok via Hermes" : "Grok via Hermes Help"}
          />
          <Button variant="outline" size="sm" onClick={() => connections.refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {copy.refresh}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void i18n.changeLanguage(isThai ? "en" : "th")}
            aria-label={isThai ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
          >
            {copy.language}
          </Button>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="hermes-readiness-checklist">
        {readinessRows.map((row) => (
          <li key={row.label} className="rounded-md border p-3 text-sm">
            <p className="font-medium text-gray-900">
              {row.ready ? "✓" : "○"} {row.label}
            </p>
            <p className={row.ready ? "mt-1 text-xs text-emerald-700" : "mt-1 text-xs text-amber-700"}>
              {row.ready ? (row.guidance || copy.ready) : `${copy.actionRequired}: ${row.guidance}`}
            </p>
          </li>
        ))}
      </ul>

      {/* Connection list */}
      <div className="mt-4 space-y-3">
        {activeConnectionRows.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-gray-500">
            {connectionRows.length === 0 ? copy.noAccounts : copy.noActiveAccounts}
          </div>
        ) : (
          activeConnectionRows.map((row) => {
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
                  {statusLabels[row.status] ?? row.status}
                </Badge>
                <Badge variant="outline">{scopeLabels[row.scope]}</Badge>
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
              {row.status === "authorized" ? (
                <div
                  className="mt-1 text-xs text-gray-600"
                  data-testid={`hermes-connection-lifetime-${row.id}`}
                >
                  {copy.connectionLifetime(row.authorizedAt)}
                </div>
              ) : null}
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

      {historyConnectionRows.length > 0 ? (
        <section className="mt-4 rounded-md border" data-testid="hermes-history-panel">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            aria-expanded={historyOpen}
            aria-controls="hermes-connection-history-content"
            onClick={() => setHistoryOpen((current) => !current)}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                {copy.historyTitle} ({historyConnectionRows.length})
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {copy.historyDescription}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${historyOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {historyOpen ? (
            <div id="hermes-connection-history-content" className="border-t px-3 py-3">
              <ul className="space-y-2">
                {visibleHistoryRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 rounded-md border bg-gray-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                    data-testid={`hermes-history-row-${row.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{statusLabels[row.status] ?? row.status}</Badge>
                        <Badge variant="outline">{scopeLabels[row.scope]}</Badge>
                        <span className="truncate text-sm font-medium text-gray-900">
                          {row.accountLabel ?? row.accountHint ?? row.id}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {copy.historyCreatedAt}{" "}
                        {formatConnectionDateTime(row.createdAt, isThai) ?? row.createdAt}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {remainingHistoryCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setHistoryLimit((current) => current + HISTORY_PAGE_SIZE)}
                >
                  {copy.showMoreHistory(Math.min(HISTORY_PAGE_SIZE, remainingHistoryCount))}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Connect flow entry points — server_shared is admin-only and lives
          exclusively in the admin sub-panel below (single authoritative
          mutation surface). */}
      <div className="mt-4 space-y-2">
        <div className="rounded-md border p-3" data-testid="hermes-connect-entry-server_shared">
          <p className="text-sm font-medium text-gray-900">{copy.modeCentralTitle}</p>
          <p className="mt-1 text-xs text-gray-600">{copy.modeCentralDescription}</p>
          <p className="mt-2 text-xs font-medium text-violet-700">{copy.managedByAdmin}</p>
        </div>
        {(["server_personal", "private_worker"] as HermesScope[]).map((scope) => {
          const scopeAvailable =
            scope === "server_personal"
              ? scopes?.serverPersonal
              : scopes?.privateWorker && onlineWorkers.length > 0;
          const title = scope === "server_personal" ? copy.modePersonalTitle : copy.modePrivateTitle;
          const description = scope === "server_personal"
            ? copy.modePersonalDescription
            : copy.modePrivateDescription;
          return (
            <div
              key={scope}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`hermes-connect-entry-${scope}`}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{title}</p>
                <p className="mt-1 text-xs text-gray-600">{description}</p>
                {scope === "private_worker" ? (
                  <a
                    href="/workers/connect"
                    className="mt-2 inline-flex text-xs font-medium text-violet-700 underline underline-offset-2"
                  >
                    {copy.setupWorkerApp}
                  </a>
                ) : null}
              </div>
              {scopeAvailable ? (
                <Button size="sm" data-testid={`hermes-connect-button-${scope}`} onClick={() => openConnectFlow(scope)}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {copy.connect}
                </Button>
              ) : (
                <span className="text-xs text-gray-400" data-testid={`hermes-connect-disabled-${scope}`}>
                  {copy.unavailable}
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
          <p className="text-sm text-gray-800">{isThai ? CONSENT_NOTICE_TH : CONSENT_NOTICE_EN}</p>
          {flowScope === "server_shared" ? (
            <p
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
              data-testid="hermes-consent-shared-addendum"
            >
              {isThai ? SHARED_SCOPE_ADDENDUM_TH : SHARED_SCOPE_ADDENDUM_EN}
            </p>
          ) : null}

          {flowScope === "private_worker" ? (
            <div className="mt-3" data-testid="hermes-private-worker-selector">
              <label className="text-xs font-medium text-gray-700">{copy.selectWorker}</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={selectedWorkerId ?? ""}
                onChange={(event) => setSelectedWorkerId(event.target.value || null)}
              >
                <option value="">{copy.selectWorkerPlaceholder}</option>
                {onlineWorkers.map((worker) => (
                  <option key={worker.workerId} value={worker.workerId}>
                    {worker.displayName}
                  </option>
                ))}
              </select>
              {onlineWorkers.length === 0 ? (
                <p className="mt-1 text-xs text-red-600">{copy.noWorker}</p>
              ) : null}
            </div>
          ) : null}

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={copy.acknowledgeAria}
              checked={consentAcknowledged}
              onChange={(event) => setConsentAcknowledged(event.target.checked)}
            />
            {copy.acknowledge}
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
              {copy.confirmConnect}
            </Button>
            <Button size="sm" variant="outline" onClick={closeConnectFlow}>
              {copy.cancel}
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
              <div data-testid="hermes-connect-progress">
                <p className="flex items-center gap-2 text-sm text-gray-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {statusLabels[connectStatus.data?.status ?? "pending"]}
                </p>
                {!connectStatus.data?.verificationUrl ? (
                  <p className="mt-1 text-xs text-gray-500">{copy.waitingForAuthorization}</p>
                ) : null}
                {connectStatus.data?.stage ? (
                  <p className="mt-1 text-xs text-gray-500">
                    {copy.connectionStage(connectStatus.data.stage)}
                  </p>
                ) : null}
                {typeof connectStatus.data?.elapsedSeconds === "number" ? (
                  <p className="mt-1 text-xs text-gray-500">
                    {copy.connectionProgress(
                      connectStatus.data.elapsedSeconds,
                      connectStatus.data.timeoutSeconds,
                    )}
                  </p>
                ) : null}
              </div>
              {connectStatus.data?.verificationUrl ? (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => window.open(connectStatus.data?.verificationUrl, "_blank", "noopener")}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {copy.openXai}
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
                    {copy.copyCode}
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
            {copy.modeCentralTitle} (Admin)
          </div>
          <p className="mt-2 text-xs text-gray-600">{copy.modeCentralDescription}</p>
          <Button
            size="sm"
            className="mt-2"
            data-testid="hermes-admin-connect-shared"
            disabled={!scopes?.serverShared}
            onClick={() => openConnectFlow("server_shared")}
          >
            {copy.centralConnect}
          </Button>
          {!scopes?.serverShared ? (
            <p
              className="mt-2 text-xs text-amber-700"
              data-testid="hermes-server-worker-reason"
            >
              {serverWorkerReason}. {copy.centralUnavailable}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {(adminConnections.data ?? [])
              .filter(
                (row) =>
                  row.scope === "server_shared"
                  && !TERMINAL_CONNECTION_STATUSES.has(row.status),
              )
              .map((row) => {
              const draft = quotaDraftByConnectionId[row.id] ?? (row.dailyJobQuota != null ? String(row.dailyJobQuota) : "");
              return (
                <div key={row.id} className="rounded-md border p-2" data-testid={`hermes-admin-row-${row.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{row.accountLabel ?? row.accountHint ?? row.id}</span>
                    <Badge variant="outline">{statusLabels[row.status] ?? row.status}</Badge>
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
