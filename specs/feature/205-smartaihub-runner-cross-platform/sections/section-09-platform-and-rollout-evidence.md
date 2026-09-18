# Section 09 — Platform and Rollout Evidence

## Goal

Close the implementation with focused proof across the four native platforms,
Cloudflare shared Runner, UI and release policy, while recording blockers
instead of converting missing environment access into false passes.

## Ownership and file boundary

Collect evidence in the Feature 205 implementation completion/review records
and link the exact test/artifact/log outputs. Update Feature 200, 203 and 204
only when an ownership or acceptance statement is now proven or corrected.
Do not delete or rewrite unrelated prior feature records.

The final audit must inspect:

- apps/runner-app Cargo tests and package manifest;
- backend focused tests and Runner contract fixtures;
- UI component and Playwright evidence;
- runner-release.yml static policy result;
- native artifacts/checksums/manifests;
- Feature 204 staging Container logs/health/lease evidence;
- unchanged Worker App release and protocol boundaries.

## Evidence matrix

### Contract and security

Record protocol negotiation, malformed envelope rejection, local enrollment,
revocation/key rotation, Runner/Worker audience and token-use separation,
bootstrap-only enrollment, device-proof/effective-scope enforcement, no WSS
credential query parameters, capability expiry, stale offer/lease/fence
rejection, duplicate/out-of-order handling, path confinement,
symlink/traversal rejection, bounded payloads, credential/log redaction, MCP
grant enforcement and absence of retired execution paths.

### Runtime and recovery

Record local startup, known-tool scan and registration, capability snapshot,
WSS/HTTPS fallback, idle and active
disconnect, clean and crash restart, bounded journal replay, unknown-state
fencing, process-tree cancellation, provider task handoff, result/artifact
verification and late terminal event handling.

### Shared Container

Record two tenants running concurrent Jobs, distinct workspaces/processes,
server-derived authorization, credential/context non-reuse, forced
restart/replacement, lease/fence reconciliation, SIGTERM cleanup, no
external-provider polling and Feature 204 lifecycle idempotency. Include
resource/health/cost/instance gate results. A local fake is labeled as a unit
test; only a real staging Container run is deployment evidence.

### Native platform

Record build/install/start/stop/reconnect for Windows x86_64, macOS Intel,
macOS Apple Silicon and Linux x86_64. Verify artifact target, checksum,
manifest, version and profile. If a native host is unavailable, mark it
blocked/unverified with the missing environment and do not claim completion.

### UI and release

Record combined Feedback/Chat launcher inline behavior, Task Control expansion,
Runner-versus-Worker labels, loading/error/reconciling/verification states,
responsive/accessibility checks and secret/path redaction. Record manual
workflow dispatch, no automatic trigger proof, artifact-only versus publish
behavior and explicit Feature 204 deployment handoff.

## TDD and audit tasks

1. Add a checklist validator that requires one result per acceptance item:
   pass, blocked or unverified with evidence reference.
2. Run focused Rust, Web/Vitest, Playwright and workflow-static commands.
3. Run native and Cloudflare environment gates only where authorized and
   available.
4. Perform a cross-spec review for 195–205: one Job ledger, one control
   contract, clear local/shared/Worker ownership and no duplicate UI path.
5. Run at least ten post-implementation audit passes, each with a distinct
   lens: requirements, ownership, data flow, auth, lease/fence, isolation,
   recovery, UI, release triggers and rollback.
6. Fix any discovered in-scope gap, rerun affected focused tests and repeat
   the relevant audit lens.

## Rollout and rollback

Enable local Runner only behind an opt-in eligibility gate, then enable the
shared Container profile in staging after isolation/recovery proof. Production
enablement requires Feature 204 cost and health gates plus manual artifact
approval. Rollback disables eligibility and revokes local credentials without
deleting canonical Jobs, events, artifacts or Worker configuration.

## Acceptance

This section is complete only when evidence is linked for every applicable
contract, runtime, UI, release and platform criterion; unavailable environments
are explicitly marked; at least ten audit lenses have no unresolved in-scope
blocker; and completion/review documents state the remaining external gates.

## Dependencies

Depends on sections 01–08 and is the final gate before declaring Feature 205
implementation-ready for a separate implementation session.

## UI/UX Contract

### Target User / JTBD

Operators and users need evidence that Runner connection, Task Control state,
native artifacts and shared Container behavior are real before rollout.

### Surface Inventory

The audit covers the combined Feedback/Chat launcher, Universal Control Plane
panel, /chat and /workers/connect; it does not add a new page.

### Component Map

The evidence record links UI projection tests to the Feature 198/200 surfaces
and links Runner/Container status fields to Feature 205/204 contracts.

### State Matrix

Verify loading, empty, ready, running, waiting, reconnecting, reconciling,
verification pending, failed, completed, revoked and permission-denied states.

### Responsive Matrix

Verify mobile, tablet, laptop and desktop layouts, including expandable task
steps and safe redaction at every viewport.

### Accessibility Acceptance

Verify keyboard operation, visible focus, semantic disclosures, status
announcements, contrast and reduced-motion behavior in the browser evidence.

### Copy Contract

Verify Thai default/English fallback and unambiguous Runner, Worker App and
Cloudflare shared Runner terminology, with no claim of process liveness from a
Job row alone.

### Browser Evidence Required

Link the focused Playwright result for launcher/panel behavior, task expansion,
connection states, redaction and accessibility. Missing browser infrastructure
must be marked unverified rather than passed.
