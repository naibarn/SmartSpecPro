/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createDefaultDocument } from "../createDefaultDocument";
import {
  getBrollFileKind,
  getBrollSlotAsset,
  toBrollLayerSourceUrl,
} from "../BrollPanel";
import { addLayer } from "../timelineEdits";

describe("getBrollSlotAsset", () => {
  it("classifies image and video files even when browser MIME is empty", () => {
    expect(
      getBrollFileKind(new File(["image"], "frame.png", { type: "" }))
    ).toBe("image");
    expect(
      getBrollFileKind(new File(["video"], "clip.mp4", { type: "" }))
    ).toBe("video");
  });

  it("resolves relative storage URLs before adding a Remotion layer", () => {
    expect(toBrollLayerSourceUrl("/api/storage/files/image.png")).toBe(
      `${window.location.origin}/api/storage/files/image.png`
    );
  });

  it("reconstructs a persisted image slot from scene layers after a tab remount", () => {
    const document = createDefaultDocument({});
    const scene = document.scenes[0];
    if (!scene) throw new Error("default document has no scene");

    const nextDocument = addLayer(document, {
      layer: {
        type: "image",
        src: "https://example.com/broll-scene-1.png",
        fit: "contain",
      },
      absoluteStartMs: scene.startMs,
      durationMs: scene.endMs - scene.startMs,
      band: "overlay",
      name: `B-roll · ${scene.sceneId}`,
    }).document;

    const nextScene = nextDocument.scenes[0];
    expect(nextScene).toBeDefined();
    expect(getBrollSlotAsset(nextScene!, "image")).toMatchObject({
      kind: "image",
      storageUrl: "https://example.com/broll-scene-1.png",
      thumbnailUrl: "https://example.com/broll-scene-1.png",
    });
  });

  it("reconstructs a persisted video slot from scene layers after a tab remount", () => {
    const document = createDefaultDocument({});
    const scene = document.scenes[0];
    if (!scene) throw new Error("default document has no scene");

    const nextDocument = addLayer(document, {
      layer: {
        type: "video",
        src: "https://example.com/broll-scene-1.mp4",
      },
      absoluteStartMs: scene.startMs,
      durationMs: scene.endMs - scene.startMs,
      band: "background",
      name: `B-roll · ${scene.sceneId}`,
    }).document;

    expect(getBrollSlotAsset(nextDocument.scenes[0]!, "video")).toMatchObject({
      kind: "video",
      storageUrl: "https://example.com/broll-scene-1.mp4",
    });
  });

  it("does not treat unrelated timeline images as B-roll slots", () => {
    const document = createDefaultDocument({});
    const scene = document.scenes[0];
    if (!scene) throw new Error("default document has no scene");

    const nextDocument = addLayer(document, {
      layer: {
        type: "image",
        src: "https://example.com/timeline-image.png",
        fit: "cover",
      },
      absoluteStartMs: scene.startMs,
      durationMs: 1000,
      band: "overlay",
      name: "ภาพประกอบทั่วไป",
    }).document;

    expect(getBrollSlotAsset(nextDocument.scenes[0]!, "image")).toBeNull();
  });
});
