# Integration Notes — Opus Review Feedback

## What I'm Integrating

### H1 — INTEGRATING: Reframe as modifications to existing file
The existing `modelSuggestTool.ts` has a handler but lacks `suggestModel()` as a standalone export and audit logging. The plan will be rewritten to describe the delta, not a full rewrite.

### H2 — INTEGRATING: Fix timingSafeEqual to use SHA-256 hashing
The existing `verifyInternalToken` is vulnerable to length oracle. The plan will explicitly require hashing both token and expected value with SHA-256 before `timingSafeEqual()`. This is a security fix, not just a style change.

### H3 — INTEGRATING: Add `await` to all `suggestModel()` calls
Critical — missing `await` is a runtime bug. Plan updated to make all async calls explicit.

### M3 — INTEGRATING: Add try-catch around `getModelsByTypeAsync` in HTTP handler
The autoDraftTool already does this pattern. The HTTP endpoint should too.

### M4 — INTEGRATING: Standardize priority default to 99
Use `priority ?? 99` everywhere so models without priority sort to the bottom (lowest priority = last choice).

### M5 — INTEGRATING: Clarify test additions are to existing file
The plan will explicitly say "add to existing `modelSuggestTool.test.ts`" not "create new file".

### M1 — INTEGRATING: Document balanced=quality as known limitation
Will add a note in plan that "balanced" and "quality" produce the same sort — intentional MVP simplification.

## What I'm NOT Integrating

### M2 — NOT integrating: userId/tenantId DB validation
Model-suggest is a read-only recommendation endpoint. The risk of fabricated user IDs in audit logs is low and acceptable. Adding DB validation would add latency and complexity that isn't justified for MVP. Future iteration if needed.

### L1 — NOT integrating: Type guard instead of cast
The existing pattern `purpose as MediaType` is consistent with the rest of the codebase and the Zod enum validation already ensures only valid values reach that point. Not worth the churn.

### L2 — NOT integrating: Rate limiting
Acknowledged as future concern; not needed for MVP. Model registry has a 5-minute cache that limits DB hits.

### L4 — NOT integrating (clarifying): Python agent changes
The Python agent already has placeholder code that can call model-suggest once the endpoint exists. No Python backend code changes required. The agent's framework picks up the new endpoint via configuration, not code change.
