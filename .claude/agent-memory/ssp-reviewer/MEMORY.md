# SSP Reviewer Agent Memory

## Project Conventions (confirmed)

- tRPC routers: `apps/web/server/routers/library.ts` — library feature router
- Library service: `apps/web/server/services/libraryService.ts`
- Zod schemas inline in router `.input()` — no separate schema file for library
- `fileBase64` is used for file uploads/replace — **no server-side size cap on `replaceFile`** (only `saveMarkdown` has a 5MB cap)
- Auth pattern: `protectedProcedure` enforces JWT; tenant isolation via `resolveLibraryTenantId`

## Recurring Patterns to Flag

- **No file size cap in `replaceFile` input schema** — `fileBase64: z.string().min(1)` with no `.max()`. Flag as HIGH in every review that touches file upload mutations.
- **AlertDialogAction onClick with `e.preventDefault()`** — Radix `AlertDialog` closes on action click by default; `e.preventDefault()` is the correct pattern to keep it open on error, but it also means the cancel/close path must clean state manually.
- **`getVersionSnapshotUrl` enabled guard** — query is gated on `!!selectedVersionId && isFileSnapshot`. If `selectedVersion` hasn't loaded yet, `isFileSnapshot` is false and the query won't fire even if needed. This causes a window where the Download button is hidden but no loading indicator is shown for it.
- **`MarkdownVersionHistory` is a 2-line re-export** — the real component is `DocumentVersionHistory`. No other files import `MarkdownVersionHistory`; re-export exists only for backward compat.
- **`fileToBase64` uses FileReader data URL** — result includes the `data:<mime>;base64,` prefix. Confirm server strips the prefix before decoding.

## Key File Paths

- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentVersionHistory.tsx`
- `apps/web/client/src/components/library/MarkdownVersionHistory.tsx` (re-export only)
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/libraryService.ts`

## ClawFeature (feat/029-claw-feature) — Final Completeness Pass (2026-03-02)

### RESOLVED since previous reviews
- **S10-H6**: Widget WebSocket TWO-WAY is now implemented — `channelGateway.processMessageServerSide()` called and response sent back via `widgetConnections` map.
- **S10-H1**: Widget CRUD router (`routers/widget.ts`) uses `domainAdminProcedure` correctly.
- **S11-H6**: Credits ARE now deducted in `webhookTrigger.ts` (line 240-246) after dispatch.
- **S11-H3**: Dedup key now uses `serverTimestamp` for `token` auth type (only uses caller timestamp for validated HMAC). Fixed.
- **S12-H4**: `testRule` no longer calls `invalidateCache()` — uses `evaluateRules()` directly (cache re-populates naturally). Acceptable.
- **S12-H2**: `totalMatches` now uses SQL atomic increment `sql\`"totalMatches" + 1\`` — fixed.
- **S14-H1**: `requireFeatureFlag.ts` now uses `middleware` from `_core/trpc` — no second tRPC instance.
- **S14-H2**: `/api/tenant/current` now returns `featureFlags` field (confirmed in `tenant.ts:39`).
- **S06-H1**: Voice feature flag IS checked at `/api/voice/session` (voiceGateway.ts:105).
- **S06-H2**: Voice credits ARE now deducted via `deductCredits()` in `dispatchSTT()` (voiceGateway.ts:383).
- **S15-H1/H2/H3**: `redisSemaphore.ts` uses atomic Lua INCR+EXPIRE script — INCR race fixed. Remaining: `EXISTS+DECR` in release() is still non-atomic (S15-H2 partially remains).

### REMAINING Open Issues (final pass confirmed)
- **S15-H2 (partial)**: `release()` checks `EXISTS` then `DECR` in two round-trips — still a TOCTOU race if key expires between EXISTS and DECR (creates key at -1). Not critical in practice since TTL is 300s and decr on missing key just creates -1.
- **S11-STUB**: `webhookTrigger.ts:229-237` — actual target dispatch is still a stub (logs `webhook_dispatch_stub`). Credits deducted, log recorded, but no actual chat/agency/workflow routing happens.
- **Nginx S15**: No Nginx location for `/api/webhooks/trigger/` — handled by fallback `/api/` block which routes to Python backend, but webhooks/trigger is a Node.js route. However, CSRF exemption is in place and the route IS mounted in index.ts. Need to verify routing works correctly through Nginx.

### Registration Status (all confirmed)
- `channelRouterRouter` — registered at `routers.ts:1369`
- `webhookTriggersRouter` — registered at `routers.ts:1366`
- `AdminChannelRouter` page — registered in `App.tsx:164` at `/admin/channel-router`
- menu entry `admin-channel-router` — in `menu.ts:66` with `requiresFeature: 'channelRouter'`
- Voice WS upgrade — wired in `_core/index.ts:983`
- Widget WS upgrade — wired in `_core/index.ts:985`
- Voice session router — mounted at `/api/voice`
- Widget init router — mounted at `/api/widget`
