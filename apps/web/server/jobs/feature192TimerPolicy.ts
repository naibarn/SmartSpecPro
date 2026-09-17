import { isFeature186HardCutoverEnabled } from "../services/cloudflareRuntimeTarget";

export type Feature192TimerDisposition =
  | "canonical-control-plane"
  | "external-cloudflare-scheduler"
  | "product-integration-canonical"
  | "compatibility-drain-disabled";

export type Feature192TimerInventoryEntry = {
  initializer: string;
  source: string;
  disposition: Feature192TimerDisposition;
  jobTypes: readonly string[];
};

/**
 * Server-side periodic work must be explicit during the Cloudflare migration.
 * This list is intentionally small and reviewable: a new business timer must
 * either create a canonical job, be driven by an external Cloudflare Cron
 * trigger, or be added as a disabled compatibility path before it can run in
 * hard-cutover mode.
 */
export const FEATURE_192_TIMER_INVENTORY: readonly Feature192TimerInventoryEntry[] =
  [
    {
      initializer: "initializeTrashPurgeJob",
      source: "server/jobs/purgeOldTrashItems.ts",
      disposition: "canonical-control-plane",
      jobTypes: ["library.trash_purge"],
    },
    {
      initializer: "initializeGDriveCleanupJob",
      source: "server/jobs/gdriveSessionCleanup.ts",
      disposition: "product-integration-canonical",
      jobTypes: ["gdrive.edit_session_cleanup"],
    },
    {
      initializer: "initializeDatabaseBackupJob",
      source: "server/jobs/databaseBackupJob.ts",
      disposition: "canonical-control-plane",
      jobTypes: ["database.backup.maintenance"],
    },
    {
      initializer: "initializeNotificationJobs",
      source: "server/jobs/notificationJobs.ts",
      disposition: "canonical-control-plane",
      jobTypes: [
        "notification.escalation",
        "notification.digest",
        "notification.retention",
        "notification.webhook_delivery",
      ],
    },
    {
      initializer: "initializeMemoryMaintenanceJobs",
      source: "server/jobs/memoryMaintenanceJobs.ts",
      disposition: "canonical-control-plane",
      jobTypes: [
        "memory.archive_cleanup",
        "memory.chunk_cleanup",
        "memory.embedding_reconciliation",
        "memory.eviction",
      ],
    },
    {
      initializer: "initializeUnifiedJobControlPlaneReconcilerJob",
      source: "server/jobs/unifiedJobControlPlaneReconcilerJob.ts",
      disposition: "canonical-control-plane",
      jobTypes: ["control-plane.reconcile"],
    },
    {
      initializer: "initializeBillingJobs",
      source: "server/jobs/billingJobs.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["billing.maintenance"],
    },
    {
      initializer: "initializeUploadPostCleanupJob",
      source: "server/jobs/uploadPostCleanup.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["upload_post.retention_cleanup"],
    },
    {
      initializer: "initializeFinanceOcrRetentionJob",
      source: "server/jobs/financeOcrRetentionJob.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["finance.ocr_retention"],
    },
    {
      initializer: "initializeContentRefreshJob",
      source: "server/jobs/contentRefreshJob.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["content.refresh"],
    },
    {
      initializer: "initializeInactiveUserJob",
      source: "server/jobs/inactiveUserJob.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["user.inactivity_maintenance"],
    },
    {
      initializer: "initializeFeedbackAutoCloseJob",
      source: "server/jobs/feedbackAutoCloseJob.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["feedback.auto_close"],
    },
    {
      initializer: "initializePendingApprovalAlertJob",
      source: "server/jobs/pendingApprovalAlert.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["notification.pending_approval_alert"],
    },
    {
      initializer: "initializeSkillMaintenanceScheduleJob",
      source: "server/jobs/skillMaintenanceSchedule.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["skill.maintenance"],
    },
    {
      initializer: "initializeBrowserAutomationClaimReconcilerJob",
      source: "server/jobs/browserAutomationClaimReconciler.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["automation.browser_claim_reconcile"],
    },
    {
      initializer: "initializeWorkerStallWatchdogJob",
      source: "server/jobs/workerStallWatchdogJob.ts",
      disposition: "canonical-control-plane",
      jobTypes: ["control-plane.lease_reconcile"],
    },
    {
      initializer: "initializeWorkerHeartbeatRetentionJob",
      source: "server/jobs/workerHeartbeatRetentionJob.ts",
      disposition: "canonical-control-plane",
      jobTypes: ["worker.heartbeat_retention"],
    },
    {
      initializer: "initializeProductionExecutionReconciliationJob",
      source: "server/jobs/productionExecutionReconciliationJob.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["production.execution_reconcile"],
    },
    {
      initializer: "initializeMarketplaceAutoReviewJob",
      source: "server/jobs/marketplaceAutoReviewJob.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["marketplace.auto_review"],
    },
    {
      initializer: "startDeferredMediaRetryWorker",
      source: "server/services/deferredMediaRetryService.ts",
      disposition: "compatibility-drain-disabled",
      jobTypes: ["media.deferred_retry"],
    },
    {
      initializer: "startAutoTeamMediaPipelineSweeper",
      source: "server/services/autoTeamMediaCompletionService.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["team.media_reconcile"],
    },
    {
      initializer: "startAutoTeamRecoverySweep",
      source: "server/services/autoTeamRecoveryService.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["team.run_recovery"],
    },
    {
      initializer: "startMcpStaleMediaTaskReconciler",
      source: "server/services/mcpMediaAdapter.ts",
      disposition: "external-cloudflare-scheduler",
      jobTypes: ["media.mcp_reconcile"],
    },
  ] as const;

export function getFeature192TimerEntry(
  initializer: string
): Feature192TimerInventoryEntry {
  const entry = FEATURE_192_TIMER_INVENTORY.find(
    item => item.initializer === initializer
  );
  if (!entry) throw new Error(`FEATURE_192_TIMER_UNCLASSIFIED:${initializer}`);
  return entry;
}

export function shouldRunFeature192InProcessTimer(
  initializer: string
): boolean {
  if (!isFeature186HardCutoverEnabled()) return true;
  const entry = getFeature192TimerEntry(initializer);
  return (
    entry.disposition === "canonical-control-plane" ||
    entry.disposition === "product-integration-canonical"
  );
}

export function feature192TimerInventorySummary() {
  return FEATURE_192_TIMER_INVENTORY.map(entry => ({
    ...entry,
    hardCutoverAction:
      entry.disposition === "canonical-control-plane" ||
      entry.disposition === "product-integration-canonical"
        ? "run"
        : "skip",
  }));
}
