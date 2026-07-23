/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.8. Source grep-guard for StoryboardReviewPage wiring.
 * StoryboardReviewPage is 15,000+ lines and must NEVER be mounted in
 * jsdom (binding decision §3.3). Behavior is proven on
 * `SequentialShotReviewSection`'s own test file; this file only proves the
 * page wires it in correctly.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../StoryboardReviewPage.tsx"
);

const source = readFileSync(sourcePath, "utf-8");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("StoryboardReviewPage sequential shots wiring (Feature 136 section 11)", () => {
  it("imports and mounts SequentialShotReviewSection", () => {
    expect(source).toContain("SequentialShotReviewSection");
    expect(source).toMatch(/<SequentialShotReviewSection\b/);
  });

  it("queries getAutoReviewRun gated on effectiveHyperframesRunId, not the summary:true list query", () => {
    const queryBlock = sourceBetween(
      "const autoReviewRunQuery = trpc.marketplaceCapture.getAutoReviewRun.useQuery(",
      "const sequentialShotCards = useMemo("
    );
    expect(queryBlock).toContain("runId: effectiveHyperframesRunId");
    expect(queryBlock).toContain("enabled: Boolean(effectiveHyperframesRunId)");
    expect(queryBlock).not.toContain("summary: true");
    expect(queryBlock).not.toContain("listAutoReviewRuns");
  });

  it("never sources sequential shot/loop-report data from listAutoReviewRuns", () => {
    // `listAutoReviewRuns` may legitimately appear elsewhere in this page for
    // unrelated history/summary surfaces, but the shot projections must only
    // ever read from the full-metadata `getAutoReviewRun` query result.
    const shotCardsBlock = sourceBetween(
      "const sequentialShotCards = useMemo(",
      "const sequentialLoopReport = useMemo("
    );
    const loopReportBlock = sourceBetween(
      "const sequentialLoopReport = useMemo(",
      "const [sequentialRegeneratingShotId"
    );
    expect(shotCardsBlock).toContain("autoReviewRunQuery.data");
    expect(shotCardsBlock).not.toContain("listAutoReviewRuns");
    expect(loopReportBlock).toContain("autoReviewRunQuery.data");
    expect(loopReportBlock).not.toContain("listAutoReviewRuns");
  });

  it("is guarded by the shot projection self-disabling for non-sequential (3x3/start-stop) reviews", () => {
    const mountBlock = sourceBetween(
      "<SequentialShotReviewSection",
      "onSaveShotEdits={handleSaveSequentialShotEdits}"
    );
    // `projectSequentialShotCards` returns `[]` for legacy 3x3/start-stop
    // metadata (proven in the pure-lib test suite); the section itself
    // renders `null` on an empty `shots` array, so the mount needs no
    // additional per-strategy branching here beyond feeding it the
    // projection directly.
    expect(mountBlock).toContain("shots={sequentialShotCards}");
    expect(source).toContain(
      "projectSequentialShotCards((autoReviewRunQuery.data as any)?.metadataJson)"
    );
  });

  it("wires the marketplace spare-image repair (alternate-swap) mutation into the mount, alongside the existing regenerate/save wiring", () => {
    expect(source).toContain(
      "trpc.marketplaceCapture.selectAutoReviewSequentialShotAlternate.useMutation"
    );
    // Same card-level error surface as the save-edits rejection path (no
    // separate toast, no separate error prop) — proven by reusing the
    // shared `sequentialShotError` state inside the new mutation's
    // `onError`.
    const mutationBlock = sourceBetween(
      "const selectSequentialShotAlternateMutation =",
      "const handleRegenerateSequentialShot = useCallback("
    );
    expect(mutationBlock).toContain("setSequentialShotError(");
    expect(mutationBlock).toContain("setSequentialSwappingShotId(null)");
    expect(mutationBlock).not.toContain("toast.error");

    const mountBlock = sourceBetween(
      "<SequentialShotReviewSection",
      "onSaveShotEdits={handleSaveSequentialShotEdits}"
    );
    expect(mountBlock).toContain("swappingShotId={sequentialSwappingShotId}");
    expect(source).toContain(
      "onSelectShotAlternate={handleSelectSequentialShotAlternate}"
    );
  });
});
