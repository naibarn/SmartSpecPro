# Section 04 - Indexing Pipeline

## Objective

Build asynchronous library indexing pipeline for extract/chunk/embed/upsert with retryable state transitions.

## Scope

- Index job enqueue and worker pickup.
- Content extraction and chunk generation.
- Embedding generation and vector upsert adapter.
- Job status persistence with retries and failure diagnostics.

## Primary Files

- `python-backend/app/services/` (new indexing services)
- `python-backend/app/tasks/` (new/extended Celery tasks)
- `python-backend/app/core/vectordb.py` and embedding service integrations

## Implementation Steps

1. Add index job processor entrypoint with deterministic state machine.
2. Implement text extraction sources for media metadata (prompt/description/transcript/OCR placeholders).
3. Implement chunking rules and token count tracking.
4. Integrate embedding provider through existing embedding service abstraction.
5. Implement vector upsert adapter and chunk-to-vector linkage persistence.
6. Add retry logic and terminal failure capture in `library_index_jobs`.

## Test-First Checklist

- Test: enqueue creates a `queued` index job and worker transitions to `processing`.
- Test: successful pipeline persists chunks and marks item/job indexed.
- Test: transient failures retry and increment attempt count.
- Test: terminal failures preserve actionable `last_error` metadata.

## Verification

- Run Python unit/integration tests for indexing pipeline and job state transitions.

## Exit Criteria

- Indexing pipeline is asynchronous, retryable, and observable.
- Indexed assets produce queryable chunk/vector records.
