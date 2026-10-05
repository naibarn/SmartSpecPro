# Section 08 — Migration, Acceptance, Production Gates

## Scope

Validate migration strategy and each applicable acceptance criterion. Close locally provable criteria; keep external rights, runtime binding, production deployment/rollback and real provider proof open until observed.

## Spec coverage

Spec 266 §§44–48, appendices A–E.

## Implementation

- Maintain writer/authority inventory and map each acceptance criterion to source, test, or external evidence. Identify retention and rollback impact before proposing destructive migration.
- The active schema-owner marker blocks Drizzle schema and migration edits in this session. Do not create SQL, edit snapshot/journal, apply migrations, or remove the marker. Revisit schema-dependent acceptance after its owner releases the gate.
- Require one-writer-at-a-time cutover with replay, count/checksum reconciliation, rollback rehearsal, and evidence retention. Do not infer cutover from an adapter or unit test.
- Keep source packs disabled where rights/endpoints are unverified. Distinguish implemented, partial, proposed, externally blocked, and unverified.
- Production §47 stays open until environment identity, migration ledger, source/provider rights, runtime binding, deployment SHA, observability, operator rollback, and live behavior are demonstrated.

## Tests

- Run only non-schema-destructive inventory, acceptance-map, section-validator, and diff checks while the marker is active. Migration metadata/snapshot, replay, and rollback checks wait for the designated schema-owner window and safe target environment.

## Acceptance

Spec 266 §47 is not locally closable until environment and provider proof exists.
## UI/UX Contract

### Target User / JTBD
- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.

### Existing Pattern Reference
- N/A: no user-facing surface is added by this section.

### Surface Inventory
- N/A: no route/page/dialog/form/table is added.

### Component Map
- N/A: no client component is added.

### State Matrix
- N/A: no browser state is added.

### Responsive Matrix
- N/A: no browser layout is added.

### Accessibility Acceptance
- N/A: no user-facing control is added.

### Copy Contract
- N/A: no user-facing copy is added.

### Browser Evidence Required
- N/A: no browser-visible changes are planned in this section.
