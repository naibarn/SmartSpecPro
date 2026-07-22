# TDD Plan

## Red

1. Add Web regression tests proving:
   - per-shot single prompt persistence includes the approved asset ID;
   - split prompt persistence includes the approved asset ID;
   - render submission uses the current approved ID when the projection is
     missing;
   - render submission overrides a stale projected ID;
   - a one-reference model excludes `previous_main`.
2. Add Rust tests expecting `.jpg`, `.png`, `.webp`, and `.gif` for HTTPS
   result-marker bytes.
3. Add Python tests classifying `File type not supported` as non-retryable and
   retaining transient retry behavior.

## Green

- Make the smallest changes in the owning functions.
- Avoid new dependencies and schema changes.
- Keep compatibility behavior when no authoritative approved image exists.

## Refactor

- Reuse a small pure resolver/helper where it prevents duplicated
  source-of-truth logic.
- Do not refactor the large router beyond the directly affected blocks.

## Verification commands

Web:

```bash
npm --workspace apps/web test -- \
  server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts
```

Worker:

```bash
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml hermes_executor
```

Python:

```bash
cd python-backend
pytest -q tests/tasks/test_media_task_retry_state.py
```

Static checks:

```bash
npm --workspace apps/web run check
cargo fmt --manifest-path apps/worker-app/src-tauri/Cargo.toml -- --check
ruff check python-backend/app/tasks/media_tasks.py python-backend/tests/tasks/test_media_task_retry_state.py
git diff --check
```

