# Deep-plan interview transcript

No new blocking interview was required. The stakeholder decisions below were
already captured in the preceding conversation and are treated as the product
contract for implementation.

## Q1 — Should start and stop prompts be generated in one LLM response?

**Answer:** Use separate role-specific calls. A single response containing two
long prompts can be truncated or become invalid when prompts are several
thousand characters long. The stop call must receive the full current start
prompt and continuity context so it remains coherent with start.

## Q2 — Is stop-frame creation mandatory?

**Answer:** No. Start prompt/image remains the required path. The user may
create start only, stop prompt only, or both. Stop image generation must be an
explicit per-shot action because many video tools do not support stop frames
and automatic rendering would waste credits.

## Q3 — Should existing episodes be regenerated?

**Answer:** No. Existing episodes retain their current start frame. Users may
request a stop prompt/image later, using the current legacy start prompt as the
continuity anchor.

## Q4 — Should existing start controls or usage change?

**Answer:** No. Keep existing start buttons and interaction behavior. Change the
skill invocation behind them so a generated start prompt selects the true
opening beat. Add independent stop prompt/image controls and a visually clear
stop slot.

## Auto-decisions

- Use the existing durable Vertical Drama prompt-job and media-task patterns;
  do not add browser-held long-running requests.
- Persist additive stop fields in the existing episode JSONB contract for MVP;
  avoid a new SQL table unless implementation proves a strict ledger contract
  requires it.
- Use canonical server-resolved media asset IDs, not LLM free-text IDs, for
  video handoff and protected media URL resolution.
- Use Vitest/jsdom focused tests and the repository's existing npm workspace
  commands. Live provider generation, production deployment, and authenticated
  browser evidence are release-boundary checks, not assumed local proof.
