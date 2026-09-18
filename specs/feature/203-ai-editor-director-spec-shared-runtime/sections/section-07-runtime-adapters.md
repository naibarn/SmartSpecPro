# Section 07 — Web, Runner, and Worker runtime adapters

## Objective

Align Web, Runner, Windows Worker, and approved container profiles to one
versioned envelope, exact capabilities, asset locality, and render source.

## Files and ownership

- Update `apps/web/server/services/editorMediaJobContract.ts` and router
  adapters.
- Update Web handoff helpers under `apps/web/client/src/components/videoeditor/`.
- Update Rust executor/claim code only for native operations with real support.
- Add/extend Worker media contract tests.

## Behavior

- Durable Web payloads contain managed asset refs and server revision/snapshot;
  no local paths or long-lived signed URLs.
- Worker advertises exact native operation tokens and contract revision.
- Composition scan remains explicit Node adapter until Worker executor,
  capability, evidence, and promotion tests all exist.
- Preview, Full Scan, and native Render resolve the same actual source media.

## TDD and acceptance

Test adapter mapping, contract version mismatch, source-path parity, asset
locality rejection, exact claims, unsupported composition scan, and degraded
Node output. Existing render-handoff tests must remain green.

## UI/UX Contract

### Target User / JTBD
Editor needs to know which runtime will execute an operation.

### Surface Inventory
Runtime/capability badge, source-selection warning, operation status panel.

### Component Map
Adapters own wire conversion; Web handoff renders runtime and source status.

### State Matrix
Node adapter, Worker eligible, waiting-agent, capability-blocked, source missing,
contract mismatch, and parity unavailable.

### Responsive Matrix
Mobile compact badge; desktop may show detailed runtime/capability provenance.

### Accessibility Acceptance
Runtime status has text labels, semantic warnings, keyboard focus, and no
color-only parity claim.

### Copy Contract
Never label Node compatibility as Windows parity; Thai-first explanation with
English fallback.

### Browser Evidence Required
Show Node adapter and blocked/waiting Worker states in authenticated Web flow.
