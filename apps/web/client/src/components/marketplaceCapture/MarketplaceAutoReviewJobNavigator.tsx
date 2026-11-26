import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CircleCheck,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  AuthenticatedMediaImage,
  AuthenticatedMediaVideo,
  getAuthenticatedMediaUrl,
} from "@/components/media/AuthenticatedMediaImage";

export type MarketplaceAutoReviewJobSummary = Record<string, any>;

interface MarketplaceAutoReviewJobNavigatorProps {
  runs: MarketplaceAutoReviewJobSummary[];
  selectedRunId?: string | null;
  loading?: boolean;
  error?: string | null;
  productId?: string;
  productName?: string;
  productOptions?: { productId: string; productName: string | null }[];
  selectedProductFilter?: string;
  onProductFilterChange?: (productId: string) => void;
  allProducts?: boolean;
  /** Use the light Marketplace treatment for the full job-history page. */
  appearance?: "dark" | "light";
  /** Use a larger product image in the full job-history listing. */
  largeProductThumbnails?: boolean;
  setupMode?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onOpenRun: (runId: string) => void;
  /** Open job links in a separate tab, preserving the current navigator state. */
  openRunsInNewTab?: boolean;
  onCreateNew: () => void;
  /** Refresh the source run data once after a media URL fails to load. */
  onMediaLoadError?: () => void;
  onLoadMore?: () => void;
  /** Delete one job. Omit to hide the affordance entirely (read-only mounts).
   *  Dependent rows cascade server-side; already-generated media stays in the
   *  user's Media library. */
  onDeleteRun?: (runId: string) => void;
  /** Run id currently being deleted, for the row's spinner. */
  deletingRunId?: string | null;
  className?: string;
}

function text(...values: unknown[]): string {
  return (
    values
      .find(value => typeof value === "string" && value.trim())
      ?.toString()
      .trim() ?? ""
  );
}

function runTimestamp(run: MarketplaceAutoReviewJobSummary): number {
  const value = run.createdAt ?? run.updatedAt;
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortMarketplaceAutoReviewRunsNewestFirst(
  runs: MarketplaceAutoReviewJobSummary[]
): MarketplaceAutoReviewJobSummary[] {
  return [...runs].sort((left, right) => {
    const timestampDelta = runTimestamp(right) - runTimestamp(left);
    if (timestampDelta !== 0) return timestampDelta;

    // Keep the ordering deterministic when old rows have no timestamp or the
    // provider returned the same timestamp for multiple jobs.
    return text(right.id, right.productionRunId).localeCompare(
      text(left.id, left.productionRunId)
    );
  });
}

function isStagedRun(run: MarketplaceAutoReviewJobSummary): boolean {
  return (
    text(
      run.metadataJson?.planningArchitecture,
      run.planningArchitecture,
      run.apiProjection?.metadataJson?.planningArchitecture
    ) === "staged_two_skill_v2"
  );
}

function currentStageStatus(run: MarketplaceAutoReviewJobSummary): string {
  const currentStage = text(run.currentStage);
  const stage = Array.isArray(run.stages)
    ? run.stages.find((item: any) => text(item?.stageKey) === currentStage)
    : null;
  return text(stage?.status, run.statusDetail?.status);
}

function statusDetailState(run: MarketplaceAutoReviewJobSummary): string {
  return text(
    run.statusDetail?.state,
    run.apiProjection?.statusDetail?.state,
    run.metadataJson?.statusDetail?.state
  );
}

function isWaitingForUser(run: MarketplaceAutoReviewJobSummary): boolean {
  if (!isStagedRun(run)) return false;
  const stageStatus = currentStageStatus(run);
  const detailState = statusDetailState(run);
  return (
    ["blocked_needs_user", "blocked", "qa_pending"].includes(stageStatus) ||
    detailState.includes("awaiting_")
  );
}

function stagedProgress(run: MarketplaceAutoReviewJobSummary) {
  const progress = run.metadataJson?.stagedProgress;
  if (!progress || typeof progress !== "object") return null;
  const total = Number(progress.totalShots);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    total,
    imagePromptsReady: Number(progress.imagePromptsReady) || 0,
    imageArtifactsReady: Number(progress.imageArtifactsReady) || 0,
    imageTasksInFlight: Number(progress.imageTasksInFlight) || 0,
    videoArtifactsReady: Number(progress.videoArtifactsReady) || 0,
    videoTasksInFlight: Number(progress.videoTasksInFlight) || 0,
    missingVideoShotIds: Array.isArray(progress.missingVideoShotIds)
      ? progress.missingVideoShotIds
          .map((shotId: unknown) => Number(shotId))
          .filter(
            (shotId: number) => Number.isSafeInteger(shotId) && shotId > 0
          )
      : [],
  };
}

function hasMissingShotVideo(run: MarketplaceAutoReviewJobSummary): boolean {
  const progress = stagedProgress(run);
  return Boolean(
    progress &&
    (progress.videoArtifactsReady < progress.total ||
      progress.missingVideoShotIds.length > 0)
  );
}

function statusPresentation(run: MarketplaceAutoReviewJobSummary) {
  const currentStage = text(run.currentStage);
  const progress = stagedProgress(run);
  if (
    progress &&
    ["image_generation", "storyboard_review"].includes(currentStage)
  ) {
    if (progress.imageTasksInFlight > 0) {
      return {
        label: `กำลังสร้างภาพ ${progress.imageArtifactsReady}/${progress.total}`,
        className: "border-violet-200 bg-violet-50 text-violet-800",
        Icon: Loader2,
      };
    }
    if (progress.imagePromptsReady < progress.total) {
      return {
        label: `รอ Prompt ภาพ ${progress.imagePromptsReady}/${progress.total}`,
        className: "border-amber-200 bg-amber-50 text-amber-800",
        Icon: Clock3,
      };
    }
    if (progress.imageArtifactsReady < progress.total) {
      return {
        label: `รอสร้างภาพ ${progress.imageArtifactsReady}/${progress.total}`,
        className: "border-sky-200 bg-sky-50 text-sky-800",
        Icon: Clock3,
      };
    }
    if (isWaitingForUser(run)) {
      return {
        label: `รอตรวจภาพ ${progress.imageArtifactsReady}/${progress.total}`,
        className: "border-amber-200 bg-amber-50 text-amber-800",
        Icon: Clock3,
      };
    }
  }
  if (isWaitingForUser(run)) {
    return {
      label: "รอตรวจ/ยืนยัน",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      Icon: Clock3,
    };
  }
  switch (text(run.status)) {
    case "completed":
      return {
        label: "เสร็จแล้ว",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        Icon: CheckCircle2,
      };
    case "failed":
      return {
        label: "ต้องแก้ไข",
        className: "border-red-200 bg-red-50 text-red-800",
        Icon: AlertTriangle,
      };
    case "cancelled":
      return {
        label: "ยกเลิกแล้ว",
        className: "border-slate-200 bg-slate-100 text-slate-700",
        Icon: AlertTriangle,
      };
    case "queued":
      return {
        label: "รอเริ่มงาน",
        className: "border-sky-200 bg-sky-50 text-sky-800",
        Icon: Clock3,
      };
    case "waiting_provider":
      return {
        label: "รอผู้ให้บริการ",
        className: "border-violet-200 bg-violet-50 text-violet-800",
        Icon: Clock3,
      };
    case "running":
      return {
        label: "กำลังทำงาน",
        className: "border-violet-200 bg-violet-50 text-violet-800",
        Icon: Loader2,
      };
    default:
      return {
        label: "กำลังโหลด",
        className: "border-slate-200 bg-slate-50 text-slate-700",
        Icon: Clock3,
      };
  }
}

function stagedStageLabel(run: MarketplaceAutoReviewJobSummary): string {
  const progress = stagedProgress(run);
  const stage = text(run.currentStage);
  if (
    progress &&
    ["image_generation", "storyboard_review"].includes(stage) &&
    progress.imagePromptsReady >= progress.total &&
    progress.imageArtifactsReady < progress.total
  ) {
    return "สร้างภาพรายช็อต";
  }
  return stageLabel(stage);
}

function stageLabel(stage: unknown): string {
  switch (text(stage)) {
    case "product_preflight":
      return "ตรวจข้อมูลสินค้า";
    case "concept_story":
      return "ตรวจเนื้อเรื่อง";
    case "prompt_plan":
      return "ตรวจ Prompt ภาพ";
    case "image_generation":
      return "สร้างภาพรายช็อต";
    case "storyboard_review":
      return "Storyboard Review / ผลภาพ";
    case "video_generation":
      return "ตรวจวิดีโอ";
    case "audio_generation":
      return "ตรวจเสียง";
    case "render":
      return "ยืนยันการประกอบ";
    default:
      return text(stage) || "รอเลือกขั้นตอน";
  }
}

function formatDate(value: unknown): string {
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === "number" ? value : String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "ยังไม่มีเวลา";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortRunId(runId: string): string {
  return runId.length > 22 ? `${runId.slice(0, 10)}…${runId.slice(-8)}` : runId;
}

function jobTitle(run: MarketplaceAutoReviewJobSummary): string {
  return (
    text(
      run.name,
      run.title,
      run.metadataJson?.jobName,
      run.metadataJson?.title
    ) || "Job Review"
  );
}

type AutoVideoPosterState = { cacheKey: string; posterUrl: string };
const autoVideoPosterCache = new Map<string, string>();
const AUTO_VIDEO_POSTER_CACHE_LIMIT = 80;

function rememberAutoVideoPoster(cacheKey: string, posterUrl: string) {
  autoVideoPosterCache.delete(cacheKey);
  autoVideoPosterCache.set(cacheKey, posterUrl);
  if (autoVideoPosterCache.size > AUTO_VIDEO_POSTER_CACHE_LIMIT) {
    const oldestKey = autoVideoPosterCache.keys().next().value;
    if (oldestKey) autoVideoPosterCache.delete(oldestKey);
  }
}

function useAutoVideoPoster(
  cacheKey: string,
  src: string,
  existingPosterUrl: string
) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  );
  const [nearViewport, setNearViewport] = useState(false);
  const [generatedPoster, setGeneratedPoster] =
    useState<AutoVideoPosterState | null>(null);

  useEffect(() => {
    setNearViewport(false);
    if (!videoElement || !src || existingPosterUrl) return;

    const cachedPoster = autoVideoPosterCache.get(cacheKey);
    if (cachedPoster) {
      setGeneratedPoster({ cacheKey, posterUrl: cachedPoster });
      setNearViewport(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" }
    );
    observer.observe(videoElement);
    return () => observer.disconnect();
  }, [cacheKey, existingPosterUrl, src, videoElement]);

  useEffect(() => {
    if (!nearViewport || !src || existingPosterUrl) return;
    const cachedPoster = autoVideoPosterCache.get(cacheKey);
    if (cachedPoster) {
      setGeneratedPoster({ cacheKey, posterUrl: cachedPoster });
      return;
    }

    const resolvedSrc = getAuthenticatedMediaUrl(src);
    if (!resolvedSrc) return;

    let cancelled = false;
    let captured = false;
    let targetTime = 0.1;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const releaseVideo = () => {
      video.removeAttribute("src");
      video.load();
    };
    const captureFrame = () => {
      if (
        cancelled ||
        captured ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        return;
      }
      captured = true;
      const scale = Math.min(
        1,
        240 / video.videoWidth,
        432 / video.videoHeight
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      try {
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const posterUrl = canvas.toDataURL("image/webp", 0.75);
        if (posterUrl.startsWith("data:image/")) {
          rememberAutoVideoPoster(cacheKey, posterUrl);
          setGeneratedPoster({ cacheKey, posterUrl });
        }
      } catch {
        // Some external video hosts disallow canvas extraction; the card's
        // completed-video label remains visible when no frame can be captured.
      } finally {
        releaseVideo();
      }
    };
    const captureLoadedFrameIfAtTarget = () => {
      if (video.currentTime + 0.01 >= targetTime) captureFrame();
    };
    const seekToPosterFrame = () => {
      targetTime = Number.isFinite(video.duration)
        ? Math.min(0.1, Math.max(0, video.duration / 2))
        : 0.1;
      try {
        video.currentTime = targetTime;
      } catch {
        captureFrame();
      }
    };
    video.addEventListener("loadedmetadata", seekToPosterFrame, { once: true });
    video.addEventListener("loadeddata", captureLoadedFrameIfAtTarget, {
      once: true,
    });
    video.addEventListener("seeked", captureFrame, { once: true });
    video.addEventListener("error", releaseVideo, { once: true });
    video.src = resolvedSrc;
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", seekToPosterFrame);
      video.removeEventListener("loadeddata", captureLoadedFrameIfAtTarget);
      video.removeEventListener("seeked", captureFrame);
      video.removeEventListener("error", releaseVideo);
      releaseVideo();
    };
  }, [cacheKey, existingPosterUrl, nearViewport, src]);

  const generatedPosterUrl =
    generatedPoster?.cacheKey === cacheKey ? generatedPoster.posterUrl : "";
  return {
    ref: setVideoElement,
    posterUrl: existingPosterUrl || generatedPosterUrl || undefined,
  };
}

function MarketplaceAutoReviewVideoPreview({
  runId,
  updatedAt,
  src,
  posterUrl,
  title,
  appearance,
  onMediaLoadError,
}: {
  runId: string;
  updatedAt: unknown;
  src: string;
  posterUrl: string;
  title: string;
  appearance: "dark" | "light";
  onMediaLoadError: () => void;
}) {
  const updatedAtKey =
    updatedAt instanceof Date
      ? updatedAt.toISOString()
      : String(updatedAt ?? "");
  const thumbnail = useAutoVideoPoster(
    `${runId}:${updatedAtKey}:${src}`,
    src,
    posterUrl
  );

  return (
    <figure
      className={`flex min-w-0 flex-row items-center justify-center gap-2 rounded-lg border p-2 sm:flex-col sm:justify-start ${appearance === "light" ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/[0.04]"}`}
    >
      <AuthenticatedMediaVideo
        ref={thumbnail.ref}
        src={src}
        poster={thumbnail.posterUrl}
        controls
        muted
        playsInline
        preload="none"
        aria-label={`ตัวอย่างวิดีโอที่รวมแล้ว: ${title}`}
        className="aspect-[9/16] h-36 w-20 shrink-0 rounded-md bg-black object-contain"
        fallback={
          <span className="flex aspect-[9/16] h-36 w-20 shrink-0 items-center justify-center rounded-md bg-black px-2 text-center text-[10px] text-slate-300">
            วิดีโอไม่พร้อมเล่น
          </span>
        }
        onError={onMediaLoadError}
        onStalled={onMediaLoadError}
      />
      <figcaption className="min-w-0 text-center">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${appearance === "light" ? "text-emerald-700" : "text-emerald-300"}`}
        >
          <CircleCheck className="h-3 w-3" aria-hidden="true" />
          มีวิดีโอรวมแล้ว
        </span>
      </figcaption>
    </figure>
  );
}

export function MarketplaceAutoReviewJobNavigator({
  runs,
  selectedRunId,
  loading = false,
  error = null,
  productId,
  productName,
  productOptions,
  selectedProductFilter,
  onProductFilterChange,
  allProducts = false,
  appearance = "dark",
  largeProductThumbnails = false,
  setupMode = false,
  hasMore = false,
  loadingMore = false,
  onOpenRun,
  openRunsInNewTab = false,
  onCreateNew,
  onMediaLoadError,
  onLoadMore,
  onDeleteRun,
  deletingRunId = null,
  className = "",
}: MarketplaceAutoReviewJobNavigatorProps) {
  const { i18n } = useTranslation();
  const isThaiLocale = (i18n.resolvedLanguage ?? i18n.language) === "th";
  const isLight = appearance === "light";
  const navigatorRef = useRef<HTMLElement | null>(null);
  const mediaRefreshRequestedRef = useRef(false);
  const [navigatorWidth, setNavigatorWidth] = useState(0);

  const handleMediaLoadError = () => {
    if (!onMediaLoadError || mediaRefreshRequestedRef.current) return;
    mediaRefreshRequestedRef.current = true;
    onMediaLoadError();
  };

  useEffect(() => {
    const navigator = navigatorRef.current;
    if (!navigator) return;

    const updateWidth = () => {
      setNavigatorWidth(navigator.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setNavigatorWidth(width);
    });
    observer.observe(navigator);
    return () => observer.disconnect();
  }, []);

  // The merged video gets its own column only when the navigator has enough
  // room. This keeps the 280px workbench rail compact while wide/single-column
  // history layouts can show both the product image and video preview.
  const canShowVideoPreview = navigatorWidth >= 360;
  // Two-step inline confirm — this codebase's convention for a destructive
  // row action (see the character/look delete buttons in the VD panels).
  // Deleting a job is irreversible: the run row cascades to its stages,
  // attempts, artifacts and outbox jobs.
  const [confirmingDeleteRunId, setConfirmingDeleteRunId] = useState<
    string | null
  >(null);
  const [jobFilter, setJobFilter] = useState("all");
  const allVisibleRuns = sortMarketplaceAutoReviewRunsNewestFirst(
    runs.filter(run => text(run.id, run.productionRunId))
  );
  const facebookStatusCounts = {
    notPublished: allVisibleRuns.filter(
      run => run.facebookPublishStatus !== "published"
    ).length,
    awaitingComment: allVisibleRuns.filter(
      run => run.awaitingAffiliateComment === true
    ).length,
    published: allVisibleRuns.filter(
      run => run.facebookPublishStatus === "published"
    ).length,
    missingShotVideos: allVisibleRuns.filter(hasMissingShotVideo).length,
  };
  const visibleRuns = allVisibleRuns.filter(run => {
    if (jobFilter === "fb_not_published")
      return run.facebookPublishStatus !== "published";
    if (jobFilter === "comment_pending")
      return run.awaitingAffiliateComment === true;
    if (jobFilter === "fb_published")
      return run.facebookPublishStatus === "published";
    if (jobFilter === "missing_shot_video") return hasMissingShotVideo(run);
    return true;
  });
  const productNameById = new Map(
    (productOptions ?? []).map(option => [option.productId, option.productName])
  );

  return (
    <aside
      ref={navigatorRef}
      className={`flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border ${isLight ? "border-slate-200 bg-white text-slate-900 shadow-sm" : "border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10"} ${className}`}
      aria-label={allProducts ? "Jobs ทั้งหมด" : "Jobs ของสินค้านี้"}
    >
      <header
        className={`border-b p-4 ${isLight ? "border-slate-200" : "border-white/10"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${isLight ? "text-violet-700" : "text-violet-300"}`}
          >
            <Sparkles className="h-4 w-4" /> Jobs
          </span>
          <span
            className={`rounded-full border px-2 py-1 text-[11px] ${isLight ? "border-slate-200 bg-slate-100 text-slate-600" : "border-white/10 bg-white/10 text-slate-300"}`}
          >
            {jobFilter === "all"
              ? `${allVisibleRuns.length} งาน`
              : `${visibleRuns.length}/${allVisibleRuns.length} งาน`}
          </span>
        </div>
        <h2 className="mt-2 text-base font-semibold">
          {allProducts ? "งาน Review ทั้งหมด" : "งาน Review ของสินค้า"}
        </h2>
        <p
          className={`mt-1 line-clamp-2 text-xs leading-5 ${isLight ? "text-slate-600" : "text-slate-400"}`}
        >
          {allProducts
            ? "งานทั้งหมดเรียงจากล่าสุด ใช้ตัวกรองด้านบนเพื่อค้นหา แล้วกดงานเพื่อเปิดรายละเอียด"
            : "เลือกงานเพื่อเปิดรายละเอียด หรือกรองสินค้าเพื่อค้นหางานอื่น"}
        </p>
        {productId ? (
          <div
            className={`mt-2 rounded-lg border px-2.5 py-2 ${isLight ? "border-slate-200 bg-slate-50" : "border-white/10 bg-white/5"}`}
          >
            <p
              className={`truncate text-xs font-medium ${isLight ? "text-slate-800" : "text-slate-200"}`}
              title={productName || productId}
            >
              สินค้า: {productName || "ไม่พบชื่อสินค้า"}
            </p>
            <p className="mt-0.5 break-all text-[10px] text-slate-500">
              รหัสสินค้า: {productId}
            </p>
          </div>
        ) : null}
        {onProductFilterChange && productOptions ? (
          <label
            className={`mt-3 block text-[11px] font-medium ${isLight ? "text-slate-700" : "text-slate-300"}`}
          >
            กรองรายการงานตามสินค้า
            <select
              aria-label="กรองรายการงานตามสินค้า"
              className={`mt-1.5 min-h-10 w-full rounded-lg border px-2.5 text-xs focus:outline-none focus:ring-2 ${isLight ? "border-slate-300 bg-white text-slate-900 focus:ring-violet-400" : "border-white/15 bg-slate-900 text-white focus:ring-sky-400"}`}
              value={selectedProductFilter ?? "__all_products__"}
              onChange={event => onProductFilterChange(event.target.value)}
            >
              <option value="__all_products__">ทุกสินค้า</option>
              {productOptions.map(option => (
                <option key={option.productId} value={option.productId}>
                  {option.productName
                    ? `${option.productName} · ${option.productId}`
                    : option.productId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {allProducts ? (
          <label
            className={`mt-3 block text-[11px] font-medium ${isLight ? "text-slate-700" : "text-slate-300"}`}
          >
            กรองตามสถานะงาน (รายการที่โหลดแล้ว)
            <select
              aria-label="กรองตามสถานะงาน Auto Review"
              className={`mt-1.5 min-h-10 w-full rounded-lg border px-2.5 text-xs focus:outline-none focus:ring-2 ${isLight ? "border-slate-300 bg-white text-slate-900 focus:ring-violet-400" : "border-white/15 bg-slate-900 text-white focus:ring-sky-400"}`}
              value={jobFilter}
              onChange={event => setJobFilter(event.target.value)}
            >
              <option value="all">ทุกสถานะ ({allVisibleRuns.length})</option>
              <option value="fb_not_published">
                ยังไม่โพสต์ Facebook ({facebookStatusCounts.notPublished})
              </option>
              <option value="comment_pending">
                รอยืนยันส่งคอมเมนต์ ({facebookStatusCounts.awaitingComment})
              </option>
              <option value="fb_published">
                โพสต์ Facebook แล้ว ({facebookStatusCounts.published})
              </option>
              <option value="missing_shot_video">
                ขาดวิดีโอรายช็อต ({facebookStatusCounts.missingShotVideos})
              </option>
            </select>
          </label>
        ) : null}
        <p className="mt-2 text-[10px] text-slate-500">
          {isThaiLocale
            ? `กดการ์ดงานเพื่อเปิด Job Workbench${openRunsInNewTab ? " ในแท็บใหม่" : ""}`
            : `Select a job to open its workbench${openRunsInNewTab ? " in a new tab" : ""}`}
        </p>
      </header>

      <nav
        className="min-h-0 flex-1 overflow-y-auto p-3"
        aria-label="รายการ Job Review"
      >
        {loading && visibleRuns.length === 0 ? (
          <p
            className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${isLight ? "border-slate-200 bg-slate-50 text-slate-600" : "border-white/10 bg-white/5 text-slate-300"}`}
          >
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดรายการงาน…
          </p>
        ) : null}
        {error && visibleRuns.length === 0 ? (
          <p
            className={`rounded-lg border p-4 text-xs leading-5 ${isLight ? "border-red-200 bg-red-50 text-red-700" : "border-red-300/30 bg-red-500/10 text-red-200"}`}
            role="alert"
          >
            โหลดรายการ Job ไม่สำเร็จ: {error}
          </p>
        ) : null}
        {!loading && !error && visibleRuns.length === 0 ? (
          <p
            className={`rounded-lg border border-dashed p-4 text-center text-xs leading-5 ${isLight ? "border-slate-300 bg-slate-50 text-slate-500" : "border-white/15 bg-white/5 text-slate-400"}`}
          >
            {allProducts
              ? "ไม่พบ Job Review ที่ตรงกับตัวกรอง"
              : "ยังไม่มี Job Review สำหรับสินค้านี้"}
          </p>
        ) : null}
        <ul className="space-y-2">
          {visibleRuns.map((run, index) => {
            const runId = text(run.id, run.productionRunId);
            const selected = runId === selectedRunId;
            const staged = isStagedRun(run);
            const status = statusPresentation(run);
            const StatusIcon = status.Icon;
            const stageCount = Number(run.stageCount) || 0;
            const stageIndex = Number(run.stageIndex) || 0;
            const progress =
              stageCount > 0
                ? `ขั้นตอน ${Math.min(stageIndex, stageCount)}/${stageCount}`
                : null;
            const mediaProgress = stagedProgress(run);
            const productThumbnailUrl = text(run.productThumbnailUrl);
            const videoPreviewUrl = text(run.videoPreviewUrl);
            const videoPreviewPosterUrl = text(run.videoPreviewPosterUrl);
            const characterSeriesNames = Array.isArray(run.characterSeriesNames)
              ? run.characterSeriesNames.filter(
                  (name: unknown): name is string =>
                    typeof name === "string" && Boolean(name.trim())
                )
              : [];
            const hasVideoPreview =
              canShowVideoPreview && Boolean(videoPreviewUrl);
            const productThumbnailClassName = `shrink-0 rounded-md border object-cover ${largeProductThumbnails ? "h-24 w-24" : "h-16 w-16"} ${isLight ? "border-slate-200 bg-slate-100" : "border-white/10 bg-white/10"}`;
            const productThumbnailFallbackClassName = `flex shrink-0 items-center justify-center rounded-md border px-1 text-center text-[9px] ${largeProductThumbnails ? "h-24 w-24" : "h-16 w-16"} ${isLight ? "border-slate-200 bg-slate-100 text-slate-500" : "border-white/10 bg-white/10 text-slate-400"}`;
            const deleteActionPosition = hasVideoPreview
              ? "right-2 top-2 sm:right-[8.5rem]"
              : "right-2 top-2";
            const deleteButtonPosition = hasVideoPreview
              ? "right-8 top-2 sm:right-[10rem]"
              : "right-8 top-2";
            const productLabel =
              productNameById.get(String(run.productId ?? "")) ||
              productName ||
              jobTitle(run);
            return (
              <li key={runId} className="relative">
                <div
                  className={
                    hasVideoPreview
                      ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]"
                      : ""
                  }
                >
                  <a
                    href={`/marketplace/auto-review/${encodeURIComponent(runId)}`}
                    target={openRunsInNewTab ? "_blank" : undefined}
                    rel={openRunsInNewTab ? "noopener noreferrer" : undefined}
                    className={`block w-full rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                      selected
                        ? isLight
                          ? "border-violet-300 bg-violet-50"
                          : "border-violet-300 bg-violet-500/20"
                        : isLight
                          ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          : "border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]"
                    }`}
                    aria-current={selected ? "page" : undefined}
                    onClick={event => {
                      if (
                        !openRunsInNewTab &&
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      ) {
                        event.preventDefault();
                        onOpenRun(runId);
                      }
                    }}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 flex-1 items-start gap-3">
                        {productThumbnailUrl ? (
                          <AuthenticatedMediaImage
                            src={productThumbnailUrl}
                            alt={`ภาพสินค้า: ${productLabel}`}
                            loading={largeProductThumbnails ? "eager" : "lazy"}
                            className={productThumbnailClassName}
                            fallback={
                              <span
                                className={productThumbnailFallbackClassName}
                              >
                                ภาพสินค้าไม่พร้อม
                              </span>
                            }
                            onError={handleMediaLoadError}
                          />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`block truncate text-sm font-semibold ${isLight ? "text-slate-950" : "text-white"}`}
                            >
                              {jobTitle(run)}
                            </span>
                            {index === 0 ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${isLight ? "bg-violet-100 text-violet-800" : "bg-violet-400/20 text-violet-200"}`}
                              >
                                ล่าสุด
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`mt-1 block truncate text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"}`}
                          >
                            {shortRunId(runId)}
                          </span>
                          {allProducts && run.productId ? (
                            <span
                              className="mt-1 block truncate text-[10px] text-slate-500"
                              title={String(run.productId)}
                            >
                              {productNameById.get(String(run.productId)) ||
                                "สินค้าไม่พบ"}
                              <span className="ml-1">
                                · {String(run.productId)}
                              </span>
                            </span>
                          ) : null}
                          {characterSeriesNames.length > 0 ? (
                            <span
                              className={`mt-1 block truncate text-[10px] ${isLight ? "text-violet-700" : "text-violet-300"}`}
                              title={characterSeriesNames.join(" · ")}
                            >
                              ซีรีส์: {characterSeriesNames.join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-medium ${status.className}`}
                      >
                        <StatusIcon
                          className={`h-3 w-3 ${status.Icon === Loader2 ? "animate-spin" : ""}`}
                        />
                        {status.label}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 ${isLight ? "border-slate-200 bg-slate-100 text-slate-600" : "border-white/10 bg-white/5 text-slate-400"}`}
                      >
                        {staged ? "Staged" : "Legacy"}
                      </span>
                      {progress ? (
                        <span
                          className={`rounded-full border px-2 py-1 ${isLight ? "border-slate-200 bg-slate-100 text-slate-600" : "border-white/10 bg-white/5 text-slate-400"}`}
                        >
                          {progress}
                        </span>
                      ) : null}
                      {allProducts ? (
                        <span
                          className={`rounded-full border px-2 py-1 ${run.facebookPublishStatus === "published" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : run.facebookPublishStatus === "scheduled" ? "border-violet-200 bg-violet-50 text-violet-800" : run.facebookPublishStatus === "publishing" ? "border-sky-200 bg-sky-50 text-sky-800" : run.facebookPublishStatus === "failed" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-100 text-slate-600"}`}
                        >
                          {run.facebookPublishStatus === "published"
                            ? "Facebook: โพสต์แล้ว"
                            : run.facebookPublishStatus === "scheduled"
                              ? "Facebook: ตั้งเวลาแล้ว"
                              : run.facebookPublishStatus === "publishing"
                                ? "Facebook: กำลังโพสต์"
                                : run.facebookPublishStatus === "failed"
                                  ? "Facebook: โพสต์ไม่สำเร็จ"
                                  : "Facebook: ยังไม่โพสต์"}
                        </span>
                      ) : null}
                      {allProducts && run.awaitingAffiliateComment ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                          รอยืนยันส่งคอมเมนต์
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-2 block truncate text-xs ${isLight ? "text-slate-700" : "text-slate-300"}`}
                    >
                      {stagedStageLabel(run)}
                    </span>
                    {mediaProgress ? (
                      <span
                        className={`mt-1 block truncate text-[11px] ${isLight ? "text-sky-700" : "text-sky-300"}`}
                      >
                        Prompt ภาพ {mediaProgress.imagePromptsReady}/
                        {mediaProgress.total} · ภาพ{" "}
                        {mediaProgress.imageArtifactsReady}/
                        {mediaProgress.total}
                      </span>
                    ) : null}
                    {mediaProgress ? (
                      <span
                        className={`mt-1 block truncate text-[11px] ${hasMissingShotVideo(run) ? "text-amber-700" : "text-emerald-700"}`}
                        title={
                          hasMissingShotVideo(run)
                            ? `ช็อตที่ยังไม่มีวิดีโอ: ${mediaProgress.missingVideoShotIds.join(", ")}`
                            : "วิดีโอครบทุกช็อตแล้ว"
                        }
                      >
                        วิดีโอรายช็อต {mediaProgress.videoArtifactsReady}/
                        {mediaProgress.total}
                        {hasMissingShotVideo(run)
                          ? ` · ขาดช็อต ${mediaProgress.missingVideoShotIds.length ? mediaProgress.missingVideoShotIds.join(", ") : "ยังระบุหมายเลขไม่ได้"}`
                          : " · ครบแล้ว"}
                      </span>
                    ) : staged ? (
                      <span className="mt-1 block truncate text-[11px] text-slate-500">
                        สถานะวิดีโอรายช็อตยังไม่มีข้อมูล
                      </span>
                    ) : null}
                    <span className="mt-1 block truncate text-[10px] text-slate-500">
                      สร้าง {formatDate(run.createdAt)}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">
                      อัปเดต {formatDate(run.updatedAt ?? run.createdAt)}
                    </span>
                  </a>
                  {hasVideoPreview ? (
                    <MarketplaceAutoReviewVideoPreview
                      runId={runId}
                      updatedAt={run.updatedAt ?? run.createdAt}
                      src={videoPreviewUrl}
                      posterUrl={videoPreviewPosterUrl}
                      title={jobTitle(run)}
                      appearance={appearance}
                      onMediaLoadError={handleMediaLoadError}
                    />
                  ) : null}
                </div>
                {/* Delete — sits OUTSIDE the card button (buttons can't nest)
                    and is absolutely positioned over its top-right corner.
                    Two-step confirm, since a deleted job takes its stages,
                    attempts and artifacts with it. */}
                {onDeleteRun ? (
                  confirmingDeleteRunId === runId ? (
                    <span
                      className={`absolute ${deleteActionPosition} z-20 flex items-center gap-1 rounded-md border px-1 py-0.5 shadow-lg ${isLight ? "border-slate-200 bg-white" : "border-white/20 bg-slate-900/95"}`}
                    >
                      <span
                        className={`px-1 text-[10px] ${isLight ? "text-slate-700" : "text-slate-200"}`}
                      >
                        ลบงานนี้?
                      </span>
                      <button
                        type="button"
                        className={`rounded p-1 ${isLight ? "text-slate-500 hover:text-slate-900" : "text-slate-300 hover:text-white"}`}
                        aria-label={`ยกเลิกการลบ ${jobTitle(run)}`}
                        onClick={() => setConfirmingDeleteRunId(null)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(deletingRunId)}
                        className="rounded bg-red-500/90 p-1 text-white hover:bg-red-500 disabled:opacity-60"
                        aria-label={`ยืนยันลบ ${jobTitle(run)}`}
                        data-testid={`job-delete-confirm-${runId}`}
                        onClick={() => {
                          setConfirmingDeleteRunId(null);
                          onDeleteRun(runId);
                        }}
                      >
                        {deletingRunId === runId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(deletingRunId)}
                      // ALWAYS visible, never hover-only: an affordance the
                      // user cannot see is one they will report as missing —
                      // the same mistake the look selector made earlier today.
                      className={`absolute ${deleteButtonPosition} z-10 rounded-md border p-1 transition disabled:opacity-60 ${isLight ? "border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600" : "border-white/10 bg-slate-900/70 text-slate-400 hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-300"}`}
                      aria-label={`ลบ ${jobTitle(run)}`}
                      title="ลบงานนี้"
                      data-testid={`job-delete-${runId}`}
                      onClick={() => setConfirmingDeleteRunId(runId)}
                    >
                      {deletingRunId === runId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <footer
        className={`border-t p-3 ${isLight ? "border-slate-200" : "border-white/10"}`}
      >
        {hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            className={`mb-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${isLight ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"}`}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {loadingMore ? "กำลังโหลด…" : "ดูงานเพิ่มเติม"}
          </button>
        ) : null}
        <button
          type="button"
          className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
            setupMode
              ? isLight
                ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                : "bg-white/20 text-white hover:bg-white/25"
              : "!bg-violet-700 !text-white hover:!bg-violet-800"
          }`}
          onClick={onCreateNew}
        >
          <Plus className="h-4 w-4" />
          {isThaiLocale
            ? "ตั้งค่างานรีวิววิดีโอใหม่"
            : "Set up a new video review job"}
        </button>
      </footer>
    </aside>
  );
}
