# Section 05 — Verification and Evidence

## Required proof

- focused shared contract tests;
- focused server router/persistence/runtime tests;
- focused UI tests;
- migration/schema consistency check;
- Prettier and `git diff --check` on owned files;
- targeted web build or typecheck, reported separately from baseline-noisy full checks;
- browser route smoke at 390x844, 768x1024, and 1440x900 when available.

## Real provider verification

Only after all mock/unit tests pass, use one bounded authenticated generation per required path if credentials and provider state are available:

1. image model with quality support, verify provider request/task metadata contains the selected quality;
2. OpenRouter LLM model with reasoning support, verify request metadata contains the selected effort and response completes.

Do not retry paid failures more than the bounded policy allows. Report model, task/run IDs, provider status, and credits consumed. A local test pass is not a substitute for live provider proof, and live provider proof is not a substitute for contract tests.
