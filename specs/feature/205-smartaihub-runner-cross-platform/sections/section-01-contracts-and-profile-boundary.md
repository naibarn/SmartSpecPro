# Section 01 — Contracts and Profile Boundary

## Goal

Establish the additive, versioned execution contract shared by a local
SmartAIHub Runner and a Cloudflare shared Container Runner without changing
the existing Worker App protocol or creating a second Job system.

## Ownership and file boundary

Inspect and, only when necessary, change:

- apps/web/server/services/runnerContracts.ts;
- apps/web/server/services/jobControlPlaneTypes.ts;
- the existing runner contract tests;
- a new neutral contract package only if extraction is proven safe;
- apps/runner-app/src/protocol.rs or equivalent Rust contract module;
- protocol fixtures under apps/runner-app/tests/fixtures/.

Do not change apps/worker-app package identity, Worker endpoints or Tauri
execution code in this section. Do not introduce a database table until an
impact review proves an additive registry projection is insufficient.

## Required design

Define two explicit profiles:

- LOCAL_DEVICE_RUNNER: persistent tenant/user/device identity, bounded local
  journal, authenticated control channel;
- SHARED_CONTAINER_RUNNER: managed pool/node identity, one validated Job scope,
  ephemeral workspace/process state and canonical Job/outbox durability.

Keep legacy Worker runtime values valid. If the existing runtime union cannot
express the profile safely, add a versioned profile/node-kind field and map
legacy values explicitly. A Container must not be accepted as a user device,
and a local Runner must not be accepted through the Worker claim protocol.

Define one envelope containing protocol version, node/profile identity, Job ID,
attempt/lease identity, fencing version, correlation ID, sequence and
idempotency key where relevant. Define request and event ACK states as
accepted, applied, rejected, unknown, duplicate and out-of-order. Include
bounded length/item-count limits and redacted diagnostics fields.

Define additive tool/capability snapshot fields without creating one node per
tool. A tool inventory entry records tool ID/kind/version, adapter or manifest
identity, discovery source, install/configuration/auth/health/availability
state, fingerprint, observed time, expiry and safe reason codes. A capability
entry records capability ID/version, control profile, resource/concurrency
requirements, policy decision and confidence. Absolute executable paths,
credentials and raw configuration are local-only or opaque references.

Document field ownership: Feature 195 owns Job/attempt/lease/fence/event/
outbox truth; Feature 197 owns capability/offer semantics; Feature 200 owns
Agent task/session/result meaning; Feature 204 owns Container lifecycle; this
section only defines the transport-neutral shapes.

## TDD tasks

Write tests before implementation:

1. Serialize and validate both profiles and reject unknown/ambiguous profile
   combinations.
2. Preserve legacy Worker contract fixture serialization.
3. Reject missing version, identity, Job, attempt, lease, fence, sequence or
   idempotency data at the relevant envelope boundary.
4. Reject oversized strings, arrays and event payloads.
5. Prove a managed Container identity cannot be normalized into a persistent
   user device identity.
6. Prove compatibility re-exports expose the same normalized fields.
7. Prove no protocol shape contains raw credentials, raw prompt context or
   arbitrary MCP upstream URLs.
8. Prove Runner and Worker token namespaces cannot cross endpoints: wrong
   audience, token use, scope, tenant binding, revoked JTI and missing device
   authorization all fail closed; prove bounded refresh replay behavior.
9. Prove a shared Container uses managed-node plus Job scope and does not
   require a per-user device credential.
10. Freeze the Runner audience/token-use identifiers separately from the Worker
   namespace and reject credentials in WSS URL query parameters.
11. Prove tool inventory and capability inventory serialize as one bounded
    Runner snapshot and do not create a second Runner/device identity.

Use the existing focused Vitest runner for TypeScript contracts and the new
Runner Cargo test target for Rust serialization/parity fixtures. Do not run
workspace typecheck.

## Implementation steps

1. Record an impact note for every exported type/helper that will change.
2. Add the profile/node vocabulary and protocol version in an additive form.
3. Keep current validation helpers as the server-side trust boundary and add
   equivalent Rust validation from shared fixtures.
4. Add golden fixtures for valid local, valid shared Container, stale lease,
   malformed envelope and legacy Worker payloads.
5. Document the compatibility/re-export path in the Runner README and
   deep-plan research record.

## Acceptance

The section is complete when the same valid envelope can be validated by
focused Web and Rust tests, invalid/stale/cross-profile messages fail closed,
legacy Worker fixtures remain unchanged, and downstream sections can import a
stable contract without inventing fields.

## Dependencies and handoff

No prior section. This section blocks backend registry, Rust runtime, local
control, Job execution, Container entrypoint, UI projection and release
manifest work.

## UI/UX Contract

### Target User / JTBD

N/A for this section: it implements a non-visual contract/runtime boundary.
The user-facing projection is specified in section 07.

### Surface Inventory

N/A; no browser surface is created or changed here.

### Component Map

N/A; this section exposes protocol/runtime contracts consumed by section 07.

### State Matrix

N/A for direct UI. Runtime states are exposed as typed status data to section 07.

### Responsive Matrix

N/A; no layout or viewport behavior is implemented here.

### Accessibility Acceptance

N/A for the non-visual layer. Any status exposed to UI must remain semantic and
localized by section 07.

### Copy Contract

N/A; no user-facing copy is introduced in this section.

### Browser Evidence Required

N/A for direct implementation. Section 07 must prove the corresponding
projection and redaction behavior.
