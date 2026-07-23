/**
 * Marketplace mandatory text-plan review gate (2026-07-23,
 * planning/marketplace-storyboard-text-gate, commit f997ba1a9) — source
 * grep-guard for MPCPD wiring (precedent:
 * `MarketplaceCaptureProductDetail.sequentialUiWiring.test.ts`). MPCPD is
 * 9,000+ lines and must NEVER be mounted in jsdom. Behavior is proven on
 * `AutoReviewPlanReviewPanel`'s own test file; this file only proves the
 * page wires it in correctly and reuses the EXISTING cancel flow rather
 * than building a second one.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../MarketplaceCaptureProductDetail.tsx"
);

const source = readFileSync(sourcePath, "utf-8");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("MarketplaceCaptureProductDetail plan-review gate wiring (2026-07-23)", () => {
  it("imports the panel + projector from AutoReviewPlanReviewPanel and mounts it", () => {
    expect(source).toContain(
      'from "@/components/marketplaceCapture/AutoReviewPlanReviewPanel"'
    );
    expect(source).toContain("AutoReviewPlanReviewPanel");
    expect(source).toContain("buildAutoReviewPlanReviewPlanData");
    expect(source).toMatch(/<AutoReviewPlanReviewPanel\b/);
  });

  it("declares the gate-detection hooks/state before the product loading guards (Rules of Hooks)", () => {
    const productGuardIndexes = [
      source.indexOf("if (product.isLoading) return"),
      source.indexOf("if (!product.data) return"),
    ];
    for (const guardIndex of productGuardIndexes) {
      expect(guardIndex).toBeGreaterThanOrEqual(0);
    }

    const markers = [
      "const isStatusAutoReviewRunAwaitingPlanReview =",
      "const planReviewRunQuery = trpc.marketplaceCapture.getAutoReviewRun.useQuery(",
      "const approveAutoReviewPlanReviewMutation =",
      "const requestAutoReviewPlanRedraftMutation =",
    ];
    for (const marker of markers) {
      const index = source.indexOf(marker);
      expect(index, `${marker} must exist`).toBeGreaterThanOrEqual(0);
      for (const guardIndex of productGuardIndexes) {
        expect(index, `${marker} must run before product guards`).toBeLessThan(
          guardIndex
        );
      }
    }
  });

  it("gates on planReview.required + status === awaiting, a non-terminal run, and currentStage === image_generation (defense against a stale approved/cancelled run)", () => {
    const gate = sourceBetween(
      "const isStatusAutoReviewRunAwaitingPlanReview =",
      "const planReviewRunId ="
    );
    expect(gate).toContain("isAutoReviewRunBlockingStart(statusAutoReviewRun)");
    expect(gate).toContain(
      'compactText(statusAutoReviewRun?.currentStage) === "image_generation"'
    );
    expect(gate).toContain("statusAutoReviewRunPlanReview.required === true");
    expect(gate).toContain(
      'statusAutoReviewRunPlanReview.status === "awaiting"'
    );
  });

  it("only fetches the heavy getAutoReviewRun query while the gate is open, keyed to the held run's id", () => {
    const heavyQuery = sourceBetween(
      "const planReviewRunQuery = trpc.marketplaceCapture.getAutoReviewRun.useQuery(",
      "const planReviewPlanData ="
    );
    expect(heavyQuery).toContain("runId: planReviewRunId");
    expect(heavyQuery).toContain("enabled: Boolean(planReviewRunId)");

    const runIdDerivation = sourceBetween(
      "const planReviewRunId = isStatusAutoReviewRunAwaitingPlanReview",
      "const planReviewRunQuery ="
    );
    expect(runIdDerivation).toContain("? compactText(statusAutoReviewRun?.id)");
  });

  it("approve/redraft mutations refetch the polled run list on success and surface errors via this page's existing toast convention", () => {
    const approveMutation = sourceBetween(
      "const approveAutoReviewPlanReviewMutation =",
      "const requestAutoReviewPlanRedraftMutation ="
    );
    expect(approveMutation).toContain(
      "trpc.marketplaceCapture.approveAutoReviewPlanReview.useMutation("
    );
    expect(approveMutation).toContain("await autoReviewRuns.refetch();");
    expect(approveMutation).toContain("toast.error(error.message)");

    const redraftMutation = sourceBetween(
      "const requestAutoReviewPlanRedraftMutation =",
      "const item = (productItem ?? {})"
    );
    expect(redraftMutation).toContain(
      "trpc.marketplaceCapture.requestAutoReviewPlanRedraft.useMutation("
    );
    expect(redraftMutation).toContain("await autoReviewRuns.refetch();");
    expect(redraftMutation).toContain("toast.error(error.message)");
    // Redraft returns the same full run shape as getAutoReviewRun — seed
    // that query's cache directly instead of forcing an extra round trip.
    expect(redraftMutation).toContain(
      "utils.marketplaceCapture.getAutoReviewRun.setData("
    );
  });

  it("mounts the panel with runId-bound callbacks and reuses the EXISTING cancelAutoReviewMutation instance — never a second cancel flow", () => {
    const mount = sourceBetween(
      "<AutoReviewPlanReviewPanel",
      "{isStartingAutoReviewRun && !statusAutoReviewRun ? ("
    );
    expect(mount).toContain("planReview={statusAutoReviewRunPlanReview}");
    expect(mount).toContain("plan={planReviewPlanData}");
    expect(mount).toContain(
      "onApprove={() =>\n                      approveAutoReviewPlanReviewMutation.mutate({"
    );
    expect(mount).toContain(
      "onRequestRedraft={notes =>\n                      requestAutoReviewPlanRedraftMutation.mutate({"
    );
    expect(mount).toContain("cancelAutoReviewMutation.mutate({");
    expect(mount).toContain("cancelling={cancelAutoReviewMutation.isPending}");

    // Exactly one cancelAutoReviewRun mutation instance on the whole page —
    // the panel must bind to it, not declare its own.
    const cancelMutationDeclarations = (
      source.match(
        /trpc\.marketplaceCapture\.cancelAutoReviewRun\.useMutation\(/g
      ) ?? []
    ).length;
    expect(cancelMutationDeclarations).toBe(1);
  });

  it("renders the panel only when isStatusAutoReviewRunAwaitingPlanReview is true, next to (not inside) the generic timeline/stage renderer", () => {
    const mountGuard = sourceBetween(
      "{isStatusAutoReviewRunAwaitingPlanReview ? (",
      "{isStartingAutoReviewRun && !statusAutoReviewRun ? ("
    );
    expect(mountGuard).toContain("<AutoReviewPlanReviewPanel");
    // Mounted as a sibling of the run-summary card and the per-run timeline
    // list, not nested inside the generic per-stage `<ol>` renderer.
    expect(
      source.indexOf("{isStatusAutoReviewRunAwaitingPlanReview ? (")
    ).toBeLessThan(source.indexOf("{visibleAutoReviewRunItems.map(run => {"));
  });
});
