# Section 03: Deterministic Retry Classification

## Ownership

- `python-backend/app/tasks/media_tasks.py`
- `python-backend/tests/tasks/test_media_task_retry_state.py`

## Work

1. Add a failing classifier test for the wrapped Kie video error.
2. Add the narrow permanent marker.
3. Retain the transient timeout regression.

## Acceptance

- The file-type validation error is terminal.
- Transient provider failures remain retryable.
- Focused pytest and Ruff checks pass.

## Implementation Notes

- Added the exact lowercase marker `file type not supported` to the permanent
  provider-error classifier.
- Full focused retry-state suite: 11 passed.
- Ruff reports 58 pre-existing issues in the two legacy files; the added test
  and marker introduce no new lint pattern.

## Risk

Avoid broad unsupported-file matching that could capture transient download or
storage errors.
