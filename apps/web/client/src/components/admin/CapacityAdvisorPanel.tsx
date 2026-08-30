import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
  Thermometer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Status = "healthy" | "watch" | "action" | "critical" | "insufficient_data";
type Trend = "rising" | "stable" | "falling" | "unknown";
type Horizon = "now" | "24h" | "3d" | "7d" | "unknown";

type WatchlistItem = {
  area: string;
  metric: string;
  severity: Status;
  current: number | null;
  threshold: number | null;
  unit: string;
  trend: Trend;
  horizon: Horizon;
  evidence: string;
  action: string;
};

type Assessment = {
  decision: string;
  severity: Status;
  confidence: number;
  summary: string;
  watchlist?: WatchlistItem[];
  riskPoints: Array<{
    area: string;
    severity: Status;
    evidence: string;
    action: string;
  }>;
  recommendations: Array<{
    priority: string;
    category: string;
    title: string;
    reason: string;
    actions: string[];
  }>;
  missingData: string[];
};

type SnapshotMetric = {
  memoryPercent?: number;
  cpuPercent?: number | null;
  diskUsedGb?: number | null;
  diskTotalGb?: number | null;
  createdAt?: string | Date;
};

type Snapshot = {
  capturedAt?: string;
  policyVersion?: string;
  policy?: {
    version?: string;
    thresholds?: {
      cpuPercent?: { watch: number; action: number; critical: number };
      memoryPercent?: { watch: number; action: number; critical: number };
      diskUsedPercent?: { watch: number; action: number; critical: number };
      queueLength?: { watch: number; action: number; critical: number };
    };
  };
  deterministic?: {
    status?: Status;
    decision?: string;
    coverage?: {
      availableGroups?: number;
      expectedGroups?: number;
      complete?: boolean;
    };
    forecasts?: {
      disk?: {
        available?: boolean;
        growthPerDay?: number;
        daysToThreshold?: number | null;
        targetPercent?: number;
        sampleCount?: number;
        reason?: string;
      };
      temporaryFiles?: { available?: boolean; reason?: string };
    };
  };
  metrics?: {
    latest?: SnapshotMetric;
    history?: SnapshotMetric[];
    summary?: Record<string, number | null>;
  };
  disk?: {
    root?: { availableGb?: number | null; usedPercent?: number | null };
    tempMounts?: Array<{
      target: string;
      availableGb?: number | null;
      usedPercent?: number | null;
      totalGb?: number | null;
    }>;
  };
  temporaryFiles?: Array<{
    label: string;
    bytes: number;
    files: number;
    complete: boolean;
  }>;
  queues?: {
    healthy?: boolean;
    queues?: Array<{
      name: string;
      label?: string;
      length: number;
      maxExpected?: number;
      status: Status | string;
    }>;
    activeAlerts?: Array<{ severity: string; message: string }>;
  };
  services?: Array<{
    name: string;
    displayName: string;
    status: string;
    cpu?: number | null;
    memory?: number | null;
  }>;
  dockerStorage?: {
    totalUsed?: number;
    imagesSize?: number;
    volumesSize?: number;
  } | null;
  workerQueueOverview?: WorkerQueueOverview | null;
  workload?: {
    available?: boolean;
    source?: string;
    error?: string | null;
    capturedAt?: string | null;
  };
};

type WorkerQueueOverview = {
  generatedAt?: string;
  hours?: number;
  totalJobs?: number;
  queuedJobCount?: number;
  activeJobCount?: number;
  stalledJobCount?: number;
  completedJobCount?: number;
  failedJobCount?: number;
  oldestQueuedAt?: string | null;
  oldestQueuedAgeMs?: number | null;
  recentJobs?: Array<{
    id: string;
    jobType: string;
    status: string;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
  }>;
};

type MetricSignal = {
  id: string;
  label: string;
  icon: typeof Cpu;
  current: number | null;
  threshold: number | null;
  unit: string;
  status: Status;
  detail: string;
  source: string;
};

type HistoryRow = {
  id: number;
  createdAt: Date | string;
  trigger: string;
  phase?: string;
  status: string;
  durationMs?: number | null;
  assessment: unknown;
};

function severityClass(severity: string): string {
  if (["critical", "action"].includes(severity))
    return "border-red-200 bg-red-50 text-red-700";
  if (severity === "watch")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "insufficient_data")
    return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusLabel(status: Status): string {
  return {
    healthy: "ปกติ",
    watch: "เฝ้าระวัง",
    action: "ใกล้มีปัญหา",
    critical: "ต้องดำเนินการ",
    insufficient_data: "ข้อมูลไม่พอ",
  }[status];
}

function decisionLabel(decision: string): string {
  return (
    {
      continue_observe: "เฝ้าดูต่อ",
      optimize_home_server: "ปรับปรุง Home Server",
      upgrade_home_server: "Upgrade Home Server",
      migrate_to_cloud: "พิจารณาย้ายขึ้น Cloud",
      insufficient_data: "ข้อมูลยังไม่เพียงพอ",
    }[decision] ?? decision
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatValue(value: number | null, unit: string): string {
  if (value == null) return "ไม่มีข้อมูล";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "GB") return `${value.toFixed(1)} GB`;
  if (unit === "งาน") return `${Math.round(value)} งาน`;
  if (unit === "bytes") return formatBytes(value);
  return `${value.toFixed(1)} ${unit}`;
}

function dateLabel(value: Date | string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "ยังไม่มีข้อมูล";
}

function metricStatus(
  value: number | null,
  watch: number,
  action: number,
  critical: number
): Status {
  if (value == null || !Number.isFinite(value)) return "insufficient_data";
  if (value >= critical) return "critical";
  if (value >= action) return "action";
  if (value >= watch) return "watch";
  return "healthy";
}

function diskPercent(snapshot: Snapshot): number | null {
  const latest = snapshot.metrics?.latest;
  if (latest?.diskTotalGb && latest.diskUsedGb != null)
    return (latest.diskUsedGb / latest.diskTotalGb) * 100;
  return snapshot.disk?.root?.usedPercent ?? null;
}

function buildMetricSignals(snapshot: Snapshot): MetricSignal[] {
  const latest = snapshot.metrics?.latest;
  const thresholds = snapshot.policy?.thresholds;
  const tempBytes =
    snapshot.temporaryFiles?.reduce((sum, item) => sum + item.bytes, 0) ?? null;
  const tempFiles =
    snapshot.temporaryFiles?.reduce((sum, item) => sum + item.files, 0) ?? 0;
  const queues = snapshot.queues?.queues ?? [];
  const workerQueue = snapshot.workerQueueOverview;
  const queueTotal = queues.length
    ? queues.reduce((sum, queue) => sum + queue.length, 0)
    : (workerQueue?.queuedJobCount ?? null);
  const queueThreshold =
    queues.length && queues.every(queue => queue.maxExpected != null)
      ? queues.reduce((sum, queue) => sum + (queue.maxExpected ?? 0), 0)
      : (thresholds?.queueLength?.watch ?? null);
  const queueStatus: Status = queues.some(queue => queue.status === "critical")
    ? "critical"
    : queues.some(
          queue => queue.status === "warning" || queue.status === "watch"
        )
      ? "watch"
      : queueTotal == null
        ? "insufficient_data"
        : metricStatus(
            queueTotal,
            thresholds?.queueLength?.watch ?? 50,
            thresholds?.queueLength?.action ?? 100,
            thresholds?.queueLength?.critical ?? 1000
          );
  const disk = diskPercent(snapshot);
  return [
    {
      id: "cpu",
      label: "CPU",
      icon: Cpu,
      current: latest?.cpuPercent ?? null,
      threshold: thresholds?.cpuPercent?.watch ?? 70,
      unit: "%",
      status: metricStatus(
        latest?.cpuPercent ?? null,
        thresholds?.cpuPercent?.watch ?? 70,
        thresholds?.cpuPercent?.action ?? 85,
        thresholds?.cpuPercent?.critical ?? 95
      ),
      detail: `เฝ้าระวัง ${thresholds?.cpuPercent?.watch ?? 70}% · ดำเนินการ ${thresholds?.cpuPercent?.action ?? 85}% · วิกฤต ${thresholds?.cpuPercent?.critical ?? 95}%`,
      source: "metrics.latest.cpuPercent + metrics.summary",
    },
    {
      id: "ram",
      label: "RAM",
      icon: MemoryStick,
      current: latest?.memoryPercent ?? null,
      threshold: thresholds?.memoryPercent?.watch ?? 70,
      unit: "%",
      status: metricStatus(
        latest?.memoryPercent ?? null,
        thresholds?.memoryPercent?.watch ?? 70,
        thresholds?.memoryPercent?.action ?? 85,
        thresholds?.memoryPercent?.critical ?? 90
      ),
      detail: `เฝ้าระวัง ${thresholds?.memoryPercent?.watch ?? 70}% · ดำเนินการ ${thresholds?.memoryPercent?.action ?? 85}% · วิกฤต ${thresholds?.memoryPercent?.critical ?? 90}%`,
      source: "metrics.latest.memoryPercent + metrics.summary",
    },
    {
      id: "disk",
      label: "Disk",
      icon: HardDrive,
      current: disk,
      threshold: thresholds?.diskUsedPercent?.watch ?? 75,
      unit: "%",
      status: metricStatus(
        disk,
        thresholds?.diskUsedPercent?.watch ?? 75,
        thresholds?.diskUsedPercent?.action ?? 85,
        thresholds?.diskUsedPercent?.critical ?? 90
      ),
      detail: `เฝ้าระวัง ${thresholds?.diskUsedPercent?.watch ?? 75}% · ดำเนินการ ${thresholds?.diskUsedPercent?.action ?? 85}% · เหลือ ${snapshot.disk?.root?.availableGb?.toFixed(1) ?? "?"} GB`,
      source: "disk.root + metrics.latest.diskUsedGb/diskTotalGb",
    },
    {
      id: "temp",
      label: "Temp files",
      icon: Thermometer,
      current: tempBytes,
      threshold: null,
      unit: "bytes",
      status: snapshot.temporaryFiles?.every(item => item.complete)
        ? "healthy"
        : "watch",
      detail: `${tempFiles.toLocaleString()} files · ${snapshot.temporaryFiles?.every(item => item.complete) ? "สแกนครบ" : "สแกนไม่ครบ"}`,
      source: "temporaryFiles",
    },
    {
      id: "queue",
      label: "Queue",
      icon: Server,
      current: queueTotal,
      threshold: queueThreshold,
      unit: "งาน",
      status: queueStatus,
      detail: queues.length
        ? `สูงสุด ${Math.max(...queues.map(queue => queue.length))} งาน · ${queues.length} queues`
        : workerQueue
          ? `${workerQueue.queuedJobCount ?? 0} งานรอ · ${workerQueue.activeJobCount ?? 0} งานกำลังทำ`
          : "ยังไม่มี queue sample",
      source: "queues.queues + queues.activeAlerts",
    },
  ];
}

function overallStatus(signals: MetricSignal[]): Status {
  if (signals.some(signal => signal.status === "critical")) return "critical";
  if (signals.some(signal => signal.status === "action")) return "action";
  if (signals.some(signal => signal.status === "watch")) return "watch";
  if (signals.some(signal => signal.status === "insufficient_data"))
    return "insufficient_data";
  return "healthy";
}

function MetricSignalCard({ signal }: { signal: MetricSignal }) {
  const Icon = signal.icon;
  return (
    <div className={`rounded-2xl border p-4 ${severityClass(signal.status)}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" />
          {signal.label}
        </div>
        <span className="text-xs font-medium">
          {statusLabel(signal.status)}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        {formatValue(signal.current, signal.unit)}
      </p>
      <p className="mt-1 text-xs opacity-80">
        จุดเริ่มเฝ้าระวัง: {formatValue(signal.threshold, signal.unit)}
      </p>
      <p className="mt-2 text-xs leading-5 opacity-80">{signal.detail}</p>
    </div>
  );
}

function Watchlist({
  items,
  fallback,
}: {
  items: WatchlistItem[];
  fallback: Assessment["riskPoints"];
}) {
  const actionable = items.filter(item => item.severity !== "healthy");
  if (actionable.length === 0 && fallback.length === 0)
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        ยังไม่พบจุดที่เข้าใกล้ปัญหาจากตัวเลขล่าสุด
      </div>
    );
  return (
    <div className="space-y-3">
      {(actionable.length > 0 ? actionable : fallback)
        .slice(0, 6)
        .map((item, index) => {
          const watch = "metric" in item ? (item as WatchlistItem) : null;
          return (
            <div
              key={`${item.area}-${index}`}
              className={`rounded-2xl border p-4 ${severityClass(item.severity)}`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    <span>{item.area}</span>
                    {watch && (
                      <Badge variant="outline" className="border-current/30">
                        {watch.horizon === "unknown"
                          ? "ยังไม่คาดการณ์เวลา"
                          : `เสี่ยงภายใน ${watch.horizon}`}
                      </Badge>
                    )}
                  </div>
                  {watch && (
                    <p className="mt-1 text-xs font-medium">
                      ค่าปัจจุบัน {formatValue(watch.current, watch.unit)} ·
                      threshold {formatValue(watch.threshold, watch.unit)} ·
                      แนวโน้ม {watch.trend}
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-5">{item.evidence}</p>
                  <p className="mt-2 text-xs font-medium">
                    ควรทำ: {item.action}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function SummaryTab({
  snapshot,
  assessment,
  signals,
  latest,
}: {
  snapshot: Snapshot;
  assessment: Assessment | null;
  signals: MetricSignal[];
  latest: {
    createdAt: Date | string;
    errorMessage?: string | null;
  };
}) {
  const measuredStatus =
    snapshot.deterministic?.status ?? overallStatus(signals);
  const coverage = snapshot.deterministic?.coverage;
  const diskForecast = snapshot.deterministic?.forecasts?.disk;
  const usesFallback = latest.errorMessage?.startsWith(
    "llm_schema_invalid_fallback"
  );
  return (
    <div className="space-y-5">
      <DashboardCard className={`border-2 ${severityClass(measuredStatus)}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              สถานะปัจจุบันจากตัวเลข
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {statusLabel(measuredStatus)}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6">
              {assessment?.summary ??
                "ยังไม่มีคำวิเคราะห์จาก LLM แต่ตัวเลขระบบพร้อมให้ตรวจสอบในแท็บรายละเอียด"}
            </p>
          </div>
          <div className="rounded-xl border border-current/20 px-3 py-2 text-right text-sm">
            <p className="text-xs opacity-70">
              {usesFallback ? "คำแนะนำจากตัวเลขระบบ" : "คำแนะนำจาก LLM"}
            </p>
            <p className="font-semibold">
              {assessment
                ? decisionLabel(
                    snapshot.deterministic?.decision ?? assessment.decision
                  )
                : "รอผลประเมิน"}
            </p>
            {assessment && (
              <p className="mt-1 text-xs opacity-70">
                ความมั่นใจ {(assessment.confidence * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs opacity-70">
          ข้อมูลล่าสุด {dateLabel(snapshot.capturedAt ?? latest.createdAt)} ·
          อ้างอิง threshold ระบบและข้อมูลย้อนหลัง 24 ชั่วโมง
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-current/30">
            ความครอบคลุม {coverage?.availableGroups ?? "?"}/
            {coverage?.expectedGroups ?? "?"} กลุ่มข้อมูล
          </Badge>
          <Badge variant="outline" className="border-current/30">
            Policy{" "}
            {snapshot.policyVersion ?? snapshot.policy?.version ?? "legacy"}
          </Badge>
          <Badge variant="outline" className="border-current/30">
            Scope: Home Server / runtime ที่ตรวจพบ
          </Badge>
        </div>
      </DashboardCard>
      {usesFallback && (
        <DashboardCard className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                รอบนี้ใช้คำแนะนำสำรองจากตัวเลขระบบ
              </p>
              <p className="mt-1">
                ผลจาก LLM ไม่ตรงรูปแบบที่กำหนด จึงใช้ค่า CPU, RAM, Disk, Temp
                files และ Queue ที่ตรวจวัดได้แทน เพื่อไม่ให้การประเมินหายไป
              </p>
            </div>
          </div>
        </DashboardCard>
      )}
      {diskForecast && (
        <DashboardCard
          title="แนวโน้มพื้นที่จัดเก็บ"
          description="คำนวณจากประวัติ disk ที่เก็บได้ ไม่ใช่การคาดเดาของ LLM"
        >
          {diskForecast.available ? (
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">เพิ่มขึ้นเฉลี่ย</p>
                <p className="mt-1 text-xl font-semibold">
                  {diskForecast.growthPerDay != null
                    ? `${diskForecast.growthPerDay.toFixed(2)}% / วัน`
                    : "ไม่มีข้อมูล"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  ถึง threshold วิกฤต
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {diskForecast.daysToThreshold != null
                    ? `${diskForecast.daysToThreshold.toFixed(1)} วัน`
                    : "ยังคาดการณ์ไม่ได้"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                ใช้ตัวอย่าง {diskForecast.sampleCount ?? 0} จุด · เป้าหมาย{" "}
                {diskForecast.targetPercent ?? 90}%
              </p>
            </div>
          ) : (
            <p className="text-sm text-amber-800">
              ยังไม่มีประวัติ disk เพียงพอสำหรับคำนวณ growth rate (
              {diskForecast.reason ?? "insufficient_data"})
            </p>
          )}
        </DashboardCard>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {signals.map(signal => (
          <MetricSignalCard key={signal.id} signal={signal} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardCard
          title="ปัญหาที่พบหรือกำลังจะเกิด"
          description="อ้างอิงค่าปัจจุบัน, threshold และแนวโน้มของแต่ละ metric"
        >
          <Watchlist
            items={assessment?.watchlist ?? []}
            fallback={assessment?.riskPoints ?? []}
          />
        </DashboardCard>
        <DashboardCard
          title="ข้อเสนอแนะ"
          description="สิ่งที่ควรทำตามลำดับความเร่งด่วน"
        >
          {assessment?.recommendations?.length ? (
            <div className="space-y-3">
              {assessment.recommendations
                .slice(0, 4)
                .map((recommendation, index) => (
                  <div
                    key={`${recommendation.title}-${index}`}
                    className="rounded-2xl border border-border/70 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{recommendation.priority}</Badge>
                      <span className="font-semibold">
                        {recommendation.title}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground">
                      {recommendation.reason}
                    </p>
                    <p className="mt-2 text-xs text-slate-700">
                      ถัดไป:{" "}
                      {recommendation.actions[0] ??
                        "ตรวจสอบรายละเอียดเพิ่มเติม"}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ยังไม่มีข้อเสนอแนะจาก LLM
            </p>
          )}
        </DashboardCard>
      </div>
      {assessment?.missingData?.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">ข้อมูลที่ควรเก็บเพิ่ม:</span>{" "}
          {assessment.missingData.join("; ")}
        </div>
      ) : null}
    </div>
  );
}

function DetailsTab({
  snapshot,
  signals,
}: {
  snapshot: Snapshot;
  signals: MetricSignal[];
}) {
  const summary = snapshot.metrics?.summary ?? {};
  const rows: Array<
    [
      string,
      number | null | undefined,
      number | null | undefined,
      number | null | undefined,
      string,
    ]
  > = [
    [
      "CPU",
      snapshot.metrics?.latest?.cpuPercent,
      summary.averageCpuPercent,
      summary.peakCpuPercent,
      "70 / 85 / 95%",
    ],
    [
      "RAM",
      snapshot.metrics?.latest?.memoryPercent,
      summary.averageMemoryPercent,
      summary.peakMemoryPercent,
      "70 / 85 / 90%",
    ],
    [
      "Disk",
      diskPercent(snapshot),
      summary.averageDiskUsedPercent,
      summary.peakDiskUsedPercent,
      "75 / 85 / 90%",
    ],
  ];
  return (
    <div className="space-y-5">
      <DashboardCard
        title="รายละเอียดตัวเลขย้อนหลัง 24 ชั่วโมง"
        description="ข้อมูลดิบและค่าเฉลี่ย/ค่าสูงสุดสำหรับเจาะหาสาเหตุ"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Metric</th>
                <th>ล่าสุด</th>
                <th>เฉลี่ย</th>
                <th>สูงสุด</th>
                <th>จุดอ้างอิง</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(([label, current, average, peak, threshold]) => (
                <tr key={label}>
                  <td className="py-3 font-medium">{label}</td>
                  <td>
                    {current != null ? `${Number(current).toFixed(1)}%` : "N/A"}
                  </td>
                  <td>
                    {average != null ? `${Number(average).toFixed(1)}%` : "N/A"}
                  </td>
                  <td>
                    {peak != null ? `${Number(peak).toFixed(1)}%` : "N/A"}
                  </td>
                  <td className="text-xs text-muted-foreground">{threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DashboardCard
          title="Temporary files"
          description="การสแกนถูกจำกัดขอบเขตและจำนวนไฟล์เพื่อไม่ให้กระทบระบบ"
        >
          <div className="space-y-2">
            {(snapshot.temporaryFiles ?? []).map(item => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm"
              >
                <span>
                  {item.label} · {item.files.toLocaleString()} files
                </span>
                <span
                  className={
                    item.complete ? "text-emerald-700" : "text-amber-700"
                  }
                >
                  {formatBytes(item.bytes)} · {item.complete ? "ครบ" : "ไม่ครบ"}
                </span>
              </div>
            ))}
          </div>
        </DashboardCard>
        <DashboardCard
          title="Queues และ background workload"
          description="ใช้ดู backlog และจุดที่ worker ระบายงานไม่ทัน"
        >
          <div className="space-y-2">
            {(snapshot.queues?.queues ?? []).map(queue => (
              <div
                key={queue.name}
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm"
              >
                <span>{queue.label ?? queue.name}</span>
                <Badge className={severityClass(queue.status)}>
                  {queue.length} งาน ·{" "}
                  {statusLabel((queue.status as Status) || "insufficient_data")}
                </Badge>
              </div>
            ))}
            {!snapshot.queues?.queues?.length && (
              <p className="text-sm text-muted-foreground">
                ยังไม่มี queue sample
              </p>
            )}
          </div>
        </DashboardCard>
        <DashboardCard
          title="พื้นที่ของ mount ที่เกี่ยวข้อง"
          description="ตรวจแยกจาก root เพื่อไม่ให้ temporary/media storage ถูกซ่อนอยู่ในตัวเลขรวม"
        >
          <div className="space-y-2">
            {(snapshot.disk?.tempMounts ?? []).map(mount => (
              <div
                key={mount.target}
                className="rounded-xl border border-border/70 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{mount.target}</span>
                  <span className="text-muted-foreground">
                    {mount.usedPercent != null
                      ? `${mount.usedPercent.toFixed(1)}% ใช้ไป`
                      : "ไม่มีข้อมูล"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  เหลือ{" "}
                  {mount.availableGb != null
                    ? `${mount.availableGb.toFixed(1)} GB`
                    : "ไม่มีข้อมูล"}
                  {mount.totalGb != null
                    ? ` จาก ${mount.totalGb.toFixed(1)} GB`
                    : ""}
                </p>
              </div>
            ))}
            {!snapshot.disk?.tempMounts?.length && (
              <p className="text-sm text-muted-foreground">
                ไม่มีข้อมูล mount แยก หรือยังไม่ได้เก็บตัวอย่าง
              </p>
            )}
          </div>
        </DashboardCard>
      </div>
      <DashboardCard
        title="Services และ storage"
        description="สถานะ runtime ที่ใช้ประกอบการตัดสินใจ ไม่ใช่คำสั่งให้ระบบเปลี่ยนแปลงเอง"
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {(snapshot.services ?? []).map(service => (
            <div
              key={service.name}
              className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm"
            >
              <span>{service.displayName}</span>
              <span className="text-muted-foreground">
                {service.status}
                {service.cpu != null ? ` · CPU ${service.cpu.toFixed(1)}%` : ""}
                {service.memory != null
                  ? ` · RAM ${service.memory.toFixed(1)} MB`
                  : ""}
              </span>
            </div>
          ))}
        </div>
        {snapshot.dockerStorage && (
          <p className="mt-3 text-sm text-muted-foreground">
            Docker ใช้พื้นที่รวม{" "}
            {snapshot.dockerStorage.totalUsed?.toFixed(2) ?? "N/A"} GB · images{" "}
            {snapshot.dockerStorage.imagesSize?.toFixed(2) ?? "N/A"} GB ·
            volumes {snapshot.dockerStorage.volumesSize?.toFixed(2) ?? "N/A"} GB
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          แหล่งข้อมูล: {signals.map(signal => signal.source).join(" · ")}
        </p>
      </DashboardCard>
    </div>
  );
}

function WorkloadTab({
  snapshot,
  workerQueue,
  unavailableReason,
}: {
  snapshot: Snapshot;
  workerQueue: WorkerQueueOverview | null;
  unavailableReason?: string | null;
}) {
  const age = workerQueue?.oldestQueuedAgeMs;
  const formatAge = (value: number | null | undefined) => {
    if (value == null) return "ไม่มีข้อมูล";
    const minutes = Math.floor(value / 60_000);
    if (minutes < 60) return `${minutes} นาที`;
    return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
  };
  return (
    <div className="space-y-5">
      <DashboardCard
        title="งานและความสามารถในการระบายงาน"
        description="ตัวเลขชุดนี้ใช้บอกว่าปัญหาเกิดจากเครื่องไม่พอ หรือ worker/queue ระบายงานไม่ทัน"
      >
        {workerQueue ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["รอคิว", workerQueue.queuedJobCount ?? 0, "งาน"],
              ["กำลังทำ", workerQueue.activeJobCount ?? 0, "งาน"],
              ["ค้าง/เสี่ยง stalled", workerQueue.stalledJobCount ?? 0, "งาน"],
              ["เก่าสุดในคิว", formatAge(age), ""],
            ].map(([label, value, unit]) => (
              <div
                key={label}
                className="rounded-2xl border border-border/70 bg-muted/20 p-4"
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {value}
                </p>
                {unit && (
                  <p className="text-xs text-muted-foreground">{unit}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            ยังตรวจ workload จริงไม่ได้ จึงไม่ควรสรุปว่า queue ปกติ
            {unavailableReason ? ` (${unavailableReason})` : ""}
          </div>
        )}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              งานสำเร็จในช่วงข้อมูล
            </p>
            <p className="mt-1 font-semibold">
              {workerQueue?.completedJobCount ?? "ไม่มีข้อมูล"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              งานล้มเหลวในช่วงข้อมูล
            </p>
            <p className="mt-1 font-semibold">
              {workerQueue?.failedJobCount ?? "ไม่มีข้อมูล"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3 text-sm">
            <p className="text-xs text-muted-foreground">แหล่งข้อมูล</p>
            <p className="mt-1 font-semibold">
              {snapshot.workload?.source ?? "ไม่ระบุ"}
            </p>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        title="งานล่าสุดที่ใช้เวลานานหรือผิดปกติ"
        description="แสดงเฉพาะ metadata ที่ปลอดภัย ไม่รวม payload ของงาน"
      >
        <div className="divide-y">
          {(workerQueue?.recentJobs ?? []).slice(0, 10).map(job => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{job.jobType}</p>
                <p className="text-xs text-muted-foreground">
                  เริ่ม {dateLabel(job.startedAt ?? job.createdAt)}
                </p>
              </div>
              <Badge variant="outline">{job.status}</Badge>
            </div>
          ))}
          {!workerQueue?.recentJobs?.length && (
            <p className="py-3 text-sm text-muted-foreground">
              ยังไม่มีงานล่าสุดจาก source นี้
            </p>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}

function HistoryTab({ history }: { history: HistoryRow[] }) {
  return (
    <DashboardCard
      title="ประวัติการประเมิน"
      description="เปรียบเทียบว่าคำแนะนำเปลี่ยนไปตาม workload อย่างไร"
    >
      <div className="divide-y">
        {history.map(run => {
          const result = run.assessment as Partial<Assessment> | null;
          const severity = (result?.severity as Status) ?? "insufficient_data";
          return (
            <div
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>{dateLabel(run.createdAt)}</span>
                <Badge variant="outline">
                  {run.trigger === "scheduled" ? "อัตโนมัติ" : "Admin"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={severityClass(severity)}>
                  {statusLabel(severity)}
                </Badge>
                <span className="text-muted-foreground">
                  {result?.decision
                    ? decisionLabel(result.decision)
                    : run.status}
                </span>
                {run.durationMs != null && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(run.durationMs / 1000)}s
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
        {history.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
        )}
      </div>
    </DashboardCard>
  );
}

export function CapacityAdvisorPanel() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"summary" | "system" | "workload" | "history">(
    "summary"
  );
  const latestQuery = trpc.monitoring.getLatestCapacityAssessment.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );
  const historyQuery = trpc.monitoring.listCapacityAssessments.useQuery({
    limit: 20,
  });
  const readinessQuery = trpc.monitoring.getCapacityAdvisorReadiness.useQuery();
  const workerQueueQuery =
    trpc.monitoring.getCapacityWorkerQueueOverview.useQuery(
      { hours: 24 },
      { refetchInterval: 60000, retry: false }
    );
  const runMutation = trpc.monitoring.runCapacityAssessment.useMutation({
    onSuccess: async () => {
      toast.success("เริ่มประเมิน Capacity แล้ว");
      await Promise.all([
        utils.monitoring.getLatestCapacityAssessment.invalidate(),
        utils.monitoring.listCapacityAssessments.invalidate(),
        utils.monitoring.getCapacityAdvisorReadiness.invalidate(),
        utils.monitoring.getCapacityWorkerQueueOverview.invalidate({
          hours: 24,
        }),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const latest = latestQuery.data;
  const snapshot = (latest?.snapshot ?? null) as Snapshot | null;
  const assessment = (latest?.assessment ?? null) as Assessment | null;
  const workerQueue = (workerQueueQuery.data ??
    snapshot?.workerQueueOverview ??
    null) as WorkerQueueOverview | null;
  const effectiveSnapshot = snapshot
    ? { ...snapshot, workerQueueOverview: workerQueue }
    : null;
  const signals = effectiveSnapshot
    ? buildMetricSignals(effectiveSnapshot)
    : [];
  const latestIsStale = Boolean(
    latest &&
    Date.now() - new Date(latest.createdAt).getTime() > 26 * 60 * 60 * 1000
  );
  const requestRun = () => {
    if (
      !window.confirm(
        "ยืนยันเริ่มการประเมิน Capacity ใหม่? ระบบจะเก็บ snapshot และเรียกใช้ LLM เพื่อให้คำแนะนำ"
      )
    )
      return;
    runMutation.mutate({ confirmed: true });
  };
  return (
    <div className="space-y-5">
      <DashboardCard className="border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Capacity Advisor
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              สรุปความพร้อมของ Home Server
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              หน้าแรกแสดงเฉพาะสิ่งที่ Admin ต้องรู้เพื่อเลือกว่าจะเฝ้าดู
              ปรับปรุง Upgrade หรือย้ายขึ้น Cloud
            </p>
          </div>
          <Button
            onClick={requestRun}
            disabled={
              runMutation.isPending ||
              readinessQuery.data?.migrationPending === true ||
              readinessQuery.data?.storageAvailable === false
            }
          >
            {runMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {runMutation.isPending
              ? "กำลังเริ่มประเมิน..."
              : "เริ่มประเมินตอนนี้"}
          </Button>
        </div>
      </DashboardCard>
      {readinessQuery.data?.message && (
        <DashboardCard className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                Capacity Advisor ยังไม่พร้อมสำหรับการประเมินรอบใหม่
              </p>
              <p className="mt-1">{readinessQuery.data.message}</p>
              <p className="mt-1 text-xs text-amber-800">
                ผลประเมินเก่ายังเปิดดูได้ แต่ปุ่มเริ่มประเมินจะใช้ได้หลัง
                migration ครบ
              </p>
            </div>
          </div>
        </DashboardCard>
      )}
      <div
        className="flex flex-wrap gap-2 border-b border-border/70 pb-2"
        role="tablist"
        aria-label="Capacity Advisor sections"
      >
        {[
          { id: "summary", label: "สรุปสถานะ" },
          { id: "system", label: "CPU / RAM / พื้นที่" },
          { id: "workload", label: "งาน / Queue" },
          { id: "history", label: "ประวัติการประเมิน" },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id as typeof tab)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${tab === item.id ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {latestQuery.isLoading && (
        <DashboardCard>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            กำลังโหลดผลประเมินล่าสุด...
          </div>
        </DashboardCard>
      )}
      {latestQuery.error && (
        <DashboardCard className="border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3 text-sm text-red-800">
            <span>โหลดผลประเมินไม่ได้ กรุณาลองใหม่อีกครั้ง</span>
            <Button
              variant="outline"
              onClick={() => void latestQuery.refetch()}
            >
              ลองใหม่
            </Button>
          </div>
        </DashboardCard>
      )}
      {latest && latestIsStale && (
        <DashboardCard className="border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                ผลประเมินล่าสุดเก่ากว่า 26 ชั่วโมง
              </p>
              <p className="mt-1">
                อย่าใช้ผลนี้ตัดสินใจ upgrade
                หรือย้ายระบบจนกว่าจะกดประเมินรอบใหม่
              </p>
            </div>
          </div>
        </DashboardCard>
      )}
      {!latest && !latestQuery.isLoading && !latestQuery.error && (
        <DashboardCard>
          <div className="flex items-start gap-3">
            <Thermometer className="mt-0.5 h-5 w-5 text-sky-700" />
            <div>
              <p className="font-semibold">ยังไม่มีผลประเมินครั้งแรก</p>
              <p className="mt-1 text-sm text-muted-foreground">
                เริ่มจาก snapshot
                ปัจจุบันเพื่อให้หน้าแรกตอบได้ว่าระบบอยู่ระดับไหน
                และมีจุดใดต้องเฝ้าระวัง
              </p>
              <Button
                className="mt-4"
                onClick={requestRun}
                disabled={
                  runMutation.isPending ||
                  readinessQuery.data?.migrationPending === true ||
                  readinessQuery.data?.storageAvailable === false
                }
              >
                เริ่มประเมินครั้งแรก
              </Button>
            </div>
          </div>
        </DashboardCard>
      )}
      {latest && effectiveSnapshot && tab === "summary" && (
        <SummaryTab
          snapshot={effectiveSnapshot}
          assessment={assessment}
          signals={signals}
          latest={latest}
        />
      )}
      {latest && effectiveSnapshot && tab === "system" && (
        <DetailsTab snapshot={effectiveSnapshot} signals={signals} />
      )}
      {latest && effectiveSnapshot && tab === "workload" && (
        <WorkloadTab
          snapshot={effectiveSnapshot}
          workerQueue={workerQueue}
          unavailableReason={
            workerQueueQuery.error?.message ?? effectiveSnapshot.workload?.error
          }
        />
      )}
      {tab === "history" && (
        <HistoryTab history={(historyQuery.data ?? []) as HistoryRow[]} />
      )}
      {latest && !assessment && tab !== "history" && (
        <DashboardCard className="border-amber-200 bg-amber-50">
          <div className="flex items-start justify-between gap-3 text-sm text-amber-900">
            <div>
              <p className="font-semibold">
                {latest.status === "failed"
                  ? "รอบประเมินล่าสุดไม่สำเร็จ"
                  : "กำลังรอผลประเมิน"}
              </p>
              <p className="mt-1">
                {latest.status === "failed"
                  ? "กดประเมินใหม่เพื่อให้ระบบลองเรียก LLM และสร้างคำแนะนำจากตัวเลขสำรองหากจำเป็น"
                  : "ระบบกำลังเก็บผลการประเมิน กรุณารอสักครู่"}
              </p>
            </div>
            {latest.status === "failed" && (
              <Button
                variant="outline"
                onClick={requestRun}
                disabled={runMutation.isPending}
              >
                ประเมินใหม่
              </Button>
            )}
          </div>
        </DashboardCard>
      )}
    </div>
  );
}
