/**
 * Marketplace Auto Review — creation-time drama casting (planning/
 * marketplace-flexible-shots-and-creation-casting/plan.md, W2). Proves the
 * `characterCast` request field seeds `metadataJson.customReferenceManifest`
 * in exactly the shape `deriveStagedCastFromManifest`
 * (`marketplaceAutoReviewStagedPipelineService.ts`) reads, so W1's LLM-first
 * story init already sees the right cast on the very first plan.
 *
 * `buildSeededStagedCharacterCastManifestForTest` is DB-backed (a single
 * `media_assets` select for `portraitAssetId` resolution) — mocked here with
 * the `{ from: () => ({ where: () => ({ limit: () => Promise... }) }) }`
 * chain shape (precedent: `videoProjectAssetResolver.test.ts`).
 *
 * Also covers the grep-guard wiring proofs (section-13 precedent,
 * `marketplaceAutoReview.section13.test.ts`) for the two forwarding call
 * sites this feature threads through.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildSeededStagedCharacterCastManifestForTest,
} from "../marketplaceAutoReviewService";
import { deriveStagedCastFromManifestForTest } from "../marketplaceAutoReviewStagedPipelineService";

function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function fakeDb(rows: unknown[]) {
  return { select: () => selectChain(rows) } as any;
}

const AUTH = { userId: 7, tenantId: "tenant_1" } as any;
const PRODUCT_IMAGE_URLS = [
  "https://cdn.example.com/product-hero.png",
  "https://cdn.example.com/product-angle-2.png",
];

describe("buildSeededStagedCharacterCastManifest (W2 seeding)", () => {
  it("returns null when there is neither a cast NOR an uploaded anchor", async () => {
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      characterCast: [],
    });
    expect(result).toBeNull();
  });

  /* Reported 2026-08-01: a user picked "อัปโหลด reference", uploaded a
     presenter, and the staged review panel showed "0 ภาพแนบ / พูดคนเดียว".
     The seeder read only `characterCast`, nothing in the staged pipeline reads
     `characterImageUrl`, and an empty manifest makes `handleImageProvider`
     fall back to the hero product image alone — so the uploaded person reached
     neither the panel nor any start frame. */
  it("seeds an UPLOADED character reference even with no drama cast", async () => {
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      characterCast: [],
      uploadedCharacterAnchorUrl: "https://cdn.example.com/uploaded-presenter.png",
    });
    expect(result).not.toBeNull();
    const characters = result!.filter(entry => entry.role === "character");
    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatchObject({
      role: "character",
      characterRole: "host",
      url: "https://cdn.example.com/uploaded-presenter.png",
      active: true,
    });
    // Uploaded, so it carries no VD identity.
    expect(characters[0].vdCharacterId).toBeUndefined();
  });

  it("puts the uploaded anchor FIRST when it is combined with a drama cast", async () => {
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      uploadedCharacterAnchorUrl: "https://cdn.example.com/uploaded-presenter.png",
      characterCast: [
        {
          characterName: "ไอริณ",
          url: "https://cdn.example.com/irin.png",
          vdCharacterId: "char_1",
        },
      ],
    });
    const characters = result!.filter(entry => entry.role === "character");
    expect(characters.map(entry => entry.characterRole)).toEqual([
      "host",
      "guest",
    ]);
    expect(characters[0].url).toBe(
      "https://cdn.example.com/uploaded-presenter.png"
    );
    expect(characters[1]).toMatchObject({ characterName: "ไอริณ" });
  });

  it("never double-counts an anchor that is ALSO in the roster (uploads land there now)", async () => {
    const shared = "https://cdn.example.com/uploaded-presenter.png";
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      uploadedCharacterAnchorUrl: shared,
      characterCast: [{ characterName: "พรีเซนเตอร์", url: shared }],
    });
    const characters = result!.filter(entry => entry.role === "character");
    expect(characters).toHaveLength(1);
    expect(characters[0].url).toBe(shared);
  });

  it("seeds a solo cast (1 entry) with product entries first, primary_product active", async () => {
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      characterCast: [
        {
          characterName: "ไอริณ",
          url: "https://cdn.example.com/irin.png",
          vdCharacterId: "char_1",
          vdSeriesId: "series_1",
          ageRange: "20s",
        },
      ],
    });
    expect(result).not.toBeNull();
    const manifest = result!;
    // 2 product entries + 1 character entry.
    expect(manifest).toHaveLength(3);
    expect(manifest[0]).toMatchObject({
      role: "primary_product",
      active: true,
      index: 1,
    });
    expect(manifest[1]).toMatchObject({
      role: "product_angle",
      active: false,
      index: 2,
    });
    expect(manifest[2]).toMatchObject({
      role: "character",
      active: true,
      index: 3,
      url: "https://cdn.example.com/irin.png",
      characterName: "ไอริณ",
      characterRole: "host",
      vdCharacterId: "char_1",
      vdSeriesId: "series_1",
      ageRange: "20s",
    });

    const cast = deriveStagedCastFromManifestForTest(manifest as any);
    expect(cast).toHaveLength(1);
    // `deriveStagedCastFromManifest` computes `imageIndex` from the ACTIVE
    // non-character entry count (1 — only the hero product image defaults
    // to active), not the manifest's own stored `index` ordinal (3) — this
    // is the "product-count indexing lines up" check the plan calls for.
    expect(cast[0]).toMatchObject({
      name: "ไอริณ",
      role: "host",
      vdCharacterId: "char_1",
      vdSeriesId: "series_1",
      imageIndex: 2,
    });
  });

  it("seeds a two-person cast (host + guest) resolved via portraitAssetId + url", async () => {
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([{ url: "https://cdn.example.com/thanakorn-portrait.png" }]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      characterCast: [
        { characterName: "ไอริณ", url: "https://cdn.example.com/irin.png" },
        {
          characterName: "ธนกร",
          portraitAssetId: "42",
        },
      ],
    });
    expect(result).not.toBeNull();
    const manifest = result!;
    expect(manifest).toHaveLength(4);
    expect(manifest[2]).toMatchObject({
      role: "character",
      characterName: "ไอริณ",
      characterRole: "host",
    });
    expect(manifest[3]).toMatchObject({
      role: "character",
      characterName: "ธนกร",
      characterRole: "guest",
      url: "https://cdn.example.com/thanakorn-portrait.png",
      portraitAssetId: "42",
    });

    const cast = deriveStagedCastFromManifestForTest(manifest as any);
    expect(cast).toHaveLength(2);
    expect(cast.map(c => c.name)).toEqual(["ไอริณ", "ธนกร"]);
    expect(cast.map(c => c.role)).toEqual(["host", "guest"]);
  });

  it("skips a cast entry whose portraitAssetId does not resolve to any row (never fails run creation)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await buildSeededStagedCharacterCastManifestForTest({
      db: fakeDb([]),
      auth: AUTH,
      productImageUrls: PRODUCT_IMAGE_URLS,
      characterCast: [
        { characterName: "ไม่มีตัวตน", portraitAssetId: "999999" },
      ],
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("W2 wiring — characterCast forwarding grep-guards", () => {
  it("marketplaceCapture.ts's startAutoReview input carries characterCast (MarketplaceCharacterCastInputSchema)", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../../routers/marketplaceCapture.ts"),
      "utf8"
    );
    expect(body).toContain("characterCast: MarketplaceCharacterCastInputSchema");
  });

  it("hyperframesRuntimeApiService.ts forwards plan.defaults.characterCast into enqueueMarketplaceAutoReviewRun", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../hyperframesRuntimeApiService.ts"),
      "utf8"
    );
    expect(body).toContain("characterCast: plan.defaults.characterCast,");
  });

  it("autoPlan.ts's defaults + override schemas both carry characterCast (feature136AutoPlanOverrideFieldSchemas)", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../../../shared/hyperframes/autoPlan.ts"),
      "utf8"
    );
    expect(body).toContain("characterCast: MarketplaceCharacterCastInputSchema");
    expect(body).toContain("normalized.characterCast = characterCast.data;");
  });

  it("marketplaceAutoReviewService.ts gates seeding on isStagedArchitecture and merges into buildRunMetadata", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../marketplaceAutoReviewService.ts"),
      "utf8"
    );
    // Seeding is still staged-only, but the trigger widened: an UPLOADED
    // character reference now seeds the manifest too. It used to be dropped
    // entirely — the seeder read only `characterCast`, nothing in the staged
    // pipeline reads `characterImageUrl`, and an empty manifest makes
    // `handleImageProvider` fall back to the hero product image alone, so an
    // uploaded presenter reached neither the review panel nor any start frame
    // (`planning/marketplace-four-character-cast/plan.md`).
    expect(body).toMatch(
      /isStagedArchitecture\s*&&\s*\n\s*\(\(Array\.isArray\(input\.characterCast\)/
    );
    expect(body).toContain("uploadedCharacterAnchorUrl)");
    expect(body).toContain("uploadedCharacterAnchorUrl,");
    expect(body).toContain(
      "? { customReferenceManifest: seededCharacterCastManifest }"
    );
  });
});
