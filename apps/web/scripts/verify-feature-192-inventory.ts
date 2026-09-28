import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildFeature186CallSiteAudit } from "./audit-feature-186-call-sites";
import { feature192TimerInventorySummary } from "../server/jobs/feature192TimerPolicy";

export const FEATURE_192_GOOGLE_PRODUCT_ALLOWLIST = [
  "apps/web/server/jobs/gdriveSessionCleanup.ts",
  "python-backend/app/tasks/google_drive_tasks.py",
  "python-backend/app/services/google_token_service.py",
  "python-backend/app/api/internal_gdrive.py",
] as const;

export const RETIRED_GOOGLE_RUNTIME_MARKERS = [
  "Google Cloud Tasks",
  "Cloud Run",
  "OIDC task",
  "google task-handler",
] as const;

type InventoryResult = {
  ok: boolean;
  feature: 192;
  classification: {
    migrated: string[];
    compatibilityDrain: string[];
    productIntegrationAllowed: string[];
    operatorReview: string[];
  };
  audit: ReturnType<typeof buildFeature186CallSiteAudit>;
  timerInventory: ReturnType<typeof feature192TimerInventorySummary>;
  timerInventoryComplete: boolean;
  timerManifestComplete: boolean;
  googleRuntimeFailClosed: boolean;
  evidenceSafe: boolean;
  blockers: string[];
};

const root = join(import.meta.dirname, "..", "..", "..");

function hasUnsafeEvidenceContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeEvidenceContent);
  if (!value || typeof value !== "object") {
    return typeof value === "string" && /(?:postgres(?:ql)?|redis):\/\/|Bearer\s+|signed.?url|-----BEGIN/i.test(value);
  }
  return Object.entries(value).some(([key, child]) =>
    /(?:secret|token|password|credential|private.?key|database.?url)/i.test(key)
    || hasUnsafeEvidenceContent(child),
  );
}

function sourceContainsRetiredRuntime(path: string): boolean {
  if (!existsSync(path)) return false;
  const source = readFileSync(path, "utf8");
  return RETIRED_GOOGLE_RUNTIME_MARKERS.some(marker => source.toLowerCase().includes(marker.toLowerCase()))
    && !source.includes("retired")
    && !source.includes("fail-closed");
}

export function buildFeature192Inventory(): InventoryResult {
  const audit = buildFeature186CallSiteAudit();
  const timerInventory = feature192TimerInventorySummary();
  const compatibilityDrain = [
    ...audit.compatibilityAllowlist,
    ...audit.compatibilityStatusReaders.map(item => `${item.file}:${item.line}`),
    "python-backend/app/services/legacy_task_status.py",
    "server/services/jobLegacyTransportAdapters.ts",
  ];
  const migrated = audit.migratedWave.map(jobType => `job:${jobType}`);
  const productIntegrationAllowed = [...FEATURE_192_GOOGLE_PRODUCT_ALLOWLIST];
  const operatorReview = audit.findings
    .filter(item => !audit.compatibilityAllowlist.includes(item.file))
    .map(item => `${item.file}:${item.line}`);
  const googleRuntimeFiles = [
    join(root, "apps/web/server/services/cloudTasks.ts"),
    join(root, "python-backend/app/services/cloud_tasks.py"),
  ];
  const googleRuntimeFailClosed = googleRuntimeFiles.every(path => !sourceContainsRetiredRuntime(path));
  const manifest = join(root, "ops/feature-186/compatibility-drain-manifest.yaml");
  const timerManifest = join(root, "ops/feature-192/timer-inventory.yaml");
  const evidenceSafe = existsSync(manifest) && !hasUnsafeEvidenceContent(readFileSync(manifest, "utf8"));
  const timerManifestSource = existsSync(timerManifest) ? readFileSync(timerManifest, "utf8") : "";
  const timerManifestComplete = timerInventory.every(item => timerManifestSource.includes(`initializer: ${item.initializer}`));
  const blockers: string[] = [];
  const timerInventoryComplete = timerInventory.length > 0
    && timerInventory.every(item => item.initializer && item.source && item.hardCutoverAction);
  if (operatorReview.length > 0) blockers.push("unclassified_side_effecting_call_site");
  if (!googleRuntimeFailClosed) blockers.push("retired_google_runtime_not_fail_closed");
  if (!evidenceSafe) blockers.push("evidence_contains_sensitive_content");
  if (!timerInventoryComplete) blockers.push("timer_inventory_incomplete");
  if (!timerManifestComplete) blockers.push("timer_manifest_incomplete");
  return {
    ok: blockers.length === 0,
    feature: 192,
    classification: { migrated, compatibilityDrain, productIntegrationAllowed, operatorReview },
    audit,
    timerInventory,
    timerInventoryComplete,
    timerManifestComplete,
    googleRuntimeFailClosed,
    evidenceSafe,
    blockers,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = buildFeature192Inventory();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
