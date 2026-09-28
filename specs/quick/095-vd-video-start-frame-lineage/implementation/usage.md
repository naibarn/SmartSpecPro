# Usage Guide

## Runtime Behavior

1. Generate or approve a shot image.
2. Generate the shot video prompt.
3. Create the video with Grok/Hermes or Kie.ai.

The paid-render boundary now treats
`startFramePlan.frames[].approvedMediaAssetId` as authoritative. A missing or
stale `motionPromptPack.clips[].startFrameAssetId` is corrected automatically,
and legacy fallback remains available only when no approved frame exists.

Future Hermes-generated images downloaded from HTTPS result markers are stored
with an extension matching their validated bytes instead of `.img`.

## Verification

```bash
npm --workspace apps/web run check
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml 'hermes_executor::tests::'
cd python-backend
.venv/bin/pytest -q --no-cov tests/tasks/test_media_task_retry_state.py
```
