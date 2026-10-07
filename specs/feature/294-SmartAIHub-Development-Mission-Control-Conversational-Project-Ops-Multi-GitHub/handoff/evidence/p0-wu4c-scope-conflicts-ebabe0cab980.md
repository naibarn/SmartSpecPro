# Scoped cross-host Workspace Authority conflicts

- Integrated pull request: #153
- Canonical integration SHA: `ebabe0cab9805f7a26ba4b752e045db8fcf16608`
- Code commit: `2966e9312`
- Changed scope: Mission Control now reconciles workspace claims by tenant, repository, and opaque workspace ID. Different repositories can reuse the same opaque ID without a false conflict; differing project bindings for the same repository/workspace remain an explicit conflict.
- Verification: focused `workspaceAuthorityProjectReadModel.test.ts` — 8 passed; `git diff --check` passed.
- Outcome: cross-host read projection scope is more precise; ingestion sources and safe actions remain partial. `P0_CODE_IMPLEMENTATION` stays `PARTIAL`.
- External runtime verification: `NOT_RUN`.
