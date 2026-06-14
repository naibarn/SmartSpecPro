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
import { AlertTriangle, ChevronLeft, Copy, Download, ExternalLink, Eye, ImageIcon, Loader2, Plus, Search, Store, Trash2, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type PlatformFilter = "all" | "shopee" | "tiktok_shop";
type HealthFilter = "all" | "active" | "needs_update" | "inactive" | "low_rating";

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

function productCategory(product: any) {
  const raw = product.platformRawJson ?? {};
  return raw.categoryText || raw.category || raw.latestProductDraft?.categoryText || "Uncategorized";
}

function primaryProductImageUrl(product: any): string {
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
    affiliateLink: th ? "ลิงก์ affiliate" : "Affiliate link",
    copyAffiliate: th ? "คัดลอก affiliate" : "Copy affiliate",
    copiedAffiliate: th ? "คัดลอกลิงก์ affiliate แล้ว" : "Affiliate link copied",
    cancel: th ? "ยกเลิก" : "Cancel",
    deleting: th ? "กำลังลบ..." : "Deleting...",
  };
}

export default function MarketplaceCaptureProducts() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [health, setHealth] = useState<HealthFilter>("active");
  const [category, setCategory] = useState("all");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"recommended" | "sold" | "rating" | "updated">("recommended");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [deletedProductIds, setDeletedProductIds] = useState<Set<string>>(() => new Set());
  const [productPendingDelete, setProductPendingDelete] = useState<any | null>(null);
  const [manualProductOpen, setManualProductOpen] = useState(false);
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
  const products = trpc.marketplaceCapture.listProducts.useQuery({ limit: 100, ownerOnly });
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
      const listInput = { limit: 100, ownerOnly };
      const previousProducts = utils.marketplaceCapture.listProducts.getData(listInput);
      setDeletedProductIds((current) => new Set(current).add(variables.productId));
      if (selectedProductId === variables.productId) setSelectedProductId(null);
      utils.marketplaceCapture.listProducts.setData(
        listInput,
        (current) => current?.filter((product: any) => product.id !== variables.productId),
      );
      return { listInput, previousProducts };
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
    onError: (error, variables, context) => {
      setDeletedProductIds((current) => {
        const next = new Set(current);
        next.delete(variables.productId);
        return next;
      });
      if (context?.previousProducts) {
        utils.marketplaceCapture.listProducts.setData(context.listInput, context.previousProducts);
      }
      setProductPendingDelete(null);
      toast.error(`${copy.deleteError}: ${error.message}`);
    },
  });

  const visibleProducts = useMemo(
    () => (products.data ?? []).filter((product: any) => !deletedProductIds.has(product.id)),
    [deletedProductIds, products.data],
  );

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const product of visibleProducts) values.add(String(productCategory(product)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [visibleProducts]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleProducts
      .filter((product: any) => platform === "all" || product.platform === platform)
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
        if (sortMode === "sold") return Number(b.soldCountNormalized ?? 0) - Number(a.soldCountNormalized ?? 0);
        if (sortMode === "rating") return Number(b.ratingScore ?? 0) - Number(a.ratingScore ?? 0);
        if (sortMode === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        return interestScore(b) - interestScore(a);
      });
  }, [category, health, platform, query, sortMode, visibleProducts]);

  const filteredCaptures = useMemo(() => (captures.data ?? []).filter((capture: any) => platform === "all" || capture.platform === platform), [captures.data, platform]);
  const filteredBatches = useMemo(() => (batches.data ?? []).filter((batch: any) => platform === "all" || batch.platform === platform), [batches.data, platform]);
  const recommendedProducts = filteredProducts.filter((product: any) => isActiveProduct(product)).slice(0, 8);
  const healthCounts = useMemo(() => {
    const rows = visibleProducts;
    return {
      active: rows.filter((product: any) => isActiveProduct(product)).length,
      stale: rows.filter((product: any) => isStale(product)).length,
      lowRating: rows.filter((product: any) => isLowRating(product)).length,
      inactive: rows.filter((product: any) => product.health?.warnings?.some((warning: any) => warning.code === "sold_not_growing" || warning.code === "low_sold_velocity")).length,
    };
  }, [visibleProducts]);

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

  function productCard(product: any) {
    const score = interestScore(product);
    const imageUrl = primaryProductImageUrl(product);
    return (
      <article
        key={product.id}
        className={`group cursor-pointer rounded-lg border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          selectedProductId === product.id ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
        }`}
        onClick={() => setSelectedProductId(product.id)}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.productName ? `${product.productName} product image` : "Product image"}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <ImageIcon className="h-7 w-7 text-slate-300" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="line-clamp-2 font-semibold text-slate-950">{product.productName}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{productCategory(product)}</div>
              </div>
              <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{score}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div><div className="text-xs text-slate-500">Price</div><div className="font-medium">{product.priceCurrent ?? "-"} {product.currency ?? "THB"}</div></div>
          <div><div className="text-xs text-slate-500">Commission</div><div className="font-medium">{product.commissionRatePercent ?? "-"}%</div></div>
          <div><div className="text-xs text-slate-500">Sold</div><div className="font-medium">{formatCompactCount(product.soldCountNormalized, product.soldCountText)}</div></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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
        <div className="mt-3 text-xs text-slate-500">{copy.lastChecked}: {product.health?.lastCheckedAt ? new Date(product.health.lastCheckedAt).toLocaleString() : "-"}</div>
        {product.health?.warnings?.[0]?.message ? <div className="mt-2 text-xs text-amber-700">{product.health.warnings[0].message}</div> : null}
        {product.affiliateUrl ? (
          <button
            className="mt-3 inline-flex max-w-full items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            onClick={(event) => {
              event.stopPropagation();
              copyAffiliateLink(product.affiliateUrl);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="truncate">{copy.affiliateLink}</span>
          </button>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
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
    () => visibleProducts.find((product: any) => product.id === selectedProductId) ?? null,
    [selectedProductId, visibleProducts],
  );
  const selectedData = selectedProductDetail.data as any;
  const panelProduct = selectedData?.product ?? selectedListProduct;
  const panelImages = selectedData?.images ?? [];
  const panelHistory = selectedData?.history ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {copy.back}
              </Button>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold">{copy.title}</h1>
                <p className="text-xs text-slate-500">{copy.subtitle}</p>
              </div>
            </div>
            <LocaleToggle className="hidden sm:inline-flex" />
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
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
              <Button type="button" size="sm" onClick={() => setManualProductOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add manual product
              </Button>
              {(["all", "shopee", "tiktok_shop"] as PlatformFilter[]).map((item) => (
                <button
                  key={item}
                  className={`rounded-md border px-3 py-2 text-sm ${platform === item ? "border-blue-300 bg-blue-50 text-blue-700" : "bg-white"}`}
                  onClick={() => setPlatform(item)}
                >
                  {item === "all" ? copy.platformAll : item === "shopee" ? "Shopee" : "TikTok Shop"}
                </button>
              ))}
              <label className="rounded-md border bg-white px-3 py-2 text-sm">
                <input className="mr-2" type="checkbox" checked={ownerOnly} onChange={(e) => setOwnerOnly(e.target.checked)} />
                {copy.ownOnly}
              </label>
              <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={() => downloadCsv("marketplace-products.csv", filteredProducts)}><Download className="mr-1 inline h-4 w-4" />{copy.exportCsv}</button>
              <button className="rounded-md border bg-white px-3 py-2 text-sm" onClick={() => downloadJson("marketplace-capture-export.json", { products: filteredProducts, captures: filteredCaptures, batches: filteredBatches })}>{copy.exportJson}</button>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <button className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-left" onClick={() => setHealth("active")}><div className="text-2xl font-semibold text-emerald-700">{healthCounts.active}</div><div className="text-sm text-emerald-700">{copy.active}</div></button>
            <button className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-left" onClick={() => setHealth("needs_update")}><div className="text-2xl font-semibold text-amber-700">{healthCounts.stale}</div><div className="text-sm text-amber-700">{copy.needsUpdate}</div></button>
            <button className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-left" onClick={() => setHealth("inactive")}><div className="text-2xl font-semibold text-orange-700">{healthCounts.inactive}</div><div className="text-sm text-orange-700">{copy.inactive}</div></button>
            <button className="rounded-xl border border-red-100 bg-red-50 p-4 text-left" onClick={() => setHealth("low_rating")}><div className="text-2xl font-semibold text-red-700">{healthCounts.lowRating}</div><div className="text-sm text-red-700">{copy.lowRating}</div></button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">{copy.recommendations}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {recommendedProducts.length > 0 ? recommendedProducts.map(productCard) : <p className="text-sm text-slate-500">{copy.empty}</p>}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{copy.products} ({filteredProducts.length})</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.length > 0 ? filteredProducts.map(productCard) : <p className="text-sm text-slate-500">{copy.empty}</p>}
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
      </main>
      {panelProduct ? (
        <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
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
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Price</div><div className="font-medium">{panelProduct.priceCurrent ?? "-"} {panelProduct.currency ?? "THB"}</div></div>
              <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Commission</div><div className="font-medium">{panelProduct.commissionRatePercent ?? "-"}%</div></div>
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
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {panelImages.slice(0, 12).map((image: any) => (
                    <img key={image.id} className="h-24 w-full rounded-md border object-contain" src={image.url} alt={image.type} loading="lazy" />
                  ))}
                </div>
              </section>
            ) : null}
            {panelHistory.length > 0 ? (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-900">{copy.history}</h3>
                <div className="mt-2 divide-y rounded-md border text-sm">
                  {panelHistory.slice(0, 5).map((snapshot: any) => (
                    <div key={snapshot.id} className="grid grid-cols-3 gap-2 p-2">
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
      {manualProductOpen ? (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/40 p-4">
          <section className="mx-auto my-8 max-w-4xl rounded-xl bg-white p-5 shadow-2xl">
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
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setManualProductOpen(false)}>Cancel</Button>
              <Button type="button" disabled={createManualProductMutation.isPending} onClick={submitManualProduct}>
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
