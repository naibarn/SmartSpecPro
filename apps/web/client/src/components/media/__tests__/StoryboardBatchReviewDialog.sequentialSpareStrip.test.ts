/**
 * Marketplace spare-image repair — Storyboard Review clip list placement
 * (2026-07-23 direct user feedback on b661284a6). Source grep-guard for the
 * clip-list wiring in `StoryboardBatchReviewDialog.tsx`, mirroring the
 * established pattern in
 * `pages/__tests__/StoryboardReviewPage.sequentialShots.test.ts`:
 * `StoryboardBatchReviewDialog.tsx` is 3,800+ lines with a very large prop
 * surface, so this proves the wiring by source inspection rather than a
 * brittle full jsdom mount. Behavior of the shared strip itself (thumbnail
 * rendering, disabled/selected state, click semantics) is proven on
 * `SequentialShotAlternatesStrip` via
 * `SequentialShotReviewSection.test.tsx` (both consumers share the same
 * component).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../StoryboardBatchReviewDialog.tsx"
);

const source = readFileSync(sourcePath, "utf-8");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("StoryboardBatchReviewDialog clip list spare-image wiring (Feature 136 / 2026-07-23)", () => {
  it("imports the shared strip and the clip -> shot resolver", () => {
    expect(source).toContain(
      'import { SequentialShotAlternatesStrip } from "@/components/marketplaceCapture/SequentialShotAlternatesStrip";'
    );
    expect(source).toContain("resolveSequentialShotCardForStoryboardTask");
  });

  it("resolves the clip's shot from the explicit extraParams.shotId hint first, task.index as the fallback", () => {
    const resolveBlock = sourceBetween(
      "const matchedSequentialShot = resolveSequentialShotCardForStoryboardTask({",
      "const sequentialAlternates = matchedSequentialShot?.alternates ?? [];"
    );
    expect(resolveBlock).toContain("taskIndex: task.index");
    expect(resolveBlock).toContain("task.generationExtraParams?.shotId");
    expect(resolveBlock).toContain("shots: sequentialShots");
  });

  it("mounts the strip only when a shot matched AND it has more than one alternate (no empty-wrapper layout shift)", () => {
    expect(source).toContain(
      "{matchedSequentialShot && sequentialAlternates.length > 1 ? ("
    );
    const mountBlock = sourceBetween(
      "{matchedSequentialShot && sequentialAlternates.length > 1 ? (",
      ") : null}\n                    </div>"
    );
    expect(mountBlock).toContain("<SequentialShotAlternatesStrip");
    expect(mountBlock).toContain("shotId={matchedSequentialShot.shotId}");
    expect(mountBlock).toContain("alternates={sequentialAlternates}");
    expect(mountBlock).toContain(
      "swapping={sequentialSwappingShotId === matchedSequentialShot.shotId}"
    );
  });

  it("clicking a spare thumbnail opens the full-screen preview (onOpenPreview) instead of swapping immediately", () => {
    const mountBlock = sourceBetween(
      "<SequentialShotAlternatesStrip",
      "locale={locale}\n                        />"
    );
    expect(mountBlock).toContain("onOpenPreview={");
    expect(mountBlock).toContain("setLightboxMedia({");
    // The direct-select path is still wired for the legacy hover-less strip
    // usage, but the clip list's own click MUST go through the preview,
    // not call the swap mutation synchronously from the thumbnail click.
    expect(mountBlock).toContain(
      "onSelectAlternate={(input) => onSelectSequentialShotAlternate?.(input)}"
    );
  });

  it("the lightbox 'use this image' action calls the existing alternate-select handler and then closes the preview", () => {
    const useActionBlock = sourceBetween(
      "useAction: {",
      "});\n                          }}\n                          locale={locale}"
    );
    expect(useActionBlock).toContain(
      "onSelectSequentialShotAlternate?.({ shotId, attempt })"
    );
    expect(useActionBlock).toContain("setLightboxMedia(null)");
    expect(useActionBlock).toContain("isCurrent: isSelected");
    expect(useActionBlock).toContain(
      "disabled: isSelected || sequentialSwappingShotId === shotId"
    );
  });

  it("the lightbox renders an explicit 'use this image' button (or an in-use indicator) sourced from the shared copy module", () => {
    const lightboxHeaderBlock = sourceBetween(
      "{lightboxMedia.useAction ? (",
      "<Button asChild type=\"button\" size=\"sm\" variant=\"secondary\">"
    );
    expect(lightboxHeaderBlock).toContain("lightboxMedia.useAction.isCurrent");
    expect(lightboxHeaderBlock).toContain("lightboxMedia.useAction.inUseLabel");
    expect(lightboxHeaderBlock).toContain("lightboxMedia.useAction.onUse");
    expect(lightboxHeaderBlock).toContain("lightboxMedia.useAction.label");
    expect(source).toContain("hyperframesCopy.spareImageUseThisLabel");
    expect(source).toContain("hyperframesCopy.spareImageCurrentBadge");
  });

  it("never charges credits or calls a new mutation — reuses onSelectSequentialShotAlternate exactly as passed in", () => {
    // Everything the clip list does to actually change the live frame goes
    // through the SAME callback prop the page wires to
    // `selectAutoReviewSequentialShotAlternate` (see
    // `StoryboardReviewPage.sequentialShots.test.ts`); this file must never
    // introduce a second mutation or a direct tRPC call of its own.
    expect(source).not.toContain("selectAutoReviewSequentialShotAlternate");
    expect(source.match(/onSelectSequentialShotAlternate\?\.\(/g)?.length).toBe(2);
  });
});
