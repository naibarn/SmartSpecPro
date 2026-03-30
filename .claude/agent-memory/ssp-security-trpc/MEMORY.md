# CMD-6 tRPC Security Auditor — Persistent Memory

## Index of Topic Files
- `feature_058_agency_creator_audit.md` — Feature 058 agency creator intelligence upgrade audit (autoCreate, autoCreateStatus, autoCreateAnswer, saveAsTemplate, internal/agency/create) — 2026-03-24
- `feature_057_mcp_trpc_router_audit.md` — Feature 057 section-13 mcpServers.ts tRPC router audit — 2026-03-24
- `feature_unified_skill_execution_audit.md` — Unified skill execution system (executors/, unifiedOrchestrator.ts) — 2026-03-21
- `feature_049_notification_reaudit.md` — Notification system re-audit
- `feature_049_notification_system_audit.md` — Notification system initial audit
- `feature_api_key_systems_audit.md` — API key systems audit
- `feature_052_agency_round2_audit.md` — Agency Swarm Round 2 deep audit (agency.ts, agencyStream.ts, agencyToolsApi.ts, agencyStreamProxy.ts) — 2026-03-23
- `feature_053_agentic_intelligence_audit.md` — Feature 053 memory CRUD + saveBuilder agentic validation audit — 2026-03-23

## Project Security Conventions

### Auth & Tenant Isolation Pattern
- All tRPC procedures use `protectedProcedure` from `../_core/trpc` (enforces JWT auth)
- Tenant isolation uses `ctx.tenantId` and `ctx.user.id` (both from JWT)
- Standard WHERE clause for tenant-scoped mutations:
  `and(eq(table.id, input.id), eq(table.tenantId, ctx.tenantId), eq(table.ownerUserId, ctx.user.id))`
- `resolveLibraryTenantId()` helper used in both gdrive and onedrive routers

### CRITICAL: resolveTenantIdVarchar Calling Convention
- **Correct call**: `resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId)` — as used in all established routers (groups.ts, library.ts, media.ts, apiKeys.ts, etc.)
- **BROKEN call**: `resolveTenantIdVarchar(ctx)` — passing the full ctx object as first arg; `normalizeTenantIdVarchar(ctx)` returns null since ctx is neither string nor number; second arg is undefined → also null → **always returns null**
- In `runEngine.loadRunWithTenantCheck`: when `tenantId` is null, the `if (tenantId)` guard is **skipped entirely**, making the isolation check a no-op → true IDOR
- In Drizzle: `eq(column, null)` generates `column = NULL` (always false in SQL) → services throw NOT_FOUND instead of leaking data, BUT this is still a CRITICAL security misconfiguration since the WHERE clause is semantically broken
- **Routers affected (Feature 047)**: teamRoom.ts, teamRun.ts, monitoring.ts, scopedMemory.ts, team.ts (all lines calling `resolveTenantIdVarchar(ctx)`)

### Internal Proxy Token Pattern
- `SMARTSPEC_PROXY_TOKEN` via `process.env.SMARTSPEC_PROXY_TOKEN` (not VITE_ prefixed — correct)
- Sent as `x-proxy-token` header to Python backend internal endpoints
- Module-level constant with startup `console.warn` if missing
- Python backend OAuth calls use short-lived signed JWTs (`signBearerToken`, 15m TTL) not PROXY_TOKEN

### Rate Limiting Pattern
- Rate limiters injected as tRPC `.use()` middleware before `.input()`
- Four limiter categories: search, read, sync, edit
- Both routers: `createGDriveRateLimitMiddleware` used for both GDrive and OneDrive

### VITE_ Env Vars in Server Code (Confirmed)
- `apps/web/server/_core/env.ts` lines 3, 35, 39 — reads `VITE_APP_ID`, `VITE_OAUTH_SERVER_URL`, `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/_core/liveBrowserStreamProxy.ts` line 6 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/_core/mcpRoutes.ts` line 36 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/routes/webhooks.ts` line 17 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/services/federatedSearch.ts` line 67 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/services/presentationPlaybackExport.ts` line 186 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/services/mediaGenerationService.ts` line 421 — reads `VITE_APP_URL`
- `apps/web/server/services/chatService.ts` line 28 — reads `VITE_PYTHON_BACKEND_URL`
- NOTE: These are FALLBACK reads (non-VITE_ var checked first). Still a naming risk — Vite bundles `VITE_*` into client JS if referenced via `import.meta.env`.

### Known Structural Issues (confirmed across audits)

#### GDrive/OneDrive routers
- `updateSyncSettings` UPDATE uses `eq(table.id, existing.id)` — missing tenantId/userId in the UPDATE WHERE clause (IDOR in update path even though SELECT was scoped)
- `listDriveFolders` accepts `parentFolderId: z.string()` with no regex/max-length validation
- `removeFromIndex` libraryChunks DELETE is scoped only by `libraryItemId`, not by tenantId
- `getDriveFilePreview` returns full `...payload` spread including driveFile metadata — unvalidated passthrough

#### scheduledMessages.ts
- `getAnalytics` — when `input.scheduleId` is provided, inserts it directly into `scheduleIds` array without verifying ownership; the query uses `inArray(scheduledMessageLogs.scheduledMessageId, scheduleIds)` — IDOR allows reading another user's execution logs (line ~688)

#### accountSecurity.ts
- `removeBlockedPattern` mutation — uses `eq(blockedPatterns.id, input.id)` with no tenantId scope; blocked patterns appear to be global admin-owned records but the WHERE clause has no secondary isolation guard (line 125)

#### users.ts (admin)
- `get` procedure — selects `db.select()` (all columns including `twoFactorSecret`, `recoveryCodes`, `passwordHash`) from `users` table; response mapping (lines 154-178) manually strips them, but `select()` without explicit column list is a risk if mapping code is ever modified

### Feature 045 — Celery JWT Refactor (Node.js side) — 2026-03-16

#### automationCopilot.ts
- CLEAN on the `user_jwt` removal: `user_id` and `tenant_id` are still sent as trusted server-side values derived from `ctx.user.id` / `ctx.tenantId` (JWT-verified). No client-injectable values.
- `useTemplate` UPDATE (line 430) uses only `eq(automationTemplates.id, input.templateId)` — missing ownership check in the UPDATE WHERE clause (the SELECT above was ownership-scoped, but the UPDATE is not). IDOR: any authenticated user can increment usageCount + lastUsedAt on any template.
- `cancel` mutation sends only `tenant_id` in body to Python; no `user_id` sent. Python cannot verify the user owns the task being cancelled.

#### /api/internal/agency/create (index.ts:734)
- Timing-safe comparison present (crypto.timingSafeEqual) — CORRECT.
- BUT: length check is done as a pre-condition, which itself leaks whether the candidate token has the right length. The sibling endpoint `presentationImportCallback.ts` does the length check INSIDE the timingSafeEqual guard (checks length-mismatch only as a guard before calling the C-level comparator). Both are acceptable — timing difference on length is negligible — but the pattern is inconsistent.
- X-User-Id validated: `userId > 0` with `parseInt(userIdHeader, 10)` — NaN case is handled (NaN > 0 is false). Integer-only, positive check present. SUFFICIENT.
- `currentTenantId: null` in the minimal user object: tenantId resolved from `req.body.tenantId` first, no DB lookup to verify the user actually belongs to that tenantId. This allows a compromised Python process to create agencies under any tenantId for the given userId. HIGH risk if Python is compromised, LOW risk in normal operation.
- No Zod validation on the request body. `name`, `agents`, `communicationFlows` are type-asserted via `as { ... }`. Individual fields are String()-coerced and sliced, which limits injection, but no schema-level rejection of malformed payloads.
- Nginx does NOT block `/api/internal/` — only `/internal/` (without the `/api/` prefix) is blocked at lines 252-256 and 502-506. The `/api/internal/agency/create` endpoint is reachable from the public internet if Nginx forwards `/api/` to `backend_host`, EXCEPT the Nginx `/api/` block routes to `backend_host` (Python :8000), not `web_host` (Node :3000). The agency/create endpoint on Node :3000 is only reachable via the catch-all `/` location, which does reach `web_host`. So the endpoint IS externally reachable — only token auth protects it.
- Inconsistency: sibling `/api/internal/credits/charge` and other internal endpoints use non-timing-safe `token !== ENV.webGatewayToken` string comparison. The new agency/create endpoint is BETTER than its siblings in this regard.

### Feature 046 — Virtual Admin Agent (tRPC layer) — 2026-03-18

#### virtualAdmin.ts (all 14 endpoints)
- `getIncident` (line 50): IDOR — fetches by id only, no tenantId filter. Exposes full incident + approvals to any admin.
- `acknowledgeIncident` (line 72): IDOR — UPDATE scoped only to input.id, no tenantId isolation.
- `resolveIncident` (line 86): IDOR — same as acknowledgeIncident; ctx.user.id goes into resolvedBy but WHERE clause has no tenantId guard.
- `listPendingApprovals` (line 106): IDOR — queries virtualAdminApprovals with no tenant filter; enrichment join also unscoped. Cross-tenant approval visibility.
- `decideApproval` delegates to `actuatorRegistry.decideApproval()` which scopes only to `approvalId + status=pending` — no tenantId check. Any admin can approve/reject any tenant's approvals (line 101 actuatorRegistry.ts).
- `listIncidents` (line 31): conditional tenantId (`if (ctx.tenantId)`) — null tenantId dumps all incidents. Same pattern in `getDashboardStats` (line 212) and `getSettings` (line 268).
- `updateSettings` (line 287): key validated only by startsWith("VIRTUAL_ADMIN_") prefix — no allowlist. Allows arbitrary key pollution.
- `updateSensorConfig` (line 169): sensorId has no max-length or charset constraint; thresholdsJson accepts unbounded z.record(z.unknown()).
- `resolveIncident` comment field (line 87): not sanitized (unlike feedback.ts strings); stored into actionResult, potential XSS if rendered in browser.

#### feedback.ts (7 endpoints)
- `getTicket` (line 110): IDOR — fetches by id only, no tenantId filter.
- `addComment` (line 133): IDOR — inserts comment and updates feedbackTickets.respondedAt without verifying ticket belongs to caller's tenant.
- `updateStatus` (line 165): IDOR — UPDATE on feedbackTickets scoped only to input.ticketId.
- `list` (line 96): conditional tenantId — null dump risk. Same in `stats` (line 204).
- `myTickets` (line 74): filters only by submittedBy, no tenantId — cross-tenant read if userId is global.
- `contextJson` (line 34): z.record(z.unknown()) with no depth/size limit — storage DoS risk.

#### trpc.ts + sdk.ts — system_agent role
- CRITICAL: adminProcedure/domainAdminProcedure accept role=system_agent as equivalent to admin (trpc.ts:36, 71, 84). system_agent JWT is signed with the same ENV.cookieSecret as all user sessions. No separate secret, no aud/iss claims, no short expiry enforced. Any actor who compromises or forges this secret gains full admin on all tenants.
- system_agent JWT accepted via public Authorization: Bearer header — no internal-channel restriction (sdk.ts:266-269).
- authenticateRequest resolves system user via db.getUserById(-1) but doesn't re-verify DB row's role matches system_agent; tampered DB row could yield unexpected role in tRPC context (sdk.ts:278-281).

### Feature (Virtual AI Office Orchestrator) — tRPC layer — 2026-03-18

#### teamRun.ts — IDOR (no tenant isolation on run lifecycle)
- `start` (line 29): `runEngine.startRun` loads room by `roomId` only (`eq(teamRooms.id, input.roomId)`) — no tenantId check. Any authenticated user can start a run in any tenant's room.
- `pause` (line 38): calls `runEngine.pauseRun(input.runId)` — no ctx passed, no tenantId/userId check. Any authenticated user can pause any run.
- `resume` (line 44): same as pause — no ownership check at router or service layer.
- `stop` (line 51): same as pause/resume — no ownership check at router or service layer.
- `get` (line 58): calls `runEngine.getRun(input.runId)` — no tenantId filter, exposes full run record including objective, budget snapshot, and stop policy to any authenticated user.
- `runEngine.pauseRun/resumeRun/stopRun/getRun` service functions (runEngine.ts:233-361): all use `eq(teamRuns.id, runId)` only, no tenantId in WHERE.

#### teamRoom.ts — Missing tenant isolation on sendMessage and getMessages
- `sendMessage` (line 39): passes `roomId` to `roomService.sendMessage` without verifying the room belongs to `ctx.tenantId`. Participant check (line 163-177 of roomService.ts) verifies the user is a participant of the room but does NOT verify the room belongs to caller's tenant. A user who is a participant in room X can send messages to it even if X was created under a different tenant.
- `getMessages` (line 57): router handler (`{ input }`) does not destructure `ctx` at all — `ctx.tenantId` is never passed. Service `getMessages` queries `teamRoomMessages` filtered only by `roomId` (roomService.ts:235-245), no tenant filter. Any authenticated user can read all messages of any room if they know the `roomId`.

#### scopedMemory.ts — Pervasive IDOR across all 5 write/read paths
- `get` (line 51): calls `memoryService.getMemory(memoryId)` — scopedMemoryService.ts:93-104 queries by `eq(scopedMemories.id, memoryId)` only. No tenantId/userId check. Cross-tenant memory read.
- `update` (line 58): calls `memoryService.updateMemory(memoryId, updates)` — service issues `UPDATE ... WHERE id = memoryId` (scopedMemoryService.ts:113-119). No tenantId/userId check. Cross-tenant memory overwrite.
- `delete` (line 73): calls `memoryService.deleteMemory(memoryId)` — service issues `DELETE ... WHERE id = memoryId` (scopedMemoryService.ts:122-131). No tenantId/userId check. Any user can delete any tenant's memory record.
- `promote` (line 81): calls `memoryService.promoteMemory` — service reads memory by id (no tenant check), then UPDATEs ownerType/ownerId (scopedMemoryService.ts:149-170). Any user can reassign any memory to any owner including cross-tenant targets.
- `search` (line 33): passes caller-supplied `scopes` array directly to service — no verification that the scope IDs (teamId, roomId, agentId, etc.) belong to `ctx.tenantId`. A user can enumerate memories from other tenants' teams/rooms by supplying foreign scope IDs. No tenantId injected.
- `create` (line 12): passes caller-supplied `ownerType` + `ownerId` — no verification the `ownerId` (a teamId, roomId, etc.) belongs to `ctx.tenantId`. A user can create memories scoped to another tenant's resources.

#### monitoring.ts — IDOR on all 3 run-scoped endpoints
- `getRunEvents` (line 12): calls `monitoringService.getRunEvents(input.runId)` — service queries `agentActivityEvents WHERE runId = runId` (monitoringService.ts:177-183), no tenantId check. All activity events (including `private_internal` visibility events) for any run are accessible to any authenticated user.
- `captureSnapshot` (line 21): calls `monitoringService.captureSnapshot(input.runId)` — service loads run by id only (no tenantId), then writes a snapshot (monitoringService.ts:84-125). Any user can trigger and read snapshots of another tenant's run, including per-agent budget data.
- `checkStuck` (line 27): calls `monitoringService.checkStuckAgent(input.runId)` — service loads run by id only (monitoringService.ts:134-166). Exposes `activeAssistantId` and timing data cross-tenant.

#### team.ts — Missing ownership check on archive and updateMember
- `archive` (line 86): passes `(teamId, tenantId)` to `teamService.archiveTeam`. Service checks tenantId correctly on SELECT but the final UPDATE uses `eq(assistantTeams.id, teamId)` only (teamService.ts:388-398) — missing tenantId in the UPDATE WHERE clause. An attacker who races between the SELECT and UPDATE, or who exploits the single-clause UPDATE directly (the service trusts the SELECT), could archive another tenant's team if the guard SELECT were bypassed.
- `updateMember` (line 94): service validates profileId+tenantId on SELECT (teamService.ts:297-306), but the UPDATE on `assistantProfiles` (line 330-333) uses `eq(assistantProfiles.id, profileId)` only — missing tenantId in UPDATE WHERE. The `agencyAgents` UPDATE (line 340-344) uses `eq(agencyAgents.id, profile.agencyAgentId)` only — no tenantId guard possible since `agencyAgents` table has no tenantId column, but the missing guard on `assistantProfiles` UPDATE is a TOCTOU risk.
- `archive` also scoped: missing userId check — any tenant member (not just the owner) can archive any team in the same tenant.

#### teamRun.ts — Missing rate limiting on start mutation
- `start` mutation triggers a run that spawns LLM calls and accrues credits (budget up to maxBudgetCredits). No rate limiter middleware is applied before the mutation. A user can repeatedly call `start` to exhaust credits or flood the run queue.

### Feature 047 — Virtual AI Office Orchestrator (tRPC + SSE layer) — 2026-03-18 FULL AUDIT

#### resolveTenantIdVarchar(ctx) — CRITICAL CALLING CONVENTION BUG (5 routers affected)
- ALL new Feature 047 routers call `resolveTenantIdVarchar(ctx)` — passes full context object
- Function signature requires `(ctxTenantId: unknown, userCurrentTenantId: unknown)` — object → null; undefined → null → always returns null
- In runEngine.ts `loadRunWithTenantCheck` (line 267): `if (tenantId)` guard skipped when null → entire tenant isolation bypassed for pause/resume/stop/get run operations
- In other services: `eq(column, null)` generates `column = NULL` SQL (always false) → NOT_FOUND errors rather than data leaks — but the isolation is broken and future code could be deceived
- Fix: change all `resolveTenantIdVarchar(ctx)` calls to `resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId)` in: teamRoom.ts, teamRun.ts, monitoring.ts, scopedMemory.ts, team.ts

#### orchestratorStream.ts — SSE endpoint IDOR
- `/run/:runId` (line 160): no ownership check — any authenticated user subscribes to any run's events including `private_internal` messages
- `/team/:teamId` (line 169): no team ownership check — cross-tenant team event access
- `replayMissedEvents` (line 58): queries `agentActivityEvents WHERE runId = runId AND createdAt > lastEvent.createdAt` — no tenantId filter; all historical events replayed cross-tenant
- `lastEventId` (line 165): accepted as raw string from query param, used in DB lookup with no UUID format validation

#### persona.ts / personaService.ts — UPDATE IDOR
- `update` router (line 176): RBAC check reads existing persona (ownership check by scope), but then calls `updatePersona(id, updateData)` where service issues `UPDATE ... WHERE id = id` only — no tenantId in WHERE clause. Domain admin who passes RBAC check can update any tenant-scope persona by UUID.

#### help.ts / helpContentService.ts — Path Traversal
- `getTopic` (help.ts line 23): `slug: z.string().min(1).max(100)` — no path component validation
- helpContentService.ts line 270: `path.join(localeDir, ${slug}.md)` — slug with `../` sequences traverses outside `docs/help/{locale}/` directory
- `publicProcedure` — unauthenticated; no rate limiting
- Attack: `slug = "../../server/_core/env"` → reads `apps/web/server/_core/env.md` if it exists; `"../../.env"` → reads `.env` file (if accessible from CWD)

#### summaryService.ts — no tenant isolation on generateSummary
- `generateSummary` (line 90): loads run by id only (`eq(teamRuns.id, input.runId)`) — no tenantId WHERE condition
- Called internally from `runEngine.stopRun` (safe: receives correct runId from verified run)
- Called via `teamOrchestrationBridge.generateSummary` which may not pass tenantId
- Risk is LOW for direct exploitation but exposes cross-tenant run data if bridge is called with unverified runId

#### systemUser.ts — long-lived system_agent JWT
- `getSystemUserToken` (line 57): 365-day expiry, same `ENV.cookieSecret` as all user JWTs
- No revocation: if token leaks (e.g., audit log, error message), it grants system_agent (= full admin) access for up to 1 year
- No separate secret or aud/iss claims distinguishing it from normal user JWTs

#### teamRun.ts `start` — missing rate limit (carried forward)
- Confirmed: no `.use(rateLimitMiddleware)` in the `start` mutation chain
- Spawns LLM calls + Celery tasks that charge credits; no per-user or per-tenant frequency cap

### Feature 048 — Invite Code + Registration System — Round 4 Final Audit 2026-03-19

#### FIXED in earlier rounds (verified clean in Round 4)
- IC01: rate limit on validate — FIXED
- IC02: open-mode invalid code blocks registration — FIXED (allows registration, ignores code)
- IC03/IC12: cookie Secure flag — FIXED (clearCookie now has `secure: true`)
- IC04/IC05/R3-01: IDOR update/delete intra-tenant — FIXED (tenantId in WHERE)
- IC06: self-referral SELECT FOR UPDATE — FIXED (check before increment)
- IC07/NEW-01: credit idempotency existence check — FIXED
- IC08/NEW-02: IP fraud check — FIXED (real IP-based path now exists)
- IC09: Zod regex — FIXED (routers.ts:336)
- IC10: inArray not raw SQL — FIXED
- R3-02: tenant scope on getUsageDetails — FIXED
- R3-03: null tenantId restricts to global codes in validateInviteCode — FIXED
- R3-04: reactivateUser tenant guard in service — FIXED
- R3-05: getUserInviteCode tenant-scoped lookup — FIXED

#### Round 4 findings — FIXED in Round 5 (verified clean 2026-03-19)
- R4-01: `buildTenantScope` helper now handles all role/tenantId combos — null tenantId super-admin gets no filter (global), domain_admin without tenantId gets impossible sentinel. FIXED.
- R4-02: `update`/`delete` now use `buildTenantScope(ctx, "write")` — domain_admin restricted to own tenant codes. Super admin with tenantId can still touch global codes (see R5-02 below — by-design ambiguity). FIXED for domain_admin case.
- R4-03: `giveInviteCodeBonuses` atomic conditional UPDATE with `WHERE creditsGivenToUser = 0 AND creditsGivenToOwner = 0`. PARTIALLY FIXED — see R5-01 for zero-amount edge case.
- R4-04: `reactivateUser` now uses `domainAdminProcedure`. FIXED.
- R4-05: `getMyReferralStats` now pushes tenantId or isNull condition. FIXED.
- R4-06: `oauth.ts` variable shadowing removed — all three vars declared once at outer scope (lines 69-71). FIXED.

#### Round 5 findings — open (2026-03-19)
- **R5-01 MEDIUM**: `giveInviteCodeBonuses` (inviteCodeService.ts:370-371) — when both bonus amounts are 0, in-progress markers are set to `-1`, then final update writes them back to `0`. Second caller arriving after final update sees `creditsGivenToUser = 0` and passes idempotency guard, re-entering the claim path. No actual credits awarded (amounts are 0), but the guard is semantically broken for zero-bonus codes. Fix: use a separate `bonusesProcessed boolean` column, or never write `0` as the final value after claiming — use `-1` permanently when bonus amount was 0.
- **R5-02 LOW**: `buildTenantScope` write mode (inviteCode.ts:64-68) — super admin with non-null tenantId receives `or(own tenant, null)`, giving write access to global codes. May be intentional design. If not, fix: restrict super admin with tenantId to own-tenant codes only in write mode.

#### Structural notes (accepted / by design)
- `validate` reveals code status in error message (expired vs used vs invalid) — mitigated by 15/min rate limit
- `getRegistrationConfig` public, no sensitive data — CLEAN
- `list` ownerEmail exposure — acceptable for admin-only access when tenantId is scoped

### Both API Key Systems Deep Audit — 2026-03-19
See: `feature_api_key_systems_audit.md` for full findings.
Key gaps: no per-user key count cap on System 1 create; no rate limit on tRPC `create` mutation; no brute-force protection on failed validateKey calls; soft-delete only (keyHash persists); no atomic rotate endpoint; no expiry warning; LLM key system lacks admin revocation path and audit logging.

### Feature 048 — Auth Token Storage Hardening — userApiKeys tRPC layer — 2026-03-19

#### userApiKeys.ts + userApiKeyService.ts

##### HIGH findings (must fix before merge)
- **U01 — IDOR (read)**: `getUserApiKeys(userId)` — no tenantId filter. `listKeys` tRPC handler has `ctx.tenantId` available but does not pass it to the service. Latent cross-tenant read if userIds are ever non-globally-unique.
- **U02 — IDOR (delete)**: `deleteUserApiKey(userId, provider)` — no tenantId in WHERE. `deleteKey` router passes only `ctx.user.id`; the `tenantId` column on the row is ignored.

##### MEDIUM findings (should fix before merge)
- **U03 — Missing rate limit on deleteKey**: mutation has no middleware; sibling `setKey` has 10/hour. Three-line fix with `createRateLimitMiddleware`.
- **U08 — Schema cardinality inconsistency**: `tenantId` column stored on insert but unique index is `(userId, provider)` only — upsert silently overwrites keys across tenants for the same user. Must decide: per-user-global or per-user-per-tenant cardinality.

##### LOW / INFO findings
- **U04**: `listKeys` query has no rate limit (LOW).
- **U05**: `createRateLimitMiddleware` keys on IP only, not `userId` — bypassable via rotating-IP VPN (MEDIUM systemic, not router-specific).
- **U06**: `keyHint = apiKey.slice(-4)` — minimum 4-char key yields hint = entire key (LOW).
- **U07**: `providerEnum` static list may drift from LLM router's provider set (LOW).
- **U09**: `decryptUserApiKey` is exported but not wired into any router — confirmed clean; test suite enforces this.
- **U10-U12**: Encryption pattern correct, userId sourced from ctx only, no raw SQL — all clean.

##### Confirmed clean patterns (no action)
- `encrypt(apiKey)` used correctly, `apiKeyEncrypted` never returned in any tRPC response.
- All three procedures use `protectedProcedure`; no public procedure exposure.
- `decryptUserApiKey` not importable from routers (only in services/ + tests/).

#### Post-fix remaining issues (2026-03-19 re-audit)
- **IC07 / NEW-01 (HIGH)**: `giveInviteCodeBonuses` passes `referenceId` to `addCredits`, but the DB unique constraint is on `idempotencyKey`, not `referenceId`. `addCredits` never writes `idempotencyKey`. Duplicate credit rows remain possible on retry/race. Fix: use `idempotencyKey` param in `addCredits` calls, or add unique partial index on `referenceId`.
- **IC11 (MEDIUM)**: `reactivateUser` still scoped only by `eq(users.id, userId)` — no tenantId. Global admin on multi-tenant can reactivate cross-tenant users.
- **NEW-02 (MEDIUM)**: IP fraud check is an else-only fallback (only runs when no fingerprint). IP check and fingerprint check should be independent/cumulative.
- **NEW-03 (MEDIUM)**: `getUsageDetails` adminProcedure returns PII (email, name, isDisabled) for any codeId without verifying the code belongs to the requesting admin.
- **NEW-04 (MEDIUM)**: `getRegistrationConfig` publicProcedure has no rate limiter. Reveals invite_only mode and enabled OAuth providers.
- **NEW-05 (LOW)**: `oauth.ts` declares `ipAddress` twice — once inside `if (isNewUser)` block (line 95) and once at outer scope (line 116). Identical expressions, maintenance hazard.

#### Feature 048 Round 3 — remaining/new issues (2026-03-19 final audit)
VERIFIED FIXED (do not re-flag):
- IC02 (open mode invalid code blocking registration) — FIXED: `checkRegistrationAllowed` returns `allowed:true` on invalid code in open mode
- IC06 (IP fraud check else-only) — FIXED: IP check runs independently via separate `if(ipAddress)` block
- IC07 (idempotency check broken) — FIXED: `giveInviteCodeBonuses` checks existing usage record AND `creditsGivenToUser/Owner > 0` before awarding; `addCredits` called with `referenceId` for deduplication at the credit layer
- IC08 (self-referral increment before check) — FIXED: SELECT FOR UPDATE before any increment, self-referral check before UPDATE
- IC09 (missing inviteCode regex in register) — FIXED
- IC10 (inArray raw SQL) — FIXED
- IC11 (reactivateUser no tenantId) — PARTIALLY FIXED: guard present but both sides nullable; null adminTenantId bypasses check
- IC12 (invite_code cookie missing Secure) — FIXED: clearCookie now includes `secure:true, sameSite:"lax"`
- NEW-02 (IP check fallback only) — FIXED: now independent if-blocks

REMAINING ISSUES (Round 3):
- **R3-01 (HIGH)**: `inviteCode.ts:282` — `update` mutation SELECT verifies tenant, but UPDATE WHERE is `eq(inviteCodes.id, id)` only. Tenant conditions not carried into UPDATE WHERE. TOCTOU: concurrent row reassignment could allow cross-tenant update between SELECT and UPDATE. Fix: `and(eq(inviteCodes.id, id), or(eq(inviteCodes.tenantId, ctx.tenantId), isNull(inviteCodes.tenantId)))`.
- **R3-02 (HIGH)**: `inviteCode.ts:321` — `getUsageDetails` queries by `codeId` only, no tenant scope. Admin from tenant A can read usage PII (name, email, disabled status) for any other tenant's invite code. Fix: add tenant condition to WHERE clause joining through inviteCodes.tenantId.
- **R3-03 (MEDIUM)**: `inviteCodeService.ts:114` — `validateInviteCode`: when `tenantId` arg is null/falsy, the entire tenant-scope filter is skipped. Public `validate` endpoint passes `ctx.tenantId` which can be null on single-tenant or unauthenticated context → all codes across all tenants are queryable. Fix: always apply the filter; when tenantId is null use `isNull(inviteCodes.tenantId)` to restrict to global-only codes.
- **R3-04 (MEDIUM)**: `inactiveUserService.ts:144` — `reactivateUser` tenant guard: `if (adminTenantId && user.currentTenantId && ...)` — both operands nullable. When adminTenantId is null (super-admin) the check is entirely skipped; also UPDATE WHERE uses `eq(users.id, userId)` only. Impact: any admin with null tenantId reactivates cross-tenant users silently. Fix: reject when `!adminTenantId && !isSuperAdmin` or harden both nullable sides.
- **R3-05 (LOW)**: `inviteCodeService.ts:441` — `getUserInviteCode` SELECT queries by `ownerId + type="user"` only, no tenantId filter. A user with the same userId across tenants always gets back the first code created regardless of tenant context. Fix: add `and(eq(inviteCodes.tenantId, tenantId))` or `or(..., isNull(...))` to the WHERE clause.
- **R3-06 (LOW)**: `inactiveUserService.ts:63` — `checkAndDisableInactiveUsers` INNER JOIN on inviteCodes does not filter by `inviteCodes.tenantId`. On multi-tenant, a user in tenant A referred by an admin code from tenant B is subject to tenant B's inactive-disable logic. Fix: add tenantId scoping on the joined inviteCodes row, or remove the join and use a subquery scoped per tenant.

#### systemSettings.ts updateRegistrationSettings
- `allowedAuthMethods` (line 1018): Validated as `z.array(z.enum(["email", "google", "github"])).min(1)` — CLEAN (cannot disable all auth methods).
- No tenantId isolation on `systemSettings` mutations — consistent with existing pattern (global settings); acceptable given `adminProcedure` guard.

## Files Audited (Full Scan — 2026-03-16 + Feature 047 2026-03-18)
- `apps/web/server/routers/credits.ts` — CLEAN
- `apps/web/server/routers/users.ts` — partial secret exposure risk on admin `get`
- `apps/web/server/routers/llmProviders.ts` — CLEAN (no key returned, SSRF guard present)
- `apps/web/server/routers/apiKeys.ts` — CLEAN (assertKeyOwnership helper used consistently)
- `apps/web/server/routers/media.ts` — CLEAN (protectedProcedure throughout, rate limited)
- `apps/web/server/routers/chat.ts` — CLEAN (all service calls pass ctx.user.id)
- `apps/web/server/routers/artifact.ts` — CLEAN (ownership via service layer)
- `apps/web/server/routers/videoEditorProjects.ts` — CLEAN (and() + userId on all mutations)
- `apps/web/server/routers/usage.ts` — CLEAN (ownership check on getTransactionPayload)
- `apps/web/server/routers/audit.ts` — CLEAN (adminProcedure throughout)
- `apps/web/server/routers/accountSecurity.ts` — minor: removeBlockedPattern no tenantId scope
- `apps/web/server/routers/systemSettings.ts` — CLEAN (adminProcedure/domainAdminProcedure)
- `apps/web/server/routers/library.ts` — CLEAN (resolveLibraryTenantId + service-layer ownership)
- `apps/web/server/routers/agency.ts` — CLEAN (tenantId-scoped + ownership checks)
- `apps/web/server/routers/scheduledMessages.ts` — IDOR on getAnalytics scheduleId
- `apps/web/server/routers/mediaJobs.ts` — CLEAN (meta.userId ownership on getStatus/cancelJob)
- `apps/web/server/routers/presentation.ts` — service-layer ownership (not directly verified)
- `apps/web/server/routers/googleDrive.ts` — previously audited (see above)
- `apps/web/server/routers/oneDrive.ts` — previously audited (see above)
- `apps/web/server/_core/env.ts` — VITE_ fallback reads (MEDIUM risk)
- `apps/web/server/routers/inviteCode.ts` — re-audited 2026-03-19: IC01/IC04/IC05 fixed; getUsageDetails PII risk (NEW-03); getRegistrationConfig no rate limit (NEW-04)
- `apps/web/server/services/inviteCodeService.ts` — re-audited 2026-03-19: IC02/IC06/IC08 fixed; idempotency still broken (IC07/NEW-01); IP check is fallback-only (NEW-02)
- `apps/web/server/services/inactiveUserService.ts` — re-audited 2026-03-19: IC10 fixed (inArray); IC11 still open (reactivateUser no tenantId)
- `apps/web/server/_core/oauth.ts` — re-audited 2026-03-19: IC12 fixed (cookie Secure+sameSite match); ipAddress double-declaration (NEW-05)
- `apps/web/server/routers/systemSettings.ts` (lines 968-1090) — CLEAN on new registration settings block (2026-03-19)
- `apps/web/server/routers/virtualAdmin.ts` — IDOR on all 5 ID-scoped endpoints; null-tenantId dumps; settings key pollution; unbounded inputs (2026-03-18)
- `apps/web/server/routers/feedback.ts` — IDOR on getTicket/addComment/updateStatus; null-tenantId list/stats; missing tenantId on myTickets (2026-03-18)
- `apps/web/server/_core/trpc.ts` — system_agent role added to admin/domainAdmin procedures; same-secret risk (2026-03-18)
- `apps/web/server/_core/sdk.ts` — system_agent JWT path; public Bearer acceptance; DB-role not re-verified (2026-03-18)
- `apps/web/server/services/virtualAdmin/actuatorRegistry.ts` — decideApproval no tenantId scoping (2026-03-18)
- `apps/web/server/routers/team.ts` — archive/updateMember UPDATE WHERE missing tenantId; archive missing ownerUserId check (2026-03-18)
- `apps/web/server/routers/teamRoom.ts` — sendMessage no tenant verification; getMessages ctx not used (2026-03-18)
- `apps/web/server/routers/teamRun.ts` — all 5 procedures have no tenantId/userId isolation; start missing rate limit (2026-03-18)
- `apps/web/server/routers/scopedMemory.ts` — get/update/delete/promote/search/create all missing tenant isolation (2026-03-18)
- `apps/web/server/routers/monitoring.ts` — getRunEvents/captureSnapshot/checkStuck missing tenantId isolation (2026-03-18)
- `apps/web/server/services/teamService.ts` — archiveTeam UPDATE missing tenantId; updateTeamMember UPDATE missing tenantId (2026-03-18)
- `apps/web/server/services/roomService.ts` — sendMessage participant check no tenantId; getMessages no tenantId (2026-03-18)
- `apps/web/server/services/runEngine.ts` — startRun loads room with no tenantId; pause/resume/stop/get all id-only (2026-03-18)
- `apps/web/server/services/scopedMemoryService.ts` — getMemory/updateMemory/deleteMemory/promoteMemory all id-only (2026-03-18)
- `apps/web/server/services/monitoringService.ts` — CLEAN after resolveTenantIdVarchar fix; captureSnapshot/checkStuckAgent use INNER JOIN on teamRooms for tenantId isolation (2026-03-18)
- `apps/web/server/routers/persona.ts` — update calls updatePersona with id-only WHERE in service layer (2026-03-18)
- `apps/web/server/routers/help.ts` — slug path traversal (publicProcedure, unauthenticated) (2026-03-18)
- `apps/web/server/routers/queues.ts` — CLEAN (adminProcedure throughout) (2026-03-18)
- `apps/web/server/routes/orchestratorStream.ts` — SSE IDOR on run/team channels; replay no tenantId; lastEventId unvalidated (2026-03-18)
- `apps/web/server/services/personaService.ts` — updatePersona WHERE id-only (2026-03-18)
- `apps/web/server/services/interAgentService.ts` — CLEAN (tenantId always from trusted server context) (2026-03-18)
- `apps/web/server/services/orchestratorEventBus.ts` — CLEAN (publish-only) (2026-03-18)
- `apps/web/server/services/orchestratorNotificationService.ts` — CLEAN (userId+tenantId scoped) (2026-03-18)
- `apps/web/server/services/helpContentService.ts` — path traversal via slug (2026-03-18)
- `apps/web/server/services/helpContextInjector.ts` — CLEAN (read-only, no user-controlled DB ops) (2026-03-18)
- `apps/web/server/services/queueHealthMonitor.ts` — CLEAN (admin-only, system monitoring) (2026-03-18)
- `apps/web/server/services/summaryService.ts` — generateSummary loads run by id-only, no tenantId (2026-03-18)
- `apps/web/server/services/jobAutomationService.ts` — CLEAN (tenantId/userId properly scoped) (2026-03-18)
- `apps/web/server/services/virtualAdmin/systemUser.ts` — 1-year JWT expiry; same secret as user sessions (2026-03-18)
- `apps/web/server/services/agencyPreviewService.ts` — CLEAN (pure transformation, no DB ops) (2026-03-18)
- `apps/web/server/services/agencyResultRouter.ts` — CLEAN (pure routing logic) (2026-03-18)
- `apps/web/server/services/promptComposer.ts` — CLEAN (tenantId from profile.tenantId, not user input) (2026-03-18)
- `apps/web/server/_core/llmRoutes.ts` — CLEAN (auth via authorizeRequest, rate limited) (2026-03-18)
- Feature 049 (notification system) — see `feature_049_notification_system_audit.md` for full findings (2026-03-21)
