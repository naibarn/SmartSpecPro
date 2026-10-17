# Login page rendering regression handoff

- Status: implementation is in PR; required GitHub checks are pending.
- Canonical ref: `origin/main` at `1090256c6fc04b9d8faee9f0095210698b51cfb4` when this handoff was written.
- Source branch: `codex/fix-login-feedback-route-20261017`.
- Source commit: `5f5a53568e169059e1e3d73088668fabb089ca04`.
- PR: [#1006](https://github.com/naibarn/SmartSpecPro/pull/1006).
- Completed: assistant dialog/auth/mascot subtree is deferred on `/login`; the expected launcher remains visible and opens the assistant on click. Focused Vitest passed (5 tests), changed-scope esbuild and `git diff --check` passed.
- Known uncertainty: the screenshot's React `removeChild` exception may involve browser extension DOM mutation; no production browser reproduction established that as the root cause. The change isolates the global assistant subtree until explicitly opened.
- Pending: wait for PR checks, especially `Mocked SPEC-308 browser simulation`; after integration, verify `/login` in Chrome with extensions disabled and enabled to distinguish app behavior from extension interference.
- Next action: merge PR #1006 through the normal repository promotion path only after all required checks pass; record the resulting `origin/main` SHA and remaining browser verification status here.
