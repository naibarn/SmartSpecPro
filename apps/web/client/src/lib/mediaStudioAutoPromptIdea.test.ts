import { describe, expect, it } from "vitest";

import {
  buildMediaStudioDynamicReferenceImageMirror,
  buildMediaStudioAutoPromptReferenceImageSync,
  buildMediaStudioAutoPromptIdea,
  extractMediaStudioDynamicImageUrls,
  hasMediaStudioDynamicImageFields,
} from "./mediaStudioAutoPromptIdea";

describe("buildMediaStudioAutoPromptIdea", () => {
  it("returns topic directly when topic is the only meaningful advanced form field", () => {
    expect(buildMediaStudioAutoPromptIdea({
      dynamicFormValues: {
        topic: "หมากับแมวเดินคุยกัน ด้วยเรื่องตลก ๆ",
        delivery_mode: "multi_video",
      },
      skillSchema: {
        sections: [
          { fields: [{ id: "topic" }, { id: "delivery_mode" }] },
        ],
      },
    })).toBe("หมากับแมวเดินคุยกัน ด้วยเรื่องตลก ๆ");
  });

  it("combines prompt box text with advanced form context without dropping topic", () => {
    expect(buildMediaStudioAutoPromptIdea({
      mainPrompt: "make it cinematic",
      dynamicFormValues: {
        topic: "a dog and a cat having a funny conversation",
        prompt_goal: "playful family-friendly comedy",
      },
      skillSchema: {
        sections: [
          { fields: [{ id: "topic" }, { id: "prompt_goal" }] },
        ],
      },
    })).toBe(
      "Prompt: make it cinematic\n\nTopic: a dog and a cat having a funny conversation\n\nPrompt Goal: playful family-friendly comedy",
    );
  });

  it("deduplicates repeated values between request and topic", () => {
    expect(buildMediaStudioAutoPromptIdea({
      advancedRequest: "retro neon city chase",
      dynamicFormValues: {
        topic: "retro neon city chase",
      },
    })).toBe("retro neon city chase");
  });

  it("ignores non-text technical fields", () => {
    expect(buildMediaStudioAutoPromptIdea({
      dynamicFormValues: {
        topic: "product reveal for a silver watch",
        duration_seconds: 8,
        reference_images: ["/uploads/watch.png"],
      },
    })).toBe("product reveal for a silver watch");
  });
});

describe("extractMediaStudioDynamicImageUrls", () => {
  it("extracts selected image URLs from dynamic skill form fields", () => {
    expect(extractMediaStudioDynamicImageUrls({
      reference_product_images: [
        "/uploads/product.png",
        "https://cdn.example.com/product-2.webp",
      ],
      reference_character_images: [
        { url: "/api/storage/files/images/character.png" },
      ],
      topic: "cosmetic product storyboard",
    })).toEqual([
      "/uploads/product.png",
      "https://cdn.example.com/product-2.webp",
      "/api/storage/files/images/character.png",
    ]);
  });

  it("ignores non-image fields and deduplicates URLs", () => {
    expect(extractMediaStudioDynamicImageUrls({
      request: "make a premium character",
      reference_images: ["/uploads/same.png", "/uploads/same.png"],
      notes: "/uploads/not-an-image-field.png",
    })).toEqual(["/uploads/same.png"]);
  });
});

describe("hasMediaStudioDynamicImageFields", () => {
  it("detects image fields even after all images are removed", () => {
    expect(hasMediaStudioDynamicImageFields({
      reference_images: [],
      topic: "product grid",
    })).toBe(true);
  });

  it("ignores ordinary text fields that happen to contain an image URL", () => {
    expect(hasMediaStudioDynamicImageFields({
      notes: "/uploads/not-a-reference-field.png",
    })).toBe(false);
  });

  it("does not treat image option fields as controlled reference images", () => {
    expect(hasMediaStudioDynamicImageFields({
      imageResolution: "1k",
      prompt: "make a product photo",
    })).toBe(false);
  });
});

describe("buildMediaStudioAutoPromptReferenceImageSync", () => {
  it("adds dynamic skill image fields to the reference tray in prompt order", () => {
    const sync = buildMediaStudioAutoPromptReferenceImageSync({
      referenceImages: [],
      dynamicImageUrls: [
        "/uploads/character.png",
        "/uploads/product.png",
        "/uploads/environment.png",
      ],
      maxImages: 5,
    });

    expect(sync.items.map((image) => image.url)).toEqual([
      "/uploads/character.png",
      "/uploads/product.png",
      "/uploads/environment.png",
    ]);
    expect(sync.addedCount).toBe(3);
    expect(sync.changed).toBe(true);
  });

  it("preserves existing reference image order before appended skill images", () => {
    const sync = buildMediaStudioAutoPromptReferenceImageSync({
      referenceImages: [
        { url: "/uploads/existing.png", name: "existing" },
      ],
      dynamicImageUrls: [
        "/uploads/product.png",
      ],
      maxImages: 5,
    });

    expect(sync.items).toEqual([
      { url: "/uploads/existing.png", name: "existing" },
      { url: "/uploads/product.png", name: "auto-prompt-reference-2" },
    ]);
  });

  it("deduplicates and applies the media model reference limit", () => {
    const sync = buildMediaStudioAutoPromptReferenceImageSync({
      referenceImages: [
        { url: "/uploads/existing.png", name: "existing" },
      ],
      dynamicImageUrls: [
        "/uploads/existing.png",
        "/uploads/product.png",
        "/uploads/environment.png",
      ],
      maxImages: 2,
    });

    expect(sync.items.map((image) => image.url)).toEqual([
      "/uploads/existing.png",
      "/uploads/product.png",
    ]);
    expect(sync.droppedCount).toBe(1);
  });
});

describe("buildMediaStudioDynamicReferenceImageMirror", () => {
  it("mirrors dynamic skill images and removes stale main references", () => {
    const sync = buildMediaStudioDynamicReferenceImageMirror({
      referenceImages: [
        { url: "/uploads/old.png", name: "old" },
        { url: "/uploads/product.png", name: "product" },
      ],
      dynamicImageUrls: ["/uploads/product.png"],
      maxImages: 5,
    });

    expect(sync.items).toEqual([
      { url: "/uploads/product.png", name: "product" },
    ]);
    expect(sync.changed).toBe(true);
  });

  it("clears main references when the controlled skill image field is emptied", () => {
    const sync = buildMediaStudioDynamicReferenceImageMirror({
      referenceImages: [
        { url: "/uploads/old.png", name: "old" },
      ],
      dynamicImageUrls: [],
      maxImages: 5,
    });

    expect(sync.items).toEqual([]);
    expect(sync.changed).toBe(true);
  });
});
