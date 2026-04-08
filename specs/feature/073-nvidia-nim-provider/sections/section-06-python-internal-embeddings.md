# Section 06 - Python Internal Embeddings

## Purpose

Add explicit NVIDIA NIM Hosted embedding support to the Python backend without changing the default retrieval embedding flow.

The goal is to give operators and internal tooling a safe way to validate NVIDIA embeddings, while keeping the production query embedding path unchanged in phase 1.

## Why this section exists

The NVIDIA hosted catalog includes embedding-capable models, but the current retrieval stack still assumes OpenAI-shaped defaults and fixed dimensional expectations in several places.

If we wire NVIDIA embeddings into the general retrieval path too early, we risk:

- dimension mismatches
- broken vector queries
- silent retrieval regressions
- hidden coupling between provider onboarding and search behavior

This section keeps the NVIDIA embedding integration explicit and internal-only so the catalog work can land safely before any broader retrieval migration is considered.

## Inputs and dependencies

This section depends on the shared catalog contract and rollout metadata produced by the earlier sections:

- `surface`
- `executionMode`
- `autoSelectionEligible`
- allowlisted NVIDIA embedding model IDs
- conservative fallback behavior for unresolved rows

It should also follow the explicit provider pattern already used in Python for KNPLabs embeddings.

## Files to change

- `python-backend/app/api/internal_embeddings.py`
- `python-backend/app/core/config.py`
- `python-backend/app/llm_proxy/providers/nvidia_nim_provider.py`
- `python-backend/app/llm_proxy/providers/__init__.py` if the shared provider import pattern remains in use
- `python-backend/tests/unit/api/test_internal_embeddings.py`
- new unit tests for `nvidia_nim_provider.py`
- optionally, a small supporting test fixture file if the team prefers to separate allowlists from test data

## Implementation details

### 1. Add a dedicated NVIDIA embedding provider

Create a Python provider class for NVIDIA NIM Hosted embeddings that follows the same explicit-only pattern as the existing KNPLabs provider.

The provider should expose a small surface that can:

- accept a model name
- accept text input
- optionally accept a requested dimension override
- call `POST /v1/embeddings`
- validate the returned vector payload
- validate the output dimension when the model has a known expected size

The provider should use a strict allowlist of curated embedding-capable NVIDIA models. Models that are not on the allowlist must be rejected immediately.

Recommended behavior for the provider layer:

- allow only known NVIDIA embedding IDs
- normalize provider-qualified IDs if needed
- reject unknown or unsupported model names
- reject non-numeric or malformed embedding vectors
- raise a clear error on dimension mismatch

### 2. Wire NVIDIA into the internal embeddings API

Extend `python-backend/app/api/internal_embeddings.py` so NVIDIA is an explicit provider option alongside the existing branches.

The dispatch layer should:

- preserve the current OpenAI and KNPLabs behavior
- add a clear NVIDIA branch
- use the new NVIDIA provider only when the request explicitly targets NVIDIA
- keep the default branch and request shape unchanged for existing providers

This is intentionally explicit rather than automatic. Phase 1 should not infer NVIDIA embeddings from the general retrieval stack.

### 2a. Add explicit NVIDIA configuration and provider exports

The Python side needs configuration and packaging touchpoints, not just the provider class itself.

Required setup:

- add `NVIDIA_NIM_API_KEY` to `python-backend/app/core/config.py`
- add `NVIDIA_NIM_BASE_URL` to `python-backend/app/core/config.py`, defaulting to `https://integrate.api.nvidia.com/v1`
- return a clear configuration error when NVIDIA is explicitly requested but `NVIDIA_NIM_API_KEY` is not set
- export `NvidiaNimProvider` from `python-backend/app/llm_proxy/providers/__init__.py` if `internal_embeddings.py` continues using the shared providers package import style

This keeps the NVIDIA branch symmetrical with the existing explicit provider branches and avoids hiding required settings in ad hoc imports.

### 3. Keep the general retrieval flow unchanged

Do not change the main retrieval embedding service or query embedding assumptions in phase 1.

That means:

- no automatic swap of the default embedding provider
- no change to the search index dimension contract
- no migration of existing vector stores
- no implicit fallback from the search path to NVIDIA embeddings

The goal is to validate NVIDIA embeddings safely, not to change production retrieval semantics in the same rollout.

### 4. Keep the provider interface narrow

The NVIDIA provider should be small and easy to audit.

Recommended implementation characteristics:

- one allowlisted provider class
- one clear embedding method
- one explicit endpoint path
- one validation path for response shape and dimension

Do not add unrelated media, chat, or rerank behavior here.

### 5. Preserve existing Python provider patterns

Follow the existing KNPLabs pattern where it is already safe and useful:

- allowlist-driven model validation
- explicit dimension awareness
- immediate failure on malformed response payloads
- provider-specific branching only in the internal API layer

The NVIDIA implementation should feel like a direct extension of that pattern, not a new abstraction that forces wider refactoring.

## TDD expectations

Write the tests for this section before implementing the Python code.

### Internal embeddings API tests

Add or extend tests in `python-backend/tests/unit/api/test_internal_embeddings.py` to cover:

- Test: the internal embeddings API dispatches to the NVIDIA provider when NVIDIA is explicitly requested
- Test: the OpenAI branch still works after NVIDIA support is added
- Test: the KNPLabs branch still works after NVIDIA support is added
- Test: explicitly requested NVIDIA embeddings return a clear 503/configuration error when `NVIDIA_NIM_API_KEY` is missing
- Test: the NVIDIA branch respects `NVIDIA_NIM_BASE_URL` when a non-default base URL is configured
- Test: unsupported provider names still fail in the same way they do today

### NVIDIA provider tests

Add unit tests for `nvidia_nim_provider.py` to cover:

- Test: allowlisted NVIDIA embedding models are accepted
- Test: unknown NVIDIA model IDs are rejected
- Test: numeric embedding vectors are returned as floats
- Test: malformed or non-numeric vectors are rejected
- Test: known dimensions are enforced when provided or when the model has a reviewed dimension
- Test: the provider calls the expected `/v1/embeddings` endpoint

### Regression safety tests

Add a regression test that proves:

- Test: no change is required to the default retrieval/query embedding path for this phase

This can be a simple behavior assertion that confirms the general retrieval path continues to use its existing provider and dimension assumptions.

## Implementation boundaries

This section should not:

- modify the web-side model selector
- modify `model_provider_map`
- add rerank support
- add implicit fallback into the main retrieval path
- add migration or re-embed jobs
- change the default query embedding dimension contract

Those concerns belong to other sections or later follow-up work.

## Exit criteria

This section is complete when:

- the Python backend can explicitly request NVIDIA embeddings through the internal embeddings API
- NVIDIA embeddings are validated against a strict allowlist and dimension contract
- malformed vectors fail fast with clear errors
- existing OpenAI and KNPLabs internal embedding flows continue to work unchanged
- the general retrieval/search embedding path remains untouched in phase 1
