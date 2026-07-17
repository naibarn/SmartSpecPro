/**
 * HermesWorkerAdminPanel — Feature 135 (Hermes Grok media worker) section 12.
 *
 * Read-only admin monitoring panel: connections per scope, quota
 * consumption, and kill-switch states, sourced from
 * `trpc.hermesConnections.adminOverview`. This panel is deliberately
 * READ-ONLY by design — admin mutations (connect shared / quota / disable)
 * live solely in `HermesConnectPanel`'s admin sub-panel
 * (Settings → AI Providers → "Grok via Hermes"), so the two admin surfaces
 * can never diverge (one-writer rule, section-10). This panel links there
 * for changes instead of wiring its own mutations.
 *
 * Mounted inside `AdminMonitoring.tsx` adjacent to the existing worker-fleet
 * section. Thai copy primary, English secondary — consistent with the
 * section-10 panels.
 */
import { Link } from "wouter";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type HermesScope = "server_shared" | "server_personal" | "private_worker";

const SCOPE_LABEL: Record<HermesScope, string> = {
  server_shared: "ส่วนกลาง (Shared pool)",
  server_personal: "ส่วนตัวบนเซิร์ฟเวอร์ (Server personal)",
  private_worker: "เครื่องส่วนตัว (Private worker)",
};

const SCOPE_ORDER: HermesScope[] = ["server_shared", "server_personal", "private_worker"];

interface HermesAdminOverviewConnection {
  id: string;
  scope: HermesScope;
  status: string;
  accountLabel: string | null;
  accountHint: string | null;
  dailyJobQuota: number | null;
  usedToday: number;
  queueDepth: number;
}

interface HermesAdminOverviewScopeGroup {
  scope: HermesScope;
  connections: HermesAdminOverviewConnection[];
}

interface HermesAdminOverviewSettings {
  hermesWorkerEnabled: boolean;
  sharedPoolEnabled: boolean;
  serverPersonalEnabled: boolean;
  privateEnabled: boolean;
  videoEnabled: boolean;
  sharedPoolFeeCredits: number;
  minHermesVersion: string;
}

interface HermesAdminOverviewData {
  scopes: HermesAdminOverviewScopeGroup[];
  settings: HermesAdminOverviewSettings;
}

export interface HermesFleetSummary {
  ready: boolean;
  version: string | null;
}

/**
 * Small, independently-testable presentational unit for the worker-fleet
 * row badge (`AdminMonitoring.tsx`'s fleet rendering, section-12 §4.3) — a
 * pure projection of `WorkerFleetSummary.hermes`. Exported so
 * `HermesWorkerAdminPanel.test.tsx` can assert the badge/version rendering
 * and the "renders unchanged when absent" regression without mounting the
 * whole (heavy) AdminMonitoring page.
 */
export function HermesFleetBadge({ hermes, workerId }: { hermes: HermesFleetSummary; workerId: string }) {
  return (
    <Badge
      variant={hermes.ready ? "outline" : "secondary"}
      data-testid={`hermes-fleet-badge-${workerId}`}
    >
      Hermes media {hermes.ready ? "ready" : "not ready"}
      {hermes.version ? ` v${hermes.version}` : ""}
    </Badge>
  );
}

function KillSwitchBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <Badge
      variant={enabled ? "default" : "outline"}
      className={enabled ? "" : "text-gray-400"}
      data-testid={`hermes-kill-switch-${label}`}
      data-enabled={enabled ? "true" : "false"}
    >
      {enabled ? <ShieldCheck className="mr-1 h-3 w-3" /> : <ShieldOff className="mr-1 h-3 w-3" />}
      {label}: {enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
    </Badge>
  );
}

export function HermesWorkerAdminPanel() {
  const overviewQuery = trpc.hermesConnections.adminOverview.useQuery();

  if (overviewQuery.isLoading) {
    return (
      <DashboardCard className="p-5" data-testid="hermes-worker-admin-panel">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลดข้อมูล Hermes...
        </div>
      </DashboardCard>
    );
  }

  const overview = overviewQuery.data as HermesAdminOverviewData | undefined;
  if (!overview) return null;

  const groupsByScope = new Map(overview.scopes.map((group) => [group.scope, group]));

  return (
    <DashboardCard className="p-5" data-testid="hermes-worker-admin-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-950">
            Hermes Grok Media Worker (Admin)
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            ภาพรวมการเชื่อมต่อ โควต้าการใช้งาน และสถานะ kill-switch (มุมมองอ่านอย่างเดียว)
          </p>
        </div>
        <Link href="/settings?tab=integrations" data-testid="hermes-admin-panel-settings-link">
          จัดการที่หน้า Settings
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="hermes-admin-panel-kill-switches">
        <KillSwitchBadge label="Hermes Worker" enabled={overview.settings.hermesWorkerEnabled} />
        <KillSwitchBadge label="ส่วนกลาง" enabled={overview.settings.sharedPoolEnabled} />
        <KillSwitchBadge label="ส่วนตัวบนเซิร์ฟเวอร์" enabled={overview.settings.serverPersonalEnabled} />
        <KillSwitchBadge label="เครื่องส่วนตัว" enabled={overview.settings.privateEnabled} />
        <KillSwitchBadge label="วิดีโอ" enabled={overview.settings.videoEnabled} />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        ค่าธรรมเนียม pool กลาง: {overview.settings.sharedPoolFeeCredits} เครดิต ·
        เวอร์ชันต่ำสุดที่รองรับ: {overview.settings.minHermesVersion || "ไม่กำหนด"}
      </p>

      <div className="mt-5 space-y-4">
        {SCOPE_ORDER.map((scope) => {
          const group = groupsByScope.get(scope);
          const connections = group?.connections ?? [];
          return (
            <div key={scope} data-testid={`hermes-admin-scope-${scope}`}>
              <h3 className="text-sm font-medium text-gray-800">{SCOPE_LABEL[scope]}</h3>
              {connections.length === 0 ? (
                <p className="mt-1 text-xs text-gray-400">ไม่มีบัญชีที่เชื่อมต่อในกลุ่มนี้</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {connections.map((connection) => {
                    const quota = connection.dailyJobQuota;
                    const percent = quota
                      ? Math.min(100, Math.round((connection.usedToday / quota) * 100))
                      : 0;
                    return (
                      <div
                        key={connection.id}
                        className="rounded-md border p-2"
                        data-testid={`hermes-admin-connection-${connection.id}`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span>{connection.accountLabel ?? connection.accountHint ?? connection.id}</span>
                          <Badge variant="outline">{connection.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          คิวงานค้าง: {connection.queueDepth}
                        </div>
                        {quota != null ? (
                          <div className="mt-1" data-testid={`hermes-admin-quota-${connection.id}`}>
                            <Progress value={percent} />
                            <span className="text-xs text-gray-500">
                              {connection.usedToday}/{quota} วันนี้
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            โควต้า: ไม่จำกัด · ใช้ไปวันนี้ {connection.usedToday}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}
