import {
  mediaOperationClaimCapability,
  type MediaOperation,
} from "@smartspec/shared";

export interface EditorRuntimeEnvelopeInput {
  operation: MediaOperation;
  contractVersion: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  assets: Array<{ namespace: string; id: string | number }>;
}

export function adaptEditorRuntimeEnvelope(input: EditorRuntimeEnvelopeInput): {
  runtime: "node" | "windows";
  claim: string;
  contractVersion: string;
  tenantId: string;
  projectId: string;
  revisionId: string;
  assetRefs: Array<{ namespace: string; id: string | number }>;
} {
  if (
    !input.tenantId ||
    !input.projectId ||
    !input.revisionId ||
    input.assets.length === 0
  )
    throw new Error("RUNTIME_ENVELOPE_INVALID");
  if (
    input.assets.some(
      asset =>
        asset.namespace !== "media_asset" ||
        (typeof asset.id !== "number" &&
          !/^[A-Za-z0-9._:-]{1,160}$/.test(String(asset.id)))
    )
  )
    throw new Error("ASSET_LOCALITY_INVALID");
  const runtime =
    input.operation === "media.composition_scan" ? "node" : "windows";
  return {
    runtime,
    claim: mediaOperationClaimCapability(input.operation),
    contractVersion: input.contractVersion,
    tenantId: input.tenantId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    assetRefs: input.assets.map(asset => ({ ...asset })),
  };
}

export function selectEditorRuntime(
  operation: MediaOperation,
  requested: "node" | "windows" | "browser"
):
  | { state: "eligible"; runtime: "node" | "windows" }
  | {
      state: "capability_blocked";
      reason: "node_adapter_required" | "unsupported_browser";
    } {
  if (operation === "media.composition_scan" && requested !== "node")
    return { state: "capability_blocked", reason: "node_adapter_required" };
  if (requested === "browser" && operation === "video.render")
    return { state: "capability_blocked", reason: "unsupported_browser" };
  return {
    state: "eligible",
    runtime:
      operation === "media.composition_scan"
        ? "node"
        : requested === "node"
          ? "node"
          : "windows",
  };
}
