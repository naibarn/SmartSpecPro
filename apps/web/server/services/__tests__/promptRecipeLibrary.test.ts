import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";

import recipeSchema from "../../../shared/videoIntelligence/promptRecipe.schema.json";
import {
  importOpusVideoRecipes,
  retrievePromptRecipes,
  routePromptToMotion,
  type OpusVideoSource,
} from "../promptRecipeLibrary";

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/opusVideos.fixture.json"), "utf8")) as unknown[];
const rightsApproval = vi.fn(async (_source: OpusVideoSource) => ({ status: "approved" as const, evidenceRef: "rights-ticket:approved-123" }));
const importOptions = { sourceRevision: "a".repeat(40), rightsCheck: rightsApproval, tenantId: "tenant-1", ownerUserId: "user-1" };

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
    expect((await importOpusVideoRecipes(fixture.slice(0, 1), { sourceRevision: "main", rightsCheck: rightsApproval })).rejected[0]?.reason).toBe("missing_scope");
  });

  it("validates imported recipes against the published JSON Schema", async () => {
    const [recipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(recipeSchema);
    expect(validate(recipe)).toBe(true);
    expect(validate({ ...recipe, executableCode: "globalThis.pwned = true" })).toBe(false);
    expect(validate({ ...recipe, reuseScope: "marketplace", tenantId: undefined, ownerUserId: undefined })).toBe(false);
  });

  it("retrieves recipes semantically and isolates tenant/private reuse", async () => {
    const [privateRecipe] = (await importOpusVideoRecipes(fixture.slice(0, 1), importOptions)).accepted;
    const query = { text: "product launch hero", aspectRatio: "9:16" as const, durationMs: 15000, tenantId: "tenant-1", ownerUserId: "user-1" };
    expect(retrievePromptRecipes([privateRecipe], query)[0]?.recipe.recipeId).toBe(privateRecipe.recipeId);
    expect(retrievePromptRecipes([privateRecipe], { ...query, tenantId: "tenant-2" })).toEqual([]);
  });

  it("routes to a compatible existing template before using a prompt recipe", () => {
    const route = routePromptToMotion({ text: "product hero", categories: ["product"], aspectRatio: "9:16", durationMs: 10000 });
    expect(route).toMatchObject({ route: "template", template: { id: "product_hero" } });
  });

  it("plans candidate generation only when no compatible template exists; does not execute code", () => {
    const route = routePromptToMotion({ text: "novel particle art", categories: ["unknown"], aspectRatio: "9:16", durationMs: 10000 });
    expect(route.route).toBe("generate_candidate");
    expect(route.reason).toBe("no_compatible_template");
    expect(route).not.toHaveProperty("componentSource");
    expect(route).not.toHaveProperty("executableCode");
  });

  it("routes explicit novelty to a candidate without mutating project or registry state", () => {
    const result = routePromptToMotion({ text: "new treatment", categories: ["product"], aspectRatio: "9:16", durationMs: 10000, userRequestedNovelty: true });
    expect(result).toMatchObject({ route: "generate_candidate", reason: "user_requested_novelty" });
    expect(result).not.toHaveProperty("template.build");
  });
});
