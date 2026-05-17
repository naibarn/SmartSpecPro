import { describe, expect, it } from "vitest";

import {
  buildMediaStudioAutoPromptIdea,
  extractMediaStudioDynamicImageUrls,
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
