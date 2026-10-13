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

## Acceptance hardening follow-up (2026-10-13)

The next durable run, `647180f1-fc95-45c8-b693-2992d7903b0f` (R7), exercised
real Agents SDK planning, implementation, and an independent Codex-backed
review. The supervisor restarted four times across five processes and
reconciled the injected model-turn and post-write crash boundaries without
duplicating the observed write effect. It ended `retry_exhausted`; its reviewer
did not accept the implementation, and the final verification phase did not
run. This is recovery evidence, not a successful acceptance. The run recorded
156 completed and one still-running model call, 10,350,570 summed last-turn
tokens (including 6,638,592 cached input and 36,990 output), and zero
event-derived operator interventions. Subscription dollar cost is unavailable;
no Gateway usage is attributed to this run.

Following that failure, the adapter was hardened to resume a bounded
`MaxTurnsExceeded` continuation from the existing Agents SDK `RunState` and
session, replay completed phases before checking mutable input hashes, reuse
the original input snapshot for a running phase, and permit creation of a new
allowlisted patchable file. Regression tests cover those cases. The isolated
SPEC-038 fixture was also upgraded to apply the real additive migration to a
pre-correlation schema, seed tenant/artifact edge cases, and exercise the
actual cost-breakdown router.

Current focused app verification passed 6 files / 82 tests against the
disposable local database; the Agents SDK adapter suite passed 31/31 tests.
The exact app command and source hashes are in
[`evidence/spec038-final-focused-tests.json`](evidence/spec038-final-focused-tests.json).
R7 crash evidence is preserved under
`evidence/spec-workunit-r7-failed/` in the experiment worktree. Browser UAT
remains UNVERIFIED: the configured authenticated Moli route targets the shared
public service, and no isolated authorized browser session is available.

**Acceptance remains open.** In addition to browser UAT, the active
Python-backed AgentRuntime request contract does not yet propagate the artifact
correlation into provider usage accounting, and the independent reviewer
identified that gap. The requirement must remain PARTIAL until every supported
generation path proves the same artifact-level association, seeded tenant
isolation, and isolated dashboard UAT. No migration was run against a shared
database, and no SPEC-224 Runner or production acceptance is claimed.
