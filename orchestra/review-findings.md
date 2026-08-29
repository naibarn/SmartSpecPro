# Review Findings

## Round 1 — Investigation setup

Status: in progress.

- Confirmed the user supplied exact internal/provider task identifiers and the
  provider's image-fetch error, so this is not a UI-only report.
- No code or production state changed in this round.
- Required next evidence: persisted task payload/result, URL accessibility
  contract, and rapid Vertical Drama submission/concurrency path.

## Round 2 — Vertical Drama provider failure

Status: complete for investigation and focused repair; provider transport
redesign is deferred.

- Persisted task data confirms Kie accepted the job and later failed while
  fetching `input_urls`; the app did not fail at endpoint submission.
- The exact broker URLs are currently reachable as PNGs, so a historical Kie
  fetcher/edge failure cannot be attributed to a particular source file without
  provider-side logs.
- Burst pressure is a verified contributor: one global rate-limit defer and
  overlapping per-shot admission were observed in the episode batch.
- The Python `extra_params` naming mismatch caused the failed task's 70-credit
  reservation to escape Node reconciliation. The reader and regression test
  now cover both payload shapes.
- Focused test passed 17/17. No production data was changed and no deploy ran.

## Current Task Round 1 — Background reconciliation implementation

Status: clean targeted review; no in-scope MUST_FIX or MUST_DO_NOW findings remain.

- Root cause confirmed in the client: a 120-attempt, 2.5-second foreground poll
  generated the false five-minute timeout even though the server submission was
  already asynchronous.
- Fixed by adding an idempotent Marketplace outbox reconciliation job. Each
  worker invocation performs one task-status read and schedules the next poll
  while the provider is pending.
- Completed results are copied to durable storage before candidate persistence;
  terminal provider failures are persisted and refunded idempotently.
- UI now refreshes persisted state and continues polling while submitted image
  edits exist, without a hard timeout or browser-held provider request.
- Gates rerun after the final fix: focused tests (3 files / 9 tests), nearby
  Marketplace regressions (4 files / 89 tests), and focused diff check all pass.
- VERIFY_ONLY: authenticated browser/provider run, production worker execution,
  and deployment remain outside this local change and were not claimed.

## Current Task Round 2 — Vertical Drama Kie admission/retry

Status: complete; no open focused review findings.

- The per-user image dispatcher remains authoritative at three admitted tasks,
  protected by a PostgreSQL advisory lock and durable Celery claims.
- Periodic failed-image recovery was a bypass and now re-arms through the same
  dispatcher. A delayed provider retry also holds a durable claim until its
  wake-up, preventing over-admission.
- Kie reference-fetch failures are the only provider failure class receiving
  this delayed retry policy: 15s, 30s, 60s, then terminal failure and user
  notification. Policy/malformed/permanent errors remain terminal.
- Focused proof: Python task tests 36/36 and web credit reconciliation 17/17;
  syntax and diff checks passed.
- VERIFY_ONLY: provider-side logs, authenticated browser sequence, production
  worker execution, deployment, and production DB counts remain unverified.

## Current Task Round 3 — Character-look skill and legacy repair

Status: implementation complete; local DB backfill partially applied with one
explicit age-conflict review remaining.

- The dedicated `vertical-drama-character-look-designer` skill is a real
  discoverable LLM-only skill with versioned JSON schemas, strict Zod
  validation, story-evidence separation, identity locks, hair/makeup/footwear/
  accessories, and six canonical age stages.
- New episode generation now sends the authoritative apparent-age anchor to the
  skill. Outfit variants cannot silently age-shift; age-stage variants require
  an explicit canonical target and age-safe design.
- Legacy repair is scoped to unedited `system_suggested_look` rows with
  unambiguous storyboard evidence. Series 53 rows 202 and 203 were repaired by
  the real provider and verified `ready`, contract version `1`, visual-only
  descriptions, and provenance/design-run records. Shot assignments were not
  changed.
- Row 201 remains `review` because the source scene cues conflict with the
  stored school-age identity anchor; it is not auto-approved as an infant look.
  Rows 197–200 are untouched because they are legacy/user-origin rows without
  sufficient system provenance for blind mutation.
- Regression proof: focused character-look/selector tests 30/30, skill verifier
  passed, and owned-file Prettier check passed. Full web typecheck remains
  baseline/OOM-noisy and is not claimed as passing.

## Current Task Round 4 — Legacy visibility and production repair path

Status: code complete; production rollout is blocked by missing deployment
credentials, not by the character-look implementation.

- The Characters UI now suppresses known story-evidence leakage from visual
  fields, so an old row cannot continue presenting episode prose as wardrobe
  details after the new client is deployed.
- An owner-scoped `repairLegacyCharacterLook` mutation and per-look “ซ่อมด้วย
  AI” action now call the real LLM-only skill. User-edited/approved rows,
  ambiguous evidence, and age conflicts remain protected; conflicts become
  review state instead of guessed output.
- A production `workflow_dispatch` backfill workflow was added with series,
  row, force, and limit controls. It uses the production database and
  encryption secret only through the protected GitHub environment.
- Commit `80e3236db` was pushed to `main`. Production deploy run
  `33260555739` reached no build/deploy step and failed at GCP auth because the
  production environment has neither `GCP_WORKLOAD_IDENTITY_PROVIDER` nor
  `credentials_json` available to the workflow. No production rows changed.
- Required external gate: configure one valid GCP credential secret, rerun the
  production deploy, then run the backfill workflow for series 53. Until that
  happens, the live site is expected to show its previous client/data.
