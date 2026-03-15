import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for backfill-media-assets.ts script (Section 12).
 *
 * Tests the core logic functions extracted from the backfill script,
 * not the script's main() entry point (which connects to a real DB).
 */

// Import the exported pure functions after they're implemented
// All DB operations are injected as parameters to avoid real DB connections

import {
  extractImageAttachments,
  buildAssetStorageKey,
  isAlreadyBackfilled,
} from "../backfill-media-assets";

describe("backfill-media-assets", () => {
  describe("extractImageAttachments", () => {
    it("should return only image-type attachments", () => {
      const attachments = [
        { type: "image", url: "https://example.com/img.jpg", key: "media/img.jpg" },
        { type: "file", url: "https://example.com/doc.pdf" },
        { type: "audio", url: "https://example.com/audio.mp3" },
      ];
      const result = extractImageAttachments(attachments);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("image");
    });

    it("should return empty array for null or empty attachments", () => {
      expect(extractImageAttachments(null)).toHaveLength(0);
      expect(extractImageAttachments([])).toHaveLength(0);
    });

    it("should return empty array for attachments with no images", () => {
      const attachments = [{ type: "file", url: "https://example.com/doc.pdf" }];
      expect(extractImageAttachments(attachments)).toHaveLength(0);
    });
  });

  describe("buildAssetStorageKey", () => {
    it("should prefer attachment.key over URL parsing", () => {
      const result = buildAssetStorageKey({ url: "https://example.com/img.jpg", key: "media/path/img.jpg" });
      expect(result).toBe("media/path/img.jpg");
    });

    it("should parse storageKey from URL when key is missing", () => {
      const result = buildAssetStorageKey({ url: "https://bucket.s3.amazonaws.com/media/img.jpg" });
      // Should extract the path portion after the host
      expect(result).toContain("media/img.jpg");
    });

    it("should return url as fallback when no key and URL cannot be parsed", () => {
      const result = buildAssetStorageKey({ url: "not-a-valid-url" });
      expect(result).toBe("not-a-valid-url");
    });
  });

  describe("isAlreadyBackfilled", () => {
    it("should return true when attachment already has assetId", () => {
      expect(isAlreadyBackfilled({ type: "image", url: "x", assetId: 42 })).toBe(true);
    });

    it("should return false when attachment has no assetId", () => {
      expect(isAlreadyBackfilled({ type: "image", url: "x" })).toBe(false);
    });

    it("should return false when assetId is 0 or null", () => {
      expect(isAlreadyBackfilled({ type: "image", url: "x", assetId: 0 })).toBe(false);
      expect(isAlreadyBackfilled({ type: "image", url: "x", assetId: null })).toBe(false);
    });
  });

  describe("batch processing behavior (documented)", () => {
    it("should skip messages with only non-image attachments", () => {
      const attachments = [{ type: "file" }, { type: "video" }];
      const imageAttachments = extractImageAttachments(attachments);
      expect(imageAttachments).toHaveLength(0);
    });

    it("should not process attachments that are already backfilled", () => {
      const attachment = { type: "image", url: "x", assetId: 99 };
      expect(isAlreadyBackfilled(attachment)).toBe(true);
    });
  });
});
