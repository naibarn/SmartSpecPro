# Section 08: builtin-skill-discovery Stub

## Overview

This section creates the `POST /api/internal/tools/skill-discovery` endpoint — a simplified version of the skill discovery tool that the Auto Draft Agent uses to query available skills. The full `builtin-skill-discovery` defined in Spec 034 is not yet implemented; this stub provides a backward-compatible API shape so the agent can function while the richer implementation is deferred.

**File to create:** `apps/web/server/routers/skillDiscoveryTool.ts`
**Test file to create:** `apps/web/server/routers/skillDiscoveryTool.test.ts`

**Dependencies:** Section 01 (shared infrastructure, feature flag middleware, `contentAutomationGate` middleware) must be complete before this section.

**Blocks:** Section 07 (Auto Draft Agent template requires this endpoint to be registered) and Section 11 (integration tests).

---

## Tests First

File: `apps/web/server/routers/skillDiscoveryTool.test.ts`

Write these tests before implementing the handler. Use `vi.mock` to isolate the skill registry.

```
# Test: returns matching skills for category filter
# Test: returns skills ranked by keyword overlap with description
# Test: returns max 5 results
# Test: returns confidence scores for each match
# Test: handles empty query gracefully (no description, no category)
# Test: handles no matching skills gracefully (empty array, not 404)
# Test: filters by tenant visibility
# Test: API shape matches expected Spec 034 contract
```

The test file should mock `getAvailableSkillsAsync` from `../../services/skillRegistry` and inject controlled skill data. Each test asserts on the JSON response shape: `{ skills: Array<{ id, name, type, description, confidence }>, total }`.

The "API shape matches expected Spec 034 contract" test is important — it verifies the response structure will not need breaking changes when Spec 034's full implementation replaces this stub. The expected contract shape is:

```typescript
// Response contract (must stay stable for Spec 034 compatibility)
interface SkillDiscoveryResponse {
  skills: Array<{
    id: string;
    name: string;
    type: string;            // SkillType enum value
    description: string;
    tags: string[];
    confidence: number;      // 0.0–1.0 float
  }>;
  total: number;
  query_echo: {
    category?: string;
    description?: string;
  };
}
```

---

## Background Context

### Skill Registry

The skill registry (`apps/web/server/services/skillRegistry.ts`) manages all skills loaded from the database. Key functions available for this section:

- `getAvailableSkillsAsync(): Promise<SkillDefinition[]>` — returns all enabled skills sorted by priority
- `getSkillsByType(type: SkillType): SkillDefinition[]` — synchronous filter by skill type

A `SkillDefinition` object has at minimum: `id` (string slug), `name`, `type` (SkillType), `description`, `tags` (string[]), `priority` (number), `enabledByDefault` (boolean).

Import from `../services/skillRegistry`.

### Authentication Pattern for Internal Endpoints

This endpoint is called by the Python agency backend, authenticated via the `SMARTSPEC_WEB_GATEWAY_TOKEN` environment variable passed as the `X-Internal-Token` header. See `apps/web/server/routes/browserTool.ts` lines 99–105 for the exact verification pattern using `crypto.timingSafeEqual`.

The token comparison function to reuse:

```typescript
function verifyInternalToken(req: Request): boolean {
  const expected = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
```

### Feature Flag Gate

The `contentAutomationGate` middleware from Section 01 (`apps/web/server/middleware/contentAutomationGate.ts`) must wrap this route handler. When `ENABLE_CONTENT_AUTOMATION` is not `"true"`, the middleware returns HTTP 503 before the handler runs.

### Express Router Registration

This is an Express route (not a tRPC procedure) registered at `POST /api/internal/tools/skill-discovery`. It follows the same `Router` pattern as `browserTool.ts`. The router export is imported and mounted in `apps/web/server/routers/presentation.ts` (or the equivalent internal-tools route aggregator, consistent with the pattern established in Section 01).

---

## Implementation

### File: `apps/web/server/routers/skillDiscoveryTool.ts`

```typescript
/**
 * builtin-skill-discovery Stub — Spec 035 Section 08
 *
 * POST /api/internal/tools/skill-discovery
 *
 * Simplified skill discovery for the Auto Draft Agent.
 * Returns skills ranked by keyword overlap between the query description
 * and skill name/description/tags. Full vector-search implementation
 * is deferred to Spec 034.
 *
 * Authentication: X-Internal-Token header (SMARTSPEC_WEB_GATEWAY_TOKEN)
 * Feature flag: ENABLE_CONTENT_AUTOMATION
 */

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { getAvailableSkillsAsync } from "../services/skillRegistry";
import type { SkillDefinition } from "../services/skillRegistry";

export const skillDiscoveryRouter = Router();

// ── Request schema ─────────────────────────────────────────────────────────

const SkillDiscoveryRequestSchema = z.object({
  /** Optional category/type filter, e.g. "prompt_enhancement", "image_generation" */
  category: z.string().optional(),
  /** Natural language description used for keyword overlap scoring */
  description: z.string().max(500).optional(),
  /** Maximum number of results to return (capped at 5) */
  limit: z.number().int().min(1).max(5).default(5),
});

// ── Internal token verification ────────────────────────────────────────────

function verifyInternalToken(req: Request): boolean {
  /** Verify X-Internal-Token against SMARTSPEC_WEB_GATEWAY_TOKEN */
}

// ── Keyword overlap scorer ─────────────────────────────────────────────────

function computeConfidence(skill: SkillDefinition, description: string): number {
  /**
   * Compute 0.0–1.0 keyword overlap score.
   * Tokenize description into lowercase words, count how many appear in
   * skill.name + skill.description + skill.tags (joined, lowercased).
   * Returns matchCount / totalQueryWords, clamped to [0, 1].
   * Returns 0.5 base score when description is empty (all skills equally likely).
   */
}

// ── Main handler ───────────────────────────────────────────────────────────

skillDiscoveryRouter.post(
  "/api/internal/tools/skill-discovery",
  async (req: Request, res: Response) => {
    /**
     * 1. Verify X-Internal-Token
     * 2. Parse + validate request body
     * 3. Load all skills via getAvailableSkillsAsync()
     * 4. Filter by category if provided (match against skill.type)
     * 5. Score each skill by keyword overlap with description
     * 6. Sort descending by confidence, take top limit (max 5)
     * 7. Return SkillDiscoveryResponse
     */
  }
);

export default skillDiscoveryRouter;
```

### Scoring Algorithm Details

The `computeConfidence` function uses a simple bag-of-words overlap approach (no ML required):

1. Tokenize `description` by splitting on `/\s+/` and stripping punctuation. Lowercase all tokens.
2. Build a search corpus for each skill: concatenate `skill.name + " " + skill.description + " " + skill.tags.join(" ")`, lowercase.
3. Count how many query tokens appear in the corpus string.
4. `confidence = matchCount / max(queryTokens.length, 1)`, clamped to `[0.0, 1.0]`.
5. When `description` is undefined or empty string, assign `confidence = 0.5` to all skills (no preference).

Skills with zero overlap are still returned (confidence `0.0`) unless there are 5 or more skills with positive scores — in that case zero-confidence skills are excluded.

### Category Filter Mapping

The `category` request field maps to `skill.type`. The mapping is a direct string equality check: `skill.type === requestedCategory`. The agent passes values like `"prompt_enhancement"`, `"image_generation"`, `"video_generation"`, `"audio_generation"`, `"chat_assistant"` — all of which are valid `SkillType` enum values. Unknown category values produce an empty result set (not an error).

### Response Shape

```typescript
// Stable contract — must not change when Spec 034 replaces this stub
{
  skills: [
    {
      id: string,           // skill slug, e.g. "general-article-writer"
      name: string,         // human-readable name
      type: string,         // SkillType value
      description: string,
      tags: string[],
      confidence: number,   // 0.0–1.0
    }
  ],
  total: number,            // total skills before limit applied (after category filter)
  query_echo: {
    category?: string,
    description?: string,
  }
}
```

### Error Handling

| Condition | HTTP status | Response body |
|-----------|-------------|---------------|
| Missing/invalid X-Internal-Token | 401 | `{ error: "UNAUTHORIZED" }` |
| Invalid request body (Zod parse error) | 400 | `{ error: "VALIDATION_ERROR", details: [...] }` |
| Feature flag disabled | 503 | (handled by `contentAutomationGate` middleware before handler runs) |
| Skill registry error | 500 | `{ error: "SKILL_REGISTRY_ERROR", message: "..." }` (sanitize — no stack traces) |

Wrap the handler body in a try/catch. Log errors with the structured logger (`auditLogger` or standard `console.error` with structured JSON). Do not expose internal error details in the 500 response body.

---

## Route Registration

In `apps/web/server/routers/presentation.ts` (or wherever Section 01 registers internal-tool routes), import and mount the router:

```typescript
import skillDiscoveryRouter from "./skillDiscoveryTool";
// mount after contentAutomationGate middleware
app.use(contentAutomationGate, skillDiscoveryRouter);
```

The exact mounting location follows the pattern established by Section 01. If Section 01 creates a dedicated internal-tools Express sub-app or route aggregator, mount `skillDiscoveryRouter` there. If Section 01 registers routes directly on the main app, follow the same approach.

---

## Python Registration Note

After this endpoint exists, Section 06 registers it in `python-backend/app/services/agency_tools.py`:

```python
"builtin-skill-discovery": "/api/internal/tools/skill-discovery"
# risk level: "low"
```

This section (08) only creates the Node.js handler. Section 06 handles Python-side registration. Do not modify `agency_tools.py` here.

---

## Spec 034 Compatibility Guarantee

The Spec 034 full implementation may add:
- Vector embedding similarity search
- Semantic ranking beyond keyword overlap
- Skill chaining metadata
- More granular confidence breakdowns

This stub's response shape (`skills[].id`, `skills[].name`, `skills[].type`, `skills[].description`, `skills[].tags`, `skills[].confidence`) must remain unchanged when Spec 034 replaces the body. The `query_echo` field is additive and non-breaking. Any Spec 034 additions should be appended to the response, not replace existing fields.

The "API shape matches expected Spec 034 contract" test in `skillDiscoveryTool.test.ts` is the contract enforcement — it must continue passing after Spec 034's implementation replaces this stub.

---

## Checklist

- [ ] Create `apps/web/server/routers/skillDiscoveryTool.ts` with `skillDiscoveryRouter`
- [ ] Create `apps/web/server/routers/skillDiscoveryTool.test.ts` with all 8 test cases passing
- [ ] `verifyInternalToken` uses `crypto.timingSafeEqual` (timing-safe comparison)
- [ ] `computeConfidence` returns `0.5` for empty description (all skills equal)
- [ ] Category filter does not throw on unknown category values (returns empty array)
- [ ] Response always includes `query_echo` field reflecting the input
- [ ] `total` field reflects count after category filter, before `limit` is applied
- [ ] Route is mounted behind `contentAutomationGate` middleware (503 when flag off)
- [ ] Error responses do not expose stack traces or internal paths
- [ ] `pnpm test` passes with no regressions