import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const files: string[] = [];
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".next"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|py)$/.test(name)) files.push(path);
  }
}
walk(join(root, "server"));
walk(join(root, "..", "..", "python-backend", "app"));
const bullMqCall = /\b(?:[A-Za-z_$][\w$]*Queue|queue|dlq)\.(?:add|addBulk|upsertJobScheduler)\s*\(/;
const celeryCall = /\b[A-Za-z_$][\w$]*\.(?:delay|apply_async)\s*\(|\bsend_task\s*\(/;
const allowed = new Set([
  "server/services/jobTransportAdapters.ts",
  "server/services/jobOutboxPublisher.ts",
  "server/services/jobLegacyTransportAdapters.ts",
  "python-backend/app/services/job_control_plane.py",
  "python-backend/app/api/internal_job_control_plane.py",
]);
const legacyStatusReaderBoundary = new Set([
  "python-backend/app/services/legacy_task_status.py",
]);
const approvedCompatibilityFiles = new Set([
  "server/jobs/capacityAssessmentJob.ts",
  "server/jobs/databaseBackupJob.ts",
  "server/services/deliveryQueue.ts",
  "server/services/webhookDeliveryService.ts",
  "server/services/embeddingQueue.ts",
  "server/services/jobAutomationService.ts",
]);
function displayName(path: string): string {
  if (path.startsWith(join(root, "server"))) return relative(root, path).replaceAll("\\", "/");
  return `python-backend/${relative(join(root, "..", "..", "python-backend"), path).replaceAll("\\", "/")}`;
}

export type Feature186CallSiteAudit = {
  feature: 186;
  mode: "inventory";
  hardCutoverFlag: boolean;
  activeSideEffectingAdapter: string;
  directTransportCallSites: number;
  directTransportCallSitesByTransport: { bullmq: number; celery: number };
  adapterOwnedCallSites: number;
  approvedCompatibilityCallSites: number;
  unmigratedSideEffectingCallSites: number;
  legacyAdapterTransportCallSites: number;
  migratedWave: string[];
  compatibilityAllowlist: string[];
  statusReaderCallSites: number;
  statusReaders: Array<{ file: string; line: number; text: string }>;
  compatibilityStatusReaderCallSites: number;
  compatibilityStatusReaders: Array<{ file: string; line: number; text: string }>;
  findings: Finding[];
};

export function buildFeature186CallSiteAudit(): Feature186CallSiteAudit {
  const findings: Finding[] = files.flatMap(path => {
    const name = displayName(path);
    const source = readFileSync(path, "utf8");
    const isBullMqModule = /(?:from|require\s*\(|import\s*\()\s*["']bullmq["']/.test(source);
    const isCeleryModule = path.endsWith(".py") && /(?:from\s+celery|import\s+celery|\.delay\s*\(|\.apply_async\s*\(|send_task\s*\()/.test(source);
    if (allowed.has(name)) return [];
    return source.split("\n").flatMap((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("#")) return [];
      const matches: Finding[] = [];
      if (isBullMqModule && bullMqCall.test(line)) matches.push({ file: name, line: index + 1, text: trimmed.slice(0, 180), transport: "bullmq" });
      if (isCeleryModule && celeryCall.test(line)) matches.push({ file: name, line: index + 1, text: trimmed.slice(0, 180), transport: "celery" });
      return matches;
    });
  });
  const migratedWave = (process.env.FEATURE_186_MIGRATED_WAVE ?? "webhook.dispatch,webhook.api_delivery,embedding.generate,capacity.assessment,channel.delivery,automation.execute,database.backup,database.backup.maintenance,notification.escalation,notification.digest,notification.retention,notification.webhook_delivery,memory.archive_cleanup,memory.chunk_cleanup,memory.embedding_reconciliation,memory.eviction,python.media,storyboard.skill.run,vertical_drama.character_prompt,vertical_drama.draft_composition,vertical_drama.draft_quality_qc,vertical_drama.episode_stage,vertical_drama.interactive,vertical_drama.shot_prompt,vertical_drama.shot_video_prompt,vertical_drama.story,video.intelligence")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const compatibilityFindings = findings.filter(item => approvedCompatibilityFiles.has(item.file));
  const unmigratedFindings = findings.filter(item => !approvedCompatibilityFiles.has(item.file));
  const legacyAdapterTransportCallSites = files.flatMap(path => {
    const name = displayName(path);
    if (name !== "server/services/jobLegacyTransportAdapters.ts") return [];
    return readFileSync(path, "utf8").split("\n").flatMap((line, index) =>
      /\.(?:add|addBulk|upsertJobScheduler)\s*\(/.test(line)
        ? [{ file: name, line: index + 1, text: line.trim().slice(0, 180) }]
        : [],
    );
  });
  const statusReaders = files.flatMap(path => {
    const name = displayName(path);
    if (legacyStatusReaderBoundary.has(name)) return [];
    const source = readFileSync(path, "utf8");
    if (!/from celery\.result import AsyncResult|AsyncResult\(/.test(source)) return [];
    return source.split("\n").flatMap((line, index) => /from celery\.result import AsyncResult|AsyncResult\(/.test(line)
      ? [{ file: name, line: index + 1, text: line.trim().slice(0, 180) }]
      : []);
  });
  const compatibilityStatusReaders = files.flatMap(path => {
    const name = displayName(path);
    if (name === "python-backend/app/services/legacy_task_status.py") return [];
    return readFileSync(path, "utf8").split("\n").flatMap((line, index) =>
      /\bread_legacy_task_status\s*\(/.test(line)
        ? [{ file: name, line: index + 1, text: line.trim().slice(0, 180) }]
        : [],
    );
  });
  const adapterOwnedCallSites = files.flatMap(path => {
    const name = displayName(path);
    if (allowed.has(name)) return [];
    return readFileSync(path, "utf8").split("\n").flatMap((line, index) =>
      line.includes("dispatch_python_task(")
        ? [{ file: name, line: index + 1, text: line.trim().slice(0, 180) }]
        : [],
    );
  });
  return {
    feature: 186,
    mode: "inventory",
    hardCutoverFlag: process.env.FEATURE_186_HARD_CUTOVER === "true",
    activeSideEffectingAdapter: process.env.FEATURE_186_HARD_CUTOVER === "true"
      ? "cloudflare-queues-via-postgres-outbox"
      : "legacy",
    directTransportCallSites: findings.length,
    directTransportCallSitesByTransport: {
      bullmq: findings.filter(item => item.transport === "bullmq").length,
      celery: findings.filter(item => item.transport === "celery").length,
    },
    adapterOwnedCallSites: adapterOwnedCallSites.length,
    approvedCompatibilityCallSites: compatibilityFindings.length,
    unmigratedSideEffectingCallSites: unmigratedFindings.length,
    legacyAdapterTransportCallSites: legacyAdapterTransportCallSites.length,
    migratedWave,
    compatibilityAllowlist: [...approvedCompatibilityFiles],
    statusReaderCallSites: statusReaders.length,
    statusReaders,
    compatibilityStatusReaderCallSites: compatibilityStatusReaders.length,
    compatibilityStatusReaders,
    findings,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(buildFeature186CallSiteAudit(), null, 2));
}
