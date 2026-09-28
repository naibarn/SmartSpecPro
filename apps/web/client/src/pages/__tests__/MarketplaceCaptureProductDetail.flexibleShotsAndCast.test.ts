/**
 * Marketplace flexible-shots-and-creation-casting (planning/marketplace-
 * flexible-shots-and-creation-casting/plan.md, W3) — source grep-guard for
 * MPCPD wiring (precedent: `MarketplaceCaptureProductDetail.sequentialUiWiring
 * .test.ts`). MPCPD is 10,000+ lines and must NEVER be mounted in jsdom
 * (binding decision §3.3). Behavior for the reused picker dialog and the
 * advanced-overrides shot-count/duration selects is proven on their own
 * test files; this file only proves the page wires them in correctly.
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

describe("MarketplaceCaptureProductDetail flexible-shots-and-creation-casting wiring (W3)", () => {
  it("declares the cast/shot-count derived state before the product loading guards", () => {
    const productGuardIndexes = [
      source.indexOf("if (product.isLoading) return"),
      source.indexOf("if (!product.data) return"),
    ];
    for (const guardIndex of productGuardIndexes) {
      expect(guardIndex).toBeGreaterThanOrEqual(0);
    }

    const hookMarkers = [
      "const [autoReviewCharacterCast, setAutoReviewCharacterCast] = useState<",
      "const [autoReviewDramaPickerOpen, setAutoReviewDramaPickerOpen] =",
      "const [autoReviewStagedShotCount, setAutoReviewStagedShotCount] = useState<",
      "const autoReviewCharacterCastPayload = useMemo(",
      "const addAutoReviewDramaCharacters = useCallback(",
      "const removeAutoReviewCastMember = useCallback(",
    ];
    for (const marker of hookMarkers) {
      const hookIndex = source.indexOf(marker);
      expect(hookIndex, `${marker} must exist`).toBeGreaterThanOrEqual(0);
      for (const guardIndex of productGuardIndexes) {
        expect(
          hookIndex,
          `${marker} must run before product guards`
        ).toBeLessThan(guardIndex);
      }
    }
  });

  it("imports and mounts the shared MarketplaceDramaCharacterPickerDialog, flag-gated on tenantFeatureFlags.verticalDramaSeries", () => {
    expect(source).toContain(
      'import { MarketplaceDramaCharacterPickerDialog } from "@/components/marketplaceCapture/MarketplaceDramaCharacterPickerDialog";'
    );
    expect(source).toMatch(/<MarketplaceDramaCharacterPickerDialog\b/);

    // The cast block is now ALSO gated on the presenter mode: Hands-only and
    // Product-only tell the model not to render a person, so offering a cast
    // there contradicts the request
    // (`planning/marketplace-four-character-cast/plan.md`).
    expect(source).toContain(
      "tenantFeatureFlags.verticalDramaSeries && autoReviewModeUsesCast ? ("
    );
    const castSection = sourceBetween(
      "{tenantFeatureFlags.verticalDramaSeries && autoReviewModeUsesCast ? (",
      '{autoReviewCharacterMode === "described_character" ? ('
    );
    expect(castSection).toContain("<MarketplaceDramaCharacterPickerDialog");
    expect(castSection).toContain(
      "onConfirm={addAutoReviewDramaCharacters}"
    );
    // Roster widened 2 -> 4 via the shared constant
    // (`planning/marketplace-four-character-cast/plan.md` P1).
    expect(castSection).toContain(
      "MARKETPLACE_CHARACTER_CAST_MAX - autoReviewCharacterCast.length"
    );
    // ...and the picker is told which lead seats are already taken, so a new
    // pick never mints a second host.
    expect(castSection).toContain("existingRoles={autoReviewCharacterCast");
    expect(castSection).toContain("👥 โหมดสนทนา 2 คน");
    expect(castSection).toContain("🎤 พูดคนเดียว");
  });

  it("maps picked ReferenceManifestItems onto MarketplaceCharacterCastEntryInput and threads them into BOTH run-start mutations", () => {
    const payloadFn = sourceBetween(
      "const autoReviewCharacterCastPayload = useMemo(",
      "const addAutoReviewDramaCharacters = useCallback("
    );
    expect(payloadFn).toContain("characterName:");
    expect(payloadFn).toContain("characterRole");
    expect(payloadFn).toContain("vdCharacterId");
    expect(payloadFn).toContain("vdSeriesId");
    expect(payloadFn).toContain("portraitAssetId");

    // Legacy top-level mutation (`startAutoReview`) — `characterCast` is a
    // sibling of `characterPresenceMode`/`motionDirection`, not nested under
    // `referenceAnchors` (the router schema only accepts it top-level).
    const startAutoReviewFn = sourceBetween(
      "const startAutoReview = useCallback(",
      "// Feature 136 (section 11, §6.8)"
    );
    expect(startAutoReviewFn).toContain(
      "characterCast:\n          autoReviewCharacterCastPayload.length > 0\n            ? autoReviewCharacterCastPayload\n            : undefined,"
    );
    expect(startAutoReviewFn).toContain("autoReviewCharacterCastPayload");

    // Hyperframes twin (`startAutoStoryboardReview`) — threaded through
    // `overrides.characterCast` (W2's addition to
    // `HyperframesAutoPlanOverrideInputSchema`), via a merged variable so
    // "Use Auto plan" (`setAutoStoryboardOverrides({})`) never silently
    // drops a cast the user explicitly picked.
    expect(source).toContain(
      "const autoStoryboardOverridesWithCast ="
    );
    const mergedOverridesDecl = sourceBetween(
      "const autoStoryboardOverridesWithCast =",
      "async function startAutoStoryboardReview()"
    );
    expect(mergedOverridesDecl).toContain("characterCast: autoReviewCharacterCastPayload");
    expect(mergedOverridesDecl).not.toContain("autoStoryboardOverrides.characterCast");

    const hyperframesStartFn = sourceBetween(
      "async function startAutoStoryboardReview() {",
      "const startAutoReview = useCallback("
    );
    const overridesWithCastUses = (
      hyperframesStartFn.match(/overrides: autoStoryboardOverridesWithCast,/g) ?? []
    ).length;
    expect(overridesWithCastUses).toBe(2);
    expect(hyperframesStartFn).not.toContain("overrides: autoStoryboardOverrides,");
  });

  it("threads autoReviewStagedShotCount into buildAutoReviewReferenceAnchors as `shotCount`, omitted when untouched", () => {
    const buildAnchorsFn = sourceBetween(
      "const buildAutoReviewReferenceAnchors = useCallback(",
      "async function startAutoStoryboardReview"
    );
    expect(buildAnchorsFn).toContain(
      "...(autoReviewStagedShotCount !== undefined\n          ? { shotCount: autoReviewStagedShotCount }\n          : {}),"
    );
  });

  it("wires stagedShotCount/onStagedShotCountChange into AutoStoryboardAdvancedOverrides and resets it alongside shotDurationSeconds", () => {
    const advancedOverridesMount = sourceBetween(
      "<AutoStoryboardAdvancedOverrides",
      "visionQaModelOptions={autoReviewVisionQaModelOptions}"
    );
    expect(advancedOverridesMount).toContain(
      "stagedShotCount={autoReviewStagedShotCount}"
    );
    expect(advancedOverridesMount).toContain(
      "onStagedShotCountChange={setAutoReviewStagedShotCount}"
    );

    const resetHandlers =
      source.match(
        /setAutoStoryboardOverrides\(\{\}\);\s*setAutoReviewShotDurationSeconds\(undefined\);\s*setAutoReviewStagedShotCount\(undefined\);/g
      ) ?? [];
    expect(resetHandlers.length).toBe(2);
  });
});

/**
 * `planning/marketplace-four-character-cast/plan.md` — presenter mode vs cast.
 *
 * The "Character / Presenter" selector and the Drama Series cast block used to
 * be completely independent, so Product-only ("Do not generate a visible
 * person.") or Hands-only ("do not generate a recurring face.") could ship
 * 2-4 character portraits and a two-person conversation cast in the SAME
 * request. These assertions pin the resolution: the mode wins, the picked cast
 * is kept rather than discarded, and the gate no longer counts a cast the run
 * will not use.
 */
describe("presenter mode vs drama cast", () => {
  /* Locked to ONE mode. A picked character is a reference identity (real
     portrait + name + age + personality), so every other mode contradicts it:
     hands-only/product-only render no person at all, and described_character
     builds its own identity from the เพศ/วัย/ลักษณะ dropdowns — casting a male
     character while the directive says "ผู้หญิง 20-29" makes the reference and
     the directive flatly disagree. */
  it("derives autoReviewModeUsesCast from uploaded_reference ONLY", () => {
    const marker = source.indexOf("const autoReviewModeUsesCast =");
    expect(marker).toBeGreaterThanOrEqual(0);
    const decl = source.slice(marker, marker + 160);
    expect(decl).toContain('autoReviewCharacterMode === "uploaded_reference"');
    expect(decl).not.toContain("described_character");
    expect(decl).not.toContain("hands_only");
    expect(decl).not.toContain("product_only");
  });

  it("sends an EMPTY characterCast payload whenever the mode does not use a cast", () => {
    const marker = source.indexOf("const autoReviewCharacterCastPayload = useMemo(");
    expect(marker).toBeGreaterThanOrEqual(0);
    const decl = source.slice(marker, marker + 260);
    expect(decl).toContain("!autoReviewModeUsesCast");
    expect(decl).toContain("? []");
  });

  it("does not let a cast satisfy the character-reference gate in a person-free mode", () => {
    const marker = source.indexOf("const hasCharacterReference = Boolean(");
    expect(marker).toBeGreaterThanOrEqual(0);
    const decl = source.slice(marker, marker + 420);
    expect(decl).toContain(
      "autoReviewModeUsesCast && autoReviewCharacterCast.length > 0"
    );
  });

  it("keeps the picked cast in state — the panel is hidden, never cleared", () => {
    // A mode switch must not destroy casting work; only `setAutoReviewCharacterCast`
    // from the picker/remove handlers may change it.
    const modeButtonMarker = source.indexOf("setAutoReviewCharacterMode(");
    expect(modeButtonMarker).toBeGreaterThanOrEqual(0);
    const around = source.slice(modeButtonMarker - 400, modeButtonMarker + 400);
    expect(around).not.toContain("setAutoReviewCharacterCast([])");
  });
});

/**
 * Declaration-order guard.
 *
 * MPCPD is 10,000+ lines and is NEVER mounted in jsdom (binding decision
 * §3.3), so a `const` referenced above its own declaration compiles, bundles,
 * and only explodes in the browser as
 * `ReferenceError: Cannot access '<x>' before initialization` — the entire
 * page renders "An unexpected error occurred." That is exactly what shipped on
 * 2026-08-01 when `autoReviewModeUsesCast` was declared next to the cast
 * payload (line ~4870) but first used by `hasCharacterReference` (line ~4620).
 *
 * A full `tsc` would catch this as TS2448, but it OOMs on this repo, so the
 * cheap source-order assertion is the guard that actually runs.
 */
describe("derived-const declaration order (TDZ guard)", () => {
  // Comments routinely forward-reference a symbol ("see `x` below"), which is
  // harmless — blank them out so only real code positions are compared.
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, match => " ".repeat(match.length))
    .replace(/\/\/[^\n]*/g, match => " ".repeat(match.length));

  const declaredBeforeFirstUse = (symbol: string) => {
    const declaration = codeOnly.indexOf(`const ${symbol}`);
    expect(declaration, `${symbol} must be declared`).toBeGreaterThanOrEqual(0);
    const firstUse = codeOnly.search(new RegExp(`\\b${symbol}\\b`));
    expect(
      firstUse,
      `${symbol} is used at ${firstUse} but declared at ${declaration} — TDZ crash at render`
    ).toBeGreaterThanOrEqual(declaration);
  };

  for (const symbol of [
    "autoReviewModeUsesCast",
    "autoReviewCharacterCastPayload",
    "autoReviewStoryPlanningModelOptions",
    "autoReviewCastLookSourcesByCharacterId",
    "updateAutoReviewCastMember",
    "hasCharacterReference",
  ]) {
    it(`declares ${symbol} before its first use`, () => {
      declaredBeforeFirstUse(symbol);
    });
  }
});
