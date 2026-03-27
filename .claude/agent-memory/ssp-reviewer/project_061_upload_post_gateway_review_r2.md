---
name: Spec 061 Upload-Post Universal Gateway — Second-Pass Review
description: Second-pass completeness review of spec.md for feature 061. Verifies first-round fixes and finds new gaps.
type: project
---

## Verdict: APPROVE_WITH_FIXES (Round 2)

First-round CRITICAL fixes all correctly addressed. 3 new HIGH, 5 MEDIUM, 2 LOW gaps remain.

### First-Round Fix Verification

| Finding | Status | Notes |
|---|---|---|
| CRITICAL-1: social_posts.pageId NOT NULL deadlock | PASS | Standalone upload_post_jobs with no FK to social_posts |
| CRITICAL-2: Circular FK | PASS | Completely eliminated; no cross-table FK to social_posts |
| CRITICAL-3: No migration DDL | PASS | Section 3.7 has DDL, backup steps, rollback SQL |
| HIGH-1: Wrong extension point (facade vs registry) | PASS | Section 4.4 correctly targets providerRegistry.ts |
| HIGH-2: Missing Zod schemas | PASS | Section 4.2 defines all shared schemas and 17 procedure stubs |
| HIGH-3: No status sync | PASS | Section 4.5 specifies client polling + 5-min cron sweep |

### New Gaps Found

**NEW-HIGH-1**: Section 4.1 Architecture Contradiction — "API key NEVER leaves Node.js" but all upload operations also live in Node.js. Section 4.1 says "Node.js calls Upload-Post directly for uploads using node-fetch with streaming." Section 6.8 says the same. But Section 4.3's UploadPostClient stub includes uploadVideo/uploadPhoto/etc directly in Node.js — fine for text. But for large video (>100MB), Section 4.1 admits "for large video files (>100MB), Node.js initiates the upload using a signed URL pattern or delegates through a secure internal token exchange." The signed URL pattern is entirely undefined in the spec. No detail on how to get a signed URL from Upload-Post, what the expiry window is, or what happens if the client drops mid-upload. The 30s timeout in UploadPostClient will fail on any large video.

**NEW-HIGH-2**: Section 6.7 XSS — `window.opener.postMessage('upload-post-linked','*')` uses wildcard origin (`'*'`). Any page that opened this popup (phishing page, MITM-redirected OAuth, etc.) receives the message. Must be `window.opener.postMessage('upload-post-linked', 'https://smartaihub.app')`. The spec is aware of popup isolation but missed the origin parameter.

**NEW-HIGH-3**: Feature flag fall-through is fail-OPEN on Redis failure. Section 7 defines `isUploadPostEnabled()` which catches Redis errors and falls through to `process.env.UPLOAD_POST_GATEWAY_ENABLED === "true"` — correct fail-closed. However, the spec does NOT say this custom helper replaces the standard `getTenantFeatureFlag()`. The existing `getTenantFeatureFlag()` in `featureFlags.ts` returns `true` by default when Redis is unavailable and no env var is set. If any procedure uses `getTenantFeatureFlag('UPLOAD_POST_GATEWAY_ENABLED', tenantId)` instead of `isUploadPostEnabled(tenantId)`, the flag is fail-OPEN. The spec must mandate that the custom helper be used in the tRPC middleware wrapper (and show the middleware implementation) — not just document that it exists.

**NEW-MED-1**: Unified Timeline Pagination is underspecified. Section 5.3 says merge and sort both sources "by createdAt desc" but the two cursors for `listPosts` and `listJobs` are independent ISO timestamp strings. Merging with independent cursors means: page 1 returns 20 native + 20 upload-post items sorted and sliced to 20 total — but page 2 needs to resume from both lists at different offsets, not just one shared cursor. There is no spec for a merged-cursor strategy or whether client must fetch and buffer both full lists to sort them. Duplicated/missed items at page boundaries will occur with the described approach.

**NEW-MED-2**: `listJobs` cursor is a string but the cursor type for `listPublishingPosts` (existing) uses `createdAt` ISO string as cursor with a `lt(createdAt, cursorDate)` filter. This produces wrong results when two rows have identical `createdAt` timestamps (both rows have the same millisecond). The existing service has the same timestamp-tie bug, but the spec introduces a new `listJobs` procedure using the same pattern without addressing it. Should be `(createdAt, id)` composite keyset cursor.

**NEW-MED-3**: Plan downgrade gap. Section 13 (Open Questions) doesn't address: if a user is on the `pro` plan and their Upload-Post account is downgraded to `free` (10 uploads/month), the spec has no mechanism to detect this until the next daily cron revalidation. Jobs in `pending` status will silently fail on Upload-Post's side with a quota error. The `consecutiveValidationFailures` counter is for key invalidity, not plan changes. The `metadata.monthlyLimit` from `/me` would catch this at revalidation time but not in real-time. At minimum the spec should acknowledge this as a known limitation with a mitigation (refresh metadata on every publish).

**NEW-MED-4**: Workflow/agency integration (Section 4.6) says "The workflow executor resolves the user's connection" but background agency tasks run under a system context with no `req.session.userId`. The spec does not specify how `userId` is resolved for an agency run. Unlike native social publishing which requires a connected `socialPage` with the token encrypted per user, an Upload-Post run in background context would need to look up a user-scoped `upload_post_connections` row. The spec must specify how user context is injected into background execution (e.g., stored as part of workflow trigger config, or agency is always tied to the triggering user).

**NEW-MED-5**: Section 12 cascade delete note — `upload_post_jobs` has FK `profileId → upload_post_profiles(id) ON DELETE CASCADE` and `upload_post_profiles` has FK `connectionId → upload_post_connections(id) ON DELETE CASCADE`. Deleting a connection cascades to profiles and jobs. However `upload_post_jobs.tenantId` and `upload_post_jobs.userId` are direct FKs to `tenants` and `users`. If a user is deleted (not a disconnect), the `userId` FK on `upload_post_jobs` would either cascade or block depending on its ON DELETE action. The spec does not define ON DELETE behavior for the `users` FK in `upload_post_jobs`. The DDL shows `ON DELETE CASCADE` only for tenants; the users FK is not shown with an action in §3.4.

**NEW-LOW-1**: The providerRegistry adapter stub in Section 4.4 shows a `providerRegistry.register("upload_post", ...)` call but the actual `providerRegistry.ts` API uses `providerRegistry.set(id, adapter)` (it's a Map internally, exposed via `registerSocialProvider(adapter)` function). The spec uses a non-existent `.register()` method. The correct call is `registerSocialProvider({ providerId: "upload_post", ... })`.

**NEW-LOW-2**: Error sanitizer regex `[A-Za-z0-9_-]{20,}` for token stripping (Section 6.9) also strips legitimate long platform post IDs (YouTube video IDs, LinkedIn URNs) that may appear in success responses. These are stored in `platformResults` so they'd be stripped out of error contexts only, but the same sanitizer is applied before storing `errorMessage` — which sometimes contains post IDs for debugging. Worth noting as a precision issue.

Why: document for next review round.
How to apply: Block on NEW-HIGH-1 (large video undefined), NEW-HIGH-2 (XSS), NEW-HIGH-3 (fail-open risk). Fix or formally defer NEW-MED-1 (pagination strategy).
