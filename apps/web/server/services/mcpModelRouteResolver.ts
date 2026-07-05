/**
 * Pure, dependency-free helpers for resolving a media model id's MCP
 * provider route (e.g. `higgsfield/nano_banana_2` -> provider `higgsfield`,
 * provider-native model `nano_banana_2`). Extracted out of `routers/media.ts`
 * so other MCP-capable submission call sites — e.g. Vertical Drama's
 * `generateStartFrameImage`/`generateStartFrameAngleVariations`/
 * `generateVideoClip` in `routers/verticalDramaEpisodes.ts` — can reuse the
 * exact same route-parsing logic without importing `media.ts`'s router file
 * (and its large transitive module graph, which pulls in admin-only
 * procedures not safe to import from every MCP-capable call site/test).
 */

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parses a "provider/model" style model id (e.g. `higgsfield/nano_banana_2`,
 * `magnific-mcp/kling-v3-pro`) into its MCP provider route.
 */
export function resolveMcpRouteFromModelId(modelId: unknown): { providerKey?: string; providerModelId?: string } {
  const value = compactText(modelId);
  if (!value) return {};
  const [providerPart, ...modelParts] = value.split("/");
  const providerToken = providerPart?.trim().toLowerCase();
  const providerKey =
    providerToken === "higgsfield" || providerToken === "higgsfield-mcp"
      ? "higgsfield"
      : providerToken === "magnific" || providerToken === "magnific-mcp"
        ? "magnific"
        : undefined;
  if (!providerKey) return {};
  return {
    providerKey,
    providerModelId: modelParts.length > 0 ? modelParts.join("/").trim() || undefined : undefined,
  };
}

/** Default MCP tool/argument-shape identifier for a known provider + asset type. */
export function defaultMcpArgumentShape(providerKey: string | undefined, assetType: "image" | "video") {
  if (providerKey === "higgsfield") {
    return assetType === "image" ? "higgsfield.generate_image" : "higgsfield.generate_video";
  }
  if (providerKey === "magnific") {
    return assetType === "image" ? "magnific.images_generate" : "magnific.video_generate";
  }
  return undefined;
}
