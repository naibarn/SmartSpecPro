# SPEC-038 WorkUnit pilot

## Selection and authority

- **SPEC:** 038, Citation-Gated Content Quality.
- **Section:** `section-10-quality-dashboard` (existing Deep Implement section).
- **WorkUnit:** `SPEC038_CONTENT_COST_BY_SKILL`.
- **Requirement:** `REQ-028588461FFC`, currently OPEN / UNVERIFIED in the
  canonical ledger.
- **Eligibility:** the manifest explicitly closes only the Lane 2 CMS KPI
  workunit pending data-authority evidence and asks for another independent
  eligible workunit. The cost-breakdown source and tests are active; this
  requirement has no listed external or ownership blocker. The canonical
  section is historically complete, so this is a narrow requirement-gap
  correction, not a new plan or a reopened CMS KPI lane.

## Implemented slice

The dashboard previously grouped `provider_usage_log` by `requestType`, which
collapses every skill into one row. Skill execution already knows its slug,
but dropped it before usage was written. This patch carries `skillSlug` through
the existing skill fallback and LLM router, persists it to `provider_usage_log`,
and groups the admin dashboard by skill slug. Rows without a slug appear as
`unknown`; tenant scoping and admin authorization remain in place. The schema
change is additive and its migration has not been executed.

**Scope limit:** the normative requirement says “token cost per piece.” Neither
`provider_usage_log` nor `content_artifacts` currently has an established
artifact correlation key. This slice provides cost per skill and average cost
per request; it does not prove cost per individual content artifact. The
requirement must remain OPEN / UNVERIFIED until an authorized, reliable
artifact correlation is implemented and verified.

## Agents SDK execution evidence

The selected runtime was the existing OpenAI Agents SDK `Runner` with the
official `RunState` and `SQLiteSession`, using the repository's Codex custom
Model through `openai-codex` and the existing ChatGPT/Codex login. No Gateway
or direct provider API was used. No new orchestration framework or
SPEC-224 Runner caller was introduced.

The run `9b43eefc-1d99-4972-8a51-c86dab41475b` used a live planner, scoped
implementation tools, and independent reviewer threads. It produced 17
completed Codex turns (1 planner, 9 implementer, 7 reviewer), 922,267
last-turn subscription tokens, and 162,499 ms summed turn duration. Three
implementation attempts and five test receipts were recorded. The first two
review outcomes did not establish completion; the third reviewer was still
running when the conductor interrupted the process. No final verifier ran.

This is **not** a zero-intervention acceptance. The run's SQLite projection
reported zero event-derived human interventions, but the conductor sent SIGINT
and the adapter did not persist that action as a `human.intervention` event.
The reported zero therefore cannot be used as the actual intervention count.
The process was not restarted or resumed. Do not interpret the earlier attempt
directories as accepted completions: multiple runs remain failed or unfinished
and are intentionally preserved in the local experiment evidence directories.

## Verification

- SPEC adapter patch/receipt boundary tests: 4/4 pass.
- Dashboard, usage persistence, and skill propagation regression tests: 5 files,
  62/62 pass.
- Python syntax compilation and migration journal JSON/index check: pass.
- Browser UAT: UNVERIFIED; no isolated database-backed local runtime was
  available for the admin dashboard.
- Database migration: not run.
- Gateway and SPEC-224 Runner acceptance: UNVERIFIED.

Receipt: [`evidence/spec038-cost-by-skill-pilot-receipt.json`](evidence/spec038-cost-by-skill-pilot-receipt.json).

## Next actions

1. Integrate the cost-by-skill partial through the protected PR lifecycle; keep
   `REQ-028588461FFC` OPEN / UNVERIFIED.
2. Add a privacy-safe, tenant-scoped artifact correlation between provider
   usage and the produced `content_artifacts` row before claiming per-piece
   cost. Determine whether the correlation belongs on usage rows or in an
   existing durable execution record; do not join on a non-authoritative
   trace.
3. Repair intervention event capture for operator signals, then run a fresh
   bounded acceptance with automatic interruption/resume and an independent
   final verifier. Current pilot evidence does not meet the no-operator
   intervention objective.
