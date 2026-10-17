# Login page rendering regression handoff

- Status: implementation merged to `origin/main`.
- Canonical ref after integration: `origin/main` at `71cf04192b540de3c2935e34b330b990f6d49e01`.
- Source branch: `codex/fix-login-feedback-route-20261017`.
- Source head: `cd617cac5d7367810a06f6aff6e84607e076b743`.
- PR: [#1006](https://github.com/naibarn/SmartSpecPro/pull/1006).
- Completed: assistant dialog/auth/mascot subtree is deferred on `/login`; the expected launcher remains visible and opens the assistant on click. Focused Vitest passed (5 tests), changed-scope esbuild and `git diff --check` passed.
- Integration receipt: PR #1006 merged at `2026-10-17T02:06:36Z` as `71cf04192b540de3c2935e34b330b990f6d49e01`. `progressive_integration_gate` and `Mocked SPEC-308 browser simulation` passed. `build-preview` was skipped by workflow conditions.
- Known uncertainty: the screenshot's React `removeChild` exception may involve browser extension DOM mutation; no production browser reproduction established that as the root cause. The change isolates the global assistant subtree until explicitly opened.
- Pending: production deployment and browser verification on the deployed SHA, with extensions disabled and enabled, to distinguish app behavior from extension interference.
- Next action: deploy from the canonical source through the normal deployment lifecycle, then verify `/login` and update this handoff with production evidence.
