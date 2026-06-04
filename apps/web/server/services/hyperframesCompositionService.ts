import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesCompositionInputSchema,
  stableHash,
  type HyperframesCompositionAsset,
  type HyperframesCompositionInput,
  type HyperframesPlatformPresetId,
  type HyperframesRenderIntent,
  type MarketplaceAutoReviewCompositionMode,
} from "@shared/hyperframes/contracts";
import { getHyperframesPlatformPreset } from "@shared/hyperframes/templates";
import {
  sanitizeHyperframesAssetRef,
  sanitizeHyperframesRecordText,
  sanitizeHyperframesText,
} from "./hyperframesCompositionSanitizer";
import { selectHyperframesTemplate } from "./hyperframesTemplateRegistry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanId(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function productRecordFromState(state: unknown): Record<string, unknown> {
  const record = isRecord(state) ? state : {};
  if (isRecord(record.productTruth)) return record.productTruth;
  if (isRecord(record.product)) return record.product;
  if (isRecord(record.item)) return record.item;
  return record;
}

function buildAssetsFromState(input: {
  tenantId: string;
  runState: unknown;
  productState: unknown;
}): HyperframesCompositionAsset[] {
  const run = isRecord(input.runState) ? input.runState : {};
  const product = productRecordFromState(input.productState);
  const imageCandidates = [
    ...arrayFrom(product.selectedImageUrls),
    ...arrayFrom(product.imageUrls),
    ...arrayFrom(product.imagesJson),
    ...arrayFrom(run.frameUrls),
    ...arrayFrom(isRecord(run.resultJson) ? run.resultJson.frameUrls : []),
  ];
  const assets: HyperframesCompositionAsset[] = [];
  for (const [index, raw] of imageCandidates.entries()) {
    const ref = typeof raw === "string" ? raw : cleanId((raw as Record<string, unknown>)?.url, "");
    if (!ref) continue;
    try {
      assets.push({
        assetId: `asset_product_${index + 1}`,
        slot: index === 0 ? "product_image" : "storyboard_frame",
        kind: index === 0 ? "product_image" : "storyboard_frame",
        ref: sanitizeHyperframesAssetRef(ref),
        ownedByTenantId: input.tenantId,
      });
    } catch {
      continue;
    }
  }
  return assets.slice(0, 18);
}

export function buildHyperframesCompositionInput(input: {
  tenantId: string;
  userId: number | string;
  productId: string;
  runId?: string;
  renderJobId?: string;
  productState?: unknown;
  runState?: unknown;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
  platformPresetId?: HyperframesPlatformPresetId;
  now?: Date;
}): HyperframesCompositionInput {
  const compositionMode = input.compositionMode ?? "storyboard_motion_preview";
  const renderIntent = input.renderIntent ?? "preview";
  const platformPreset = getHyperframesPlatformPreset(
    input.platformPresetId ?? "generic_vertical_9_16"
  );
  const template = selectHyperframesTemplate({
    compositionMode,
    renderIntent,
    platformPresetId: platformPreset.presetId,
  });
  const product = productRecordFromState(input.productState);
  const title = sanitizeHyperframesText(
    product.title ?? product.productName ?? product.name ?? "Marketplace product",
    160
  );
  const productTruth = {
    title,
    price: sanitizeHyperframesText(product.price ?? "", 80),
    rating: sanitizeHyperframesText(product.rating ?? "", 80),
    summary: sanitizeHyperframesText(
      product.shortSummary ?? product.description ?? product.descriptionText ?? "",
      500
    ),
  };
  const run = isRecord(input.runState) ? input.runState : {};
  const shots = arrayFrom(
    isRecord(run.concept) ? run.concept.shots : isRecord(run.metadataJson) ? (run.metadataJson as Record<string, unknown>).shots : []
  )
    .slice(0, 9)
    .map((shot, index) =>
      isRecord(shot)
        ? sanitizeHyperframesRecordText(shot, 500)
        : { title: sanitizeHyperframesText(shot, 500), index: String(index + 1) }
    );
  const compositionSeed = {
    productId: input.productId,
    runId: input.runId ?? "pending_run",
    productTruth,
    shots,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    platformPresetId: platformPreset.presetId,
    renderIntent,
    compositionMode,
  };
  const compositionInputHash = stableHash(compositionSeed);
  return HyperframesCompositionInputSchema.parse({
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review",
    renderEngine: "hyperframes_composition",
    compositionMode,
    renderIntent,
    template: {
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      templateContentHash: template.templateContentHash,
      label: template.label,
    },
    platformPreset,
    productTruth,
    storyboard: {
      shotCount: shots.length || 9,
      shots,
    },
    copy: {
      product_title: title,
      hook: sanitizeHyperframesText(
        product.hook ?? "รีวิวสินค้าแบบอัตโนมัติ",
        120
      ),
      cta: sanitizeHyperframesText(product.cta ?? "ดูรายละเอียดสินค้า", 120),
    },
    assets: buildAssetsFromState({
      tenantId: input.tenantId,
      runState: input.runState,
      productState: input.productState,
    }),
    compliance: {
      requiresDisclosure: Boolean(product.requiresDisclosure),
      disclosureText: sanitizeHyperframesText(product.disclosureText ?? "", 240),
      blockedClaims: arrayFrom(product.blockedClaims).map(value =>
        sanitizeHyperframesText(value, 240)
      ),
      warnings: arrayFrom(product.warnings).map(value =>
        sanitizeHyperframesText(value, 240)
      ),
    },
    provenance: {
      tenantId: input.tenantId,
      userId: input.userId,
      productId: input.productId,
      runId: input.runId,
      renderJobId: input.renderJobId,
      launchMode: "auto_storyboard_review",
      renderIntent,
      compositionMode,
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      templateContentHash: template.templateContentHash,
      platformPresetId: platformPreset.presetId,
      platformPresetVersion: platformPreset.platformPresetVersion,
      compositionInputHash,
      builderVersion: "hyperframes_composition_builder_v1",
      createdAt: (input.now ?? new Date()).toISOString(),
    },
  });
}

export function getHyperframesCompositionInputHash(
  input: HyperframesCompositionInput
): string {
  return input.provenance.compositionInputHash;
}
