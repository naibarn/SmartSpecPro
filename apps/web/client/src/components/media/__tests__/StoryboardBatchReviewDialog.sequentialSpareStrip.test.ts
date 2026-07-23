/**
 * Marketplace spare-image repair — Storyboard Review clip list placement
 * (2026-07-23 direct user feedback on b661284a6, then relocated the same
 * day per follow-up feedback on 09f311ad1). Source grep-guard for the
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
 *
 * Placement history: the strip first rendered in the ~130px-wide left
 * column next to the clip's "Ref" thumbnail — too narrow for even 2
 * thumbnails without a horizontal scrollbar. It now renders full width in
 * the wide middle column, directly below the action button row (Edit /
 * Copy Prompt / Generate video / .../ Up / Down / Keep / Remove), using
 * `layout="wrap"` so it never needs to scroll and `size="md"` since width
 * is no longer scarce.
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

  it("mounts the strip exactly once (no leftover left-column duplicate), only when a shot matched AND it has more than one alternate", () => {
    // Exactly one JSX mount site — a prior placement rendered it in the
    // left column next to the Ref thumbnail; that instance must be gone,
    // not left duplicated alongside the new one.
    expect(
      source.match(/<SequentialShotAlternatesStrip\b/g)?.length
    ).toBe(1);
    expect(
      source.match(/\{matchedSequentialShot && sequentialAlternates\.length > 1 \? \(/g)
        ?.length
    ).toBe(1);

    const mountBlock = sourceBetween(
      "{matchedSequentialShot && sequentialAlternates.length > 1 ? (",
      "locale={locale}\n                        />\n                      ) : null}"
    );
    expect(mountBlock).toContain("<SequentialShotAlternatesStrip");
    expect(mountBlock).toContain("shotId={matchedSequentialShot.shotId}");
    expect(mountBlock).toContain("alternates={sequentialAlternates}");
    expect(mountBlock).toContain(
      "swapping={sequentialSwappingShotId === matchedSequentialShot.shotId}"
    );
  });

  it("renders full width in the wide middle column, directly below the action button row (not in the narrow left column)", () => {
    // The action row's own Remove button ("common.remove") must close
    // BEFORE the strip mount, in the same `min-w-0 flex-1` middle column —
    // i.e. the strip sits right after the action row, not beside the Ref
    // thumbnail/dropzone in the narrow left column.
    const middleColumnTail = sourceBetween(
      'onClick={() => onRemoveTask(task.id)}',
      "locale={locale}\n                        />\n                      ) : null}"
    );
    expect(middleColumnTail).toContain('{t("common.remove")}');
    expect(middleColumnTail).toContain("<SequentialShotAlternatesStrip");
    // No overflow-x-auto scroll wrapper and no narrow left-column grid
    // class on the strip's own root — it uses the wrap layout instead.
    expect(middleColumnTail).toContain('layout="wrap"');
    expect(middleColumnTail).toContain('size="md"');
    expect(middleColumnTail).not.toContain("col-span-2 sm:col-span-1");
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
