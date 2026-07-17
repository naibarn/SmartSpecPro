# Section 02 — Native dialogue contract

## Implementation status

Completed 2026-07-13. Canonical dialogue lines now form one ordered verbatim
block (including repeated lines), survive generation/QC/persistence/provider
formatting, and Grok remains native-audio by model family independent of
Higgsfield, Kie, or Magnific transport metadata.

## Ownership

- `apps/web/server/services/verticalDramaPromptQc.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/modelRegistry.ts`
- Corresponding service tests

## Work

1. Convert dirty dialogue preservation into one ordered, idempotent native-dialogue block contract.
2. Use canonical source lines, never the reduced LLM echo, for compliance.
3. Preserve repeated identical lines and speaker/source order.
4. Revalidate after every final transformation and fail on protected-content overflow.
5. Verify Grok native-audio model-family classification across provider IDs/config variants.

## Acceptance

- All three example dialogue lines persist and reach provider payload.
- Split/non-split paths have identical guarantees.
- Provider metadata cannot downgrade Grok native audio.

## Risk

Do not overwrite or duplicate the existing uncommitted Grok/dialogue fixes; reconcile them in place.
