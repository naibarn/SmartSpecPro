# Section 10 — Integration Gates and Handoff
+## UI/UX Contract

### Target User / JTBD

- N/A — final cross-section evidence and handoff only; section-06 owns browser behavior.

### Existing Pattern Reference

- N/A — no new browser component is implemented here.

### Surface Inventory

- N/A — integration fixtures, evidence aggregation, and runbook handoff only.

### Component Map

- N/A — no client component is introduced.

### State Matrix

- N/A — final state is verified by integration/evidence tests.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — in-product copy is owned by section-06.

### Browser Evidence Required

- N/A — section-06 and the final browser test own browser evidence.

## Scope

Assemble all sections into a reproducible test-first rehearsal and final
evidence handoff. This section does not perform a live production cutover; it
proves that an authorized operator could execute it safely.

## Ownership paths

- apps/web/server/scripts/__tests__/feature188EndToEnd.test.ts:
  cross-section contract and failure tests.
- apps/web/tests/e2e/admin-platform-operations.spec.ts:
  browser-facing final evidence.
- ops/feature-188/cutover-runbook.md and rollback-runbook.md:
  operator handoff.
- .github/workflows/feature-188-gates.yml is consumed from section-07 for final
  orchestration and artifact publication.

## Integration sequence

1. Validate shared contract and migration schema.
2. Create isolated source/target fixtures representing Dev and a newly
   provisioned Production PostgreSQL instance.
3. Run inventory and disposition checks.
4. Run snapshot and durable change-feed/watermark sync, including deletes.
5. Verify target identity and Hyperdrive-only Cloudflare binding.
6. Run Feature 186 duplicate/replay/lease/settlement scenarios.
7. Run adapter, callback, queue, workflow, container, Cron, and storage tests.
8. Run Platform Operations API/UI state and authorization tests.
9. Rehearse final write fence, final delta, complete validation, and isolated
   target synthetic tests while traffic is closed.
10. Rehearse activation intent/provider response loss, separate traffic open,
    legacy rejection, sync revocation, and denial audit.
11. Rehearse rollback with and without target writes.
12. Emit a signed evidence bundle with distinct schema/data/binding/build/
    runtime/activation/recovery/separation records.

## Cross-section contracts

- Shared contracts are identical in apps/web and apps/cloudflare.
- Platform actions use control version and action key from section 02.
- Promotion IDs, watermarks, batch keys, and manifests from section 03 are
  the only data evidence consumed by activation.
- Hyperdrive target identity and adapter references from section 04 are
  recorded as probes/observations, not job status.
- Feature 186 job IDs/events/attempts/settlements from section 05 remain stable.
- UI actions in section 06 call only guarded API operations.
- Release artifacts from section 07 are immutable inputs to section 08 gates.
- Section 09 evidence is required before section 08 activation.

## Final acceptance gates

Activation is eligible only when all are true:

- current Dev source and new Production target identities are recorded;
- complete snapshot and continuous sync have converged with delete evidence;
- final write fence and final delta are complete;
- all in-scope database, object, Vectorize, job, settlement, FK, unique,
  sequence, and domain validation passes;
- Production Hyperdrive resolves only to the new target;
- all Cloudflare adapters and Feature 186 recovery paths pass;
- no activated-scope hidden legacy producer is present;
- release/artifact/schema/data/gate identities match;
- isolated synthetic target tests pass with no paid/irreversible effects;
- backup/restore and rollback evidence is available;
- authorized reviewer and maintenance window are recorded.

After activation, separation is eligible only when traffic/runtime probes pass,
legacy calls are zero/rejected, sync is disabled, credentials are revoked, and
post-cutover denial/audit evidence is durable.

## TDD stubs

- End-to-end fixture proves all cross-section IDs and identities align.
- Gate aggregator rejects any missing, stale, unknown, or mismatched evidence.
- Duplicate action, Queue delivery, Workflow replay, and batch replay converge.
- Final fence/delta/validation/synthetic-test/activation/traffic order holds
  under process interruption.
- Rollback drill handles target-write and no-target-write variants.
- Final evidence bundle rejects missing proof surface or digest mismatch.

## Acceptance

The handoff contains an implementable, test-first, evidence-backed cutover and
rollback procedure. It proves the intended topology without claiming that local
or mock tests are production deployment evidence.
