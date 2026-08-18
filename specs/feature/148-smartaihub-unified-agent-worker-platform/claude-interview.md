# Deep-plan Interview Transcript — Feature 148

## Interview mode

No blocking stakeholder questions were asked. The user explicitly requested an
autonomous deep-plan followed immediately by deep-implement. Prior conversation
and the approved Feature 148 spec already establish the business decisions:
production UI/DB configuration, OAuth-first onboarding, browserless CLI
fallback, user-owned device scope, tenant-safe media access, Windows 11 and
Apple-Silicon macOS support boundaries, quota protection, and additive
compatibility with existing MCP/Worker flows.

## Q1 — What should be treated as the first production implementation slice?

**Decision:** Implement the smallest safe vertical slice that closes existing
codebase gaps without pretending that external runtime gates are complete:

1. MCP production discovery/onboarding and browserless credential UX using
   existing OAuth/device/API-key authorities;
2. explicit parent/child Hermes task correlation over existing worker jobs;
3. ComfyUI adapter boundary and worker execution path over existing typed job
   and artifact contracts where the local adapter can be implemented safely;
4. focused tests, telemetry, documentation projections, and fail-closed gates.

The plan must leave signed runtime-pack publication, macOS Remotion sidecar,
real Comfy model/workflow acceptance, and production-machine evidence as
explicit gates rather than marking them complete from mocks.

## Q2 — Are separate client experiences required?

**Decision:** Yes. Hermes One, Hermes CLI/Agent, Claude/Claude Code, Codex CLI,
and generic MCP clients share one server authorization/business contract but
receive client-specific generated instructions. Browser-capable clients use
OAuth/PKCE. Browserless clients reuse the existing device authorization flow
when supported, otherwise use a scoped key created in SmartAIHub Settings/API
Keys with one-time reveal, expiry, quota, and revoke controls.

## Q3 — What must remain separate for compatibility?

**Decision:** Do not remove or merge `McpConnectPanel`, `HermesConnectPanel`, or
`McpServersSettingsPanel`. Do not merge the pre-existing Hermes
`external_agent_task` gateway with `hermes_media_*` provider media jobs. Do not
create a second MCP media-task table, worker queue, artifact storage path, or
Redis-only durable state.

## Auto-decisions

- Use Vitest/jsdom and existing web test utilities for server/client focused
  tests, Playwright only for browser evidence, and Cargo tests for Tauri code.
- Prefer existing Express routes, tRPC routers, Drizzle authorities, worker
  scheduler, and artifact broker. Add a migration only after live schema and
  migration-journal inspection proves a missing durable relation.
- Keep new flags disabled by default; use existing tenant feature-flag/admin
  UI and DB-backed MCP runtime settings in production. Environment variables are
  allowed only for emergency kill switches or server secrets.
- Use at-least-once delivery with durable idempotency/cursors and bounded
  retries. Never silently fallback to cloud or execute an unregistered local
  process.
- Because no browser/provider/Windows/macOS runtime was available for this
  planning run, those claims remain external production gates and will be
  reported separately from focused code/test proof.
