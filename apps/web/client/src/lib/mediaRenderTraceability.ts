import type {
  MarketplaceProductReferenceContext,
  StoryboardGenerationTask,
  StoryboardProductionContext,
  StoryboardReviewDraft,
} from "@/lib/storyboardReviewWorkspace";

function compactText(value: unknown, max = 6000): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function compactRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  ) as Partial<T>;
}

function normalizeMarketplaceProduct(value: unknown): MarketplaceProductReferenceContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const platform = record.platform === "tiktok_shop" ? "tiktok_shop" : "shopee";
  const product = compactRecord({
    productId: compactText(record.productId, 256),
    platform,
    productName: compactText(record.productName ?? record.product_title ?? record.title ?? record.name, 512),
    shopName: compactText(record.shopName ?? record.shop_name, 512),
    shopId: compactText(record.shopId ?? record.shop_id, 256),
    itemId: compactText(record.itemId ?? record.item_id ?? record.externalProductId, 256),
    sourceUrl: compactText(record.sourceUrl ?? record.source_url, 2048),
    affiliateUrl: compactText(record.affiliateUrl ?? record.affiliate_url, 2048),
  }) as MarketplaceProductReferenceContext;
  return Object.keys(product).length > 1 || product.productId || product.sourceUrl || product.itemId
    ? product
    : null;
}

function getTaskMarketplaceProduct(task?: Partial<StoryboardGenerationTask> | null): MarketplaceProductReferenceContext | null {
  return normalizeMarketplaceProduct(task?.marketplaceProduct)
    ?? normalizeMarketplaceProduct(task?.storyboardContext?.extraParams?.marketplaceContext)
    ?? normalizeMarketplaceProduct(task?.storyboardContext?.extraParams?.marketplaceProduct);
}

export function resolveStoryboardDraftMarketplaceProduct(draft?: Partial<StoryboardReviewDraft> | null): MarketplaceProductReferenceContext | null {
  return normalizeMarketplaceProduct(draft?.marketplaceContext)
    ?? draft?.tasks?.map((task) => getTaskMarketplaceProduct(task)).find(Boolean)
    ?? null;
}

function normalizeProductionContext(value: unknown): StoryboardProductionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const context = compactRecord({
    productionRunId: compactText(record.productionRunId, 256),
    productionProjectTitle: compactText(record.productionProjectTitle, 512),
    productionStoryConceptId: compactText(record.productionStoryConceptId, 256),
    productionStoryConceptTitle: compactText(record.productionStoryConceptTitle, 512),
    productionStoryConceptAngle: compactText(record.productionStoryConceptAngle, 1200),
    productionStoryConceptDetails: compactText(record.productionStoryConceptDetails, 6000),
    videoConcept: compactText(record.videoConcept, 6000),
    voiceoverFullScript: compactText(record.voiceoverFullScript, 6000),
    storyboardGuide: compactText(record.storyboardGuide, 6000),
    sourceGridUrl: compactText(record.sourceGridUrl, 2048),
    sourceShotId: compactText(record.sourceShotId, 256),
    sourceShotTitle: compactText(record.sourceShotTitle, 512),
    sourceShotTimeRange: compactText(record.sourceShotTimeRange, 128),
    sourceShotScript: compactText(record.sourceShotScript, 2000),
    sourceShotVideoPrompt: compactText(record.sourceShotVideoPrompt, 4000),
  }) as StoryboardProductionContext;
  return Object.keys(context).length > 0 ? context : null;
}

function getTaskProductionContext(task?: Partial<StoryboardGenerationTask> | null): StoryboardProductionContext | null {
  return normalizeProductionContext(task?.productionContext)
    ?? normalizeProductionContext(task?.storyboardContext?.productionContext)
    ?? normalizeProductionContext(task?.storyboardContext?.extraParams?.productionContext);
}

export function resolveStoryboardDraftProductionContext(draft?: Partial<StoryboardReviewDraft> | null): StoryboardProductionContext | null {
  return normalizeProductionContext(draft?.productionContext)
    ?? draft?.tasks?.map((task) => getTaskProductionContext(task)).find(Boolean)
    ?? null;
}

export function buildRenderTraceabilityMetadata(input: {
  sourceFlow: string;
  sourceSurface: "media_studio_video_shot" | "media_studio_storyboard_review" | "storyboard_review_page" | string;
  productionContext?: StoryboardProductionContext | null;
  marketplaceProduct?: MarketplaceProductReferenceContext | null;
  title?: string | null;
  reviewId?: number | null;
  videoEditorProjectId?: number | null;
  clipCount?: number | null;
  selectedClipCount?: number | null;
}): Record<string, unknown> {
  const production = normalizeProductionContext(input.productionContext);
  const marketplaceProduct = normalizeMarketplaceProduct(input.marketplaceProduct);
  return compactRecord({
    source_flow: input.sourceFlow,
    source_surface: input.sourceSurface,
    title: compactText(input.title, 512),
    review_id: input.reviewId ?? null,
    video_editor_project_id: input.videoEditorProjectId ?? null,
    clip_count: input.clipCount ?? null,
    selected_clip_count: input.selectedClipCount ?? null,
    productionRunId: production?.productionRunId ?? null,
    productionProjectTitle: production?.productionProjectTitle ?? null,
    productionStoryConceptId: production?.productionStoryConceptId ?? null,
    productionStoryConceptTitle: production?.productionStoryConceptTitle ?? null,
    marketplaceProductId: marketplaceProduct?.productId ?? null,
    productId: marketplaceProduct?.productId ?? null,
    marketplaceProductName: marketplaceProduct?.productName ?? null,
    marketplacePlatform: marketplaceProduct?.platform ?? null,
    marketplaceSourceUrl: marketplaceProduct?.sourceUrl ?? null,
    marketplaceItemId: marketplaceProduct?.itemId ?? null,
    marketplaceShopId: marketplaceProduct?.shopId ?? null,
    marketplaceProduct,
    productionContext: production,
    traceability: compactRecord({
      productionRunId: production?.productionRunId ?? null,
      productionProjectTitle: production?.productionProjectTitle ?? null,
      productionStoryConceptId: production?.productionStoryConceptId ?? null,
      marketplaceProductId: marketplaceProduct?.productId ?? null,
      marketplaceProductName: marketplaceProduct?.productName ?? null,
      marketplaceSourceUrl: marketplaceProduct?.sourceUrl ?? null,
    }),
  });
}
