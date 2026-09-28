# TDD plan

## Section 1 failing tests first

- Add an episode 258-style test where chronological actions start with the listener rather than the first dialogue speaker.
- Assert no cross-character action is embedded inside either speech event.
- Assert Thai and English mouth/speech directives are removed from standalone physical events.
- Assert canonical lines, positions, and silent listener clauses remain.
- Add budget tests proving the terminal compiler compacts to 4,096 and fails when the protected core cannot fit.

## Section 2 failing tests first

- Parameterize known model IDs and aliases for all approved ceilings.
- Prove all Kie.ai models are no longer forced to Grok's limit.
- Prove video-specific config can tighten a known ceiling but cannot raise it.
- Prove unknown models honor video-specific, then generic configured limits, capped at 30,000, with the existing default otherwise.
- Extend Enhanced service tests for budget propagation, fingerprinting, and bridge-result rejection above the resolved budget.

## Verification environment

- Python skill tests run through the skill's `uv` project.
- TypeScript tests run through the `apps/web` Vitest workspace with its existing JWT test environment.
- Use focused suites because the repository has unrelated dirty work and historically noisy full checks.
