import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");

const checks: Array<{ name: string; file: string; forbidden?: RegExp; required?: RegExp; reason: string }> = [
  {
    name: "web package has no Google Cloud Tasks SDK",
    file: "apps/web/package.json",
    forbidden: /@google-cloud\/tasks/,
    reason: "The production publisher must use the Cloudflare boundary.",
  },
  {
    name: "unified runtime has no legacy broker imports",
    file: "apps/web/server/jobs/unifiedJobControlPlaneRuntime.ts",
    forbidden: /(?:@google-cloud\/tasks|from ['\"]bullmq|from ['\"]celery|require\(['\"](?:bullmq|celery))/i,
    reason: "Google Cloud, BullMQ and Celery are not selectable production runtimes.",
  },
  {
    name: "active scheduler has no Google transport import",
    file: "apps/web/server/services/scheduler.ts",
    forbidden: /(?:cloudTasks|enqueueTask|deleteTask|Cloud Tasks|Cloud Scheduler)/i,
    reason: "Scheduling must use the Cloudflare Cron/Queue boundary.",
  },
  {
    name: "active media dispatch has no retired task endpoint",
    file: "apps/web/server/routers/mediaJobs.ts",
    forbidden: /(?:cloudTasks|Cloud Tasks|\/api\/v1\/media\/tasks\/process-video|\/_internal\/tasks\/process-video)/i,
    reason: "Media rendering must create a canonical Cloudflare-targeted job.",
  },
  {
    name: "active marketplace render has no retired task publisher",
    file: "apps/web/server/services/marketplaceAutoReviewService.ts",
    forbidden: /(?:cloudTasks|Cloud Tasks|\/api\/v1\/media\/tasks\/process-video|\/_internal\/tasks\/process-video)/i,
    reason: "Marketplace rendering must create a canonical Cloudflare-targeted job.",
  },
  {
    name: "legacy task router is not mounted",
    file: "apps/web/server/_core/index.ts",
    forbidden: /app\.use\(["']\/_internal\/tasks["']\s*,\s*createTasksRouter/,
    reason: "The former HTTP task ingress must remain retired.",
  },
  {
    name: "Python legacy task router is not mounted",
    file: "python-backend/app/main.py",
    forbidden: /include_router\(\s*task_handlers\.router/,
    reason: "Cloud Tasks HTTP handlers must not be reachable in production.",
  },
  {
    name: "Python Celery admin controls are guarded after cutover",
    file: "python-backend/app/api/virtual_admin.py",
    required: /FEATURE_186_HARD_CUTOVER/,
    reason: "Celery health/restart/revoke controls must not remain an active production control plane.",
  },
  {
    name: "Python Beat inspection is guarded after cutover",
    file: "python-backend/app/api/scheduled_jobs.py",
    required: /FEATURE_186_HARD_CUTOVER/,
    reason: "Celery Beat must not remain the production scheduler after Cloudflare cutover.",
  },
  {
    name: "scale tier service has no Google deployment executor",
    file: "apps/web/server/services/scaleTier.ts",
    forbidden: /(?:@google-cloud\/tasks|google\.cloud\.run|gcloud|Cloud Run|cloudrun|cloudRun|GCP_PROJECT_ID|GCP_REGION)/i,
    reason: "Scale-tier changes must be recorded for the Cloudflare deployment pipeline, not applied with gcloud.",
  },
  {
    name: "Cloudflare publish boundary exists",
    file: "apps/cloudflare/src/index.ts",
    forbidden: /\/internal\/jobs\/publish/,
    reason: "The Cloudflare Worker must expose the canonical publish boundary.",
  },
  {
    name: "production GCP deployment workflow is retired",
    file: ".github/workflows/deploy-production.yml",
    required: /if:\s*\$\{\{\s*false\s*\}\}/,
    reason: "The historical production workflow must not deploy Google Cloud.",
  },
  {
    name: "staging GCP deployment workflow is retired",
    file: ".github/workflows/deploy-staging.yml",
    required: /if:\s*\$\{\{\s*false\s*\}\}/,
    reason: "The historical staging workflow must not deploy Google Cloud.",
  },
  {
    name: "PR preview GCP workflow is retired",
    file: ".github/workflows/pr-preview.yml",
    required: /if:\s*\$\{\{\s*false\s*\}\}/,
    reason: "PR previews must not provision Cloud Run resources.",
  },
  {
    name: "PR preview cleanup GCP workflow is retired",
    file: ".github/workflows/pr-preview-cleanup.yml",
    required: /if:\s*\$\{\{\s*false\s*\}\}/,
    reason: "PR preview cleanup must not mutate Google Cloud resources.",
  },
  {
    name: "staging assurance GCP workflow is retired",
    file: ".github/workflows/staging-assurance-rollout-evidence.yml",
    required: /if:\s*\$\{\{\s*false\s*\}\}/,
    reason: "Staging assurance must use the Cloudflare target-account rehearsal.",
  },
  {
    name: "Google OAuth product boundary remains available",
    file: "apps/web/server/services/accountAuthService.ts",
    required: /GOOGLE_CLIENT_ID/,
    reason: "Google OAuth is a retained product integration and must not be removed by runtime cutover.",
  },
  {
    name: "Google Drive product boundary remains available",
    file: "python-backend/app/mcp/google_drive_mcp.py",
    required: /GOOGLE_DRIVE_TOOLS/,
    reason: "Google Drive remains a retained product integration and must not be removed by runtime cutover.",
  },
];

const failures: string[] = [];
for (const check of checks) {
  const absolutePath = resolve(repoRoot, check.file);
  if (!existsSync(absolutePath)) {
    failures.push(`${check.name}: missing ${check.file}`);
    continue;
  }
  const source = readFileSync(absolutePath, "utf8");
  const matched = check.required
    ? !check.required.test(source)
    : check.name === "Cloudflare publish boundary exists"
      ? !check.forbidden!.test(source)
      : check.forbidden!.test(source);
  if (matched) failures.push(`${check.name}: ${check.reason}`);
}

if (failures.length > 0) {
  console.error("Cloudflare runtime target verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Cloudflare runtime target verification passed: legacy Google runtime publishers/routes are retired.");
}
