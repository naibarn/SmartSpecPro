# Section 01: release admission

Ownership: server runtime route and release packager.

Target files: `apps/web/server/routes/workerRuntime.ts`, its focused tests,
and `apps/worker-app/scripts/package-runtime-release.mjs`.

TDD: complete fixtures must serve; missing Whisper metadata and placeholder
signature fixtures must be rejected.

Acceptance: server checks actual archive entries and signature content in one
ZIP read; packaging rejects empty or placeholder signature input.

Risk: loading large archives is expensive; keep one archive read per candidate
and retain version sorting/rollback behavior.
