# SPEC-224 Runner Start Admission Checkpoint — 2026-10-26

## Integrated implementation

- Canonical `origin/main`: `2ef1c500010e292b43632c6b2df73a8c19b9f597`.
- Start admission now accepts an owner-selected bounded USD cap (default USD 1.00) and creates/reuses an exact-run, one-hour non-production policy through the existing policy API. It provisions the matching economic budget through the existing budget service when none is eligible; it does not mint credits or grant production authority.
- Replays bind to the same cap and exact run scope. Python policy creation uses a deterministic run-scoped policy identity and reuses an existing matching active record.
- Focused Vitest: 36/36 passed. Python policy/API tests: 14/14 passed with `--no-cov`; Python compilation and `git diff --check` passed.
- Canonical build: `BUILD_PASSED`, source `2ef1c500010e292b43632c6b2df73a8c19b9f597`; web artifact digest `sha256:3fcd26f75456f758576b438a5d9e425cb50447bd43ef16f0f6203511b5b940fc`, 126,576 files. Cloudflare staging bundle dry-run digest `sha256:a385707d2347070d86f135779a4162a3c180a1c0b9985f69330c48f29d4732f5`.

## Live runtime and Runner evidence

- Read-only Runner observation: registered `local-runner`, owner user `1`, tenant `tenant-ZCSKEM9s`, session `6ddda9fe-0845-44af-9b9f-1e1cb11e1e62`, version `0.2.41`, trusted/online at observation, Codex probe already passed, workspace fingerprint `0f2eeb70d5767268e5170defcaaf8e4f7182ce6de91a4d210b0d0ade0cbce1`.
- Registered workspace source SHA `fbd7fd1bd8324973540664d7f7de2bd9e5844757` was clean and an ancestor of canonical main at inspection, but it is behind current main. No enrollment or workspace data was reset.
- Before the new Start flow is exercised, the development database had no active exact-scope SPEC-224 owner policy or eligible economic budget for this tenant. The new authenticated Start path provisions/reuses these within the user-selected cap; no production access is added.
- No protected DevelopmentRun, job/attempt dispatch, tool execution, usage/credit settlement, interruption recovery, or independent Final Verify has been recorded by this checkpoint.
- Linux full-stack release status is still generation 123 at source `aa60b47a355ef032d585cd9b1e8cb2716f1b0fd1`, not current canonical. The new artifact was built but not promoted. Production Python policy service release was not performed.

## Exact continuation

The owner must use the deployed authenticated SmartAIHub Chat → Spec 224 workspace → select the existing Windows Runner/workspace → enter a reversible task that first verifies clean status and fast-forwards only if the registered SHA is an ancestor of `origin/main` → prepare the plan → review the displayed USD 1.00 maximum → Start. Do not repeat the Codex task probe. The next evidence must come from the resulting real DevelopmentRun and its protected dispatch, execution, settlement, recovery, and independent Final Verify receipts. Until the owner Start and required runtime promotion occur, SPEC-224 remains partial.
