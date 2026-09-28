# Section 03 — Data Promotion
+## UI/UX Contract

### Target User / JTBD

- N/A — promotion engine and database evidence only; section-06 presents the results.

### Existing Pattern Reference

- N/A — no browser surface is changed; promotion status presentation is specified in section-06.

### Surface Inventory

- N/A — no route, dialog, table, or form is implemented here.

### Component Map

- N/A — promotion services and scripts only.

### State Matrix

- N/A — promotion states are verified in service/script tests and rendered in section-06.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — operational copy is owned by section-06.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Promote the current Dev Server PostgreSQL dataset into a new Production
PostgreSQL instance with complete inventory, snapshot, durable continuous sync,
final write fence, final delta, validation, and revocation evidence. Cloudflare
does not connect to the target until activation and does not connect to Dev.

## Ownership paths

- apps/web/server/services/dataPromotion.ts:
  promotion lifecycle, snapshot, batches, checkpoints, and source/target policy.
- apps/web/server/services/promotionChangeFeed.ts:
  logical replication or approved ordered source change-feed port.
- apps/web/server/services/promotionValidation.ts:
  database/object/index/job/settlement validation and manifest creation.
- apps/web/server/scripts/inventory-feature-188.ts:
  source/target inventory and dispositions.
- apps/web/server/scripts/promote-feature-188.ts:
  snapshot, sync, final fence, final delta, and resume commands.
- apps/web/server/scripts/verify-feature-188.ts:
  validation and evidence bundle.
- apps/web/server/services/__tests__/dataPromotion.test.ts
- apps/web/server/services/__tests__/promotionValidation.test.ts
- apps/web/server/scripts/__tests__/feature188PromotionScripts.test.ts
- ops/feature-188/environment-contract.yaml
- ops/feature-188/promotion-manifest.schema.json

## Source and target contract

The source is the current Dev Server database. The target is the newly
provisioned Production PostgreSQL instance. The target manifest records provider,
version, region, extensions, collation/timezone, schema owner, backup/restore
proof, database identity, network policy, and Hyperdrive binding metadata
without secrets.

Provisioning is an externally authorized operation. The preflight command
confirms target identity, privileges, backup/restore evidence, replication or
change-feed support, and that normal production traffic cannot reach the target
before activation. If provider capability is insufficient, the gate blocks.

## Inventory and dispositions

Inventory every schema/table/row scope, FK/unique/check relationship, sequence,
Feature 186 worker_jobs/events/attempts/dispatches/outbox/settlements, domain
bindings, R2/S3 object, Vectorize document/index, secret, session, signed URL,
queue, and legacy-production difference.

Every item receives TRANSFER, MERGE, TRANSFORM, REGENERATE, RETAIN_ONLY, or
PROHIBITED with owner, reason, transformation version, and validation rule.
PROHIBITED cannot discard ordinary durable business data without approval.

## Synchronization modes

Prefer native PostgreSQL logical replication only after a provider/version/
extension/permission/schema gate. The source is publisher and the new target is
subscriber; snapshot watermark and ordered changes are recorded.

The fallback is a durable transaction-watermark exporter backed by an approved
source CDC stream or append-only change journal. The source feed must provide a
monotonic sequence, table/key, operation, row version, and delete tombstone for
every in-scope table. Timestamp-only comparison is forbidden.

Every batch has a stable key, source watermark range, target transaction, counts,
digest, retry/error state, and applied checkpoint. Checkpoint advances only after
target commit and evidence durability. Ambiguous commits are quarantined.

## Validation and final sequence

Validate counts and deterministic table/partition digests, missing/extra rows,
delete propagation, FK/unique/check constraints, sequence values, tenant
ownership, job/event order, outbox/settlement markers, R2 object checksums/
metadata/ownership, and Vectorize document/index/version/retrieval evidence.

Final sequence:

1. confirm source authority and healthy continuous sync;
2. fence producers and user writes in the approved maintenance scope;
3. drain safe jobs and reconcile remaining canonical jobs by job_id;
4. freeze source writes and capture final watermark;
5. apply final delta and validate complete convergence;
6. run side-effect-free synthetic tests on an isolated target tenant/namespace;
7. publish ready-for-cutover evidence.

The target is not opened to production traffic during preparation. Synthetic
tests use no paid provider, billing, notification, webhook, or irreversible
artifact side effect and record cleanup/retention.

## TDD stubs

- Complete inventory/disposition coverage and legacy-difference tests.
- Target identity, backup, restore, network, extension, and replication
  capability tests.
- Change-feed completeness tests including delete tombstones and rejection of
  timestamp-only fallback.
- Snapshot resume, duplicate batch, rollback, ambiguous quarantine, and
  checkpoint tests.
- Digest/FK/unique/sequence/object/Vectorize/Feature 186 validation tests.
- Final fence/delta ordering and isolated synthetic test tests.
- Post-cutover sync credential revocation and deny/audit tests.

## Acceptance

Every durable source item has evidence, synchronization is ordered and
resumable, final validation is complete, the new target is unambiguous, and
cutover cannot proceed from a row-count-only or stale promotion result.
