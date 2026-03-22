# SmartSpecPro Research Agent Memory

## Agency Node Types & Skill System Gaps (2026-03-22)

### Status: RESEARCH COMPLETE — 8 existing types, 10 critical gaps, skill integration issues

**Research Documents:**
- `AGENCY-NODE-TYPES-RESEARCH-BRIEF.md` (executive summary, findings, risks, options, recommendations)
- `AGENCY-NODE-TYPES-GAP-ANALYSIS.md` (detailed audit of each node type, 300+ lines)
- `AGENCY-NODE-TYPES-VISUAL-SUMMARY.md` (diagrams, execution flows, capability matrix)

**Executive Summary:**
- **8 existing node types:** Agent, Supervisor (non-functional), Router (binary only), Aggregator, Knowledge Base, Skill Call, Human Approval, Browser Session
- **10 critical gaps:** Conditional Branch, Parallel Fan-Out, Loop/Retry, Data Transform, Timer/Delay, Memory/State, Webhook Trigger, Code Execution, HTTP API Call, Error Handler
- **Skill integration issue:** skill_call node has static input mapping; skill input.schema.json ignored; all skills receive full context with no field-level routing
- **Architecture:** Extensible DB schema + orchestrator (no blockers), Python backend can add new node types via match statement
- **Recommendation:** Implement Phase 1 (Conditional + Data Transform + skill mapping) in 16-22 hours; validate demand; add remaining 7 in Phases 2-4 on-demand

**Key Findings:**
1. Supervisor node is semantic, not functional (no delegation strategy implemented)
2. Router is binary + sequential (UI shows 3 paths but only 1 executes)
3. Skill system (50+ skills) is not integrated into agency orchestrator (separate detection/routing/chaining systems)
4. ExecutionContext is mutable and extensible (can add state fields easily)
5. No architectural blockers — all new node types can be added incrementally

**Critical Code Locations:**
- Frontend nodes: `apps/web/client/src/components/agency/nodes/*.tsx`
- Orchestrator dispatch: `python-backend/app/services/agency_orchestrator.py` line 164 (_execute_node match statement)
- DB schema: `apps/web/drizzle/schema.ts` lines 4650-4703 (agencyAgents.nodeType, nodeConfig)
- Node type list: `apps/web/client/src/components/agency/AgencySidebar.tsx` lines 18-107

**Effort Estimates:**
- Phase 1: Conditional Branch (12-16h) + Data Transform (6-8h) + Skill Mapping (4-6h) = **22-30 hours**
- Phase 2: Parallel Fan-Out (8-10h) + Loop/Retry (10-14h) = **18-24 hours**
- Phase 3: Code Execution (10-14h) + HTTP API (8-10h) + Sub-Agency (3-4h) = **21-28 hours**
- Phase 4: Memory/State (12-16h) + Timer (8-12h) + Webhook (10-14h) + Error Handler (8-12h) = **38-54 hours**

---

## Agency Tools System (2026-03-22)

### Status: RESEARCH COMPLETE — 16 builtin tools, hybrid HTTP+native execution, gaps vs. full tool system

**Research Documents:**
- `AGENCY-TOOLS-SYSTEM-RESEARCH.md` (comprehensive audit, 300+ lines)
- `AGENCY-TOOLS-QUICK-REF.md` (quick lookup tables, tool routers, code locations)

**Executive Summary:**
- **16 builtin tools:** hardcoded in Node.js, 10 in frontend list + 6 backend-only, 1 missing
- **Tool execution:** HTTP wrappers (most) + native agency-swarm (`builtin-present-files`) + async internal (`builtin-agency-call`)
- **Risk routing:** LOW (always allowed) → HTTP, MEDIUM (whitelist check) → HTTP, HIGH (whitelist + approval) → sandbox
- **Tool assignment:** Pre-assigned per agent via `agency_agent_tools` table, not dynamic function calling
- **Custom tools:** Supported in DB (`agency_tools`) but NO creation UI — must insert directly
- **Gaps vs. BaseTool:** No input validation, no composition, no async continuation, fixed timeouts (30s HTTP, 60s sandbox)
- **DB schema:** `agencyAgentTools.toolId` is varchar(100), not FK — allows both builtin strings and custom UUIDs
- **Tool config merging:** Base config from `agency_tools.config` + instance override from `agency_agent_tools.toolConfig`

**Key Findings:**
1. Tools are metadata + HTTP bridges — Python wrapper routes queries to Node.js internal endpoints
2. Tool resolution happens at agent load time via `resolve_tools_for_agent()` (LEFT JOIN + merge configs)
3. Agent-swarm provides function calling; agents don't dynamically select tools, they get pre-assigned list
4. Whitelist enforcement at risk level (medium/high tools blocked if not in agency whitelist)
5. SSRF protection on HTTP execution; sandbox dispatch for high-risk tools

**Critical Code Locations:**
- Frontend tools list: `apps/web/server/routers/agency.ts` lines 354-631 (`listTools` procedure)
- Tool picker UI: `apps/web/client/src/components/agency/ToolPicker.tsx` (2-step flow)
- DB schemas: `apps/web/drizzle/schema.ts` lines 4764-4814 (`agency_tools`, `agency_agent_tools`)
- Tool bridge creation: `python-backend/app/services/agency_tools.py` lines 307-349, 352-453
- Execution routing: `python-backend/app/services/agency_tools.py` lines 156-241 (`_make_run_func`, `_execute_http`, `_execute_sandbox`)
- Orchestrator integration: `python-backend/app/services/agency_orchestrator.py` lines 268-279

---

## AI Agency Creator — Complete Data Flow (2026-03-22)

### Status: RESEARCH COMPLETE — 7-phase pipeline from user description to canvas

**Research Documents:**
- `AI-AGENCY-CREATOR-RESEARCH-BRIEF.md` (executive summary, findings, risks, options, recommendations)
- `AI-AGENCY-CREATOR-FLOW.md` (comprehensive detailed flow, 500+ lines)
- `AI-AGENCY-CREATOR-QUICK-REF.md` (quick lookup tables)
- `AI-AGENCY-CREATOR-FILE-MAP.md` (all files + line numbers)
- `AI-AGENCY-CREATOR-VISUAL-DIAGRAMS.md` (ASCII diagrams, state machines, flows)

**Executive Summary:**
- **7-phase pipeline**: DISCOVER → INTERVIEW → DESIGN → VALIDATE → IMPLEMENT → VERIFY → DOCUMENT
- **Two Celery tasks**: Task 1 (discover + interview, can pause for user input) + Task 2 (design → document)
- **Redis-based status**: Key `agency-creator:{task_id}`, TTL 2h, user_id enforced
- **Frontend polling**: Every 2.5s, max 5 minutes, graceful timeout
- **Canvas hydration**: Agents → ReactFlow nodes, flows → edges, auto-layout if needed
- **LLM-driven architecture**: 3 LLM calls (discover, design, document) with structured JSON outputs
- **Tool assignment**: LLM selects from 10 builtin tools based on agent role
- **Validation**: Self-review in Phase 4 (entry point, node refs, router config, tool IDs)

**Key Flows:**
1. User enters requirement → tRPC autoCreate → Python /api/v1/agency-creator/start → Celery Task 1
2. Task 1: DISCOVER (LLM analysis) → decide if interview needed
3. If interview: status → awaiting_answers, questions returned to frontend
4. User answers → tRPC autoCreateAnswer → Python /answer → Celery Task 2 dispatched
5. Task 2: DESIGN (LLM spec) → VALIDATE (self-review) → IMPLEMENT (call internal API) → DOCUMENT (guide)
6. Frontend polls autoCreateStatus every 2.5s, sees phase progression
7. On completion: navigate to /agencies/{agencyId}/edit
8. AgencyBuilder fetches full agency, hydrates ReactFlow canvas

**Critical Code Locations:**
- Frontend modal: `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` (448 lines)
- tRPC procedures: `apps/web/server/routers/agency.ts` lines 2260-2362
- Celery tasks: `python-backend/app/tasks/agency_creator_task.py` (661 lines)
- FastAPI endpoints: `python-backend/app/api/agency_creator.py` (164 lines)
- Canvas hydration: `apps/web/client/src/pages/AgencyBuilder.tsx` lines 247-323

**Insights:**
- No SSE/WebSocket needed; simple polling works because operation is ~30-90s max
- Redis prevents DB round-trips during rapid polling
- Fallback spec (single-agent minimal) used if LLM fails, task still completes
- Tool IDs filtered through whitelist in validation (no injection risk)
- Rate limited to 5 creates per minute per user

---

## Team Room Skill Selection Architecture (2026-03-21)

### Status: RESEARCH COMPLETE — Skill selection is intent-driven, not persona-driven

**Research:** `TEAM-ROOM-SKILL-SELECTION-FLOW.md` (comprehensive, 400+ lines)

**Executive Summary:**
- **Skill selection is INTENT-DRIVEN** — Based solely on message content via `detectSkill()` + confidence thresholds
- **Persona provides context, NOT routing** — Personas shape LLM response but don't affect which skill is selected
- **No team/room configuration influence** — `teamRooms` and `teamRoomParticipants` schemas have NO skill-related fields
- **Fallback is hardcoded** — When confidence < 0.6 (assistant) or < 0.7 (human), always uses `"general-article-writer"`
- **No language awareness** — `assistantProfiles.preferredLanguage` is context-only, doesn't filter skills

**Key Flow:**
1. `runEngine.ts:runNextTurn()` → Load assistant + persona context
2. `roomIntentRouter.ts:routeRoomIntent()` → Detect intent (chat/skill/agency)
3. `skillDetector.ts:detectSkill()` → Match triggers in message (confidence >= 0.6 for assistant, 0.7 for human)
4. `teamRunSkillExecutor.ts:executeTeamRunSkillTurn()` → Execute skill with persona context injected as system prompt
5. `turnOrderEngine.ts:getNextSpeaker()` → Route to next agent based on strategy + hints

**Critical Gaps:**
- No conversation-specific skill preferences (can't say "in this room, always use skill X")
- No language-aware skill filtering (Thai-speaking agent still triggers English-named skills)
- No skill eligibility gates (can't mark skills as "team-run only")
- No audit trail of confidence/competing skills (can't debug skill selection)

**Recommendations:**
- Phase 1: Add language parameter to `detectSkill()`, filter by `assistant.preferredLanguage`
- Phase 2: Add room-specific skill preferences (separate table)
- Phase 3: Add `teamRunEligible` flag to skills, implement eligibility checks
- Phase 4: Enhance audit trail in `metadataJson` with confidence/competing skills

---

## Team Room Background Execution & Session Persistence (2026-03-21)

### Status: RESEARCH COMPLETE — Background execution works; summary generation will break in Feature 051

**Research:** `TEAM-ROOM-BACKGROUND-EXECUTION-RESEARCH-BRIEF.md` (comprehensive audit)

**Executive Summary:**
- **Background execution:** OPERATIONAL via in-memory setTimeout timers for auto_team mode; fully independent of browser
- **Process restart:** Recovery mechanism exists (`recoverActiveRunsOnStartup()`) — must be verified in server init
- **Session persistence:** All messages + run state persisted to DB; browser can close and reconnect seamlessly
- **Session history:** MISSING — no tRPC procedure to list past runs; data is in schema but not exposed to UI
- **Summary generation:** Triggered at run end BUT depends on Python bridge (Feature 051 removes it) — BLOCKER
- **Recommendation:** Before Feature 051 merges, replace Python bridge call with local `summaryService.generateSummary()` (2-3 hrs)
- **Key findings:**
  - Auto-advance loop queues turns via `setTimeout()` (not polling/webhooks)
  - Loop continues in background without SSE/client connection
  - Auto-stop checker runs every 30s via `setInterval()`
  - All turn messages stored immediately to `teamRoomMessages`
  - Run state updated to `teamRuns` table (status, budget, timing)
  - Feature 051 must implement Node.js summary replacement before removing bridge

**Gaps Fixed by Feature 051:**
- None (Feature 051 doesn't break background execution structure)

**Gaps Introduced by Feature 051:**
- Summary generation will fail on run completion (Python bridge deleted, no replacement in plan)

**Next steps:**
1. Implement `teamRun.generateSummary` tRPC procedure (on-demand) — part of Feature 051
2. Replace Python bridge call in runEngine.ts with local summaryService — part of Feature 051
3. Implement `teamRoom.listRuns` procedure for session history — separate feature (medium priority)
4. Verify `recoverActiveRunsOnStartup()` called on server init — verify only

---

## Brainstorm Feature → Team Rooms Evolution (2026-03-21)

### Status: RESEARCH COMPLETE — Brainstorm deprecated; 3 extension options analyzed

**Research:** `BRAINSTORM-TO-TEAM-ROOMS-RESEARCH-BRIEF.md` (comprehensive, 300+ lines)

**Executive Summary:**
- **Brainstorm:** Legacy 2-participant debate mode in Chat (deprecated, replaced by Team Rooms)
- **Current:** `/api/llm/brainstorm` returns HTTP 410 GONE; old messages remain readable
- **Design:** Simple turn-taking (A→B→A→B→Summary) vs Team Rooms' complex orchestration (N participants, work items, state machine)
- **3 Options Analyzed:**
  1. "Brainstorm N" — extend to N participants (8-12 hrs, HIGH RISK, will be deprecated again)
  2. "Structured Brainstorm" — hybrid with work items (16-20 hrs, CRITICAL DEBT)
  3. "Migrate to Teams Only" — "Quick Debate" template (6-8 hrs, LOW RISK, RECOMMENDED)
- **Recommendation:** Option 3 — adds `team.quickDebate` procedure + "Start Debate" button in Chat
- **Key difference:** Team Rooms have explicit role system, work item state machine, skill routing; brainstorm had none

**Backward Compatibility:**
- Old brainstorm messages remain readable in `messages` table
- `skillUsed="brainstorm"` + `skillArgs={brainstormRole, brainstormRound}` still in schema
- Credit source type `"brainstorm"` kept for historical queries
- No migration needed; just don't create new brainstorm sessions

**Next steps:**
1. Implement `team.quickDebate` RPC (Phase 1, 6 hrs)
2. Add help docs: teams-brainstorm.md
3. A/B test "Quick Debate" button vs "Use Teams"
4. Decide: sunset brainstorm skill entirely? (probably yes after 6 mo)

---

## Team Room vs Chat System Reusability (2026-03-21)

### Status: PARTIALLY FEASIBLE — Hybrid approach recommended

**Research:** `TEAM-ROOM-CHAT-REUSE-FEASIBILITY.md`

**Verdict:** Can reuse Chat's skill detection, memory system, persona system, and i18n for Team Room. Cannot merge orchestration layers (multi-agent coordination, work item state machine) — keep separate.

**Key Findings:**
- Chat: 1 user + 1 LLM per turn (clean, works well)
- Team Room: N agents + 1 LLM per turn per agent (complex, currently broken)
- Shared infrastructure: skill detection, entity memories, persona prompt injection, i18n
- Unique to Room: agent turn ordering, stop policies, work item state machine
- Root issue: Agents looping + skills not being called + language ignored (not architectural, likely routing bug)
- Fix path: Debug intent routing (Phase 1), add language awareness (Phase 2), integrate memory/persona (Phase 3) = 6-8 hours

**No database merge needed:** Keep `messages` (Chat) and `teamRoomMessages` (Room) separate.

**Next steps:**
1. Add logging to `roomIntentRouter` to verify it's called on agent turns
2. Check if detected skills are executed or routing fails
3. Ensure language parameter flows through to skill detection + agent prompt

---

## Alert & Notification System Audit (2026-03-19)

### Status: GAPS IDENTIFIED — Alerts lack detail for investigation

**START HERE**: `ALERT-NOTIFICATION-SYSTEM-AUDIT.md` (11 sections, comprehensive)

**Executive Summary:**
- **5 notification systems**: Sonner toasts, User notifications, Orchestrator notifications, Guardian alerts, Python backend alerts (unimplemented)
- **Current gap**: No structured metadata. Alerts show title + content only. Frontend hardcodes string matching for action links.
- **Example**: "Media Job Completed" notification doesn't include job ID, duration, cost, or error details. Frontend searches title for "Media Job" to link to generic Media Studio page.
- **Root cause**: `userNotifications` table missing fields: `relatedResourceType`, `relatedResourceId`, `actionUrl`, `metadata` JSON
- **Quick fix**: Add 4 fields to schema, update 30+ `createNotification()` calls, update GlobalNotificationBell to use `actionUrl` instead of string matching
- **Risks**: String matching breaks when titles change (HIGH), users can't search/filter notifications (MEDIUM), Python backend alerts never reach users (MEDIUM)

**Key Files:**
- Frontend component: `apps/web/client/src/components/GlobalAlerts.tsx` (915 lines, 3 sub-components: UrgentAlerts, UrgentReminders, NotificationBell)
- Frontend toast: `apps/web/client/src/components/ui/sonner.tsx` (Sonner library)
- Notification creator: `apps/web/server/services/notificationService.ts` (111 lines, called from 9+ routers)
- DB schema: `apps/web/drizzle/schema.ts` lines 3059-3087 (`userNotifications` table)
- Scheduled messages (persistent alerts): `apps/web/drizzle/schema.ts` lines 2938-3007 + `apps/web/server/routers/scheduledMessages.ts` (600 lines)
- Orchestrator notifications: `apps/web/server/services/orchestratorNotificationService.ts` (Team feature, Feature 044)
- Guardian alerts: `apps/web/server/services/virtualAdmin/notifier.ts` (Multi-channel: in-app, email, Slack, Telegram)
- Python alerts (TODO): `python-backend/app/monitoring/alerts.py` (346 lines, all delivery functions marked TODO)

**Hardcoded String Matching** (brittle):
- Line 731: `if (n.title?.includes("Media Job"))` → shows Media Studio link
- Line 750: `if (n.title?.includes("credit"))` → shows Admin Settings link
- Line 769: `if (n.title?.includes("latency"))` → shows System Guardian link
- Line 788: `if (n.title?.includes("Feedback"))` + regex parse of ticket ID

**Notifications Created By**:
- `pendingApprovalAlert.ts` — Approval notifications
- `follows.ts` — Follow requests
- `mediaJobs.ts` — Media completion (❌ no job ID in notification)
- `workflow.ts` — Workflow completion (❌ no workflow ID)
- `feedback.ts` — Feedback replies (tries to parse ticket ID via regex)
- `skills.ts` — Skill approvals (❌ no skill ID)
- `agency.ts` — Agency publishing (❌ no agency ID)
- `scheduler.ts` — Scheduled message execution (has conversation link)
- `feedbackProcessor.ts` — Guardian incident alerts (has incidentId, ruleId)

**Metadata Schema Needed**:
```typescript
metadata: jsonb("metadata").$type<{
  eventId?: string;
  relatedItems?: { parentWorkflowId?, teamId?, roomId? };
  errorDetails?: { errorCode, errorMessage, stackTrace };
  metrics?: { duration, costUsd, itemCount };
  retryInfo?: { retryCount, maxRetries, nextRetryAt };
}>()
```

**Recommendation**: Phase 1 (immediate): Add 4 fields to schema. Phase 2: Enhanced UI with details panel. Phase 3: Implement Python alert delivery.

---

## Authentication & Token Storage Architecture (2026-03-18)

### Status: RESEARCH COMPLETE — Full Auth Flow, Storage Mechanisms, Security Gaps Identified

**START HERE**: `AUTH-ARCHITECTURE-RESEARCH-BRIEF.md` (40 KB, 9 sections)

**Executive Summary:**
- **Current state**: DUAL ARCHITECTURE — httpOnly session cookies (production) + localStorage JWT fallback (Tauri only)
- **Session cookie**: `app_session_id` (HS256 JWT, httpOnly, 30-day expiry, already secure)
- **localStorage fallback**: `smartspec_auth_token` + `smartspec_user_data` (Tauri fallback only; XSS-vulnerable)
- **API key storage**: `sessionStorage` keys (`smartspec_apikey_openai`, etc.) — **CRITICAL: XSS-vulnerable, has TODO at authService.ts:272**
- **Revocation system**: Redis + in-memory denylist for JTI revocation (logout)
- **Tauri integration**: Fallback chain — try Tauri secure store, then localStorage/sessionStorage

**Key Findings:**
1. ✅ **httpOnly cookies already enforced** — ALL cookies use httpOnly=true
2. ✅ **CSRF protection via SameSite** — "none" for HTTPS, "lax" for HTTP dev
3. ✅ **Token verification** — HS256 HMAC with env.cookieSecret
4. ⚠️ **localStorage still in use** — Should remove; only Tauri needs it
5. ❌ **API keys exposed in sessionStorage** — CRITICAL RISK; needs server-side encrypted storage
6. ❓ **Unclear if JTI revocation actually checked** — Need to verify in verifySession()

**Components Consuming Auth Storage:**
- **No direct localStorage reads** in components (auth via tRPC + useAuth hook)
- **sessionStorage** reads ONLY in authService.ts for API key functions
- **Minimal impact** for migration away from localStorage

**Migration Strategy:**
1. **Phase 1 (High)**: Remove localStorage JWT; keep Tauri path. Migrate API keys to encrypted DB table.
2. **Phase 2 (Medium)**: Verify JTI revocation check; document refresh token usage.
3. **Phase 3 (Future)**: Token rotation; short-lived access + refresh tokens.

**Key Files:**
- Frontend: `apps/web/client/src/services/authService.ts` (320 lines, Tauri fallback)
- Server: `apps/web/server/_core/sdk.ts` (HS256 JWT creation/verification)
- Cookies: `apps/web/server/_core/cookies.ts` (httpOnly, sameSite, secure settings)
- Revocation: `apps/web/server/_core/revocation.ts` (Redis + mem denylist)
- Context: `apps/web/server/_core/context.ts` (token extraction from header/cookie)
- Routers: `apps/web/server/routers.ts:280-325` (login sets cookie)

---

## Document Editor Architecture Audit (2026-03-18)

### Status: AUDIT COMPLETE — Current Editor, DB Schema, Routes, Components Mapped

**START HERE**: `DOCUMENT-EDITOR-ARCHITECTURE-AUDIT.md` (50 KB, 11 sections)

**Quick Summary:**
- **Current editor**: CodeMirror (@uiw/react-codemirror) + marked renderer
- **Architecture**: Split-panel (edit + preview) in DocumentManagement.tsx
- **Storage**: libraryChunks (chunk 0, contentType="markdown_source") + libraryContentVersions (history)
- **Routes**: /document-management with query state (scope, sort, mode, docId)
- **Key operations**: 18 tRPC procedures in library.ts router
- **Markdown rendering**: marked (v16.4.2) + Streamdown + DOMPurify (XSS safe)
- **Media insertion**: Toolbar buttons insert images/videos/audio from library
- **Version history**: Full snapshots, SHA256 dedup, optimistic locking
- **Permissions**: Row-level via libraryPermissions table (read/write/delete/owner)

**Key Files:**
1. Frontend: DocumentManagement.tsx (1800 lines), MarkdownFileEditor.tsx (520 lines), CodeMirrorEditor.tsx (220 lines)
2. Backend: server/routers/library.ts (1500 lines), server/services/libraryService.ts (4500 lines)
3. Schema: libraryItems, libraryChunks, libraryContentVersions, libraryPermissions, libraryIndexJobs
4. Utilities: lib/documentManagementUi.ts (query state), lib/documentManagementTabs.ts (tab mgmt)

**Load-Bearing Constraints (DO NOT BREAK):**
1. libraryChunks chunk 0 contentType="markdown_source" — getLibraryMarkdownContent() reads here
2. libraryContentVersions auto-increment + SHA256 dedup — version history
3. expectedUpdatedAt optimistic locking — prevents concurrent edit conflicts
4. Tenant isolation — all queries filtered by tenantId
5. Re-indexing enqueue — buildLibraryIndexJobPayload() must be called after save
6. Permission checks — canReadLibraryItem() / canManageLibraryItem() are inherited from tRPC

**Tiptap Replacement Plan Notes:**
- New editor must preserve all backend operations (saveLibraryMarkdown, version history, permissions)
- Optional: Store as Tiptap JSON (requires on-read conversion to markdown for legacy)
- Must support: markdown, code files, media insertion, undo/redo, version restore
- Consider: Single-panel WYSIWYG mode vs. keeping split-panel layout

---

## Help System Audit (2026-03-18)

### Status: AUDIT COMPLETE — 31 Topics, 77 Routes, 56% Coverage, 8 Missing Features

**START HERE**: `HELP-SYSTEM-RESEARCH-BRIEF.txt` (2-min executive summary, risks, recommendations)

**Then read in detail**:
1. `HELP-SYSTEM-EXECUTIVE-SUMMARY.md` (4 KB) — Stakeholder overview, costs, success criteria
2. `HELP-SYSTEM-AUDIT-COMPLETE.md` (15 KB) — Comprehensive: all 31 topics, all 77 routes, detailed gaps
3. `HELP-SYSTEM-QUICK-REFERENCE.md` (6 KB) — Fast lookup: create new topic checklist, template, troubleshooting
4. `HELP-SYSTEM-GAPS-VISUAL.md` (8 KB) — Visual breakdown by feature area, roadmap

**Key findings:**
- **31 help topics** (English + Thai paired, auto-discovered from files)
- **77 total routes** (marketing, auth, main, admin, domain-admin)
- **43 routes documented** (56% coverage)
- **34 routes WITHOUT help** (44% gaps)
- **8 NEW FEATURES undocumented**: Teams, Team Rooms, Team Runs, Scoped Memory, Run Monitoring, SSE Streaming, Inter-Agent Communication, Automation Handoffs
- **RED PRIORITY**: Presentation editor, Agency builder, Agency chat, Live automation session (all missing from complex surfaces)

**Implementation roadmap:**
- Phase 1 (3 weeks): 6 Feature 044 topics (BLOCKS release)
- Phase 2 (2 weeks): 4 admin topics + fix broken mappings
- Phase 3 (1 month): Sub-routes + dashboards

**Critical blockers:**
1. Thai translation (requires freelance hire; estimate $400-600 for 14 topics)
2. Content owner assignment (should be primary responsibility)
3. PR review checklist (frontmatter validation)

**Architecture:**
- **Type**: File-based Markdown (zero database overhead, zero code changes needed)
- **Location**: `apps/web/docs/help/{en,th}/*.md` (31 paired files)
- **Service**: `helpContentService.ts` (reads files, parses YAML frontmatter, converts MD→HTML, caches 5-min)
- **Router**: 4 tRPC endpoints (getManifest, getTopic, getSearchIndex, getContextualTopics)
- **Contextual injection**: Via `pages: ["/route1", "/route2"]` frontmatter field (drives dynamic help surfacing)

**Risks & Mitigations:**
- **Risk**: Feature 044 ships without help → **Mitigation**: Make help release requirement
- **Risk**: Thai translation bottleneck → **Mitigation**: Hire freelancer, parallelize
- **Risk**: Page mapping errors → **Mitigation**: Validate frontmatter in PR, test endpoints
- **Risk**: Help drifts from features → **Mitigation**: Update help when UI ships, quarterly audits
- **i18n system**: Dual-locale (English + Thai) with 300+ translation keys for ChatHelpDialog
- **Help router**: 4 endpoints (getManifest, getTopic, getSearchIndex, getContextualTopics) + admin captureScreenshot
- **Help service**: Markdown parser with YAML frontmatter, HTML conversion, 5-min cache TTL
- **Help injector**: Keyword extraction + topic scoring for dynamic LLM context injection
- **Recommendation**: Use Markdown-only (Option A) for new features — searchable, maintainable, avoids i18n duplication
- **Implementation**: 16 new files (8 topics × 2 locales) + _manifest.json update
- **Thai translation**: Required for all new topics; estimate 40-60 hours
- **Quick checklist**: See HELP-SYSTEM-QUICK-REF.md for step-by-step new topic creation

---

## Vector Search Integration Audit — Post-Migration Status (2026-03-18)

### Status: AUDIT COMPLETE — ALL 4 INTEGRATION LAYERS MAPPED
**Research artifact:** VECTOR-SEARCH-INTEGRATION-AUDIT.md
- **Overall status**: 90% compatible with pgvector; 2 cleanup items identified (minimal effort)
- **Safe to use**: YES — all active code paths properly read provider config
- **Critical findings**:
  - Node.js abstraction layer (`vectorProvider.ts`) correctly supports pgvector with multi-provider adapter pattern
  - All search/index services read config via `getEffectiveVectorProviderConfig()` with proper tenant isolation
  - Python backend compatible via `VectorCollection` abstraction; one unused module (`core/vectordb.py`) still imports ChromaDB (no impact)
  - Configuration reading: env → system_settings → library_provider_switch_states (5-second cache)
  - One deprecated function `getVectorizeClient()` hard-codes Cloudflare (no callers, safe to remove)
- **Integration points**: 16 entry points audited (search, index, delete, config, admin)
  - ✅ `vectorize-search.ts` — searchDocs/searchImages with proper tenant filter
  - ✅ `vectorize-indexing.ts` — indexDocument/indexImage/removeVector with config read
  - ✅ `routers/search.ts` — tRPC endpoints with tenant isolation
  - ✅ `routers/systemSettings.ts` — provider config with Python guard
  - ✅ `embedding_service.py` — provider-agnostic (384D or 1536D/3072D)
  - ✅ `library_indexing_service.py` — uses VectorCollection abstraction
  - ✅ `orchestrator/rag/*` — native pgvector with proper scoping
- **Future work**: If gradual per-tenant migration needed, add Python support for `library_provider_switch_states` (currently env-only)
- **Cleanup**: Remove `getVectorizeClient()` [15m], remove ChromaDB import in Python [30m]
- **Test coverage**: 3 Node.js test files, 3 Python test files; all passing

---

## Vector Database Configuration (ChromaDB ↔ pgvector) (2026-03-18)

### Status: RESEARCH COMPLETE — All Configuration Layers Mapped
**Research artifact:** VECTORDB-CHROMADB-TO-PGVECTOR-RESEARCH.md
- **Problem**: Understand how to switch vector DB providers from ChromaDB to pgvector via admin settings
- **Architecture**: Multi-provider abstraction in `vectorProvider.ts` (992 lines) with adapters for chromadb, pgvector, cloudflare_vectorize
- **Configuration storage**: `systemSettings` table (category: "vectordb") with 13 keys (provider, pgvector*, cloudflare*, chroma*)
- **Admin API endpoints**:
  - `systemSettings.getVectorDbSettings()` — Read current config (masked sensitive)
  - `systemSettings.updateVectorDbSettings()` — Write config (calls Python guard before allowing)
  - `systemSettings.testVectorDbConnection()` — Validates connectivity
  - `systemSettings.getVectorDbStats()` — Returns provider-specific stats
- **Provider selection logic**: `resolveVectorProvider(operation, config)` checks `currentReadProvider` (search) + `targetProvider` (write) for gradual migration support
- **pgvector implementation**: Auto-creates `smartspec_vector_entries` table, uses cosine similarity (in-memory), supports metadata filtering
- **Embedding service** (Python): `embedding_service.py` provides ChromaDB default (384D) or OpenAI (1536D/3072D) embeddings
- **Key insight**: Gradual migration possible via `currentReadProvider` + `targetProvider` + `mirrorWrites` flags (zero-downtime switchover)
- **Implementation files**:
  - Provider abstraction: `server/services/vectorProvider.ts`
  - Admin endpoints: `server/routers/systemSettings.ts` (lines 1428-1806)
  - Config storage: `drizzle/schema.ts` (systemSettings table)
  - Python embedding: `python-backend/app/services/embedding_service.py`
  - Usage: `server/services/multimodalRetrievalService.ts`, `vectorize-indexing.ts`

---

## Video Editor Reference Images — Library Search & URL Storage (2026-03-18)

### Status: RESEARCH COMPLETE — Hybrid Search + URL Storage Mapped
**Research artifact**: VIDEO-EDITOR-REFERENCE-IMAGES-RESEARCH.md
- **Problem**: Reference image thumbnails don't display in Draft AI panel's reference picker
- **Root causes identified**:
  1. NULL `thumbnailUrl` in library items (not set during media task import)
  2. Video editor uses `listDocuments` (simple keyword search) instead of `searchLibraryItems` (hybrid keyword+vector search)
  3. No filter for "ready" status — draft/indexing items appear before completion
- **Current implementation**: `trpc.library.listDocuments()` with `itemType: "image"` filter (VideoDraftAIPanel.tsx:129)
- **API returns**: `source_url` (always present), `thumbnail_url` (nullable), `title`, `metadata`, `status`
- **Recommendation**: Phase 1 (2h): Backfill thumbnail URLs + add status filter; Phase 2 (4h optional): Switch to vector search for semantic matching
- **Key insight**: Media URLs are permanent after `storagePut()` (internal S3/R2); temporary provider CDN only used as fallback
- **Implementation files**:
  - Frontend: `components/videoeditor/VideoDraftAIPanel.tsx` (lines 129-214)
  - API: `server/routers/library.ts` (listDocuments), `server/services/libraryService.ts` (listLibraryDocuments, searchLibraryItems)
  - Storage: `server/services/mediaLibraryService.ts` (downloadAndStore pattern)
  - Schema: `drizzle/schema.ts` (libraryItems.sourceUrl, .thumbnailUrl, .status)

---

## Video Editor Metadata Storage for Imported Draft Clips (2026-03-18)

### Status: ARCHITECTURE MAPPED — Extension Strategy Defined
**Research artifact**: VIDEO-EDITOR-METADATA-RESEARCH.md (12 KB)
- **Problem**: When drafts are imported to video editor or when users generate media, the prompt, model ID, and reference image URLs are NOT stored anywhere. User can't recall or re-generate with the same parameters.
- **Current storage**:
  - `Clip` type: Only stores assetId, timing, effects, transitions; NO metadata field
  - `Asset` type: Only stores id, type, path, duration; NO prompt/model/references
  - `MediaLibraryAsset`: Stores model name but not modelId or prompt
  - `PresentationDraftImportVisual`: DOES store prompt, modelId, referenceUrls (but only during import, not persisted)
- **Recommendation**: Add optional `metadata?: { prompt?, modelId?, referenceUrls?, extraParams? }` field to `Clip` type
- **VideoDraftAIPanel integration**: Pass `selectedClip` as prop, pre-populate form from clip.metadata when clip is selected
- **Implementation estimate**: 2 hours (type definitions 15m, panel logic 20m, VideoEditorPhase3 updates 30m, testing 30m)
- **Key files**:
  - `types/videoEditor.ts` (Clip, Asset definitions)
  - `components/videoeditor/VideoDraftAIPanel.tsx` (props interface, rendering)
  - `components/videoeditor/VideoEditorPhase3.tsx` (selectedClipId state, sidebar rendering, handlers)
  - `components/videoeditor/presentationDraftImport.ts` (visual element extraction pattern)

---

## Draft with AI Finalization Hang (2026-03-18)

### Status: ROOT CAUSE IDENTIFIED — Race Condition in State Machine
**Research artifact**: DRAFT-WITH-AI-FINALIZATION-HANG.md
- **Problem**: Modal gets stuck at "Finalizing output..." spinner after successfully adding slides
- **Root cause**: Race condition in `isFinalizingCompletion` state machine. `handleClose()` refuses to execute while `isFinalizingCompletion=true`, but that flag doesn't change until AFTER the close callback should have been called.
- **Code locations**:
  - AIDraftModal.tsx line 1547: `setIsFinalizingCompletion(true)` before calling onComplete
  - AIDraftModal.tsx line 1566: `setIsFinalizingCompletion(false)` in .finally() (too late!)
  - AIDraftModal.tsx line 1525: `handleClose()` exits early if `isFinalizingCompletion=true`
  - PresentationEditor.tsx line 10956: `onComplete` calls `await deckQuery.refetch(); close();`
- **Impact**: Modal never closes, user sees spinner indefinitely
- **Fix approach**: Option B — reorder state updates so `isFinalizingCompletion=false` happens BEFORE calling `close()`

---

## Virtual Admin Agent Infrastructure (2026-03-18)

### Status: RESEARCH COMPLETE — Monitoring, Audit, & Agency Systems Mapped
**Research artifacts** (START HERE: VIRTUAL-ADMIN-AGENT-RESEARCH.md):
- `VIRTUAL-ADMIN-AGENT-RESEARCH.md` (15 KB) — Complete analysis: existing health monitors, notification channels, agency reusability, gaps, 3 design options, hybrid recommendation, risks, open questions, implementation estimate (15h)

### Executive Summary
- **Existing monitors**: QueueHealthMonitor (60s poll), ServicesRouter (on-demand), QueuesRouter (rate limiter), AuditLogger (JSONL)
- **Notification channels**: Email (SMTP), In-App (DB), Telegram (optional), Slack (available)
- **Audit infrastructure**: providerUsageLog, apiAuditEvents, creditTransactions tables (all traceId-linked)
- **Agency reusability**: AgencyBridge can execute multi-agent workflows with tool integration; can call skills, send Slack messages, restart systemd services
- **Key gaps**: No threshold-triggered actions, no centralized alerting policy, no automatic escalation, no cross-team notifications
- **Recommendation**: Hybrid approach (Option A + C): Reactive polling every 60s + agency for complex approvals
- **Core deliverables**: adminAgentService.ts (rule engine), tRPC router, admin dashboard, system-diagnostics agency template
- **Implementation**: 15h (polling + rules: 4h, router: 2h, UI: 4h, agency: 3h, testing: 2h)

### Key Files
- Monitoring: `queueHealthMonitor.ts` (detects backlog, spikes, dead workers), `services.ts` (Docker/systemd/host process status), `queues.ts` (rate limiter + Cloud Tasks metrics)
- Audit: `auditLogger.ts` (JSONL buffered logging, 50+ event types), schema tables: `providerUsageLog`, `apiAuditEvents`, `creditTransactions`, `workflowAuditEvents`
- Notifications: `emailService.ts` (Nodemailer SMTP), `notificationService.ts` (in-app + Telegram enqueue), `channelAdapters/slack.ts` (webhook + postMessage)
- Agency: `agencyBridge.ts` (Node→Python HTTP client), Python `/api/v1/agencies/run` (2min timeout, multi-agent support)
- Scheduler: `scheduler.ts` (Cloud Tasks + fallback sweep, can execute skills and send emails)

### Design Decision
**Reactive Polling Model** (Option A) is recommended as core because:
- Simple, low-cost (no LLM calls for every check)
- Reuses existing scheduler infrastructure
- Can detect queue backlog within 90 seconds (3 consecutive polls)
- Agency reserved for complex decisions requiring approval (Slack workflow)
- Threshold rules codified (queue > 100 items + consecutive growth ≥ 3 = escalate)
- Estimated cost: $0 for automated checks, $0.01 per complex diagnostic (GPT-4o-mini)

---

## Chat Memory System (2026-03-17)

### Status: RESEARCH COMPLETE — 3-Tier Architecture, All Features Documented
**Research artifacts** (START HERE: CHAT-MEMORY-SYSTEM-RESEARCH.md):
- `CHAT-MEMORY-SYSTEM-RESEARCH.md` (12 KB) — Complete technical documentation: MemoryPanel UI controls, 3-tier architecture (buffer/summary/entity), auto-summarization & consolidation, memory modes (Full/No Long/Off), cross-conversation project linking, configuration, safeguards
- `CHAT-MEMORY-HELP-GUIDE.md` (8 KB) — User-friendly help doc: what memory is, how to use it, memory types explained, importance scores, FAQ, troubleshooting, best practices

### Executive Summary
- **3 memory tiers**: Buffer (recent 20 msgs), Summary (auto-compressed history), Entity (persistent facts across chats)
- **UI**: MemoryPanel right sidebar with Add/Delete/Filter/Mode/Compact/Clear controls
- **Auto-processing**: Summarizes at 70% context threshold, consolidates 2+ summaries, extracts facts with PII filtering
- **Memory modes**: Full (all tiers), No Long (summaries only), Off (raw messages only)
- **Project scoping**: Global memories (all chats) + project-scoped memories (specific project only)
- **Consolidation**: Auto-merges summaries when 2+ exist + context building up (saves tokens)
- **Entity types**: 11 types (rule, decision, plan, architecture, component, task, code_knowledge, user, project, preference, technical)
- **Safeguards**: PII filtering, prompt injection prevention, orphaned cleanup, token overflow handling

### Key Files
- Frontend: `MemoryPanel.tsx` (762 lines), `ChatView.tsx` (memory streaming integration)
- Backend: `memory.ts` (tRPC router, 509 lines), `memoryService.ts` (1500+ lines, all logic)
- Config: `AdminSettings.tsx` (summary model selection), `systemSettings` table
- Database: `conversations.memoryMode`, `.projectId`; `conversationSummaries`, `entityMemories` tables

### Key Features
1. **Buffer Memory** — Last 20 messages, always included
2. **Summary Memory** — Auto-generated at 70% context, consolidated when 2+ summaries
3. **Entity Memory** — 11 types, project-scoped or global, 180-day retention (rules never expire)
4. **Manual Controls** — Add/Delete memories, Compact (force summarize), Clear Old, Project linking
5. **Context Building** — Budget-aware assembly with relevance scoring, persona injection, visual memory support
6. **Auto-Processing** — Extract facts, check summarization, consolidate, cleanup (runs after each message)
7. **Cross-Chat Continuity** — Project-linked chats share memories + summaries across conversations

---

## Spec 034 Agency Experience Templates — System Audit (2026-03-18)

### Status: AUDIT COMPLETE — 79% Implementation, Multiple Gaps in Preview Handlers
**Research artifacts** (START HERE: SPEC-034-AGENCY-EXPERIENCE-TEMPLATES-AUDIT.md):
- `SPEC-034-AGENCY-EXPERIENCE-TEMPLATES-AUDIT.md` (40 KB) — Full cross-layer audit (Python/Node/Frontend): template definitions, preview handlers, routing, database, feature flags, test coverage. Critical findings: missing media_prompt & text_content handlers in Node.js, frontend missing preview card types.
- `SPEC-034-AUDIT-QUICK-FIX-GUIDE.md` (15 KB) — Implementation guide with code snippets, 5 fixes ordered by priority, testing checklist, 3-hour estimate.

### Executive Summary
- **Templates**: ✅ All 3 platforms (deep-research, storyboard-planner, deck-builder) properly defined with agent instructions
- **Python Envelopes**: ✅ 9 intent types defined (includes media_prompt, text_content) with proper regex parsing
- **Node Preview Service**: ❌ **CRITICAL** — Only handles 5 of 9 intents; missing handlers for media_prompt and text_content
- **Frontend Cards**: ❌ **CRITICAL** — Missing AgencyPreviewCard types for media_prompt and text_content
- **Database**: ✅ Tables properly structured (assumed complete from cross-reference validation)
- **Feature Flags**: ⚠️ PARTIAL — Template sync gated, but commit-specific flags not checked
- **Tests**: ⚠️ MINIMAL — No tests for media_prompt/text_content handlers

### Critical Issues (Fix Phase 1 — 4 hours)
1. **Missing Node.js handler**: `buildAgencyPreview()` returns null for media_prompt intent
2. **Missing Node.js handler**: `buildAgencyPreview()` returns null for text_content intent
3. **Missing frontend card types**: AgencyPreviewCard typeConfig lacks media_prompt and text_content
4. **Missing preview components**: MediaPromptPreviewContent, TextContentPreviewContent not created
5. **Generic fallback UI**: PreviewCommitButton uses default labels (fixable, lower priority)

### Field Name Alignment (All PASS)
- Research payload: ✅ Snake_case (executive_summary, key_findings)
- Storyboard payload: ✅ Snake_case (total_duration_seconds, video_prompt)
- Presentation payload: ✅ Mixed case (slides use camelCase per AIPresentationSlideSchema)
- Frontend normalization: ✅ Properly converts snake→camel (e.g., total_duration_seconds → totalDurationSeconds)

### Phase 2 Recommendations (Feature Flags, 1.5 hours)
- Add AGENCY_DECK_COMMIT_ENABLED check in agencyDeckCommitService
- Add AGENCY_LIBRARY_COMMIT_ENABLED check in agencyCommitService
- Document flag requirements

### Phase 3 Recommendations (Tests, 3 hours)
- Add agencyPreviewService.test.ts with all intent type coverage
- Add integration test: template → run → media_prompt → preview
- Add integration test: template → run → text_content → preview

---

## Media Generation Queue System for Presentations (2026-03-17)

### Status: ANALYSIS COMPLETE — 3-Layer Concurrency Model Identified, Critical Bottleneck Found
**Research artifacts** (START HERE: MEDIA-QUEUE-SYSTEM-RESEARCH-BRIEF.md):
- `MEDIA-QUEUE-SYSTEM-RESEARCH-BRIEF.md` (15 KB) — Complete architecture analysis: flow from generateAIDraft → rate limiting → provider submission, concurrency limits at each layer, scaling estimates for 20-50 simultaneous drafts, critical stopOnError filter issue, 8 recommendations

### Executive Summary
- **Architecture**: Synchronous-style async with inline image submission during generateAIDraft (no background queue)
- **Rate limiting**: Bottleneck+Redis per-provider (kie.ai: 50 max concurrent, 20 requests/10s)
- **Local concurrency**: MAX_IMAGE_CONCURRENCY=5 slides in parallel per draft (line 234, aiPresentationService.ts)
- **Submit-only pattern**: Images submitted but server does NOT poll; frontend polls /api/v1/media/status
- **Critical bottleneck**: stopOnErrorFilter at line 10295 halts remaining slides if any fails with BillingChargeError
- **Safety threshold**: 1-5 simultaneous drafts safe; 20+ will timeout or fail
- **Weakest link**: Layer 3 (provider rate limiting) cannot handle 20+ concurrent drafts + Python backend capacity unknown

### Key Findings
1. **mapWithConcurrency flow**: 5 workers process slides in parallel; each slide submits 1-N image variants sequentially
2. **Rate limiter topology**: kie.ai allows 50 concurrent, 20 per 10s; with 20 drafts × 7 slides = 140 requests → queue backs up
3. **Retry logic**: submitTaskWithRetry() × 2 attempts for transient errors (SETTINGS_KEY_NOT_FOUND); hard failures propagate
4. **Redis fallback**: If Redis down, rate limiting bypassed (logs warning), goes to in-memory Bottleneck
5. **Error handling**: stopOnErrorFilter = cancellation OR BillingChargeError → sets fatalError → ALL workers exit → remaining slides never submitted
6. **Deferred jobs**: No server polling; Python backend handles async submission to kie.ai; frontend polls for results

### Bottleneck Details
| Layer | Limit | Mechanism | Failure Mode |
|-------|-------|-----------|--------------|
| Draft | 1 per user | Per-user task lock in router | User blocked from starting 2nd draft |
| Slide | 5 parallel | mapWithConcurrency(5) | Only 5 slides submit concurrently |
| Provider | 50 concurrent, 20/10s | Bottleneck + Redis | Queue timeout at 5 minutes |

### Critical Issues
1. **stopOnError halts siblings**: Slide 3 fails → Slides 4-7 never submitted → incomplete draft
2. **Python backend opaque**: Unknown capacity; if it bottlenecks, Node.js rate limiter queueing becomes useless
3. **Queue depth unpredictable**: 20 drafts × 5 concurrent = 100 in-flight; takes 40+ seconds to drain
4. **No upfront credit check**: BillingChargeError only triggered mid-Phase-4 → wastes time on slides 1-N

### Recommended Fixes
1. **Add upfront credit validation** — Check Phase 1 if user has credits for all slides
2. **Change stopOnErrorFilter** — Only cancel on user abort, not billing errors
3. **Measure Python backend** — Load test with 50+ concurrent requests
4. **Monitor queue depth** — Alert if backed up >1 minute
5. **Dynamic concurrency** — Reduce MAX_IMAGE_CONCURRENCY if provider queue building up

---

## Draft with AI: Incomplete Image Generation (2026-03-17)

### Status: ROOT CAUSE IDENTIFIED — `stopOnError: true` Halts Batch Processing
**Research artifacts** (START HERE: DRAFT-WITH-AI-IMAGE-GENERATION-ROOT-CAUSE.md):
- `DRAFT-WITH-AI-IMAGE-GENERATION-ROOT-CAUSE.md` (12 KB) — Complete root cause analysis, error paths, code locations
- `DRAFT-WITH-AI-IMAGE-GENERATION-QUICK-FIX.md` (8 KB) — 3 fix options ranked by effort/impact, testing strategy

### Executive Summary
- **Problem**: 7-slide presentation has images on only slides 1-3; slides 4-7 are blank
- **Root Cause**: `mapWithConcurrency(..., { stopOnError: true })` at line 10209 halts all workers when any slide fails
- **Why**: With `MAX_IMAGE_CONCURRENCY = 3`, first 3 slides usually succeed before batch stops
- **Impact**: User-facing bug affecting all multi-slide presentations where ANY slide fails image generation
- **Fix Effort**: 30 minutes (Option 1: remove `stopOnError`) to 2 hours (Option 3: per-slide error boundaries)
- **Risk**: Options differ in how they handle billing errors vs other failures

### Key Findings
1. **Concurrent processing loop**: `mapWithConcurrency(slides, generateImage, 3, { stopOnError: true })`
2. **Error escalation**: BillingChargeError or any unhandled error triggers halt
3. **Design intent**: `stopOnError` was meant to prevent overcharging when credits run out
4. **Design flaw**: Treats all errors the same, including transient timeouts/API failures
5. **Manifestation**: Exactly matches user report — approximately `ceil(slides.length / MAX_IMAGE_CONCURRENCY)` slides succeed

### Recommended Fix
**Option 2**: Add upfront credit validation before Phase 4 + disable `stopOnError`
- Fail fast if insufficient credits for entire deck
- Allow all slides to attempt if credits available
- Most user-friendly error messaging
- Prevents "partial deck" billing surprise

---

## Skill System Architecture & Inventory (2026-03-16)

### Status: RESEARCH COMPLETE — 46 Skills Mapped, Detection/Execution/Chaining Analyzed
**Research artifacts** (START HERE: SKILL-SYSTEM-SUMMARY.md):
- `SKILL-SYSTEM-SUMMARY.md` (5 KB) — Executive summary, key insights, current gaps (no parallel execution, no auto-chaining)
- `skill-system-comprehensive-research.md` (40 KB) — Full 14-section technical analysis: 46 skill inventory, detection architecture, execution routing, chaining, model selection cascade, current limitations, recommendations
- `skill-system-QUICK-REF.md` (25 KB) — Fast lookup: decision trees, code snippets, execution routing diagram, tRPC endpoints, database tables, debugging checklist

### Executive Summary
- **46 deployed skills** across 11 categories: media generation (8), content writing (10), product reviews (15), specialist skills (13)
- **1 auto-trigger skill** (image-creator, priority 95), **45 explicit-only** (must select manually or via slash command)
- **Detection**: Pattern-based (regex triggers + confidence scoring), per-conversation enable/disable, priority-ordered
- **Execution**: 4 modes (llm-only, media-generate, python, sandbox-*), routed by executionMode field
- **Model selection**: 5-level cascade (Execution Policy → Planner → Skill pin → Conversation model → Default)
- **Chaining**: chainTo metadata exists (per-skill + per-pattern), but NOT auto-executed (manual UI invocation)
- **Parallel execution**: DOES NOT EXIST — single skill per request, sequential processing
- **Current strengths**: Simple detection, modular execution, extensible (add skill.md = auto-sync to DB)
- **Current weaknesses**: No batch/parallel execution, no NLP intent matching, no workflow composition, detection pattern-only

### Key Findings
1. **Skill Inventory**: 46 skills all enabled by default, all loaded at startup via auto-sync from filesystem
2. **Detection flow**: User message → regex pattern match in priority order → confidence score (0.7 base + bonuses) → return first match
3. **Execution routing**: executionMode determines handler (LLM call vs. media API vs. Python sandbox vs. OpenSandbox)
4. **Model selection**: Feature 041 (execution policy) + Feature 039 (planner) create 5-layer cascade with fallback chain (up to 5 attempts)
5. **ChainTo implementation**: Metadata only — stored in DB but never auto-executed; frontend can display suggestions
6. **Rate limiting**: Per userId:skillType per 60s window (image: 10/min, video: 15/min, audio: 10/min, default: 20/min)
7. **Credit system**: Per-skill multiplier + model-based pricing, deducted by Python backend (not Node.js)
8. **No parallelism**: All skills executed sequentially; batch API would require new endpoint

### Critical Gaps
- **No batch execution** — Can't run 5 image generations in parallel; must invoke 5 times sequentially
- **No auto-chaining** — chainTo suggestions shown to UI but never auto-invoked
- **No intent detection** — Regex patterns only; "Help me write about cooking" won't match marketing-article-writer
- **No skill composition** — Can't build workflows (article → images → video)
- **No conditional routing** — Chain targets are static, no if/then branching

### Recommended Next Steps
1. **Batch execution API** — `executeBatch([{skillId, prompt}])` for parallel requests
2. **Auto-chaining** — `executeChain(skillId, prompt, maxSteps)` auto-follows chainTo
3. **Skill composition UI** — Simple drag-drop workflow builder
4. **LLM-based intent detection** — Optional NLP path alongside regex (not required for detection)

---

## Cybersecurity Skills Audit for SmartSpecPro (2026-03-16)

### Status: RESEARCH COMPLETE — 22 Skills Mapped, 17 CRITICAL/HIGH Priority
**Research artifacts** (START HERE: cybersecurity-skills-audit.md):
- `cybersecurity-skills-audit.md` (30 KB) — Comprehensive mapping of Anthropic cybersecurity skills to SmartSpecPro architecture. 22 skills identified across 9 domains (API, LLM, Auth, Encryption, Database, File Upload, Python, Infrastructure, Redis). Phase-based implementation roadmap. Critical findings: prompt injection in skillExecutor.ts, IDOR in 50+ tRPC endpoints, command injection risk in media tasks, secrets exposure in error handling.
- `cybersecurity-skills-QUICK-REF.md` (15 KB) — Fast lookup by component, priority matrix, code review checklist, testing payloads, skill file templates, integration points

### Executive Summary
- **22 Cybersecurity skills** mapped from Anthropic repo to SmartSpecPro codebase
- **17 CRITICAL/HIGH priority** (address within 2 weeks)
- **5 MEDIUM priority** (address within 3 weeks)
- **9 attack domains covered**: API security, LLM security, authentication, encryption, database, file upload, Python backend, infrastructure, Redis/queue
- **Phase-based roadmap**: Phase 1 (Week 1, 8 hrs, CRITICAL blocks production), Phase 2 (Week 2, 6 hrs, before next feature), Phase 3 (Week 3+, 4 hrs, hardening)
- **Key vulnerabilities identified**: Prompt injection (skillExecutor.ts), IDOR (all tRPC endpoints), command injection (mediaGenerationService.ts, python-backend), secrets exposure (logging), path traversal (skill file loading)
- **Strong foundations**: AES-256-GCM encryption implemented correctly, Zod input validation, RBAC in place, rate limiting exists
- **Immediate actions**: Prompt injection prevention, secrets exposure audit, path traversal validation, command injection fixes, IDOR checklist

### Key Files
| Document | Size | Purpose |
|----------|------|---------|
| **cybersecurity-skills-audit.md** | 30 KB | START HERE — Full mapping of 22 skills to SmartSpecPro architecture, attack surface analysis, phase-based roadmap, file locations for each risk |
| **cybersecurity-skills-QUICK-REF.md** | 15 KB | Fast lookup: component-based skill index, priority matrix, code review checklist, testing payloads, integration points, local skill templates |

---

## Claude Code Plugins Security Research (2026-03-16)

### Status: RESEARCH COMPLETE — 7 Documents, 70 KB, 19 Skills Mapped, 8 Tasks Identified
**Research artifacts** (START WITH PLUGINS-SECURITY-SUMMARY.md):
- `PLUGINS-SECURITY-SUMMARY.md` (5 KB) — START HERE: Executive summary, key findings, next steps, all docs overview
- `PLUGINS-SECURITY-ACTION-ITEMS.md` (8 KB) — 8 tasks (Phase 1-3), acceptance criteria, effort, testing, success metrics
- `plugins-security-quick-ref.md` (12 KB) — 7 code patterns (SAFE/UNSAFE), 15-point checklist, diagnostics
- `claude-code-plugins-security-research.md` (15 KB) — Full threat model (6 scenarios), 19 skills, gap analysis, risk classification
- `CYBERSECURITY-SKILLS-MAPPING.md` (10 KB) — How to fetch skills, skill descriptions, integration workflow, alternative names
- `PLUGINS-SECURITY-READING-ORDER.md` (10 KB) — Reading guides by time available, cross-references, FAQ, progress tracking
- `RESEARCH-DELIVERY-CHECKLIST.md` (10 KB) — Verification that all deliverables complete, usage instructions, sign-off

### Executive Summary
- **4 CRITICAL vulnerabilities** (address Week 1): Path traversal, command injection, prompt injection, secrets leakage
- **4 CRITICAL skills** (implement immediately): Path traversal prevention, command injection prevention, prompt injection detection, secrets exposure prevention
- **4 HIGH priority skills** (2-week timeline): YAML/JSON safe parsing, error sanitization, process isolation, code review checklist
- **19 total cybersecurity skills mapped** to plugin threat model
- **Risk assessment**: Path traversal and command injection are exploitable security holes (subprocess patterns, file I/O validation)
- **Implementation patterns**: 7 copy-paste code patterns with SAFE ✓ vs UNSAFE ✗ examples
- **3-phase roadmap**: Phase 1 (Week 1, 8 hrs, CRITICAL), Phase 2 (Week 2, 6 hrs, HIGH), Phase 3 (Week 3+, 4 hrs, MEDIUM)
- **Team-ready**: Action items with acceptance criteria, files to create, effort estimates, testing strategy

### Key Files
| Document | Size | Purpose |
|----------|------|---------|
| **PLUGINS-SECURITY-SUMMARY.md** | 5 KB | START HERE — Executive overview, next steps, all findings summary |
| **claude-code-plugins-security-research.md** | 15 KB | Full threat model, 19 skills, risk classification, implementation roadmap |
| **PLUGINS-SECURITY-ACTION-ITEMS.md** | 8 KB | 8 specific tasks (Phase 1-3), acceptance criteria, files to create, effort estimates |
| **plugins-security-quick-ref.md** | 12 KB | 7 production-ready code patterns (SAFE/UNSAFE), 15-point checklist, diagnostics |
| **CYBERSECURITY-SKILLS-MAPPING.md** | 10 KB | How to fetch skills from Anthropic repo, skill descriptions, integration workflow |

---

## Draft with AI: Modal & Model Selection (2026-03-16)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `draft-with-ai-model-selection-research.md` — Full 12-section technical brief covering AIDraftModal component, tRPC data flow, skill execution, model selection cascade for article + slide generation, progress tracking, all with exact file:line references
- `draft-with-ai-QUICK-REF.md` — Fast lookup tables, code snippets, localStorage keys, stalled detection, model selection decision tree, common patterns

### Executive Summary
- **UI Dialog**: AIDraftModal.tsx (1900 lines) with topic/article input, skill selectors, media model pickers, advanced options
- **Two article sources**: AI skill generation OR user-provided custom text
- **tRPC mutation**: `presentation.ai.generateDraft` accepts topic, skills, models, watermarks, style presets, advanced media params
- **Two LLM phases**: Phase 1 (article outline) uses `resolveDefaultTextModel()`, Phase 2+ (slide structure) uses same model
- **Model selection**: Deferred to backend execution. Text model resolved via `textModel` param OR DB default ("gpt-4o-mini" fallback)
- **Skill execution policy**: Article skills (via `chat.executeSkill`) use capability-aware model selection (requirements matching + fallback cascade)
- **Media models**: Image/video/audio models selected directly from UI dropdowns (not resolved by backend)
- **Progress tracking**: Redis-backed polling every 2s, stalled detection at 60s inactivity, per-user generation lock

### Key File Locations
| Purpose | File | Lines |
|---------|------|-------|
| Dialog component | AIDraftModal.tsx | 1–1900 |
| Generate handler | same | 1317–1477 |
| Input schema | shared/presentation/aiTypes.ts | 198–242 |
| tRPC mutation | server/routers/presentation.ts | 393–482 |
| Backend service | server/services/aiPresentationService.ts | 10,200–12,950 |
| Text model resolver | same | 282–320 |
| Skill execution policy | server/services/skillExecutionPolicy.ts | 116–250 |
| Chat skill router | server/routers/chat.ts | 1292–1650 |

---

## Presentation Editor: Zoom & Pan Implementation (2026-03-16)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `presentation-zoom-pan-research.md` — Comprehensive 16-section technical analysis covering zoom state, canvas transforms, pan clamping, touch gestures, viewport calculations, coordinate system, all with exact file:line references
- `presentation-zoom-pan-QUICK-REF.md` — Fast lookup tables, code snippets, component hierarchy, scale calculations, pan boundaries, control matrix, common patterns, edge cases

### Executive Summary
- **Zoom range**: 0.5x to 2.0x (desktop), controlled by wheelScroll, buttons, or Ctrl/Cmd±
- **Canvas transform**: `translate(offsetX, offsetY) scale(baseRenderScale × effectiveScale)` with `origin-top-left`
- **Pan activation**: Middle-click, right-click, or Alt+left-drag (only when zoom > 1)
- **7 aspect presets**: 9:16 (720×1280), 16:9 (1280×720), 4:3 (1024×768), 3:4 (768×1024), 4:5 (960×1200), 5:4 (1250×1000), 1:1 (1080×1080)
- **Pointer-centric zoom**: Scroll wheel keeps cursor point fixed on screen
- **Pan clamping**: Prevents over-scrolling; offsets forced to [minOffset, 0] where minOffset = width - (width × scale)
- **Touch gestures**: Pinch-to-zoom and two-finger pan with same anchor logic as wheel zoom
- **Dual scaling**: baseRenderScale (fit to viewport) + effectiveScale (user zoom) = interactionScale

### Critical Paths
1. **Desktop zoom**: Button/keyboard → `updateDesktopZoom()` → `setDesktopViewport()` → CanvasStage re-renders with new transform
2. **Wheel zoom**: `handleCanvasWheel()` → calculates pointer-centric offsets → `onViewportChange()` → same re-render
3. **Pan**: `handlePanPointerDown()` + `handlePointerMove()` → `clampViewportOffsets()` → offsets updated continuously
4. **Touch**: `handleCanvasTouchStart()` → pinch distance tracked → `handleCanvasTouchMove()` scales + pans proportionally

### Key File Locations
| Purpose | File | Lines |
|---------|------|-------|
| **Zoom constants (desktop)** | PresentationEditor.tsx | 260–262 |
| **Viewport state** | PresentationEditor.tsx | 2524–2528 |
| **Zoom buttons & display** | PresentationEditor.tsx | 8356–8383 |
| **Zoom handler** | PresentationEditor.tsx | 4489–4496 |
| **Keyboard shortcuts** | PresentationEditor.tsx | 7199–7208 |
| **Canvas presets** | constants.ts | 23–31 |
| **Canvas size fitting** | CanvasStage.tsx | 194–213 |
| **Wheel zoom** | CanvasStage.tsx | 641–669 |
| **Pan start & move** | CanvasStage.tsx | 490–550, 316–355 |
| **Pan clamping** | CanvasStage.tsx | 256–268 |
| **Transform (origin-top-left)** | CanvasStage.tsx | 792–800 |
| **Touch pinch & pan** | CanvasStage.tsx | 578–639 |
| **Fit/Center buttons** | CanvasStage.tsx | 671–692, 709–729 |
| **Coordinate conversion** | CanvasStage.tsx | 411–424 |

---

## Presentation System: Comprehensive Architecture (2026-03-15)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `PRESENTATION-SYSTEM-COMPREHENSIVE-RESEARCH.md` — Full 700+ line technical brief covering all 9 research areas: element types (5), block presets (31), component recipes, slide data structures, editor architecture, rendering, AI service, canvas objects, and preview components
- `PRESENTATION-SYSTEM-QUICK-REF.md` — Fast lookup: element types table, preset list by category, slot budgets, file locations, data structures, common operations, limits, debugging tips

### Executive Summary
- **5 Element types**: text, image, video, rect, line (all share id, type, x, y, width, height, opacity, rotation)
- **31 Block presets**: Pre-designed templates (process-steps, timeline-flow, article-focus, etc.) that auto-generate fallback elements
- **31 Component recipes**: Same IDs as presets, but with semantic slot bindings (text, image, video, list, icon), media frame styles, and text capacity budgets
- **Slide data format**: `PresentationSlideContent` with elements[], components[], renderOrder[], canvas, background, transition, aiDesign metadata, pendingMediaJobs
- **Component structure**: Instance has id, componentId (recipe), slotBindings (content placeholders), fallbackElements (rendered elements), preview metadata
- **Rendering**: Explicit renderOrder defines z-order mixing elements and components; components render their fallbackElements
- **Media support**: Images/videos support 6 shape styles (rect, rounded, circle, ellipse, diamond, star) + motion presets (zoom, pan)
- **Multilingual text**: Text units use grapheme weights: Latin 1.0, Thai 1.2, digits 0.95 (for accurate budgeting)

### Critical Paths
1. **Preset → Slide**: `buildPresentationBlockPreset()` generates 100+ elements scaled to canvas
2. **Narrative → Component**: `generateAIDraft()` → `buildBuiltInPresentationComponentInstanceFromNarrative()` → component with slotBindings
3. **SlotBindings → Fallback**: Component instance contains both semantic bindings AND rendered fallbackElements (dual representation)

### Key File Locations
| Purpose | File | Lines |
|---------|------|-------|
| Element schemas | contracts.ts | 231–334 |
| Slide content schema | contracts.ts | 605–616 |
| Preset definitions & builders | presentationBlockPresets.ts | 29–975 |
| Recipe definitions (media slots, budgets, styles) | presentationComponentRecipes.ts | 43–1057 |
| Slot binding utilities | componentRecipeSlotBindings.ts | 26+ |
| SVG preview generation | blockPreviewSvg.ts | 1–203 |
| Canvas rendering | CanvasObjects.tsx | 112–200+ |
| Preview rendering | SlideElementPreview.tsx | 32–160+ |
| AI service (generation, layout selection, fit scores) | aiPresentationService.ts | ~2500 lines |
| Editor UI (state, handlers, panels) | PresentationEditor.tsx | ~5000 lines |

---

## Presentation Editor: Skill-Powered Slide Regeneration (2026-03-15)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `PRESENTATION-EDITOR-REGEN-RESEARCH-BRIEF.md` — Full 500+ line technical research brief with findings, current architecture, risks, options, recommendation, implementation checklist
- `PRESENTATION-EDITOR-REGEN-QUICK-REF.md` — Fast lookup: file locations, line numbers, copy-paste code patterns, state template, import statements, API contract, debugging checklist
- `presentation-editor-skill-regen-research.md` — Initial research notes (detailed notes on all components)

### Executive Summary
- **Slide notes dialog**: Lines 9997–10066 in PresentationEditor.tsx (draggable, 14-row textarea, 3 buttons). Open state: line 2328, draft state: line 2321
- **Skill execution ready**: tRPC `chat.executeSkill` mutation exists (server:chat.ts:1220–1244), accepts skillId + prompt + dynamicParams
- **Complete reference pattern**: AIDraftModal.tsx "Use Your Own Article" (lines 1854–1967) has production-ready UI: skill selector, collapsible advanced options, generate button, result field
- **Schema support**: `trpc.skills.getInputSchema` query (server:skills.ts:1057–1066) auto-populates form from skill definition
- **Layout rebuild pattern**: `handleApplyAIRecipeOverride()` (PresentationEditor.tsx:4675–4744) shows how to apply results to slide state
- **Persistence**: `handleSaveSlide()` (line 5953) persists slideNoteDraft; pattern for persisting regeneration results

### Implementation Recommendation
**Use Option B (Full-Featured)** — Replicate AIDraftModal pattern inside slide notes dialog or as floating toolbar:
1. Toggle switch to enable skill regeneration
2. SearchableCombobox skill selector (filter: llm-only execution mode)
3. Collapsible "Advanced Options" with DynamicSkillForm
4. Generate button (+ loading state)
5. Result field or toast with generated content
6. Apply result to target (notes/narrative/layout) + save

**Effort estimate**: 4–6 hours for MVP (skill select + generate + result)

### Critical File Locations
| Purpose | File | Lines |
|---------|------|-------|
| Slide notes UI | PresentationEditor.tsx | 9997–10066 |
| Notes state | PresentationEditor.tsx | 2321 (draft), 2328 (open), 2688 (dirty) |
| Add mutation here | PresentationEditor.tsx | 2212–2215 |
| Save handler | PresentationEditor.tsx | 5953–5987 |
| Layout rebuild (pattern) | PresentationEditor.tsx | 4675–4744 |
| **Skill execute server** | **server/routers/chat.ts** | **1220–1244** |
| **Skill schema server** | **server/routers/skills.ts** | **1057–1066** |
| **UI pattern (complete)** | **AIDraftModal.tsx** | **1854–1967 (JSX), 793–819 (handler)** |
| Skill selector component | SearchableCombobox.tsx | — |
| Form component | DynamicSkillForm.tsx | — |

---

## Feature 043: Public API & External Agent Gateway (2026-03-15)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `feature-043-public-api-rate-limiting-research.md` — Comprehensive 19-section analysis of API key system, rate limiting, quotas, audit logging, scope enforcement, admin UI, middleware chain, Redis patterns. Includes gap analysis and implementation roadmap.
- `feature-043-quota-implementation-guide.md` — Step-by-step implementation guide for wiring credit quotas into middleware. 6 implementation steps, validation checklist, response headers, rollout plan, test patterns.

### Executive Summary
- ✅ **API keys fully implemented**: HMAC-SHA256 hashing, scope enforcement, expiration, admin UI
- ✅ **Per-key RPM rate limiting**: Sliding window (minute-granularity), 600 RPM tenant soft cap (working)
- ✅ **Daily credit quota infrastructure**: Table columns, service functions all exist
- ❌ **Quota enforcement MISSING**: `checkDailyCreditLimit()` never called in middleware
- ❌ **Credit consumption MISSING**: `incrementDailyCredits()` never called by handlers
- ❌ **Credit cost matrix MISSING**: No per-endpoint cost definition

### Tables & Columns
| Table | Key Columns | Purpose |
|-------|------------|---------|
| `apiKeys` | rateLimit (int), creditLimit (int), scopes (json), keyHash, expiresAt | API key management |
| `publicApiAuditLog` | creditsUsed, statusCode, latencyMs, apiKeyId, path, method | Request tracking |

### Middleware Chain (/v1 routes)
1. publicApiCorsMiddleware → CORS
2. publicApiHeadersMiddleware → Headers
3. apiKeyAuthMiddleware → Extract + validate key
4. publicApiFeatureGuard → Feature flag
5. rateLimitMiddleware() → RPM check (✅ works)
6. idempotencyMiddleware() → Deduplication
7. publicApiAuditMiddleware → Log request
8. **MISSING**: Daily credit limit enforcement (should go #5.5)

### Scope System (14 scopes)
skills:list, skills:execute, agencies:list, agencies:invoke, presentations:create, video_projects:create, media:generate, llm:chat, mcp:read, mcp:write, jobs:create, jobs:read, webhooks:manage, events:read, api_keys:manage

### Redis Key Patterns
- `ratelimit:apikey:{apiKeyId}:{minuteTs}` — Per-key RPM counter
- `ratelimit:tenant:api:{tenantId}:{minuteTs}` — Tenant soft cap (600 RPM)
- `creditlimit:apikey:{apiKeyId}:{YYYY-MM-DD}` — Daily credit accumulator

### Admin UI (AdminAPIKeys.tsx)
- Create: Name, scopes, expires (days), credit limit/day, rate limit (RPM)
- Table: Name, prefix, scopes, rate limit, status, last used, actions
- Stats: 7-day usage, requests, credits, error rate, top endpoints

### Implementation (6 steps)
1. Define credit costs per endpoint
2. Add quotaEnforcementMiddleware()
3. Update AuthContext type
4. Handler integration (pre-check + post-charge)
5. Tests
6. Rollout

### Critical Files
- `services/apiKeyService.ts` — Key mgmt
- `services/apiKeyRateLimiter.ts` — Rate limiting + quotas
- `middleware/publicApiAudit.ts` — Logging
- `_core/index.ts` — Middleware chain
- `pages/AdminAPIKeys.tsx` — Admin UI

---

## Agency-Swarm v1.6-1.8 Integration Status (2026-03-13)

### Status: RESEARCH COMPLETE
**Research artifact**: `agency-swarm-v1-8-integration-status.md`

### Executive Summary
- **7 of 16 features FULLY WIRED**: description, output_type, files_folder, conversation_starters, quick_replies, tool_use_behavior, validation_attempts
- **8 features NOT WIRED**: input_guardrails, output_guardrails, per-agent MCP servers, agent hooks, recipient_agent, file_ids, additional_instructions, shared resources
- **1 feature PARTIALLY WIRED**: persona_prefix (streaming only, not non-streaming); agency graph API & usage tracking fully wired

### High Priority Missing (5-7h effort)
- **recipient_agent**: Run-time targeting of specific agent in agency
- **file_ids**: Pass files to agent at run-time
- **additional_instructions**: Per-run instruction overrides

### Medium Priority Missing (4-8h effort)
- **Input/Output guardrails**: Per-agent validation functions
- **Shared resources**: Agency-wide tools, files, MCP servers (adapter ready, DB schema missing)
- **Per-agent MCP servers**: Agent-specific MCP configuration

### Low Priority Missing (2-4h effort)
- **Agent hooks**: Lifecycle callbacks
- **Persona prefix non-streaming**: Currently only works in streaming runs

### Key Files & Call Sites
- Adapter: `python-backend/app/services/agency_swarm_adapter.py` (fully featured)
- Service: `python-backend/app/services/agency_service.py` (3 AgentConfig construction sites: 637, 886, 1406)
- FastAPI: `python-backend/app/api/agencies.py` (needs request model updates)
- DB: `apps/web/drizzle/schema.ts` (agencyAgents.nodeConfig stores all config)

### Complete Feature Matrix
See full analysis in `agency-swarm-v1-8-integration-status.md` for 21 features with status, files, and implementation guidance.

---

## Skill LLM Model Selection System — Complete Analysis (2026-03-12)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `skill-llm-model-selection-system.md` — Full technical research brief with schema analysis, current architecture, risks, gaps
- `skill-llm-model-selection-QUICK-REF.md` — Fast lookup table, file locations, data flow diagram, missing features

### Key Findings
- **Skills table**: ✅ COMPLETE — all LLM model fields exist (llmModelId, defaultModel, preferredProviderId, strictProviderPin)
- **model_provider_map**: ✅ COMPLETE — has priority field and capability metadata (vision, tools, structured output, etc.)
- **Priority cascade**: skill.llmModelId > skill.defaultModel > conversation > system_default (skill cannot be overridden)
- **Missing**: Capability-aware filtering (can request vision but get non-vision model), priority assignment in OpenRouter sync
- **Gaps**: No auto-sync on startup, executionPolicyJson stored but unused, media vs LLM creditCost fields inconsistent

### Implementation Gaps
1. ❌ Priority assignment in model sync (modelSyncService always defaults to 0)
2. ❌ Capability-aware model selection (no filter by skill requirements vs model capabilities)
3. ⚠️ Admin UI completeness (unknown if priority is editable in UI)
4. ⚠️ Model metadata display in Skill Settings (unknown what users see)

---

## chainTo Skill Chaining System — Complete Analysis (2026-03-11)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `chainTo-skill-chaining-system.md` — Technical deep-dive
- `CHAINTON-RESEARCH-BRIEF.md` — Full research brief with findings, risks, options, recommendation
- `chainTo-CODE-LOCATIONS.md` — Line-by-line code references
- `chainTo-QUICK-REFERENCE.md` — Quick lookup guide
- `chainTo-IMPLEMENTATION-SUMMARY.md` — What exists, what's missing, implementation roadmap

### Quick Summary
- **Two-level chains**: Skill-level (`chainTo: target`) + pattern-level (per-trigger override)
- **Complete infrastructure**: YAML parsing ✅, database storage ✅, detection ✅, client exposure ✅
- **Missing execution**: NO automatic chaining or output passthrough yet
- **Existing uses**: Image Prompt Engineer → image-creator; Video Prompt Engineer → video-creator
- **Recommendation**: Implement Option C (Hybrid auto-chain with user control) — 5-8 hours effort

### Key Code Locations
| Task | File | Lines |
|------|------|-------|
| Parse chainTo | parser.ts | 14-28, 182-204 |
| Define TriggerRule | types.ts | 26-35 |
| Store in DB | schema.ts | 2377 (chainTo), 2337 (triggerPatterns) |
| Sync from folder | skillRegistry.ts | 69-72, 317, 359, 452 |
| Detect chains | skillDetector.ts | 147-148 |
| Expose to API | chat.ts | 1128, 1134 |
| Execute skill | chat.ts | 1211 (NO chainTo handling) |

---

## Article Writer Skills — Complete Analysis (2026-03-11)

### Status: RESEARCH COMPLETE
**Research artifact**: `article-writer-skills-analysis.md` (3,500+ lines)

### Quick Summary
- **8 skills analyzed**: Business, Education, General, Lifestyle, Marketing, Parenting, Creative Story, Documentary
- **Common architecture**: All use `article_generation` category, `llm-only` execution, bilingual UI schemas
- **TTS-safe writing**: All enforce symbol replacements (/, &, +, %, etc.) for text-to-speech
- **Thai language**: Complete bilingual support (English/Thai) in all UI schemas
- **Output formats**: Markdown (default), Plain Text (TTS-friendly), JSON (Parenting only)
- **14 storytelling structures** (HPSO, AIDA, PAS, Hook-Insight-Tip, Before-After, Story Flow, My Why, Complain-Recall, FAB, STAR, SCR, Inverted Pyramid, Listicle, QA Flow)
- **Extensive compliance**: Brand protection, no exaggerated claims, regulated category disclaimers (varies by skill)

### Unique Skill Differentiators
| Skill | Unique Features |
|-------|-----------------|
| **Business** | Financial figures spelled out; decision-maker focus |
| **Education** | Learning objectives; practice questions; academic integrity |
| **General** | Bullet points preference; most extensive regulated categories |
| **Lifestyle** | Vivid descriptions; wellness focus; health/supplements strict |
| **Marketing** | ROI/campaign structure; KPIs; competitive advantage |
| **Parenting** | Age-range targeting; JSON output; medical safety paramount; red flags section |
| **Creative Story** | Genres/moods; target audience; dialogue toggle; minimal compliance |
| **Documentary** | Factual accuracy; interview segments; narrator voice; multiple perspectives |

### Key Findings for Implementation
1. All skills have matching `input.schema.json` (JSON Schema) and `ui.schema.json` (custom UI format)
2. Bilingual labels everywhere: `label` + `labelTh`, `helpText` + `helpTextTh`, etc.
3. Parenting is most complex (5 sections, age-range targeting, medical disclaimers)
4. Creative Story has no storytelling structures (uses genre/mood/audience instead)
5. Documentary is strictest on factual accuracy (no fabricated quotes/stats)
6. All support reference_images for visual context incorporation
7. Word count range: 120–8000 words (consistent validation)

### When to Use Which Skill
- **Business**: Strategic, professional, decision-making focused
- **Education**: Learning, teaching, pedagogical content
- **General**: Catch-all, versatile, no domain assumptions
- **Lifestyle**: Personal development, wellness, vivid and inspirational
- **Marketing**: Campaigns, audience targeting, persuasive, ROI-driven
- **Parenting**: Baby/child advice, medically safe, age-specific
- **Creative Story**: Fiction, emotional engagement, character-driven
- **Documentary**: Factual investigation, educational, authoritative

---

## Skill Execution System Architecture (2026-03-11)

### Status: RESEARCH COMPLETE
**Research artifact**: `skill-execution-system-analysis.md`

### Key Findings Summary
- **Skill Loading**: Database-driven (primary) with folder auto-sync (secondary), 60-second cache TTL
- **Content Delivery**: skill.md markdown body → system prompt (not user message)
- **Model Selection**: Three-tier hierarchy: skill's llmModelId > conversation model > "gpt-4o-mini" default
- **Model Routing**: Multi-provider lookup via `modelProviderMap` table, health-checked, fallback support
- **No Capability Detection**: Currently no metadata for model capabilities (vision, tool-use, context length, etc.)
- **Cost Tracking**: Pricing from modelProviderMap, logged to providerUsageLog
- **Auto-Triggering**: Optional regex-based pattern matching for skill detection

### Metadata Support
Skills can specify via frontmatter:
- `llm_model_id` — Force specific LLM for this skill
- `preferred_provider_id` — Prefer specific provider
- `strict_provider_pin` — Only use this provider, no fallback

### Critical Gap
No mechanism for skills to declare model requirements (e.g., "I need vision") or system to auto-select compatible models.

### Next Steps
1. Add model capability metadata to `modelProviderMap`
2. Create `llm_requires` frontmatter field for skills
3. Implement automatic capability-aware model selection

---

## ImageSourcePicker Component Design (2026-03-10)

### Status: RESEARCH COMPLETE, READY FOR IMPLEMENTATION
**Research artifact**: `image-source-picker-research.md`

### Key Findings
- **Two library APIs exist**: `library.listDocuments` (uploaded/organized) + `media.listTasks` (generated)
- **Working pattern exists**: AIDraftModal.tsx has complete "From Library" picker (lines 1497-1604)
- **Recommended approach**: Extract existing pattern into reusable `ImageSourcePicker.tsx` component
- **Scope options**: "all" (public+shared+own), "my_library" (own only), "shared_groups"
- **Key considerations**: URL resolution for relative paths, permission checking, image load errors

---

## Fashion & Clothing Reviewer Skill — Complete Research (2026-03-10)

### Status: READY FOR IMPLEMENTATION
**Research artifacts created**:
1. `fashion-clothing-reviewer-research.md` — 10-section comprehensive analysis (1,200 lines)
2. `fashion-reviewer-legal-framework.md` — Thai regulations + prohibited claims table (600 lines)
3. `fashion-reviewer-implementation-spec.md` — Field specs, JSON schemas, test cases (500 lines)

### Key Findings Summary

**Domain Differences from Household/Beauty**:
| Aspect | Household | Beauty | Fashion | Impact |
|--------|-----------|--------|---------|--------|
| **Fit Variability** | None | Skin type | Body type + brand fit | Need fit_profile field |
| **Materials** | Generic | Ingredient-specific | CRITICAL (fabric care) | New fabric_material field |
| **Authenticity Risk** | Low | Low | HIGH (counterfeits) | Must refuse fakes; verify secondhand |
| **Care Complexity** | Use-based | Routine-based | Fabric-dependent (wash/dry) | Boolean toggle for care section |
| **Sustainability** | Generic eco-claims | Limited | MAJOR marketing angle | New sustainability_focus field |
| **Product Lifecycle** | Mostly new | Mostly new | New + secondhand + vintage | Condition field affects review tone |

**7 NEW FORM FIELDS** (beyond 8 universal):
1. **clothing_type** (select) — tops, bottoms, dresses, outerwear, shoes, bags, accessories, watches, etc.
2. **fabric_material** (multi-select) — cotton, polyester, silk, leather, denim, wool, nylon, spandex, recycled materials
3. **fit_profile** (select) — petite, tall, plus-size, athletic, pear/apple-shaped, standard, general
4. **special_features** (multi-select) — waterproof, UV protection, breathable, stretch, wrinkle-resistant, quick-dry, etc.
5. **condition** (select) — new, secondhand_preloved, vintage, restored, handmade_custom
6. **care_complexity** (boolean) — Enables detailed "Care & Maintenance" section (wash/dry/storage/longevity)
7. **sustainability_focus** (boolean) — Frames review through eco-conscious lens; requires certification verification

**Critical Legal Requirements** (Thai + EU standards):
- **Fiber Content** (TIS 443-2558): Tag verification required; no unverified %-claims
- **Authenticity** (Trademark Act B.E. 2559): Must refuse counterfeits; pennalties up to 1M THB
- **Durability Claims** (Consumer Protection Act): All must be hedged; no "guaranteed" or "never"
- **Sizing Accuracy**: Qualify with body type; never claim universal fit
- **Sustainability**: Only with visible certification logos (Fair Trade, GOTS, B Corp, etc.)
- **Secondhand Items**: Disclosure disclaimer for professional authentication needed

**Recommendation**: Clone beauty-skincare-reviewer structure (4 sections → 5 sections) + customize. Estimated 4-6 hours.

**Next Phase**: Implementation with skill.md content drafting + validation against Thai regulations.

---

## Presentation Rendering Pipeline Architecture

### Overview
Presentations render through a full-stack pipeline:
1. **Node.js**: Generates self-contained HTML per slide with inlined slideContent JSON
2. **Playwright** (Python): Screenshots the rendered HTML via Chrome
3. **Python FFmpeg/Pillow**: Post-processes screenshots into MP4/PDF/ZIP

### Key Insight: Background Field Exists But Unused
- **Schema**: `presentationSlideContentSchema` includes optional `background` field (contracts.ts:342)
- **Background type**: `{ type: "color", value: "#XXXXXX" } | { type: "image", url: "..." }`
- **Current behavior**: Background NOT rendered — slides always show hardcoded white background
- **Why**: JavaScript renderer in slideRender.ts only processes elements, not background

### Data Flow
```
DB slideContent JSON (has background field)
  → renderSpec (contains slideId, title, durationMs but NOT slideContent)
  → HTML with inlined JSON (line 147 of slideRender.ts)
  → JavaScript renderElements() (line 475, skips background)
  → Playwright screenshot (always sees white background)
  → Python post-processing (has no access to background data)
```

### Key Files for Implementation
- **Node.js HTML generation**: `apps/web/server/routes/slideRender.ts` (self-contained slide HTML)
- **Presentation render spec**: `apps/web/server/services/presentationPlaybackExport.ts` (buildPresentationRenderSpec, line 1019)
- **Data contracts**: `apps/web/shared/presentation/contracts.ts` (background schema, line 331)
- **Python render**: `python-backend/app/tasks/presentation_render.py` (Playwright screenshot, line 283-354)

### Recommended Implementation: Option A (Browser Rendering)
Render background in JavaScript on the `#slide-canvas` element BEFORE rendering elements.
1. Add `renderBackground()` function after line 492 of slideRender.ts
2. Extend readiness gate (waitForMediaThenReady) to track background image loading
3. Pattern to follow: `normalizeMediaSrc()` (line 294) for URL resolution, `waitForMediaThenReady()` (line 612) for image load tracking

### Critical Insertion Points
- **CSS defaults**: Lines 118-144 of slideRender.ts (remove hardcoded white)
- **Render flow**: Line 756-758 (call renderBackground before renderElements)
- **Readiness gate**: Line 612-712 (extend for background image loading)
- **Element helpers**: Line 294-400 (normalizeMediaSrc, applyBaseStyle pattern to follow)

### Readiness Gate Details
- Current timeout: 8000ms (READY_GATE_HARD_TIMEOUT_MS, line 57)
- Media loading tracked via `waitForMediaThenReady()` callbacks
- Slides marked "degraded" if media loads fail but layout is ready
- Background image must follow same pattern

## SPEC 039 Section 01 — Task Execution Planning (2026-03-11)

### Status: RESEARCH COMPLETE
**Research artifact**: `spec-039-section-01-research.md` (3,500+ lines)

### Key Findings Summary
- **All 13 required files exist** and are documented with signatures
- **taskRuns table missing traceId column** — must be added in implementation (varchar 64)
- **Two-phase model resolution**: Plan-time (infer requirements) + Execution-time (filter & rank)
- **Immutable plans**: TaskExecutionPlan frozen after creation, stored as JSON in taskRuns.planJson
- **Reusable infrastructure**: traceContext.ts (AsyncLocalStorage), taskRunStore.ts (DB layer), modelResolver.ts (ranking logic)

### Implementation Strategy
1. **Add traceId column** to taskRuns table in schema.ts
2. **Integrate createTaskRun calls** at request entry point (llmRoutes.ts)
3. **Wrap requests in runWithTrace()** to propagate traceId through async chain
4. **Pass traceId to taskRunStore.createTaskRun()** input
5. **Update llmRoutesHandler.ts** to call taskRunStore functions after model resolution

### Key Signatures (Ready for Implementation)
- `buildExecutionPlan(input: TaskClassificationInput): TaskExecutionPlan` → Frozen, immutable
- `resolveModelFromPlan(plan, models): ModelWithPricing | null` → Returns best match by strategy
- `createTaskRun(input: CreateTaskRunInput): Promise<{ id: number }>` → DB insert
- `createStepAttempt(input: CreateStepAttemptInput): Promise<{ id: number }>` → DB insert
- `completeStepAttempt(input: CompleteStepAttemptInput): Promise<void>` → DB update + credit accumulation

### Database Integration Ready
- capabilityRegistry.loadEnabledModelsWithCapabilities() — Loads from modelProviderMap + llmProviders
- taskRunStore operates on two tables: taskRuns, taskStepAttempts
- All FK constraints already in place (users, tenants, conversations)

### File Paths for Implementation
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/taskExecutionPlanner.ts` (read-only)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/modelResolver.ts` (read-only)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/taskRunStore.ts` (integrate with)
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts` (main integration point)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRoutesHandler.ts` (thin handlers)
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (taskRuns table, line 5017)

---

## Draft with AI Dialog & Skill Dynamic Input System

### Dialog Component Location & Structure
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx`
- **Component name**: `AIDraftModal`
- **Prop interface**: `AIDraftModalProps` (lines 89-108)
- **State management**: 30+ useState hooks for all form fields including `articleSkillParams` (line 358)

### Core Fields in AIDraftModal
Lines 323-371 define the form state:
- topic, useCustomArticle, customArticleText, hideTextOnSlides, numSlides (slides count)
- language (auto/en/th), selectedArticleSkill (skill slug), selectedImageSkill (Media Skill Override)
- imageModel (Media Model), generateAudio, audioModel, draftAspectRatio
- advancedMediaOptionsEnabled, mediaModelExtraParams, imagePromptContext
- articleSkillParams (dynamic skill input parameters)

### Dynamic Skill Input Rendering Component
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/media/DynamicSkillForm.tsx`
- **Component name**: `DynamicSkillForm` (lines 461-473)
- **Props**: schema, language, values, onChange, onImageUpload, referenceImages, onRemoveImage, isUploading, excludeFields, onStyleAction
- **Schema type**: `SkillInputSchema` (imported from same file, lines 143-150)

### SkillInputSchema Structure (DynamicSkillForm.tsx lines 143-150)
```typescript
interface SkillInputSchema {
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  sections: SkillInputSection[];  // Array of form sections
  outputMapping?: Record<string, string>;
}

interface SkillInputSection {
  id: string;
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  fields: SkillInputField[];  // Rendered form fields
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  icon?: string;
}

interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider" | "boolean" | "image" | "images" | "imageUpload" | "file" | "files" | "model-search" | "workflow-selector" | "array";
  label: string;
  labelTh?: string;
  placeholder?: string;
  required?: boolean;
  default?: any;
  defaultValue?: any;
  options?: Array<{ value: string; label: string; labelTh?: string }>;
  // ... many more optional fields for validation, cascading, etc.
}
```

### tRPC Skill Schema Endpoint
- **Router file**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts`
- **Procedure name**: `getInputSchema` (lines 1019-1134)
- **Input**: `{ skillId: z.string() }`
- **Output**: `{ skillId: string; hasSchema: boolean; schema: SkillInputSchema | null }`
- **Called from AIDraftModal**: Line 419-422
  ```typescript
  const skillSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedArticleSkill },
    { enabled: selectedArticleSkill !== "", staleTime: 300_000 },
  );
  ```

### How Schemas Are Located & Loaded (skills.ts lines 1042-1118)
1. Priority: ui.schema.json FIRST, then input.schema.json
2. Search paths (in order):
   - Skill's folderPath (if available): `{folderPath}/schemas/{ui|input}.schema.json`
   - SKILLS_DIR variations: `skills/{skillId|slug-variants}/schemas/{ui|input}.schema.json`
   - Root skills directories: scans all folders for matches
3. Schema format detection (line 1105-1113):
   - If schema has `sections` property → custom UI schema format (ready to use)
   - Else if schema has `properties` → standard JSON Schema (converted via `convertJsonSchemaToSkillSchema()`)
4. Validation: skillId must match if found in generic directory scan

### Skill Parameters Data Flow
In AIDraftModal:
1. **Form rendering** (lines 1024-1050 in AIDraftModal):
   ```jsx
   {skillSchema && (
     <DynamicSkillForm
       schema={skillSchema}
       language={language}
       values={articleSkillParams}
       onChange={setArticleSkillParams}
       onImageUpload={uploadReferenceMutation.mutateAsync}
       referenceImages={/* ... */}
       // ... other props
     />
   )}
   ```

2. **On Generate click** (lines 1166-1173): articleSkillParams sent to backend as `draftSkillParams` or `articleSkillParams`
   ```typescript
   draftSkillParams: !useCustomArticle && Object.keys(articleSkillParams).length > 0
     ? articleSkillParams
     : undefined,
   articleSkillParams: !useCustomArticle && isArticleDraftSkill(selectedDraftSkillRecord)
     ? articleSkillParams
     : undefined,
   ```

3. **Backend endpoint**: `trpc.presentation.ai.generateDraft.useMutation()` (line 724)

### How Skill Selection Works
- User picks skill from combobox (e.g., "VEO Video Creator")
- selectedArticleSkill is set to skill slug (line 330)
- Skill slug triggers schema fetch via tRPC (line 419-422)
- Schema determines which fields render in DynamicSkillForm
- User fills form, values stored in articleSkillParams
- On submit, articleSkillParams passed to generateDraft mutation

### Existing Dynamic Form Components Using Same Pattern
- `ChatDynamicSkillForm.tsx` - Chat interface for skill input
- `MobileSkillForm.tsx` - Mobile optimized skill form rendering
- `useSkillForm.ts` - Shared hook for form state management

## Chat Skill Forms — Language Rendering Issue (2026-03-10)

### WHERE Skill Forms Are Rendered in Chat
1. **useChatSkillForm hook**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.skillForm.tsx`
   - Exports `useChatSkillForm()` hook (lines 57-445)
   - Called from ChatView.tsx
   - `renderSkillForm()` method returns a Card component

2. **ChatDynamicSkillForm component**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx`
   - Imported by ChatView.skillForm.tsx (line 11)
   - Renders DynamicSkillForm with hardcoded props
   - **LINE 104-112**: Critical code snippet:
     ```tsx
     <div className="bg-muted/30 rounded-lg p-4">
       <DynamicSkillForm
         schema={schema}
         values={values}
         onChange={onChange}
         onImageUpload={handleImageUpload}
         excludeFields={[]}
         className="space-y-4"
         language="en"  {/* <- HARDCODED TO ENGLISH */}
       />
     </div>
     ```

### USER FLOW: How Chat Skills Display Forms
1. User types `/skill` or clicks skill button in chat
2. `useChatSkillForm()` hook initializes in ChatView
3. User selects skill → `openSkillForm(skillId)` called (line 108)
4. Fetches schema via `utils.skills.getInputSchema.fetch()` (line 113)
5. `renderSkillForm()` returns Card wrapper (line 258-366)
6. Card contains `<ChatDynamicSkillForm schema={...} />` (line 312)
7. ChatDynamicSkillForm.tsx hardcodes `language="en"` (line 111)
8. DynamicSkillForm.getText() always uses English labels (line 516-519)

### ISSUE FOUND: No Language Toggle in Chat Skill Forms
- **AIDraftModal** (Draft with AI) has language selector (line 330 in AIDraftModal.tsx): `const [language, setLanguage] = useState<'auto' | 'en' | 'th'>('auto');`
- **ChatDynamicSkillForm** has NO language state and ALWAYS passes `language="en"`
- Result: Even if schema has `titleTh`, `labelTh`, form displays in English only
- User sees Thai labels ONLY if they override via getText() logic, but chat form prevents that

### Props Interface for DynamicSkillForm
From `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/media/DynamicSkillForm.tsx` (lines 444-459):
```typescript
interface DynamicSkillFormProps {
  schema: SkillInputSchema;
  language?: "en" | "th";      {/* <- Optional, defaults to "en" */}
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onImageUpload?: (files: FileList) => Promise<string[]>;
  referenceImages?: ReferenceImage[];
  onRemoveImage?: (index: number) => void;
  isUploading?: boolean;
  excludeFields?: string[];
  onStyleAction?: (action: StyleAction) => void;
  className?: string;
}
```

### getText() Logic in DynamicSkillForm (lines 516-519)
```typescript
const getText = (en: string | undefined, th: string | undefined) => {
  if (language === "th" && th) return th;
  return en || "";
};
```
- Always returns English unless `language === "th"`
- Chat form can NEVER set language to "th" because it hardcodes "en"

### Cascading/Dependent Fields Support
DynamicSkillForm implements `dependsOn` logic (lines 494-513):
- Field visibility controlled by `field.dependsOn` property
- Supports cascading selects via `field.optionGroups` (record of options by parent value)
- Parent value changes reset child field values
- Example: media model type selects options based on parent skill category

### Icon Mapping for Sections
DynamicSkillForm supports lucide icons for section headers (lines 67-81):
- Icons mapped from icon name string to React component
- Supported: sparkles, palette, wand-2, type, image, settings, video, music, zap, globe, camera, film, layers

## DynamicSkillForm Language/Localization Deep Dive (2026-03-10)

### How Language Prop Flows to TextField Labels
1. **DynamicSkillForm receives language prop** (line 463): `language = "en"`
2. **getText() helper** (lines 516-519): Selects label based on language
   ```typescript
   const getText = (en: string | undefined, th: string | undefined) => {
     if (language === "th" && th) return th;
     return en || "";
   };
   ```
3. **Applied to EVERY text element**:
   - Field label (line 603): `const label = getText(field.label, field.labelTh);`
   - Field placeholder (line 604): `const placeholder = getText(field.placeholder, field.placeholderTh);`
   - Field description (line 605): `const description = getText(field.description || field.helpText, field.descriptionTh || field.helpTextTh);`
   - Select options (line 705): `{getText(opt.label, opt.labelTh)}`
   - Multiselect badges (line 753): `{getText(opt.label, opt.labelTh)}`
   - Section titles: Implicitly via schema.sections[].title / titleTh

### ChatDynamicSkillForm's Fixed Implementation
**File**: `apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx` (lines 1-127)
- **Props interface** (lines 10-17): Does NOT accept language prop
  ```typescript
  export interface ChatDynamicSkillFormProps {
    schema: SkillInputSchema;
    values: Record<string, any>;
    onChange: (values: Record<string, any>) => void;
    isLoading?: boolean;
    error?: string | null;
    onClearError?: () => void;
  }
  ```
- **DynamicSkillForm call** (lines 104-112): Hardcoded language="en"
  ```typescript
  <DynamicSkillForm
    schema={schema}
    values={values}
    onChange={onChange}
    onImageUpload={handleImageUpload}
    excludeFields={[]}
    className="space-y-4"
    language="en"  // <-- BUG: Always English
  />
  ```

### Contrast: AIDraftModal's Flexible Implementation
**File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx`
- **Language state** (line 357): Tracks user preference
  ```typescript
  const [language, setLanguage] = useState<"auto" | "en" | "th">("auto");
  ```
- **Article generation skill form** (lines 1709-1713):
  ```typescript
  <DynamicSkillForm
    schema={articleGenSchema}
    language={language === "th" ? "th" : "en"}  // <-- Conditional
    values={articleGenParams}
    onChange={setArticleGenParams}
  />
  ```
- **Main article skill form** (lines 1888-1891):
  ```typescript
  <DynamicSkillForm
    schema={skillSchema}
    language={language === "th" ? "th" : "en"}  // <-- Conditional
    values={articleSkillParams}
  ```
- **Effect**: "Draft with AI" modal respects user's language preference, chat does not

### SkillInputField with Thai Localization (Complete Schema)
From `DynamicSkillForm.tsx` lines 84-128:
```typescript
export interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider"
       | "boolean" | "image" | "images" | "imageUpload" | "file" | "files"
       | "model-search" | "workflow-selector" | "array";
  label: string;           // English label (always required)
  labelTh?: string;        // Thai label (optional, fallback to label if missing)
  placeholder?: string;
  placeholderTh?: string;
  description?: string;
  descriptionTh?: string;
  helpText?: string;       // Alternative to description
  helpTextTh?: string;     // Alternative to descriptionTh
  required?: boolean;
  default?: any;
  defaultValue?: any;
  options?: Array<{
    value: string;
    label: string;
    labelTh?: string;      // Thai labels on options
  }>;
  // ... many more optional fields (min, max, rows, etc.)
  optionGroups?: Record<string, Array<{
    value: string;
    label: string;
    labelTh?: string;
  }>>;  // Cascading selects with Thai labels
}
```

### The Root Problem Summary
1. **Schema has Thai labels**: All fields can have `labelTh`, `placeholderTh`, `descriptionTh`, and options with `labelTh`
2. **DynamicSkillForm supports Thai rendering**: getText() function checks language prop and uses `Th` variants
3. **AIDraftModal passes language**: "Draft with AI" modal explicitly passes `language="th"` when user selects Thai
4. **ChatDynamicSkillForm hardcodes English**: Chat skill forms ALWAYS pass `language="en"`, ignoring Thai schema
5. **Result**: Thai-speaking users see English labels in chat skills even if schema has Thai translations

### Where useChatSkillForm is Called
- **ChatView.tsx**: Main chat page imports and calls `useChatSkillForm()` hook
- Returns `renderSkillForm()` which renders `<ChatDynamicSkillForm />`
- Chat page has NO language toggle UI (unlike AIDraftModal)

## Feature 034 — ResearchStoryboardBuilder Full Architecture Analysis (2026-03-14)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `feature-034-researchstoryboardbuilder-analysis.md` — Detailed technical architecture (70+ sections, 3,000 lines)
- Main deliverables in project root: `RESEARCH-BRIEF-034-ARCHITECTURE.md`, `RESEARCH-BRIEF-034-QUICK-REFERENCE.md`, `RESEARCH-BRIEF-034-ENTRY-POINTS.md`

### Executive Summary
Feature 034 implements a 3-layer structured result pipeline: **LLM text → envelope parsing (Python) → preview artifact (Node.js) → library commit (user action)**

**Key Components**:
- **Envelope Parser** (`agency_result_envelope.py`): Extracts JSON from markdown fences (```agency-result\n{...}\n```)
- **Preview Artifacts** (new table `agencyRunArtifacts`): Stores parsed results with HMAC-SHA256 commit tokens, lifecycle states
- **Commit Service** (`agencyCommitService.ts`): Renders previews to markdown/JSON, creates library items
- **SSE Streaming**: Full-duplex stream from Python backend through Express proxy to client
- **Template System** (`agencyExperienceTemplates`): Pre-configured agencies with retrieval scope (library_only, tenant_accessible, web_fallback)

### New tRPC Procedures
| Name | Purpose | Input |
|------|---------|-------|
| `agency.sendMessage` | Initiate agency run | agencyId, conversationId, message, modelOverride?, recipientAgent?, fileIds?, additionalInstructions? |
| `agency.commitPreview` | Persist preview to library | agencyId, runId, artifactId, commitToken |
| `agency.getRunDetails` | Fetch run + preview | agencyId, runId |
| `agency.getConversation` | Load full conversation | agencyId, conversationId |

### New Python Endpoints
- `POST /api/v1/agencies/{agency_id}/run` (SSE) — Streaming execution with preview_ready event
- `GET /api/v1/agencies/{agency_id}/runs/{run_id}` — Run details with structured result
- `GET /api/v1/agencies/{agency_id}/runs` — List runs
- `POST /api/v1/agencies/{agency_id}/runs/{run_id}/cancel` — Cancel run

### Data Flow
```
Message → useAgencyStream → SSE proxy (auth, credit check) → Python execute_run_stream
  → Parse envelope → Create preview artifact → Emit preview_ready SSE
  → Client onPreviewReady → Render ComparisonPreviewCard
  → User commits → tRPC commitPreview → Render to markdown/JSON → Create library item
```

### Entry Points (User Perspective)
1. **Browse agencies** → `/agencies/{id}` page
2. **Send message** → useAgencyStream.connect() → SSE stream
3. **View preview** → Preview ready event → Render card
4. **Commit** → agency.commitPreview mutation → Library item created

### Key Database Changes
- `agencyRunArtifacts`: Stores structured results (state: preview_generated → committed), payload (inline/S3), commit token
- `agencyExperienceTemplates`: Pre-configured agency templates with retrieval scope

### Intents Supported (8 types)
research_report, video_storyboard, presentation_deck, hotel_comparison, ticket_comparison, shortlist, media_prompt, chat_reply

### Security Notes
- Commit token: HMAC-SHA256(artifact_id + summary + run_id, LLM_ENCRYPTION_KEY)
- Retrieval scope: Filters external tools for library_only mode (web_search removed, library_retrieval kept)
- Permission checks on library creation

### Risks
1. Envelope parsing is post-hoc (not guaranteed) → fallback to text response works
2. Commit token not time-bound → consider expiration timestamp
3. Retrieval scope enforcement incomplete (agent-level only, not service-wide)
4. Payload storage threshold at 64KB → edge cases near boundary

### Implementation Status
- 7/7 sections implemented (commits a867278b–a5c4e09a)
- 52 web tests passing + 18 Python tests passing
- Ready for production with security audit

### Key Files
- tRPC router: `apps/web/server/routers/agency.ts` (lines 1393–1650+)
- Envelope parser: `python-backend/app/services/agency_result_envelope.py`
- Python execute: `python-backend/app/services/agency_service.py` (execute_run_stream, _build_preview_artifact)
- Commit service: `apps/web/server/services/agencyCommitService.ts`
- Client hook: `apps/web/client/src/hooks/useAgencyStream.ts`
- Chat page: `apps/web/client/src/pages/AgencyChat.tsx`

---

## Chat Memory System Architecture (2026-03-14)

### Status: RESEARCH COMPLETE
**Research artifacts**:
- `chat-memory-system-research.md` — Full technical deep-dive (3,000+ lines, 6 sections)
- `chat-memory-QUICK-REF.md` — Fast lookup table, config, functions by purpose, file locations

### Executive Summary
SmartSpecPro implements a **three-tier memory system**:
1. **Buffer Memory** — Recent 20 messages (most recent first)
2. **Summary Memory** — LLM-generated summaries of older messages (via conversationSummaries table)
3. **Entity Memory** — Long-term facts about users, projects, preferences, technical details (11 types)

Context building is **budget-aware** with token estimation, persona integration, and project scoping. Attachments are stored in messages.attachments JSON but NOT currently processed or included in LLM context.

### Key Findings
- ✅ **All three memory tiers fully implemented** — getBufferMessages, getSummaries, upsertEntityMemory all working
- ✅ **Attachments stored** — JSON array in messages table (type, url, name, size, mimeType, thumbnail)
- ✅ **Context building is sophisticated** — Budget allocation (40% entity, 60% summary, rest buffer), persona resolution, relevance ranking
- ✅ **Entity extraction works** — Pattern-based (11 types) with PII filtering, reinforcement tracking
- ❌ **Attachments never included in LLM context** — buildChatContext() loads but discards attachment data
- ❌ **No vector/embedding infrastructure** — pgvector not installed, no semantic similarity search
- ❌ **No attachment processing** — No OCR, transcription, video frame extraction, or description generation

### Context Building Flow
```
buildChatContext(conversationId, userId, systemPrompt?, options?)
  ↓
1. Persona resolution → prepend to systemPrompt
2. Entity memories (40% budget) — Rules always, others ranked by relevance
3. Summaries (60% budget) — Current conversation + project summaries
4. Buffer messages (remaining) — Recent messages fill remaining budget
  ↓
Returns ChatContext with systemPrompt, entityContext, summaryContext, bufferMessages, totalTokenEstimate
```

### Memory Modes
- **"full"**: All three tiers (entity + summary + buffer)
- **"no_long"**: Summary + buffer (skip entity)
- **"off"**: Buffer only (skip entity + summary)

### Critical Gaps for Multimodal Memory
1. No pgvector extension (can't do semantic search)
2. No attachment metadata table (dimensions, duration, etc.)
3. No attachment description/transcription pipeline
4. No attachment embeddings for retrieval
5. Attachments never passed to LLM in context

### Key Database Tables
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| messages | Chat messages | attachments (JSON), artifacts, skillUsed, creditsUsed |
| conversations | Conversation metadata | memoryMode, projectId, personaId |
| conversationSummaries | LLM-generated summaries | summary, messageRangeStart, messageRangeEnd |
| entityMemories | Long-term facts | entityType (11 types), facts (array), projectId, importance (1-10) |

### Implementation Readiness
- Phase 1C (Attachment descriptions): 3-4 weeks, unblocks immediate features
- Phase 2 (Vector embeddings): 5-8 weeks, full semantic search
- Files: memoryService.ts (all logic), chat.ts (router), schema.ts (tables)

---

## AgencySwarm Tool System (2026-03-10)

### Status: RESEARCH COMPLETE
**Research artifact**: `agency-swarm-tool-system-research.md`

### Key Findings
- **10+ builtin tools** exist (web-search, skill-executor, browser, etc.)
- **Tool invocation flow**: Agent → Tool Bridge → Risk-routing → HTTP/Sandbox dispatch → Node.js
- **Whitelist enforcement** by risk level (low: always, medium: whitelist, high: whitelist + sandbox)
- **builtin-presentation-create is MISSING** — ready for implementation
- **Configuration pattern**: Base config (DB) + instance config (per-agent overrides)
- **Per-request instantiation**: Tool classes created fresh for each agent, never reused

### Recommendation
Implement builtin-presentation-create following established pattern:
1. Add to _BUILTIN_ENDPOINTS + _BUILTIN_RISK_LEVELS in agency_tools.py
2. Implement POST /api/internal/tools/presentation-create endpoint (Node.js)
3. Connect to existing presentation AI generation
4. Estimated 4-6 hours

---

## Grok Imagine API Access & Upscale Capabilities (2026-03-11)

### Status: RESEARCH COMPLETE
**Research artifact**: `grok-imagine-xai-research.md`

### Quick Summary
- **API Access**: Grok Imagine is accessed ONLY via kie.ai aggregator, NOT direct xAI API (api.x.ai)
- **No Replicate/fal.ai**: Only kie.ai integration exists in SmartSpecPro
- **Image generation only**: Grok Imagine type="image", no video support
- **Upscaling unknown**: No upscale parameters documented in kie.ai integration
- **Output sizes fixed**: 1024x1024, 1024x1792, 1792x1024 (not upscaling)
- **kie.ai integration complete**: Task-based API (createTask → poll status), model mapping with fallbacks, callback support

### Key Code Locations
| Task | File | Lines |
|------|------|-------|
| Model definition | `apps/web/server/services/mediaGenerationService.ts` | 139-148 |
| KieAI provider class | `python-backend/app/llm_proxy/providers/kie_ai_provider.py` | 118-550+ |
| Model fallback map | `python-backend/app/llm_proxy/providers/kie_ai_provider.py` | 14-55 |
| Gateway routing | `python-backend/app/llm_proxy/gateway_unified.py` | 662-788 |
| Media provider service | `python-backend/app/services/media_provider_service.py` | 77-150+ |

---

## SPEC 034 RESEARCH — Skills Inventory & Orchestration (2026-03-10)

### Comprehensive Research Completed
**Survey of all 29 existing skills in SmartSpecPro**, mapped to spec 034 requirements:

**Key Findings**:
- 29 total skills across 13 categories
- 4 CRITICAL skills for spec 034: Image Prompt Engineer, Video Prompt Engineer, Nano Banana Infographic, Storyboard Writer
- 8 HIGH-value article writers (business, education, marketing, documentary, creative, lifestyle, general + storyboard writer)
- 2 NEW skills needed to close gaps: Research Aggregator, Slide Layout Generator

**Detailed Documentation**:
1. **skills-inventory-comprehensive.md** — Master table of all 29 skills with relevance ratings, input/output specs, and file paths
2. **spec-034-skill-orchestration-flows.md** — Skill chaining patterns, 4 complete end-to-end flow examples (Business Deck, Educational, Marketing, Social Media), new skill specifications

**Recommendation**: Reuse 60% existing skills (immediate integration), build 2 targeted new skills (Research Aggregator, Slide Layout Generator), create adapter layer for presentation rendering.

**Estimated effort**: 10-14 days (2-person team)

### Skill Categories by Relevance

**CRITICAL (Direct spec 034 integration)**:
- Image Prompt Engineer (v2.1) — multi-platform image optimization
- Video Prompt Engineer (v1.0) — cinematic prompt generation
- Nano Banana Infographic — slide illustration + data viz
- Storyboard Writer (v1.0) — scene-by-scene visual narrative

**HIGH (Strong supporting roles)**:
- All 8 Article Writers (business, education, marketing, documentary, creative, lifestyle, general, storyboard)
- Code Docs Assistant (pattern to follow for research aggregation)
- Smart Landscape Designer (image prompt refinement pattern)
- Storyboard to Video Prompts (scene → video conversion)
- Cartoon Storyboard Prompts (character consistency)

**MEDIUM (Conditional use)**:
- Brainstorm (multi-angle ideation)
- Agency Creator (multi-agent orchestration pattern)
- Viral Talking Objects (animated character design)
- VEO Video Creator (specialized Veo 3.1 generation)
- Creative Story Writer (narrative framing)

**LOW (Not relevant)**:
- Translation, Chat Alert, Audio/Sound generation, Household Product Reviewer, Workflow AI Editor

### See Detail Files
- Main inventory table: `skills-inventory-comprehensive.md`
- Orchestration flows & chaining: `spec-034-skill-orchestration-flows.md`
