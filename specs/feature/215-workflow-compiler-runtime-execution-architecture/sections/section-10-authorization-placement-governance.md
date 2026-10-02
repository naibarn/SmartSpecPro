# Section 10 — Authorization, Placement, and Data Governance

## Outcome

Revalidate current identity, permissions, capability grants, data tier, placement, secrets, residency and revocation before each material execution/commit boundary.

## Scope

- Derive tenant/principal from trusted server context and reject caller-supplied identity escalation.
- Integrate Spec 220 authorization/capability decisions and Spec 207 economic authorization without duplicating either authority.
- Resolve placement against registered runtime capability, trust, locality, resource and data-residency constraints.
- Pass credential references to approved adapters; never serialize raw secrets into plans/jobs/checkpoints/logs.
- Bind the verified Spec 251 creator profile inputs without introducing creator-specific nodes/queue.
- Gate retrieval through Spec 229/220; retain fail-closed behavior pending actual adapter and ACL proofs.

## TDD / verification

- Tenant isolation, revoked session/credential, changed policy revision, data-classification mismatch, denied provider region, secret redaction and missing entitlement.
- Creator binding rejects unknown/unverified profile versions.
- Retrieval tests assert no provider call when Broker gate is absent.

## Acceptance

- Revocation/policy changes can block queued but not-yet-started work.
- Every material call has server-derived authorization and economic context.
- External gates are explicit and no local mock is claimed as production proof.

## UI/UX Contract

### Target User / JTBD
N/A — this section implements backend workflow runtime behavior; product experience remains with Spec 209 and existing client owners.

### Surface Inventory
N/A — no browser-visible surface changes are planned. Existing APIs expose runtime state.

### Component Map
N/A — no frontend component is added or changed.

### State Matrix
N/A — runtime state is persisted and exposed through existing API contracts; visual rendering is outside this implementation scope.

### Responsive Matrix
N/A — no responsive layout changes.

### Accessibility Acceptance
N/A — no user interface changes.

### Copy Contract
N/A — no user-facing copy changes.

### Browser Evidence Required
N/A — no browser-visible behavior is changed; API and runtime tests provide the relevant local evidence.
