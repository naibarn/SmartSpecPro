import {
  detectProductionReferenceStoryboardProductCategoryFromText,
  type ProductionReferenceStoryboardProductCategory,
} from "@/lib/productionReferenceStoryboard";

export interface ProductFormValue {
  productName: string;
  brand: string;
  shopName: string;
  isMall: boolean | null;
  priceCurrent: string;
  priceOriginal: string;
  currency: string;
  discountText: string;
  commissionRatePercent: string;
  affiliateUrl: string;
  ratingScore: string;
  reviewCountText: string;
  soldCountText: string;
  descriptionText: string;
  ingredientsText: string;
  claimsText: string;
  registrationNo: string;
  volume: string;
  shelfLife: string;
  warningsText: string;
  categoryText: string;
  categoryPathText: string;
  productCategory: ProductReferenceCategory;
  stockText: string;
  variantsText: string;
  sellerLocationText: string;
}

const PRODUCT_REFERENCE_CATEGORY_OPTIONS = [
  { value: "auto", label: "Auto / ให้ระบบเดาหมวดสินค้า" },
  { value: "household_product", label: "เครื่องใช้ในบ้าน" },
  { value: "computer_laptop", label: "คอมพิวเตอร์และแล็ปท็อป" },
  { value: "electrical_appliance", label: "เครื่องใช้ไฟฟ้า" },
  { value: "food_beverage", label: "อาหารและเครื่องดื่ม" },
  { value: "electronics", label: "อุปกรณ์อิเล็กทรอนิกส์" },
  { value: "fashion_clothing", label: "เสื้อผ้าแฟชั่น" },
  { value: "shoes", label: "รองเท้า" },
  { value: "watch_eyewear", label: "นาฬิกาและแว่นตา" },
  { value: "mobile_tablet", label: "มือถือและแท็บเล็ต" },
  { value: "jewelry", label: "เครื่องประดับ" },
  { value: "mother_baby", label: "สินค้าแม่และเด็ก" },
  { value: "pet_supplies", label: "ของใช้และอาหารสัตว์" },
  { value: "sports_equipment", label: "อุปกรณ์กีฬา" },
  { value: "camera_photography", label: "กล้องและอุปกรณ์ถ่ายภาพ" },
  { value: "gaming_accessories", label: "เกมส์และอุปกรณ์เสริม" },
  { value: "automotive", label: "ยานยนต์" },
  { value: "stationery", label: "เครื่องเขียน" },
  { value: "books", label: "หนังสือ" },
  { value: "furniture", label: "เฟอร์นิเจอร์" },
  { value: "cosmetics", label: "เครื่องสำอางและสกินแคร์" },
] as const;
type ProductReferenceCategory = (typeof PRODUCT_REFERENCE_CATEGORY_OPTIONS)[number]["value"];

function normalizeProductCategory(value: unknown): ProductReferenceCategory {
  const matched = PRODUCT_REFERENCE_CATEGORY_OPTIONS.find(
    (option) => option.value === value
  );
  return matched ? matched.value : "auto";
}

export function productFormFromExtraction(llm: any): ProductFormValue {
  const specs = llm?.description?.specs ?? llm?.specs ?? {};
  const platformRawJson = llm?.platformRawJson ?? {};
  const categoryText = String(specs?.categoryText ?? platformRawJson?.categoryText ?? llm?.categoryText ?? llm?.category ?? llm?.product?.category ?? "");
  const categoryPathText = firstCategoryPathParts(
    specs?.categoryPath,
    specs?.categoryPathText,
    specs?.marketplaceCategoryPath,
    platformRawJson?.categoryPath,
    platformRawJson?.categoryPathText,
    platformRawJson?.marketplaceCategoryPath,
    platformRawJson?.breadcrumbs,
    llm?.categoryPath,
    llm?.categoryPathText,
    llm?.product?.categoryPath,
  ).join(" > ");
  const explicitProductCategory = normalizeProductCategory(
    llm?.productCategory ?? platformRawJson?.productCategory ?? specs?.productCategory,
  );
  const detectedProductCategory = explicitProductCategory === "auto"
    ? detectProductionReferenceStoryboardProductCategoryFromText([
      categoryText,
      categoryPathText,
      llm?.productName,
      llm?.description?.rawText,
    ].filter(Boolean).join(" ")) as ProductionReferenceStoryboardProductCategory
    : explicitProductCategory;
  return {
    productName: String(llm?.productName ?? ""),
    brand: String(llm?.brand ?? ""),
    shopName: String(llm?.shop?.name ?? ""),
    isMall: typeof llm?.shop?.isMall === "boolean" ? llm.shop.isMall : null,
    priceCurrent: llm?.price?.current != null ? String(llm.price.current) : "",
    priceOriginal: llm?.price?.original != null ? String(llm.price.original) : "",
    currency: String(llm?.price?.currency ?? "THB"),
    discountText: String(llm?.price?.discountText ?? ""),
    commissionRatePercent: llm?.commissionRatePercent != null ? String(llm.commissionRatePercent) : "",
    affiliateUrl: String(llm?.affiliateUrl ?? llm?.platformRawJson?.affiliateUrl ?? ""),
    ratingScore: llm?.rating?.score != null ? String(llm.rating.score) : "",
    reviewCountText: String(llm?.rating?.reviewCountText ?? ""),
    soldCountText: String(llm?.rating?.soldCountText ?? ""),
    descriptionText: String(llm?.description?.rawText ?? ""),
    ingredientsText: Array.isArray(llm?.description?.ingredients) ? llm.description.ingredients.join("\n") : "",
    claimsText: Array.isArray(llm?.description?.claims) ? llm.description.claims.join("\n") : "",
    registrationNo: String(llm?.description?.registrationNo ?? llm?.description?.specs?.registrationNo ?? ""),
    volume: String(llm?.description?.volume ?? llm?.description?.specs?.volume ?? ""),
    shelfLife: String(llm?.description?.shelfLife ?? llm?.description?.specs?.shelfLife ?? ""),
    warningsText: Array.isArray(llm?.description?.warnings) ? llm.description.warnings.join("\n") : "",
    categoryText,
    categoryPathText,
    productCategory: normalizeProductCategory(detectedProductCategory),
    stockText: String(specs?.stockText ?? platformRawJson?.stockText ?? ""),
    variantsText: String(specs?.variantsText ?? platformRawJson?.variantsText ?? ""),
    sellerLocationText: String(specs?.sellerLocationText ?? platformRawJson?.sellerLocationText ?? ""),
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function categoryPathParts(value: string): string[] {
  return value.split(/[>›]/).map((part) => part.trim()).filter(Boolean).slice(0, 8);
}

function categoryPathPartsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(categoryPathPartsFromUnknown).slice(0, 8);
  }
  if (typeof value !== "string") return [];
  return value.split(/[>›/|,\n]/).map((part) => part.trim()).filter(Boolean).slice(0, 8);
}

function firstCategoryPathParts(...values: unknown[]): string[] {
  for (const value of values) {
    const parts = categoryPathPartsFromUnknown(value);
    if (parts.length > 0) return parts;
  }
  return [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function productConfirmPayload(form: ProductFormValue, imageSelection: {
  main: string[];
  description: string[];
  review: string[];
  relatedExcluded: string[];
  coverAssetId?: string | null;
}, platformRawJson: Record<string, unknown>) {
  const rawPlatform = (platformRawJson.platformRawJson && typeof platformRawJson.platformRawJson === "object" && !Array.isArray(platformRawJson.platformRawJson))
    ? platformRawJson.platformRawJson as Record<string, unknown>
    : {};
  const commissionCheckUrl = firstString(
    platformRawJson.commissionCheckUrl,
    rawPlatform.commissionCheckUrl,
    platformRawJson.offerUrl,
    rawPlatform.offerUrl,
    platformRawJson.offerSpecificUrl,
    rawPlatform.offerSpecificUrl,
  );
  const productPageUrl = firstString(
    platformRawJson.productPageUrl,
    rawPlatform.productPageUrl,
    platformRawJson.productUrl,
    rawPlatform.productUrl,
    platformRawJson.canonicalSourceUrl,
    rawPlatform.canonicalSourceUrl,
    platformRawJson.sourceUrl,
    rawPlatform.sourceUrl,
  );
  return {
    product: {
      productName: form.productName,
      brand: form.brand || null,
      shopName: form.shopName || null,
      isMall: form.isMall,
      price: {
        current: numberOrNull(form.priceCurrent),
        original: numberOrNull(form.priceOriginal),
        currency: form.currency || "THB",
        discountText: form.discountText || null,
      },
      commissionRatePercent: numberOrNull(form.commissionRatePercent),
      affiliateUrl: form.affiliateUrl || null,
      productCategory: normalizeProductCategory(form.productCategory),
      rating: {
        score: numberOrNull(form.ratingScore),
        reviewCountText: form.reviewCountText || null,
        soldCountText: form.soldCountText || null,
      },
      description: {
        rawText: form.descriptionText,
        ingredients: lines(form.ingredientsText),
        claims: lines(form.claimsText),
        specs: {
          registrationNo: form.registrationNo || null,
          volume: form.volume || null,
          shelfLife: form.shelfLife || null,
          warnings: lines(form.warningsText),
          categoryText: form.categoryText || null,
          categoryPath: categoryPathParts(form.categoryPathText),
          productCategory: normalizeProductCategory(form.productCategory),
          stockText: form.stockText || null,
          variantsText: form.variantsText || null,
          sellerLocationText: form.sellerLocationText || null,
        },
      },
      images: imageSelection,
      platformRawJson: {
        ...platformRawJson,
        commissionCheckUrl,
        productPageUrl,
        latestProductPageUrl: productPageUrl,
        affiliateUrl: form.affiliateUrl || null,
        categoryText: form.categoryText || null,
        categoryPath: categoryPathParts(form.categoryPathText),
        productCategory: normalizeProductCategory(form.productCategory),
      },
    },
  };
}

export function ProductExtractedForm({
  value,
  onChange,
  confidence,
  evidence,
  warnings,
  onEvidenceSelect,
}: {
  value: ProductFormValue;
  onChange: (value: ProductFormValue) => void;
  confidence?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  warnings?: string[];
  onEvidenceSelect?: (source: string) => void;
}) {
  const update = (key: keyof ProductFormValue, next: string | boolean | null) => {
    onChange({ ...value, [key]: next });
  };
  const fieldMeta = (key: string) => {
    const c = confidence?.[key];
    const sources = Array.isArray(evidence?.[key]) ? evidence?.[key] as string[] : [];
    const confidenceText = typeof c === "number" ? c.toFixed(2) : c == null ? "-" : String(c);
    return (
      <span className="mt-1 block text-xs text-slate-500">
        confidence {confidenceText}
        {sources.length ? (
          <span className="ml-1 inline-flex flex-wrap items-center gap-1">
            <span>| evidence:</span>
            {sources.map((source) => (
              <button
                key={source}
                type="button"
                className="rounded border bg-white px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50"
                onClick={() => onEvidenceSelect?.(source)}
              >
                {source}
              </button>
            ))}
          </span>
        ) : null}
      </span>
    );
  };
  const inputClass = "mt-1 w-full rounded-md border px-3 py-2 text-sm";
  const labelClass = "block text-sm font-medium text-slate-700";

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Extracted Product Form</h2>
      {warnings?.length ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {warnings.join(", ")}
        </div>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Product name<input className={inputClass} value={value.productName} onChange={(e) => update("productName", e.target.value)} />{fieldMeta("productName")}</label>
        <label className={labelClass}>Brand<input className={inputClass} value={value.brand} onChange={(e) => update("brand", e.target.value)} /></label>
        <label className={labelClass}>Main storyboard category
          <select className={inputClass} value={normalizeProductCategory(value.productCategory)} onChange={(e) => update("productCategory", normalizeProductCategory(e.target.value))}>
            {PRODUCT_REFERENCE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>Marketplace category<input className={inputClass} value={value.categoryText} onChange={(e) => update("categoryText", e.target.value)} />{fieldMeta("categoryText")}</label>
        <label className={`${labelClass} md:col-span-2`}>Marketplace category path<input className={inputClass} value={value.categoryPathText} onChange={(e) => update("categoryPathText", e.target.value)} placeholder="Shopee category breadcrumb" /></label>
        <label className={labelClass}>Shop<input className={inputClass} value={value.shopName} onChange={(e) => update("shopName", e.target.value)} /></label>
        <label className={labelClass}>Mall / official
          <select className={inputClass} value={value.isMall === null ? "unknown" : value.isMall ? "true" : "false"} onChange={(e) => update("isMall", e.target.value === "unknown" ? null : e.target.value === "true")}>
            <option value="unknown">Unknown</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label className={labelClass}>Current price<input className={inputClass} value={value.priceCurrent} onChange={(e) => update("priceCurrent", e.target.value)} />{fieldMeta("price")}</label>
        <label className={labelClass}>Original price<input className={inputClass} value={value.priceOriginal} onChange={(e) => update("priceOriginal", e.target.value)} /></label>
        <label className={labelClass}>Currency<input className={inputClass} value={value.currency} onChange={(e) => update("currency", e.target.value)} /></label>
        <label className={labelClass}>Discount<input className={inputClass} value={value.discountText} onChange={(e) => update("discountText", e.target.value)} /></label>
        <label className={labelClass}>Commission rate (%)<input className={inputClass} inputMode="decimal" value={value.commissionRatePercent} onChange={(e) => update("commissionRatePercent", e.target.value)} /></label>
        <label className={`${labelClass} md:col-span-2`}>Affiliate link
          <div className="mt-1 flex items-start gap-2">
            <textarea
              className="min-h-16 w-full rounded-md border px-3 py-2 font-mono text-xs leading-5 [overflow-wrap:anywhere]"
              value={value.affiliateUrl}
              onChange={(e) => update("affiliateUrl", e.target.value)}
              placeholder="https://s.shopee.co.th/..."
              rows={3}
              spellCheck={false}
            />
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={!value.affiliateUrl.trim()}
              onClick={() => navigator.clipboard?.writeText(value.affiliateUrl.trim())}
            >
              Copy
            </button>
          </div>
          {fieldMeta("affiliateUrl")}
        </label>
        <label className={labelClass}>Rating score<input className={inputClass} value={value.ratingScore} onChange={(e) => update("ratingScore", e.target.value)} />{fieldMeta("rating")}</label>
        <label className={labelClass}>Review count<input className={inputClass} value={value.reviewCountText} onChange={(e) => update("reviewCountText", e.target.value)} /></label>
        <label className={labelClass}>Sold count<input className={inputClass} value={value.soldCountText} onChange={(e) => update("soldCountText", e.target.value)} />{fieldMeta("soldCount")}</label>
      </div>
      <label className={`${labelClass} mt-4`}>Description<textarea className={`${inputClass} min-h-32`} value={value.descriptionText} onChange={(e) => update("descriptionText", e.target.value)} />{fieldMeta("description")}</label>
      <label className={`${labelClass} mt-4`}>Ingredients<textarea className={`${inputClass} min-h-24`} value={value.ingredientsText} onChange={(e) => update("ingredientsText", e.target.value)} /></label>
      <label className={`${labelClass} mt-4`}>Claims<textarea className={`${inputClass} min-h-24`} value={value.claimsText} onChange={(e) => update("claimsText", e.target.value)} /></label>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className={labelClass}>Registration no.<input className={inputClass} value={value.registrationNo} onChange={(e) => update("registrationNo", e.target.value)} /></label>
        <label className={labelClass}>Volume<input className={inputClass} value={value.volume} onChange={(e) => update("volume", e.target.value)} /></label>
        <label className={labelClass}>Shelf life<input className={inputClass} value={value.shelfLife} onChange={(e) => update("shelfLife", e.target.value)} /></label>
      </div>
      <label className={`${labelClass} mt-4`}>Warnings<textarea className={`${inputClass} min-h-20`} value={value.warningsText} onChange={(e) => update("warningsText", e.target.value)} /></label>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Stock<input className={inputClass} value={value.stockText} onChange={(e) => update("stockText", e.target.value)} /></label>
        <label className={labelClass}>Seller location<input className={inputClass} value={value.sellerLocationText} onChange={(e) => update("sellerLocationText", e.target.value)} /></label>
        <label className={labelClass}>Variants<textarea className={`${inputClass} min-h-20`} value={value.variantsText} onChange={(e) => update("variantsText", e.target.value)} /></label>
      </div>
      <h3 className="mt-5 text-sm font-semibold">Confidence</h3>
      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs">{JSON.stringify(confidence ?? {}, null, 2)}</pre>
    </section>
  );
}
