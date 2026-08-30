import { LocaleToggle } from "@/components/LocaleToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import type { ProductReferenceCategory } from "@shared/marketplaceCapture";
import { AlertTriangle, Camera, ChevronLeft, Copy, Download, ExternalLink, Eye, ImageIcon, Loader2, Plus, RefreshCw, Search, Store, Trash2, TrendingUp, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";

type PlatformFilter = "all" | "shopee" | "tiktok_shop";
type HealthFilter = "all" | "active" | "needs_update" | "inactive" | "low_rating";
type CameraFacingMode = "environment" | "user";

function parseCompact(raw: string | null | undefined): number {
  if (!raw) return 0;
  const text = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  if (/m|ล้าน/.test(text)) return Math.round(value * 1_000_000);
  if (/k|พัน/.test(text)) return Math.round(value * 1_000);
  if (/หมื่น/.test(text)) return Math.round(value * 10_000);
  return Math.round(value);
}

function formatCompactCount(raw: string | number | null | undefined, fallback?: string | number | null): string {
  const normalized = typeof raw === "number" && Number.isFinite(raw)
    ? raw
    : parseCompact(raw == null ? null : String(raw));
  const fallbackNormalized = typeof fallback === "number" && Number.isFinite(fallback)
    ? fallback
    : parseCompact(fallback == null ? null : String(fallback));
  const value = normalized || fallbackNormalized;
  return value ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) : "-";
}

function parseDecimal(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;
  const match = raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function formatDecimal(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    ...options,
  }).format(value);
}

function formatCommissionRate(rate: string | number | null | undefined): string {
  const value = parseDecimal(rate);
  return value == null ? "-" : `${formatDecimal(value)}%`;
}

function formatCommissionAmount(product: any): string {
  const price = parseDecimal(product.priceCurrent);
  const rate = parseDecimal(product.commissionRatePercent);
  if (price == null || rate == null) return "-";
  return `${formatDecimal(price * (rate / 100))} ${product.currency ?? "THB"}`;
}

function productCategory(product: any) {
  const raw = product.platformRawJson ?? {};
  return raw.categoryText || raw.category || raw.latestProductDraft?.categoryText || "Uncategorized";
}

function primaryProductImageUrl(product: any): string {
  const matched = typeof product.matchedImage?.url === "string" ? product.matchedImage.url.trim() : "";
  if (matched) return matched;
  const direct = typeof product.imageUrl === "string" ? product.imageUrl.trim() : "";
  if (direct) return direct;
  const imageUrls = Array.isArray(product.imageUrls) ? product.imageUrls : [];
  for (const value of imageUrls) {
    const url = typeof value === "string" ? value.trim() : "";
    if (url) return url;
  }
  return "";
}

function isStale(product: any) {
  return product.health?.warnings?.some((warning: any) => warning.code === "stale_update") ?? false;
}

function isLowRating(product: any) {
  const rating = Number(product.ratingScore ?? product.latestSnapshot?.ratingScore ?? 0);
  return Number.isFinite(rating) && rating > 0 && rating < 3.8;
}

function isActiveProduct(product: any) {
  return product.status !== "inactive" && product.health?.status !== "critical" && !isStale(product);
}

function interestScore(product: any) {
  const sold = Number(product.soldCountNormalized ?? product.latestSnapshot?.soldCountNormalized ?? 0);
  const rating = Number(product.ratingScore ?? product.latestSnapshot?.ratingScore ?? 0);
  const reviews = parseCompact(product.reviewCountText ?? product.latestSnapshot?.reviewCountText);
  const activeBoost = isActiveProduct(product) ? 25 : -30;
  return Math.round(
    Math.min(100, Math.log10(sold + 1) * 11 + Math.max(0, rating - 3.5) * 18 + Math.log10(reviews + 1) * 7 + activeBoost),
  );
}

function copyFor(language: string) {
  const th = language.startsWith("th");
  return {
    back: th ? "กลับ Dashboard" : "Dashboard",
    title: th ? "Marketplace Capture" : "Marketplace Capture",
    subtitle: th ? "วิเคราะห์สินค้า marketplace ที่เก็บไว้ เลือกสินค้าขายดี rating ดี รีวิวเยอะ และยัง active อยู่" : "Analyze captured marketplace products, find active winners, and monitor stale or weak listings.",
    search: th ? "ค้นหาชื่อสินค้า ร้านค้า หมวดหมู่ หรือ URL" : "Search product, shop, category, or URL",
    ownOnly: th ? "เฉพาะสินค้าที่ฉันเพิ่ม" : "Only my products",
    platformAll: th ? "ทั้งหมด" : "All",
    active: th ? "Active / น่าสนใจ" : "Active / Recommended",
    needsUpdate: th ? "ขาดการ update" : "Needs update",
    inactive: th ? "ขายไม่ขยับ" : "Low activity",
    lowRating: th ? "Rating ต่ำ" : "Low rating",
    category: th ? "หมวดหมู่" : "Category",
    allCategories: th ? "ทุกหมวดหมู่" : "All categories",
    sort: th ? "เรียงตาม" : "Sort",
    recommended: th ? "น่าสนใจที่สุด" : "Recommended",
    sold: th ? "ยอดขายสูง" : "Sold",
    rating: th ? "Rating สูง" : "Rating",
    updated: th ? "Update ล่าสุด" : "Latest update",
    exportCsv: th ? "Export CSV" : "Export CSV",
    exportJson: th ? "Export JSON" : "Export JSON",
    health: th ? "สถานะสินค้า" : "Product Health",
    recommendations: th ? "สินค้าแนะนำ" : "Recommended Products",
    products: th ? "รายการสินค้า" : "Products",
    captures: th ? "Capture ล่าสุด" : "Recent Captures",
    batches: th ? "Candidate Batches" : "Candidate Batches",
    empty: th ? "ยังไม่พบสินค้า" : "No products found",
    shared: th ? "แชร์จาก group" : "Shared group",
    own: th ? "ของฉัน" : "Mine",
    lastChecked: th ? "ตรวจล่าสุด" : "Last checked",
    viewPanel: th ? "ดูด้านขวา" : "Side panel",
    openTab: th ? "เปิดแท็บใหม่" : "New tab",
    close: th ? "ปิด" : "Close",
    sourcePage: th ? "หน้าต้นทาง" : "Source page",
    images: th ? "รูปภาพ" : "Images",
    history: th ? "ประวัติ" : "History",
    deleteProduct: th ? "ลบสินค้า" : "Delete",
    deleteConfirm: th ? "ยืนยันลบสินค้านี้ออกจาก Marketplace Capture หรือไม่?" : "Delete this product from Marketplace Capture?",
    deleteOnlyMine: th ? "ลบได้เฉพาะสินค้าที่คุณเพิ่มเอง" : "Only products you added can be deleted",
    deleteSuccess: th ? "ลบสินค้าแล้ว" : "Product deleted",
    deleteError: th ? "ลบสินค้าไม่สำเร็จ" : "Could not delete product",
    deleteDialogTitle: th ? "ยืนยันการลบสินค้า" : "Delete product?",
    deleteDialogDescription: th
      ? "สินค้านี้จะถูกลบออกจาก Marketplace Capture และจะไม่แสดงในรายการแนะนำหรือรายการสินค้าอีก"
      : "This product will be removed from Marketplace Capture and hidden from recommendations and product lists.",
    deleteDialogMeta: th ? "รายการที่จะลบ" : "Product to delete",
    deleteDialogWarning: th ? "การลบนี้ไม่สามารถย้อนกลับจากหน้านี้ได้" : "This action cannot be undone from this page.",
    visualSearch: th ? "ค้นหาด้วยภาพ" : "Search by image",
    visualSearchTitle: th ? "ค้นหาสินค้าคล้ายกันด้วยภาพ" : "Find similar products by image",
    visualSearchHint: th ? "แนบรูปหรือถ่ายรูปสินค้า ระบบจะค้นหาสินค้าที่หน้าตาใกล้เคียงใน Marketplace Capture" : "Upload or capture a product photo to find visually similar marketplace products.",
    uploadImage: th ? "แนบรูป" : "Upload image",
    openCamera: th ? "เปิดกล้อง" : "Open camera",
    capturePhoto: th ? "ถ่ายรูป" : "Capture photo",
    stopCamera: th ? "ปิดกล้อง" : "Stop camera",
    switchCamera: th ? "สลับกล้อง" : "Switch camera",
    rearCamera: th ? "กล้องหลัง" : "Rear camera",
    frontCamera: th ? "กล้องหน้า" : "Front camera",
    cameraStarting: th ? "กำลังเปิดกล้อง..." : "Opening camera...",
    cameraUnsupported: th ? "เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับการเปิดกล้อง กรุณาแนบรูปแทน" : "This browser or device does not support camera capture. Please upload an image instead.",
    cameraPermissionDenied: th ? "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์" : "Camera permission was denied. Please allow camera access in your browser.",
    clearVisualSearch: th ? "ล้างผลค้นหาด้วยภาพ" : "Clear visual search",
    visualResults: th ? "ผลค้นหาด้วยภาพ" : "Visual search results",
    similarScore: th ? "ความคล้าย" : "Similarity",
    noVisualResults: th ? "ยังไม่พบสินค้าที่คล้ายกัน" : "No similar products found",
    imageTooLarge: th ? "รูปภาพต้องมีขนาดไม่เกิน 5MB" : "Image must be 5MB or smaller",
    cameraError: th ? "เปิดกล้องไม่สำเร็จ" : "Could not open camera",
    affiliateLink: th ? "ลิงก์ affiliate" : "Affiliate link",
    copyAffiliate: th ? "คัดลอก affiliate" : "Copy affiliate",
    loaded: th ? "โหลดแล้ว" : "Loaded",
    loadingMore: th ? "กำลังโหลดสินค้าเพิ่ม..." : "Loading more products...",
    loadMore: th ? "โหลดสินค้าเพิ่ม" : "Load more products",
    endOfList: th ? "แสดงสินค้าครบแล้ว" : "All matching products loaded",
    popularCategories: th ? "หมวดหมู่ยอดนิยม" : "Popular categories",
    copiedAffiliate: th ? "คัดลอกลิงก์ affiliate แล้ว" : "Affiliate link copied",
    cancel: th ? "ยกเลิก" : "Cancel",
    deleting: th ? "กำลังลบ..." : "Deleting...",
  };
}

export default function MarketplaceCaptureProducts() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [health, setHealth] = useState<HealthFilter>("all");
  const [category, setCategory] = useState("all");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"recommended" | "sold" | "rating" | "updated">("recommended");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deletedProductIds, setDeletedProductIds] = useState<Set<string>>(() => new Set());
  const [productPendingDelete, setProductPendingDelete] = useState<any | null>(null);
  const productListSentinelRef = useRef<HTMLDivElement | null>(null);
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [visualSearchOpen, setVisualSearchOpen] = useState(false);
  const [visualSearchPreviewUrl, setVisualSearchPreviewUrl] = useState<string | null>(null);
  const [visualSearchResults, setVisualSearchResults] = useState<any[] | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>("environment");
  const visualSearchFileInputRef = useRef<HTMLInputElement | null>(null);
  const visualSearchVideoRef = useRef<HTMLVideoElement | null>(null);
  const visualSearchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualSearchStreamRef = useRef<MediaStream | null>(null);
  const visualSearchPreviewUrlRef = useRef<string | null>(null);
  const visualSearchOpenRef = useRef(false);
  const visualSearchCameraRequestRef = useRef(0);
  const [manualProductForm, setManualProductForm] = useState({
    platform: "shopee" as "shopee" | "tiktok_shop",
    productName: "",
    productPageUrl: "",
    priceCurrent: "",
    commissionRatePercent: "",
    soldCountText: "",
    capturedCategoryText: "",
    shopName: "",
    productCategory: "auto" as ProductReferenceCategory,
    ratingScore: "",
    reviewCountText: "",
    descriptionText: "",
  });
  const { i18n } = useScopedTranslation(["common"]);
  const language = i18n.resolvedLanguage || i18n.language || "en";
  const copy = copyFor(language);
  const utils = trpc.useUtils();

  const captures = trpc.marketplaceCapture.listCaptures.useQuery({ limit: 20 });
  const products = trpc.marketplaceCapture.listProducts.useInfiniteQuery(
    {
      limit: 24,
      cursor: null,
      ownerOnly,
      platform,
      query: query.trim() || undefined,
      category: category === "all" ? undefined : category,
      sortMode,
    },
    {
      initialCursor: null,
      getNextPageParam: (lastPage: any) => Array.isArray(lastPage) ? undefined : lastPage.nextCursor ?? undefined,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  );
  const batches = trpc.marketplaceCapture.listCandidateBatches.useQuery({ limit: 10 });
  const selectedProductDetail = trpc.marketplaceCapture.getProduct.useQuery(
    { productId: selectedProductId ?? "" },
    { enabled: Boolean(selectedProductId) },
  );
  const createManualProductMutation = trpc.marketplaceCapture.createManualProduct.useMutation({
    onSuccess: async result => {
      toast.success("เพิ่มสินค้า Manual แล้ว");
      setManualProductOpen(false);
      setManualProductForm(current => ({
        ...current,
        productName: "",
        productPageUrl: "",
        priceCurrent: "",
        commissionRatePercent: "",
        soldCountText: "",
        capturedCategoryText: "",
        shopName: "",
        ratingScore: "",
        reviewCountText: "",
        descriptionText: "",
      }));
      await utils.marketplaceCapture.listProducts.invalidate();
      setLocation(result.productUrl);
    },
    onError: error => toast.error(error.message),
  });
  const deleteProductMutation = trpc.marketplaceCapture.deleteProduct.useMutation({
    onMutate: async (variables) => {
      await utils.marketplaceCapture.listProducts.cancel();
      setDeletedProductIds((current) => new Set(current).add(variables.productId));
      if (selectedProductId === variables.productId) setSelectedProductId(null);
    },
    onSuccess: async (_, variables) => {
      if (selectedProductId === variables.productId) setSelectedProductId(null);
      setProductPendingDelete(null);
      toast.success(copy.deleteSuccess);
      await Promise.all([
        utils.marketplaceCapture.listProducts.invalidate(),
        utils.marketplaceCapture.getProduct.invalidate({ productId: variables.productId }),
        utils.marketplaceCapture.listProductImages.invalidate(),
      ]);
    },
    onError: (error, variables) => {
      setDeletedProductIds((current) => {
        const next = new Set(current);
        next.delete(variables.productId);
        return next;
      });
      setProductPendingDelete(null);
      toast.error(`${copy.deleteError}: ${error.message}`);
    },
  });
  const visualSearchMutation = trpc.marketplaceCapture.searchSimilarProductsByImage.useMutation({
    onSuccess: (result: any) => {
      const items = Array.isArray(result?.items) ? result.items : [];
      setVisualSearchResults(items);
      setSelectedProductId(null);
      setCategory("all");
      setHealth("all");
      setVisualSearchOpen(false);
      stopVisualSearchCamera();
      toast.success(items.length > 0 ? `${copy.visualResults}: ${items.length}` : copy.noVisualResults);
    },
    onError: error => toast.error(error.message),
  });

  const loadedProducts = useMemo(
    () => (
      (products.data?.pages ?? []).flatMap((page: any) => Array.isArray(page) ? page : page.items ?? []) as any[]
    ),
    [products.data?.pages],
  );

  const visibleProducts = useMemo(
    () => loadedProducts.filter((product: any) => !deletedProductIds.has(product.id)),
    [deletedProductIds, loadedProducts],
  );

  const productSource = useMemo(
    () => (visualSearchResults ?? visibleProducts).filter((product: any) => !deletedProductIds.has(product.id)),
    [deletedProductIds, visibleProducts, visualSearchResults],
  );

  const scopedProducts = useMemo(
    () => productSource
      .filter((product: any) => !ownerOnly || product.accessType !== "group")
      .filter((product: any) => platform === "all" || product.platform === platform),
    [ownerOnly, platform, productSource],
  );

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const product of scopedProducts) values.add(String(productCategory(product)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [scopedProducts]);

  const filteredProducts = useMemo(() => {
    const needle = visualSearchResults ? "" : query.trim().toLowerCase();
    return scopedProducts
      .filter((product: any) => category === "all" || productCategory(product) === category)
      .filter((product: any) => {
        if (!needle) return true;
        const text = `${product.productName ?? ""} ${product.brand ?? ""} ${product.shopName ?? ""} ${product.sourceUrl ?? ""} ${product.affiliateUrl ?? ""} ${productCategory(product)}`.toLowerCase();
        return text.includes(needle);
      })
      .filter((product: any) => {
        if (health === "all") return true;
        if (health === "active") return isActiveProduct(product);
        if (health === "needs_update") return isStale(product);
        if (health === "low_rating") return isLowRating(product);
        if (health === "inactive") return product.health?.warnings?.some((warning: any) => warning.code === "sold_not_growing" || warning.code === "low_sold_velocity");
        return true;
      })
      .sort((a: any, b: any) => {
        if (visualSearchResults) {
          const leftScore = Number(a.visualMatchScore ?? -1);
          const rightScore = Number(b.visualMatchScore ?? -1);
          if (rightScore !== leftScore) return rightScore - leftScore;
        }
        if (sortMode === "sold") return Number(b.soldCountNormalized ?? 0) - Number(a.soldCountNormalized ?? 0);
        if (sortMode === "rating") return Number(b.ratingScore ?? 0) - Number(a.ratingScore ?? 0);
        if (sortMode === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return interestScore(b) - interestScore(a);
      });
  }, [category, health, query, scopedProducts, sortMode, visualSearchResults]);

  const filteredCaptures = useMemo(() => (captures.data ?? []).filter((capture: any) => platform === "all" || capture.platform === platform), [captures.data, platform]);
  const filteredBatches = useMemo(() => (batches.data ?? []).filter((batch: any) => platform === "all" || batch.platform === platform), [batches.data, platform]);
  const recommendedProducts = filteredProducts.filter((product: any) => isActiveProduct(product)).slice(0, 8);
  const healthCounts = useMemo(() => {
    const rows = scopedProducts;
    return {
      active: rows.filter((product: any) => isActiveProduct(product)).length,
      stale: rows.filter((product: any) => isStale(product)).length,
      lowRating: rows.filter((product: any) => isLowRating(product)).length,
      inactive: rows.filter((product: any) => product.health?.warnings?.some((warning: any) => warning.code === "sold_not_growing" || warning.code === "low_sold_velocity")).length,
    };
  }, [scopedProducts]);
  const categoryQuickFilters = useMemo(() => categories.slice(0, 8), [categories]);

  useEffect(() => {
    if (visualSearchResults) return;
    const node = productListSentinelRef.current;
    if (!node || !products.hasNextPage || products.isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void products.fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [products.fetchNextPage, products.hasNextPage, products.isFetchingNextPage, filteredProducts.length, visualSearchResults]);

  useEffect(() => {
    visualSearchOpenRef.current = visualSearchOpen;
  }, [visualSearchOpen]);

  useEffect(() => () => {
    visualSearchStreamRef.current?.getTracks().forEach((track) => track.stop());
    const previewUrl = visualSearchPreviewUrlRef.current;
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, []);

  function downloadJson(name: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv(name: string, rows: any[]) {
    const headers = ["id", "platform", "productName", "category", "sourceUrl", "affiliateUrl", "priceCurrent", "commissionRatePercent", "soldCountText", "ratingScore", "reviewCountText", "health", "updatedAt"];
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => JSON.stringify(
        header === "category" ? productCategory(row) :
        header === "health" ? row.health?.status ?? "ok" :
        row[header] ?? "",
      )).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openProductInNewTab(productId: string) {
    window.open(`/marketplace-capture/products/${productId}`, "_blank", "noopener,noreferrer");
  }

  function copyAffiliateLink(url: string | null | undefined) {
    if (!url) return;
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(url).then(() => toast.success(copy.copiedAffiliate));
  }

  function requestDeleteProduct(product: any) {
    if (product.accessType === "group") {
      toast.error(copy.deleteOnlyMine);
      return;
    }
    setProductPendingDelete(product);
  }

  function confirmDeleteProduct() {
    if (!productPendingDelete) return;
    const productId = productPendingDelete.id;
    setProductPendingDelete(null);
    deleteProductMutation.mutate({ productId });
  }

  function updateManualProductField(key: keyof typeof manualProductForm, value: string) {
    setManualProductForm(current => ({ ...current, [key]: value }));
  }

  function submitManualProduct() {
    if (!manualProductForm.productName.trim()) {
      toast.error("กรุณากรอกชื่อสินค้า");
      return;
    }
    createManualProductMutation.mutate(manualProductForm);
  }

  function setVisualSearchPreview(url: string | null) {
    const current = visualSearchPreviewUrlRef.current;
    if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
    visualSearchPreviewUrlRef.current = url;
    setVisualSearchPreviewUrl(url);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === "string" ? reader.result : "";
        resolve(value.includes(",") ? value.split(",")[1] ?? "" : value);
      };
      reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function submitVisualSearchImage(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(copy.imageTooLarge);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("รองรับเฉพาะรูป PNG, JPEG หรือ WebP");
      return;
    }
    stopVisualSearchCamera();
    const preview = URL.createObjectURL(file);
    setVisualSearchPreview(preview);
    let imageBase64 = "";
    try {
      imageBase64 = await fileToBase64(file);
    } catch {
      setVisualSearchPreview(null);
      toast.error("อ่านไฟล์รูปภาพไม่สำเร็จ");
      return;
    }
    visualSearchMutation.mutate({
      imageBase64,
      mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
      limit: 24,
      ownerOnly,
      platform,
    });
  }

  function handleVisualSearchFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void submitVisualSearchImage(file);
  }

  async function getVisualSearchCameraStream(facingMode: CameraFacingMode): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("camera_unsupported");
    }
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { exact: facingMode } }, audio: false },
      { video: { facingMode: { ideal: facingMode } }, audio: false },
      { video: true, audio: false },
    ];
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : "";
        if (errorName === "NotAllowedError" || errorName === "SecurityError") {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError ?? new Error("camera_unavailable");
  }

  async function startVisualSearchCamera(facingMode: CameraFacingMode = cameraFacingMode) {
    const requestId = visualSearchCameraRequestRef.current + 1;
    visualSearchCameraRequestRef.current = requestId;
    setCameraStarting(true);
    try {
      stopVisualSearchCamera(false, false);
      const stream = await getVisualSearchCameraStream(facingMode);
      if (!visualSearchOpenRef.current || visualSearchCameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      visualSearchStreamRef.current = stream;
      setCameraFacingMode(facingMode);
      setCameraActive(true);
      if (visualSearchVideoRef.current) {
        visualSearchVideoRef.current.srcObject = stream;
        await visualSearchVideoRef.current.play();
      }
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "";
      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage === "camera_unsupported") {
        toast.error(copy.cameraUnsupported);
      } else if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        toast.error(copy.cameraPermissionDenied);
      } else {
        toast.error(copy.cameraError);
      }
    } finally {
      if (visualSearchCameraRequestRef.current === requestId) {
        setCameraStarting(false);
      }
    }
  }

  function stopVisualSearchCamera(cancelPending = true, resetStarting = true) {
    if (cancelPending) visualSearchCameraRequestRef.current += 1;
    visualSearchStreamRef.current?.getTracks().forEach((track) => track.stop());
    visualSearchStreamRef.current = null;
    setCameraActive(false);
    if (resetStarting) setCameraStarting(false);
    if (visualSearchVideoRef.current) {
      visualSearchVideoRef.current.srcObject = null;
    }
  }

  function switchVisualSearchCamera() {
    const nextFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    setCameraFacingMode(nextFacingMode);
    if (cameraActive || cameraStarting) {
      void startVisualSearchCamera(nextFacingMode);
    }
  }

  function captureVisualSearchPhoto() {
    const video = visualSearchVideoRef.current;
    const canvas = visualSearchCanvasRef.current;
    if (!video || !canvas || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setVisualSearchPreview(dataUrl);
    const imageBase64 = dataUrl.split(",")[1] ?? "";
    visualSearchMutation.mutate({
      imageBase64,
      mimeType: "image/jpeg",
      limit: 24,
      ownerOnly,
      platform,
    });
    stopVisualSearchCamera();
  }

  function clearVisualSearch() {
    setVisualSearchResults(null);
    setVisualSearchPreview(null);
    stopVisualSearchCamera();
  }

  function productCard(product: any) {
    const score = interestScore(product);
    const imageUrl = primaryProductImageUrl(product);
    return (
      <article
        key={product.id}
        className={`group cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          selectedProductId === product.id ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
        }`}
        onClick={() => setSelectedProductId(product.id)}
      >
        <div className="grid gap-3 p-3 2xl:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 2xl:aspect-square 2xl:h-36 2xl:w-36">
            {imageUrl ? (
              <AuthenticatedMediaImage
                src={imageUrl}
                alt={product.productName ? `${product.productName} product image` : "Product image"}
                className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                loading="lazy"
                fallback={<ImageIcon className="h-10 w-10 text-slate-300" aria-hidden="true" />}
              />
            ) : (
              <ImageIcon className="h-10 w-10 text-slate-300" aria-hidden="true" />
            )}
            {typeof product.visualMatchScore === "number" ? (
              <span className="absolute left-2 top-2 rounded-full bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
                {copy.visualSearch}
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="line-clamp-3 font-semibold leading-6 text-slate-950">{product.productName}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{productCategory(product)}</div>
                {typeof product.visualMatchScore === "number" ? (
                  <div className="mt-2 inline-flex items-center rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-100">
                    {copy.similarScore} {Math.round(product.visualMatchScore * 100)}%
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{score}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3 text-sm">
          <div><div className="text-xs text-slate-500">Price</div><div className="font-medium">{product.priceCurrent ?? "-"} {product.currency ?? "THB"}</div></div>
          <div><div className="text-xs text-slate-500">Commission</div><div className="font-medium">{formatCommissionRate(product.commissionRatePercent)}</div><div className="text-xs text-slate-500">{formatCommissionAmount(product)}</div></div>
          <div><div className="text-xs text-slate-500">Sold</div><div className="font-medium">{formatCompactCount(product.soldCountNormalized, product.soldCountText)}</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 text-xs">
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{product.platform === "shopee" ? "Shopee" : "TikTok"}</span>
          <span className={product.accessType === "group" ? "rounded bg-blue-50 px-2 py-1 text-blue-700" : "rounded bg-slate-100 px-2 py-1 text-slate-700"}>
            {product.accessType === "group" ? copy.shared : copy.own}
          </span>
          <span className={`rounded px-2 py-1 ${
            product.health?.status === "critical" ? "bg-red-50 text-red-700" :
            product.health?.status === "warning" ? "bg-amber-50 text-amber-700" :
            "bg-emerald-50 text-emerald-700"
          }`}>{product.health?.status ?? "ok"}</span>
        </div>
        <div className="px-3 pb-3 text-xs text-slate-500">{copy.lastChecked}: {product.health?.lastCheckedAt ? new Date(product.health.lastCheckedAt).toLocaleString() : "-"}</div>
        {product.health?.warnings?.[0]?.message ? <div className="px-3 pb-3 text-xs text-amber-700">{product.health.warnings[0].message}</div> : null}
        {product.affiliateUrl ? (
          <button
            className="mx-3 mb-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            onClick={(event) => {
              event.stopPropagation();
              copyAffiliateLink(product.affiliateUrl);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="truncate">{copy.affiliateLink}</span>
          </button>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
          <button
            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedProductId(product.id);
            }}
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            {copy.viewPanel}
          </button>
          <button
            className="inline-flex items-center rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={(event) => {
              event.stopPropagation();
              openProductInNewTab(product.id);
            }}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            {copy.openTab}
          </button>
          <button
            className="inline-flex items-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleteProductMutation.isPending}
            onClick={(event) => {
              event.stopPropagation();
              requestDeleteProduct(product);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {copy.deleteProduct}
          </button>
        </div>
      </article>
    );
  }

  const selectedListProduct = useMemo(
    () => productSource.find((product: any) => product.id === selectedProductId) ?? null,
    [productSource, selectedProductId],
  );
  const selectedData = selectedProductDetail.data as any;
  const panelProduct = selectedData?.product ?? selectedListProduct;
  const panelImages = selectedData?.images ?? [];
  const panelHistory = selectedData?.history ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} aria-label={copy.back}>
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{copy.back}</span>
              </Button>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold">{copy.title}</h1>
                <p className="line-clamp-2 text-xs text-slate-500 sm:line-clamp-1">{copy.subtitle}</p>
              </div>
            </div>
            <LocaleToggle className="hidden sm:inline-flex" />
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur">
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="w-full rounded-md border px-9 py-2 text-sm" placeholder={copy.search} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="rounded-md border px-3 py-2 text-sm" value={health} onChange={(e) => setHealth(e.target.value as HealthFilter)}>
                <option value="all">{copy.platformAll}</option>
                <option value="active">{copy.active}</option>
                <option value="needs_update">{copy.needsUpdate}</option>
                <option value="inactive">{copy.inactive}</option>
                <option value="low_rating">{copy.lowRating}</option>
              </select>
              <select className="rounded-md border px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">{copy.allCategories}</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="rounded-md border px-3 py-2 text-sm" value={sortMode} onChange={(e) => setSortMode(e.target.value as any)}>
                <option value="recommended">{copy.recommended}</option>
                <option value="sold">{copy.sold}</option>
                <option value="rating">{copy.rating}</option>
                <option value="updated">{copy.updated}</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => setManualProductOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add manual product
              </Button>
              <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setVisualSearchOpen(true)}>
                <Camera className="mr-2 h-4 w-4" />
                {copy.visualSearch}
              </Button>
              {(["all", "shopee", "tiktok_shop"] as PlatformFilter[]).map((item) => (
                <button
                  key={item}
                  className={`min-h-9 flex-1 rounded-md border px-3 py-2 text-sm sm:flex-none ${platform === item ? "border-blue-300 bg-blue-50 text-blue-700" : "bg-white"}`}
                  onClick={() => setPlatform(item)}
                >
                  {item === "all" ? copy.platformAll : item === "shopee" ? "Shopee" : "TikTok Shop"}
                </button>
              ))}
              <label className="inline-flex min-h-9 w-full items-center rounded-md border bg-white px-3 py-2 text-sm sm:w-auto">
                <input className="mr-2" type="checkbox" checked={ownerOnly} onChange={(e) => setOwnerOnly(e.target.checked)} />
                {copy.ownOnly}
              </label>
              <button className="min-h-9 flex-1 rounded-md border bg-white px-3 py-2 text-sm sm:flex-none" onClick={() => downloadCsv("marketplace-products.csv", filteredProducts)}><Download className="mr-1 inline h-4 w-4" />{copy.exportCsv}</button>
              <button className="min-h-9 flex-1 rounded-md border bg-white px-3 py-2 text-sm sm:flex-none" onClick={() => downloadJson("marketplace-capture-export.json", { products: filteredProducts, captures: filteredCaptures, batches: filteredBatches })}>{copy.exportJson}</button>
            </div>
            {visualSearchResults ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
                <div className="flex min-w-0 items-center gap-2">
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{copy.visualResults}</span>
                  <span className="text-cyan-700">{filteredProducts.length} รายการ</span>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-100"
                  onClick={clearVisualSearch}
                >
                  {copy.clearVisualSearch}
                </button>
              </div>
            ) : null}
            {categoryQuickFilters.length > 0 ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{copy.popularCategories}</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${category === "all" ? "border-blue-300 bg-blue-50 text-blue-700" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => setCategory("all")}
                  >
                    {copy.allCategories}
                  </button>
                  {categoryQuickFilters.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${category === item ? "border-blue-300 bg-blue-50 text-blue-700" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                      onClick={() => setCategory(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <button className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-left" onClick={() => setHealth("active")}><div className="text-2xl font-semibold text-emerald-700">{healthCounts.active}</div><div className="text-sm text-emerald-700">{copy.active}</div></button>
            <button className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-left" onClick={() => setHealth("needs_update")}><div className="text-2xl font-semibold text-amber-700">{healthCounts.stale}</div><div className="text-sm text-amber-700">{copy.needsUpdate}</div></button>
            <button className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-left" onClick={() => setHealth("inactive")}><div className="text-2xl font-semibold text-orange-700">{healthCounts.inactive}</div><div className="text-sm text-orange-700">{copy.inactive}</div></button>
            <button className="rounded-xl border border-red-100 bg-red-50 p-4 text-left" onClick={() => setHealth("low_rating")}><div className="text-2xl font-semibold text-red-700">{healthCounts.lowRating}</div><div className="text-sm text-red-700">{copy.lowRating}</div></button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{copy.products} ({filteredProducts.length})</h2>
              <span className="text-xs text-slate-500">{copy.loaded} {productSource.length}</span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {filteredProducts.length > 0 ? filteredProducts.map(productCard) : <p className="text-sm text-slate-500">{visualSearchResults ? copy.noVisualResults : copy.empty}</p>}
            </div>
            <div ref={productListSentinelRef} className="mt-5 flex min-h-12 items-center justify-center">
              {visualSearchResults ? null : products.isFetchingNextPage ? (
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {copy.loadingMore}
                </div>
              ) : products.hasNextPage ? (
                <Button type="button" variant="outline" onClick={() => void products.fetchNextPage()}>
                  {copy.loadMore}
                </Button>
              ) : filteredProducts.length > 0 ? (
                <div className="text-sm text-slate-500">{copy.endOfList}</div>
              ) : null}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{copy.captures}</h2>
              <div className="mt-3 divide-y">
                {filteredCaptures.slice(0, 8).map((capture: any) => (
                  <a key={capture.id} className="block py-3 hover:bg-slate-50" href={`/marketplace-capture/captures/${capture.id}/preview`}>
                    <div className="font-medium">{capture.pageTitle || capture.sourceUrl}</div>
                    <div className="text-sm text-slate-500">{capture.platform} | {capture.status} | {new Date(capture.createdAt).toLocaleString()}</div>
                  </a>
                ))}
                {filteredCaptures.length === 0 ? <p className="py-3 text-sm text-slate-500">-</p> : null}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{copy.batches}</h2>
              <div className="mt-3 divide-y">
                {filteredBatches.slice(0, 8).map((batch: any) => (
                  <a key={batch.id} className="block py-3 hover:bg-slate-50" href={`/marketplace-capture/candidates/${batch.id}`}>
                    <div className="font-medium">{batch.categoryName || batch.sourceUrl}</div>
                    <div className="text-sm text-slate-500">{batch.platform} | {batch.count} candidates | {new Date(batch.createdAt).toLocaleString()}</div>
                  </a>
                ))}
                {filteredBatches.length === 0 ? <p className="py-3 text-sm text-slate-500">-</p> : null}
              </div>
            </section>
          </div>
          </div>
          <aside className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain">
            <section className="rounded-xl border border-emerald-100 bg-white/90 p-4 shadow-sm backdrop-blur">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{copy.recommendations}</h2>
                  <p className="text-xs text-slate-500">{copy.loaded} {recommendedProducts.length}</p>
                </div>
              </div>
              <div className="space-y-3">
                {recommendedProducts.length > 0 ? recommendedProducts.map(productCard) : <p className="text-sm text-slate-500">{visualSearchResults ? copy.noVisualResults : copy.empty}</p>}
              </div>
            </section>
          </aside>
        </div>
      </main>
      {panelProduct ? (
        <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl sm:inset-y-4 sm:right-4 sm:rounded-xl sm:border">
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0 flex-1 pr-2">
              <div className="text-xs font-medium uppercase text-slate-500">{panelProduct.platform === "shopee" ? "Shopee" : "TikTok Shop"}</div>
              <h2 className="mt-1 line-clamp-3 text-lg font-semibold text-slate-950">{panelProduct.productName}</h2>
            </div>
            <button className="shrink-0 rounded-md border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100" aria-label={copy.close} onClick={() => setSelectedProductId(null)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Price</div><div className="font-medium">{panelProduct.priceCurrent ?? "-"} {panelProduct.currency ?? "THB"}</div></div>
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Commission</div><div className="font-medium">{formatCommissionRate(panelProduct.commissionRatePercent)}</div><div className="text-xs text-slate-500">{formatCommissionAmount(panelProduct)}</div></div>
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Sold</div><div className="font-medium">{formatCompactCount(panelProduct.soldCountNormalized, panelProduct.soldCountText)}</div></div>
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Rating</div><div className="font-medium">{panelProduct.ratingScore ?? "-"}</div></div>
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Reviews</div><div className="font-medium">{formatCompactCount(panelProduct.reviewCountText, panelHistory[0]?.reviewCountNormalized)}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/marketplace-capture/products/${panelProduct.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" />
                {copy.openTab}
              </a>
              {panelProduct.sourceUrl ? (
                <a className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={panelProduct.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-4 w-4" />
                  {copy.sourcePage}
                </a>
              ) : null}
              {panelProduct.affiliateUrl ? (
                <button
                  className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                  type="button"
                  onClick={() => copyAffiliateLink(panelProduct.affiliateUrl)}
                >
                  <Copy className="mr-1 h-4 w-4" />
                  {copy.copyAffiliate}
                </button>
              ) : null}
              <button
                className="inline-flex items-center rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleteProductMutation.isPending}
                onClick={() => requestDeleteProduct(panelProduct)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {copy.deleteProduct}
              </button>
            </div>
            {panelProduct.affiliateUrl ? (
              <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm">
                <div className="text-xs font-medium text-emerald-800">{copy.affiliateLink}</div>
                <a className="mt-1 block truncate text-emerald-700 underline" href={panelProduct.affiliateUrl} target="_blank" rel="noreferrer">
                  {panelProduct.affiliateUrl}
                </a>
              </div>
            ) : null}
            {selectedProductDetail.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : null}
            {panelImages.length > 0 ? (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900">{copy.images}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {panelImages.slice(0, 12).map((image: any) => (
                    <AuthenticatedMediaImage key={image.id} className="h-24 w-full rounded-md border object-contain" src={image.url} alt={image.type} loading="lazy" />
                  ))}
                </div>
              </section>
            ) : null}
            {panelHistory.length > 0 ? (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900">{copy.history}</h3>
                <div className="mt-2 divide-y rounded-md border text-sm">
                  {panelHistory.slice(0, 5).map((snapshot: any) => (
                    <div key={snapshot.id} className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-3 sm:gap-2">
                      <div>{new Date(snapshot.capturedAt).toLocaleDateString()}</div>
                      <div>{formatCompactCount(snapshot.soldCountNormalized, snapshot.soldCountText)}</div>
                      <div>{snapshot.ratingScore ?? "-"}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Description</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{panelProduct.descriptionText || "-"}</p>
            </section>
          </div>
        </aside>
      ) : null}
      {visualSearchOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 p-3 sm:p-4">
          <section className="mx-auto my-3 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col rounded-xl bg-white p-4 shadow-2xl sm:my-8 sm:max-h-[calc(100dvh-4rem)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{copy.visualSearchTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{copy.visualSearchHint}</p>
              </div>
              <button
                className="rounded-md border p-2"
                onClick={() => {
                  setVisualSearchOpen(false);
                  stopVisualSearchCamera();
                }}
                aria-label={copy.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid min-h-0 gap-4 overflow-y-auto pr-1 md:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className="inline-flex min-h-20 items-center justify-center rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 sm:min-h-24 sm:py-5"
                    onClick={() => visualSearchFileInputRef.current?.click()}
                    disabled={visualSearchMutation.isPending || cameraStarting}
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    {copy.uploadImage}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-20 items-center justify-center rounded-lg border border-dashed border-cyan-300 bg-cyan-50 px-4 py-4 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-24 sm:py-5"
                    onClick={cameraActive ? () => stopVisualSearchCamera() : () => void startVisualSearchCamera()}
                    disabled={visualSearchMutation.isPending || cameraStarting}
                  >
                    {cameraStarting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
                    {cameraStarting ? copy.cameraStarting : cameraActive ? copy.stopCamera : copy.openCamera}
                  </button>
                </div>
                <input
                  ref={visualSearchFileInputRef}
                  className="hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleVisualSearchFile}
                />

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                  <video
                    ref={visualSearchVideoRef}
                    className={`aspect-video w-full object-contain ${cameraActive ? "block" : "hidden"}`}
                    playsInline
                    muted
                  />
                  {cameraStarting ? (
                    <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {copy.cameraStarting}
                      </div>
                    </div>
                  ) : !cameraActive ? (
                    <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">
                      {visualSearchPreviewUrl ? (
                        <img src={visualSearchPreviewUrl} alt={copy.visualSearch} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon className="h-8 w-8 text-slate-300" />
                          <span>{copy.visualSearch}</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                <canvas ref={visualSearchCanvasRef} className="hidden" />

                {cameraActive ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={captureVisualSearchPhoto}
                      disabled={visualSearchMutation.isPending || cameraStarting}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      {copy.capturePhoto}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={switchVisualSearchCamera}
                      disabled={visualSearchMutation.isPending || cameraStarting}
                      title={`${copy.switchCamera}: ${cameraFacingMode === "environment" ? copy.rearCamera : copy.frontCamera}`}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {copy.switchCamera}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">{copy.visualResults}</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {visualSearchMutation.isPending
                    ? "กำลังวิเคราะห์รูปและค้นหาสินค้าที่คล้ายกัน..."
                    : visualSearchResults
                      ? `${filteredProducts.length} รายการ`
                      : "เลือกรูปสินค้าเพื่อเริ่มค้นหา"}
                </div>
                {visualSearchMutation.isPending ? (
                  <div className="mt-4 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching
                  </div>
                ) : null}
                {visualSearchPreviewUrl && !visualSearchMutation.isPending ? (
                  <button
                    type="button"
                    className="mt-4 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    onClick={clearVisualSearch}
                  >
                    {copy.clearVisualSearch}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {manualProductOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 p-3 sm:p-4">
          <section className="mx-auto my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:my-8 sm:max-h-[calc(100dvh-4rem)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Add manual product</h2>
                <p className="mt-1 text-sm text-slate-500">กรอกข้อมูลสินค้าเอง แล้วนำไปแก้ไข/วิเคราะห์ AI Insights ต่อได้ทันที</p>
              </div>
              <button className="rounded-md border p-2" onClick={() => setManualProductOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium">
                Platform
                <select className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.platform} onChange={event => updateManualProductField("platform", event.target.value)}>
                  <option value="shopee">Shopee</option>
                  <option value="tiktok_shop">TikTok Shop</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Product name
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.productName} onChange={event => updateManualProductField("productName", event.target.value)} />
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Product page
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.productPageUrl} onChange={event => updateManualProductField("productPageUrl", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Price
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.priceCurrent} onChange={event => updateManualProductField("priceCurrent", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Commission (%)
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.commissionRatePercent} onChange={event => updateManualProductField("commissionRatePercent", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Sold
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.soldCountText} onChange={event => updateManualProductField("soldCountText", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Rating
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.ratingScore} onChange={event => updateManualProductField("ratingScore", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Reviews
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.reviewCountText} onChange={event => updateManualProductField("reviewCountText", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Shop
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.shopName} onChange={event => updateManualProductField("shopName", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Captured category
                <input className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.capturedCategoryText} onChange={event => updateManualProductField("capturedCategoryText", event.target.value)} />
              </label>
              <label className="text-sm font-medium">
                Main storyboard category
                <select className="mt-1 w-full rounded-md border px-3 py-2" value={manualProductForm.productCategory} onChange={event => updateManualProductField("productCategory", event.target.value as ProductReferenceCategory)}>
                  <option value="auto">Auto / ให้ระบบเดา</option>
                  <option value="mobile_tablet">มือถือและแท็บเล็ต</option>
                  <option value="electronics">อุปกรณ์อิเล็กทรอนิกส์</option>
                  <option value="household_product">เครื่องใช้ในบ้าน</option>
                  <option value="cosmetics">เครื่องสำอางและสกินแคร์</option>
                  <option value="fashion_clothing">เสื้อผ้าแฟชั่น</option>
                  <option value="food_beverage">อาหารและเครื่องดื่ม</option>
                  <option value="furniture">เฟอร์นิเจอร์</option>
                </select>
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Description
                <textarea className="mt-1 min-h-48 w-full rounded-md border px-3 py-2" value={manualProductForm.descriptionText} onChange={event => updateManualProductField("descriptionText", event.target.value)} />
              </label>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setManualProductOpen(false)}>Cancel</Button>
              <Button type="button" className="w-full sm:w-auto" disabled={createManualProductMutation.isPending} onClick={submitManualProduct}>
                {createManualProductMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create product
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      <AlertDialog
        open={Boolean(productPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteProductMutation.isPending) setProductPendingDelete(null);
        }}
      >
        <AlertDialogContent className="overflow-hidden border-0 bg-white p-0 shadow-2xl sm:max-w-xl">
          <div className="border-b border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 p-6">
            <AlertDialogHeader className="text-left">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-100 bg-white text-red-600 shadow-sm">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <AlertDialogTitle className="text-xl font-semibold tracking-normal text-slate-950">
                {copy.deleteDialogTitle}
              </AlertDialogTitle>
              <AlertDialogDescription className="max-w-md text-sm leading-6 text-slate-600">
                {copy.deleteDialogDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-xs font-medium uppercase text-slate-500">{copy.deleteDialogMeta}</div>
              <div className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-slate-950">
                {productPendingDelete?.productName ?? productPendingDelete?.id}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  {productPendingDelete?.platform === "shopee" ? "Shopee" : "TikTok Shop"}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  {productPendingDelete?.priceCurrent ?? "-"} {productPendingDelete?.currency ?? "THB"}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                  Sold {formatCompactCount(productPendingDelete?.soldCountNormalized, productPendingDelete?.soldCountText)}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{copy.deleteDialogWarning}</span>
            </div>
          </div>

          <AlertDialogFooter className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:justify-between">
            <AlertDialogCancel className="mt-0 rounded-lg border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-100">
              {copy.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 px-5 text-white shadow-sm hover:bg-red-700 focus:ring-red-300"
              disabled={deleteProductMutation.isPending}
              onClick={confirmDeleteProduct}
            >
              {deleteProductMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {deleteProductMutation.isPending ? copy.deleting : copy.deleteProduct}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
