diff --git a/apps/web/client/src/components/media/HermesConnectionPicker.tsx b/apps/web/client/src/components/media/HermesConnectionPicker.tsx
new file mode 100644
index 000000000..2a6256e31
--- /dev/null
+++ b/apps/web/client/src/components/media/HermesConnectionPicker.tsx
@@ -0,0 +1,191 @@
+/**
+ * Feature 135 (Hermes/Grok media worker) — per-generation connection
+ * selector. Mirrors `McpConnectionPicker.tsx`'s shape (query, auto-select,
+ * stale-value clearing, empty state) but is simpler: a Hermes connection has
+ * no `sharedGroupId` dimension, so the option value is just `connection.id`.
+ *
+ * Eligibility (spec §11.3 / section-10 §4.1): a connection is selectable for
+ * generation only when `status === "authorized"` AND its capability summary
+ * enables the requested `assetType` AND its assigned worker is online.
+ * Connections that are default-eligible server-side but not job-eligible
+ * (`reauth_required`, `entitlement_restricted`, or an otherwise-capable
+ * connection whose worker is offline) render as disabled options with a
+ * reason suffix — informative, never selectable. Every other status
+ * (`pending`, `disconnected`, `error`) is hidden entirely.
+ */
+import { useEffect } from "react";
+import { trpc } from "@/lib/trpc";
+import { Label } from "@/components/ui/label";
+import { Button } from "@/components/ui/button";
+import { Link } from "wouter";
+import { hermesErrorCopy } from "@shared/hermesMedia";
+
+type HermesAssetType = "image" | "video";
+
+/** Deliberately duplicated (not imported from `server/`) — this is a client
+ *  file and must not depend on server modules; the shape mirrors
+ *  `SafeHermesConnection` from `server/services/hermesConnectionService.ts`
+ *  byte-for-byte for the fields this picker actually reads. */
+export interface HermesConnectionPickerRow {
+  id: string;
+  scope: "server_shared" | "server_personal" | "private_worker";
+  status: string;
+  accountLabel: string | null;
+  accountHint: string | null;
+  defaultForImage: boolean;
+  defaultForVideo: boolean;
+  assignedWorkerOnline: boolean;
+  capabilitySummary: {
+    imageEnabled: boolean;
+    videoEnabled: boolean;
+  };
+}
+
+/** Scope badge copy (section-03 note, pinned Thai strings). */
+const HERMES_SCOPE_LABEL: Record<HermesConnectionPickerRow["scope"], string> = {
+  server_shared: "ส่วนกลาง",
+  server_personal: "ส่วนตัวบนเซิร์ฟเวอร์",
+  private_worker: "เครื่องของฉัน",
+};
+
+function capabilityEnabledFor(
+  connection: HermesConnectionPickerRow,
+  assetType: HermesAssetType,
+): boolean {
+  return assetType === "image"
+    ? connection.capabilitySummary.imageEnabled
+    : connection.capabilitySummary.videoEnabled;
+}
+
+function isJobEligible(
+  connection: HermesConnectionPickerRow,
+  assetType: HermesAssetType,
+): boolean {
+  return (
+    connection.status === "authorized" &&
+    capabilityEnabledFor(connection, assetType) &&
+    connection.assignedWorkerOnline
+  );
+}
+
+/** Reason suffix for a disabled-but-informative row, or `null` when the row
+ *  should be hidden entirely (not eligible and not informative). */
+function disabledReasonFor(
+  connection: HermesConnectionPickerRow,
+  assetType: HermesAssetType,
+): string | null {
+  if (connection.status === "reauth_required") {
+    return hermesErrorCopy("HERMES_REAUTH_REQUIRED").th;
+  }
+  if (connection.status === "entitlement_restricted") {
+    return hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").th;
+  }
+  if (
+    connection.status === "authorized" &&
+    capabilityEnabledFor(connection, assetType) &&
+    !connection.assignedWorkerOnline
+  ) {
+    return connection.scope === "private_worker"
+      ? "Worker ออฟไลน์ — เปิด Worker App บนเครื่องนี้ก่อน"
+      : "Worker ออฟไลน์ในขณะนี้";
+  }
+  return null;
+}
+
+export function HermesConnectionPicker({
+  value,
+  onChange,
+  assetType,
+}: {
+  value: string | null;
+  onChange: (connectionId: string | null) => void;
+  assetType: HermesAssetType;
+}) {
+  const connections = trpc.hermesConnections.listConnections.useQuery(
+    { assetType },
+    { retry: false },
+  );
+  const rows = (connections.data ?? []) as HermesConnectionPickerRow[];
+  const eligible = rows.filter((connection) => isJobEligible(connection, assetType));
+  const informative = rows.filter(
+    (connection) =>
+      !isJobEligible(connection, assetType) && disabledReasonFor(connection, assetType) !== null,
+  );
+
+  useEffect(() => {
+    if (connections.isLoading) return;
+    if (!value) {
+      if (eligible.length === 1) {
+        onChange(eligible[0].id);
+        return;
+      }
+      if (eligible.length > 1) {
+        // One-line refinement over the MCP picker: prefer the row already
+        // marked as this user's default for the requested asset type,
+        // rather than leaving the selection empty among ties.
+        const preferred = eligible.find((connection) =>
+          assetType === "image" ? connection.defaultForImage : connection.defaultForVideo,
+        );
+        if (preferred) onChange(preferred.id);
+      }
+      return;
+    }
+    const stillEligible = eligible.some((connection) => connection.id === value);
+    if (!stillEligible) onChange(null);
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+  }, [connections.isLoading, eligible, value, onChange, assetType]);
+
+  const handleChange = (optionValue: string) => {
+    if (!optionValue) {
+      onChange(null);
+      return;
+    }
+    // Defense in depth: a disabled/informative `<option>` cannot be picked by
+    // a real user, but guard here too so a test/programmatic change event can
+    // never report a non-eligible connection as selected.
+    const isSelectable = eligible.some((connection) => connection.id === optionValue);
+    if (!isSelectable) return;
+    onChange(optionValue);
+  };
+
+  return (
+    <div className="space-y-2">
+      <Label>บัญชี Grok (Hermes)</Label>
+      {eligible.length === 0 && informative.length === 0 ? (
+        <div className="rounded-lg border border-dashed p-3 text-sm text-gray-500">
+          ยังไม่มีบัญชี Grok ที่เชื่อมต่อสำหรับ
+          {assetType === "image" ? "การสร้างภาพ" : "การสร้างวิดีโอ"}
+          <Link href="/settings?tab=integrations">
+            <Button type="button" variant="link" className="ml-1 h-auto p-0">
+              เชื่อมต่อบัญชี Grok
+            </Button>
+          </Link>
+        </div>
+      ) : (
+        <select
+          className="w-full rounded-md border px-3 py-2 text-sm"
+          value={value ?? ""}
+          onChange={(event) => handleChange(event.target.value)}
+        >
+          <option value="">เลือกบัญชี Grok</option>
+          {eligible.map((connection) => (
+            <option key={connection.id} value={connection.id}>
+              {(connection.accountLabel ?? connection.accountHint ?? connection.id)}
+              {" · "}
+              {HERMES_SCOPE_LABEL[connection.scope]}
+            </option>
+          ))}
+          {informative.map((connection) => (
+            <option key={connection.id} value={connection.id} disabled>
+              {(connection.accountLabel ?? connection.accountHint ?? connection.id)}
+              {" · "}
+              {HERMES_SCOPE_LABEL[connection.scope]}
+              {" — "}
+              {disabledReasonFor(connection, assetType)}
+            </option>
+          ))}
+        </select>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/media/ModelSelectorDialog.tsx b/apps/web/client/src/components/media/ModelSelectorDialog.tsx
index 4d7543340..634052fe3 100644
--- a/apps/web/client/src/components/media/ModelSelectorDialog.tsx
+++ b/apps/web/client/src/components/media/ModelSelectorDialog.tsx
@@ -319,17 +319,31 @@ function ModelCard({ model, isSelected, onSelect }: ModelCardProps) {
                 {modeLabel}
               </Badge>
             )}
-            <Badge
-              variant={transportConfig.transport === "mcp" ? "default" : "outline"}
-              className={cn(
-                "text-[10px] px-1.5 py-0",
-                transportConfig.transport === "mcp"
-                  ? "bg-sky-500 text-white"
-                  : "border-slate-300 bg-white text-slate-600",
-              )}
-            >
-              {getMediaModelTransportLabel(transportConfig)}
-            </Badge>
+            {transportConfig.transport === "hermes_worker" ? (
+              // Feature 135 — distinct badge for the Hermes/Grok transport
+              // arm. Deliberately never reuses `getMediaModelTransportLabel`'s
+              // bare "Hermes" string here — the display name must always read
+              // "Grok via Hermes" (never bare "Grok Imagine", which is the
+              // separate kie.ai model row).
+              <Badge
+                variant="default"
+                className="text-[10px] px-1.5 py-0 bg-violet-500 text-white"
+              >
+                Grok via Hermes
+              </Badge>
+            ) : (
+              <Badge
+                variant={transportConfig.transport === "mcp" ? "default" : "outline"}
+                className={cn(
+                  "text-[10px] px-1.5 py-0",
+                  transportConfig.transport === "mcp"
+                    ? "bg-sky-500 text-white"
+                    : "border-slate-300 bg-white text-slate-600",
+                )}
+              >
+                {getMediaModelTransportLabel(transportConfig)}
+              </Badge>
+            )}
             {model.isDefault && (
               <Badge className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0">
                 <Star className="h-3 w-3 mr-0.5 inline" />
diff --git a/apps/web/client/src/components/settings/HermesConnectPanel.tsx b/apps/web/client/src/components/settings/HermesConnectPanel.tsx
new file mode 100644
index 000000000..2ee5160c4
--- /dev/null
+++ b/apps/web/client/src/components/settings/HermesConnectPanel.tsx
@@ -0,0 +1,617 @@
+/**
+ * HermesConnectPanel — Settings → AI Providers → "Grok via Hermes"
+ * (Feature 135, section-10).
+ *
+ * Structure (spec §4.2): availability header (fail-closed disabled
+ * explanation), connection list (status/scope/capability, default toggles,
+ * probe/disconnect, entitlement/reauth copy blocks), a per-scope connect flow
+ * (one-time consent → device-code screen → done/error), and an admin-only
+ * sub-panel for `server_shared` (the SINGLE authoritative surface for admin
+ * mutations — connect shared / quota / disable. Section-12's
+ * `HermesWorkerAdminPanel` in AdminMonitoring is read-only observability and
+ * links here for changes).
+ *
+ * Never logs/toasts/persists the device user code — component state only.
+ */
+import { useEffect, useRef, useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { DashboardCard } from "@/components/dashboard";
+import { toast } from "sonner";
+import { useAuth } from "@/contexts/AuthContext";
+import {
+  Cable,
+  Copy,
+  ExternalLink,
+  Loader2,
+  RefreshCw,
+  Shield,
+  Trash2,
+} from "lucide-react";
+import { hermesErrorCopy } from "@shared/hermesMedia";
+import { presentHermesError } from "@/lib/hermesErrorPresentation";
+
+type HermesScope = "server_shared" | "server_personal" | "private_worker";
+
+const SCOPE_LABEL: Record<HermesScope, string> = {
+  server_shared: "ส่วนกลาง",
+  server_personal: "ส่วนตัวบนเซิร์ฟเวอร์",
+  private_worker: "เครื่องของฉัน",
+};
+
+const STATUS_LABEL: Record<string, string> = {
+  pending: "กำลังเชื่อมต่อ",
+  authorized: "เชื่อมต่อแล้ว",
+  reauth_required: "ต้องเชื่อมต่อใหม่",
+  entitlement_restricted: "ถูกจำกัดสิทธิ์",
+  disconnected: "ยกเลิกการเชื่อมต่อแล้ว",
+  error: "เกิดข้อผิดพลาด",
+};
+
+/** Thai-locale timestamp for `capabilitySummary.probedAt` — same convention
+ *  (Gregorian calendar, Asia/Bangkok) as `McpConnectPanel.tsx`'s own
+ *  `formatThaiDateTime`, duplicated per this feature's established
+ *  "duplicate small per-surface helpers" convention. */
+function formatThaiDateTime(value: string | null | undefined): string | null {
+  if (!value) return null;
+  const date = new Date(value);
+  if (Number.isNaN(date.getTime())) return null;
+  return new Intl.DateTimeFormat("th-TH", {
+    timeZone: "Asia/Bangkok",
+    calendar: "gregory",
+    year: "numeric",
+    month: "short",
+    day: "numeric",
+    hour: "2-digit",
+    minute: "2-digit",
+    hour12: false,
+  }).format(date);
+}
+
+/** mm:ss countdown to `expiresAt` (or a fixed "expired" string past zero).
+ *  Pure/exported for direct unit testing without mounting the device-code
+ *  screen. */
+export function formatHermesDeviceCodeCountdown(
+  expiresAt: string | null | undefined,
+  nowMs: number,
+): string {
+  if (!expiresAt) return "";
+  const expiresMs = new Date(expiresAt).getTime();
+  if (!Number.isFinite(expiresMs)) return "";
+  const remainingSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
+  if (remainingSeconds <= 0) return "หมดอายุแล้ว";
+  const minutes = Math.floor(remainingSeconds / 60);
+  const seconds = remainingSeconds % 60;
+  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
+}
+
+interface HermesConnectionRow {
+  id: string;
+  scope: HermesScope;
+  status: string;
+  accountLabel: string | null;
+  accountHint: string | null;
+  defaultForImage: boolean;
+  defaultForVideo: boolean;
+  entitlementStatus: string | null;
+  assignedWorkerId: string | null;
+  assignedWorkerOnline: boolean;
+  capabilitySummary: {
+    probedAt: string | null;
+    imageEnabled: boolean;
+    videoEnabled: boolean;
+    maxEditReferences: number | null;
+  };
+  dailyJobQuota: number | null;
+  createdAt: string;
+  authorizedAt: string | null;
+}
+
+interface HermesConnectedWorkerRow {
+  workerId: string;
+  displayName: string;
+  status: string;
+}
+
+const CONSENT_NOTICE_TH =
+  "prompt และรูปอ้างอิงของงานที่ส่งผ่านการเชื่อมต่อนี้จะถูกส่งไปยัง xAI ภายใต้บัญชี Grok ที่เชื่อมต่อ และอยู่ภายใต้ข้อกำหนดของ xAI";
+const CONSENT_NOTICE_EN =
+  "Prompts and reference images for jobs sent through this connection will be transmitted to xAI under the connected Grok account, subject to xAI's terms.";
+const SHARED_SCOPE_ADDENDUM_TH =
+  "บัญชีนี้เป็นบัญชีกลาง — prompt และรูปของผู้ใช้ทุกคนใน tenant ที่ใช้ pool นี้จะถูกส่งผ่านบัญชี Grok นี้";
+const DISCONNECT_PENDING_NOTICE_TH =
+  "จะยกเลิกการเชื่อมต่อเมื่องานบนเครื่องทำงานเสร็จ";
+
+export function HermesConnectPanel() {
+  const { user } = useAuth();
+  const isAdmin = user?.role === "admin";
+  const utils = trpc.useUtils();
+
+  const availability = trpc.hermesConnections.getAvailability.useQuery();
+  const connections = trpc.hermesConnections.listConnections.useQuery(undefined, {
+    retry: false,
+  });
+  const connectedWorkers = trpc.users.listConnectedWorkers.useQuery(undefined, {
+    retry: false,
+  });
+  const adminConnections = trpc.hermesConnections.adminList.useQuery(undefined, {
+    enabled: isAdmin,
+    retry: false,
+  });
+
+  const [flowScope, setFlowScope] = useState<HermesScope | null>(null);
+  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
+  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
+  const [connectingConnectionId, setConnectingConnectionId] = useState<string | null>(null);
+  const [quotaDraftByConnectionId, setQuotaDraftByConnectionId] = useState<Record<string, string>>({});
+
+  const onlineWorkers = ((connectedWorkers.data?.workers ?? []) as HermesConnectedWorkerRow[]).filter(
+    (worker) => worker.status === "online",
+  );
+
+  const startConnect = trpc.hermesConnections.startConnect.useMutation({
+    onSuccess: (result) => {
+      setConnectingConnectionId(result.connectionId);
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  const connectStatus = trpc.hermesConnections.getConnectStatus.useQuery(
+    { connectionId: connectingConnectionId ?? "" },
+    {
+      enabled: Boolean(connectingConnectionId),
+      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
+        const status = query.state.data?.status;
+        return status && status !== "pending" ? false : 2500;
+      },
+    },
+  );
+
+  const setDefault = trpc.hermesConnections.setDefault.useMutation({
+    onSuccess: async () => {
+      toast.success("ตั้งค่าบัญชีเริ่มต้นแล้ว");
+      await utils.hermesConnections.listConnections.invalidate();
+    },
+    onError: (error) => toast.error(error.message),
+  });
+  const disconnect = trpc.hermesConnections.disconnect.useMutation({
+    onSuccess: async () => {
+      toast.info(DISCONNECT_PENDING_NOTICE_TH);
+      await utils.hermesConnections.listConnections.invalidate();
+    },
+    onError: (error) => toast.error(error.message),
+  });
+  const probe = trpc.hermesConnections.probe.useMutation({
+    onSuccess: async () => {
+      toast.success("ตรวจสอบการเชื่อมต่อแล้ว");
+      await utils.hermesConnections.listConnections.invalidate();
+    },
+    onError: (error) => toast.error(error.message),
+  });
+  const adminSetQuota = trpc.hermesConnections.adminSetQuota.useMutation({
+    onSuccess: async () => {
+      toast.success("บันทึกโควต้าแล้ว");
+      await utils.hermesConnections.adminList.invalidate();
+    },
+    onError: (error) => toast.error(error.message),
+  });
+  const adminDisable = trpc.hermesConnections.adminDisable.useMutation({
+    onSuccess: async () => {
+      toast.success("ปิดใช้งานบัญชีนี้แล้ว");
+      await utils.hermesConnections.adminList.invalidate();
+      await utils.hermesConnections.listConnections.invalidate();
+    },
+    onError: (error) => toast.error(error.message),
+  });
+
+  // Terminal `authorized` → success toast + invalidate + reset the flow.
+  // Guarded by a ref so this fires exactly once per connectingConnectionId
+  // even while the (now-stopped) polling query keeps returning cached data.
+  const authorizedHandledRef = useRef<string | null>(null);
+  useEffect(() => {
+    if (!connectingConnectionId) return;
+    if (
+      connectStatus.data?.status === "authorized" &&
+      authorizedHandledRef.current !== connectingConnectionId
+    ) {
+      authorizedHandledRef.current = connectingConnectionId;
+      toast.success("เชื่อมต่อบัญชี Grok สำเร็จ");
+      void utils.hermesConnections.listConnections.invalidate();
+      setFlowScope(null);
+      setConnectingConnectionId(null);
+    }
+  }, [connectStatus.data?.status, connectingConnectionId, utils]);
+
+  function openConnectFlow(scope: HermesScope) {
+    setFlowScope(scope);
+    setConsentAcknowledged(false);
+    setConnectingConnectionId(null);
+    setSelectedWorkerId(onlineWorkers.length === 1 ? onlineWorkers[0].workerId : null);
+  }
+
+  function closeConnectFlow() {
+    setFlowScope(null);
+    setConsentAcknowledged(false);
+    setSelectedWorkerId(null);
+    setConnectingConnectionId(null);
+  }
+
+  function confirmConsentAndConnect() {
+    if (!flowScope || !consentAcknowledged) return;
+    if (flowScope === "private_worker" && !selectedWorkerId) return;
+    startConnect.mutate({
+      scope: flowScope,
+      consentAcknowledged: true,
+      ...(flowScope === "private_worker" && selectedWorkerId
+        ? { workerId: selectedWorkerId }
+        : {}),
+    });
+  }
+
+  if (availability.data && availability.data.enabled === false) {
+    return (
+      <DashboardCard className="p-5">
+        <div className="flex items-center gap-2">
+          <Cable className="h-4 w-4 text-gray-400" />
+          <h2 className="text-base font-semibold text-gray-950">Grok via Hermes</h2>
+        </div>
+        <p
+          className="mt-3 rounded-md border border-dashed p-3 text-sm text-gray-600"
+          data-testid="hermes-panel-disabled-explanation"
+        >
+          ฟีเจอร์นี้ปิดอยู่ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ
+        </p>
+      </DashboardCard>
+    );
+  }
+
+  const connectionRows = (connections.data ?? []) as HermesConnectionRow[];
+  const scopes = availability.data?.scopes;
+
+  return (
+    <DashboardCard className="p-5">
+      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
+        <div>
+          <div className="flex items-center gap-2">
+            <Cable className="h-4 w-4 text-violet-600" />
+            <h2 className="text-base font-semibold text-gray-950">Grok via Hermes</h2>
+            <Badge variant="outline">Hermes</Badge>
+          </div>
+          <p className="mt-1 text-sm text-gray-500">
+            เชื่อมต่อบัญชี Grok ของคุณผ่าน Hermes worker เพื่อสร้างภาพและวิดีโอโดยใช้เครดิตของบัญชีนั้นเอง
+          </p>
+        </div>
+        <Button variant="outline" size="sm" onClick={() => connections.refetch()}>
+          <RefreshCw className="mr-2 h-3.5 w-3.5" />
+          Refresh
+        </Button>
+      </div>
+
+      {/* Connection list */}
+      <div className="mt-4 space-y-3">
+        {connectionRows.length === 0 ? (
+          <div className="rounded-md border border-dashed p-4 text-sm text-gray-500">
+            ยังไม่มีบัญชี Grok ที่เชื่อมต่อ
+          </div>
+        ) : (
+          connectionRows.map((row) => (
+            <div
+              key={row.id}
+              className="rounded-md border p-3"
+              data-testid={`hermes-connection-row-${row.id}`}
+            >
+              <div className="flex flex-wrap items-center gap-2">
+                <Badge variant={row.status === "authorized" ? "default" : "outline"}>
+                  {STATUS_LABEL[row.status] ?? row.status}
+                </Badge>
+                <Badge variant="outline">{SCOPE_LABEL[row.scope]}</Badge>
+                <span className="font-medium text-gray-950">
+                  {row.accountLabel ?? row.accountHint ?? row.id}
+                </span>
+              </div>
+              <div className="mt-1 text-xs text-gray-500">
+                {`ภาพ: ${row.capabilitySummary.imageEnabled ? "รองรับ" : "ไม่รองรับ"} · วิดีโอ: ${row.capabilitySummary.videoEnabled ? "รองรับ" : "ไม่รองรับ"}`}
+                {row.capabilitySummary.maxEditReferences != null
+                  ? ` · อ้างอิงสูงสุด ${row.capabilitySummary.maxEditReferences}`
+                  : ""}
+                {formatThaiDateTime(row.capabilitySummary.probedAt)
+                  ? ` · ตรวจสอบล่าสุด ${formatThaiDateTime(row.capabilitySummary.probedAt)} น.`
+                  : ""}
+              </div>
+              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
+                <label className="flex items-center gap-1.5">
+                  <input
+                    type="checkbox"
+                    aria-label={`ตั้งเป็นค่าเริ่มต้นสำหรับภาพ — ${row.accountLabel ?? row.id}`}
+                    checked={row.defaultForImage}
+                    onChange={() => setDefault.mutate({ connectionId: row.id, assetType: "image" })}
+                  />
+                  ค่าเริ่มต้น (ภาพ)
+                </label>
+                <label className="flex items-center gap-1.5">
+                  <input
+                    type="checkbox"
+                    aria-label={`ตั้งเป็นค่าเริ่มต้นสำหรับวิดีโอ — ${row.accountLabel ?? row.id}`}
+                    checked={row.defaultForVideo}
+                    onChange={() => setDefault.mutate({ connectionId: row.id, assetType: "video" })}
+                  />
+                  ค่าเริ่มต้น (วิดีโอ)
+                </label>
+                <Button size="sm" variant="outline" onClick={() => probe.mutate({ connectionId: row.id })}>
+                  ตรวจสอบ
+                </Button>
+                <Button
+                  size="sm"
+                  variant="outline"
+                  className="text-red-600"
+                  onClick={() => disconnect.mutate({ connectionId: row.id })}
+                >
+                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
+                  ยกเลิกการเชื่อมต่อ
+                </Button>
+              </div>
+
+              {row.status === "entitlement_restricted" ? (
+                <div
+                  className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
+                  data-testid={`hermes-entitlement-restricted-${row.id}`}
+                >
+                  <p>{hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").th}</p>
+                  <p className="mt-1 text-amber-700">
+                    {hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").en}
+                  </p>
+                  <Button size="sm" className="mt-2" onClick={() => openConnectFlow(row.scope)}>
+                    เชื่อมต่อใหม่
+                  </Button>
+                </div>
+              ) : null}
+
+              {row.status === "reauth_required" ? (
+                <div
+                  className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800"
+                  data-testid={`hermes-reauth-required-${row.id}`}
+                >
+                  <p>{hermesErrorCopy("HERMES_REAUTH_REQUIRED").th}</p>
+                  <Button size="sm" className="mt-2" onClick={() => openConnectFlow(row.scope)}>
+                    เชื่อมต่อใหม่
+                  </Button>
+                </div>
+              ) : null}
+            </div>
+          ))
+        )}
+      </div>
+
+      {/* Connect flow entry points — server_shared is admin-only and lives
+          exclusively in the admin sub-panel below (single authoritative
+          mutation surface). */}
+      <div className="mt-4 space-y-2">
+        {(["server_personal", "private_worker"] as HermesScope[]).map((scope) => {
+          const scopeAvailable =
+            scope === "server_personal" ? scopes?.serverPersonal : scopes?.privateWorker;
+          return (
+            <div
+              key={scope}
+              className="flex items-center justify-between rounded-md border p-3"
+              data-testid={`hermes-connect-entry-${scope}`}
+            >
+              <span className="text-sm font-medium text-gray-900">{SCOPE_LABEL[scope]}</span>
+              {scopeAvailable ? (
+                <Button size="sm" data-testid={`hermes-connect-button-${scope}`} onClick={() => openConnectFlow(scope)}>
+                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
+                  เชื่อมต่อ
+                </Button>
+              ) : (
+                <span className="text-xs text-gray-400" data-testid={`hermes-connect-disabled-${scope}`}>
+                  ไม่พร้อมใช้งาน
+                </span>
+              )}
+            </div>
+          );
+        })}
+      </div>
+
+      {/* Consent step */}
+      {flowScope && !connectingConnectionId ? (
+        <div
+          className="mt-4 rounded-md border p-3"
+          data-testid={`hermes-consent-${flowScope}`}
+        >
+          <p className="text-sm text-gray-800">{CONSENT_NOTICE_TH}</p>
+          <p className="mt-1 text-xs text-gray-500">{CONSENT_NOTICE_EN}</p>
+          {flowScope === "server_shared" ? (
+            <p
+              className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
+              data-testid="hermes-consent-shared-addendum"
+            >
+              {SHARED_SCOPE_ADDENDUM_TH}
+            </p>
+          ) : null}
+
+          {flowScope === "private_worker" ? (
+            <div className="mt-3" data-testid="hermes-private-worker-selector">
+              <label className="text-xs font-medium text-gray-700">เลือก Worker (ออนไลน์)</label>
+              <select
+                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
+                value={selectedWorkerId ?? ""}
+                onChange={(event) => setSelectedWorkerId(event.target.value || null)}
+              >
+                <option value="">เลือก Worker</option>
+                {onlineWorkers.map((worker) => (
+                  <option key={worker.workerId} value={worker.workerId}>
+                    {worker.displayName}
+                  </option>
+                ))}
+              </select>
+              {onlineWorkers.length === 0 ? (
+                <p className="mt-1 text-xs text-red-600">ไม่มี Worker ที่ออนไลน์อยู่ในขณะนี้</p>
+              ) : null}
+            </div>
+          ) : null}
+
+          <label className="mt-3 flex items-center gap-2 text-sm">
+            <input
+              type="checkbox"
+              aria-label="รับทราบและยินยอมให้ส่งข้อมูลไปยัง xAI"
+              checked={consentAcknowledged}
+              onChange={(event) => setConsentAcknowledged(event.target.checked)}
+            />
+            ฉันรับทราบและยินยอม
+          </label>
+
+          <div className="mt-3 flex gap-2">
+            <Button
+              size="sm"
+              disabled={
+                !consentAcknowledged ||
+                startConnect.isPending ||
+                (flowScope === "private_worker" && !selectedWorkerId)
+              }
+              onClick={confirmConsentAndConnect}
+            >
+              {startConnect.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
+              ยืนยันและเชื่อมต่อ
+            </Button>
+            <Button size="sm" variant="outline" onClick={closeConnectFlow}>
+              ยกเลิก
+            </Button>
+          </div>
+        </div>
+      ) : null}
+
+      {/* Device-code screen */}
+      {connectingConnectionId ? (
+        <div className="mt-4 rounded-md border p-3" data-testid="hermes-device-code-screen">
+          {connectStatus.data?.errorCode ? (
+            (() => {
+              const presentation = presentHermesError({ errorCode: connectStatus.data?.errorCode });
+              if (!presentation) return null;
+              return (
+                <div data-testid="hermes-connect-error">
+                  <p className="text-sm text-red-700">{presentation.th}</p>
+                  <p className="mt-1 text-xs text-red-600">{presentation.en}</p>
+                  <Button
+                    size="sm"
+                    className="mt-2"
+                    onClick={() => {
+                      const scope = flowScope;
+                      setConnectingConnectionId(null);
+                      if (scope) openConnectFlow(scope);
+                    }}
+                  >
+                    ลองใหม่ / Reconnect
+                  </Button>
+                </div>
+              );
+            })()
+          ) : (
+            <>
+              <p className="text-sm text-gray-700">
+                {STATUS_LABEL[connectStatus.data?.status ?? "pending"]}
+              </p>
+              {connectStatus.data?.verificationUrl ? (
+                <Button
+                  size="sm"
+                  className="mt-2"
+                  onClick={() => window.open(connectStatus.data?.verificationUrl, "_blank", "noopener")}
+                >
+                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
+                  เปิดหน้าเชื่อมต่อของ xAI
+                </Button>
+              ) : null}
+              {connectStatus.data?.userCode ? (
+                <div className="mt-2 flex items-center gap-2">
+                  <span className="rounded bg-gray-100 px-2 py-1 font-mono text-sm" data-testid="hermes-user-code">
+                    {connectStatus.data.userCode}
+                  </span>
+                  <Button
+                    size="sm"
+                    variant="outline"
+                    onClick={() => {
+                      const code = connectStatus.data?.userCode;
+                      if (code) void navigator.clipboard?.writeText(code);
+                    }}
+                  >
+                    <Copy className="mr-1.5 h-3.5 w-3.5" />
+                    คัดลอก
+                  </Button>
+                </div>
+              ) : null}
+              {connectStatus.data?.expiresAt ? (
+                <p className="mt-2 text-xs text-gray-500" data-testid="hermes-device-code-countdown">
+                  {formatHermesDeviceCodeCountdown(connectStatus.data.expiresAt, Date.now())}
+                </p>
+              ) : null}
+            </>
+          )}
+        </div>
+      ) : null}
+
+      {/* Admin sub-panel — the single authoritative surface for admin
+          mutations (connect shared / quota / disable). */}
+      {isAdmin ? (
+        <div className="mt-6 rounded-md border p-3" data-testid="hermes-admin-subpanel">
+          <div className="flex items-center gap-2 text-sm font-medium">
+            <Shield className="h-4 w-4" />
+            จัดการบัญชีกลาง (Admin)
+          </div>
+          <Button
+            size="sm"
+            className="mt-2"
+            data-testid="hermes-admin-connect-shared"
+            onClick={() => openConnectFlow("server_shared")}
+          >
+            เชื่อมต่อบัญชีกลาง
+          </Button>
+          <div className="mt-3 space-y-2">
+            {(adminConnections.data ?? []).map((row) => {
+              const draft = quotaDraftByConnectionId[row.id] ?? (row.dailyJobQuota != null ? String(row.dailyJobQuota) : "");
+              return (
+                <div key={row.id} className="rounded-md border p-2" data-testid={`hermes-admin-row-${row.id}`}>
+                  <div className="flex items-center justify-between">
+                    <span className="text-sm">{row.accountLabel ?? row.accountHint ?? row.id}</span>
+                    <Badge variant="outline">{STATUS_LABEL[row.status] ?? row.status}</Badge>
+                  </div>
+                  <div className="mt-2 flex items-center gap-2">
+                    <input
+                      aria-label={`Daily job quota for ${row.accountLabel ?? row.id}`}
+                      className="w-28 rounded-md border px-2 py-1 text-sm"
+                      inputMode="numeric"
+                      placeholder="Unlimited"
+                      value={draft}
+                      onChange={(event) => {
+                        const numeric = event.target.value.replace(/\D/g, "");
+                        setQuotaDraftByConnectionId((current) => ({ ...current, [row.id]: numeric }));
+                      }}
+                    />
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      onClick={() =>
+                        adminSetQuota.mutate({
+                          connectionId: row.id,
+                          dailyJobQuota: draft === "" ? null : Number(draft),
+                        })
+                      }
+                    >
+                      บันทึกโควต้า
+                    </Button>
+                    <Button
+                      size="sm"
+                      variant="outline"
+                      className="text-red-600"
+                      onClick={() => adminDisable.mutate({ connectionId: row.id })}
+                    >
+                      ปิดใช้งาน
+                    </Button>
+                  </div>
+                </div>
+              );
+            })}
+          </div>
+        </div>
+      ) : null}
+    </DashboardCard>
+  );
+}
diff --git a/apps/web/client/src/lib/hermesErrorPresentation.ts b/apps/web/client/src/lib/hermesErrorPresentation.ts
new file mode 100644
index 000000000..ea4e24358
--- /dev/null
+++ b/apps/web/client/src/lib/hermesErrorPresentation.ts
@@ -0,0 +1,96 @@
+/**
+ * Feature 135 (Hermes/Grok media worker) — client-side error presentation.
+ *
+ * Small, pure module so every surface (HermesConnectPanel, HermesConnectionPicker,
+ * VD/MediaStudio generate-error toasts) renders a typed `HERMES_*` error code
+ * identically: Thai-primary + English copy, retryability, and an optional
+ * retry-after hint. This module owns no UI — callers wire the returned shape
+ * into their own toast/inline-error rendering.
+ *
+ * Wire convention (section-01, pinned): the server throws
+ * `new TRPCError({ message: formatHermesErrorMessage(code, detail) })`, i.e.
+ * `message = "[HERMES_X] <english copy>[ — detail]"`. A TRPCError's `cause`
+ * does NOT serialize to the client, so this message prefix is the ONE
+ * channel for the typed code on a thrown mutation/query error;
+ * `extractHermesErrorCode` parses it back via `parseHermesErrorMessage`.
+ * Task projections (section-06) instead carry a plain `errorCode` field.
+ */
+import {
+  hermesErrorCopy,
+  parseHermesErrorMessage,
+  HERMES_MEDIA_ERROR_CODES,
+  type HermesMediaErrorCode,
+} from "@shared/hermesMedia";
+
+function isHermesErrorCode(value: unknown): value is HermesMediaErrorCode {
+  return (
+    typeof value === "string" &&
+    (HERMES_MEDIA_ERROR_CODES as readonly string[]).includes(value)
+  );
+}
+
+/**
+ * Pulls a typed Hermes error code out of, in order:
+ * 1. A TRPCClientError-shaped value whose `message` carries the pinned
+ *    `[HERMES_X] ...` prefix (delegates to `parseHermesErrorMessage`).
+ * 2. A plain `{ errorCode }` task projection (section-06).
+ * 3. A bare code string.
+ * Returns `null` when nothing recognizable is found.
+ */
+export function extractHermesErrorCode(error: unknown): HermesMediaErrorCode | null {
+  if (error == null) return null;
+
+  if (typeof error === "string") {
+    return isHermesErrorCode(error) ? error : parseHermesErrorMessage(error);
+  }
+
+  if (typeof error === "object") {
+    const candidate = error as { message?: unknown; errorCode?: unknown };
+    if (typeof candidate.errorCode === "string" && isHermesErrorCode(candidate.errorCode)) {
+      return candidate.errorCode;
+    }
+    if (typeof candidate.message === "string") {
+      const parsed = parseHermesErrorMessage(candidate.message);
+      if (parsed) return parsed;
+    }
+  }
+
+  return null;
+}
+
+export interface HermesErrorPresentation {
+  code: HermesMediaErrorCode;
+  th: string;
+  en: string;
+  retryable: boolean;
+  retryAfterSeconds?: number;
+}
+
+/**
+ * Wraps `hermesErrorCopy` with the extracted code and passes through
+ * `retryAfterSeconds` when the error carries one (e.g. `HERMES_RATE_LIMITED`
+ * rejections that include a numeric `retryAfterSeconds` field). Returns
+ * `null` when no typed code can be extracted — callers should fall back to
+ * the raw error message in that case.
+ */
+export function presentHermesError(error: unknown): HermesErrorPresentation | null {
+  const code = extractHermesErrorCode(error);
+  if (!code) return null;
+
+  const copy = hermesErrorCopy(code);
+  const retryAfterSeconds =
+    error != null && typeof error === "object" && "retryAfterSeconds" in error
+      ? (() => {
+          const value = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
+          return typeof value === "number" && Number.isFinite(value) ? value : undefined;
+        })()
+      : undefined;
+
+  return {
+    code,
+    th: copy.th,
+    en: copy.en,
+    retryable: copy.retryable,
+    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
+  };
+}
diff --git a/apps/web/client/src/pages/Settings.tsx b/apps/web/client/src/pages/Settings.tsx
index 0edccc01f..18316427d 100644
--- a/apps/web/client/src/pages/Settings.tsx
+++ b/apps/web/client/src/pages/Settings.tsx
@@ -73,6 +73,7 @@ import {
 import { QRCodeSVG } from 'qrcode.react';
 import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
 import { McpConnectPanel } from '@/components/settings/McpConnectPanel';
+import { HermesConnectPanel } from '@/components/settings/HermesConnectPanel';
 import { McpServersSettingsPanel } from '@/components/settings/McpServersSettingsPanel';
 import { MarketplaceConnectorSettingsPanel } from '@/components/settings/MarketplaceConnectorSettingsPanel';
 import { OneDrivePanel } from '@/components/settings/OneDrivePanel';
@@ -2528,6 +2529,7 @@ export default function Settings() {
                   <UploadPostGatewayPanel tenantId={user.currentTenantId ?? null} />
                   <MarketplaceConnectorSettingsPanel />
                   <McpConnectPanel />
+                  <HermesConnectPanel />
                   <McpServersSettingsPanel />
                   <GoogleDrivePanel />
                   <OneDrivePanel />
diff --git a/apps/web/shared/mediaModelTransport.ts b/apps/web/shared/mediaModelTransport.ts
index 290b24b23..8d2702ce8 100644
--- a/apps/web/shared/mediaModelTransport.ts
+++ b/apps/web/shared/mediaModelTransport.ts
@@ -72,3 +72,20 @@ export function getMediaModelTransportLabel(config: MediaModelTransportConfig):
   if (config.transport === "hermes_worker") return "Hermes";
   return config.transport === "mcp" ? "MCP" : "API";
 }
+
+/**
+ * Feature 135 (Hermes Grok media worker) client gating helper — true when a
+ * model row's `configJson` resolves to `hermes_worker` transport. Pure and
+ * shared so every surface (model-picker badge, VD stock panels, EpisodePage,
+ * StoryboardPanel) computes the same gate identically instead of re-deriving
+ * `resolveMediaModelTransportConfig(...).transport === "hermes_worker"` ad
+ * hoc at each call site.
+ */
+export function modelUsesHermesTransport(configJson?: unknown): boolean {
+  return resolveMediaModelTransportConfig({ configJson }).transport === "hermes_worker";
+}
+
+/** Same convention for MCP-transport gating (regression parity helper). */
+export function modelUsesMcpTransport(configJson?: unknown): boolean {
+  return resolveMediaModelTransportConfig({ configJson }).transport === "mcp";
+}
