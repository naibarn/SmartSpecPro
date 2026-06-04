import {
  HyperframesArtifactRefSchema,
  type HyperframesArtifactRef,
  type HyperframesCompositionInput,
} from "@shared/hyperframes/contracts";
import { stableHash } from "@shared/hyperframes/contracts";
import {
  redactHyperframesDiagnostics,
  sanitizeHyperframesAssetRef,
} from "./hyperframesCompositionSanitizer";

export interface HyperframesStagedAsset {
  assetId: string;
  slot: string;
  kind: string;
  originalRef: string;
  stagedRef: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  tenantId: string;
  productId: string;
  runId: string;
  renderJobId: string;
  diagnostics: string;
}

export interface HyperframesStagedManifest {
  manifestId: string;
  tenantId: string;
  productId: string;
  runId: string;
  renderJobId: string;
  compositionInputHash: string;
  assets: HyperframesStagedAsset[];
  artifactRef: HyperframesArtifactRef;
  cleanupPolicy: {
    tenantScopedTempDir: string;
    cleanupOnSuccess: boolean;
    cleanupOnFailure: boolean;
  };
}

function inferMimeType(ref: string, kind: string): string {
  const lower = ref.toLowerCase();
  if (kind === "audio") return "audio/mpeg";
  if (kind === "subtitle") return "text/vtt";
  if (kind === "generated_clip" || lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export function buildHyperframesTenantRunStoragePrefix(input: {
  tenantId: string;
  runId: string;
  renderJobId: string;
}): string {
  for (const value of [input.tenantId, input.runId, input.renderJobId]) {
    if (!/^[a-zA-Z0-9_.:-]+$/.test(value)) {
      throw new Error("Invalid HyperFrames storage path identity");
    }
  }
  return `marketplace-auto-review/${input.tenantId}/${input.runId}/hyperframes/${input.renderJobId}`;
}

export function stageHyperframesAssets(input: {
  composition: HyperframesCompositionInput;
  renderJobId: string;
  maxAssets?: number;
  maxStagedBytes?: number;
}): HyperframesStagedManifest {
  const maxAssets = input.maxAssets ?? 40;
  const maxStagedBytes = input.maxStagedBytes ?? 750 * 1024 * 1024;
  if (input.composition.assets.length > maxAssets) {
    throw new Error("HyperFrames asset count exceeds policy");
  }
  const tenantId = input.composition.provenance.tenantId;
  const productId = input.composition.provenance.productId;
  const runId = input.composition.provenance.runId ?? "pending_run";
  const prefix = buildHyperframesTenantRunStoragePrefix({
    tenantId,
    runId,
    renderJobId: input.renderJobId,
  });
  const assets = input.composition.assets.map((asset, index) => {
    if (asset.ownedByTenantId && asset.ownedByTenantId !== tenantId) {
      throw new Error("HyperFrames asset ownership mismatch");
    }
    const stagedRef = `${prefix}/composition/assets/${asset.assetId}`;
    const originalRef = sanitizeHyperframesAssetRef(asset.ref);
    return {
      assetId: asset.assetId,
      slot: asset.slot,
      kind: asset.kind,
      originalRef,
      stagedRef,
      contentHash: asset.contentHash ?? stableHash({ originalRef, index }),
      mimeType: inferMimeType(originalRef, asset.kind),
      sizeBytes: 1_000_000,
      tenantId,
      productId,
      runId,
      renderJobId: input.renderJobId,
      diagnostics: redactHyperframesDiagnostics(originalRef),
    };
  });
  const stagedBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  if (stagedBytes > maxStagedBytes) {
    throw new Error("HyperFrames staged bytes exceed policy");
  }
  const manifestHash = stableHash({
    inputHash: input.composition.provenance.compositionInputHash,
    assets: assets.map(asset => asset.contentHash),
  });
  const artifactRef = HyperframesArtifactRefSchema.parse({
    artifactId: `hf_manifest_${manifestHash}`,
    kind: "hyperframes_manifest",
    storageRef: `${prefix}/manifest.json`,
    contentHash: manifestHash,
    mimeType: "application/json",
    sizeBytes: 2048,
    retentionClass: "audit",
    redacted: true,
  });
  return {
    manifestId: artifactRef.artifactId,
    tenantId,
    productId,
    runId,
    renderJobId: input.renderJobId,
    compositionInputHash: input.composition.provenance.compositionInputHash,
    assets,
    artifactRef,
    cleanupPolicy: {
      tenantScopedTempDir: `/tmp/smartspec-hyperframes/${tenantId}/${runId}/${input.renderJobId}`,
      cleanupOnSuccess: true,
      cleanupOnFailure: true,
    },
  };
}
