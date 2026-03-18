Now I have all the context needed. Let me produce the section content.

# Section 2: Skill Catalog Service

## Overview

This section adds two new capabilities to the existing skill registry (`apps/web/server/services/skillRegistry.ts`):

1. **`getSkillCatalogSummary()`** -- generates a compact, category-grouped representation of all registered skills, designed to fit within a single LLM classifier context window.
2. **`loadInputSchema()`** -- loads and parses a skill's `schemas/input.schema.json` file at runtime, returning pre-processed metadata for the parameter extractor.

Both functions use module-level caching that is invalidated when `clearSkillRegistryCache()` is called.

**Depends on:** Section 01 (shared types -- specifically the `SkillCatalogEntry` interface defined in `apps/web/shared/orchestration/types.ts`).

**Blocks:** Sections 03 (Intent Classifier) and 04 (Parameter Extractor) both consume the catalog and schema loader.

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `apps/web/shared/orchestration/types.ts` | Reference only -- `SkillCatalogEntry` interface must exist (from Section 01) |
| `apps/web/server/services/skillRegistry.ts` | **Modify** -- add `getSkillCatalogSummary()` export, update `clearSkillRegistryCache()` to also clear the catalog cache |
| `apps/web/server/services/skillSchemaLoader.ts` | **Create** -- new file for `loadInputSchema()` |
| `apps/web/server/services/__tests__/skillCatalog.test.ts` | **Create** -- test file |

---

## Tests (Write First)

All tests go in `apps/web/server/services/__tests__/skillCatalog.test.ts`. Use Vitest with `vi.mock()` for dependencies.

### Test file structure and cases

```typescript
// apps/web/server/services/__tests__/skillCatalog.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getSkillRegistryAsync before importing the module under test
vi.mock("../skillRegistry", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../skillRegistry")>();
  return { ...orig };
});
```

### `getSkillCatalogSummary()` tests

1. **Returns array of SkillCatalogEntry objects with required fields** -- call `getSkillCatalogSummary()` with a mocked registry containing 3 skills. Assert each entry has `id`, `name`, `category`, `description`, `inputTypes`, `outputTypes`, `hasInputSchema`, and `requiredFields`.

2. **Groups skills by category correctly** -- mock registry with 2 product_review skills and 1 image_generation skill. Call the function. Assert the returned entries have category values matching their source skill categories, and that both product_review skills appear in the results.

3. **Truncates description to 100 chars** -- mock a skill with a 200-character description. Assert the returned entry's `description` is at most 100 characters and ends with "..." if truncated.

4. **Populates outputTypes based on skill category when no orchestration metadata** -- mock an `image_generation` category skill. Assert `outputTypes` includes `"image_url"`. Mock an `article_generation` category skill. Assert `outputTypes` includes `"text"`.

5. **Populates inputTypes from input.schema.json properties when available** -- mock a skill whose input.schema.json has a property with `format: "uri"`. Assert `inputTypes` includes `"image_url"`.

6. **Returns cached result on second call** -- call twice. Assert the same array reference is returned (strict equality `===`).

7. **Returns fresh data after clearSkillRegistryCache()** -- call once, then call `clearSkillRegistryCache()`, then call again. Assert the two results are different references.

8. **Handles empty skill registry gracefully** -- mock registry returning empty array. Assert result is an empty array, no errors thrown.

### `loadInputSchema()` tests

1. **Loads and parses valid input.schema.json from skill folder** -- mock `fs.readFileSync` to return valid JSON schema content for a skill with a known `skillFilePath`. Assert the returned object contains `schema`, `requiredFields`, `fieldsWithDefaults`, and `enumFields`.

2. **Returns null when schema file doesn't exist** -- mock `fs.existsSync` returning false for the schema path. Assert return value is `null`.

3. **Extracts requiredFields from schema "required" array** -- provide a schema with `"required": ["topic", "language"]`. Assert `requiredFields` equals `["topic", "language"]`.

4. **Identifies fieldsWithDefaults from properties with "default" key** -- provide a schema where `language` has `"default": "th"`. Assert `fieldsWithDefaults` includes `"language"`.

5. **Identifies enumFields from properties with "enum" key** -- provide a schema where `product_category` has an `"enum"` array. Assert `enumFields` includes `"product_category"`.

6. **Caches loaded schema (second call returns same object reference)** -- call twice with same skillId. Assert strict reference equality.

7. **Handles malformed JSON gracefully (returns null, logs warning)** -- mock `fs.readFileSync` returning `"{ broken json"`. Assert return value is `null`. Assert `console.warn` was called.

---

## Implementation Details

### SkillCatalogEntry interface (from Section 01)

This interface is defined in `apps/web/shared/orchestration/types.ts`. It has these fields:

```typescript
interface SkillCatalogEntry {
  id: string;           // skill slug
  name: string;
  category: string;     // e.g., "product_review", "article_generation"
  description: string;  // max 100 chars
  inputTypes: string[]; // inferred from schema or category
  outputTypes: string[];// "text", "image_url", "video_url", "structured_json"
  hasInputSchema: boolean;
  requiredFields: string[];
}
```

### getSkillCatalogSummary()

Add this as an exported async function in `apps/web/server/services/skillRegistry.ts`.

**Signature:**

```typescript
export async function getSkillCatalogSummary(
  userId: number,
  tenantId: string,
): Promise<SkillCatalogEntry[]>
```

> **AUTHORIZATION REQUIRED:** `getSkillCatalogSummary()` MUST accept `userId` and `tenantId` parameters and filter the skill list through the `userSkillVisibility` table. A skill must only appear in the catalog if the user is authorized to access it. This prevents the intent classifier from routing a request to a skill the user cannot execute — which would surface an authorization error mid-orchestration instead of at classification time. The function must NOT return skills that are globally enabled but restricted for the given user.

**Authorization filter algorithm:**
1. Load the set of skill IDs explicitly restricted for this user: `SELECT skillId FROM user_skill_visibility WHERE userId = ? AND tenantId = ? AND visible = false`.
2. Also load the set of skill IDs explicitly granted (in case the tenant uses an allow-list model): `SELECT skillId FROM user_skill_visibility WHERE userId = ? AND tenantId = ? AND visible = true`.
3. Apply the tenant's visibility model: if the tenant uses deny-list (default), exclude skills in step 1. If allow-list, include only skills in step 2.
4. Pass the filtered list into the catalog-building algorithm.

**Caching:** Use a module-level variable `_skillCatalogCache: Map<string, SkillCatalogEntry[]>` keyed by `"${userId}:${tenantId}"`. When `clearSkillRegistryCache()` is called (already exists at line 687), also clear this map entirely. Per-user/per-tenant cache entries expire after the same TTL as the skill registry (60 seconds).

**Algorithm:**

1. If `_skillCatalogCache` has a valid entry for `"${userId}:${tenantId}"`, return it immediately.
2. Call `getSkillRegistryAsync()` to get all enabled skills.
3. Apply the user authorization filter (see above) to get the permitted skill list.
4. For each permitted `SkillDefinition` in the registry:
   - `id`: use `skill.id` (the slug)
   - `name`: use `skill.name`
   - `category`: use `skill.category` (fallback to deriving from `skill.type` if missing)
   - `description`: truncate `skill.description` to 100 chars (append "..." if truncated)
   - `hasInputSchema`: check if `schemas/input.schema.json` exists under the skill folder (derive folder from `skill.skillFilePath` by stripping the manifest filename)
   - `requiredFields`: if schema exists, read its `"required"` array; otherwise empty
   - `outputTypes`: infer from category (see mapping below)
   - `inputTypes`: if schema exists, scan property definitions for `format: "uri"` fields to detect image/url inputs; otherwise infer from category
4. Store result in `_skillCatalogCache` and return.

**Category-to-outputTypes mapping:**

| Category pattern | outputTypes |
|-----------------|-------------|
| `image_generation`, `image_prompt_generation` | `["image_url"]` |
| `video_generation`, `video_prompt_generation` | `["video_url"]` |
| `audio_generation` | `["audio_url"]` |
| `product_review`, `article_generation`, `prompt_enhancement`, `chat_assistant` | `["text"]` |
| Others | `["text"]` (default) |

**Category grouping** (for the classifier to use later):

The category groups MUST be derived dynamically from each skill's `category` field in the database rather than using a hardcoded slug list. This ensures that new skills added to the system are automatically grouped without requiring code changes.

```typescript
/**
 * Maps a skill's DB `category` value to one of the 8 canonical group names.
 * Any unrecognised category falls back to "specialist".
 */
function mapCategoryToGroup(category: string): string {
  if (category.startsWith("image_")) return "media_image";
  if (category.startsWith("video_")) return "media_video";
  if (category.startsWith("audio_")) return "media_audio";
  if (category === "article_generation" || category === "blog_writing") return "article_writing";
  if (category === "product_review" || category.endsWith("_review")) return "product_review";
  if (category === "prompt_enhancement" || category === "image_prompt_generation") return "media_prompts";
  if (
    category === "chat_assistant" ||
    category === "translation" ||
    category === "brainstorm" ||
    category === "storyboard"
  ) return "content_tools";
  return "specialist";
}

/**
 * Builds SKILL_CATEGORY_GROUPS dynamically from the permitted skills list.
 * Exported for the intent classifier (Section 03) to use when building
 * hierarchical tool definitions.
 *
 * Never hardcode skill slugs in this mapping — derive from category field only.
 */
export function buildSkillCategoryGroups(
  skills: SkillCatalogEntry[],
): Record<string, string[]> {
  return skills.reduce<Record<string, string[]>>((acc, skill) => {
    const group = mapCategoryToGroup(skill.category);
    if (!acc[group]) acc[group] = [];
    acc[group].push(skill.id);
    return acc;
  }, {});
}
```

The 8 canonical group names are: `media_image`, `media_video`, `media_audio`, `article_writing`, `product_review`, `content_tools`, `media_prompts`, `specialist`. Skills not matching any pattern fall into `specialist`. This mapping is applied after the user authorization filter so that the groups reflect only the skills the requesting user can access.

### loadInputSchema()

Create a new file `apps/web/server/services/skillSchemaLoader.ts`.

**Signature:**

```typescript
export async function loadInputSchema(skillId: string): Promise<SkillInputSchemaInfo | null>
```

**Return type:**

```typescript
interface SkillInputSchemaInfo {
  schema: Record<string, any>;       // raw JSON Schema object
  requiredFields: string[];          // from schema.required
  fieldsWithDefaults: string[];      // property names that have "default" key
  enumFields: string[];              // property names that have "enum" key
}
```

**Algorithm:**

1. Check module-level cache `_schemaCache: Map<string, SkillInputSchemaInfo | null>`. If the skillId is present (even if null), return the cached value.
2. Look up the skill via `getSkillByIdAsync(skillId)` to get its `skillFilePath`.
3. If no `skillFilePath`, cache `null` and return `null`.
4. Derive the skill folder by stripping the manifest filename from `skillFilePath` (e.g., strip `/skill.md` or `/SKILL.md`).
5. Build the schema path: `path.join(skillFolder, "schemas", "input.schema.json")`.
6. **PATH TRAVERSAL GUARD:** Resolve the schema path to an absolute path using `path.resolve()` and assert that it starts with the known skills root directory (e.g., `path.resolve(SKILLS_ROOT_DIR)`). If the resolved path does not start with the skills root, log a security warning, cache `null`, and return `null`. This prevents a malformed `skillFilePath` in the database from escaping the skills directory via `../` sequences.

   ```typescript
   const resolvedSchema = path.resolve(schemaPath);
   const resolvedSkillsRoot = path.resolve(SKILLS_ROOT_DIR);
   if (!resolvedSchema.startsWith(resolvedSkillsRoot + path.sep)) {
     logger.warn("loadInputSchema: path traversal attempt blocked", {
       skillId,
       resolvedSchema,
       resolvedSkillsRoot,
     });
     _schemaCache.set(skillId, null);
     return null;
   }
   ```

7. If the file does not exist (`fs.existsSync`), cache `null` and return `null`.
8. Read and parse the JSON. If parsing fails, log a warning via `console.warn`, cache `null`, and return `null`.
9. Extract metadata:
   - `requiredFields`: `schema.required ?? []`
   - `fieldsWithDefaults`: iterate `schema.properties`, collect names where property has a `"default"` key
   - `enumFields`: iterate `schema.properties`, collect names where property has an `"enum"` key
10. Store in `_schemaCache` and return.

**Cache invalidation:** Export a `clearSchemaCache()` function. Call it from `clearSkillRegistryCache()` in `skillRegistry.ts` (import and invoke).

### Modifications to clearSkillRegistryCache()

In `apps/web/server/services/skillRegistry.ts`, the existing `clearSkillRegistryCache()` function (currently at line 687) must be updated to also clear:

1. `_skillCatalogCache.clear()` (the new per-user/per-tenant catalog cache Map)
2. Call `clearSchemaCache()` from `skillSchemaLoader.ts`

This ensures that when skills are updated (via admin panel, auto-sync, etc.), the catalog and schema caches are refreshed on next access.

---

## Key Design Decisions

- **Schema loading is lazy and per-skill.** The catalog summary checks whether a schema exists (using `fs.existsSync`) but does not parse the full schema. Full schema parsing happens only when `loadInputSchema()` is called by the parameter extractor for a specific skill.
- **The catalog is compact by design.** Descriptions are capped at 100 characters. At ~60 tokens per skill and ~48 skills, the full catalog uses approximately 2,900 tokens -- well within even the cheapest LLM context limits.
- **Category groups are derived dynamically.** `buildSkillCategoryGroups()` derives group membership from each skill's `category` DB field using `mapCategoryToGroup()`. New skills are automatically grouped when they are added to the database. No code change is required to add a new skill to its group — only the `category` field on the skill record matters.

---

## Verification Checklist

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/__tests__/skillCatalog.test.ts` -- all 15 tests pass.
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- no new TypeScript errors from the added exports.
3. Manually verify that `clearSkillRegistryCache()` resets both the catalog cache and the schema cache by inspecting the function body.
4. Confirm `getSkillCatalogSummary()` is exported from `skillRegistry.ts` and importable by other modules.
5. Confirm `loadInputSchema()` is exported from `skillSchemaLoader.ts` and importable by other modules.