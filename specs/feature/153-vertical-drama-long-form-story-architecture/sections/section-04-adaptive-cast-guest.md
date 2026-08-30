# Section 04 — Adaptive cast and fictional guest lifecycle

## Scope

Add lifecycle contracts for core, recurring, arc, faction, and guest
characters; a canonical family/faction/social relationship graph; cast-density
policy; late-entry guest validation; and integration with existing character
rows, visual bible, and outfit variants.

## Owned paths

- `apps/web/shared/verticalDramaSeries/longFormContracts.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/shared/verticalDramaSeries/seriesMemoryState.ts`
- `apps/web/server/services/verticalDramaCharacterVariantPlanner.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- new lifecycle validator/service and focused tests

## Design

Character lifecycle admission must create graph nodes and family/faction
membership before a new character can appear in an episode. Normalize inverse
edges and in-law derivations deterministically; never infer blood relations
from names or dialogue alone. Guest validation must reference graph edges,
knowledge boundaries, and dependency-index entries so repair can target only
the affected content.

`CastExpansionPolicy` is executable and versioned: it limits active characters,
new introductions per block, guest frequency, dialogue owners, meaningful
actions before exit, and visual-asset load. Overflow must merge, exit, split,
or request approval; the writer cannot silently exceed the policy.

Every relation must normalize to a graph edge with type, direction, family side,
time validity, disclosure, known-by state, provenance, and evidence. Derived
in-law/kinship edges retain their source edges and never invent blood relations.
A graph contradiction identifies all dependent episodes/dialogue and opens
bounded repair. New characters must be admitted before a script references them.
Guest types are seeded surprise, latent return without hard death proof or with a declared
world rule, and controlled new arrival. A guest changes leverage but cannot
solve the entire central conflict or erase protagonist agency.

## TDD acceptance

- Episode-119/120 fiancé/villain/relative scenarios pass only with evidence or
  valid world rule plus payoff/exit.
- Unseeded guest, hard-dead return, orphan visual identity, and uncontrolled
  cast growth block.
- Existing `variantType: "outfit"` remains same identity.
- Age and intimacy safety rules are enforced.
- A relationship-map fixture exposes parent/child, spouse, wife's-sister
  in-law, maternal/paternal family, faction, friend, rival, and acquaintance
  edges with an episode timeline.
- An incorrect edge repairs dependent episode/dialogue/memory fields and
  immediate recap neighbors without regenerating unaffected blocks.

## UI/UX Contract

### Target User / JTBD

N/A — cast admission and safety contract; cast diagnostics are Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — lifecycle states are server findings.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — contract/service tests are sufficient for this section.

## Implementation notes

Cast admission and density enforcement are implemented in
`verticalDramaLongFormDomain.ts`; guest seed/payoff, hard-death return, and
per-block/season limits are deterministic and do not let the author silently
invent a character.
