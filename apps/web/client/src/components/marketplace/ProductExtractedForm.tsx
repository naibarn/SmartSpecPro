export interface ProductFormValue {
  productName: string;
  brand: string;
  shopName: string;
  isMall: boolean | null;
  priceCurrent: string;
  priceOriginal: string;
  currency: string;
  discountText: string;
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
  stockText: string;
  variantsText: string;
  sellerLocationText: string;
}

export function productFormFromExtraction(llm: any): ProductFormValue {
  return {
    productName: String(llm?.productName ?? ""),
    brand: String(llm?.brand ?? ""),
    shopName: String(llm?.shop?.name ?? ""),
    isMall: typeof llm?.shop?.isMall === "boolean" ? llm.shop.isMall : null,
    priceCurrent: llm?.price?.current != null ? String(llm.price.current) : "",
    priceOriginal: llm?.price?.original != null ? String(llm.price.original) : "",
    currency: String(llm?.price?.currency ?? "THB"),
    discountText: String(llm?.price?.discountText ?? ""),
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
    categoryText: String(llm?.specs?.categoryText ?? llm?.platformRawJson?.categoryText ?? ""),
    stockText: String(llm?.specs?.stockText ?? llm?.platformRawJson?.stockText ?? ""),
    variantsText: String(llm?.specs?.variantsText ?? llm?.platformRawJson?.variantsText ?? ""),
    sellerLocationText: String(llm?.specs?.sellerLocationText ?? llm?.platformRawJson?.sellerLocationText ?? ""),
  };
}

function numberOrNull(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function productConfirmPayload(form: ProductFormValue, imageSelection: {
  main: string[];
  description: string[];
  review: string[];
  relatedExcluded: string[];
  coverAssetId?: string | null;
}, platformRawJson: Record<string, unknown>) {
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
          stockText: form.stockText || null,
          variantsText: form.variantsText || null,
          sellerLocationText: form.sellerLocationText || null,
        },
      },
      images: imageSelection,
      platformRawJson,
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
        <label className={labelClass}>Marketplace category<input className={inputClass} value={value.categoryText} onChange={(e) => update("categoryText", e.target.value)} /></label>
        <label className={labelClass}>Stock<input className={inputClass} value={value.stockText} onChange={(e) => update("stockText", e.target.value)} /></label>
        <label className={labelClass}>Seller location<input className={inputClass} value={value.sellerLocationText} onChange={(e) => update("sellerLocationText", e.target.value)} /></label>
        <label className={labelClass}>Variants<textarea className={`${inputClass} min-h-20`} value={value.variantsText} onChange={(e) => update("variantsText", e.target.value)} /></label>
      </div>
      <h3 className="mt-5 text-sm font-semibold">Confidence</h3>
      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs">{JSON.stringify(confidence ?? {}, null, 2)}</pre>
    </section>
  );
}
