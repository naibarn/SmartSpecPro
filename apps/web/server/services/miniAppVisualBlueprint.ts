import { z } from "zod";


const MAX_REFERENCES = 6;

const VisualBlueprintSchema = z.object({
  schemaVersion: z.literal("mini-app-visual-blueprint.v1"),
  summary: z.string().trim().min(1).max(1200),
  pages: z.array(z.object({
    page: z.string().trim().min(1).max(100),
    referenceIds: z.array(z.string().trim().min(1).max(128)).max(MAX_REFERENCES),
    state: z.string().trim().max(200).optional(),
    viewport: z.string().trim().max(100).optional(),
    layout: z.string().trim().min(1).max(1200),
    hierarchy: z.array(z.string().trim().min(1).max(240)).max(24),
    components: z.array(z.object({
      name: z.string().trim().min(1).max(120),
      placement: z.string().trim().min(1).max(400),
      behaviorHint: z.string().trim().max(400).optional(),
    }).strict()).max(40),
  }).strict()).min(1).max(12),
  designTokens: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(160),
    role: z.string().trim().max(160).optional(),
  }).strict()).max(48),
  responsiveTargets: z.array(z.object({
    viewport: z.string().trim().min(1).max(100),
    changes: z.array(z.string().trim().min(1).max(240)).max(16),
  }).strict()).max(12),
  confidence: z.number().min(0).max(1),
}).strict();

export type MiniAppVisualBlueprint = z.infer<typeof VisualBlueprintSchema>;

export function parseMiniAppVisualBlueprint(value: unknown): MiniAppVisualBlueprint {
  return VisualBlueprintSchema.parse(value);
}

export type MiniAppVisualReferenceImage = {
  id: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  pageHint?: string;
  stateHint?: string;
  viewportHint?: string;
};

export class MiniAppGatewayVisionAdapterUnavailableError extends Error {
  constructor() {
    super("MINI_APP_GATEWAY_VISION_ADAPTER_UNAVAILABLE");
    this.name = "MiniAppGatewayVisionAdapterUnavailableError";
  }
}

/** Reject visual model work until the existing Skill runtime has a vision adapter. */
export async function analyzeMiniAppVisualReferences(input: {
  userId: number;
  tenantId: string;
  runId: string;
  references: MiniAppVisualReferenceImage[];
  designPreferences?: Record<string, unknown>;
}): Promise<{ blueprint: MiniAppVisualBlueprint; modelId: string; creditsUsed: number; inputDigest: string }> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0 || !input.tenantId || !input.runId) {
    throw new Error("MINI_APP_VISION_OWNER_REQUIRED");
  }
  if (!Array.isArray(input.references) || input.references.length < 1 || input.references.length > MAX_REFERENCES) {
    throw new Error("MINI_APP_VISION_REFERENCE_COUNT_INVALID");
  }

  // SPEC-224 Mini-App work is Gateway-only. Do not use executeWithFallback,
  // which can call provider APIs, while the Skill runtime lacks vision input.
  throw new MiniAppGatewayVisionAdapterUnavailableError();
}
