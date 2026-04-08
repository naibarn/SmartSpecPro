Now I have all the information needed. Let me write the section.

# Section 08 — Article Generation Streaming: `POST /api/content-composer/generate-stream`

## Section ID
`section-08-generation-stream`

## Position in Dependency Graph

| Attribute | Value |
|---|---|
| Depends on | section-01-schema (DB schema + types), section-03-trpc-crud (`contentComposerRouter` base + `fetchOwnedDraft` helper) |
| Blocks | section-10-tests |
| Batch | 3 (runs in parallel with section-09-publish) |

---

## Objective

Implement the article generation streaming route and social caption generation procedure:

1. **`POST /api/content-composer/generate-stream`** — an Express SSE route that reads a draft from the database, builds a skill- or agency-driven LLM call, and streams the article body back to the client using the same `text/event-stream` SSE pattern used by the existing LLM gateway routes.
2. **`generateSocialCaption` tRPC mutation** — a non-streaming, one-shot LLM call that produces a platform-appropriate social caption and writes it back to the draft.

Both additions belong to the `contentComposer` infrastructure created in section-03.

---

## Files

| Action | Path |
|--------|------|
| Create | `apps/web/server/routes/contentComposerStream.ts` |
| Modify | `apps/web/server/routers/contentComposer.ts` (add `generateSocialCaption` procedure) |
| Modify | `apps/web/server/_core/index.ts` (register new route) |
| Create | `apps/web/server/routes/__tests__/contentComposerStream.test.ts` |

---

## Background Context

### SSE Pattern in This Codebase

All streaming routes in this project follow the same SSE pattern used in `apps/web/server/_core/llmRoutes.ts` (the `/api/llm/v2/stream` endpoint) and `apps/web/server/routes/agencyStream.ts`. The key elements are:

**Response headers** (written before any data):
```typescript
res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
res.setHeader("Cache-Control", "no-cache, no-transform");
res.setHeader("Connection", "keep-alive");
res.setHeader("X-Accel-Buffering", "no");  // Required: disables Nginx buffering
```

**Event frames** — each chunk is a standard SSE `data:` line:
```
data: {"chunk": "...text..."}\n\n
```

**Error frame** — sent before closing on error:
```
event: error\ndata: {"message":"..."}\n\n
```

**Done sentinel** — signals end of stream (matches `/api/llm/v2/stream` convention):
```
data: [DONE]\n\n
```

**AbortController** — the route creates an `AbortController` and calls `.abort()` on `req.on("close")` to propagate client disconnection into the LLM call.

### Authentication in Express Routes

Route authentication follows `agencyStream.ts`. A helper `authenticateSSE()` calls `sdk.authenticateRequest(req)` and returns `null` (sending `401`) if the user is absent:

```typescript
import { sdk } from "../_core/sdk";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import type { TenantRequest } from "../_core/tenant";

async function authenticateSSE(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return null; }
    return user;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}
```

### LLM Streaming via `handleStreamWithRouter`

The existing `handleStreamWithRouter` function (`apps/web/server/services/llmRoutesHandler.ts`) handles provider selection, fallback routing, credit deduction, and SSE writing. It accepts a `messages` array and a `res` Response object. Import and call it the same way `/api/llm/v2/stream` does:

```typescript
import { handleStreamWithRouter } from "../services/llmRoutesHandler";

await handleStreamWithRouter({
  model: undefined,            // let planner choose
  messages,                    // [{ role: "system", content: systemPrompt }, { role: "user", content: topic }]
  userId: user.id,
  tenantId,
  res,                         // Express Response — handleStreamWithRouter writes SSE to it
  skillUsed: skill?.slug ?? undefined,
});
```

`handleStreamWithRouter` writes all SSE frames (including the `[DONE]` sentinel) and calls `res.end()`. The route handler must NOT write any SSE frames before calling this function; it must NOT call `res.end()` afterward.

The function signature is in `apps/web/server/services/llmRoutesHandler.ts`:
```typescript
interface HandlerParams {
  model?: string;
  messages: Message[];
  userId: number;
  tenantId: string;
  conversationId?: number;
  preferredProvider?: number;
  skillUsed?: string;
  res: Response;
}
```

`Message` is imported from `../server/_core/llm` (the OpenAI-compatible message type with `role` and `content` fields).

### Skill Loading

Use `getSkillByIdAsync(skillId)` from `apps/web/server/services/skillRegistry.ts` to load a skill. The function returns a `SkillDefinition` with a `content` field (the skill's Markdown body used as the system prompt). If the skill is not found or does not belong to the tenant, throw a 400/403 as appropriate.

Skill content is passed as the `system` role message in the `messages` array. The topic is the `user` role message.

### Agency Route

For agency execution (`executionSource === "agency"`), the route must:
1. Verify the `agencyId` belongs to the draft's `tenantId` (use the same ownership check pattern as `agencyStream.ts` — query `agencies WHERE id = agencyId AND tenantId = tenantId`).
2. Forward the generation request to the Python backend agency orchestrator via `POST /api/agency/{agencyId}/run` or the equivalent internal agency invocation endpoint. Implementer: search for how the existing agency chat routes (`AgencyChat.tsx`, `publicAgencyApi.ts`) invoke agency runs — find the internal HTTP call pattern used by the Node backend to start an agency run, and replicate it here.
3. Stream the agency's output back using the same SSE pattern. The agency orchestrator emits text chunks over its own stream; the content composer route proxies those chunks back to the client in the same `data: {"chunk": "..."}` format.

**Phase 1 scope note**: If proxying the agency stream proves complex, use a fallback: call the agency synchronously and return the complete response as a single chunk followed by `[DONE]`. The plan marks full agency streaming as a best-effort feature for Phase 1; the skill route is the primary path.

### Social Caption Generation — One-Shot LLM Call

`generateSocialCaption` is a `protectedProcedure` mutation added to the `contentComposerRouter` in `contentComposer.ts`. It calls the LLM synchronously (non-streaming) via `handleChatWithRouter` or the direct `executeWithFallback` function, using a platform-specific system prompt, and returns `{ caption: string }`.

Platform-specific prompt templates (from `claude-plan.md` §9):
- `facebook`: "Summarize for a Facebook post. Keep it under 500 characters. Include 2–3 relevant hashtags."
- `youtube`: "Write a YouTube video description. Keep it under 300 characters and include a clear call to action."
- `tiktok`: "Write a TikTok caption. Keep it under 150 characters. Include trending hashtags."
- `upload_post`: "Write a social media post suitable for cross-platform scheduling. Under 280 characters."

The user message is a truncated version of `draft.articleBody` (strip HTML tags, take first 2,000 characters).

---

## New Express Route: `apps/web/server/routes/contentComposerStream.ts`

### Request Contract

```
POST /api/content-composer/generate-stream
Authorization: Bearer <token>   (or session cookie)
Content-Type: application/json

Body:
{
  "draftId": string   // UUID of the content_composer_drafts row
}

Response:
Content-Type: text/event-stream; charset=utf-8

Frames:
  data: {"chunk":"<text>"}\n\n        // one frame per LLM token/chunk
  event: error\ndata: {"message":"..."}\n\n   // on failure
  data: [DONE]\n\n                    // end sentinel
```

### Validation and Security Checks

Perform these checks in order before writing any SSE headers:

1. **Authentication** — call `authenticateSSE(req, res)`. If null, stop (401 already sent).
2. **Tenant resolution** — `resolveTenantIdVarchar(tenantReq.tenant?.id, user.currentTenantId)`. If null, return 403.
3. **Body validation** — `z.object({ draftId: z.string().min(1) }).safeParse(req.body)`. If invalid, return 400.
4. **Draft ownership** — call `fetchOwnedDraft(draftId, tenantId, user.id)`. This helper (defined in section-03) throws `TRPCError` internally; in the Express route, catch it and map to HTTP status codes:
   - `TRPCError.code === "NOT_FOUND"` → `res.status(404).json(...)`
   - `TRPCError.code === "FORBIDDEN"` → `res.status(403).json(...)`

   Because `fetchOwnedDraft` is a tRPC helper that throws `TRPCError`, the route must import it directly from the router file or extract it into a shared service module. The preferred approach is to extract `fetchOwnedDraft` into a `contentComposerService.ts` file that both the tRPC router and the Express route can import. The implementer must make this call: if extracting to a service feels like overengineering for Phase 1, it is acceptable to duplicate the DB query inline in the Express route, using the same ownership logic.

5. **`articleBody` generation guard** — the route must check `draft.executionSource` is set. If `executionSource` is null, return 400 "Execution source not configured".
6. **Skill/agency validation**:
   - If `executionSource === "skill"`: verify `draft.skillId` is set; call `getSkillByIdAsync(draft.skillId)`; if not found, return 400 "Skill not found".
   - If `executionSource === "agency"`: verify `draft.agencyId` is set; query `agencies WHERE id = draft.agencyId AND tenantId = tenantId`; if not found, return 403 "Agency not found or not accessible".

All checks above happen BEFORE writing SSE headers. Once SSE headers are written, errors must be sent as SSE error events (not HTTP error status codes), because the HTTP status is already committed.

### Route Implementation Outline

```typescript
/**
 * Content Composer Generation Stream Route
 *
 * POST /api/content-composer/generate-stream
 *
 * Streams an article generation request as SSE.
 * Skill route: uses skill content as system prompt + topic as user message.
 * Agency route: delegates to agency orchestrator and proxies output.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sdk } from "../_core/sdk";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import type { TenantRequest } from "../_core/tenant";
import { getSkillByIdAsync } from "../services/skillRegistry";
import { handleStreamWithRouter } from "../services/llmRoutesHandler";
import type { Message } from "../_core/llm";
import { db } from "../db";
import { contentComposerDrafts, agencies } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const contentComposerStreamRouter = Router();

const bodySchema = z.object({
  draftId: z.string().min(1),
});

async function authenticateSSE(req: Request, res: Response) { /* ... same as agencyStream.ts ... */ }

contentComposerStreamRouter.post(
  "/api/content-composer/generate-stream",
  async (req: Request, res: Response) => {
    // 1. Auth
    const user = await authenticateSSE(req, res);
    if (!user) return;

    // 2. Tenant
    const tenantReq = req as TenantRequest;
    const tenantId = resolveTenantIdVarchar(tenantReq.tenant?.id ?? null, user.currentTenantId);
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    // 3. Body validation
    const bodyResult = bodySchema.safeParse(req.body);
    if (!bodyResult.success) return res.status(400).json({ error: "draftId is required" });
    const { draftId } = bodyResult.data;

    // 4. Load draft (with ownership check)
    const [draft] = await db
      .select()
      .from(contentComposerDrafts)
      .where(eq(contentComposerDrafts.id, draftId))
      .limit(1);
    if (!draft || draft.tenantId !== tenantId) return res.status(404).json({ error: "Draft not found" });
    if (draft.userId !== user.id) return res.status(403).json({ error: "Access denied" });
    if (draft.status === "deleted") return res.status(404).json({ error: "Draft not found" });

    // 5. Validate execution config
    if (!draft.executionSource) return res.status(400).json({ error: "Execution source not configured" });

    // 6. Build messages array
    let messages: Message[];
    let skillSlug: string | undefined;

    if (draft.executionSource === "skill") {
      if (!draft.skillId) return res.status(400).json({ error: "No skill selected" });
      const skill = await getSkillByIdAsync(draft.skillId);
      if (!skill) return res.status(400).json({ error: "Skill not found" });

      const systemPrompt = buildArticleSystemPrompt(skill.content ?? "", {
        requiresWebSearch: draft.requiresWebSearch ?? false,
        requiresThinking: draft.requiresThinking ?? false,
      });
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: draft.topic ?? "" },
      ];
      skillSlug = skill.slug;

    } else {
      // agency route
      if (!draft.agencyId) return res.status(400).json({ error: "No agency selected" });
      const [agency] = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.id, draft.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);
      if (!agency) return res.status(403).json({ error: "Agency not found or not accessible" });

      // Phase 1: agency as enhanced system prompt (full streaming proxy in Phase 2)
      messages = [
        { role: "system", content: AGENCY_ARTICLE_SYSTEM_PROMPT },
        { role: "user", content: draft.topic ?? "" },
      ];
    }

    // --- SSE headers written here (after all validation) ---
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // AbortController for client disconnect
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    try {
      await handleStreamWithRouter({
        messages,
        userId: user.id,
        tenantId,
        skillUsed: skillSlug,
        res,
      });
    } catch (err: unknown) {
      if (!res.writableEnded) {
        const msg = err instanceof Error ? err.message : "Generation failed";
        res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  },
);

export default contentComposerStreamRouter;
```

### `buildArticleSystemPrompt` Helper

This pure function constructs the system prompt for skill-based article generation. It is defined in the same file:

```typescript
/**
 * Wraps a skill's content with article-mode instructions.
 * The skill content is the main system prompt; this function appends
 * article formatting requirements and optional capability flags.
 *
 * @param skillContent - The skill.md body (already-authored system prompt)
 * @param opts.requiresWebSearch - Whether web search tool is requested
 * @param opts.requiresThinking - Whether extended thinking is requested
 * @returns Combined system prompt string
 */
function buildArticleSystemPrompt(
  skillContent: string,
  opts: { requiresWebSearch: boolean; requiresThinking: boolean },
): string {
  // Append article formatting instructions to the skill's own content.
  // The skill content is trimmed to 12,000 chars (same cap as chat skill injection in llmRoutes.ts).
  const trimmedContent = skillContent.substring(0, 12_000);
  const parts = [trimmedContent];
  parts.push(
    "\n\nFormat the output as a complete HTML article using proper semantic tags: " +
    "<h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>, <pre>, <code>, <strong>, <em>. " +
    "Do not include <html>, <head>, or <body> wrapper tags. Start directly with the article content.",
  );
  if (opts.requiresWebSearch) {
    parts.push("Use web search to find current, accurate information before writing.");
  }
  if (opts.requiresThinking) {
    parts.push("Think through the topic thoroughly before writing. Show your reasoning.");
  }
  return parts.join("\n");
}
```

The constant `AGENCY_ARTICLE_SYSTEM_PROMPT` (used for the Phase 1 agency fallback path) is a simple template:
```typescript
const AGENCY_ARTICLE_SYSTEM_PROMPT =
  "You are an expert content writer. Write a comprehensive, well-structured HTML article about the provided topic. " +
  "Format the output using semantic HTML tags: <h1>, <h2>, <p>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em>. " +
  "Do not include <html>, <head>, or <body> wrapper tags.";
```

---

## Route Registration

In `apps/web/server/_core/index.ts`, import and register the new router alongside `agencyStreamRouter`:

```typescript
import contentComposerStreamRouter from "../routes/contentComposerStream";
// ...
app.use(contentComposerStreamRouter);
```

The natural position is near the other streaming routes (search for `app.use(agencyStreamRouter)` and place the new line immediately after it).

---

## New tRPC Procedure: `generateSocialCaption`

Add this mutation to `apps/web/server/routers/contentComposer.ts`, inside the `contentComposerRouter` object. It extends the router defined in section-03.

### Procedure Signature

```
generateSocialCaption(input: { draftId: string, platform: string })
  → { caption: string }
```

### Platform-specific prompts

```typescript
const CAPTION_PROMPTS: Record<string, string> = {
  facebook: "Summarize for a Facebook post. Keep it under 500 characters. Include 2–3 relevant hashtags.",
  youtube: "Write a YouTube video description. Keep it under 300 characters and include a clear call to action.",
  tiktok: "Write a TikTok caption. Keep it under 150 characters. Include trending hashtags.",
  upload_post: "Write a social media post suitable for cross-platform scheduling. Under 280 characters.",
};
```

Throw `TRPCError({ code: "BAD_REQUEST", message: "Unsupported platform" })` if `platform` is not a key of `CAPTION_PROMPTS`.

### Implementation outline

```typescript
generateSocialCaption: contentComposerProcedure
  .input(z.object({
    draftId: z.string(),
    platform: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    /**
     * 1. Validate platform key
     * 2. Load the draft via fetchOwnedDraft (throws NOT_FOUND / FORBIDDEN)
     * 3. Validate draft.articleBody is not null (requires generation to have completed)
     * 4. Strip HTML from articleBody, truncate to 2,000 chars
     * 5. Build messages: [{ role: "system", content: platformPrompt }, { role: "user", content: articleText }]
     * 6. Call LLM synchronously via executeWithFallback({ stream: false, ... })
     * 7. Extract caption from response.choices[0].message.content
     * 8. Persist caption back to draft: db.update(contentComposerDrafts).set({ socialCaption: caption })
     * 9. Return { caption }
     */
  }),
```

For step 6, import `executeWithFallback` from `../services/llmRouter` — the same function used by `llmRoutesHandler.ts`. Resolve the model with `resolveEnabledLlmModelId([undefined])` to get the tenant's default model.

HTML stripping in step 4 uses a simple regex: `articleText = (draft.articleBody ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 2_000)`.

---

## TDD: Tests to Write First

### File: `apps/web/server/routes/__tests__/contentComposerStream.test.ts`

This test file follows the pattern of `apps/web/server/routes/__tests__/agencyStream.test.ts`:
- `vi.hoisted()` + `vi.mock()` at the top for all dependencies
- `createApp()` helper that mounts the router on an Express instance
- Supertest (`request(app)`) for HTTP-level assertions

#### Mock setup required

```typescript
// vi.hoisted() block — mock these:
// - "../_core/sdk"               → mockAuthenticateRequest
// - "../services/tenantContext"  → mockResolveTenantIdVarchar (returns tenantId)
// - "../services/skillRegistry"  → mockGetSkillByIdAsync
// - "../services/llmRoutesHandler" → mockHandleStreamWithRouter
// - "../db" (or "../../db")      → mockDb (Drizzle — stub select chain for drafts + agencies)
// - "../../drizzle/schema"       → stub contentComposerDrafts + agencies table refs
// - "drizzle-orm"                → stub eq, and
```

The `mockHandleStreamWithRouter` mock should write a minimal SSE response to `res` and call `res.end()`:
```typescript
mockHandleStreamWithRouter.mockImplementation(({ res }: { res: Response }) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.write('data: {"chunk":"Hello"}\n\n');
  res.write("data: [DONE]\n\n");
  res.end();
});
```

#### Test stubs

```typescript
describe("POST /api/content-composer/generate-stream", () => {
  // Auth & authorization
  // Test: returns 401 when no auth token provided
  // Test: returns 403 when tenantId cannot be resolved

  // Input validation
  // Test: returns 400 when draftId is missing from body
  // Test: returns 400 when draftId is an empty string

  // Draft ownership
  // Test: returns 404 when draft does not exist
  // Test: returns 403 when draft belongs to a different user (same tenant)
  // Test: returns 404 when draft belongs to a different tenant

  // Execution source validation
  // Test: returns 400 when executionSource is null on the draft
  // Test: returns 400 when executionSource is "skill" but skillId is null
  // Test: returns 400 when executionSource is "skill" and skill not found in registry
  // Test: returns 403 when executionSource is "agency" but agency not found / wrong tenant

  // Successful stream — skill route
  // Test: responds with Content-Type text/event-stream for valid skill-based draft
  // Test: calls handleStreamWithRouter with skill content as system prompt message
  // Test: calls handleStreamWithRouter with draft.topic as user message
  // Test: passes skillUsed = skill.slug to handleStreamWithRouter

  // Successful stream — agency route
  // Test: responds with Content-Type text/event-stream for valid agency-based draft
  // Test: calls handleStreamWithRouter when agency belongs to tenant

  // Web search / thinking flags
  // Test: buildArticleSystemPrompt appends web search instruction when requiresWebSearch = true
  // Test: buildArticleSystemPrompt appends thinking instruction when requiresThinking = true
  // Test: buildArticleSystemPrompt does not append instructions when both flags are false
});
```

The `buildArticleSystemPrompt` function can be tested in isolation (it is a pure function) as part of this test file.

### Tests for `generateSocialCaption` (in `contentComposer.test.ts`)

Append to the existing test file from section-03:

```typescript
describe("generateSocialCaption", () => {
  // Test: returns generated caption for valid draftId + supported platform
  // Test: persists caption to draft.socialCaption in DB
  // Test: uses platform-appropriate prompt (assert prompt contains "Facebook" hint for facebook platform)
  // Test: throws NOT_FOUND for non-existent draftId
  // Test: throws FORBIDDEN for draft from different tenant
  // Test: throws BAD_REQUEST for unsupported platform string (e.g. "instagram")
  // Test: throws BAD_REQUEST when draft.articleBody is null (generation not complete)
  // Test: strips HTML from articleBody before sending to LLM
  // Test: truncates articleBody to 2000 chars before sending to LLM
});
```

---

## Implementation Notes

### `handleStreamWithRouter` vs direct LLM call

The route uses `handleStreamWithRouter` rather than calling `executeWithFallback` directly, because `handleStreamWithRouter` already handles:
- Provider fallback ladder
- Credit deduction
- Planner-based model selection (when `skillUsed` is set)
- Error-as-SSE-event formatting

Do not duplicate this logic.

### No double `res.end()`

`handleStreamWithRouter` calls `res.end()` internally. The surrounding try-catch in the route handler calls `res.end()` only in the error branch, guarded by `!res.writableEnded`. Never call `res.end()` unconditionally after `handleStreamWithRouter`.

### Draft status after generation

The stream route does NOT update `draft.articleBody` — the route only handles the live stream. After the stream ends, the client receives `[DONE]` and dispatches `GENERATION_COMPLETE`, which triggers an autosave via `trpc.contentComposer.saveDraft`. The saveDraft mutation (section-03) then writes the sanitized `articleBody` back to the database. This separation keeps the Express route stateless with respect to draft state.

### Rate limiting

Reuse the existing `llmLimiter` middleware from `llmRoutes.ts` if it can be imported, or apply the existing `rateLimit()` helper from `apps/web/server/_core/limits.ts`. The route should have a per-user rate limit of 10 requests per minute. Implementer: check if a shared rate-limit middleware exists for authenticated Express routes (look at how `agencyStream.ts` handles rate limits — it uses a per-user stream count via `acquireStream`/`releaseStream`). Apply whichever pattern is already established.

### Tenant middleware requirement

The route relies on `req.tenant` being populated by the tenant middleware. Verify that `tenantMiddleware` runs before this route in `index.ts`. In the existing codebase, `tenantMiddleware` is applied globally (search `app.use(tenantMiddleware)` in `index.ts`) so routes registered with `app.use(router)` will always have `req.tenant` available.

### Agency route Phase 1 constraint

In Phase 1, the agency route uses a static system prompt (`AGENCY_ARTICLE_SYSTEM_PROMPT`) instead of invoking the full agency orchestrator. A comment in the code must mark this as a Phase 2 TODO:

```typescript
// TODO(Phase 2): Replace static system prompt with full agency orchestrator streaming proxy.
// The Phase 1 implementation treats agency selection as a signal to use a generic article-writing
// prompt. Phase 2 will send the request to the Python orchestrator at POST /api/agency/{agencyId}/run
// and proxy the SSE output directly to the client.
```

---

## Acceptance Criteria for This Section

- [ ] `POST /api/content-composer/generate-stream` route exists and is registered in `index.ts`
- [ ] Route returns 401 for unauthenticated requests (no auth token)
- [ ] Route returns 404 for unknown or deleted draft IDs
- [ ] Route returns 403 when draft belongs to a different user or inaccessible agency
- [ ] Route returns 400 when `draftId` is missing
- [ ] Route sets `Content-Type: text/event-stream; charset=utf-8` and `X-Accel-Buffering: no` headers on success
- [ ] Skill route: skill's `content` field is used as the system prompt; `topic` is the user message
- [ ] `buildArticleSystemPrompt` appends HTML format instructions to skill content
- [ ] `requiresWebSearch` and `requiresThinking` flags modify the system prompt
- [ ] Agency route: checks agency ownership before streaming; uses `AGENCY_ARTICLE_SYSTEM_PROMPT` in Phase 1
- [ ] Stream ends with `data: [DONE]\n\n` sentinel (handled by `handleStreamWithRouter`)
- [ ] `generateSocialCaption` procedure added to `contentComposerRouter`
- [ ] `generateSocialCaption` throws `BAD_REQUEST` for unsupported platform strings
- [ ] `generateSocialCaption` throws `NOT_FOUND` / `FORBIDDEN` for draft ownership violations
- [ ] `generateSocialCaption` persists the generated caption to `draft.socialCaption`
- [ ] All tests in `contentComposerStream.test.ts` pass
- [ ] `generateSocialCaption` tests in `contentComposer.test.ts` pass
- [ ] `pnpm check` passes with no new TypeScript errors

---

## Dependencies This Section Must NOT Touch

- `apps/web/drizzle/schema.ts` — schema is owned by section-01
- `apps/web/server/routers/contentComposer.ts` CRUD procedures — owned by section-03; this section only adds `generateSocialCaption`
- `apps/web/server/services/contentComposerPublishService.ts` — owned by section-09
- All frontend components — owned by sections 02, 04–07
- `apps/web/server/services/llmRoutesHandler.ts` — read-only; do not modify the existing `handleStreamWithRouter` function