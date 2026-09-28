# TDD Plan: Vertical Drama Prompt Expansion Quality Gap Closure

Tests are written before each implementation slice. These are test stubs and
acceptance targets, not full implementations.

## 1. Shared contract and profile model

Test `promptExpansionTreatment`/`promptExpansion.ts` for:

- versioned story treatment accepts the required bounded fields and preserves
  provenance;
- review/documentary/news/software profiles accept their own required fields
  without romance requirements;
- creator fact, model inference, user edit, and verification states are
  validated and bounded;
- oversized fields/lists, arbitrary reasoning, and unknown unsafe structures are
  rejected;
- the existing 2,000-character input boundary accepts 2,000 and rejects 2,001
  on the client/server contract.

## 2. Skill routing and structured execution

Test the prompt expansion execution service for:

- selected skill is `vertical-drama-prompt-expansion`, never
  `general-article-writer`;
- missing skill, non-LLM skill, sandbox/mock/sample/fixture runtime path, and
  missing provider/model are rejected before credit deduction;
- strict mode never falls through to generic skill or text executor;
- schema name/version and structured response format are sent to the executor;
- Thai and English locale/profile hints reach the skill payload;
- Draft architecture planner is not invoked by preview;
- one preview operation permits only the configured bounded repair attempts;
- parser/schema repair attempts do not create independent user charges;
- provider, timeout, schema, and missing-real-run-evidence failures return typed
  recoverable outcomes with stable error codes;
- a non-mocked integration smoke test records provider/model/request ID and
  validates that the returned skill output came from the configured LLM.

## 3. Parser and deterministic quality gate

Test parser/gate fixtures for:

- valid JSON object;
- Markdown-fenced JSON;
- approved `data`/`result` transport wrapper;
- snake_case aliases and version aliases;
- plain text rejected as invalid structured skill output;
- empty, malformed, unsafe, copied, near-copied, and generic instruction-only
  output rejected;
- story outputs missing relationship/conflict/ending signals diagnosed;
- non-story profiles diagnosed against their own minimums;
- treatment containing per-episode scenes, dialogue, shot grids, or production
  commands flagged as a boundary violation;
- original creator facts remain present and model claims remain unverifiable
  until sourced/approved;
- no rejected parse becomes a successful preview with the original text.

## 4. Persistence, router, and apply safety

Test service/router behavior for:

- preview save is tenant/user scoped and idempotent for the same key/hash;
- same key with different input hash does not return the wrong preview;
- legal status transitions are enforced;
- apply succeeds for exact owner/hash/revision/status;
- wrong tenant/user returns safe not-found/conflict behavior;
- stale hash, stale revision, already-applied different payload, and concurrent
  apply are rejected atomically;
- exact same approved payload is idempotent where the contract permits;
- legacy run JSON remains readable through the compatibility adapter;
- migration-unavailable behavior remains an explicit precondition error.

## 5. Draft handoff

Test router/story-bible handoff for:

- approved treatment reaches Draft once with run ID/hash/revision lineage;
- original prompt, user edits, model assumptions, and open questions retain
  their precedence labels;
- no expansion run remains backward-compatible with existing Draft generation;
- stale, missing, cross-owner, or hash-mismatched treatment is rejected or
  requires re-preview;
- preview/apply does not create a second Draft or episode-generation call;
- generated Draft does not silently erase approved treatment facts.

## 6. UI state and accessibility

Extend existing Vitest/jsdom component tests for:

- idle/loading/success/rejected/stale/applied state matrix;
- original prompt and AI treatment render as separate labelled regions;
- the dialog says treatment is not Draft;
- edit marks user provenance and preserves unsaved values on retry/cancel rules;
- retry and cancel do not overwrite the original prompt;
- apply is disabled for every failed/preflight/provider/invalid-output state;
- counter and over-2,000 lock remain correct;
- long Thai/English text wraps and no user text is clipped;
- keyboard labels, focus behavior, status/alert semantics, and disabled-button
  explanation are present.

## 7. Browser and release proof

Add/extend Playwright coverage for:

- representative Thai story premise through successful treatment preview;
- malformed/provider-failure response through visible retry/cancel;
- editing and applying treatment, then confirming Draft handoff label;
- stale premise edit blocks apply and requests fresh preview;
- 390x844, 768x1024, and 1440x900 responsive dialog layouts;
- keyboard-only open, edit, cancel, retry, and apply flows;
- no horizontal page overflow or clipped long fields.

Add a separately labelled non-mocked integration smoke test with a configured
test provider. Assert `execution_mode: llm-only`, provider/model/request
evidence, `mocked: false`, non-fixture output, and v2 schema/quality success.

Run focused workspace tests, `git diff --check`, changed-file diagnostics, and
record baseline-wide typecheck/browser/deployment gaps separately.
