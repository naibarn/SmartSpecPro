# Feature 165 TDD implementation map

This file mirrors `claude-plan.md`. Tests are written before the production
change in each section. Existing behavior is protected by regression fixtures;
new behavior is proved with deterministic fakes and explicit negative cases.

## Global test rules

- Web: Vitest; use jsdom for React/browser-facing tests.
- Worker: inline Rust `#[cfg(test)]` tests and `cargo test`.
- Use fake MCP stdio/HTTP transports; never put real credentials in fixtures.
- Every failure assertion checks a stable code and redacted message.
- Every migration test starts from representative legacy rows and proves no
  deletion, no invented AI evidence, and no changed legacy response shape.

## Section 01 — contracts and safe migration

Test first:

1. Parse the four canonical Comfy job types and reject unknown server-owned
   fields and malformed atomic groups.
2. Preserve old image/workflow payload parsing with null legacy evidence.
3. Verify `workers:jobs:read` is not silently added to old pairings.
4. Verify tenant/owner foreign keys, active uniqueness, binding uniqueness, and
   idempotency constraints.
5. Run migration dry-run twice and compare row counts, checksums, and legacy
   values; verify disabled-path rollback behavior.

## Section 02 — profiles and MCP transports

Test first:

1. Validate Windows/macOS local paths, HTTPS/Origin/SSRF policy, Cloud
   allowlist, and SSH host-key/forwarding constraints.
2. Prove secret redaction in local state, projections, logs, errors, and
   serialized React invoke responses.
3. Fake stdio initialize/discovery/call/reconnect/child cleanup.
4. Fake Streamable HTTP protocol/session headers, auth-on-every-request,
   401/403/404/reconnect, timeout, and Origin rejection.
5. Prevent duplicate SSH tunnels and prove cleanup after cancellation/window
   close.
6. Import legacy settings exactly once and keep direct REST compatibility
   isolated from new profiles.

## Section 03 — capability and workflow resolution

Test first:

1. Hash and expire capability snapshots; stale snapshots force re-probe.
2. Fail closed for missing required tool/model/family and unsupported aliases.
3. Verify workflow discovery → review → approval → immutable checksum version.
4. Map start/last/ordered reference frames and video duration/FPS/size with
   stable invalid-input errors.
5. Verify Manual, Guided AI, and Automated AI evidence/policy gates.
6. Reject stale bindings, disabled parents, revision conflicts, and wrong
   connection kinds.

## Section 04 — server policy and jobs

Test first:

1. Authorization for tenant, owner, admin, Worker identity, Series, profile,
   workflow, and Library target; missing identity always fails closed.
2. Reject browser-supplied server-owned fields and unsafe asset references.
3. Create and filter all four job types; race two claims and prove one slot.
4. Cover lease heartbeat/loss/expiry/cancel/retry/idempotent replay.
5. Revoke permission between queue, claim, preflight, submit, upload, and
   publish; affected actions must stop immediately.
6. Preserve Worker summary scope/redaction and Web legacy aliases.

## Section 05 — Worker execution and recovery

Test first:

1. Dispatch all Comfy types without affecting Remotion/Hermes/media branches.
2. Stage typed inputs once and reject hash/type/role/Series violations.
3. Correlate MCP execution, map progress, cancel, deadline, lease expiry, and
   create a new attempt for retry.
4. Validate output magic/MIME/codec/dimensions/duration/roles and atomically
   save local files.
5. Resume multipart publication by checksum and never rerun after upload-only
   failure.
6. Restart/crash/sleep/network-loss reconciliation must not duplicate remote
   execution or publication.

## Section 06 — shared projection

Test first:

1. Serialize one job into identical locale-neutral `WorkerJobSummary` for Web
   and Worker.
2. Verify priority/FIFO/tie-breaker/cursor/projection revision ordering.
3. Include active, waiting, recent, and every Worker job family with the proper
   Worker eligibility filter.
4. Reject stale responses overwriting newer events and expose server clock.
5. Redact local paths, prompts, tokens, inaccessible jobs, and output refs.
6. Keep old Web response aliases stable.

## Section 07 — Worker UI and Overview

Test first:

1. Verify one Sidebar ownership model and no duplicate Quick Actions/queue.
2. Verify checked initial permission grants, source/revision/actor/time,
   revocation acknowledgement, expiry, and reconnect guidance.
3. Verify workflow/schema form, frame ordering, preflight, and real pending,
   error, retry, and reconciliation states.
4. Verify header control-plane/loop/Comfy truth and Overview active/waiting/
   recent parity, including serial busy behavior.
5. Verify Thai/English labels, fallback diagnostics, keyboard, responsive,
   reduced-motion, and redaction behavior.

## Section 08 — Series/shot Web UI

Test first:

1. Verify Series owner/admin authorization and deleted/archived filtering.
2. Verify image/video defaults, binding revision conflict, exact episode/shot,
   and one canonical job per submit.
3. Verify start/last/ordered references, duration, workflow version, and mode
   evidence.
4. Verify missing Worker/profile/capability/budget/target/stale binding errors
   block submit with localized recovery.
5. Verify browser responsive/accessibility states and canonical job detail link.

## Section 09 — integration and release

Test first:

1. Fake stdio/HTTP fixtures cover handshake, schemas, async execution, output,
   expiry, cancel, reconnect, malformed responses.
2. Integrate four jobs, revisions, revocation, lease race, projection parity,
   migration safety, and publication idempotency.
3. Verify runtime manifest contains pinned compatibility metadata and no
   HyperFrames requirement or arbitrary custom-node install.
4. Run focused tests/typechecks, migration checks, existing MCP smoke suites,
   then record real local/remote/Cloud/browser evidence separately.

## Definition of done

No section may be marked complete while its negative tests, migration safety,
redaction, or browser/runtime evidence classification is missing. Environment-
dependent evidence may remain pending only when the corresponding deterministic
fake/local proof passes and the release record names the exact external check.
