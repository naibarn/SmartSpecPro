import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildFeature186CallSiteAudit } from "./audit-feature-186-call-sites";
import { getCloudflareLocalContractReadiness } from "../server/services/cloudflareJobAdapters";

const root = join(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(join(root, "apps/web/drizzle/0303_feature_186_unified_job_control_plane.sql"), "utf8");
const contractMigration = readFileSync(join(root, "apps/web/drizzle/0304_feature_186_contract_version.sql"), "utf8");
const timeoutMigration = readFileSync(join(root, "apps/web/drizzle/0305_feature_186_timeout_policy.sql"), "utf8");
const outboxMigration = readFileSync(join(root, "apps/web/drizzle/0306_feature_186_outbox_cancellation.sql"), "utf8");
const evidenceMigration = readFileSync(join(root, "apps/web/drizzle/0307_feature_186_action_callback_evidence.sql"), "utf8");
const reviewMigration = readFileSync(join(root, "apps/web/drizzle/0308_feature_186_operator_review_reason.sql"), "utf8");
const pythonRuntimeMigration = readFileSync(join(root, "apps/web/drizzle/0309_feature_186_python_job_runtime.sql"), "utf8");
const nodeRuntimeMigration = readFileSync(join(root, "apps/web/drizzle/0313_feature_186_node_job_runtime.sql"), "utf8");
const admissionMigration = readFileSync(join(root, "apps/web/drizzle/0314_feature_186_admission_indexes.sql"), "utf8");
const callbackTimestampMigration = readFileSync(join(root, "apps/web/drizzle/0315_feature_186_callback_timestamp.sql"), "utf8");
const providerAdmissionMigration = readFileSync(join(root, "apps/web/drizzle/0325_feature_186_provider_admission_polling.sql"), "utf8");
const providerAttemptMigration = readFileSync(join(root, "apps/web/drizzle/0326_feature_186_provider_attempt_windows.sql"), "utf8");
const providerAttemptRepairMigration = readFileSync(join(root, "apps/web/drizzle/0327_feature_186_provider_attempt_backfill_repair.sql"), "utf8");
const safetyMigration = readFileSync(join(root, "apps/web/drizzle/0310_feature_186_error_and_evidence_safety.sql"), "utf8");
const scheduleMigration = readFileSync(join(root, "apps/web/drizzle/0311_feature_186_capacity_schedule_occurrence.sql"), "utf8");
const journal = readFileSync(join(root, "apps/web/drizzle/meta/_journal.json"), "utf8");
const rolloutManifest = readFileSync(join(root, "specs/feature/186-unified-job-control-plane-adapters/rollout-manifest.yaml"), "utf8");
const feature187Spec = readFileSync(join(root, "specs/feature/187-cloudflare-hybrid-migration-and-dev-prod-sync/spec.md"), "utf8");
const feature188Root = join(root, "specs/feature/188-admin-platform-operations-and-cloudflare-cutover");
const feature188Spec = readFileSync(join(root, "specs/feature/188-admin-platform-operations-and-cloudflare-cutover/spec.md"), "utf8");
const feature189Root = join(root, "specs/feature/189-unified-tenant-identity-and-data-transfer");
const feature189Manifest = readFileSync(join(feature189Root, "rollout-manifest.md"), "utf8");
const feature189Spec = readFileSync(join(feature189Root, "spec.md"), "utf8");
const contextSource = readFileSync(join(root, "apps/web/server/_core/context.ts"), "utf8");
const serverEntrySource = readFileSync(join(root, "apps/web/server/_core/index.ts"), "utf8");
const schemaSource = readFileSync(join(root, "apps/web/drizzle/schema.ts"), "utf8");
const schemaMigrations = `${migration}\n${contractMigration}\n${timeoutMigration}\n${outboxMigration}\n${evidenceMigration}\n${reviewMigration}\n${pythonRuntimeMigration}\n${nodeRuntimeMigration}\n${safetyMigration}\n${scheduleMigration}\n${providerAdmissionMigration}\n${providerAttemptMigration}`;

function readTextTree(path: string): string {
  if (!existsSync(path)) return "";
  return readdirSync(path, { withFileTypes: true })
    .map(entry => {
      const entryPath = join(path, entry.name);
      return entry.isDirectory() ? readTextTree(entryPath) : readFileSync(entryPath, "utf8");
    })
    .join("\n");
}

function extractStatus(spec: string): string | null {
  return spec.match(/^\*\*Status:\*\*\s*(.+)$/m)?.[1]?.trim()
    ?? spec.match(/^Status:\s*(.+)$/m)?.[1]?.trim()
    ?? null;
}

const feature189Docs = readTextTree(feature189Root);
const feature188Docs = readTextTree(feature188Root);
const feature186MigrationNumbers = [...journal.matchAll(/"tag":\s*"(\d+)_feature_186_[^"]+"/g)]
  .map(match => Number(match[1]))
  .filter(Number.isFinite);
const feature189MigrationNumbersInJournal = [...journal.matchAll(/"tag":\s*"(\d+)_feature_189_tenant_identity_and_data_transfer"/g)]
  .map(match => Number(match[1]))
  .filter(Number.isFinite);
// Feature 186 may receive additive follow-up migrations after Feature 189 or
// Feature 188 has already landed. Dependency numbering must remain anchored
// to the latest Feature 186 migration before the first Feature 189 migration;
// otherwise a harmless Feature 186 follow-up falsely demands renumbering
// already-published Feature 189 files.
const firstFeature189Migration = Math.min(...feature189MigrationNumbersInJournal, Number.POSITIVE_INFINITY);
const feature186BaselineMigrations = feature186MigrationNumbers.filter(number => number < firstFeature189Migration);
const latestFeature186Migration = Math.max(...feature186BaselineMigrations, 0);
const repositoryMigrationNumbers = [...journal.matchAll(/"tag":\s*"(\d+)_/g)]
  .map(match => Number(match[1]))
  .filter(Number.isFinite);
const latestRepositoryMigration = Math.max(...repositoryMigrationNumbers, latestFeature186Migration);
const expectedFeature189MigrationTag = `${String(latestFeature186Migration + 1).padStart(4, "0")}_feature_189_tenant_identity_and_data_transfer`;
const expectedFeature189BackfillMigrationTag = `${String(latestFeature186Migration + 2).padStart(4, "0")}_feature_189_tenant_identity_backfill_completion`;
// Feature migrations may be authored in a different dependency order than
// the latest unrelated repository migration. Prefer the tag already declared
// in the journal; only require the next number when Feature 188 has no entry.
const declaredFeature188MigrationNumbers = [...journal.matchAll(/"tag":\s*"(\d+)_feature_188_platform_operations"/g)]
  .map(match => Number(match[1])).filter(Number.isFinite);
const feature188MigrationNumber = declaredFeature188MigrationNumbers.length > 0
  ? Math.max(...declaredFeature188MigrationNumbers)
  : latestRepositoryMigration + 1;
const expectedFeature188MigrationTag = `${String(feature188MigrationNumber).padStart(4, "0")}_feature_188_platform_operations`;
const expectedFeature189MigrationFile = `apps/web/drizzle/${expectedFeature189MigrationTag}.sql`;
const expectedFeature189BackfillMigrationFile = `apps/web/drizzle/${expectedFeature189BackfillMigrationTag}.sql`;
const expectedFeature188MigrationFile = `apps/web/drizzle/${expectedFeature188MigrationTag}.sql`;
const feature188FollowupMigrationTags = [
  "0322_feature_188_promotion_binding",
  "0323_feature_188_promotion_batch_fencing",
];
const missingFeature188FollowupMigrations = feature188FollowupMigrationTags.filter(tag =>
  !journal.includes(`\"tag\": \"${tag}\"`)
  || !existsSync(join(root, `apps/web/drizzle/${tag}.sql`))
  || !feature188Docs.includes(tag),
);
const feature189SessionRevocationMigrationTag = "0319_feature_189_session_revocation";
const missingFeature189SessionRevocationMigration = journal.includes(`\"tag\": \"${feature189SessionRevocationMigrationTag}\"`)
  && existsSync(join(root, `apps/web/drizzle/${feature189SessionRevocationMigrationTag}.sql`))
  && feature189Manifest.includes(feature189SessionRevocationMigrationTag)
  ? []
  : [feature189SessionRevocationMigrationTag];
const feature189MigrationPath = join(root, expectedFeature189MigrationFile);
const feature189MigrationSource = existsSync(feature189MigrationPath)
  ? readFileSync(feature189MigrationPath, "utf8")
  : "";
const feature189BackfillMigrationPath = join(root, expectedFeature189BackfillMigrationFile);
const feature189BackfillMigrationSource = existsSync(feature189BackfillMigrationPath)
  ? readFileSync(feature189BackfillMigrationPath, "utf8")
  : "";
const feature189MigrationReferenceCount = (feature189Docs.match(new RegExp(expectedFeature189MigrationTag, "g")) ?? []).length;
const feature188MigrationReferenceCount = (feature188Docs.match(new RegExp(expectedFeature188MigrationTag, "g")) ?? []).length;
const staleFeature189MigrationReference = feature189Docs.includes("0307_feature_189_tenant_identity_and_data_transfer");
const staleFeature188MigrationReference = feature188Docs.includes("0306_feature_188_platform_operations");
const feature189RuntimeFiles = [
  "apps/web/server/services/tenantTransferHandlers.ts",
  "apps/web/server/routers/tenantDataTransfer.ts",
  "apps/web/client/src/pages/TenantDataTransfer.tsx",
];
const feature189RuntimeMissingFiles = feature189RuntimeFiles.filter(file => !existsSync(join(root, file)));
const feature189RuntimeImplementationPresent = feature189RuntimeMissingFiles.length === 0;
const crossFeatureStructuralFindings = [
  ...(latestFeature186Migration < 1 ? ["feature_186_migration_journal_not_readable"] : []),
  ...(staleFeature189MigrationReference ? ["feature_189_reuses_feature_186_migration_number"] : []),
  ...(feature189MigrationReferenceCount === 0 ? ["feature_189_next_migration_not_declared"] : []),
  ...(staleFeature188MigrationReference ? ["feature_188_reuses_feature_186_migration_number"] : []),
  ...(feature188MigrationReferenceCount === 0 ? ["feature_188_next_migration_not_declared"] : []),
  ...(feature187Spec.includes("production cutover") && !feature187Spec.includes("does not own production activation")
    ? ["feature_187_ownership_boundary_missing"]
    : []),
  ...(feature188Spec.includes("production activation") && !feature188Spec.includes("sole owner of production activation")
    ? ["feature_188_activation_owner_missing"]
    : []),
  ...(feature189Spec.includes("tenant_data_transfer") && !feature189Spec.includes("must not add a second job ledger")
    ? ["feature_189_job_ledger_boundary_missing"]
    : []),
  ...(feature189Spec.includes("currentTenantId") && !contextSource.includes("resolveRequestTenantId")
    ? ["feature_189_authenticated_context_guard_missing"]
    : []),
  ...(feature189Spec.includes("server-derived") && serverEntrySource.includes("validatedBody.tenantId ||")
    ? ["feature_189_internal_tenant_selector_still_trusted"]
    : []),
];
const crossFeatureReadiness = {
  feature187: { status: extractStatus(feature187Spec), handoffRequired: "CUTOVER_CANDIDATE", productionCutoverAllowed: false },
  feature188: {
    status: extractStatus(feature188Spec),
    activationOwner: true,
    productionCutoverAllowed: false,
    migrationTag: expectedFeature188MigrationTag,
    migrationFilePresent: existsSync(join(root, expectedFeature188MigrationFile)),
    followupMigrationTags: feature188FollowupMigrationTags,
    missingFollowupMigrations: missingFeature188FollowupMigrations,
  },
  feature189: {
    status: extractStatus(feature189Spec),
    migrationTag: expectedFeature189MigrationTag,
    migrationFilePresent: existsSync(join(root, expectedFeature189MigrationFile)),
    backfillMigrationTag: expectedFeature189BackfillMigrationTag,
    backfillMigrationFilePresent: existsSync(feature189BackfillMigrationPath),
    sessionRevocationMigrationTag: feature189SessionRevocationMigrationTag,
    sessionRevocationMigrationPresent: missingFeature189SessionRevocationMigration.length === 0,
    transferFlagDeclared: feature189Manifest.includes("feature189_transfer_execute"),
    runtimeImplementationPresent: feature189RuntimeImplementationPresent,
    runtimeMissingFiles: feature189RuntimeMissingFiles,
  },
};
const required = ["worker_job_attempts", "worker_job_dispatches", "worker_job_outbox", "worker_job_schedule_occurrences", "worker_job_settlements", "worker_job_actions", "worker_job_callbacks", "worker_jobs", "worker_job_events"];
const missing = required.filter(name => !schemaMigrations.includes(`"${name}"`));
const requiredContractFields = ["definitionHash", "eventSequence", "eventIdempotencyKey", "fencingVersion", "publisherFencingVersion", "occurrenceKey"];
const missingContractFields = requiredContractFields.filter(field => !migration.includes(`"${field}"`));
const missingReviewProjection = reviewMigration.includes('ADD COLUMN IF NOT EXISTS "operatorReviewReason"') ? [] : ["operatorReviewReason"];
const missingContractVersion = contractMigration.includes('ADD COLUMN IF NOT EXISTS "contractVersion"') ? [] : ["contractVersion"];
const missingTimeoutPolicy = timeoutMigration.includes('ADD COLUMN IF NOT EXISTS "timeoutPolicyJson"') ? [] : ["timeoutPolicyJson"];
const missingOutboxCancellation = outboxMigration.includes('ADD COLUMN IF NOT EXISTS "cancelledAt"') ? [] : ["cancelledAt"];
const missingEvidenceTables = ["worker_job_actions", "worker_job_callbacks"].filter(name => !evidenceMigration.includes(`"${name}"`));
const missingEvidenceConstraints = ["worker_job_actions_action_unique", "worker_job_callbacks_provider_event_unique", "worker_job_callbacks_replay_unique"].filter(name => !evidenceMigration.includes(name));
const missingPythonRuntime = pythonRuntimeMigration.includes("python_job_worker") ? [] : ["python_job_worker"];
const missingNodeRuntime = nodeRuntimeMigration.includes("node_job_worker") ? [] : ["node_job_worker"];
const missingAdmissionIndexes = ["worker_jobs_admission_tenant_class_status_idx", "worker_jobs_admission_class_status_idx"].filter(name => !admissionMigration.includes(name));
const missingCallbackTimestamp = callbackTimestampMigration.includes('"occurredAt"') && callbackTimestampMigration.includes("SET NOT NULL") ? [] : ["occurredAt"];
const missingSafetyFields = ["errorCode", "errorMessage"].filter(field => !safetyMigration.includes(`"${field}"`));
const missingSafetyCallbackGuard = safetyMigration.includes("worker_job_callbacks") ? [] : ["worker_job_callbacks"];
const missingScheduleMigration = scheduleMigration.includes("scheduledOccurrenceKey") && scheduleMigration.includes("capacity_assessments_scheduled_occurrence_unique") ? [] : ["0311_capacity_schedule_occurrence"];
const missingJournalEntries = ["0310_feature_186_error_and_evidence_safety", "0311_feature_186_capacity_schedule_occurrence", "0313_feature_186_node_job_runtime", "0314_feature_186_admission_indexes", "0315_feature_186_callback_timestamp", "0325_feature_186_provider_admission_polling", "0326_feature_186_provider_attempt_windows", "0327_feature_186_provider_attempt_backfill_repair"].filter(tag => !journal.includes(`\"tag\": \"${tag}\"`));
const requiredProviderTables = ["llm_provider_accounts", "media_provider_accounts", "worker_job_provider_reservations", "provider_admission_windows", "provider_scheduler_states"];
const missingProviderTables = requiredProviderTables.filter(name => !providerAdmissionMigration.includes(`\"${name}\"`) || !schemaSource.includes(`\"${name}\"`));
const missingProviderConstraints = ["worker_job_provider_reservations_operation_unique", "provider_admission_windows_scope_unique", "provider_scheduler_states_pool_user_unique", "worker_job_provider_reservations_job_business_attempt_kind_unique"].filter(name => !schemaMigrations.includes(name));
const missingProviderAttemptContract = providerAttemptMigration.includes('ADD COLUMN IF NOT EXISTS "businessAttempt"') && providerAttemptMigration.includes('ALTER COLUMN "businessAttempt" SET NOT NULL') && providerAttemptMigration.includes('FROM "worker_job_attempts" a') && providerAttemptRepairMigration.includes('FROM "worker_job_attempts" a') ? [] : ["businessAttempt"];
const forbidden = /\b(DROP\s+(TABLE|TYPE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(migration);
const requiredFeature189Tables = [
  "tenant_identity_events",
  "tenant_identity_actions",
  "tenant_data_transfer_previews",
  "tenant_data_transfer_preview_items",
  "tenant_data_transfer_plans",
  "tenant_data_transfer_items",
  "tenant_data_transfer_actions",
];
const missingFeature189MigrationTables = requiredFeature189Tables.filter(
  name => !feature189MigrationSource.includes(`\"${name}\"`),
);
const missingFeature189SchemaTables = requiredFeature189Tables.filter(
  name => !schemaSource.includes(`pgTable(\n  \"${name}\"`),
);
const missingFeature189SchemaFields = ["tenantIdentityMigrationReason", "tenantIdentityMigratedAt", "createdByUserId"]
  .filter(field => !schemaSource.includes(field));
const forbiddenFeature189Migration = /\b(DROP\s+(TABLE|TYPE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(feature189MigrationSource);
const missingFeature189BackfillMigration = feature189BackfillMigrationSource.includes("registered_domain_backfill")
  ? []
  : [expectedFeature189BackfillMigrationFile];
const forbiddenFeature189BackfillMigration = /\b(DROP\s+(TABLE|TYPE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(feature189BackfillMigrationSource);
const artifacts = [
  "specs/feature/186-unified-job-control-plane-adapters/rollout-manifest.yaml",
  "specs/feature/186-unified-job-control-plane-adapters/runbook.md",
  "apps/web/scripts/backfill-unified-job-control-plane.ts",
  "ops/feature-188/cloudflare-adapter-contract.yaml",
  "apps/web/server/services/cloudflareJobAdapters.ts",
  "apps/web/server/services/__tests__/cloudflareJobAdapters.test.ts",
  "apps/web/scripts/verify-cloudflare-local-readiness.ts",
].filter(path => !existsSync(join(root, path)));

// The rollout manifest is intentionally YAML rather than executable config.
// Keep this verifier dependency-free, but still reject a manifest that silently
// omits a supported execution class or its required numeric operating budgets.
const requiredExecutionClasses = ["short", "long", "external", "cpu", "gpu", "scheduled"] as const;
function manifestSection(start: string, end: string): string {
  const startIndex = rolloutManifest.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = rolloutManifest.indexOf(end, startIndex + start.length);
  return rolloutManifest.slice(startIndex, endIndex < 0 ? rolloutManifest.length : endIndex);
}
const admissionBudgetSection = manifestSection("admission_budgets:", "event_rate_budgets:");
const eventRateBudgetSection = manifestSection("event_rate_budgets:", "runtime_budgets:");
const runtimeBudgetSection = manifestSection("  per_class:", "evidence_links:");
const missingAdmissionBudgetClasses = requiredExecutionClasses
  .filter(executionClass => !new RegExp(`^  ${executionClass}:`, "m").test(admissionBudgetSection));
const missingEventRateBudgetClasses = requiredExecutionClasses
  .filter(executionClass => !new RegExp(`^  ${executionClass}:`, "m").test(eventRateBudgetSection));
const admissionBudgetFields = [
  "max_payload_bytes",
  "max_result_bytes",
  "max_concurrent_per_tenant",
  "max_concurrent_global",
  "reconciler_items_per_tick",
] as const;
const eventRateBudgetFields = [
  "max_lifecycle_events_per_job",
  "max_progress_events_per_minute",
] as const;
function manifestClassBlock(section: string, executionClass: string, indent: number): string {
  const lines = section.split("\n");
  const prefix = " ".repeat(indent);
  const start = lines.findIndex(line => line === `${prefix}${executionClass}:`);
  if (start < 0) return "";
  const nextClass = new RegExp(`^${prefix}[A-Za-z0-9_-]+:$`);
  const end = lines.findIndex((line, index) => index > start && nextClass.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}
const missingAdmissionBudgetFields = requiredExecutionClasses.flatMap(executionClass => {
  const block = manifestClassBlock(admissionBudgetSection, executionClass, 2);
  return admissionBudgetFields
    .filter(field => !new RegExp(`^    ${field}:\\s+\\d+\\s*$`, "m").test(block))
    .map(field => `${executionClass}.${field}`);
});
const missingEventRateBudgetFields = requiredExecutionClasses.flatMap(executionClass => {
  const line = eventRateBudgetSection.split("\n").find(item => item.startsWith(`  ${executionClass}:`)) ?? "";
  return eventRateBudgetFields
    .filter(field => !new RegExp(`(?:^|\\s)${field}:\\s*\\d+(?:\\s|,|$)`).test(line))
    .map(field => `${executionClass}.${field}`);
});
const runtimeBudgetFields = [
  "heartbeat_interval_seconds",
  "lease_duration_seconds",
  "provider_deadline_seconds",
  "outbox_age_slo_seconds",
  "publisher_items_per_tick",
] as const;
function runtimeClassBlock(executionClass: string): string {
  return manifestClassBlock(runtimeBudgetSection, executionClass, 4);
}
const missingRuntimeBudgetFields = requiredExecutionClasses.flatMap(executionClass => {
  const block = runtimeClassBlock(executionClass);
  return runtimeBudgetFields
    .filter(field => !new RegExp(`^      ${field}:\\s+\\d+\\s*$`, "m").test(block))
    .map(field => `${executionClass}.${field}`);
});
const audit = buildFeature186CallSiteAudit();
const cloudflareProductionProof = false;
const cloudflareLocalContract = getCloudflareLocalContractReadiness();
function manifestCount(key: string): number | null {
  const match = rolloutManifest.match(new RegExp(`^  ${key}: (\\d+)$`, "m"));
  return match ? Number(match[1]) : null;
}
const inventoryChecks = [
  ["direct_transport_call_sites", manifestCount("direct_transport_call_sites"), audit.directTransportCallSites],
  ["approved_compatibility_call_sites", manifestCount("approved_compatibility_call_sites"), audit.approvedCompatibilityCallSites],
  ["adapter_owned_call_sites", manifestCount("adapter_owned_call_sites"), audit.adapterOwnedCallSites],
  ["legacy_adapter_transport_call_sites", manifestCount("legacy_adapter_transport_call_sites"), audit.legacyAdapterTransportCallSites],
  ["unmigrated_side_effecting_call_sites", manifestCount("unmigrated_side_effecting_call_sites"), audit.unmigratedSideEffectingCallSites],
  ["status_reader_call_sites", manifestCount("status_reader_call_sites"), audit.statusReaderCallSites],
  ["compatibility_status_reader_call_sites", manifestCount("compatibility_status_reader_call_sites"), audit.compatibilityStatusReaderCallSites],
] as const;
const inventoryMismatches = inventoryChecks
  .filter(([, expected, actual]) => expected === null || expected !== actual)
  .map(([key, expected, actual]) => ({ key, expected, actual }));
function manifestPath(file: string): string {
  return file.startsWith("server/") ? `apps/web/${file}` : file;
}
const missingManifestFindings = audit.findings
  .filter(item => !rolloutManifest.includes(`"${manifestPath(item.file)}:${item.line}"`))
  .map(item => `${item.file}:${item.line}`);
const missingManifestStatusReaders = audit.statusReaders
  .filter(item => !rolloutManifest.includes(`"${manifestPath(item.file)}:${item.line}"`))
  .map(item => `${item.file}:${item.line}`);

function manifestValue(key: string): string | null {
  const match = rolloutManifest.match(new RegExp(`^  ${key}: ([^\\n]+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

const productionEvidence = {
  legacyTransportRetired: manifestValue("legacy_transport_retired") === "true",
  legacyStatusCompatibilityRetired: manifestValue("legacy_status_compatibility_retired") === "true",
  domainProjectionCheckpointRecovery: manifestValue("domain_projection_checkpoint_recovery") === "true",
  providerRecoveryIntegration: manifestValue("provider_recovery_integration") === "true",
  deploymentRecovery: manifestValue("deployment_recovery") === "true",
  pitrRestoreRehearsal: manifestValue("pitr_restore_rehearsal") === "true",
};
const legacyStatusCompatibilityAdapterPresent = existsSync(join(root, "python-backend/app/services/legacy_task_status.py"));

if (missing.length || missingContractFields.length || missingContractVersion.length || missingTimeoutPolicy.length || missingOutboxCancellation.length || missingReviewProjection.length || missingEvidenceTables.length || missingEvidenceConstraints.length || missingPythonRuntime.length || missingNodeRuntime.length || missingAdmissionIndexes.length || missingCallbackTimestamp.length || missingSafetyFields.length || missingSafetyCallbackGuard.length || missingScheduleMigration.length || missingJournalEntries.length || missingProviderTables.length || missingProviderConstraints.length || missingProviderAttemptContract.length || forbidden || artifacts.length || inventoryMismatches.length || missingManifestFindings.length || missingManifestStatusReaders.length || missingAdmissionBudgetClasses.length || missingAdmissionBudgetFields.length || missingEventRateBudgetClasses.length || missingEventRateBudgetFields.length || missingRuntimeBudgetFields.length || missingFeature189MigrationTables.length || missingFeature189SchemaTables.length || missingFeature189SchemaFields.length || forbiddenFeature189Migration || missingFeature189BackfillMigration.length || forbiddenFeature189BackfillMigration || missingFeature188FollowupMigrations.length || missingFeature189SessionRevocationMigration.length || crossFeatureStructuralFindings.length) {
  console.error(JSON.stringify({ ok: false, missing, missingContractFields, missingContractVersion, missingTimeoutPolicy, missingOutboxCancellation, missingReviewProjection, missingEvidenceTables, missingEvidenceConstraints, missingPythonRuntime, missingNodeRuntime, missingAdmissionIndexes, missingCallbackTimestamp, missingSafetyFields, missingSafetyCallbackGuard, missingScheduleMigration, missingJournalEntries, missingProviderTables, missingProviderConstraints, missingProviderAttemptContract, forbiddenMigrationOperation: forbidden || forbiddenFeature189Migration || forbiddenFeature189BackfillMigration, missingFeature189MigrationTables, missingFeature189SchemaTables, missingFeature189SchemaFields, missingFeature189BackfillMigration, missingFeature188FollowupMigrations, missingFeature189SessionRevocationMigration, missingArtifacts: artifacts, inventoryMismatches, missingManifestFindings, missingManifestStatusReaders, missingAdmissionBudgetClasses, missingAdmissionBudgetFields, missingEventRateBudgetClasses, missingEventRateBudgetFields, missingRuntimeBudgetFields, crossFeatureStructuralFindings }));
  process.exit(1);
}
const productionBlockers = [
  ...(audit.directTransportCallSites > 0 ? [`direct_transport_call_sites:${audit.directTransportCallSites}`] : []),
  ...(audit.unmigratedSideEffectingCallSites > 0 ? [`unmigrated_side_effecting_call_sites:${audit.unmigratedSideEffectingCallSites}`] : []),
  ...(audit.statusReaderCallSites > 0 ? [`legacy_status_reader_call_sites:${audit.statusReaderCallSites}`] : []),
  ...(audit.legacyAdapterTransportCallSites > 0 ? [`legacy_transport_adapter_calls_remaining:${audit.legacyAdapterTransportCallSites}`] : []),
  ...(!productionEvidence.legacyTransportRetired ? ["legacy_transport_retirement_not_proven"] : []),
  ...(legacyStatusCompatibilityAdapterPresent ? ["rollback_legacy_status_adapter_present"] : []),
  ...(!productionEvidence.legacyStatusCompatibilityRetired ? ["legacy_status_compatibility_retirement_not_proven"] : []),
  ...(!productionEvidence.domainProjectionCheckpointRecovery ? ["domain_projection_checkpoint_recovery_not_proven"] : []),
  ...(!productionEvidence.providerRecoveryIntegration ? ["provider_recovery_integration_not_proven"] : []),
  ...(!productionEvidence.deploymentRecovery ? ["deployment_recovery_evidence_missing"] : []),
  ...(!productionEvidence.pitrRestoreRehearsal ? ["pitr_restore_rehearsal_missing"] : []),
  ...(rolloutManifest.includes("tenant_data_transfer_boundary:\n  status: not_enabled") ? ["tenant_transfer_boundary_not_enabled"] : []),
  ...(crossFeatureReadiness.feature187.status?.startsWith("PROPOSED") ? ["feature_187_cutover_candidate_not_accepted"] : []),
  ...(crossFeatureReadiness.feature188.status?.startsWith("PROPOSED") ? ["feature_188_activation_not_accepted"] : []),
  ...(crossFeatureReadiness.feature189.status?.startsWith("PROPOSED") || !crossFeatureReadiness.feature189.runtimeImplementationPresent
    ? ["feature_189_identity_transfer_not_implemented"]
    : []),
  ...(!cloudflareLocalContract.localContractReady ? ["cloudflare_local_adapter_contract_missing"] : []),
  ...(!cloudflareProductionProof ? ["cloudflare_production_recovery_proof_missing"] : []),
];
console.log(JSON.stringify({
  ok: true,
  productionReady: productionBlockers.length === 0,
  productionBlockers,
  migration: "additive",
  cloudflareProductionProof,
  cloudflareLocalContract,
  productionEvidence,
  crossFeatureReadiness,
  crossFeatureStructuralFindings,
  callSiteAudit: {
    directTransportCallSites: audit.directTransportCallSites,
    approvedCompatibilityCallSites: audit.approvedCompatibilityCallSites,
    legacyAdapterTransportCallSites: audit.legacyAdapterTransportCallSites,
    unmigratedSideEffectingCallSites: audit.unmigratedSideEffectingCallSites,
    statusReaderCallSites: audit.statusReaderCallSites,
    compatibilityStatusReaderCallSites: audit.compatibilityStatusReaderCallSites,
  },
}));
