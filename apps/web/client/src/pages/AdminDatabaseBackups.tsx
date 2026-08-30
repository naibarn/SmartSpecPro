import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileJson,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type BackupMode = "safe" | "full";
type BackupStatus = "queued" | "running" | "completed" | "failed" | "expired";

function formatBytes(value: number | null): string {
  if (!value || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusClass(status: BackupStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "expired":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

export default function AdminDatabaseBackups() {
  const [, setLocation] = useLocation();
  const { t } = useScopedTranslation("admin");
  const [mode, setMode] = useState<BackupMode>("safe");
  const [confirmedFullExport, setConfirmedFullExport] = useState(false);
  const jobsQuery = trpc.databaseBackups.list.useQuery(
    { limit: 20 },
    {
      refetchInterval: query => {
        const jobs = query.state.data ?? [];
        return jobs.some(
          job => job.status === "queued" || job.status === "running"
        )
          ? 2_000
          : 15_000;
      },
    }
  );
  const utils = trpc.useUtils();
  const createMutation = trpc.databaseBackups.create.useMutation({
    onSuccess: () => {
      toast.success(t("admin.databaseBackups.created"));
      setConfirmedFullExport(false);
      void utils.databaseBackups.list.invalidate();
    },
    onError: error =>
      toast.error(error.message || t("admin.databaseBackups.createFailed")),
  });
  const jobs = jobsQuery.data ?? [];
  const hasActiveJob = useMemo(
    () => jobs.some(job => job.status === "queued" || job.status === "running"),
    [jobs]
  );

  const createBackup = () => {
    createMutation.mutate({ mode, confirmedFullExport });
  };

  return (
    <main className="min-h-screen bg-slate-50/70 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setLocation("/admin/dashboard")}
              aria-label={t("admin.databaseBackups.backToDashboard")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("admin.databaseBackups.commandCenter")}
            </Button>
            <div className="hidden h-7 w-px bg-border sm:block" />
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Database className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                  {t("admin.databaseBackups.eyebrow")}
                </p>
                <h1 className="truncate text-xl font-bold sm:text-2xl">
                  {t("admin.databaseBackups.title")}
                </h1>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void jobsQuery.refetch()}
            disabled={jobsQuery.isFetching}
          >
            {jobsQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("admin.databaseBackups.refresh")}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <DashboardCard
          title={t("admin.databaseBackups.createTitle")}
          description={t("admin.databaseBackups.createDescription")}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-900">
                {t("admin.databaseBackups.modeLabel")}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`cursor-pointer rounded-2xl border p-4 transition-colors ${mode === "safe" ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="backup-mode"
                      value="safe"
                      checked={mode === "safe"}
                      onChange={() => setMode("safe")}
                      className="mt-1 h-4 w-4 accent-sky-600"
                    />
                    <span>
                      <span className="flex items-center gap-2 font-semibold text-slate-900">
                        <ShieldAlert
                          className="h-4 w-4 text-emerald-600"
                          aria-hidden="true"
                        />
                        {t("admin.databaseBackups.safeMode")}
                      </span>
                      <span className="mt-1 block text-sm text-slate-600">
                        {t("admin.databaseBackups.safeModeDescription")}
                      </span>
                    </span>
                  </span>
                </label>
                <label
                  className={`cursor-pointer rounded-2xl border p-4 transition-colors ${mode === "full" ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="backup-mode"
                      value="full"
                      checked={mode === "full"}
                      onChange={() => setMode("full")}
                      className="mt-1 h-4 w-4 accent-rose-600"
                    />
                    <span>
                      <span className="flex items-center gap-2 font-semibold text-slate-900">
                        <AlertTriangle
                          className="h-4 w-4 text-rose-600"
                          aria-hidden="true"
                        />
                        {t("admin.databaseBackups.fullMode")}
                      </span>
                      <span className="mt-1 block text-sm text-slate-600">
                        {t("admin.databaseBackups.fullModeDescription")}
                      </span>
                    </span>
                  </span>
                </label>
              </div>
              {mode === "full" ? (
                <label className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <input
                    type="checkbox"
                    checked={confirmedFullExport}
                    onChange={event =>
                      setConfirmedFullExport(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-rose-600"
                  />
                  <span>{t("admin.databaseBackups.fullConfirmation")}</span>
                </label>
              ) : null}
            </fieldset>
            <Button
              type="button"
              size="lg"
              onClick={createBackup}
              disabled={
                createMutation.isPending ||
                (mode === "full" && !confirmedFullExport)
              }
              className="w-full lg:w-auto"
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              {t("admin.databaseBackups.createButton")}
            </Button>
          </div>
          {hasActiveJob ? (
            <p
              className="mt-4 flex items-center gap-2 text-sm text-amber-700"
              role="status"
            >
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {t("admin.databaseBackups.activeJobHint")}
            </p>
          ) : null}
        </DashboardCard>

        <DashboardCard
          title={t("admin.databaseBackups.historyTitle")}
          description={t("admin.databaseBackups.historyDescription")}
        >
          {jobsQuery.isLoading ? (
            <div
              className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("admin.databaseBackups.loading")}
            </div>
          ) : jobsQuery.isError ? (
            <div
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800"
              role="alert"
            >
              {t("admin.databaseBackups.loadFailed")}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-muted-foreground">
              {t("admin.databaseBackups.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <article
                  key={job.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900">
                          {formatDate(job.createdAt)}
                        </h2>
                        <Badge
                          variant="outline"
                          className={statusClass(job.status as BackupStatus)}
                        >
                          {t(`admin.databaseBackups.status.${job.status}`)}
                        </Badge>
                        <Badge variant="outline">
                          {job.mode === "full"
                            ? t("admin.databaseBackups.fullMode")
                            : t("admin.databaseBackups.safeMode")}
                        </Badge>
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {job.id}
                      </p>
                    </div>
                    <div className="text-left text-xs text-muted-foreground sm:text-right">
                      <p>
                        {t("admin.databaseBackups.expiresAt")}:{" "}
                        {formatDate(job.expiresAt)}
                      </p>
                      {job.status === "completed" ? (
                        <p className="mt-1">
                          {t("admin.databaseBackups.ready")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {job.status === "failed" ? (
                    <p
                      className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
                      role="alert"
                    >
                      <XCircle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      {job.errorMessage ||
                        t("admin.databaseBackups.genericFailure")}
                    </p>
                  ) : null}
                  {job.status === "expired" ? (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                      <Clock3
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      {t("admin.databaseBackups.expiredDescription")}
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DownloadCard
                      title={t("admin.databaseBackups.databaseZip")}
                      icon={Database}
                      size={formatBytes(job.databaseZipBytes)}
                      href={job.databaseDownloadUrl}
                      disabled={
                        job.status !== "completed" || !job.databaseDownloadUrl
                      }
                      downloadLabel={t(
                        "admin.databaseBackups.downloadDatabase"
                      )}
                    />
                    <DownloadCard
                      title={t("admin.databaseBackups.applicationZip")}
                      icon={FileJson}
                      size={formatBytes(job.applicationZipBytes)}
                      href={job.applicationDownloadUrl}
                      disabled={
                        job.status !== "completed" ||
                        !job.applicationDownloadUrl
                      }
                      downloadLabel={t(
                        "admin.databaseBackups.downloadApplication"
                      )}
                    />
                  </div>
                  {job.status === "completed" ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {t("admin.databaseBackups.checksumReady")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </main>
  );
}

function DownloadCard({
  title,
  icon: Icon,
  size,
  href,
  disabled,
  downloadLabel,
}: {
  title: string;
  icon: typeof Database;
  size: string;
  href: string | null;
  disabled: boolean;
  downloadLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{title}</p>
          <p className="text-xs text-muted-foreground">{size}</p>
        </div>
      </div>
      {disabled || !href ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          aria-disabled="true"
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          {downloadLabel}
        </Button>
      ) : (
        <Button asChild type="button" variant="outline" size="sm">
          <a href={href} download>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {downloadLabel}
          </a>
        </Button>
      )}
    </div>
  );
}
