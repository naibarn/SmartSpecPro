import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Film,
  Loader2,
  Package,
  Sparkles,
  Square,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { StagedCheckpointReviewSurface } from "@/components/marketplaceCapture/StagedCheckpointReviewSurface";
import { MarketplaceAutoReviewJobNavigator } from "@/components/marketplaceCapture/MarketplaceAutoReviewJobNavigator";
import { MarketplaceAutoReviewLegacyDetails } from "@/components/marketplaceCapture/MarketplaceAutoReviewLegacyDetails";
import { trpc } from "@/lib/trpc";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function statusLabel(status: unknown, isStaged = false) {
  switch (String(status ?? "")) {
    case "completed":
      return "เสร็จสมบูรณ์";
    case "failed":
      return "ต้องตรวจสอบข้อผิดพลาด";
    case "cancelled":
      return "ยกเลิกแล้ว";
    case "waiting_provider":
      return "รอผลจากผู้ให้บริการ";
    case "queued":
      return "รอเริ่มงาน";
    case "running":
      return isStaged ? "รอ user ตรวจ/ยืนยัน" : "กำลังทำงาน";
    default:
      return "กำลังโหลดสถานะ";
  }
}

function statusClass(status: unknown, isStaged = false) {
  switch (String(status ?? "")) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-800";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "waiting_provider":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "running":
      return isStaged
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-violet-200 bg-violet-50 text-violet-800";
  }
}

function stageLabel(stage: unknown) {
  switch (String(stage ?? "")) {
    case "concept_story":
      return "ตรวจเนื้อเรื่อง";
    case "prompt_plan":
      return "ตรวจ Prompt ภาพ";
    case "storyboard_review":
      return "Storyboard Review / ผลภาพ";
    case "video_generation":
      return "ตรวจ Prompt/ผลวิดีโอ";
    case "audio_generation":
      return "ตรวจแผนเสียง";
    case "render":
      return "ยืนยันการประกอบ";
    default:
      return String(stage || "รอระบบเลือกขั้นตอน");
  }
}

function safeOutputLinks(run: Record<string, any> | undefined) {
  const links = Array.isArray(run?.outputLinks) ? run.outputLinks : [];
  return links.filter(
    (link: any) => typeof link?.url === "string" && link.url.length > 0
  );
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function MarketplaceAutoReviewWorkflowPage() {
  const [, params] = useRoute("/marketplace/auto-review/:runId");
  const [, setLocation] = useLocation();
  const runId = params?.runId ?? "";
  const runQuery = trpc.marketplaceCapture.getAutoReviewRun.useQuery(
    { runId },
    {
      enabled: Boolean(runId),
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 0,
      refetchInterval: query => {
        const status = (query.state.data as any)?.status;
        return status && TERMINAL_STATUSES.has(String(status)) ? false : 5000;
      },
    }
  );
  const run = runQuery.data as Record<string, any> | undefined;
  const metadata =
    run?.metadataJson && typeof run.metadataJson === "object"
      ? (run.metadataJson as Record<string, any>)
      : {};
  const isStaged = metadata.planningArchitecture === "staged_two_skill_v2";
  const creditSummary =
    run?.creditSummary && typeof run.creditSummary === "object"
      ? run.creditSummary
      : metadata.creditSummary && typeof metadata.creditSummary === "object"
        ? metadata.creditSummary
        : {};
  const productId = typeof run?.productId === "string" ? run.productId : "";
  const jobsQuery = trpc.marketplaceCapture.listAutoReviewRuns.useQuery(
    { productId, limit: 50, summary: true },
    {
      enabled: Boolean(productId),
      refetchOnWindowFocus: true,
      staleTime: 10_000,
      refetchInterval: query => {
        const runs = (query.state.data as any[]) ?? [];
        return runs.some(item => !TERMINAL_STATUSES.has(String(item?.status)))
          ? 10_000
          : 30_000;
      },
    }
  );
  const productQuery = trpc.marketplaceCapture.getProduct.useQuery(
    { productId },
    { enabled: Boolean(productId), retry: false, staleTime: 60_000 }
  );
  const product = (productQuery.data as any)?.product ?? productQuery.data;
  const productName =
    typeof product?.title === "string"
      ? product.title
      : typeof product?.name === "string"
        ? product.name
        : "Marketplace product";
  const outputLinks = safeOutputLinks(run);
  const storyboardLink =
    outputLinks.find((link: any) => link.kind === "storyboard_review") ?? null;
  const videoEditorLink =
    outputLinks.find((link: any) => link.kind === "video_editor") ?? null;
  const status = String(run?.status ?? "");
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelMutation =
    trpc.marketplaceCapture.cancelAutoReviewRun.useMutation({
      onSuccess: async () => {
        setCancelArmed(false);
        setCancelError(null);
        await runQuery.refetch();
      },
      onError: error => setCancelError(error.message),
    });
  const canCancel = Boolean(
    runId && !TERMINAL_STATUSES.has(status) && !cancelMutation.isPending
  );
  const [legacyRegeneratingShotId, setLegacyRegeneratingShotId] = useState<
    number | null
  >(null);
  const [legacySavingShotId, setLegacySavingShotId] = useState<number | null>(
    null
  );
  const [legacySwappingShotId, setLegacySwappingShotId] = useState<
    number | null
  >(null);
  const [legacyShotError, setLegacyShotError] = useState<{
    shotId: number;
    blockerId: string;
    message: string;
  } | null>(null);
  const regenerateLegacyShotMutation =
    trpc.marketplaceCapture.regenerateAutoReviewSequentialShot.useMutation({
      onSuccess: async () => {
        setLegacyShotError(null);
        await runQuery.refetch();
      },
      onError: (error, variables) => {
        setLegacyShotError({
          shotId: variables.shotId,
          blockerId: "sequential_shot_regeneration_failed",
          message: error.message,
        });
      },
      onSettled: () => setLegacyRegeneratingShotId(null),
    });
  const saveLegacyShotMutation =
    trpc.marketplaceCapture.saveAutoReviewSequentialShotOverride.useMutation({
      onSuccess: async () => {
        setLegacyShotError(null);
        await runQuery.refetch();
      },
      onError: (error, variables) => {
        const blocker = /\[ids:\s*([^,\]]+)/.exec(error.message);
        setLegacyShotError({
          shotId: variables.shotId,
          blockerId: blocker?.[1]?.trim() || "sequential_shot_override_failed",
          message: error.message,
        });
      },
      onSettled: () => setLegacySavingShotId(null),
    });
  const selectLegacyShotAlternateMutation =
    trpc.marketplaceCapture.selectAutoReviewSequentialShotAlternate.useMutation(
      {
        onSuccess: async () => {
          setLegacyShotError(null);
          await runQuery.refetch();
        },
        onError: (error, variables) => {
          setLegacyShotError({
            shotId: variables.shotId,
            blockerId: "sequential_shot_alternate_swap_failed",
            message: error.message,
          });
        },
        onSettled: () => setLegacySwappingShotId(null),
      }
    );

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.08),_transparent_42%),#f8fafc] px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav
          aria-label="เส้นทางงาน"
          className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"
        >
          <button
            type="button"
            className="transition hover:text-slate-950"
            onClick={() => setLocation("/marketplace-capture")}
          >
            Marketplace Capture
          </button>
          <span aria-hidden="true">/</span>
          {productId ? (
            <button
              type="button"
              className="max-w-[15rem] truncate transition hover:text-slate-950"
              onClick={() =>
                setLocation(
                  `/marketplace-capture/products/${encodeURIComponent(productId)}`
                )
              }
            >
              {productName}
            </button>
          ) : null}
          {productId ? <span aria-hidden="true">/</span> : null}
          <span className="font-medium text-slate-700">Job Workbench</span>
        </nav>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <MarketplaceAutoReviewJobNavigator
            runs={(jobsQuery.data as any[]) ?? []}
            selectedRunId={runId}
            loading={jobsQuery.isFetching}
            error={jobsQuery.error?.message ?? null}
            productId={productId}
            onOpenRun={nextRunId =>
              setLocation(
                `/marketplace/auto-review/${encodeURIComponent(nextRunId)}`
              )
            }
            onCreateNew={() => {
              if (productId) {
                setLocation(
                  `/marketplace/auto-review/new/${encodeURIComponent(productId)}`
                );
              }
            }}
            className="order-2 xl:order-1 xl:sticky xl:top-4 xl:h-[calc(100dvh-2rem)] xl:min-h-0"
          />
          <div className="min-w-0 order-1 xl:order-2">
            <header className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl shadow-violet-950/10">
              <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-7">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-lg text-sm text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    onClick={() =>
                      setLocation(
                        productId
                          ? `/marketplace-capture/products/${encodeURIComponent(productId)}`
                          : "/marketplace-capture"
                      )
                    }
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> กลับไปหน้าสินค้า
                  </button>
                  <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
                    <Sparkles className="h-4 w-4" /> Marketplace Auto Review
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Job Workbench
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    พื้นที่ทำงานสำหรับตรวจและยืนยันทีละ checkpoint
                    ก่อนใช้เครดิตขั้นถัดไป แก้ไขงานเดิมหรือกลับมาต่อได้จาก run
                    นี้โดยไม่ต้องเริ่มใหม่
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                      <Package className="h-3.5 w-3.5" /> {productName}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                      Run {runId}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                      ขั้นตอน {stageLabel(run?.currentStage)}
                    </span>
                  </div>
                </div>
                <div className="flex min-w-[13rem] flex-col items-start gap-3 sm:items-end">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${statusClass(status, isStaged)}`}
                  >
                    {status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-current" />
                    )}
                    {statusLabel(status, isStaged)}
                  </span>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {storyboardLink ? (
                      <a
                        className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                        href={storyboardLink.url}
                      >
                        <Film className="mr-1.5 h-4 w-4" />
                        ไป Storyboard Review
                      </a>
                    ) : null}
                    {videoEditorLink ? (
                      <a
                        className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                        href={videoEditorLink.url}
                      >
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        เปิด Video Editor
                      </a>
                    ) : null}
                    {canCancel && !cancelArmed ? (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center rounded-lg border border-red-300/60 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-60"
                        onClick={() => {
                          setCancelError(null);
                          setCancelArmed(true);
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        <Square className="mr-1.5 h-4 w-4" />
                        หยุดงาน
                      </button>
                    ) : null}
                    {canCancel && cancelArmed ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-300/50 bg-red-950/60 p-2 text-xs text-red-100">
                        <span>หยุดถาวรและคืนเครดิตที่ยังค้างกับ provider</span>
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center rounded-md bg-red-500 px-3 py-1.5 font-semibold text-white hover:bg-red-400 disabled:opacity-60"
                          onClick={() => cancelMutation.mutate({ runId })}
                          disabled={cancelMutation.isPending}
                        >
                          <Square className="mr-1.5 h-3.5 w-3.5" />
                          {cancelMutation.isPending
                            ? "กำลังหยุดงาน…"
                            : "ยืนยันหยุดงาน"}
                        </button>
                        <button
                          type="button"
                          className="min-h-9 rounded-md px-3 py-1.5 text-red-100 hover:bg-white/10 disabled:opacity-60"
                          onClick={() => setCancelArmed(false)}
                          disabled={cancelMutation.isPending}
                        >
                          กลับ
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {cancelError ? (
                    <p
                      className="mt-2 max-w-sm text-right text-xs text-red-300"
                      role="alert"
                    >
                      หยุดงานไม่สำเร็จ: {cancelError}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="border-t border-white/10 bg-white/[0.04] px-5 py-3 text-xs text-slate-300 sm:px-7">
                <span className="font-medium text-white">ลำดับการทำงาน:</span>{" "}
                ตรวจเนื้อเรื่อง → Prompt ภาพ → ผลภาพ → Prompt วิดีโอ → ผลวิดีโอ
                → เสียง → การประกอบ
              </div>
            </header>
            <section
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              aria-label="สรุปการทำงานและเครดิต"
            >
              <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  1 · ตรวจ
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  อ่านเนื้อหาและ Prompt ให้ตรงเป้าหมาย
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  2 · ยืนยัน
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  กดยืนยันเฉพาะ checkpoint ที่พร้อมใช้เครดิต
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  3 · ส่งต่อ
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  เมื่อ output พร้อม จึงไปแก้ละเอียดต่อใน Storyboard Review
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  เครดิต
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  ใช้แล้ว {numeric(creditSummary.spentCredits)} · คืนแล้ว{" "}
                  {numeric(creditSummary.refundedCredits)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  คงค้าง {numeric(creditSummary.outstandingCredits)} ·
                  checkpoint ถัดไปจะแสดงค่าใช้จ่ายก่อนยืนยัน
                </p>
              </div>
            </section>
            {runQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border bg-white p-4 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดงานตรวจสอบ…
              </div>
            ) : null}
            {runQuery.error ? (
              <p
                className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                role="alert"
              >
                {runQuery.error.message}
              </p>
            ) : null}
            {!runQuery.isLoading && !runQuery.error && run && !isStaged ? (
              <MarketplaceAutoReviewLegacyDetails
                run={run}
                productName={productName}
                busyShotId={legacyRegeneratingShotId}
                savingShotId={legacySavingShotId}
                swappingShotId={legacySwappingShotId}
                shotError={legacyShotError}
                onRegenerateShot={shotId => {
                  if (!runId) return;
                  setLegacyShotError(null);
                  setLegacyRegeneratingShotId(shotId);
                  regenerateLegacyShotMutation.mutate({ runId, shotId });
                }}
                onSaveShotEdits={input => {
                  if (!runId) return;
                  setLegacyShotError(null);
                  setLegacySavingShotId(input.shotId);
                  saveLegacyShotMutation.mutate({
                    runId,
                    shotId: input.shotId,
                    dialogue: input.dialogue,
                    startFrameImagePrompt: input.imagePrompt,
                    videoPrompt: input.videoPrompt,
                  });
                }}
                onSelectShotAlternate={input => {
                  if (!runId) return;
                  setLegacyShotError(null);
                  setLegacySwappingShotId(input.shotId);
                  selectLegacyShotAlternateMutation.mutate({
                    runId,
                    shotId: input.shotId,
                    attempt: input.attempt,
                  });
                }}
                onCreateStaged={() => {
                  if (productId) {
                    setLocation(
                      `/marketplace/auto-review/new/${encodeURIComponent(productId)}`
                    );
                  }
                }}
              />
            ) : null}
            <StagedCheckpointReviewSurface
              runId={runId}
              enabled={isStaged}
              className="mt-4"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
