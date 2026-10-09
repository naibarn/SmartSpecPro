# Codex adapter authentication status probe — 2026-10-09

## Integrated implementation

- PR #401 merged at `5ce718f36f8f05c80350dcf511d1ded9ed95ef97`.
- Runner source commit: `213b7933fe3b580e311f80e33333819aa0e85ac2`; follow-up WIF guard test: `ccc484fafc7211e84aa8909589abb5b067acbef9`.
- Approved `codex.v1` discovery now runs bounded `codex login status` after the version probe. It accepts only exact recognized local login status lines; malformed output, command failure, and unknown status remain not ready.
- If either `OPENAI_FEDERATION_RULE_ID` or `OPENAI_IDENTITY_TOKEN_FILE` is present, the status command is deferred to avoid consuming a one-time workload identity assertion. Raw command output is never returned or logged.
- Desktop reason labels distinguish authenticated status, required auth, deferred WIF probing, and probe failure. Execution policy, server authorization, task dispatch, and smoke-test behavior were not changed.

## Verification

Against integrated SHA `5ce718f36f8f05c80350dcf511d1ded9ed95ef97`:

- `cargo test --manifest-path apps/runner-app/Cargo.toml adapters::tests::` — PASS, 20 tests.
- `cargo check --manifest-path apps/runner-app/Cargo.toml` — PASS.
- `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check` — PASS.
- `node --check apps/runner-desktop/ui/app.js` — PASS.
- `git diff --check` — PASS.
- Ten focused review checks covered adapter scope, fixed command arguments, null stdin, bounded timeout, WIF deferral, environment-value secrecy, output bounds, exact status parsing, fail-closed errors, and unchanged policy/dispatch boundaries.

## Acceptance boundary

The mock executable test proves the local probe contract only. It does not prove Windows runtime readiness, Control Plane connectivity, capability publication, provider authorization, or task execution. The last supplied Windows screenshot evidence remains Runner `0.2.24`, 5/11 tools ready, with a successful Runner-bound Codex prompt; current Windows installation and refresh/session continuity are unverified in this session. Windows remains the primary acceptance baseline. No Runner installation, reconnect, restart, protected task, or Linux service operation was performed.
