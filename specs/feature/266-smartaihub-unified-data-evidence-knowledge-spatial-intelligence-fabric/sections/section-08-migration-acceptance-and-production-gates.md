# Section 08 — Migration, Acceptance, Production Gates

## Scope

Validate migration strategy and each applicable acceptance criterion. Close locally provable criteria; keep external rights, runtime binding, production deployment/rollback and real provider proof open until observed.

## Spec coverage

Spec 266 §§44–48, appendices A–E.

## Implementation

- Migration inventories every current writer and maps accepted facts without loss.
- No dual canonical writes; one-writer-at-a-time cutover with replay, rollback and evidence.
- Add focused automation mapping tests to acceptance item IDs.
- Keep source packs disabled where rights/endpoints are unverified.

## Tests

- Migration metadata, schema/snapshot consistency, replay and rollback-plan checks.

## Acceptance

Spec 266 §47 is not locally closable until environment and provider proof exists.
