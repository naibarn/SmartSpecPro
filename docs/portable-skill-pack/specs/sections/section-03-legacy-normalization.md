# Section 03 — Backfill and V1 Normalization

## Goal

Make existing projects compatible without overwriting role text or silently inventing
important narrative roles.

## Ownership

- New tenant-scoped, idempotent backfill service/script under existing server script
  conventions.
- V1-to-V2 normalizer at the Visual Bible input boundary.
- Migration/backfill fixtures and tests.

## Behavior

Backfill evidence precedence is structured Bible/DNA, existing role tier, description/
premise/relationships, then conservative legacy aliases. Preserve the old `role` value.
If confidence is insufficient, set `roleReviewStatus=needs_role_review` and leave the
canonical role conservative. Backfill is rerunnable and emits aggregate counters without
full story text.

Normalize `has_own_reference_image`, `face_source_reference`, legacy root visual fields,
and legacy role input into contract V2. The normalizer is pure, bounded, and does not
mutate caller input.

## TDD stubs

- Structured evidence beats occupation.
- Two backfill runs produce identical rows.
- Tenant scope excludes other tenants.
- Ambiguous rows retain legacy text and review state.
- V1 input normalizes to stable V2 with reference lock and generation request.
- Missing target role fails before a paid provider call.

## Completion proof

Run backfill dry-run/fixture tests, normalizer tests, and migration status check. Record
review-required count and rollback behavior.
