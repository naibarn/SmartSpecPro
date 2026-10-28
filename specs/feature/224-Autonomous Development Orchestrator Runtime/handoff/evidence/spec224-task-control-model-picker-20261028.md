# SPEC-224 Task Control model picker evidence

- Captured: 2026-10-28T13:37:11Z
- UI source: `e0009508f94195928ffb65bfc7ed3bbf6256575d`
- Integration: `origin/main` at the same SHA when captured.
- Outcome: partial implementation evidence; not Live Acceptance.

## Implemented

Task Control reads the selected authorized workspace's `modelCatalog` from the existing `availableWorkspaces` read model. The model options are rendered from that catalog; the client contains no model-name list. Auto resolves to the Runner catalog default. Reasoning options come from the selected model's advertised `reasoningEfforts`. The panel shows the discovered Harness, CLI version, catalog timestamp and verification state, and can re-read the latest authorized Runner catalog projection. A missing, stale, wrong-account-scope or failed catalog disables model selection and Start. A removed explicit model stays unavailable instead of silently falling back.

Start includes the model policy, explicit model ID when selected, and supported reasoning effort. These fields are part of the UI idempotency key, and the existing SPEC-224 server path persists and revalidates the resolved selection.

Simple Mode keeps Auto and displays the resolved default model. Developer Mode exposes the dynamic Model selector and only the selected model's supported reasoning choices.

## Verification

- Focused Task Control Vitest: `Spec224WorkspacePanel.test.tsx`, 22/22 passed on source SHA `e0009508f94195928ffb65bfc7ed3bbf6256575d`.
- Playwright authenticated UAT command: `SMARTSPEC_UAT_RUN_ID=spec224-model-picker-20261028 npm --workspace apps/web run test:uat:chromium -- --grep "Developer Task Control selects only the connected Runner model catalog"`.
- Playwright reached Task Control but skipped the model interaction because the isolated UAT database returned no authorized Runner. It did not verify a live catalog or select a model.
- Read-only transaction on the configured local development database at 2026-10-28T13:40:34Z found 16 registered Runner records, one trusted/online/current Runner, and zero trusted current snapshots with a discovered model catalog. The query did not return Runner IDs and made no database changes.
- No DevelopmentRun was started. No real model inference, pinned live execution, or remote Runner ACK was established by this evidence.
- `git diff --check` passed. Prettier was unavailable in this checkout (`prettier: not found`); no repository-wide typecheck was run.

## Remaining acceptance

Use the approved Runner release/update path to publish a fresh account-scoped model catalog and current capability ACK. Then run the authenticated Playwright selection against that catalog, complete the existing isolated PostgreSQL dispatch check, and verify a bounded Debian Codex task. Keep SPEC-224 acceptance partial until those checks have fresh evidence.
