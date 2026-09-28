/**
 * HermesInfrastructureSettingsCard — Feature 135 (Hermes Grok media worker).
 *
 * Extracted out of `InfrastructureSettingsPanel.tsx` (Tasks tab) so it can be
 * mounted and tested on its own instead of dragging in the parent's 22
 * `useQuery`/`useMutation` hooks. Same extraction technique used for
 * `HermesFleetBadge` in `HermesWorkerAdminPanel.tsx` (section-12) — pull the
 * self-contained unit into its own file, mount it directly in tests.
 *
 * Owns: the 5 kill switches, the dev-only web-process-worker toggle, the fee
 * / min-version fields, the 6 numeric limit fields, and the read-only shared
 * worker id — plus the local draft state and the `systemSettings.updateSetting`
 * mutation that persists them.
 *
 * All 15 `hermes_*` / `web_process_hermes_worker_enabled` keys are written
 * through the generic `systemSettings.updateSetting` mutation deliberately:
 * it carries the server's cache-invalidation, drainer start/stop side
 * effect, and `validateHermesLimitCoherence` (systemSettings.ts ~772-805)
 * that a direct SQL write would bypass. A rejected write (e.g.
 * limit-coherence) surfaces here as a visible toast AND an inline error
 * under the offending field — never a silent no-op.
 *
 * Props: the parent (`InfrastructureSettingsPanel`) already fetches
 * `systemSettings.getSettingsByCategory({ category: "infrastructure" })` for
 * its own render-worker toggle, so this card is handed those rows to hydrate
 * from instead of re-querying, and a refetch callback to invalidate the
 * shared query after a successful write.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard } from "@/components/dashboard";
import { HelpButton } from "@/components/help/HelpButton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, Loader2, Server } from "lucide-react";

import {
  HERMES_WORKER_SETTINGS_KEYS_CLIENT,
  HERMES_WORKER_SETTINGS_DEFAULTS_CLIENT,
} from "./hermesWorkerSettingsKeys";

// ============================================================
// Presentational field for the number/text settings (kill switches are
// inline `<Switch>` rows, not this component). Local draft state + explicit
// Save button per field so a server-side rejection (limit-coherence) can be
// surfaced right at the field instead of silently reverting or no-op'ing.
// ============================================================

interface HermesSettingFieldProps {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  type?: "text" | "number";
  saving: boolean;
  error?: string;
  testId: string;
}

function HermesSettingField({
  label,
  helper,
  value,
  onChange,
  onSave,
  type = "number",
  saving,
  error,
  testId,
}: HermesSettingFieldProps) {
  return (
    <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid={testId}>
      <Label className="text-sm font-medium" htmlFor={`${testId}-input`}>
        {label}
      </Label>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      <div className="flex items-center gap-2">
        <Input
          id={`${testId}-input`}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSave}
          disabled={saving}
          data-testid={`${testId}-save`}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-600" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export interface HermesInfrastructureSettingRow {
  key: string;
  value?: string | null;
}

export interface HermesInfrastructureSettingsCardProps {
  /** Rows from `systemSettings.getSettingsByCategory({ category: "infrastructure" })`. */
  infrastructureSettings: HermesInfrastructureSettingRow[] | undefined;
  /** Called after a successful write so the parent's shared query refetches. */
  onSettingsChanged?: () => void;
}

export default function HermesInfrastructureSettingsCard({
  infrastructureSettings,
  onSettingsChanged,
}: HermesInfrastructureSettingsCardProps) {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const copy = {
    title: isThai ? "เปิดใช้ Grok ผ่าน Hermes" : "Enable Grok via Hermes",
    description: isThai
      ? "เปิดการสร้างภาพและวิดีโอด้วยบัญชี Grok ของผู้ใช้ ผ่าน Hermes worker ส่วนตัว"
      : "Enable image and video generation with each user's Grok account through their private Hermes worker.",
    enabled: isThai ? "เปิดใช้งานฝั่งแพลตฟอร์มแล้ว" : "Platform enablement is on",
    disabled: isThai ? "ยังไม่เปิดใช้งานฝั่งแพลตฟอร์ม" : "Platform enablement is off",
    setupTitle: isThai ? "วิธีตั้งค่าให้พร้อมใช้งาน" : "How to finish setup",
    setupSteps: isThai
      ? [
          "เปิดสวิตช์นี้เพื่อใช้ preset ที่ปลอดภัยสำหรับ private worker",
          "ไปที่ Admin → Tenants → Feature Flags แล้วเปิด “Grok via Hermes — Tenant rollout”",
          "ให้ผู้ใช้เปิด Worker app จนสถานะ Online แล้วไปที่ Settings → Connections เพื่อเชื่อมบัญชี Grok",
        ]
      : [
          "Turn on this switch to apply the safe private-worker preset.",
          "Go to Admin → Tenants → Feature Flags and enable “Grok via Hermes — Tenant rollout”.",
          "Have the user bring the Worker app online, then connect Grok in Settings → Connections.",
        ],
    safety: isThai
      ? "Preset นี้จะไม่เปิด Shared pool, Server personal หรือ Web process worker"
      : "This preset keeps shared pool, server-personal, and the web-process worker disabled.",
    advanced: isThai ? "การตั้งค่าขั้นสูงสำหรับ Operator" : "Advanced operator settings",
    advancedHint: isThai
      ? "เปิดเฉพาะเมื่อต้องตั้งค่า shared worker, limits หรือโหมดทดสอบ"
      : "Open only to configure a shared worker, limits, or development modes.",
    help: isThai ? "คู่มือการตั้งค่า" : "Setup Help",
  };
  const hermesDefaults = HERMES_WORKER_SETTINGS_DEFAULTS_CLIENT;
  const [hermesEnabled, setHermesEnabled] = useState<boolean>(hermesDefaults.enabled);
  const [hermesSharedPoolEnabled, setHermesSharedPoolEnabled] = useState<boolean>(hermesDefaults.sharedPoolEnabled);
  const [hermesServerPersonalEnabled, setHermesServerPersonalEnabled] = useState<boolean>(hermesDefaults.serverPersonalEnabled);
  const [hermesPrivateEnabled, setHermesPrivateEnabled] = useState<boolean>(hermesDefaults.privateEnabled);
  const [hermesVideoEnabled, setHermesVideoEnabled] = useState<boolean>(hermesDefaults.videoEnabled);
  const [hermesWebProcessWorkerEnabled, setHermesWebProcessWorkerEnabled] = useState<boolean>(hermesDefaults.webProcessWorkerEnabled);
  const [hermesSharedPoolFeeCreditsDraft, setHermesSharedPoolFeeCreditsDraft] = useState<string>(String(hermesDefaults.sharedPoolFeeCredits));
  const [hermesMinVersionDraft, setHermesMinVersionDraft] = useState<string>(hermesDefaults.minHermesVersion);
  const [hermesMaxRunningPerConnectionDraft, setHermesMaxRunningPerConnectionDraft] = useState(String(hermesDefaults.maxRunningPerConnection));
  const [hermesMaxConcurrentPerSharedWorkerDraft, setHermesMaxConcurrentPerSharedWorkerDraft] = useState(String(hermesDefaults.maxConcurrentPerSharedWorker));
  const [hermesMaxQueuedPerUserDraft, setHermesMaxQueuedPerUserDraft] = useState(String(hermesDefaults.maxQueuedPerUser));
  const [hermesMaxQueuedPerTenantSharedPoolDraft, setHermesMaxQueuedPerTenantSharedPoolDraft] = useState(String(hermesDefaults.maxQueuedPerTenantSharedPool));
  const [hermesSubmitWindowPerUserDraft, setHermesSubmitWindowPerUserDraft] = useState(String(hermesDefaults.submitWindowPerUser));
  const [hermesSubmitWindowPerTenantDraft, setHermesSubmitWindowPerTenantDraft] = useState(String(hermesDefaults.submitWindowPerTenant));
  const [hermesSharedWorkerId, setHermesSharedWorkerId] = useState<string | null>(hermesDefaults.sharedWorkerId);
  const [hermesFieldErrors, setHermesFieldErrors] = useState<Record<string, string>>({});

  // Hydrate from the same `infrastructure` category fetch the parent already
  // has (no extra query needed here). Absent/empty rows fall back to the
  // documented default so the UI never renders blank.
  useEffect(() => {
    const byKey = new Map(
      (infrastructureSettings ?? []).map((s) => [s.key, s.value as string | null | undefined]),
    );
    const K = HERMES_WORKER_SETTINGS_KEYS_CLIENT;
    const boolVal = (key: string, fallback: boolean) => {
      const v = byKey.get(key);
      return v === undefined || v === null || v === "" ? fallback : v === "true";
    };
    const strVal = (key: string, fallback: string) => {
      const v = byKey.get(key);
      return v === undefined || v === null ? fallback : v;
    };

    setHermesEnabled(boolVal(K.enabled, hermesDefaults.enabled));
    setHermesSharedPoolEnabled(boolVal(K.sharedPoolEnabled, hermesDefaults.sharedPoolEnabled));
    setHermesServerPersonalEnabled(boolVal(K.serverPersonalEnabled, hermesDefaults.serverPersonalEnabled));
    setHermesPrivateEnabled(boolVal(K.privateEnabled, hermesDefaults.privateEnabled));
    setHermesVideoEnabled(boolVal(K.videoEnabled, hermesDefaults.videoEnabled));
    setHermesWebProcessWorkerEnabled(boolVal(K.webProcessWorkerEnabled, hermesDefaults.webProcessWorkerEnabled));
    setHermesSharedPoolFeeCreditsDraft(strVal(K.sharedPoolFeeCredits, String(hermesDefaults.sharedPoolFeeCredits)));
    setHermesMinVersionDraft(strVal(K.minHermesVersion, hermesDefaults.minHermesVersion));
    setHermesMaxRunningPerConnectionDraft(strVal(K.maxRunningPerConnection, String(hermesDefaults.maxRunningPerConnection)));
    setHermesMaxConcurrentPerSharedWorkerDraft(strVal(K.maxConcurrentPerSharedWorker, String(hermesDefaults.maxConcurrentPerSharedWorker)));
    setHermesMaxQueuedPerUserDraft(strVal(K.maxQueuedPerUser, String(hermesDefaults.maxQueuedPerUser)));
    setHermesMaxQueuedPerTenantSharedPoolDraft(strVal(K.maxQueuedPerTenantSharedPool, String(hermesDefaults.maxQueuedPerTenantSharedPool)));
    setHermesSubmitWindowPerUserDraft(strVal(K.submitWindowPerUser, String(hermesDefaults.submitWindowPerUser)));
    setHermesSubmitWindowPerTenantDraft(strVal(K.submitWindowPerTenant, String(hermesDefaults.submitWindowPerTenant)));
    setHermesSharedWorkerId(byKey.get(K.sharedWorkerId) || hermesDefaults.sharedWorkerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infrastructureSettings]);

  const updateHermesSettingMutation = trpc.systemSettings.updateSetting.useMutation({
    onSuccess: (_data, variables: any) => {
      setHermesFieldErrors((prev) => ({ ...prev, [variables.key]: "" }));
      onSettingsChanged?.();
    },
    onError: (err: any, variables: any) => {
      toast.error(`Failed to save Hermes worker setting: ${err.message}`);
      setHermesFieldErrors((prev) => ({ ...prev, [variables.key]: err.message }));
    },
  });

  const applySafePresetMutation = trpc.systemSettings.applyHermesSafePreset.useMutation({
    onSuccess: (_data, variables) => {
      setHermesEnabled(variables.enabled);
      if (variables.enabled) {
        setHermesSharedPoolEnabled(false);
        setHermesServerPersonalEnabled(false);
        setHermesPrivateEnabled(true);
        setHermesVideoEnabled(true);
        setHermesWebProcessWorkerEnabled(false);
      }
      toast.success(
        variables.enabled
          ? (isThai ? "เปิดใช้ Grok ผ่าน Hermes แล้ว" : "Grok via Hermes is enabled")
          : (isThai ? "ปิดใช้ Grok ผ่าน Hermes แล้ว" : "Grok via Hermes is disabled"),
      );
      onSettingsChanged?.();
    },
    onError: (error) => {
      toast.error(
        isThai
          ? `บันทึกการตั้งค่า Grok via Hermes ไม่สำเร็จ: ${error.message}`
          : `Could not save Grok via Hermes settings: ${error.message}`,
      );
    },
  });

  const saveHermesSetting = (key: string, value: string, description?: string) => {
    updateHermesSettingMutation.mutate({
      category: "infrastructure" as any,
      key,
      value,
      description,
    });
  };

  return (
    <DashboardCard
      className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden mt-6"
      data-testid="hermes-media-worker-settings-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5 text-purple-500" />
            {copy.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
        </div>
        <HelpButton
          page="/admin/settings"
          topic="grok-via-hermes-admin"
          variant="outline"
          size="sm"
          label={copy.help}
        />
      </div>

      <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-semibold">{copy.title}</Label>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {hermesEnabled ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
              {hermesEnabled ? copy.enabled : copy.disabled}
            </p>
          </div>
          <Switch
            aria-label={copy.title}
            checked={hermesEnabled}
            disabled={applySafePresetMutation.isPending}
            onCheckedChange={(checked) => applySafePresetMutation.mutate({ enabled: checked })}
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">{copy.setupTitle}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {copy.setupSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">{copy.safety}</p>
        </div>
      </div>

      <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <span>
            <span className="block text-sm font-semibold">{copy.advanced}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{copy.advancedHint}</span>
          </span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">
      {/* Advanced kill switches */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Shared pool enabled</Label>
            <p className="text-xs text-muted-foreground">hermes_worker_shared_pool_enabled</p>
          </div>
          <Switch
            aria-label="Toggle Shared pool enabled"
            checked={hermesSharedPoolEnabled}
            disabled={updateHermesSettingMutation.isPending}
            onCheckedChange={(checked) => {
              const previous = hermesSharedPoolEnabled;
              setHermesSharedPoolEnabled(checked);
              updateHermesSettingMutation.mutate(
                {
                  category: "infrastructure" as any,
                  key: HERMES_WORKER_SETTINGS_KEYS_CLIENT.sharedPoolEnabled,
                  value: checked ? "true" : "false",
                },
                { onError: () => setHermesSharedPoolEnabled(previous) },
              );
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Server personal enabled</Label>
            <p className="text-xs text-muted-foreground">hermes_worker_server_personal_enabled</p>
          </div>
          <Switch
            aria-label="Toggle Server personal enabled"
            checked={hermesServerPersonalEnabled}
            disabled={updateHermesSettingMutation.isPending}
            onCheckedChange={(checked) => {
              const previous = hermesServerPersonalEnabled;
              setHermesServerPersonalEnabled(checked);
              updateHermesSettingMutation.mutate(
                {
                  category: "infrastructure" as any,
                  key: HERMES_WORKER_SETTINGS_KEYS_CLIENT.serverPersonalEnabled,
                  value: checked ? "true" : "false",
                },
                { onError: () => setHermesServerPersonalEnabled(previous) },
              );
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Private worker enabled</Label>
            <p className="text-xs text-muted-foreground">hermes_worker_private_enabled</p>
          </div>
          <Switch
            aria-label="Toggle Private worker enabled"
            checked={hermesPrivateEnabled}
            disabled={updateHermesSettingMutation.isPending}
            onCheckedChange={(checked) => {
              const previous = hermesPrivateEnabled;
              setHermesPrivateEnabled(checked);
              updateHermesSettingMutation.mutate(
                {
                  category: "infrastructure" as any,
                  key: HERMES_WORKER_SETTINGS_KEYS_CLIENT.privateEnabled,
                  value: checked ? "true" : "false",
                },
                { onError: () => setHermesPrivateEnabled(previous) },
              );
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Video generation enabled</Label>
            <p className="text-xs text-muted-foreground">hermes_worker_video_enabled</p>
          </div>
          <Switch
            aria-label="Toggle Video generation enabled"
            checked={hermesVideoEnabled}
            disabled={updateHermesSettingMutation.isPending}
            onCheckedChange={(checked) => {
              const previous = hermesVideoEnabled;
              setHermesVideoEnabled(checked);
              updateHermesSettingMutation.mutate(
                {
                  category: "infrastructure" as any,
                  key: HERMES_WORKER_SETTINGS_KEYS_CLIENT.videoEnabled,
                  value: checked ? "true" : "false",
                },
                { onError: () => setHermesVideoEnabled(previous) },
              );
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Web process Hermes worker (dev-only)</Label>
            <p className="text-xs text-muted-foreground">
              web_process_hermes_worker_enabled — same dev-only pattern as the render-worker
              toggle above; production should leave this off.
            </p>
          </div>
          <Switch
            aria-label="Toggle Web process Hermes worker (dev-only)"
            checked={hermesWebProcessWorkerEnabled}
            disabled={updateHermesSettingMutation.isPending}
            onCheckedChange={(checked) => {
              const previous = hermesWebProcessWorkerEnabled;
              setHermesWebProcessWorkerEnabled(checked);
              updateHermesSettingMutation.mutate(
                {
                  category: "infrastructure" as any,
                  key: HERMES_WORKER_SETTINGS_KEYS_CLIENT.webProcessWorkerEnabled,
                  value: checked ? "true" : "false",
                  description: "Dev-only in-web Hermes worker drainer",
                },
                { onError: () => setHermesWebProcessWorkerEnabled(previous) },
              );
            }}
          />
        </div>
      </div>

      {/* Fee / version */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HermesSettingField
          testId="hermes-shared-pool-fee-credits"
          label="Shared pool fee (credits)"
          helper="hermes_shared_pool_fee_credits"
          type="number"
          value={hermesSharedPoolFeeCreditsDraft}
          onChange={setHermesSharedPoolFeeCreditsDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.sharedPoolFeeCredits]}
          onSave={() =>
            saveHermesSetting(
              HERMES_WORKER_SETTINGS_KEYS_CLIENT.sharedPoolFeeCredits,
              hermesSharedPoolFeeCreditsDraft,
            )
          }
        />
        <HermesSettingField
          testId="hermes-min-version"
          label="Minimum Hermes worker version"
          helper="hermes_worker_min_version (blank = no floor)"
          type="text"
          value={hermesMinVersionDraft}
          onChange={setHermesMinVersionDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.minHermesVersion]}
          onSave={() =>
            saveHermesSetting(HERMES_WORKER_SETTINGS_KEYS_CLIENT.minHermesVersion, hermesMinVersionDraft)
          }
        />
      </div>

      {/* Limits */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HermesSettingField
          testId="hermes-max-running-per-connection"
          label="Max running per connection"
          helper="hermes_max_running_per_connection"
          value={hermesMaxRunningPerConnectionDraft}
          onChange={setHermesMaxRunningPerConnectionDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxRunningPerConnection]}
          onSave={() =>
            saveHermesSetting(
              HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxRunningPerConnection,
              hermesMaxRunningPerConnectionDraft,
            )
          }
        />
        <HermesSettingField
          testId="hermes-max-concurrent-per-shared-worker"
          label="Max concurrent per shared worker"
          helper="hermes_max_concurrent_per_shared_worker"
          value={hermesMaxConcurrentPerSharedWorkerDraft}
          onChange={setHermesMaxConcurrentPerSharedWorkerDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxConcurrentPerSharedWorker]}
          onSave={() =>
            saveHermesSetting(
              HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxConcurrentPerSharedWorker,
              hermesMaxConcurrentPerSharedWorkerDraft,
            )
          }
        />
        <HermesSettingField
          testId="hermes-max-queued-per-user"
          label="Max queued per user"
          helper="hermes_max_queued_per_user — must stay ≥ max admission batch size"
          value={hermesMaxQueuedPerUserDraft}
          onChange={setHermesMaxQueuedPerUserDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxQueuedPerUser]}
          onSave={() =>
            saveHermesSetting(HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxQueuedPerUser, hermesMaxQueuedPerUserDraft)
          }
        />
        <HermesSettingField
          testId="hermes-max-queued-per-tenant-shared-pool"
          label="Max queued per tenant shared pool"
          helper="hermes_max_queued_per_tenant_shared_pool"
          value={hermesMaxQueuedPerTenantSharedPoolDraft}
          onChange={setHermesMaxQueuedPerTenantSharedPoolDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxQueuedPerTenantSharedPool]}
          onSave={() =>
            saveHermesSetting(
              HERMES_WORKER_SETTINGS_KEYS_CLIENT.maxQueuedPerTenantSharedPool,
              hermesMaxQueuedPerTenantSharedPoolDraft,
            )
          }
        />
        <HermesSettingField
          testId="hermes-submit-window-per-user"
          label="Submit window per user"
          helper="hermes_submit_window_per_user (10-min sliding window)"
          value={hermesSubmitWindowPerUserDraft}
          onChange={setHermesSubmitWindowPerUserDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.submitWindowPerUser]}
          onSave={() =>
            saveHermesSetting(
              HERMES_WORKER_SETTINGS_KEYS_CLIENT.submitWindowPerUser,
              hermesSubmitWindowPerUserDraft,
            )
          }
        />
        <HermesSettingField
          testId="hermes-submit-window-per-tenant"
          label="Submit window per tenant"
          helper="hermes_submit_window_per_tenant (10-min sliding window)"
          value={hermesSubmitWindowPerTenantDraft}
          onChange={setHermesSubmitWindowPerTenantDraft}
          saving={updateHermesSettingMutation.isPending}
          error={hermesFieldErrors[HERMES_WORKER_SETTINGS_KEYS_CLIENT.submitWindowPerTenant]}
          onSave={() =>
            saveHermesSetting(
              HERMES_WORKER_SETTINGS_KEYS_CLIENT.submitWindowPerTenant,
              hermesSubmitWindowPerTenantDraft,
            )
          }
        />
      </div>

      {/* Shared worker id — read-only, written by the pairing script */}
      <div
        className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
        data-testid="hermes-shared-worker-id"
      >
        <Label className="text-sm font-medium">Shared worker ID</Label>
        <p className="text-xs text-muted-foreground">
          hermes_shared_worker_id — written by the pairing script, read-only here (verify pairing).
        </p>
        <p className="mt-1 font-mono text-sm">{hermesSharedWorkerId || "ยังไม่ได้จับคู่ (not paired yet)"}</p>
      </div>
        </div>
      </details>
    </DashboardCard>
  );
}
