# Cross-Section Integration Review

Round: 1
Status: pass

Interface alignment:

- Web-side provider normalization, model config sanitization, and seed metadata all reuse `mediaProviderUtils.ts`.
- The launch-model provider/model ids match between the web static registry, the seed script, and the Python gateway/provider runtime.
- Async task recovery reads the same `submission.*` contract that the gateway stores after submit.

Verification:

- Focused Vitest slice: `80` tests passed.
- Focused pytest WaveSpeed slice: `23` tests passed with default coverage enabled after cleaning a corrupted local `.coverage*` artifact.
- Seed script import smoke check passed.
- Workspace `typecheck` still fails on unrelated pre-existing TypeScript issues outside the WaveSpeed implementation surface.

Notes:

- Repository-wide pytest defaults enable coverage again after removing the corrupted local coverage sqlite artifact.
- No additional AUTO-FIX items remained after the seed-path alignment work.
