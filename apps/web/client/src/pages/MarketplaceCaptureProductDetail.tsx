import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Copy, Download, ExternalLink, Film, History, ImageIcon, Library, Loader2, PackagePlus, Play, RefreshCw, Search, Sparkles, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { MarketplaceInsightsSection } from "@/components/marketplace/MarketplaceInsightsSection";

type ProductMediaTab = "image" | "video" | "audio";
type ProductPanelTab = "history" | "library" | "product";
type AutoReviewOutputMode = "storyboard_images" | "full_video";
type AutoReviewFrameStrategy = "auto" | "storyboard_3x3_split" | "video_shot_start_stop";
type AutoReviewAudioStrategy = "auto" | "native_video_audio" | "separate_tts_voiceover" | "silent";

const PRODUCT_MEDIA_DRAG_MIME = "application/x-smartspec-product-media";
const PRODUCT_IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]);

function getProductId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/products\/([^/]+)/)?.[1] ?? "";
}

function parseCompactCount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;
  const text = String(raw).toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  if (/m\+?/.test(text) || /ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k\+?/.test(text) || /พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

function formatCount(value: string | number | null | undefined, fallbackText?: string | number | null): string {
  const normalized = parseCompactCount(value) ?? parseCompactCount(fallbackText);
  if (normalized != null) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(normalized);
  }
  return value == null || value === "" ? "-" : String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getProductNeedles(product: Record<string, unknown>): string[] {
  return [
    compactText(product.id),
    compactText(product.sourceUrl),
    compactText(product.affiliateUrl),
    compactText(product.externalProductId),
    compactText(product.externalShopId),
    compactText(product.productName),
  ].filter((value, index, values) => value.length >= 3 && values.indexOf(value) === index);
}

function valueMatchesProduct(value: unknown, product: Record<string, unknown>): boolean {
  const needles = getProductNeedles(product);
  if (needles.length === 0) return false;
  const haystack = JSON.stringify(value ?? {}).toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function extractTaskResultUrl(task: any): string {
  const direct = compactText(task?.resultUrl ?? task?.url ?? task?.outputUrl);
  if (direct) return direct;
  const result = asRecord(task?.result);
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  for (const artifact of artifacts) {
    const url = compactText(asRecord(artifact).uri ?? asRecord(artifact).url);
    if (url) return url;
  }
  const outputs = Array.isArray(task?.outputs) ? task.outputs : [];
  for (const output of outputs) {
    const url = compactText(asRecord(output).url ?? asRecord(output).uri);
    if (url) return url;
  }
  return "";
}

function extractTaskTitle(task: any): string {
  return compactText(task?.title)
    || compactText(task?.prompt).slice(0, 90)
    || compactText(task?.model)
    || "Media task";
}

function taskMatchesProduct(task: any, product: Record<string, unknown>): boolean {
  return valueMatchesProduct(task?.parameters, product)
    || valueMatchesProduct(task?.generationExtraParams, product)
    || valueMatchesProduct(task?.prompt, product)
    || valueMatchesProduct(task, product);
}

function libraryItemMatchesProduct(item: any, product: Record<string, unknown>): boolean {
  return valueMatchesProduct(item?.metadata, product)
    || valueMatchesProduct(item?.title, product)
    || valueMatchesProduct(item?.description, product)
    || valueMatchesProduct(item, product);
}

function getLibraryItemUrl(item: any): string {
  return compactText(item?.source_url ?? item?.sourceUrl ?? item?.url);
}

function mediaTabLabel(tab: ProductMediaTab): string {
  if (tab === "video") return "Video";
  if (tab === "audio") return "Audio";
  return "Image";
}

function mediaIcon(tab: ProductMediaTab) {
  if (tab === "video") return <Video className="h-4 w-4" />;
  if (tab === "audio") return <Film className="h-4 w-4" />;
  return <ImageIcon className="h-4 w-4" />;
}

function autoReviewStatusLabel(status: string): string {
  if (status === "completed") return "เสร็จแล้ว";
  if (status === "failed") return "ล้มเหลว";
  if (status === "cancelled") return "ยกเลิกแล้ว";
  if (status === "waiting_provider") return "รอผลจาก provider";
  if (status === "running") return "กำลังทำงาน";
  return "อยู่ในคิว";
}

function autoReviewStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    product_preflight: "ตรวจข้อมูลสินค้า",
    production_project: "สร้าง Production Project",
    concept_story: "สร้างแนวคิด/บทพูด",
    prompt_plan: "สร้าง prompt ทั้งหมด",
    image_generation: "สร้างภาพ/เฟรม",
    storyboard_review: "ส่งเข้า Storyboard Review",
    video_generation: "สร้างวิดีโอรายช็อต",
    audio_generation: "เตรียมเสียง/บทพูด",
    video_edit: "ประกอบ Video Editor",
    render: "Render วิดีโอ",
    library_finalize: "บันทึกเข้า Library",
  };
  return labels[stage] ?? stage;
}

function autoReviewStatusClass(status: string): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function startMediaDrag(event: DragEvent<HTMLElement>, asset: {
  url: string;
  title?: string;
  mediaType: ProductMediaTab;
  source: string;
  metadata?: Record<string, unknown>;
}) {
  event.dataTransfer.effectAllowed = asset.mediaType === "image" ? "copy" : "none";
  event.dataTransfer.setData(PRODUCT_MEDIA_DRAG_MIME, JSON.stringify(asset));
  event.dataTransfer.setData("text/uri-list", asset.url);
  event.dataTransfer.setData("text/plain", asset.url);
}

function readDroppedMedia(event: DragEvent<HTMLElement>): {
  url: string;
  title?: string;
  mediaType?: ProductMediaTab;
  source?: string;
  metadata?: Record<string, unknown>;
} | null {
  const raw = event.dataTransfer.getData(PRODUCT_MEDIA_DRAG_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const url = compactText(parsed.url);
      if (url) return { ...parsed, url };
    } catch {
      // Fall back to URL/text below.
    }
  }
  const url = compactText(event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain"));
  return url ? { url, mediaType: "image", source: "dragged_url" } : null;
}

function inferImageFileType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function ProductMediaCard({
  asset,
}: {
  asset: {
    url: string;
    title: string;
    mediaType: ProductMediaTab;
    source: string;
    createdAt?: string | Date | null;
    metadata?: Record<string, unknown>;
  };
}) {
  const canDragToProduct = asset.mediaType === "image";
  return (
    <article
      className="overflow-hidden rounded-lg border bg-white shadow-sm"
      draggable={canDragToProduct}
      onDragStart={(event) => startMediaDrag(event, asset)}
      title={canDragToProduct ? "Drag to product images" : undefined}
    >
      <div className="relative aspect-video bg-slate-100">
        {asset.mediaType === "image" ? (
          <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" loading="lazy" />
        ) : asset.mediaType === "video" ? (
          <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">{mediaIcon(asset.mediaType)}</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
          {mediaTabLabel(asset.mediaType)}
        </span>
      </div>
      <div className="space-y-1 p-2">
        <p className="line-clamp-2 text-xs font-medium text-slate-800">{asset.title}</p>
        <p className="truncate text-[11px] text-slate-500">{asset.source}</p>
      </div>
    </article>
  );
}

export default function MarketplaceCaptureProductDetail() {
  const [location] = useLocation();
  const productId = getProductId(location);
  const [panelTab, setPanelTab] = useState<ProductPanelTab>("history");
  const [mediaTab, setMediaTab] = useState<ProductMediaTab>("image");
  const [productFilterEnabled, setProductFilterEnabled] = useState(true);
  const [isDropActive, setIsDropActive] = useState(false);
  const [autoReviewOutputMode, setAutoReviewOutputMode] = useState<AutoReviewOutputMode>("storyboard_images");
  const [autoReviewFrameStrategy, setAutoReviewFrameStrategy] = useState<AutoReviewFrameStrategy>("auto");
  const [autoReviewAudioStrategy, setAutoReviewAudioStrategy] = useState<AutoReviewAudioStrategy>("auto");
  const [showAutoReviewRuns, setShowAutoReviewRuns] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const suppressAddImageToastRef = useRef(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (autoReviewOutputMode !== "full_video" && autoReviewAudioStrategy !== "auto") {
      setAutoReviewAudioStrategy("auto");
    }
  }, [autoReviewAudioStrategy, autoReviewOutputMode]);

  const product = trpc.marketplaceCapture.getProduct.useQuery({ productId }, { enabled: Boolean(productId) });
  const productData = product.data as any;
  const productItem = productData?.product ?? productData;
  const captureId = productItem?.captureId ? String(productItem.captureId) : "";
  const productInsights = trpc.marketplaceCapture.listInsightsByProduct.useQuery({ productId }, { enabled: Boolean(productId) });
  const captureInsights = trpc.marketplaceCapture.listInsightsByCapture.useQuery({ captureId }, { enabled: Boolean(captureId) });
  const autoReviewRuns = trpc.marketplaceCapture.listAutoReviewRuns.useQuery(
    { productId, limit: 8 },
    { enabled: Boolean(productId), refetchInterval: 15000, refetchOnWindowFocus: true },
  );
  const mediaHistory = trpc.media.listTasks.useQuery(
    { mediaType: mediaTab, limit: 60 },
    { enabled: Boolean(productId), refetchInterval: 15000, refetchOnWindowFocus: true },
  );
  const libraryItems = trpc.library.listDocuments.useQuery(
    {
      query: productFilterEnabled ? productId : undefined,
      scope: "all",
      sort: "created_desc",
      limit: 50,
      offset: 0,
      filters: {
        itemType: mediaTab,
      },
    },
    { enabled: Boolean(productId), refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const uploadMutation = trpc.ai.upload.useMutation();
  const addProductImageMutation = trpc.marketplaceCapture.addProductImageFromUrl.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.marketplaceCapture.getProduct.invalidate({ productId }),
        utils.marketplaceCapture.listProductImages.invalidate(),
      ]);
      if (!suppressAddImageToastRef.current) {
        toast.success(result.created ? "Added image to product" : "This image is already attached");
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const removeProductImageMutation = trpc.marketplaceCapture.removeProductImage.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.marketplaceCapture.getProduct.invalidate({ productId }),
        utils.marketplaceCapture.listProductImages.invalidate(),
      ]);
      toast.success("Removed image from product");
    },
    onError: (error) => toast.error(error.message),
  });
  const startAutoReviewMutation = trpc.marketplaceCapture.startAutoReview.useMutation({
    onSuccess: async (result: any) => {
      await Promise.all([
        utils.marketplaceCapture.listAutoReviewRuns.invalidate({ productId, limit: 8 }),
        utils.marketplaceCapture.getProduct.invalidate({ productId }),
      ]);
      setShowAutoReviewRuns(true);
      toast.success(result?.productionRunId ? "เริ่มสร้างรีวิวสินค้าอัตโนมัติแล้ว" : "เริ่มงานแล้ว");
    },
    onError: (error) => toast.error(error.message),
  });
  const advanceAutoReviewMutation = trpc.marketplaceCapture.advanceAutoReviewRun.useMutation({
    onSuccess: async () => {
      await autoReviewRuns.refetch();
      toast.success("อัปเดตสถานะงานแล้ว");
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelAutoReviewMutation = trpc.marketplaceCapture.cancelAutoReviewRun.useMutation({
    onSuccess: async () => {
      await autoReviewRuns.refetch();
      toast.success("ยกเลิกงานแล้ว");
    },
    onError: (error) => toast.error(error.message),
  });

  const item = (productItem ?? {}) as Record<string, unknown>;
  const images = (productData?.images ?? []) as any[];
  const history = (productData?.history ?? []) as any[];
  const health = productData?.health;
  const insights = [...((productInsights.data as any[] | undefined) ?? []), ...((captureInsights.data as any[] | undefined) ?? [])];
  const autoReviewRunItems = (autoReviewRuns.data ?? []) as any[];
  const activeAutoReviewRun = autoReviewRunItems.find((run) => ["queued", "running", "waiting_provider"].includes(String(run.status)));

  const historyAssets = useMemo(() => {
    const tasks = (mediaHistory.data?.tasks ?? []) as any[];
    return tasks
      .filter((task) => !productFilterEnabled || taskMatchesProduct(task, item))
      .map((task) => {
        const url = extractTaskResultUrl(task);
        if (!url) return null;
        return {
          url,
          title: extractTaskTitle(task),
          mediaType: mediaTab,
          source: "Media History",
          createdAt: task.createdAt ?? task.created_at ?? null,
          metadata: {
            taskId: task.id ?? task.taskId ?? null,
            providerTaskId: task.taskId ?? null,
            parameters: task.parameters ?? null,
          },
        };
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  }, [item, mediaHistory.data?.tasks, mediaTab, productFilterEnabled]);

  const libraryAssets = useMemo(() => {
    const items = (libraryItems.data?.results ?? []) as any[];
    return items
      .filter((libraryItem) => !productFilterEnabled || libraryItemMatchesProduct(libraryItem, item))
      .map((libraryItem) => {
        const url = getLibraryItemUrl(libraryItem);
        if (!url) return null;
        return {
          url,
          title: compactText(libraryItem.title) || "Library media",
          mediaType: mediaTab,
          source: "Library",
          createdAt: libraryItem.created_at ?? libraryItem.createdAt ?? null,
          metadata: {
            libraryItemId: libraryItem.id,
            source: libraryItem.source,
            metadata: libraryItem.metadata ?? null,
          },
        };
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  }, [item, libraryItems.data?.results, mediaTab, productFilterEnabled]);

  const copyAffiliateLink = () => {
    const affiliateUrl = compactText(item.affiliateUrl);
    if (affiliateUrl && navigator.clipboard) void navigator.clipboard.writeText(affiliateUrl).then(() => toast.success("Affiliate link copied"));
  };

  const handleDropImage = useCallback(async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    const media = readDroppedMedia(event);
    if (!media?.url) return;
    if (media.mediaType && media.mediaType !== "image") {
      toast.error("Only images can be attached to product images");
      return;
    }
    await addProductImageMutation.mutateAsync({
      productId,
      url: media.url,
      type: "main",
      title: media.title,
      source: media.source ?? "product_detail_drag_drop",
      originalSourceUrl: media.url,
      metadata: media.metadata,
    });
  }, [addProductImageMutation, productId]);

  const handleUploadProductImages = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const imageFiles = files.filter((file) => {
      const fileType = inferImageFileType(file);
      if (!PRODUCT_IMAGE_UPLOAD_TYPES.has(fileType)) {
        toast.error(`${file.name} is not a supported image type`);
        return false;
      }
      if (file.size > PRODUCT_IMAGE_UPLOAD_MAX_BYTES) {
        toast.error(`${file.name} is larger than 10MB`);
        return false;
      }
      return true;
    });
    if (imageFiles.length === 0) return;

    let attachedCount = 0;
    let duplicateCount = 0;
    try {
      suppressAddImageToastRef.current = imageFiles.length > 1;
      for (const file of imageFiles) {
        const fileType = inferImageFileType(file);
        const fileBase64 = await readFileAsDataUrl(file);
        const uploaded = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType,
          fileBase64,
        });
        if (!uploaded.url) {
          throw new Error(`Upload response missing URL for ${file.name}`);
        }
        const attachResult = await addProductImageMutation.mutateAsync({
          productId,
          url: uploaded.url,
          type: "main",
          title: file.name,
          source: "product_detail_upload",
          originalSourceUrl: uploaded.url,
          metadata: {
            source: "product_detail_upload",
            fileName: file.name,
            fileType,
            fileSizeBytes: file.size,
            storageKey: uploaded.key,
          },
        });
        if (attachResult.created) attachedCount += 1;
        else duplicateCount += 1;
      }
      if (imageFiles.length > 1) {
        toast.success(
          duplicateCount > 0
            ? `Uploaded ${attachedCount} new images (${duplicateCount} already attached)`
            : `Uploaded and attached ${attachedCount} images`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload product image");
    } finally {
      suppressAddImageToastRef.current = false;
    }
  }, [addProductImageMutation, productId, uploadMutation]);

  const removeProductImage = useCallback((imageId: string) => {
    const ok = window.confirm("Remove this image from the product? The original media file will stay in History/Library.");
    if (!ok) return;
    removeProductImageMutation.mutate({ productId, imageId });
  }, [productId, removeProductImageMutation]);

  const startAutoReview = useCallback(() => {
    const resolvedAudioStrategy = autoReviewOutputMode === "full_video" ? autoReviewAudioStrategy : "auto";
    startAutoReviewMutation.mutate({
      productId,
      outputMode: autoReviewOutputMode,
      frameStrategy: autoReviewFrameStrategy,
      audioStrategy: resolvedAudioStrategy,
    });
  }, [autoReviewAudioStrategy, autoReviewFrameStrategy, autoReviewOutputMode, productId, startAutoReviewMutation]);

  if (product.isLoading) return <main className="p-8">Loading product...</main>;
  if (!product.data) return <main className="p-8">Product not found</main>;

  const panelAssets = panelTab === "history" ? historyAssets : panelTab === "library" ? libraryAssets : images.map((image) => ({
    url: image.url,
    title: `${image.type ?? "product image"}`,
    mediaType: "image" as const,
    source: "Product images",
    createdAt: image.createdAt,
    metadata: { marketplaceProductImageId: image.id },
  }));
  const panelLoading = panelTab === "history" ? mediaHistory.isFetching : panelTab === "library" ? libraryItems.isFetching : false;
  const isUploadingProductImage = uploadMutation.isPending || addProductImageMutation.isPending;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/marketplace-capture">
              <Button type="button" variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Marketplace Capture
              </Button>
            </Link>
            <Button type="button" variant="ghost" size="sm" onClick={() => product.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{compactText(item.platform)}</p>
            <h1 className="mt-1 text-3xl font-semibold">{compactText(item.productName)}</h1>
            <a className="mt-2 inline-block text-sm text-blue-700 underline" href={compactText(item.sourceUrl)} target="_blank" rel="noreferrer">
              Source marketplace page
            </a>
            {item.affiliateUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <a className="max-w-xl truncate text-emerald-700 underline" href={compactText(item.affiliateUrl)} target="_blank" rel="noreferrer">
                  Affiliate link
                </a>
                <button className="inline-flex items-center rounded border bg-white px-2 py-1 text-xs" type="button" onClick={copyAffiliateLink}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            ) : null}
            <div className="mt-4 rounded-md border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-medium ${
                  health?.status === "critical" ? "bg-red-100 text-red-700" :
                  health?.status === "warning" ? "bg-amber-100 text-amber-700" :
                  "bg-emerald-100 text-emerald-700"
                }`}>Health: {health?.status ?? "ok"}</span>
                <span className="text-sm text-slate-500">Access: {compactText(item.accessType) || "owner"}</span>
                <span className="text-sm text-slate-500">Snapshots: {health?.snapshotCount ?? history.length}</span>
                <span className="text-sm text-slate-500">Last checked: {health?.lastCheckedAt ? new Date(health.lastCheckedAt).toLocaleString() : "-"}</span>
              </div>
              {health?.warnings?.length ? (
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {health.warnings.map((warning: any) => <li key={warning.code}>{warning.message}</li>)}
                </ul>
              ) : null}
            </div>
            <dl className="mt-6 grid gap-4 md:grid-cols-2">
              <div><dt className="text-sm font-medium text-slate-500">Price</dt><dd>{compactText(item.priceCurrent) || "-"} {compactText(item.currency) || "THB"}</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Commission</dt><dd>{compactText(item.commissionRatePercent) || "-"}%</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Affiliate link</dt><dd className="truncate">{compactText(item.affiliateUrl) || "-"}</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Sold</dt><dd>{formatCount(item.soldCountNormalized as any, item.soldCountText as any)}</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Shop</dt><dd>{compactText(item.shopName) || "-"}</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Rating</dt><dd>{compactText(item.ratingScore) || "-"}</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Reviews</dt><dd>{formatCount(item.reviewCountText as any, history[0]?.reviewCountNormalized)}</dd></div>
              <div><dt className="text-sm font-medium text-slate-500">Updated</dt><dd>{item.updatedAt ? new Date(item.updatedAt as string).toLocaleString() : "-"}</dd></div>
            </dl>
          </section>

          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Marketplace Auto Review
                </div>
                <h2 className="mt-3 text-xl font-semibold">สร้างวิดีโอรีวิวจากสินค้านี้อัตโนมัติ</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  ระบบจะสร้าง Production Director Project ตามขั้นตอนปกติ แล้วใช้ข้อมูลสินค้า รูปสินค้า แนวคิด บทพูด และ prompt lock ส่งต่อไปยัง Storyboard Review หรือสร้างวิดีโอจนจบตามเส้นทางที่เลือก
                </p>
              </div>
              <Button
                type="button"
                onClick={startAutoReview}
                disabled={startAutoReviewMutation.isPending || Boolean(activeAutoReviewRun)}
                className="min-w-[190px] bg-sky-600 text-white hover:bg-sky-700"
              >
                {startAutoReviewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                เริ่มสร้างอัตโนมัติ
              </Button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ผลลัพธ์ที่ต้องการ</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {([
                    ["storyboard_images", "Storyboard + รูป", "สร้าง project และรูปพร้อมตรวจใน Storyboard Review"],
                    ["full_video", "สร้างวิดีโอจนจบ", "สร้างภาพ วิดีโอรายช็อต ประกอบ editor และ render เข้า Library"],
                  ] as const).map(([mode, label, description]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setAutoReviewOutputMode(mode);
                        if (mode !== "full_video") setAutoReviewAudioStrategy("auto");
                      }}
                      className={`rounded-lg border p-3 text-left transition ${
                        autoReviewOutputMode === mode ? "border-sky-500 bg-white shadow-sm ring-2 ring-sky-100" : "bg-white/70 hover:bg-white"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">เส้นทางการสร้างภาพ</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {([
                    ["auto", "Auto", "ให้ระบบเลือก"],
                    ["storyboard_3x3_split", "3x3 + cut", "เร็วและเหมาะกับ storyboard"],
                    ["video_shot_start_stop", "Start/Stop", "คมชัดกว่าและเหมาะกับวิดีโอ"],
                  ] as const).map(([strategy, label, description]) => (
                    <button
                      key={strategy}
                      type="button"
                      onClick={() => setAutoReviewFrameStrategy(strategy)}
                      className={`rounded-lg border p-3 text-left transition ${
                        autoReviewFrameStrategy === strategy ? "border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-100" : "bg-white/70 hover:bg-white"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">เสียงสำหรับวิดีโอ</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {([
                    ["auto", "Auto", "ใช้ Veo native audio เมื่อรุ่นรองรับ"],
                    ["native_video_audio", "Veo พูดในช็อต", "ฝังบทพูดใน prompt และเผื่อเวลาเสียง"],
                    ["separate_tts_voiceover", "TTS แยก", "วิดีโอเงียบ แล้วใส่เสียงใน A1"],
                    ["silent", "ไม่มีเสียง", "สร้างวิดีโอเงียบ"],
                  ] as const).map(([strategy, label, description]) => (
                    <button
                      key={strategy}
                      type="button"
                      onClick={() => setAutoReviewAudioStrategy(strategy)}
                      disabled={autoReviewOutputMode !== "full_video" && strategy !== "auto"}
                      className={`rounded-lg border p-3 text-left transition ${
                        autoReviewAudioStrategy === strategy ? "border-orange-500 bg-white shadow-sm ring-2 ring-orange-100" : "bg-white/70 hover:bg-white"
                      } ${autoReviewOutputMode !== "full_video" && strategy !== "auto" ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                {activeAutoReviewRun ? (
                  <>
                    <Clock className="h-4 w-4 text-sky-600" />
                    <span>กำลังทำงาน: {autoReviewStageLabel(String(activeAutoReviewRun.currentStage))}</span>
                    <span className="text-xs text-slate-400">({activeAutoReviewRun.stageIndex}/{activeAutoReviewRun.stageCount})</span>
                  </>
                ) : autoReviewRunItems[0]?.status === "completed" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>งานล่าสุดเสร็จแล้ว</span>
                  </>
                ) : autoReviewRunItems[0]?.status === "failed" ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span>งานล่าสุดล้มเหลว</span>
                  </>
                ) : (
                  <span>ยังไม่มีงานอัตโนมัติสำหรับสินค้านี้</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeAutoReviewRun ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => advanceAutoReviewMutation.mutate({ runId: String(activeAutoReviewRun.id) })}
                    disabled={advanceAutoReviewMutation.isPending}
                  >
                    {advanceAutoReviewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    เช็กสถานะ
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAutoReviewRuns((value) => !value)}>
                  {showAutoReviewRuns ? "ซ่อนสถานะงาน" : "ดูสถานะงาน"}
                </Button>
              </div>
            </div>

            {showAutoReviewRuns ? (
              <div className="mt-4 space-y-3">
                {autoReviewRuns.isFetching ? (
                  <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังโหลดสถานะงาน
                  </div>
                ) : null}
                {autoReviewRunItems.length === 0 && !autoReviewRuns.isFetching ? (
                  <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-slate-500">ยังไม่มีประวัติงานอัตโนมัติ</div>
                ) : null}
                {autoReviewRunItems.map((run) => (
                  <article key={run.id} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${autoReviewStatusClass(String(run.status))}`}>
                            {autoReviewStatusLabel(String(run.status))}
                          </span>
                          <span className="text-xs text-slate-500">{autoReviewStageLabel(String(run.currentStage))}</span>
                          <span className="text-xs text-slate-400">{run.stageIndex}/{run.stageCount}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">{run.productionRunId}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {run.outputMode === "full_video" ? "Full video" : "Storyboard + images"} · {run.frameStrategy === "video_shot_start_stop" ? "Start/Stop frame" : "3x3 split"}
                          {run.metadataJson?.resolvedAudioStrategy ? ` · ${String(run.metadataJson.resolvedAudioStrategy).replaceAll("_", " ")}` : ""}
                        </p>
                        {run.errorMessage ? <p className="mt-2 text-sm text-red-600">{run.errorMessage}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {run.links?.productionProject ? (
                          <a href={run.links.productionProject} target="_blank" rel="noreferrer">
                            <Button type="button" variant="outline" size="sm">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Production
                            </Button>
                          </a>
                        ) : null}
                        {run.links?.storyboardReview ? (
                          <a href={run.links.storyboardReview} target="_blank" rel="noreferrer">
                            <Button type="button" variant="outline" size="sm">Storyboard</Button>
                          </a>
                        ) : null}
                        {run.links?.videoEditor ? (
                          <a href={run.links.videoEditor} target="_blank" rel="noreferrer">
                            <Button type="button" variant="outline" size="sm">Video Editor</Button>
                          </a>
                        ) : null}
                        {["queued", "running", "waiting_provider"].includes(String(run.status)) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => cancelAutoReviewMutation.mutate({ runId: String(run.id) })}
                            disabled={cancelAutoReviewMutation.isPending}
                          >
                            ยกเลิก
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <MarketplaceInsightsSection
            insights={insights}
            isLoading={productInsights.isLoading || captureInsights.isLoading}
            emptyText="No AI insights have been synced for this product or its source capture yet."
            allowStorytellingAction
          />

          <section
            className={`rounded-lg border bg-white p-6 shadow-sm transition ${isDropActive ? "border-sky-400 ring-4 ring-sky-100" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsDropActive(true);
            }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={handleDropImage}
          >
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              multiple
              className="hidden"
              onChange={handleUploadProductImages}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Product Images</h2>
                <p className="mt-1 text-sm text-slate-500">Drag an image from the right panel here or upload files to attach them to this product.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={isUploadingProductImage}
                >
                  {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload images
                </Button>
                <div className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600">{images.length} images</div>
              </div>
            </div>
            {images.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image: any) => (
                  <figure key={image.id} className="rounded-md border bg-slate-50 p-2">
                    <div className="relative">
                      <img src={image.url} alt={image.type} className="h-44 w-full object-contain" loading="lazy" />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="absolute right-2 top-2 h-8 rounded-full bg-white/95 px-2 text-red-600 shadow-sm hover:bg-red-50 hover:text-red-700"
                        onClick={() => removeProductImage(String(image.id))}
                        disabled={removeProductImageMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove product image</span>
                      </Button>
                    </div>
                    <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{image.type}</span>
                      {image.metadataJson?.source ? <span className="truncate">{String(image.metadataJson.source)}</span> : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
                Drop generated or library images here, or use Upload images to add local product photos.
              </div>
            )}

            {history.length > 0 ? (
              <>
                <h2 className="mt-8 text-lg font-semibold">Update History</h2>
                <div className="mt-3 overflow-x-auto rounded-md border">
                  <table className="min-w-full divide-y text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Captured at</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Commission</th>
                        <th className="px-3 py-2">Sold</th>
                        <th className="px-3 py-2">Rating</th>
                        <th className="px-3 py-2">Reviews</th>
                        <th className="px-3 py-2">By user</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y bg-white">
                      {history.map((snapshot: any) => (
                        <tr key={snapshot.id}>
                          <td className="px-3 py-2">{new Date(snapshot.capturedAt).toLocaleString()}</td>
                          <td className="px-3 py-2">{snapshot.priceCurrent ?? "-"} {snapshot.currency ?? "THB"}</td>
                          <td className="px-3 py-2">{snapshot.commissionRatePercent ?? "-"}%</td>
                          <td className="px-3 py-2">{formatCount(snapshot.soldCountNormalized, snapshot.soldCountText)}</td>
                          <td className="px-3 py-2">{snapshot.ratingScore ?? "-"}</td>
                          <td className="px-3 py-2">{formatCount(snapshot.reviewCountNormalized, snapshot.reviewCountText)}</td>
                          <td className="px-3 py-2">{snapshot.capturedByUserId ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <h2 className="mt-8 text-lg font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{compactText(item.descriptionText) || "-"}</p>
            <h2 className="mt-6 text-lg font-semibold">Raw data</h2>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(item, null, 2)}</pre>
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:h-[calc(100dvh-2rem)]">
          <section className="flex h-full min-h-[640px] flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Media Panel</h2>
                  <p className="mt-1 text-xs text-slate-500">History and Library assets tied to this product.</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border px-2 py-1">
                  <span className="text-xs font-medium text-slate-600">Product filter</span>
                  <Switch checked={productFilterEnabled} onCheckedChange={setProductFilterEnabled} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {([
                  ["history", History, "History"],
                  ["library", Library, "Library"],
                  ["product", PackagePlus, "Product"],
                ] as const).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setPanelTab(tab);
                      if (tab === "product") setMediaTab("image");
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      panelTab === tab ? "border-sky-500 bg-sky-50 text-sky-700" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["image", "video", "audio"] as ProductMediaTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMediaTab(tab)}
                    disabled={panelTab === "product" && tab !== "image"}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      mediaTab === tab ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {mediaIcon(tab)}
                    {mediaTabLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <Search className="h-3.5 w-3.5" />
                {productFilterEnabled ? "Showing assets that match this product. Turn off to show all." : "Filter is off. Showing all recent assets."}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {panelLoading ? (
                <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading media...
                </div>
              ) : null}
              {panelAssets.length === 0 && !panelLoading ? (
                <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No {mediaTabLabel(mediaTab).toLowerCase()} assets found for this view.
                </div>
              ) : (
                <div className="grid gap-3">
                  {panelAssets.map((asset, index) => (
                    <ProductMediaCard key={`${asset.url}-${index}`} asset={asset} />
                  ))}
                </div>
              )}
            </div>
            <div className="border-t bg-slate-50 p-3 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>{panelAssets.length} visible assets</span>
                <a className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900" href="/media-history" target="_blank" rel="noreferrer">
                  <Download className="h-3.5 w-3.5" />
                  Media History
                </a>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
