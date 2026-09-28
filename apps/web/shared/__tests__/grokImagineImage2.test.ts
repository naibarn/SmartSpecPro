import { describe, expect, it } from "vitest";
import {
  GROK_IMAGINE_IMAGE_2_MODEL_ID,
  GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_MODEL_ID,
  isGrokImagineImage2FamilyModel,
  resolveGrokImagineImage2Operation,
} from "../grokImagineImage2";

describe("Grok Imagine Image 2 operation routing", () => {
  it("keeps text-to-image and image-edit under one catalog model", () => {
    expect(
      resolveGrokImagineImage2Operation({
        modelId: GROK_IMAGINE_IMAGE_2_MODEL_ID,
      }),
    ).toBe("text-to-image");
    expect(
      resolveGrokImagineImage2Operation({
        modelId: GROK_IMAGINE_IMAGE_2_MODEL_ID,
        sourceMediaTaskId: "media-task-1",
      }),
    ).toBe("image-edit");
    expect(
      resolveGrokImagineImage2Operation({
        modelId: GROK_IMAGINE_IMAGE_2_MODEL_ID,
        referenceImageUrls: ["https://cdn.example.com/ref-1.png", "ref-2"],
      }),
    ).toBe("image-edit");
  });

  it("keeps segment-map as a separate operation model", () => {
    expect(
      resolveGrokImagineImage2Operation({
        modelId: GROK_IMAGINE_IMAGE_2_SEGMENT_MAP_MODEL_ID,
        sourceMediaTaskId: "media-task-1",
      }),
    ).toBe("segment-map");
    expect(isGrokImagineImage2FamilyModel("grok-imagine-image-2-0/image-edit")).toBe(true);
    expect(isGrokImagineImage2FamilyModel("grok-imagine/text-to-image")).toBe(false);
  });
});
