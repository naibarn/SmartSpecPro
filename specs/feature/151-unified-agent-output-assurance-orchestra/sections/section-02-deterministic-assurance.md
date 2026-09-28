# Section 02 — Deterministic assurance

## Objective

Implement pure, reusable validators for evidence quality, provider capability, output structure, speaker/face identity, custom-description precedence, budget/cycle limits, and side-effect authorization.

## Files

- Extend the shared Node assurance module with deterministic validation functions and finding codes.
- Extend the Python assurance module with equivalent pure functions.
- Add fixtures for blur, extra people, ambiguous identity, custom description overriding position, Kie/Grok 4096 boundary, phone/cross-location/shout scene modes, expired/replayed tokens, and recursive plans.

## Acceptance

Required vision/evidence failures block before credit/provider calls. Empty custom descriptions do not override inferred position; non-empty descriptions do. Provider limits are explicit and never silently truncate. Every finding has code, severity, evidence refs, and user action where applicable.

## Tests

Run both language test files plus existing prompt-budget/character-description tests when available.
