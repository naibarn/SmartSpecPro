import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const EN_MEDIA = join(import.meta.dirname, "../../locales/en/media.json");
const TH_MEDIA = join(import.meta.dirname, "../../locales/th/media.json");

const REQUIRED_MEDIA_STUDIO_HYPERFRAMES_KEYS = [
  "historyGalleryShort",
  "historyGalleryShowingCount",
  "loadingMoreHistory",
  "marketplaceImagesShort",
  "searchLibraryShort",
] as const;

function readMediaJson(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, string>;
}

describe("MediaStudio HyperFrames route locale keys", () => {
  it.each([
    ["en", EN_MEDIA],
    ["th", TH_MEDIA],
  ])("%s media locale includes history gallery status keys", (_, path) => {
    const data = readMediaJson(path);

    for (const key of REQUIRED_MEDIA_STUDIO_HYPERFRAMES_KEYS) {
      expect(data[key], `Missing or empty media.${key}`).toEqual(
        expect.any(String)
      );
      expect(data[key].trim(), `Empty media.${key}`).not.toBe("");
    }
  });
});
