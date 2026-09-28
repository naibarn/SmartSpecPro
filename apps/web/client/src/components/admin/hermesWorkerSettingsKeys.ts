/**
 * Feature 135 — Hermes Grok media worker admin settings, client-safe copy.
 *
 * `server/services/hermesWorkerSettings.ts` is NOT client-safe (it imports
 * `getDb`/drizzle schema), so this file mirrors its `HERMES_WORKER_SETTINGS_KEYS`
 * key strings and default values for use by `InfrastructureSettingsPanel`.
 *
 * These two lists MUST stay in sync — enforced at the file-content level by
 * `__tests__/hermesWorkerSettingsKeys.guard.test.ts` (same technique as
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`: no runtime
 * import of the server module, just a text-content comparison), so a drift
 * between the two fails CI instead of silently desyncing the admin UI from
 * the server's read/validate/write path.
 */

export const HERMES_WORKER_SETTINGS_KEYS_CLIENT = {
  enabled: "hermes_worker_enabled",
  sharedPoolEnabled: "hermes_worker_shared_pool_enabled",
  serverPersonalEnabled: "hermes_worker_server_personal_enabled",
  privateEnabled: "hermes_worker_private_enabled",
  videoEnabled: "hermes_worker_video_enabled",
  sharedPoolFeeCredits: "hermes_shared_pool_fee_credits",
  maxRunningPerConnection: "hermes_max_running_per_connection",
  maxConcurrentPerSharedWorker: "hermes_max_concurrent_per_shared_worker",
  maxQueuedPerUser: "hermes_max_queued_per_user",
  maxQueuedPerTenantSharedPool: "hermes_max_queued_per_tenant_shared_pool",
  submitWindowPerUser: "hermes_submit_window_per_user",
  submitWindowPerTenant: "hermes_submit_window_per_tenant",
  minHermesVersion: "hermes_worker_min_version",
  sharedWorkerId: "hermes_shared_worker_id",
  webProcessWorkerEnabled: "web_process_hermes_worker_enabled",
} as const;

export type HermesWorkerSettingsKeyClient = keyof typeof HERMES_WORKER_SETTINGS_KEYS_CLIENT;

/** Documented defaults (mirrors `DEFAULT_HERMES_WORKER_SETTINGS` server-side)
 *  — used so an absent/empty `system_settings` row renders the real default
 *  instead of a blank field. */
export const HERMES_WORKER_SETTINGS_DEFAULTS_CLIENT = {
  enabled: false,
  sharedPoolEnabled: false,
  serverPersonalEnabled: false,
  privateEnabled: false,
  videoEnabled: false,
  sharedPoolFeeCredits: 0,
  maxRunningPerConnection: 1,
  maxConcurrentPerSharedWorker: 2,
  maxQueuedPerUser: 8,
  maxQueuedPerTenantSharedPool: 20,
  submitWindowPerUser: 10,
  submitWindowPerTenant: 60,
  minHermesVersion: "",
  sharedWorkerId: null as string | null,
  webProcessWorkerEnabled: false,
} as const;
