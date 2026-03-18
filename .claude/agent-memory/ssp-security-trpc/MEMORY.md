# CMD-6 tRPC Security Auditor — Persistent Memory

## Project Security Conventions

### Auth & Tenant Isolation Pattern
- All tRPC procedures use `protectedProcedure` from `../_core/trpc` (enforces JWT auth)
- Tenant isolation uses `ctx.tenantId` and `ctx.user.id` (both from JWT)
- Standard WHERE clause for tenant-scoped mutations:
  `and(eq(table.id, input.id), eq(table.tenantId, ctx.tenantId), eq(table.ownerUserId, ctx.user.id))`
- `resolveLibraryTenantId()` helper used in both gdrive and onedrive routers

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

## Files Audited (Full Scan — 2026-03-16)
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
- `apps/web/server/services/monitoringService.ts` — getRunEvents/captureSnapshot/checkStuckAgent all id-only (2026-03-18)
