# TDD Guidance

## Red tests

- Add an assembly test with managed clip/banner/audio/watermark URLs and a resolver mock that returns signed URLs; assert both template and manifest use the signed values.
- Add a production assembly test with managed clip/watermark/BGM URLs; assert segmented templates and manifest use the signed values.
- Add a failure test for a resolver returning the wrong number of URLs; assert no worker job is queued and `VdRemotionRenderError` is raised.

## Implementation

- Introduce the shared ordered URL resolver helper and wire it into both submission functions.
- Preserve the existing dependency injection hook so tests do not need live Redis or storage.

## Regression checks

- Existing public-CDN tests must continue to pass.
- Existing preview signed-URL tests must continue to pass.
- Run the focused test file with the repository's JWT test environment.
- Run `git diff --check` on the changed implementation and test files.
