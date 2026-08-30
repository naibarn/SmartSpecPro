import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  capacityAssessments,
  type CapacityAssessment,
} from "../../drizzle/schema";
import * as monitoringService from "./monitoringService";
import { getQueueHealthStatus } from "./queueHealthMonitor";
import { collectServiceRuntimeSnapshot } from "../routers/services";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { SYSTEM_USER_ID } from "./virtualAdmin/systemUser";
import * as workerFleetService from "./workerFleetService";
import {
  capacityPolicy,
  CAPACITY_THRESHOLDS,
  classifyCapacityMetric,
  decisionForCapacityStatus,
  worstCapacityStatus,
  type CapacityDecision,
  type CapacityStatus,
} from "./capacityPolicy";

const execFileAsync = promisify(execFile);
const CAPACITY_SKILL_SLUG = "infrastructure-capacity-advisor";
const SNAPSHOT_VERSION = "1.0";
const SENSITIVE_KEY =
  /(token|secret|password|credential|api[_-]?key|authorization|cookie)/i;

const legacyCapacityAssessmentColumns = {
  id: capacityAssessments.id,
  status: capacityAssessments.status,
  trigger: capacityAssessments.trigger,
  requestedByUserId: capacityAssessments.requestedByUserId,
  snapshot: capacityAssessments.snapshot,
  assessment: capacityAssessments.assessment,
  errorMessage: capacityAssessments.errorMessage,
  startedAt: capacityAssessments.startedAt,
  completedAt: capacityAssessments.completedAt,
  createdAt: capacityAssessments.createdAt,
};

function isCapacitySchemaCompatibilityError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message =
    typeof candidate?.message === "string" ? candidate.message : String(error);
  return (
    code === "42P01" ||
    code === "42703" ||
    /capacity_assessments|phase|policyVersion|deterministicAssessment|durationMs/i.test(
      message
    )
  );
}

async function selectCapacityAssessments(
  limit?: number
): Promise<CapacityAssessment[]> {
  const db = await getDb();
  try {
    const query = db
      .select()
      .from(capacityAssessments)
      .orderBy(desc(capacityAssessments.createdAt));
    return (await (limit == null
      ? query
      : query.limit(limit))) as CapacityAssessment[];
  } catch (error) {
    if (!isCapacitySchemaCompatibilityError(error)) throw error;

    // Keep the Admin page usable during a rolling deploy. The V2 columns are
    // additive, so old rows can still be displayed from the 0233 contract.
    try {
      const legacyQuery = db
        .select(legacyCapacityAssessmentColumns)
        .from(capacityAssessments)
        .orderBy(desc(capacityAssessments.createdAt));
      return (await (limit == null
        ? legacyQuery
        : legacyQuery.limit(limit))) as CapacityAssessment[];
    } catch (legacyError) {
      if (isCapacitySchemaCompatibilityError(legacyError)) return [];
      throw legacyError;
    }
  }
}

export async function getCapacityAdvisorReadiness(): Promise<{
  storageAvailable: boolean;
  migrationPending: boolean;
  message: string | null;
}> {
  const db = await getDb();
  try {
    await db
      .select({ id: capacityAssessments.id, phase: capacityAssessments.phase })
      .from(capacityAssessments)
      .limit(1);
    return { storageAvailable: true, migrationPending: false, message: null };
  } catch (error) {
    if (!isCapacitySchemaCompatibilityError(error)) throw error;
    try {
      await db
        .select(legacyCapacityAssessmentColumns)
        .from(capacityAssessments)
        .limit(1);
      return {
        storageAvailable: true,
        migrationPending: true,
        message:
          "ฐานข้อมูลยังอยู่ที่โครงสร้างเดิม ต้อง apply migration 0237 ก่อนเริ่มรอบประเมินใหม่",
      };
    } catch (legacyError) {
      if (!isCapacitySchemaCompatibilityError(legacyError)) throw legacyError;
      return {
        storageAvailable: false,
        migrationPending: true,
        message:
          "ยังไม่พบตาราง capacity_assessments ต้อง apply migration 0233 และ 0237",
      };
    }
  }
}

const assessmentSchema = z
  .object({
    decision: z.enum([
      "continue_observe",
      "optimize_home_server",
      "upgrade_home_server",
      "migrate_to_cloud",
      "insufficient_data",
    ]),
    severity: z.enum([
      "healthy",
      "watch",
      "action",
      "critical",
      "insufficient_data",
    ]),
    confidence: z.number().min(0).max(1),
    summary: z.string().max(2000),
    watchlist: z
      .array(
        z
          .object({
            area: z.string().max(120),
            metric: z.string().max(120),
            severity: z.enum([
              "healthy",
              "watch",
              "action",
              "critical",
              "insufficient_data",
            ]),
            current: z.number().nullable(),
            threshold: z.number().nullable(),
            unit: z.string().max(40),
            trend: z.enum(["rising", "stable", "falling", "unknown"]),
            horizon: z.enum(["now", "24h", "3d", "7d", "unknown"]),
            evidence: z.string().max(500),
            action: z.string().max(500),
          })
          .strict()
      )
      .max(20),
    riskPoints: z
      .array(
        z
          .object({
            area: z.string().max(120),
            severity: z.enum([
              "healthy",
              "watch",
              "action",
              "critical",
              "insufficient_data",
            ]),
            evidence: z.string().max(500),
            action: z.string().max(500),
          })
          .strict()
      )
      .max(20),
    recommendations: z
      .array(
        z
          .object({
            priority: z.enum(["now", "next", "later"]),
            category: z.enum(["observe", "optimize", "upgrade", "migrate"]),
            title: z.string().max(160),
            reason: z.string().max(500),
            actions: z.array(z.string().max(300)).max(8),
          })
          .strict()
      )
      .max(12),
    missingData: z.array(z.string().max(250)).max(20),
  })
  .strict();

export type CapacityAssessmentResult = z.infer<typeof assessmentSchema>;

type DiskUsage = {
  target: string;
  totalGb: number | null;
  usedGb: number | null;
  availableGb: number | null;
  usedPercent: number | null;
  available: boolean;
};

type DirectoryUsage = {
  label: string;
  bytes: number;
  files: number;
  complete: boolean;
};

function sanitizeForLlm(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value;
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.slice(0, 100).map(item => sanitizeForLlm(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 100)
      .map(([key, child]) => [key, sanitizeForLlm(child, depth + 1)])
  );
}

async function readDiskUsage(target: string): Promise<DiskUsage> {
  try {
    const { stdout } = await execFileAsync("df", ["-Pk", target], {
      timeout: 5000,
    });
    const line = stdout.trim().split("\n").pop()?.trim() ?? "";
    const parts = line.split(/\s+/);
    const totalKb = Number.parseInt(parts[1] ?? "", 10);
    const usedKb = Number.parseInt(parts[2] ?? "", 10);
    const availableKb = Number.parseInt(parts[3] ?? "", 10);
    const usedPercent = Number.parseInt((parts[4] ?? "").replace("%", ""), 10);
    if (![totalKb, usedKb, availableKb, usedPercent].every(Number.isFinite)) {
      throw new Error("invalid df output");
    }
    return {
      target,
      totalGb: totalKb / 1024 / 1024,
      usedGb: usedKb / 1024 / 1024,
      availableGb: availableKb / 1024 / 1024,
      usedPercent,
      available: true,
    };
  } catch {
    return {
      target,
      totalGb: null,
      usedGb: null,
      availableGb: null,
      usedPercent: null,
      available: false,
    };
  }
}

async function scanDirectory(
  label: string,
  root: string
): Promise<DirectoryUsage> {
  const maxFiles = 10_000;
  let bytes = 0;
  let files = 0;
  let complete = true;
  const pending = [root];

  try {
    await fs.access(root);
  } catch {
    return { label, bytes: 0, files: 0, complete: true };
  }

  while (pending.length > 0 && files < maxFiles) {
    const current = pending.pop();
    if (!current) continue;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      complete = false;
      continue;
    }
    for (const entry of entries) {
      if (files >= maxFiles) {
        complete = false;
        break;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fs.stat(entryPath);
        bytes += stat.size;
        files += 1;
      } catch {
        complete = false;
      }
    }
  }
  if (pending.length > 0 || files >= maxFiles) complete = false;
  return { label, bytes, files, complete };
}

function summarizeMetrics(
  metrics: Array<{
    memoryPercent: number;
    cpuPercent: number | null;
    diskUsedGb: number | null;
    diskTotalGb: number | null;
  }>
): Record<string, number | null> {
  const values = (
    selector: (metric: (typeof metrics)[number]) => number | null
  ) =>
    metrics
      .map(selector)
      .filter(
        (value): value is number => value != null && Number.isFinite(value)
      );
  const average = (items: number[]) =>
    items.length
      ? items.reduce((sum, item) => sum + item, 0) / items.length
      : null;
  const cpu = values(metric => metric.cpuPercent);
  const memory = values(metric => metric.memoryPercent);
  const disk = values(metric =>
    metric.diskTotalGb && metric.diskUsedGb
      ? (metric.diskUsedGb / metric.diskTotalGb) * 100
      : null
  );
  return {
    sampleCount: metrics.length,
    averageCpuPercent: average(cpu),
    peakCpuPercent: cpu.length ? Math.max(...cpu) : null,
    averageMemoryPercent: average(memory),
    peakMemoryPercent: memory.length ? Math.max(...memory) : null,
    averageDiskUsedPercent: average(disk),
    peakDiskUsedPercent: disk.length ? Math.max(...disk) : null,
  };
}

function buildDeterministicAssessment(input: {
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskUsedPercent: number | null;
  queueLength: number | null;
  oldestQueuedAgeMs: number | null;
  activeJobCount: number | null;
  availableGroups: number;
  expectedGroups: number;
  forecastImminent?: boolean;
  forecasts?: Record<string, unknown>;
}) {
  const areas: Array<{
    area: string;
    metric: string;
    value: number | null;
    unit: string;
    status: CapacityStatus;
    threshold: number | null;
  }> = [
    {
      area: "CPU",
      metric: "cpuPercent",
      value: input.cpuPercent,
      unit: "%",
      status: classifyCapacityMetric(
        input.cpuPercent,
        CAPACITY_THRESHOLDS.cpuPercent
      ),
      threshold: CAPACITY_THRESHOLDS.cpuPercent.watch,
    },
    {
      area: "RAM",
      metric: "memoryPercent",
      value: input.memoryPercent,
      unit: "%",
      status: classifyCapacityMetric(
        input.memoryPercent,
        CAPACITY_THRESHOLDS.memoryPercent
      ),
      threshold: CAPACITY_THRESHOLDS.memoryPercent.watch,
    },
    {
      area: "Disk",
      metric: "diskUsedPercent",
      value: input.diskUsedPercent,
      unit: "%",
      status: classifyCapacityMetric(
        input.diskUsedPercent,
        CAPACITY_THRESHOLDS.diskUsedPercent
      ),
      threshold: CAPACITY_THRESHOLDS.diskUsedPercent.watch,
    },
    {
      area: "Queue",
      metric: "queueLength",
      value: input.queueLength,
      unit: "งาน",
      status: classifyCapacityMetric(
        input.queueLength,
        CAPACITY_THRESHOLDS.queueLength
      ),
      threshold: CAPACITY_THRESHOLDS.queueLength.watch,
    },
    {
      area: "งานที่กำลังทำ",
      metric: "activeJobCount",
      value: input.activeJobCount,
      unit: "งาน",
      status: classifyCapacityMetric(
        input.activeJobCount,
        CAPACITY_THRESHOLDS.activeJobCount
      ),
      threshold: CAPACITY_THRESHOLDS.activeJobCount.watch,
    },
    {
      area: "อายุงานในคิว",
      metric: "oldestQueuedAgeMs",
      value: input.oldestQueuedAgeMs,
      unit: "ms",
      status: classifyCapacityMetric(
        input.oldestQueuedAgeMs,
        CAPACITY_THRESHOLDS.oldestQueuedAgeMs
      ),
      threshold: CAPACITY_THRESHOLDS.oldestQueuedAgeMs.watch,
    },
  ];
  const status = worstCapacityStatus(areas.map(area => area.status));
  const coverageComplete = input.availableGroups >= input.expectedGroups;
  const multiAreaPressure =
    areas.filter(area => ["action", "critical"].includes(area.status)).length >=
    2;
  const decision: CapacityDecision = decisionForCapacityStatus(status, {
    coverageComplete,
    multiAreaPressure,
    forecastImminent: input.forecastImminent,
  });
  return {
    status,
    decision,
    coverage: {
      availableGroups: input.availableGroups,
      expectedGroups: input.expectedGroups,
      complete: coverageComplete,
    },
    areas: areas.map(area => ({
      area: area.area,
      metric: area.metric,
      current: area.value,
      threshold: area.threshold,
      unit: area.unit,
      status: area.status,
    })),
    forecasts: input.forecasts ?? {},
  };
}

function buildDiskForecast(
  metrics: Array<{
    diskUsedGb: number | null;
    diskTotalGb: number | null;
    createdAt: Date | string;
  }>,
  currentPercent: number | null
) {
  const samples = metrics
    .map(metric => ({
      percent:
        metric.diskTotalGb && metric.diskUsedGb != null
          ? (metric.diskUsedGb / metric.diskTotalGb) * 100
          : null,
      at: new Date(metric.createdAt).getTime(),
    }))
    .filter(
      (sample): sample is { percent: number; at: number } =>
        Number.isFinite(sample.percent) && Number.isFinite(sample.at)
    )
    .sort((left, right) => left.at - right.at);
  if (samples.length < capacityPolicy.forecast.minimumSamples) {
    return {
      available: false,
      reason: "not_enough_disk_history",
      sampleCount: samples.length,
      imminent: false,
    };
  }
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const days = Math.max((last.at - first.at) / 86_400_000, 1 / 24);
  const growthPerDay = (last.percent - first.percent) / days;
  const target = CAPACITY_THRESHOLDS.diskUsedPercent.critical;
  const daysToThreshold =
    growthPerDay > 0 && currentPercent != null
      ? Math.max(0, (target - currentPercent) / growthPerDay)
      : null;
  return {
    available: true,
    sampleCount: samples.length,
    windowHours: days * 24,
    currentPercent,
    targetPercent: target,
    growthPerDay,
    daysToThreshold,
    imminent: daysToThreshold != null && daysToThreshold <= 7,
  };
}

async function collectSnapshot(tenantId?: string | null) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [metrics, currentStatus, serviceRuntime, checks] = await Promise.all([
    monitoringService.getMetricsHistory(24),
    monitoringService.getCurrentStatus(),
    collectServiceRuntimeSnapshot(),
    monitoringService.getChecks({ page: 1, limit: 100, since }),
  ]);

  const tempTargets = Array.from(
    new Set(
      [
        os.tmpdir(),
        process.env.TMPDIR,
        path.join(process.cwd(), "tmp"),
        path.join(process.cwd(), "media_storage"),
        path.resolve(
          process.cwd(),
          "..",
          "..",
          "python-backend",
          "media_storage"
        ),
        "/app/media_storage",
        "/tmp",
      ].filter((value): value is string => Boolean(value))
    )
  );
  const [rootDisk, ...tempDisks] = await Promise.all([
    readDiskUsage("/"),
    ...tempTargets.map(target => readDiskUsage(target)),
  ]);
  const tempUsage = await Promise.all(
    tempTargets.map((target, index) =>
      scanDirectory(`temp_${index + 1}`, target)
    )
  );
  const queueHealth = getQueueHealthStatus();
  let workerQueueOverview: Awaited<
    ReturnType<typeof workerFleetService.getWorkerQueueOverview>
  > | null = null;
  let workerQueueError: string | null = null;
  try {
    workerQueueOverview = tenantId
      ? await workerFleetService.getWorkerQueueOverview(tenantId, { hours: 24 })
      : await workerFleetService.getGlobalWorkerQueueOverview({ hours: 24 });
  } catch (error) {
    workerQueueError =
      error instanceof Error
        ? error.message.slice(0, 200)
        : "worker_queue_unavailable";
  }
  const metricRows = (metrics.metrics ?? []).map(metric => ({
    memoryPercent: metric.memoryPercent,
    cpuPercent: metric.cpuPercent,
    diskUsedGb: metric.diskUsedGb,
    diskTotalGb: metric.diskTotalGb,
    createdAt: metric.createdAt,
  }));

  const latestMetric = metricRows[0] ?? null;
  const queueLength =
    workerQueueOverview?.queuedJobCount ??
    (queueHealth.queues.length
      ? queueHealth.queues.reduce(
          (sum, queue) => sum + Math.max(0, queue.length),
          0
        )
      : null);
  const activeJobCount = workerQueueOverview?.activeJobCount ?? null;
  const diskUsedPercent = rootDisk.usedPercent ?? null;
  const diskForecast = buildDiskForecast(metricRows, diskUsedPercent);
  const availableGroups = [
    latestMetric?.cpuPercent != null,
    latestMetric?.memoryPercent != null,
    diskUsedPercent != null,
    tempUsage.length > 0,
    queueLength != null,
    activeJobCount != null,
    workerQueueOverview?.oldestQueuedAgeMs != null,
  ].filter(Boolean).length;
  const deterministic = buildDeterministicAssessment({
    cpuPercent: latestMetric?.cpuPercent ?? null,
    memoryPercent: latestMetric?.memoryPercent ?? null,
    diskUsedPercent,
    queueLength,
    oldestQueuedAgeMs: workerQueueOverview?.oldestQueuedAgeMs ?? null,
    activeJobCount,
    availableGroups,
    expectedGroups: 7,
    forecastImminent: diskForecast.imminent === true,
    forecasts: {
      disk: diskForecast,
      temporaryFiles: {
        available: false,
        reason: "point_in_time_scan_only",
      },
    },
  });

  return {
    snapshotVersion: SNAPSHOT_VERSION,
    policyVersion: capacityPolicy.version,
    policy: capacityPolicy,
    capturedAt: new Date().toISOString(),
    observationWindowHours: 24,
    host: {
      platform: process.platform,
      cpuCount: os.cpus().length,
      loadAverage1m: os.loadavg()[0] ?? null,
      uptimeSeconds: os.uptime(),
      processMemoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      processHeapUsedMb: Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      ),
    },
    disk: { root: rootDisk, tempMounts: tempDisks },
    temporaryFiles: tempUsage,
    metrics: {
      latest: metricRows[0] ?? null,
      history: metricRows.slice(0, 500),
      summary: summarizeMetrics(metricRows),
    },
    services: serviceRuntime.services.map(service => ({
      name: service.name,
      displayName: service.displayName,
      status: service.status,
      cpu: service.cpu ?? null,
      memory: service.memory ?? null,
      restarts: service.restarts ?? null,
      uptime: service.uptime ?? null,
    })),
    dockerStorage: serviceRuntime.system.docker,
    queues: queueHealth,
    workerQueueOverview,
    workload: {
      available: Boolean(workerQueueOverview),
      source: workerQueueOverview ? "worker_fleet" : "unavailable",
      error: workerQueueError,
      capturedAt: workerQueueOverview?.generatedAt ?? null,
    },
    deterministic,
    recentMonitoringChecks: checks.checks.map(check => ({
      checkType: check.checkType,
      status: check.status,
      createdAt: check.createdAt,
      details: sanitizeForLlm(check.details),
    })),
    currentStatus: {
      lastCheckAt: currentStatus.lastCheck,
      alertCounts: currentStatus.alerts,
      serviceStatus: currentStatus.services,
    },
  } satisfies Record<string, unknown>;
}

function parseJsonObject(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

export function buildDeterministicAssessmentFallback(
  snapshot: Record<string, unknown>
): CapacityAssessmentResult {
  const deterministic = snapshot.deterministic as
    | {
        status?: CapacityStatus;
        decision?: CapacityDecision;
        coverage?: {
          availableGroups?: number;
          expectedGroups?: number;
          complete?: boolean;
        };
        areas?: Array<{
          area?: string;
          metric?: string;
          current?: number | null;
          threshold?: number | null;
          unit?: string;
          status?: CapacityStatus;
        }>;
      }
    | undefined;
  const status = deterministic?.status ?? "insufficient_data";
  const decision = deterministic?.decision ?? "insufficient_data";
  const areas = deterministic?.areas ?? [];
  const coverageComplete = deterministic?.coverage?.complete === true;
  const label = (value: number | null | undefined, unit: string) =>
    value == null ? "ไม่มีข้อมูล" : `${value}${unit}`;
  const horizonFor = (areaStatus: CapacityStatus) =>
    areaStatus === "critical" || areaStatus === "action"
      ? "now"
      : areaStatus === "watch"
        ? "24h"
        : "unknown";
  const actionFor = (areaStatus: CapacityStatus, areaName: string) => {
    if (areaStatus === "critical" || areaStatus === "action") {
      return `ตรวจสอบ ${areaName} ทันที และลดงานพร้อมกันก่อนพิจารณา upgrade`;
    }
    if (areaStatus === "watch") {
      return `ติดตาม ${areaName} ต่อเนื่องอย่างน้อย 24 ชั่วโมง`;
    }
    if (areaStatus === "insufficient_data") {
      return `เก็บข้อมูล ${areaName} ให้ครบก่อนใช้ตัดสินใจ`;
    }
    return `ติดตาม ${areaName} ตามรอบประเมินรายวัน`;
  };
  const watchlist = areas.map(area => {
    const areaName = area.area ?? area.metric ?? "ระบบ";
    const areaStatus = area.status ?? "insufficient_data";
    return {
      area: areaName,
      metric: area.metric ?? areaName,
      severity: areaStatus,
      current: area.current ?? null,
      threshold: area.threshold ?? null,
      unit: area.unit ?? "",
      trend: "unknown" as const,
      horizon: horizonFor(areaStatus) as "now" | "24h" | "unknown",
      evidence: `${areaName}: ค่าปัจจุบัน ${label(area.current, area.unit ?? "")} · threshold ${label(area.threshold, area.unit ?? "")}`,
      action: actionFor(areaStatus, areaName),
    };
  });
  const riskPoints = watchlist
    .filter(item => item.severity !== "healthy")
    .map(item => ({
      area: item.area,
      severity: item.severity,
      evidence: item.evidence,
      action: item.action,
    }));
  const category: "observe" | "optimize" | "upgrade" | "migrate" =
    decision === "migrate_to_cloud"
      ? "migrate"
      : decision === "upgrade_home_server"
        ? "upgrade"
        : decision === "optimize_home_server"
          ? "optimize"
          : "observe";
  const priority: "now" | "next" | "later" =
    status === "critical" || status === "action"
      ? "now"
      : status === "watch"
        ? "next"
        : "later";
  const missingData = watchlist
    .filter(item => item.severity === "insufficient_data")
    .map(item => `${item.area}: ไม่มีค่าจาก snapshot ล่าสุด`);
  if (!coverageComplete) {
    missingData.push(
      "ข้อมูลระบบยังไม่ครบทุกกลุ่ม จึงยังไม่ควรตัดสินใจย้ายขึ้น Cloud จากรอบนี้เพียงรอบเดียว"
    );
  }
  const summary =
    status === "healthy"
      ? "ตัวเลขระบบที่วัดได้ยังอยู่ในเกณฑ์ปกติ ควรเฝ้าดูต่อเนื่องตามรอบรายวัน"
      : status === "insufficient_data"
        ? "ข้อมูลยังไม่ครบ จึงยังสรุปเรื่อง upgrade หรือย้ายขึ้น Cloud ไม่ได้จากรอบนี้"
        : "พบตัวชี้วัดที่ควรเฝ้าระวังจากค่าปัจจุบันและ threshold ของระบบ ควรตรวจสอบตามลำดับความเร่งด่วน";
  return {
    decision,
    severity: status,
    confidence: coverageComplete ? 0.8 : 0.5,
    summary,
    watchlist,
    riskPoints,
    recommendations: [
      {
        priority,
        category,
        title:
          status === "healthy"
            ? "เฝ้าดูต่อและเก็บข้อมูลรายวัน"
            : "แก้ไขจุดที่ข้อมูลชี้ว่าต้องเฝ้าระวัง",
        reason: summary,
        actions: [
          "ตรวจสอบค่าปัจจุบันเทียบกับ threshold ในแท็บรายละเอียด",
          coverageComplete
            ? "เก็บผลประเมินต่อเนื่องอย่างน้อย 7 วันก่อนตัดสินใจลงทุน"
            : "เก็บข้อมูลที่ขาดให้ครบก่อนสรุปการ upgrade",
        ],
      },
    ],
    missingData,
  };
}

async function runLlmAssessment(
  snapshot: Record<string, unknown>,
  requestedByUserId: number
): Promise<CapacityAssessmentResult> {
  const skill = await getSkillByIdAsync(CAPACITY_SKILL_SLUG);
  if (!skill) throw new Error(`Skill not found: ${CAPACITY_SKILL_SLUG}`);
  const policy = await resolveSkillExecutionPolicy({ skill });
  const result = await executeSkillLlmWithFallback({
    skillSlug: CAPACITY_SKILL_SLUG,
    userId: requestedByUserId,
    executionPolicy: policy,
    maxModelAttempts: 3,
    maxTokens: 4000,
    temperature: 0,
    extraBodyParams: {
      response_format: { type: "json_object" },
    },
    messages: [
      {
        role: "system",
        content: skill.skillContent ?? "Return valid JSON only.",
      },
      {
        role: "user",
        content: `Assess this sanitized SmartSpecPro capacity snapshot. Return JSON only.\n\n${JSON.stringify(sanitizeForLlm(snapshot)).slice(0, 60_000)}`,
      },
    ],
  });
  if (!result.success || !result.content)
    throw new Error(result.error || "capacity_llm_failed");
  const parsed = assessmentSchema.safeParse(parseJsonObject(result.content));
  if (!parsed.success) {
    throw new Error("capacity_llm_schema_invalid");
  }
  return parsed.data;
}

function reconcileAssessment(
  assessment: CapacityAssessmentResult,
  snapshot: Record<string, unknown>
): CapacityAssessmentResult {
  const deterministic = (
    snapshot as {
      deterministic?: {
        status?: CapacityStatus;
        decision?: CapacityDecision;
        coverage?: { complete?: boolean };
        areas?: Array<{
          metric?: string;
          current?: number | null;
          threshold?: number | null;
          unit?: string;
          status?: CapacityStatus;
        }>;
      };
    }
  ).deterministic;
  if (!deterministic?.status) return assessment;
  const areas = deterministic.areas ?? [];
  return {
    ...assessment,
    severity: deterministic.status,
    decision: deterministic.decision ?? assessment.decision,
    confidence: deterministic.coverage?.complete
      ? assessment.confidence
      : Math.min(assessment.confidence, 0.5),
    watchlist: assessment.watchlist.map(item => {
      const match = areas.find(area => area.metric === item.metric);
      if (!match) return item;
      return {
        ...item,
        severity: match.status ?? "insufficient_data",
        current: match.current ?? null,
        threshold: match.threshold ?? null,
        unit: match.unit ?? item.unit,
      };
    }),
  };
}

export async function createCapacityAssessmentRun(input: {
  trigger: "manual" | "scheduled";
  requestedByUserId?: number | null;
  tenantId?: string | null;
}): Promise<CapacityAssessment> {
  const db = await getDb();
  const [activeRun] = await db
    .select()
    .from(capacityAssessments)
    .where(eq(capacityAssessments.status, "running"))
    .orderBy(desc(capacityAssessments.createdAt))
    .limit(1);
  if (activeRun && Date.now() - activeRun.createdAt.getTime() < 30 * 60_000) {
    return activeRun;
  }
  const [created] = await db
    .insert(capacityAssessments)
    .values({
      status: "running",
      phase: "requested",
      trigger: input.trigger,
      requestedByUserId: input.requestedByUserId ?? null,
      policyVersion: capacityPolicy.version,
      snapshot: {
        snapshotVersion: SNAPSHOT_VERSION,
        collectionStatus: "running",
        capturedAt: new Date().toISOString(),
      },
    })
    .returning();
  if (!created) throw new Error("capacity_run_create_failed");
  return created;
}

export async function runCapacityAssessment(input: {
  trigger: "manual" | "scheduled";
  requestedByUserId?: number | null;
  tenantId?: string | null;
  assessmentId?: number;
}): Promise<CapacityAssessment> {
  const db = await getDb();
  const created = input.assessmentId
    ? (
        await db
          .select()
          .from(capacityAssessments)
          .where(eq(capacityAssessments.id, input.assessmentId))
          .limit(1)
      )[0]
    : await createCapacityAssessmentRun(input);
  if (!created) throw new Error("capacity_run_not_found");
  if (created.phase !== "requested" && input.assessmentId) return created;

  let snapshot: Awaited<ReturnType<typeof collectSnapshot>> | null = null;
  try {
    snapshot = await collectSnapshot(input.tenantId);
    const [collected] = await db
      .update(capacityAssessments)
      .set({
        phase: "assessing",
        snapshot,
        deterministicAssessment: snapshot.deterministic,
        coverage: snapshot.deterministic.coverage,
      })
      .where(eq(capacityAssessments.id, created.id))
      .returning();
    const assessment = reconcileAssessment(
      await runLlmAssessment(
        snapshot,
        input.requestedByUserId ?? SYSTEM_USER_ID
      ),
      snapshot
    );
    const [completed] = await db
      .update(capacityAssessments)
      .set({
        phase: "completed",
        status:
          assessment.severity === "insufficient_data"
            ? "insufficient_data"
            : "completed",
        assessment,
        completedAt: new Date(),
        durationMs: Date.now() - created.startedAt.getTime(),
        errorMessage: null,
      })
      .where(eq(capacityAssessments.id, created.id))
      .returning();
    return completed ?? collected;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (snapshot && message === "capacity_llm_schema_invalid") {
      const fallback = reconcileAssessment(
        buildDeterministicAssessmentFallback(snapshot),
        snapshot
      );
      const [completedWithFallback] = await db
        .update(capacityAssessments)
        .set({
          phase: "completed",
          status: "completed",
          assessment: fallback,
          completedAt: new Date(),
          durationMs: Date.now() - created.startedAt.getTime(),
          errorMessage:
            "llm_schema_invalid_fallback: แสดงคำแนะนำจากตัวเลขระบบแทน เนื่องจากผล LLM ไม่ตรงรูปแบบที่กำหนด",
        })
        .where(eq(capacityAssessments.id, created.id))
        .returning();
      return completedWithFallback ?? created;
    }
    const [failed] = await db
      .update(capacityAssessments)
      .set({
        phase: "failed",
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - created.startedAt.getTime(),
        errorMessage: message.slice(0, 1000),
      })
      .where(eq(capacityAssessments.id, created.id))
      .returning();
    return failed;
  }
}

export async function getLatestCapacityAssessment(): Promise<CapacityAssessment | null> {
  return (await selectCapacityAssessments(1))[0] ?? null;
}

export async function listCapacityAssessments(
  limit = 20
): Promise<CapacityAssessment[]> {
  return selectCapacityAssessments(Math.min(100, Math.max(1, limit)));
}
