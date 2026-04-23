# Section 08: Feature Flags, Rollout, and Access Policy

## Objective

Gate all high-impact Knowledge Vault surfaces through explicit flags and access policies so rollout can be staged safely.

## Scope

- feature flags
- tenant/user rollout policy
- runtime and MCP gating
- private-vault unlock policy
- graph/canvas gating
- admin controls

## Likely Files and Modules

- existing feature flag services or config modules
- `apps/web/server/services/contextAccessPolicy.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/client/src/hooks/useMenuItems.ts`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- admin monitoring/settings UI

## Implementation Guidance

### 1. Add flags by surface

- `knowledgeVault.enabled`
- `knowledgeVault.quickSwitcher.enabled`
- `knowledgeVault.inspector.enabled`
- `knowledgeVault.savedViews.enabled`
- `knowledgeVault.contextPacks.enabled`
- `knowledgeVault.contextPacks.runtime.enabled`
- `knowledgeVault.contextPacks.delegatedMcp.enabled`
- `knowledgeVault.contextPacks.snapshot.enabled`
- `knowledgeVault.graph.enabled`
- `knowledgeVault.canvas.enabled`
- `knowledgeVault.privateVaultRuntimeUnlock.enabled`

### 2. Gate server and client

- Client flags hide or disable UI.
- Server flags enforce behavior even if client bypasses UI.
- Runtime builder should reject context-pack runtime injection if runtime flag is disabled.
- MCP registry should hide/deny pack tools if delegated MCP flag is disabled.

### 3. Gate by tenant and role

- Allow internal/admin-only rollout.
- Allow tenant allowlist.
- Allow per-surface staged rollout.
- Record flag state in diagnostics when behavior is denied.

### 4. Private-vault runtime unlock policy

- Runtime pack resolution should remain locked by default.
- If explicit private-vault unlock is later supported:
  - require caller intent
  - require actor authorization
  - record audit event
  - include diagnostics
  - never pass unlock state to delegated workers unless explicitly granted

### 5. Link flags to release gates

- Flags for graph and agent runtime should require release-gate pass before broad enablement.
- Admin override should be audited, time-bounded, scoped, revocable, and visible in the readiness report.
- Admin override workflow should be request-first with independent approve/reject actions, not immediate self-approval.
- DB-backed override policy must honor only approved active rows; pending requests must never unlock protected surfaces.
- A bare `overridden` release-gate status must fail closed; protected surfaces should require either `pass`, a scoped bypass allowlist, or a valid audited override payload.
- Runtime context-pack injection and delegated MCP resolution should treat trusted/approved pack eligibility as mandatory, not as a UI-only hint.
- Delegated MCP should list and resolve only packs that are explicitly granted, `trusted`, `approvedForAgents`, and not archived.
- Private-vault runtime unlock should remain separate from release-gate override; one must not imply the other.

## Test-First Checklist

- Test: disabled server flag blocks context-pack runtime injection.
- Test: disabled MCP flag hides/denies context-pack tools.
- Test: bare `overridden` release-gate status does not enable runtime, MCP, graph, or canvas.
- Test: valid scoped audited override enables only the matching tenant/scope and expires closed.
- Test: pending override request does not enable runtime, MCP, graph, or canvas.
- Test: self-approved override is rejected by governance validation.
- Test: delegated MCP hides granted packs that are not trusted and approved for agents.
- Test: delegated MCP rejects resolve for untrusted, unapproved, or archived packs even when the grant contains the pack id.
- Test: disabled UI flag hides quick switcher/inspector modes.
- Test: tenant allowlist enables surface for only one tenant.
- Test: release-gate failure prevents broad enablement.
- Test: private-vault runtime unlock cannot be inferred from normal user session.

## Acceptance Checkpoints

- Risky surfaces can be rolled out independently.
- Server-side policy enforces flags regardless of UI.
- Runtime and delegated behavior remains least-privilege under all flag states.
- Operators can revoke an override without code or schema rollback.
