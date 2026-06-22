import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">งานเรนเดอร์ของฉัน</h1>
          <p className="text-sm text-muted-foreground">
            ติดตามงาน worker ที่คุณส่งไว้ ดูความคืบหน้าและผลลัพธ์ที่ผ่านการตรวจสอบแล้ว
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-44">
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
          >
            <RefreshCw className={cn("h-4 w-4", listQuery.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">ทั้งหมดในหน้านี้</div>
          <div className="text-2xl font-semibold">{jobs.length}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">กำลังทำงาน</div>
          <div className="text-2xl font-semibold">{activeCount}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">รอ worker</div>
          <div className="text-2xl font-semibold">{jobs.filter((job) => job.status === "queued").length}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">สำเร็จ</div>
          <div className="text-2xl font-semibold">{jobs.filter((job) => job.status === "completed").length}</div>
        </div>
      </div>

      {listQuery.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          โหลดรายการงานไม่สำเร็จ: {listQuery.error.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">รายการงาน</h2>
          </div>

          {listQuery.isLoading ? (
            <div className="flex min-h-56 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              กำลังโหลดงาน
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              ยังไม่มีงานในสถานะนี้
            </div>
          ) : (
            <>
              <div className="hidden md:block">
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
                        className={cn("cursor-pointer", selectedJob === job.id && "bg-muted/60")}
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{job.jobType}</div>
                          <div className="max-w-52 truncate text-xs text-muted-foreground">{job.id}</div>
                        </TableCell>
                        <TableCell><JobStatusBadge status={job.status} /></TableCell>
                        <TableCell>
                          {job.worker?.displayName ?? "ยังไม่ assign"}
                          {job.worker?.machineName ? (
                            <div className="text-xs text-muted-foreground">{job.worker.machineName}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-56 truncate text-sm">
                            {job.latestEvent?.message ?? job.latestEvent?.phase ?? job.latestEvent?.eventType ?? "-"}
                          </div>
                          {typeof job.latestEvent?.progressPercent === "number" ? (
                            <div className="text-xs text-muted-foreground">{job.latestEvent.progressPercent}%</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
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
                      "rounded-lg border p-3 text-left",
                      selectedJob === job.id && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{job.jobType}</span>
                      <JobStatusBadge status={job.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</div>
                    <div className="mt-2 truncate text-sm">
                      {job.latestEvent?.message ?? job.latestEvent?.eventType ?? "ยังไม่มี progress event"}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">รายละเอียดงาน</h2>
          </div>

          {!selectedJob ? (
            <div className="p-4 text-sm text-muted-foreground">เลือกงานเพื่อดูรายละเอียด</div>
          ) : detailQuery.isLoading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              กำลังโหลดรายละเอียด
            </div>
          ) : detailQuery.isError ? (
            <div className="p-4 text-sm text-destructive">{detailQuery.error.message}</div>
          ) : detailQuery.data ? (
            <div className="space-y-5 p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{detailQuery.data.jobType}</div>
                    <div className="truncate text-xs text-muted-foreground">{detailQuery.data.id}</div>
                  </div>
                  <JobStatusBadge status={detailQuery.data.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">เริ่ม</div>
                    {formatDate(detailQuery.data.startedAt)}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">จบ</div>
                    {formatDate(detailQuery.data.finishedAt)}
                  </div>
                </div>
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Worker</div>
                  {detailQuery.data.worker?.displayName ?? "ยังไม่มี worker รับงาน"}
                  {detailQuery.data.worker?.status ? (
                    <span className="ml-2 text-xs text-muted-foreground">({detailQuery.data.worker.status})</span>
                  ) : null}
                </div>
              </div>

              {detailQuery.data.failureReason ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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
                    <Button variant="outline" size="sm">เปิดงานต้นทาง</Button>
                  </Link>
                ) : null}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">ผลลัพธ์ที่ตรวจสอบแล้ว</h3>
                {detailQuery.data.outputRefs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">ยังไม่มี output ที่ผ่านการตรวจสอบ</div>
                ) : (
                  <div className="space-y-2">
                    {detailQuery.data.outputRefs.map((ref, index) => (
                      <div key={`${ref.artifactId ?? ref.publishedItemId ?? index}`} className="rounded-md border p-3 text-sm">
                        <div className="font-medium">{ref.artifactType}</div>
                        <div className="break-all text-xs text-muted-foreground">
                          {ref.publishedItemId ? `Library item #${ref.publishedItemId}` : ref.storageRef ?? ref.contentHash ?? "verified output"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Progress events</h3>
                {detailQuery.data.events.length === 0 ? (
                  <div className="text-sm text-muted-foreground">ยังไม่มี event</div>
                ) : (
                  <ol className="space-y-2">
                    {detailQuery.data.events.map((event) => (
                      <li key={event.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{event.message ?? event.phase ?? event.eventType}</div>
                            <div className="text-xs text-muted-foreground">{event.eventType}</div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">{formatDate(event.createdAt)}</div>
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
    </main>
  );
}
