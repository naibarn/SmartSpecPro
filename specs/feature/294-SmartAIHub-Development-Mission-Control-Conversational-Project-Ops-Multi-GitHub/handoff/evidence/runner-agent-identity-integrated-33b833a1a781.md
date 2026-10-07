# Trusted Runner agent identity fallback

- Integrated pull request: #146
- Canonical integration SHA: `33b833a1a78101be8f5f0386b2fb49677b3c57bd`
- Code commit: `72c040d6d0c9b47e7e51101b3c1a785cbc5f01c3`
- Changed scope: active fresh trusted sessions now use the authenticated Runner registration as agent identity when no unique external provider fact exists. Provider remains `UNKNOWN` without a valid tool fact; no identity is inferred from profile or workspace names.
- Verification: 3 focused files, 37 tests passed; `git diff --check` passed.
- Outcome: Mission Control still lacks pushed/unintegrated freshness and some task assignment/provider facts. `P0_CODE_IMPLEMENTATION` stays `PARTIAL`.
- External runtime verification: `NOT_RUN`.
