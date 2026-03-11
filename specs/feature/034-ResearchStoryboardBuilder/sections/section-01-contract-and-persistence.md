# Section 01 - Contract And Persistence

## Objective

Create the foundational structured result contract for agency runs, normalize the Python-to-Node run shape, and add additive persistence support for structured preview and committed artifact tracking.

## Why this section exists

Everything else depends on a stable result shape. The current system has plain-text responses and a naming mismatch between Python API output and the Node bridge. Without fixing that base contract first, routing, preview rendering, and commit flows will accumulate translation bugs.

## Scope

- Define `AgencyResultEnvelope` and validation rules for supported intents.
- Add envelope parsing in the Python agency execution path.
- Persist structured result metadata additively on runs.
- Introduce `agency_run_artifacts` as the run-scoped preview and provenance index.
- Normalize the run response shape between Python and Node while preserving text-only compatibility.

## Primary files and areas

- `python-backend/app/services/agency_swarm_adapter.py`
- `python-backend/app/services/agency_service.py`
- `python-backend/app/services/agency_result_envelope.py`
- `python-backend/app/api/agencies.py`
- `python-backend/app/models/agency.py`
- Node bridge/API consumers under `apps/web/server/services/agencyBridge.ts`
- `apps/web/drizzle/schema.ts`
- `python-backend/migrations/012_agency_structured_results.py`

## Required implementation work

### 1. Define the structured contract

Create a versioned envelope model that supports:

- `chat_reply`
- `research_report`
- `video_storyboard`
- `presentation_deck`
- `media_prompt`

The contract must separate:

- human-readable summary text
- typed payload
- artifact descriptors
- references and provenance
- metrics

Validation must reject unknown intents, malformed payloads, and unsafe reference shapes, while allowing text-only fallback for non-structured agencies.

### 2. Parse and persist envelopes in Python

Add post-run parsing after the final agency response is produced. Record:

- whether an envelope was found
- whether schema validation passed
- parsed intent and summary
- failure reason when validation fails

Store these results additively in run persistence, without breaking existing read paths.

### 3. Introduce artifact index persistence

Add `agency_run_artifacts` for run-linked preview and commit tracking. The table should support:

- run and conversation linkage
- tenant attribution
- preview versus committed state
- summary and payload snapshot reference
- provenance reference
- commit status
- stable commit token or idempotency key
- target identifiers after commit

Keep schema rollout additive and nullable where needed.

### 4. Normalize the cross-service response contract

Choose one canonical run response shape for Python and Node. Keep a compatibility shim temporarily, but all new consumers should read the normalized shape only.

The normalized response should include:

- canonical text field
- optional structured envelope field
- preview artifact metadata
- status and run identifiers

## Tests to write first

- Python test: valid envelope is parsed and stored successfully.
- Python test: invalid envelope records a parse failure and preserves text fallback.
- Python test: text-only agency runs still succeed without envelope data.
- Node test: bridge handles the canonical text field and optional envelope consistently.
- Node or migration test: new persistence fields and `agency_run_artifacts` are additive and nullable.
- Contract test: Python and Node agree on the same result shape when envelope is present and when it is absent.

## Risks and safeguards

- High risk: active runtime tables. Use additive migrations only.
- Compatibility risk: old consumers relying on text fields. Preserve readable text in every case.
- Data integrity risk: artifact index rows without tenant attribution. Make tenant linkage mandatory.

## Exit criteria

- Structured envelope model exists and is validated.
- Python can parse and persist structured results additively.
- `agency_run_artifacts` exists as the preview/provenance index.
- Node and Python use one canonical run response contract with fallback compatibility.

## Implementation notes

- Added `python-backend/app/services/agency_result_envelope.py` to validate fenced or raw JSON envelopes and normalize readable fallback text via `summary` when the run output is structured-only.
- Kept `response` as the canonical Python-to-Node text field and preserved `output` as a compatibility shim for existing consumers.
- Extended `agency_runs` with additive structured-result columns and introduced `agency_run_artifacts` as the run-scoped preview index in both SQLAlchemy and Drizzle schema definitions.
- Persisted compact preview metadata plus payload/provenance snapshots from `AgencyService.execute_run()` when a structured envelope validates successfully.
- Exposed `structured_result` and `preview_artifacts` through the Python API and Node bridge without breaking legacy text-only runs.

## Tests added and updated

- `python-backend/tests/unit/test_agency_result_envelope.py`
- `python-backend/tests/unit/test_agency_service.py`
- `python-backend/tests/unit/test_agency_router.py`
- `python-backend/tests/unit/test_agency_models.py`
- `apps/web/server/services/agencyBridge.test.ts`

## Known follow-ups

- Section 02 still needs to build preview-fetch and preview-ready streaming behavior on top of the persisted artifact rows added here.
- The repo's full Python pytest bootstrap hangs on some broader agency/router/model files in this environment, so Section 01 verification relies on targeted lean-run pytest plus import/smoke checks for the new contract paths.
