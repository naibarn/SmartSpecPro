# Expanded voice lifecycle specification review

Date: 2026-09-07. Documentation review only; supersedes earlier completeness claim for reference/training scope.

| Pass | Gap considered | Resolution |
|---|---|---|
| Contract | Named profile/ref/transcript fields and create APIs absent | Added exact schemas, import/profile/binding APIs, revisions and errors |
| Provider | Family capability inference and implicit transcript substitution | Explicit modes and per-revision adapter fixtures; optional models gated |
| Training | No dataset/job/checkpoint/evaluation/promotion contract | Added section 12 with local/cloud capability gates, held-out comparison and rollback |
| Safety and recovery | Inference consent mistaken for training; revoked ancestors and interrupted jobs | Separate training grants, transitive revocation, checkpoint/budget and unknown-outcome policy |
| Integration | Manifest/TDD/release completeness mismatch | Added sections 11/12, persistence ownership and A/B/C/D release matrix; preserved previous features |

Specification scope covers reference cloning and gated training. Runtime provider mappings must be fixture-validated against pinned revisions; hardware quality/cost are measured implementation gates, not guessed promises. No code, database, generation or model training was executed.
