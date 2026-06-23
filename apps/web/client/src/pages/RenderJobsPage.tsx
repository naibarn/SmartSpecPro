import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  MonitorPlay,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  "all",
  "queued",
  "claimed",
  "running",
  "uploading",
  "publishing",
  "completed",
  "failed",
  "canceled",
] as const;

const STATUS_LABELS: Record<string, string> = {
  all: "ทั้งหมด",
  queued: "รอ worker",
  claimed: "มี worker รับงานแล้ว",
  preparing: "กำลังเตรียมงาน",
  running: "กำลังเรนเดอร์",
  uploading: "กำลังอัปโหลด",
  publishing: "กำลังเผยแพร่",
  indexing: "กำลังจัดทำดัชนี",
  completed: "สำเร็จ",
  failed: "ล้มเหลว",
  canceled: "ยกเลิกแล้ว",
  expired: "หมดเวลา",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  failed: "destructive",
  canceled: "destructive",
  expired: "destructive",
  running: "secondary",
  uploading: "secondary",
  publishing: "secondary",
  claimed: "outline",
  queued: "outline",
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "failed" || status === "canceled" || status === "expired") {
    return <XCircle className="h-4 w-4" />;
  }
  if (status === "running" || status === "uploading" || status === "publishing") {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }
  return <Clock className="h-4 w-4" />;
}

function JobStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_BADGE[status] ?? "outline"} className="gap-1">
      {statusIcon(status)}
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default function RenderJobsPage() {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const listQuery = trpc.workerJobs.list.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 50,
      offset: 0,
    },
    { refetchInterval: 10_000 },
  );

  const jobs = listQuery.data?.items ?? [];
  const selectedJob = selectedJobId ?? jobs[0]?.id ?? null;

  const detailQuery = trpc.workerJobs.detail.useQuery(
    { jobId: selectedJob ?? "" },
    { enabled: Boolean(selectedJob) },
  );

  const cancelMutation = trpc.workerJobs.cancelQueued.useMutation({
    onSuccess: async () => {
      toast.success("ยกเลิกงานแล้ว");
      await Promise.all([
        utils.workerJobs.list.invalidate(),
        utils.workerJobs.detail.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "ยกเลิกงานไม่สำเร็จ");
    },
  });

  const activeCount = useMemo(
    () => jobs.filter((job) => ["claimed", "preparing", "running", "uploading", "publishing", "indexing"].includes(job.status)).length,
    [jobs],
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.20),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,1))]" />
      <div className="relative flex min-h-screen flex-col">
        <header className="border-b border-white/10 bg-slate-950/80 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white">
                <Link href="/dashboard" aria-label="กลับไป Dashboard">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                <MonitorPlay className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-normal text-white sm:text-2xl">
                    งานเรนเดอร์ของฉัน
                  </h1>
                  <Badge variant="outline" className="border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
                    Worker queue
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  ติดตามงาน worker ที่คุณส่งไว้ ดูคิว คนรับงาน ความคืบหน้า และลิงก์ผลลัพธ์จากหน้าเดียว
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                <Link href="/media-history">Media History</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                <Link href="/media-studio">Media Studio</Link>
              </Button>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="w-44 border-white/15 bg-white/10 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                aria-label="รีเฟรชรายการงาน"
                onClick={() => listQuery.refetch()}
                disabled={listQuery.isFetching}
                className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
              >
                <RefreshCw className={cn("h-4 w-4", listQuery.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-slate-300">ทั้งหมดในหน้านี้</div>
              <div className="mt-1 text-3xl font-semibold text-white">{jobs.length}</div>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-cyan-100/80">กำลังทำงาน</div>
              <div className="mt-1 text-3xl font-semibold text-cyan-50">{activeCount}</div>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-amber-100/80">รอ worker</div>
              <div className="mt-1 text-3xl font-semibold text-amber-50">{jobs.filter((job) => job.status === "queued").length}</div>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-emerald-100/80">สำเร็จ</div>
              <div className="mt-1 text-3xl font-semibold text-emerald-50">{jobs.filter((job) => job.status === "completed").length}</div>
            </div>
          </div>

          {listQuery.isError ? (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <AlertCircle className="h-4 w-4" />
              โหลดรายการงานไม่สำเร็จ: {listQuery.error.message}
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.75fr)]">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/95 text-slate-900 shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">รายการงาน</h2>
                  <p className="text-xs text-slate-500">คลิกงานเพื่อดูรายละเอียดและ output ที่ตรวจสอบแล้ว</p>
                </div>
                {listQuery.isFetching ? (
                  <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    กำลังอัปเดต
                  </Badge>
                ) : null}
              </div>

              {listQuery.isLoading ? (
                <div className="flex min-h-80 items-center justify-center text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  กำลังโหลดงาน
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex min-h-80 items-center justify-center px-4 text-center text-sm text-slate-500">
                  ยังไม่มีงานในสถานะนี้
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>งาน</TableHead>
                          <TableHead>สถานะ</TableHead>
                          <TableHead>Worker</TableHead>
                          <TableHead>ความคืบหน้า</TableHead>
                          <TableHead className="text-right">สร้างเมื่อ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job) => (
                          <TableRow
                            key={job.id}
                            className={cn("cursor-pointer", selectedJob === job.id && "bg-cyan-50")}
                            onClick={() => setSelectedJobId(job.id)}
                          >
                            <TableCell>
                              <div className="font-medium">{job.jobType}</div>
                              <div className="max-w-52 truncate text-xs text-slate-500">{job.id}</div>
                            </TableCell>
                            <TableCell><JobStatusBadge status={job.status} /></TableCell>
                            <TableCell>
                              {job.worker?.displayName ?? "ยังไม่ assign"}
                              {job.worker?.machineName ? (
                                <div className="text-xs text-slate-500">{job.worker.machineName}</div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div className="max-w-72 truncate text-sm">
                                {job.latestEvent?.message ?? job.latestEvent?.phase ?? job.latestEvent?.eventType ?? "-"}
                              </div>
                              {typeof job.latestEvent?.progressPercent === "number" ? (
                                <div className="text-xs text-slate-500">{job.latestEvent.progressPercent}%</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right text-sm text-slate-500">
                              {formatDate(job.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid gap-2 p-3 md:hidden">
                    {jobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setSelectedJobId(job.id)}
                        className={cn(
                          "rounded-2xl border p-3 text-left",
                          selectedJob === job.id && "border-cyan-300 bg-cyan-50",
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{job.jobType}</span>
                          <JobStatusBadge status={job.status} />
                        </div>
                        <div className="text-xs text-slate-500">{formatDate(job.createdAt)}</div>
                        <div className="mt-2 truncate text-sm">
                          {job.latestEvent?.message ?? job.latestEvent?.eventType ?? "ยังไม่มี progress event"}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            <aside className="overflow-hidden rounded-3xl border border-cyan-300/15 bg-slate-900/85 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-base font-semibold text-white">รายละเอียดงาน</h2>
                <p className="text-xs text-slate-400">สถานะ worker, เวลา, output และ progress events</p>
              </div>

              {!selectedJob ? (
                <div className="p-5 text-sm text-slate-400">เลือกงานเพื่อดูรายละเอียด</div>
              ) : detailQuery.isLoading ? (
                <div className="flex min-h-56 items-center justify-center text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  กำลังโหลดรายละเอียด
                </div>
              ) : detailQuery.isError ? (
                <div className="p-5 text-sm text-rose-200">{detailQuery.error.message}</div>
              ) : detailQuery.data ? (
                <div className="max-h-[calc(100vh-260px)] space-y-5 overflow-y-auto p-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{detailQuery.data.jobType}</div>
                        <div className="truncate text-xs text-slate-400">{detailQuery.data.id}</div>
                      </div>
                      <JobStatusBadge status={detailQuery.data.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-200">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-slate-400">เริ่ม</div>
                        {formatDate(detailQuery.data.startedAt)}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-slate-400">จบ</div>
                        {formatDate(detailQuery.data.finishedAt)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                      <div className="text-xs text-slate-400">Worker</div>
                      {detailQuery.data.worker?.displayName ?? "ยังไม่มี worker รับงาน"}
                      {detailQuery.data.worker?.status ? (
                        <span className="ml-2 text-xs text-slate-400">({detailQuery.data.worker.status})</span>
                      ) : null}
                    </div>
                  </div>

                  {detailQuery.data.failureReason ? (
                    <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      {detailQuery.data.failureReason}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!detailQuery.data.canCancel || cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate({ jobId: detailQuery.data.id })}
                    >
                      {cancelMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      ยกเลิกงานที่ยังรอ
                    </Button>
                    {detailQuery.data.workflowRunId ? (
                      <Link href={`/workpacks/${detailQuery.data.workflowRunId}`}>
                        <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                          เปิดงานต้นทาง
                        </Button>
                      </Link>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <Download className="h-4 w-4" />
                      ผลลัพธ์ที่ตรวจสอบแล้ว
                    </h3>
                    {detailQuery.data.outputRefs.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                        ยังไม่มี output ที่ผ่านการตรวจสอบ
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {detailQuery.data.outputRefs.map((ref, index) => (
                          <div key={`${ref.artifactId ?? ref.publishedItemId ?? index}`} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                            <div className="font-medium text-white">{ref.artifactType}</div>
                            <div className="break-all text-xs text-slate-400">
                              {ref.publishedItemId ? `Library item #${ref.publishedItemId}` : ref.storageRef ?? ref.contentHash ?? "verified output"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-white">Progress events</h3>
                    {detailQuery.data.events.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                        ยังไม่มี event
                      </div>
                    ) : (
                      <ol className="space-y-2">
                        {detailQuery.data.events.map((event) => (
                          <li key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-white">{event.message ?? event.phase ?? event.eventType}</div>
                                <div className="text-xs text-slate-400">{event.eventType}</div>
                              </div>
                              <div className="shrink-0 text-xs text-slate-400">{formatDate(event.createdAt)}</div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
