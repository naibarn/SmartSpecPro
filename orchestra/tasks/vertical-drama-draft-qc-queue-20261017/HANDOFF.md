# Vertical Drama Draft QC Queue Payload Fix

- Owner/worktree: Codex, `codex/fix-draft-qc-job-payload-20261017`
- Base: `46bbd2f7202f89414628a1d9672225435b72329a`
- Root cause: the QC queue included the full draft record in `worker_jobs.payload`; canonical job input validation rejects payloads above 500 keys (`Job definition contains too many keys`). The router surfaced this as “Draft QC queue is unavailable”.
- Implemented: queue only `{ runId, seriesId }`; resolve tenant and user from trusted worker context; retain the draft in the owner-scoped QC record. Added a regression test with a 520-key draft.
- Also aligned AI prompt expansion with the existing 12,000-character premise field limit (was 5,000), including shared client/API validation and credit estimation. Added coverage for a 7,498-character premise and the 12,000-character boundary.
- Focused verification: targeted Vitest — 19 passed across QC queue, prompt expansion validation and wizard UI (56 unrelated tests skipped by name filter). Esbuild syntax/transformation passed for both queue services and the queue test.
- Integration: PR [#1008](https://github.com/naibarn/SmartSpecPro/pull/1008), source head `899fa36c9cd82cd73aa263b4641c97f021e2daa5`, merged at `b94ea3b98f24cf886d23552f2f8cdbebeb720262`. Confirmed fetched `origin/main` is `b94ea3b98f24cf886d23552f2f8cdbebeb720262` and contains the source head.
- Required PR checks: progressive integration gate, Git lifecycle, and mocked SPEC-308 browser simulation all passed.
- Canonical build: `BUILD_PASSED` for `04e79db718443b882fc74e2453afd00953303117` (`smartspec-web`); 1,638 packages reused, 0 downloaded. Artifact digest: `sha256:1c9c54f96c53cfcefea20eb9605aa3d84dfae47694b37127d59d29823443e36e`. The dirty primary checkout was preserved (`BLOCKED_DIRTY`, 77 paths); build output is in the isolated canonical workspace.
- Pending: full typecheck and real authenticated Draft QC browser/UAT. The mocked browser simulation is not product UAT. Production deployment/restart was not performed.
- Next action: run focused authenticated development UAT of Draft QC enqueue on the integrated SHA, then record the result.
