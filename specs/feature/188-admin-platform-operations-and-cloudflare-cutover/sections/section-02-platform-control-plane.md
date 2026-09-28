# Section 02 — Platform Control Plane
+## UI/UX Contract

### Target User / JTBD

- N/A — backend state machine and durable action boundary only; section-06 owns the operator surface.

### Existing Pattern Reference

- N/A — no browser component is changed; section-06 records the reused Admin patterns.

### Surface Inventory

- N/A — no route or visual surface is implemented here.

### Component Map

- N/A — service and control-plane modules only.

### State Matrix

- N/A — lifecycle state behavior is verified by service/API tests.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no markup is introduced.

### Copy Contract

- N/A — stable error codes are exported to section-06; copy is owned there.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Implement the server-side state machine that coordinates platform readiness,
gate evidence, guarded actions, durable external-operation intents, activation,
traffic handoff, separation, and rollback. It is not a second job control plane.

## Ownership paths

- apps/web/server/services/platformOperations.ts:
  overview, gates, authorization, action idempotency, and evidence reads.
- apps/web/server/services/cutoverControlPlane.ts:
  final-fence/final-delta/validation/synthetic-test/activation/separation/
  rollback orchestration.
- apps/web/server/services/hyperdrivePolicy.ts:
  target-identity and Hyperdrive readiness policy consumed by gates.
- apps/web/server/services/__tests__/platformOperations.test.ts
- apps/web/server/services/__tests__/cutoverControlPlane.test.ts

## State and ports

Implement legal transitions only:

~~~
preparing -> blocked | ready_for_cutover
blocked -> preparing
ready_for_cutover -> activating
activating -> active | rollback_required
active -> separated | rollback_required
rollback_required -> active | retired
~~~

The service exposes typed operations:

~~~
getOverview(input): Promise<PlatformOverview>
listGates(input): Promise<GatePage>
getPromotion(input): Promise<PromotionView>
listPromotionBatches(input): Promise<BatchPage>
listEvidence(input): Promise<EvidencePage>
requestAction(input: PlatformActionRequest): Promise<PlatformActionResult>
~~~

Define GatePage, PromotionView, BatchPage, and EvidencePage as bounded,
cursor-paginated read models. Gate aggregation combines durable append-only
results with read-only probes. Probe timeout/unavailability is unknown, never
passed. A required unknown, expired, failed, stale, or mismatched result blocks
activation.

## Guarding and idempotency

Every mutation verifies environment, actor/admin scope, expected control version,
current lifecycle, target/release/promotion identity, required gates, and the
action idempotency key. The same key and same payload returns the original
outcome. The same key with a different payload returns IDEMPOTENCY_CONFLICT.
Every effective action records actor, reason, control version, safe outcome, and
evidence reference.

An action requiring an external deployment or binding change first commits a
platform_operation_outbox intent. A separate publisher/release workflow claims
it with a publisher fence, performs the operation with the stable dedupe key,
then records the external reference and evidence. Lost responses are reconciled
by identity/reference inspection, not by blindly retrying activation.

## Activation coordinator

cutoverControlPlane.ts owns ordering and delegates each operation to its
proper port. It must:

1. verify required gates and source authority;
2. require final write fence, final delta, and complete validation;
3. require isolated target synthetic-test evidence;
4. persist activation intent and release identity;
5. hand off to the Cloudflare release workflow;
6. settle ACTIVE only after target-identity and runtime probes are durable;
7. open traffic in a separate guarded action;
8. record zero-legacy-call evidence;
9. revoke synchronization and issue separation evidence.

Rollback requires compatibility evidence for schema, release artifact, image,
target writes, and Feature 186 side effects. It cannot delete history, reopen
terminal jobs implicitly, or blindly switch to Dev after target writes.

## TDD stubs

- Legal and illegal lifecycle transition tests.
- Same-key concurrent action convergence and payload-conflict tests.
- Gate aggregation tests for pass/fail/blocked/unknown/expired/stale.
- Authorization and audit tests for platform and environment scope.
- Platform outbox lease, duplicate, lost-response, inspection, and quarantine
  tests.
- Activation ordering test that blocks traffic opening before durable ACTIVE.
- Rollback test that blocks blind source switch after target writes.

## Acceptance

No Admin/API caller can bypass guards; unknown evidence cannot activate; external
activation is durable and reconcilable; and the service returns stable,
auditable, environment-scoped results.
