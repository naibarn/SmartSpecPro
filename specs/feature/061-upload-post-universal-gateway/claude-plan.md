# Implementation Plan: Upload-Post Universal Gateway

## 1. Architecture Summary

Upload-Post should be introduced as a separate gateway subsystem that sits alongside the native social provider path. The core implementation decision is to keep Upload-Post out of `SocialProviderAdapter` and instead give it its own connection, profile, job, and dispatch model. That matches the spec and avoids forcing Upload-Post into a page-based abstraction that already fits Meta/TikTok/YouTube better.

The plan should reuse the codebase's existing patterns:

- encrypted user secrets in `crypto.ts`
- tenant feature gating in `tenantFeatureFlagService.ts`
- per-user and per-IP rate limiting in the existing middleware/service layers
- `protectedProcedure`-based tRPC routers with explicit ownership checks
- `Settings.tsx` as the frontend entry point for user-scoped configuration
- separate social publishing services and parallel background dispatchers

The implementation should land in a few coherent slices rather than a single broad change. Each slice should be independently testable and should leave the system in a safe state if the feature flag remains off.

## 2. Data Model and Shared Types

Create the Upload-Post tables in the Drizzle schema and add a migration that introduces:

- `upload_post_connections`
- `upload_post_profiles`
- `upload_post_jobs`
- persisted consent state for first-use disclosure on the user's Upload-Post connection, plus tenant opt-in in the tenant settings/feature-flag layer

Keep the model separate from `social_posts` and do not add a circular FK back to native social tables. The jobs table should be the source of truth for Upload-Post history and status tracking.

Shared type work should include:

- valid platform unions
- connection status enums
- job status enums
- metadata shapes for queue limits, monthly usage, and platform results
- consent state shapes for disclosure acknowledgement, tenant enablement, and versioned policy tracking

The schema should follow the same tenant and user ownership pattern used by existing connection tables such as `telegram_connections` and `channel_connections`.

## 3. Upload-Post Client and Router Surface

Add a standalone `UploadPostClient` service that wraps the Upload-Post HTTP API with:

- per-request timeout handling
- HTTPS-only requests
- sanitized error mapping
- no logging of secrets or raw upstream payloads

Add a new `uploadPost` tRPC router that handles:

- connect and disconnect
- connection health checks
- list/create/delete profiles
- JWT generation for account linking
- publish, schedule, queue, cancel, edit, and status retrieval
- analytics and resource discovery where applicable

The router should use a shared feature-flag middleware that fails closed, not the generic feature-flag helper that defaults to enabled.

## 4. Publish Dispatch and Status Sync

Add a parallel `UploadPostDispatcher` service for workflow and agency usage. The dispatcher should own the logic for:

- resolving the correct connection from `tenantId + userId`
- decrypting the API key only for the duration of the request
- selecting the correct Upload-Post upload endpoint
- creating and updating `upload_post_jobs`
- sanitizing status and error data before persistence

Status sync should be handled by a combined approach:

- foreground polling from the frontend for active jobs
- a background sweep for stale pending, scheduled, or queued jobs

This keeps the plan aligned with the existing codebase pattern of async jobs backed by DB state plus polling, rather than assuming webhook delivery.

## 5. Frontend Integration

Extend the existing settings page to include an Upload-Post connection panel with:

- disclosure banner
- API key entry and validation
- connection status and quota display
- profile list and profile creation
- JWT linking entry point

Extend the social publishing UI with:

- a gateway selector for native vs Upload-Post
- profile selection
- platform selection filtered by the profile's connected platforms
- scheduling and queue controls
- history tabs or source labels so users can tell native posts from Upload-Post jobs

The settings work should reuse the existing panel-based structure under `Settings.tsx`.

## 6. Security, Rollout, and Observability

Introduce a strict `UPLOAD_POST_GATEWAY_ENABLED` helper that defaults to disabled. Put the check in middleware so the router can be blocked centrally.

Security work should include:

- API key encryption at rest
- SSRF validation on every media URL before forwarding, with a strict rule that the Node.js process never performs user-supplied media fetches itself
- CSRF-safe nonce flow for JWT linking
- strict ownership joins for every profile/job lookup
- per-user rate limiting on publish, status, and management endpoints
- upstream error sanitization before response or storage
- persisted acknowledgement checks before first connect/publish use, with tenant opt-in checked alongside the global fail-closed helper

Rollout work should include:

- audit events for connect, disconnect, publish, status, profile creation, and rate limiting
- job retention cleanup, including 30-day nullification of heavy metadata fields and 90-day deletion of terminal jobs
- shared-key warning when multiple users in a tenant point to the same Upload-Post API key
- feature-flagged UI hiding when disabled
- tests that cover the disabled-by-default state

## 7. Explicit Assumptions

This plan intentionally defers a few spec-level questions so the first implementation stays bounded:

- polling plus background sweeps are the status-sync strategy for the initial delivery
- Upload-Post usage is not billed against SmartSpecPro credits in this phase
- profiles are created and managed explicitly rather than auto-created implicitly on first connect
- webhook ingestion, shared tenant API keys, and large-video delegation are later-phase work

These assumptions should remain visible in implementation notes and test cases so later work can revise them without rewriting the entire gateway shape.
