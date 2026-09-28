# Section 02 — router, persistence, and billing integration

## Ownership

Own normal Vertical Drama portrait/sheet router calls, profile persistence
projection, stale snapshot reuse metadata, and skill settlement metadata.

## Target files

- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/services/verticalDramaCharacterDesignContext.ts`
- `apps/web/server/services/verticalDramaCharacterDnaPersistence.ts` only if
  type plumbing requires it
- router/service tests

## TDD expectations

Prove portrait preview then approved render has one prompt LLM call total.
Prove turnaround selects the turnaround deliverable and named sheets select the
requested type. Prove legacy snapshots still pass and profile-only snapshots
retain continuity facts.

## Acceptance checks

- Existing tenant/ownership and reference-image resolution are unchanged.
- Image rendering remains a separate charge.
- One fixed skill settlement uses `character-prompt-skill` and records the
  deliverable and token metadata.
- Persistence failure after media submission warns without resubmitting.

## Risks

Target-model approval reuse currently checks the legacy contract version. Emit
compatible metadata only after the new profile prompt passes the same selected
model capability checks; otherwise require fresh preview.

## Implementation evidence

- Normal portrait preview, portrait render fallback, and character sheet
  fallback now call `generateCharacterPromptWithSkill`.
- Sheet requests pass the resolved `turnaround` or named `sheet:<type>` context;
  portrait preview no longer receives an unused turnaround sibling.
- Approved prompt paths remain unchanged and continue to skip prompt generation
  and its credit settlement.
- The adapter settles one fixed two-credit `character-prompt-skill` run and
  stores deliverable/model/token/retry metadata for audit.
