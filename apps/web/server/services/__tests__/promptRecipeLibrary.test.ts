import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";

import recipeSchema from "../../../shared/videoIntelligence/promptRecipe.schema.json";
import {
  discoverOpusVideoMetadata,
  importOpusVideoRecipes,
  retrievePromptRecipes,
  routePromptToMotion,
  type OpusVideoSource,
} from "../promptRecipeLibrary";

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/opusVideos.fixture.json"), "utf8")) as unknown[];
const rightsApproval = vi.fn(async (_source: OpusVideoSource) => ({ status: "approved" as const, evidenceRef: "rights-ticket:approved-123" }));
const importOptions = { sourceRevision: "a".repeat(40), rightsCheck: rightsApproval, tenantId: "tenant-1", ownerUserId: "user-1" };
const rightsAuthority = vi.fn(async () => ({ status: "approved" as const, evidenceRef: "rights-mock:check-1", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }));

describe("Prompt Recipe Library", () => {
  it("imports only complete, attributed prompts after an explicit rights approval", async () => {
    const result = await importOpusVideoRecipes(fixture, importOptions);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({
      recipeId: "opus55.fixture-product-launch-123456",
      version: 1,
      reuseScope: "user_private",
      tenantId: "tenant-1",
      ownerUserId: "user-1",
      source: { rightsStatus: "approved", rightsEvidenceRef: "rights-ticket:approved-123", author: "Motion Maker" },
    });
    expect(result.rejected).toEqual([{ sourceSlug: "fixture-partial-prompt-123457", reason: "partial_prompt" }]);
    expect(rightsApproval).toHaveBeenCalledTimes(1);
  });

  it("fails closed when rights are unverified and does not copy source prompt text", async () => {
    const result = await importOpusVideoRecipes(fixture.slice(0, 1), {
      ...importOptions,
      rightsCheck: async () => ({ status: "unverified" }),
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("rights_not_approved");
  });

  it("deduplicates source URL plus content digest and versions changed prompts", async () => {
    const [recipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const duplicate = await importOpusVideoRecipes(fixture.slice(0, 1), { ...importOptions, existing: [recipe] });
    expect(duplicate.duplicates).toEqual(["fixture-product-launch-123456"]);
    const changed = [{ ...(fixture[0] as object), prompt: "Create a new hero launch treatment." }];
    const updated = await importOpusVideoRecipes(changed, { ...importOptions, existing: [recipe] });
    expect(updated.accepted[0]?.version).toBe(2);
  });

  it("rejects malformed source records and missing owner scope", async () => {
    expect((await importOpusVideoRecipes([null], importOptions)).rejected[0]?.reason).toBe("invalid_source");
    expect((await importOpusVideoRecipes([{ ...(fixture[0] as object), author_url: "http://unsafe.test/creator" }], importOptions)).rejected[0]?.reason).toBe("missing_attribution");
    await expect(importOpusVideoRecipes(fixture.slice(0, 1), { sourceRevision: "main", rightsCheck: rightsApproval })).rejects.toThrow("immutable Git commit SHA");
    expect((await importOpusVideoRecipes(fixture.slice(0, 1), { sourceRevision: "a".repeat(40), rightsCheck: rightsApproval })).rejected[0]?.reason).toBe("missing_scope");
  });

  it("validates imported recipes against the published JSON Schema", async () => {
    const [recipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(recipeSchema);
    expect(validate(recipe)).toBe(true);
    expect(validate({ ...recipe, executableCode: "globalThis.pwned = true" })).toBe(false);
    expect(validate({ ...recipe, reuseScope: "marketplace", tenantId: undefined, ownerUserId: undefined })).toBe(false);
    expect(validate({ ...recipe, compatibility: { aspectRatioStatus: "unverified", supportedAspectRatios: ["9:16"], durationStatus: "unverified" } })).toBe(false);
    expect(validate({ ...recipe, compatibility: { aspectRatioStatus: "verified", supportedAspectRatios: ["9:16"], durationStatus: "verified", durationMs: { min: 1000, max: 20000 } } })).toBe(true);
  });

  it("retrieves recipes with bilingual intent matching and isolates tenant/private reuse", async () => {
    const [privateRecipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const query = { text: "product launch hero", aspectRatio: "9:16" as const, durationMs: 15000, tenantId: "tenant-1", ownerUserId: "user-1" };
    expect((await retrievePromptRecipes([privateRecipe], { ...query, rightsAuthority }))[0]?.recipe.recipeId).toBe(privateRecipe.recipeId);
    expect((await retrievePromptRecipes([privateRecipe], { ...query, text: "เปิดตัวสินค้า", rightsAuthority }))[0]?.recipe.recipeId).toBe(privateRecipe.recipeId);
    expect(await retrievePromptRecipes([privateRecipe], { ...query, tenantId: "tenant-2", rightsAuthority })).toEqual([]);
  });

  it("never asserts imported format compatibility without verified evidence", async () => {
    const [recipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    expect(recipe.compatibility).toEqual({ aspectRatioStatus: "unverified", durationStatus: "unverified" });
    expect(recipe).not.toHaveProperty("supportedAspectRatios");
    expect(recipe).not.toHaveProperty("durationMs");
  });

  it("fuses scoped vector candidates with deterministic local fallback and ranks relevant candidates first", async () => {
    const recipes = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const [recipe] = recipes;
    const lessRelevant = { ...recipe, recipeId: "opus55.fixture-logo-mark-123456", title: "Brand mark sequence", intentTags: ["logo", "brand"], styleTags: ["minimal"] };
    const candidates = [...recipes, lessRelevant];
    const sameTenantVector = { recipeId: recipe.recipeId, score: 0.8, tenantId: "tenant-1" };
    const competingVector = { recipeId: lessRelevant.recipeId, score: 0.9, tenantId: "tenant-1" };
    const foreignVector = { recipeId: "foreign-recipe", score: 1, tenantId: "tenant-2" };
    const result = await retrievePromptRecipes(candidates, { text: "brand logo", aspectRatio: "9:16", durationMs: 15000, tenantId: "tenant-1", ownerUserId: "user-1", rightsAuthority, vectorCandidates: [foreignVector, competingVector, sameTenantVector] });
    expect(result.map(item => item.recipe.recipeId)).toEqual([lessRelevant.recipeId, recipe.recipeId]);
    expect((await retrievePromptRecipes(candidates, { text: "product launch hero", aspectRatio: "9:16", durationMs: 15000, tenantId: "tenant-1", ownerUserId: "user-1", rightsAuthority })).map(item => item.recipe.recipeId)[0]).toBe(recipe.recipeId);
  });

  it.each([
    { status: "denied" as const },
    { status: "unverified" as const },
    { status: "revoked" as const },
    { status: "approved" as const, evidenceRef: "expired", expiresAt: "2000-01-01T00:00:00.000Z" },
    { status: "approved" as const, evidenceRef: "stale", checkedAt: "2000-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },
  ])("fails closed on current rights state %j", async decision => {
    const [recipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const results = await retrievePromptRecipes([recipe], { text: "product launch", aspectRatio: "9:16", durationMs: 15000, tenantId: "tenant-1", ownerUserId: "user-1", rightsAuthority: async () => decision });
    expect(results).toEqual([]);
  });

  it("fails closed when the Rights Authority is missing or unavailable", async () => {
    const [recipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const query = { text: "product launch", aspectRatio: "9:16" as const, durationMs: 15000, tenantId: "tenant-1", ownerUserId: "user-1" };
    expect(await retrievePromptRecipes([recipe], query)).toEqual([]);
    expect(await retrievePromptRecipes([recipe], { ...query, rightsAuthority: async () => { throw new Error("authority unavailable"); } })).toEqual([]);
  });

  it("supports metadata-only bilingual discovery without returning prompt content", () => {
    const results = discoverOpusVideoMetadata(fixture, "เปิดตัวสินค้า", 5);
    expect(results[0]?.sourceSlug).toBe("fixture-product-launch-123456");
    expect(results[0]).toHaveProperty("authorUrl");
    expect(results[0]).not.toHaveProperty("prompt");
    expect(results[0]).not.toHaveProperty("promptTemplate");
  });

  it("routes to a compatible existing template before using a prompt recipe", async () => {
    const route = routePromptToMotion({ text: "product hero", categories: ["product"], aspectRatio: "9:16", durationMs: 10000 });
    expect(await route).toMatchObject({ route: "template", template: { id: "product_hero" } });
  });

  it("plans candidate generation only when no compatible template exists; does not execute code", async () => {
    const route = routePromptToMotion({ text: "novel particle art", categories: ["unknown"], aspectRatio: "9:16", durationMs: 10000 });
    const result = await route;
    expect(result.route).toBe("generate_candidate");
    expect(result.reason).toBe("no_compatible_template");
    expect(result).not.toHaveProperty("componentSource");
    expect(result).not.toHaveProperty("executableCode");
  });

  it("routes explicit novelty to a candidate without mutating project or registry state", async () => {
    const result = routePromptToMotion({ text: "new treatment", categories: ["product"], aspectRatio: "9:16", durationMs: 10000, userRequestedNovelty: true });
    expect(await result).toMatchObject({ route: "generate_candidate", reason: "user_requested_novelty" });
    expect(await result).not.toHaveProperty("template.build");
  });
});
