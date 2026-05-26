import type { ProductionReferenceInput, ProductionSpace } from "@shared/mediaProduction";

export const PRODUCTION_SKILL_CONTEXT_TOKEN_RESERVE = 16_000;
export const PRODUCTION_SKILL_CONTEXT_SAFETY_RATIO = 0.85;

export interface ProductionSkillReferenceImageInput {
  id?: string | number;
  url?: string;
  name?: string;
  marketplaceProduct?: unknown;
}

export interface ProductionSkillReferenceVideoInput {
  id?: string | number;
  url?: string;
  name?: string;
}

export interface ProductionSkillAudioInput {
  id?: string | number;
  url?: string;
  fileUrl?: string;
  name?: string;
  title?: string;
}

export interface ProductionSkillPlanningModelOption {
  modelId: string;
  contextLength?: number | null;
  isDefault?: boolean;
}

export interface ProductionSkillAttachmentPack {
  attachments: ProductionReferenceInput[];
  referenceImages: Array<{
    url: string;
    name?: string;
    role?: string;
    source?: string;
    provenance?: Record<string, unknown>;
    isProductReference?: boolean;
    referenceRole: ProductionSkillImageReferenceRole;
  }>;
  referenceImageUrls: string[];
  referenceProductImageUrls: string[];
  referenceCharacterImageUrls: string[];
  referenceEnvironmentImageUrls: string[];
  referenceVideos: Array<{ url: string; name?: string; role?: string; source?: string }>;
  referenceAudio: Array<{ url: string; name?: string; role?: string; source?: string }>;
  attachmentKinds: Record<string, number>;
}

export interface ProductionSkillModelSelection {
  modelId?: string;
  option?: ProductionSkillPlanningModelOption;
  mode: "manual" | "auto" | "fallback";
  estimatedContextTokens: number;
  requiredContextTokens: number;
  escalatedFrom?: string;
  overflowRisk: boolean;
  reason: "manual_override" | "auto_default_sufficient" | "auto_context_escalated" | "auto_no_context_metadata" | "auto_no_sufficient_model" | "fallback_no_model";
}

const IMAGE_ATTACHMENT_KINDS = new Set([
  "reference_image",
  "product_image",
  "character_asset",
  "generated_media",
  "marketplace_product",
]);

export type ProductionSkillImageReferenceRole = "product" | "character" | "environment";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function productionReferenceAssetIdentity(asset: Pick<ProductionReferenceInput, "id" | "url" | "thumbnailUrl" | "assetId" | "outputRefId" | "provenance">): string {
  const url = cleanString(asset.url) || cleanString(asset.thumbnailUrl);
  if (url) return `url:${url}`;
  const storageKey = cleanString(asset.provenance?.storageKey);
  if (storageKey) return `storage:${storageKey}`;
  const assetId = cleanString(asset.assetId);
  if (assetId) return `asset:${assetId}`;
  const outputRefId = cleanString(asset.outputRefId);
  if (outputRefId) return `output:${outputRefId}`;
  return `id:${asset.id}`;
}

export function dedupeProductionReferenceAssets(assets: ProductionReferenceInput[]): ProductionReferenceInput[] {
  const seen = new Set<string>();
  const next: ProductionReferenceInput[] = [];
  assets.forEach((asset) => {
    const identity = productionReferenceAssetIdentity(asset);
    if (seen.has(identity)) return;
    seen.add(identity);
    next.push(asset);
  });
  return next;
}

export function getProductionImageReferenceRole(asset: Pick<ProductionReferenceInput, "kind" | "zone">): ProductionSkillImageReferenceRole | null {
  if (asset.zone === "products") return "product";
  if (asset.zone === "cast") return "character";
  if (asset.zone === "scene_mood" || asset.zone === "generated") return "environment";
  if (asset.kind === "product_image" || asset.kind === "marketplace_product") return "product";
  if (asset.kind === "character_asset") return "character";
  if (asset.kind === "reference_image" || asset.kind === "generated_media") return "environment";
  return null;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map((url) => cleanString(url)).filter(Boolean)));
}

export function splitProductionReferenceImageUrlsByRole(assets: ProductionReferenceInput[]): {
  product: string[];
  character: string[];
  environment: string[];
  all: string[];
} {
  const product: string[] = [];
  const character: string[] = [];
  const environment: string[] = [];
  assets.forEach((asset) => {
    if (!asset.url || !IMAGE_ATTACHMENT_KINDS.has(asset.kind)) return;
    const role = getProductionImageReferenceRole(asset);
    if (role === "product") product.push(asset.url);
    else if (role === "character") character.push(asset.url);
    else if (role === "environment") environment.push(asset.url);
  });
  return {
    product: uniqueUrls(product),
    character: uniqueUrls(character),
    environment: uniqueUrls(environment),
    all: uniqueUrls([...product, ...character, ...environment]),
  };
}

export function selectProductionRoleBalancedReferenceImageUrls(input: {
  product?: string[];
  character?: string[];
  environment?: string[];
  fallback?: string[];
  limit: number;
}): string[] {
  const limit = Math.max(0, Math.floor(input.limit));
  if (limit <= 0) return [];

  const product = uniqueUrls(input.product ?? []);
  const character = uniqueUrls(input.character ?? []);
  const environment = uniqueUrls(input.environment ?? []);
  const fallback = uniqueUrls(input.fallback ?? []);
  const selected: string[] = [];
  const add = (url?: string) => {
    const cleanUrl = cleanString(url);
    if (!cleanUrl || selected.length >= limit || selected.includes(cleanUrl)) return;
    selected.push(cleanUrl);
  };

  add(product[0]);
  add(character[0]);
  add(environment[0]);

  for (const url of [...product.slice(1), ...character.slice(1), ...environment.slice(1), ...fallback]) {
    add(url);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildProductEvidenceAssets(manifest: ProductionSpace["productEvidenceManifest"] | undefined): ProductionReferenceInput[] {
  if (!manifest?.products?.length) return [];
  return manifest.products
    .filter((product) => cleanString(product.imageUrl))
    .map((product, index) => {
      const url = cleanString(product.imageUrl);
      return {
        id: `product-evidence-${product.id || index + 1}`,
        kind: "product_image",
        title: product.title || `Product reference ${index + 1}`,
        url,
        thumbnailUrl: url,
        source: "product-evidence-manifest",
        provenance: {
          manifestId: manifest.manifestId,
          productId: product.productId,
          productAssetId: product.id,
          productTruth: product.productTruth,
          sourceProvenance: product.provenance,
        },
        zone: "products",
        role: product.role || "hero",
        locked: product.requiredVisualAccuracy === "strict",
        warnings: product.reviewNotes,
        approvalState: product.approvalState,
        sku: product.sku,
        variantId: product.variantId,
      } satisfies ProductionReferenceInput;
    });
}

function referenceImagesToAssets(referenceImages: ProductionSkillReferenceImageInput[]): ProductionReferenceInput[] {
  return referenceImages
    .filter((image) => cleanString(image.url))
    .map((image, index) => {
      const isProductReference = Boolean(image.marketplaceProduct);
      const marketplaceProduct = image.marketplaceProduct as Record<string, unknown> | undefined;
      const title = cleanString(image.name)
        || cleanString(marketplaceProduct?.title)
        || cleanString(marketplaceProduct?.productName)
        || `Reference image ${index + 1}`;
      return {
        id: String(image.id ?? `reference-image-${index + 1}`),
        kind: isProductReference ? "product_image" : "reference_image",
        title,
        url: cleanString(image.url),
        thumbnailUrl: cleanString(image.url),
        source: isProductReference ? "media-studio-product-reference" : "media-studio-reference",
        provenance: isProductReference ? { marketplaceProduct } : undefined,
        zone: isProductReference ? "products" : "scene_mood",
        role: isProductReference ? "product_reference" : "visual_reference",
        approvalState: isProductReference ? "needs_review" : undefined,
        sku: cleanString(marketplaceProduct?.itemId),
      } satisfies ProductionReferenceInput;
    });
}

function referenceVideosToAssets(referenceVideos: ProductionSkillReferenceVideoInput[]): ProductionReferenceInput[] {
  return referenceVideos
    .filter((video) => cleanString(video.url))
    .map((video, index) => ({
      id: String(video.id ?? `source-video-${index + 1}`),
      kind: "source_video",
      title: cleanString(video.name) || `Source video ${index + 1}`,
      url: cleanString(video.url),
      source: "media-studio-reference",
      zone: "targets",
      role: "source_video",
    } satisfies ProductionReferenceInput));
}

function audioInputsToAssets(audioAssets: ProductionSkillAudioInput[]): ProductionReferenceInput[] {
  const next: ProductionReferenceInput[] = [];
  audioAssets.forEach((asset, index) => {
    const url = cleanString(asset.url) || cleanString(asset.fileUrl);
    if (!url) return;
    next.push({
      id: String(asset.id ?? `audio-asset-${index + 1}`),
      kind: "audio_asset",
      title: cleanString(asset.name) || cleanString(asset.title) || `Audio ${index + 1}`,
      url,
      source: "gemini-omni-audio",
      assetId: String(asset.id ?? ""),
      zone: "audio",
      role: "audio_reference",
    });
  });
  return next;
}

export function buildProductionSkillAttachmentPack(input: {
  space: Pick<ProductionSpace, "contextAssets" | "productEvidenceManifest">;
  referenceImages?: ProductionSkillReferenceImageInput[];
  referenceVideos?: ProductionSkillReferenceVideoInput[];
  audioAssets?: ProductionSkillAudioInput[];
  limit: number;
}): ProductionSkillAttachmentPack {
  const attachments = dedupeProductionReferenceAssets([
    ...buildProductEvidenceAssets(input.space.productEvidenceManifest),
    ...(input.space.contextAssets ?? []),
    ...referenceImagesToAssets(input.referenceImages ?? []),
    ...referenceVideosToAssets(input.referenceVideos ?? []),
    ...audioInputsToAssets(input.audioAssets ?? []),
  ]).slice(0, input.limit);

  const referenceImages = attachments
    .filter((asset) => asset.url && IMAGE_ATTACHMENT_KINDS.has(asset.kind))
    .map((asset) => {
      const referenceRole = getProductionImageReferenceRole(asset) ?? "environment";
      return {
        url: asset.url as string,
        name: asset.title,
        role: asset.role,
        source: asset.source,
        provenance: asset.provenance,
        isProductReference: referenceRole === "product",
        referenceRole,
      };
    });
  const referenceImageUrlGroups = splitProductionReferenceImageUrlsByRole(attachments);
  const referenceVideos = attachments
    .filter((asset) => asset.url && asset.kind === "source_video")
    .map((asset) => ({ url: asset.url as string, name: asset.title, role: asset.role, source: asset.source }));
  const referenceAudio = attachments
    .filter((asset) => asset.url && asset.kind === "audio_asset")
    .map((asset) => ({ url: asset.url as string, name: asset.title, role: asset.role, source: asset.source }));
  const attachmentKinds = attachments.reduce<Record<string, number>>((counts, asset) => {
    counts[asset.kind] = (counts[asset.kind] ?? 0) + 1;
    return counts;
  }, {});

  return {
    attachments,
    referenceImages,
    referenceImageUrls: referenceImageUrlGroups.all,
    referenceProductImageUrls: referenceImageUrlGroups.product,
    referenceCharacterImageUrls: referenceImageUrlGroups.character,
    referenceEnvironmentImageUrls: referenceImageUrlGroups.environment,
    referenceVideos,
    referenceAudio,
    attachmentKinds,
  };
}

export function estimateProductionSkillContextTokens(value: unknown): number {
  const text = JSON.stringify(value ?? {});
  const baseTextTokens = Math.ceil(text.length / 3);
  const imageCount = (text.match(/https?:\/\//g) ?? []).length;
  return baseTextTokens + imageCount * 1_200;
}

export function selectProductionPlanningModelForContext(input: {
  modelMode?: "auto" | "manual";
  manualModelId?: string;
  fallbackModelId?: string;
  options: ProductionSkillPlanningModelOption[];
  estimatedContextTokens: number;
  reserveTokens?: number;
}): ProductionSkillModelSelection {
  const estimatedContextTokens = Math.max(0, Math.ceil(input.estimatedContextTokens));
  const requiredContextTokens = Math.ceil((estimatedContextTokens + (input.reserveTokens ?? PRODUCTION_SKILL_CONTEXT_TOKEN_RESERVE)) / PRODUCTION_SKILL_CONTEXT_SAFETY_RATIO);
  const manualModelId = cleanString(input.manualModelId);
  if (input.modelMode === "manual" && manualModelId) {
    const option = input.options.find((model) => model.modelId === manualModelId);
    return {
      modelId: manualModelId,
      option,
      mode: "manual",
      estimatedContextTokens,
      requiredContextTokens,
      overflowRisk: Number(option?.contextLength ?? 0) > 0 ? Number(option?.contextLength) < requiredContextTokens : false,
      reason: "manual_override",
    };
  }

  const defaultOption = input.options[0];
  const fallbackModelId = (defaultOption?.modelId ?? cleanString(input.fallbackModelId)) || undefined;
  if (!fallbackModelId) {
    return {
      mode: "fallback",
      estimatedContextTokens,
      requiredContextTokens,
      overflowRisk: true,
      reason: "fallback_no_model",
    };
  }

  const defaultContext = Number(defaultOption?.contextLength ?? 0);
  if (defaultOption && defaultContext >= requiredContextTokens) {
    return {
      modelId: defaultOption.modelId,
      option: defaultOption,
      mode: "auto",
      estimatedContextTokens,
      requiredContextTokens,
      overflowRisk: false,
      reason: "auto_default_sufficient",
    };
  }

  const sufficient = input.options
    .filter((model) => Number(model.contextLength ?? 0) >= requiredContextTokens)
    .sort((a, b) => Number(a.contextLength ?? 0) - Number(b.contextLength ?? 0))[0];
  if (sufficient) {
    return {
      modelId: sufficient.modelId,
      option: sufficient,
      mode: "auto",
      estimatedContextTokens,
      requiredContextTokens,
      escalatedFrom: defaultOption?.modelId,
      overflowRisk: false,
      reason: sufficient.modelId === defaultOption?.modelId ? "auto_default_sufficient" : "auto_context_escalated",
    };
  }

  const hasContextMetadata = input.options.some((model) => Number(model.contextLength ?? 0) > 0);
  return {
    modelId: fallbackModelId,
    option: defaultOption,
    mode: "auto",
    estimatedContextTokens,
    requiredContextTokens,
    overflowRisk: hasContextMetadata ? true : false,
    reason: hasContextMetadata ? "auto_no_sufficient_model" : "auto_no_context_metadata",
  };
}
