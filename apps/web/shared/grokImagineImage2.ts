export const GROK_IMAGINE_IMAGE_2_MODEL_ID = "grok-imagine-image-2";
export const GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_MODEL_ID =
  "grok-imagine-image-2/segment-map";

export const GROK_IMAGINE_IMAGE_2_TEXT_TO_IMAGE_KIE_MODEL_ID =
  "grok-imagine-image-2-0/text-to-image";
export const GROK_IMAGINE_IMAGE_2_IMAGE_EDIT_KIE_MODEL_ID =
  "grok-imagine-image-2-0/image-edit";
export const GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_KIE_MODEL_ID =
  "grok-imagine-image-2-0/segment-map";

export const GROK_IMAGINE_IMAGE_2_FAMILY = "grok-imagine-image-2";

export type GrokImagineImage2Operation =
  | "text-to-image"
  | "image-edit"
  | "segment-map";

export function isGrokImagineImage2Model(modelId: unknown): boolean {
  const normalized = String(modelId ?? "").trim().toLowerCase();
  return (
    normalized === GROK_IMAGINE_IMAGE_2_MODEL_ID ||
    normalized === GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_MODEL_ID
  );
}

export function isGrokImagineImage2FamilyModel(modelId: unknown): boolean {
  const normalized = String(modelId ?? "").trim().toLowerCase();
  return (
    normalized === GROK_IMAGINE_IMAGE_2_MODEL_ID ||
    normalized === GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_MODEL_ID ||
    normalized === GROK_IMAGINE_IMAGE_2_TEXT_TO_IMAGE_KIE_MODEL_ID ||
    normalized === GROK_IMAGINE_IMAGE_2_IMAGE_EDIT_KIE_MODEL_ID ||
    normalized === GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_KIE_MODEL_ID
  );
}

export function resolveGrokImagineImage2Operation(params: {
  modelId: unknown;
  sourceMediaTaskId?: unknown;
}): GrokImagineImage2Operation | null {
  const modelId = String(params.modelId ?? "").trim().toLowerCase();
  if (modelId === GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_MODEL_ID) {
    return "segment-map";
  }
  if (modelId !== GROK_IMAGINE_IMAGE_2_MODEL_ID) {
    return null;
  }
  return String(params.sourceMediaTaskId ?? "").trim()
    ? "image-edit"
    : "text-to-image";
}
