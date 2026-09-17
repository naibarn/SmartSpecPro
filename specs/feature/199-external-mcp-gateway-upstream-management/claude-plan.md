# Feature 199 External MCP Gateway and Upstream Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a governed external MCP upstream management layer that safely connects, discovers, reviews, authorizes, executes and reconciles remote or Runner-hosted MCP capabilities.

**Architecture:** Extend existing Web MCP registry/routes/routers, persistence and Python MCP adapters. Management state is distinct from capability projection; all calls pass Feature 196 authorization and use Feature 195 Jobs when durable. Remote transport and Runner-local transport are adapters. Feature 200 consumes MCP only through this gateway and the shared capability boundary.

**Tech Stack:** TypeScript/React, Drizzle/PostgreSQL, Python MCP client/executor, existing OAuth/secret services, Vitest/pytest/Playwright where available.

**Spec:** `specs/feature/199-external-mcp-gateway-upstream-management/spec.md`

## Global Constraints

- Reuse existing MCP tables/services and migrate only when no canonical equivalent exists.
- Never expose upstream credentials to LLMs, clients or logs.
- Lazy discovery is bounded; schema/risk changes require quarantine/review.
- Tenant/role/agent policy, revocation and approval are enforced server-side.
- No duplicate Job, Runner, Capability, Retrieval, Approval, Asset, Billing or Audit truth.
- External Agent → arbitrary upstream MCP is prohibited; MCP access is through 196/199.
- No retired execution systems and no whole-repository typecheck.

## Source coverage ledger

Sections 1–5 cover position, terms and architecture; 6–14 cover requirements, model, registry, discovery, lifecycle, risk, permissions, OAuth and security; 15–21 cover health, backpressure, Job/Runner/OpenAI/LangGraph integration; 22–25 cover UI, APIs, observability and failure handling; 26–30 cover migration, tests, acceptance, implementation decision and definition of done; Appendices A–Q are treated as mandatory regression/security/release checklists; the codebase baseline and trailing summary sections are implementation evidence requirements. Six sections below map every source heading and appendix.

## Execution order

`section-01-contracts-and-persistence → section-02-discovery-auth-and-quarantine → section-03-policy-and-execution → section-04-api-and-observability → section-05-ui → section-06-migration-tests-and-acceptance`

### Task 1: Gateway contracts and persistence mapping

**Files:** Add/modify MCP domain types/services near `apps/web/server/services/mcp*`, `apps/web/server/routers/mcpConnections.ts` and `mcpServers.ts`, `apps/web/drizzle/schema.ts` only for missing records; add migrations/tests.

Define upstream server, installation, connection, transport profile, protocol revision, tool/resource/prompt projection, credential reference, risk finding, quarantine, grant, revocation and execution handle contracts. Map existing provider templates/user connections/shares/schema cache/usage/media/server assignment rows before proposing new tables.

**Tests first:** schema mapping, tenant uniqueness/idempotency, secret redaction, revocation state and migration safety.

### Task 2: Discovery, OAuth, schema/risk and quarantine lifecycle

**Files:** Modify `mcpConnectionService.ts`, OAuth broker/authorization services, schema cache and Python MCP client/manager; add tests.

Implement protocol probe/version negotiation, HTTP/STDIO/Runner transport boundaries, OAuth metadata/PKCE/token rotation, bounded lazy discovery, schema canonicalization, risk classification, quarantine/review, reconnect/health and revocation. Treat protocol version and SAH contract version as separate axes.

**Tests first:** metadata fallback, invalid redirect/token, OAuth expiry/revocation, malformed schema/duplicate keys, pagination bounds, schema drift quarantine, protocol downgrade and reconnect race.

### Task 3: Capability policy and governed execution

**Files:** Modify MCP registry/execution, capability resolver integration, `jobControlPlaneGateway.ts` and Runner bridge; add Web/Python tests.

Expose selected capabilities through Feature 196 resolver, enforce tenant/role/agent/connection/grant/approval policy, reserve budgets, and choose synchronous versus durable Job execution. Recheck grants and capability revision at effect time; use Feature 197 Runner identity for local upstreams. Keep Feature 200 direct access impossible.

**Tests first:** policy deny, high-impact approval, stale grant, expired lease, duplicate effect/idempotency, provider outage, Runner disconnect and direct-bypass rejection.

### Task 4: API, activity, lineage and operational controls

**Files:** Modify/add MCP routers, telemetry/observability services, RAG projection and data retention/deletion handlers; add route/contract tests.

Implement admin/user/agent-scoped APIs for register, install, discover, review, connect, test, enable, revoke, execute, health, activity, reconciliation and deletion. Use server-derived tenant scope, stable error taxonomy, trace/job correlation, bounded payloads and RAG lineage with ACL.

**Tests first:** endpoint auth, idempotent mutations, pagination, error shape, audit lineage, retention/deletion, rate limits and projection reconciliation.

### Task 5: UI and user workflow

**Files:** Extend `McpServerManager.tsx`, existing MCP settings/admin panels and Chat approval/capability components; add focused React/browser tests.

Provide role-specific MCP Center, Connected Apps, installation wizard, connection detail, tool review/quarantine, health/activity, permissions, Runner-hosted setup and in-chat approval. Ordinary users see app/capability language rather than raw transport/secrets.

**UI/UX Contract:** Target roles are Platform Admin/Tenant Admin reviewing upstreams and end users connecting approved apps. Existing pattern references: `McpServerManager`, `McpConnectPanel`, `McpServersSettingsPanel`, current settings forms and Chat approval cards; reuse these patterns. Surfaces include catalog, add/install wizard, OAuth callback state, connection detail, tool/risk review, permissions, health/activity, deletion and Chat approval. State matrix covers loading/empty/error/success/partial/quarantine/revoked/disabled/selected/hover/focus. Responsive: mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900 and wide desktop 1280×800 for tables. Accessibility covers keyboard flow, focus, labels/semantics, contrast, reduced motion and safe live updates. Visual direction uses current product tokens and keeps security state prominent. Copy must be bilingual, explicit about Connect/Review/Quarantined/Revoked/Needs authorization and never display token values. Browser evidence covers admin register → review → enable, user connect → grant, revoke and Chat approval.

### Task 6: Migration, compatibility, testing and acceptance

**Files:** Update migration/runbook docs under `docs/operations/feature-199`, add compatibility/security tests and acceptance evidence.

Roll out read-only mapping, discovery, quarantine, approved execution, Runner bridge, RAG projection and UI in stages. Include mixed protocol/contract versions, rollback, incident containment, credential rotation, load/backpressure and all Appendix A–Q audit checks. Do not remove existing MCP paths until parity and rollback proof exists.

## Definition of done

Every source section and appendix is mapped, current MCP foundations are reused, upstream lifecycle and policy are tested, credentials are protected, no direct Agent bypass or duplicate control plane exists, UI evidence is recorded and focused tests pass.

