# Mission Control workspace divergence projection

- Integrated pull request: #144
- Canonical integration SHA: `26fd48168f44f31a6759c9264cfc5107445fe187`
- Code commit: `f8ebdb9d603cbe4700f4c60fb7804f209363f200`
- Changed scope: the local Workspace Authority projection now reports canonical user workspace host, branch, lease data and exact ahead/behind commit counts from Git. Missing commit graph evidence remains `UNKNOWN`.
- Verification: 41 Workspace Authority tests passed; Python bytecode compilation and `git diff --check` passed.
- Outcome: this improves the repository-local workspace projection. Pushed/unintegrated freshness and safe-action API/worker execution remain open; `P0_CODE_IMPLEMENTATION` stays `PARTIAL`.
- External runtime verification: `NOT_RUN`.
