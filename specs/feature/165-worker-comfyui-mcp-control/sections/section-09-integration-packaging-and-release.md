# Section 09 — integration, packaging, and release

## Objective

Prove Sections 01–08 integrate, package the Worker runtime safely, and gate
rollout without confusing fake/local evidence with external provider proof.

## Owned files

- existing Rust/Web integration and fixture directories
- `apps/worker-app/scripts/prepare-runtime-pack.mjs`
- Worker runtime manifest/release metadata and focused release tests
- feature flag/rollout documentation

## Required implementation

1. Add fake stdio and Streamable HTTP MCP fixtures for handshake, discovery,
   schema, async execution, output, expiry, cancel, reconnect, and malformed
   responses.
2. Integrate four job types, all revisions, permission revocation, lease race,
   shared projection parity, migration safety, and idempotent publication.
3. Package pinned MCP compatibility metadata and platform diagnostics only as
   needed. Never install arbitrary Python/custom nodes and never require
   HyperFrames.
4. Add controlled local/self-hosted/Cloud smoke checklist. Real credentials,
   GPU, browser, remote network, and Cloud proof are release evidence, not CI
   assumptions.
5. Record the completeness gate as separate local-test, browser/WebView, and
   external-provider evidence. A pending class blocks “ready” status and is
   never represented as a successful smoke test.

## TDD/release sequence

Run focused suites first, then:

- `npm --workspace apps/worker-app test`
- `npm --workspace apps/worker-app run typecheck`
- `npm --workspace apps/web test -- <focused-file-or-pattern>`
- `npm --workspace apps/web test`
- `npm --workspace apps/web run typecheck`
- migration checker/dry-run and schema tests
- existing `mcp:smoke`, `mcp:failure-harness`, and `mcp:readiness` where
  applicable

## UI/UX Contract

### Target User / JTBD

Release operators need a concise proof record showing what passed locally and
what still requires a real GPU/provider/browser environment.

### Surface Inventory

Runtime diagnostics, Worker Overview, Web Render Jobs, admin monitoring, and
release checklist are the only evidence surfaces.

### Existing Pattern Reference

- Searched Worker runtime diagnostics, Web Render Jobs, admin monitoring, MCP
  smoke/readiness scripts, and existing release packaging scripts.
- Decision: reuse current diagnostics, evidence, and runtime manifest patterns;
  add only Comfy compatibility rows and explicit external-proof classification.

### Component Map

Compatibility badge, feature-flag state, migration result, fake transport result,
runtime manifest version, browser evidence link, and pending-external-proof row.

### State Matrix

Pass/fail/pending are distinct; pending external proof cannot be shown as ready;
manifest mismatch blocks release; rollback keeps legacy branch available.

### Responsive Matrix

Release evidence is readable as cards on mobile and a table on desktop; critical
failures remain above the fold.

### Accessibility Acceptance

Every gate has text state, labelled evidence, keyboard navigation, and no color-
only pass/fail indication.

### Visual Direction / Token Strategy

Reuse current diagnostics cards/tables and semantic pass/fail/pending tokens;
keep density operational, preserve text labels, and avoid motion for release
status changes.

### Copy Contract

Use explicit “local/fake proof”, “browser proof”, and “external provider proof”
labels in Thai and English.

### Browser Evidence Required

Record actual Worker WebView and Web Series/shot evidence separately from CI;
record local, remote, and Cloud results with timestamp and profile ID only.

## Exit criteria

Focused tests/typechecks and migration dry-run pass, cross-section contracts
match, browser evidence is recorded, and release notes state all pending
environment-dependent checks honestly. The evidence record includes cursor
tamper/staleness, permission revocation, output-role mismatch, local-only
non-publication, restart reconciliation, duplicate publication, and legacy
projection parity results.
