/**
 * VerticalDramaSeriesPage (spec feature 131, section 03 · §8.1–8.2).
 *
 * Feature-flagged Dashboard workspace entry: a series list (search/filter,
 * status chips, next-episode, last-edited, missing-approval badge, product
 * tie-in marker, Thai create button) plus the 6-step Create-Series Wizard that
 * runs in DRY-RUN mode — reaching Review and confirming creates a series shell
 * only and never triggers paid generation.
 *
 * The base series router (`trpc.verticalDramaSeries`) is wired into the tRPC
 * app router by the conductor; this page consumes `list` / `create`.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clapperboard,
  Loader2,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  pickCopy,
  seriesStatusCopy,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  wizardSteps,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const STATUS_FILTERS: Array<VerticalDramaSeriesStatus | "all"> = [
  "all",
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
];

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "completed") return "secondary";
  if (status === "archived" || status === "paused") return "outline";
  return "secondary";
}

function formatRelative(value: Date | string | null | undefined, lang: "th" | "en"): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function VerticalDramaSeriesPage() {
  const lang = useVerticalDramaLang();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VerticalDramaSeriesStatus | "all">("all");
  const [wizardOpen, setWizardOpen] = useState(false);

  const listQuery = trpc.verticalDramaSeries.list.useQuery(
    {
      search: search.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { staleTime: 30_000 },
  );

  const series = listQuery.data?.series ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6">
        {/* Header */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary">
              <Clapperboard className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">
                {pickCopy(lang, verticalDramaCopy.menuTitle)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {pickCopy(lang, verticalDramaCopy.planningOnly)}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            className="shrink-0 gap-2"
            aria-label={pickCopy(lang, verticalDramaCopy.createSeries)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.createSeries)}
          </Button>
        </header>

        {/* Search + status filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pickCopy(lang, verticalDramaCopy.searchPlaceholder)}
              aria-label={pickCopy(lang, verticalDramaCopy.searchPlaceholder)}
              className="pl-9"
            />
          </div>
          <div
            role="group"
            aria-label={pickCopy(lang, verticalDramaCopy.allStatuses)}
            className="flex flex-wrap gap-1.5"
          >
            {STATUS_FILTERS.map((status) => {
              const active = statusFilter === status;
              const label =
                status === "all"
                  ? pickCopy(lang, verticalDramaCopy.allStatuses)
                  : pickCopy(lang, seriesStatusCopy[status]);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* States: loading / error / empty / success */}
        {listQuery.isLoading ? (
          <SeriesListSkeleton />
        ) : listQuery.isError ? (
          <SeriesErrorState
            lang={lang}
            reason={listQuery.error?.message}
            onRetry={() => listQuery.refetch()}
          />
        ) : series.length === 0 ? (
          <SeriesEmptyState lang={lang} onCreate={() => setWizardOpen(true)} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {series.map((item) => (
              <li key={item.id}>
                <SeriesCard lang={lang} series={item} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateSeriesWizard
        open={wizardOpen}
        lang={lang}
        onOpenChange={setWizardOpen}
        onCreated={(seriesId) => {
          setWizardOpen(false);
          void listQuery.refetch();
          setLocation(verticalDramaRoutes.seriesDetail(seriesId));
        }}
      />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Series card                                                                */
/* -------------------------------------------------------------------------- */

interface SeriesListItem {
  id: string;
  title: string;
  status: string;
  nextEpisodeNumber: number;
  episodeCount: number;
  pendingApprovalCount: number;
  productTieInEnabled: boolean;
  updatedAt?: Date | string | null;
}

function SeriesCard({ lang, series }: { lang: "th" | "en"; series: SeriesListItem }) {
  const statusLabel =
    seriesStatusCopy[series.status as VerticalDramaSeriesStatus] != null
      ? pickCopy(lang, seriesStatusCopy[series.status as VerticalDramaSeriesStatus])
      : series.status;

  return (
    <Link href={verticalDramaRoutes.seriesDetail(series.id)}>
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="truncate text-base">{series.title}</CardTitle>
            <Badge variant={statusBadgeVariant(series.status)}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 text-muted-foreground">
            <div>
              <dt className="text-xs">{pickCopy(lang, verticalDramaCopy.nextEpisode)}</dt>
              <dd className="font-medium text-foreground">EP {series.nextEpisodeNumber}</dd>
            </div>
            <div>
              <dt className="text-xs">{pickCopy(lang, verticalDramaCopy.episodes)}</dt>
              <dd className="font-medium text-foreground">{series.episodeCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs">{pickCopy(lang, verticalDramaCopy.lastEdited)}</dt>
              <dd className="font-medium text-foreground">
                {formatRelative(series.updatedAt, lang)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {series.pendingApprovalCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {pickCopy(lang, verticalDramaCopy.missingApproval)} ({series.pendingApprovalCount})
              </Badge>
            )}
            {series.productTieInEnabled && (
              <Badge variant="outline" className="gap-1">
                <ShoppingBag className="h-3 w-3" aria-hidden="true" />
                {pickCopy(lang, verticalDramaCopy.productTieIn)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function SeriesListSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Card className="h-40">
            <CardContent className="flex h-full flex-col gap-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-auto h-6 w-24" />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SeriesEmptyState({ lang, onCreate }: { lang: "th" | "en"; onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">{pickCopy(lang, verticalDramaCopy.emptyTitle)}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {pickCopy(lang, verticalDramaCopy.emptyBody)}
        </p>
        <Button onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pickCopy(lang, verticalDramaCopy.createSeries)}
        </Button>
      </CardContent>
    </Card>
  );
}

function SeriesErrorState({
  lang,
  reason,
  onRetry,
}: {
  lang: "th" | "en";
  reason?: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-destructive/40">
      <CardContent
        role="alert"
        className="flex flex-col items-center gap-3 py-12 text-center"
      >
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{pickCopy(lang, verticalDramaCopy.errorTitle)}</h2>
        {reason && <p className="max-w-md text-sm text-muted-foreground">{reason}</p>}
        <Button variant="outline" onClick={onRetry}>
          {pickCopy(lang, verticalDramaCopy.retry)}
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Create-Series Wizard (6 steps, dry-run)                                    */
/* -------------------------------------------------------------------------- */

interface WizardState {
  title: string;
  genre: string;
  logline: string;
  targetEpisodeCount: string;
  locale: "th" | "en";
  targetDurationSeconds: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: string;
  visualBible: string;
  productTieInEnabled: boolean;
  productName: string;
  forbiddenClaims: string;
}

const INITIAL_WIZARD: WizardState = {
  title: "",
  genre: "",
  logline: "",
  targetEpisodeCount: "10",
  locale: "th",
  targetDurationSeconds: "60",
  mainPlot: "",
  seasonArc: "",
  tone: "",
  cliffhangerStyle: "",
  characters: "",
  visualBible: "",
  productTieInEnabled: false,
  productName: "",
  forbiddenClaims: "",
};

function CreateSeriesWizard({
  open,
  lang,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  lang: "th" | "en";
  onOpenChange: (open: boolean) => void;
  onCreated: (seriesId: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<WizardState>(INITIAL_WIZARD);

  const createMutation = trpc.verticalDramaSeries.create.useMutation({
    onSuccess: (data: { series: { id: string } }) => {
      toast.success(
        lang === "th" ? "สร้างโครงซีรีย์แล้ว (โหมดวางแผน)" : "Series shell created (planning mode)",
      );
      setForm(INITIAL_WIZARD);
      setStepIndex(0);
      onCreated(data.series.id);
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "สร้างไม่สำเร็จ" : "Create failed"));
    },
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Per-step validation gating (spec §8.2). Only step 1 has hard requirements;
  // the rest are progressive-disclosure optional so Next stays enabled.
  const stepValid = useMemo(() => {
    switch (stepIndex) {
      case 0:
        return form.title.trim().length > 0 && Number(form.targetEpisodeCount) > 0;
      default:
        return true;
    }
  }, [stepIndex, form]);

  const disabledReason =
    stepIndex === 0 && !stepValid
      ? lang === "th"
        ? "กรุณากรอกชื่อซีรีย์และจำนวนตอนที่ถูกต้อง"
        : "Enter a series title and a valid episode count to continue"
      : "";

  const isLast = stepIndex === wizardSteps.length - 1;

  const handleCreate = () => {
    if (createMutation.isPending) return;
    createMutation.mutate({
      title: form.title.trim(),
      locale: form.locale,
      genre: form.genre.trim() || undefined,
      tone: form.tone.trim() || undefined,
      targetEpisodeCount: Number(form.targetEpisodeCount) || undefined,
      defaultEpisodeDurationSeconds: Number(form.targetDurationSeconds) || undefined,
      bible:
        form.logline || form.mainPlot || form.seasonArc || form.visualBible
          ? {
              logline: form.logline,
              mainPlot: form.mainPlot,
              seasonArc: form.seasonArc,
              visualStyle: form.visualBible,
              cliffhangerStyle: form.cliffhangerStyle,
              charactersDraft: form.characters,
            }
          : undefined,
      productTieIn: form.productTieInEnabled
        ? {
            enabled: true,
            productName: form.productName || undefined,
            forbiddenClaims: form.forbiddenClaims
              ? form.forbiddenClaims.split(",").map((s) => s.trim()).filter(Boolean)
              : [],
          }
        : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pickCopy(lang, verticalDramaCopy.createSeries)}</DialogTitle>
          <DialogDescription>{pickCopy(lang, verticalDramaCopy.planningOnly)}</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex flex-wrap gap-1.5" aria-label="wizard steps">
          {wizardSteps.map((step, i) => (
            <li
              key={step.id}
              aria-current={i === stepIndex ? "step" : undefined}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                i === stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}. {pickCopy(lang, step)}
            </li>
          ))}
        </ol>

        <div className="min-h-[220px] py-2">
          <WizardStep stepIndex={stepIndex} lang={lang} form={form} set={set} />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button
                variant="outline"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={createMutation.isPending}
              >
                {pickCopy(lang, verticalDramaCopy.back)}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {disabledReason && (
              <span className="text-xs text-destructive" role="note">
                {disabledReason}
              </span>
            )}
            {isLast ? (
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {createMutation.isPending
                  ? lang === "th"
                    ? "กำลังสร้าง…"
                    : "Creating…"
                  : lang === "th"
                    ? "สร้างโครงซีรีย์"
                    : "Create series shell"}
              </Button>
            ) : (
              <Button
                onClick={() => setStepIndex((i) => Math.min(wizardSteps.length - 1, i + 1))}
                disabled={!stepValid}
                aria-disabled={!stepValid}
              >
                {lang === "th" ? "ถัดไป" : "Next"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WizardStep({
  stepIndex,
  lang,
  form,
  set,
}: {
  stepIndex: number;
  lang: "th" | "en";
  form: WizardState;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  const th = lang === "th";
  switch (stepIndex) {
    case 0:
      return (
        <div className="grid gap-4">
          <Field label={th ? "ชื่อซีรีย์ *" : "Series title *"}>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={th ? "แนวเรื่อง" : "Genre"}>
              <Input value={form.genre} onChange={(e) => set("genre", e.target.value)} />
            </Field>
            <Field label={th ? "จำนวนตอนเป้าหมาย" : "Target episode count"}>
              <Input
                type="number"
                min={1}
                value={form.targetEpisodeCount}
                onChange={(e) => set("targetEpisodeCount", e.target.value)}
              />
            </Field>
          </div>
          <Field label={th ? "เรื่องย่อ (logline)" : "Logline"}>
            <Textarea value={form.logline} onChange={(e) => set("logline", e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={th ? "ภาษา" : "Language"}>
              <Select value={form.locale} onValueChange={(v) => set("locale", v as "th" | "en")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="th">ไทย</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={th ? "ความยาวต่อตอน (วินาที)" : "Target duration (sec)"}>
              <Input
                type="number"
                min={1}
                value={form.targetDurationSeconds}
                onChange={(e) => set("targetDurationSeconds", e.target.value)}
              />
            </Field>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="grid gap-4">
          <Field label={th ? "โครงเรื่องหลัก" : "Main plot"}>
            <Textarea value={form.mainPlot} onChange={(e) => set("mainPlot", e.target.value)} rows={3} />
          </Field>
          <Field label={th ? "โครงซีซัน" : "Season arc"}>
            <Textarea value={form.seasonArc} onChange={(e) => set("seasonArc", e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={th ? "โทน" : "Tone"}>
              <Input value={form.tone} onChange={(e) => set("tone", e.target.value)} />
            </Field>
            <Field label={th ? "สไตล์ตอนจบค้าง (cliffhanger)" : "Cliffhanger style"}>
              <Input
                value={form.cliffhangerStyle}
                onChange={(e) => set("cliffhangerStyle", e.target.value)}
              />
            </Field>
          </div>
        </div>
      );
    case 2:
      return (
        <Field label={th ? "ตัวละคร / บทบาท / ความสัมพันธ์ (หนึ่งบรรทัดต่อหนึ่งตัว)" : "Characters / roles / relationships (one per line)"}>
          <Textarea value={form.characters} onChange={(e) => set("characters", e.target.value)} rows={6} />
        </Field>
      );
    case 3:
      return (
        <Field label={th ? "วิชวลไบเบิล / สไตล์ภาพ (ร่าง)" : "Visual bible / style notes (draft)"}>
          <Textarea value={form.visualBible} onChange={(e) => set("visualBible", e.target.value)} rows={6} />
        </Field>
      );
    case 4:
      return (
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.productTieInEnabled}
              onChange={(e) => set("productTieInEnabled", e.target.checked)}
            />
            {th ? "เปิดใช้สินค้าผูกเรื่อง (Product tie-in)" : "Enable product tie-in"}
          </label>
          {form.productTieInEnabled && (
            <>
              <Field label={th ? "ชื่อสินค้า" : "Product name"}>
                <Input value={form.productName} onChange={(e) => set("productName", e.target.value)} />
              </Field>
              <Field label={th ? "ข้อความต้องห้าม (คั่นด้วยจุลภาค)" : "Forbidden claims (comma-separated)"}>
                <Input
                  value={form.forbiddenClaims}
                  onChange={(e) => set("forbiddenClaims", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      );
    case 5:
    default:
      return (
        <div className="grid gap-3 text-sm">
          <p className="rounded-md bg-muted p-3 text-muted-foreground">
            {th
              ? "ตรวจสอบก่อนสร้าง: การกดสร้างจะสร้างเฉพาะโครงซีรีย์ (dry-run) เท่านั้น ยังไม่มีการสร้างสื่อที่มีค่าใช้จ่าย"
              : "Review before creating: confirming creates a series shell only (dry-run). No paid generation is triggered."}
          </p>
          <ReviewRow label={th ? "ชื่อ" : "Title"} value={form.title || "-"} />
          <ReviewRow label={th ? "แนวเรื่อง" : "Genre"} value={form.genre || "-"} />
          <ReviewRow
            label={th ? "จำนวนตอน" : "Episodes"}
            value={form.targetEpisodeCount || "-"}
          />
          <ReviewRow label={th ? "ภาษา" : "Language"} value={form.locale} />
          <ReviewRow
            label={th ? "สินค้าผูกเรื่อง" : "Product tie-in"}
            value={
              form.productTieInEnabled
                ? form.productName || (th ? "เปิดใช้งาน" : "Enabled")
                : th
                  ? "ไม่มี"
                  : "None"
            }
          />
        </div>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
