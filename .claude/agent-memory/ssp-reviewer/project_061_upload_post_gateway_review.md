---
name: Spec 061 — Upload-Post Universal Gateway — Plan Completeness Review
description: Verdict and key findings for spec 061 Upload-Post universal social gateway completeness review (2026-03-24)
type: project
---

## Verdict: APPROVE_WITH_FIXES (2026-03-24)

3 CRITICAL, 5 HIGH, 6 MEDIUM, 4 LOW findings.

### CRITICAL Findings

- **CRITICAL-1 — `social_posts.pageId NOT NULL` incompatible with Upload-Post posts**: The existing `social_posts` table requires a non-null FK to `social_pages`. Upload-Post posts have no native social page row, so they cannot be stored in `social_posts` without a schema change (make `pageId` nullable) or a separate storage path. The spec proposes `uploadPostJobId` FK without resolving this fundamental constraint mismatch.

- **CRITICAL-2 — Circular FK between `upload_post_jobs` and `social_posts`**: `upload_post_jobs.socialPostId → social_posts.id` AND `social_posts.uploadPostJobId → upload_post_jobs.id` creates a circular FK that will fail migration without DEFERRABLE constraint or dropping one side.

- **CRITICAL-3 — Migration plan has no SQL, no backup steps, no rollback**: The 4-phase rollout plan contains zero migration SQL, no Drizzle schema snippets, no backup procedures, and no rollback strategy. Database Safety Protocol requires backup + verify + restore path.

### HIGH Findings

- **HIGH-1 — Wrong facade extension point identified**: Spec says extend `socialBackgroundFacade.ts` but that file is a thin re-export shim. Actual dispatch lives in `providerRegistry.ts` → `SocialProviderAdapter`. A new `UploadPostSocialProviderAdapter` implementing that interface must be specified, or an explicit bypass path in `executeSocialAction`.

- **HIGH-2 — No Zod input schemas for any of 17 tRPC procedures**: §6.5 claims coverage but provides zero schemas. Security-critical procedures like `connect` (apiKey), `publish` (content/platforms), and `editScheduled` all lack validation specs.

- **HIGH-3 — No status sync loop specified**: Nothing describes who polls `GET /uploadposts/status`, at what interval, the status mapping (Upload-Post states → `social_posts.status`), max retries, or failure handling. This is a required async feedback path.

- **HIGH-4 — Frontend spec too shallow**: No component file names, no new routes for `App.tsx`, no Zod form schemas, no loading/error states, no degradation path when Upload-Post key is revoked mid-session.

- **HIGH-5 — Daily key revalidation cron unspecified**: Only mentions "daily cron" without Celery beat entry, schedule string, or action on invalid key (pause pending jobs? email user?).

### Key Context

- `social_posts` table: `pageId INTEGER NOT NULL REFERENCES social_pages(id)` — this is the blocking constraint.
- `socialBackgroundFacade.ts` is 41 lines; real registry is `providerRegistry.ts` with `SocialProviderAdapter` interface.
- `socialPublishing.ts` router uses a `socialPublishingProcedure` middleware checking `META_CHANNELS_ENABLED` feature flag — same pattern needed for Upload-Post.
- Feature flag naming convention in codebase: SCREAMING_SNAKE (e.g., `META_CHANNELS_ENABLED`) via `getTenantFeatureFlag(flagName, tenantId)`.
- No data retention policy specified for 3 new tables (existing system has 7-12 day retention for other social data).

**Why:** Upload-Post integration is architecturally sound but the spec skips the hard implementation details. The CRITICAL schema issues would cause a migration failure on day one of implementation.

**How to apply:** When this spec returns for implementation review, verify the circular FK and `pageId` nullable issues are resolved in the updated schema before approving implementation sections.
