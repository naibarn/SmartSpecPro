# Self-review round 1

## Scope reviewed

- spec completeness
- implementation feasibility against current repo
- safety of selection precedence, provider isolation, and route-family behavior

## What is strong

- the plan reuses existing selection primitives instead of inventing a second auto-selector
- explicit users are protected by design
- Kie behavior is inherited from feature 065 rather than duplicated
- the plan treats route-family compatibility as a first-class filter
- the plan clearly separates user preference from last resolved model

## Remaining risks to watch during implementation

### 1. Conversation schema friction

The current conversation model appears centered on a single stored `model`.

Risk:

- shoehorning provider-auto into the old field could blur preference vs resolved model

Mitigation:

- prefer a small metadata extension or conversation config field if a clean schema change is too large for the first slice

### 2. Capability derivation drift

If chat capability derivation becomes too heuristic, auto mode may feel surprising.

Mitigation:

- keep first implementation based on explicit allowlisted feature modes only

### 3. Picker complexity

Adding provider-auto entries could clutter the picker if every provider gets one immediately.

Mitigation:

- gate provider-auto entries by enabled provider + enabled mapped models
- start with Kie and OpenRouter

### 4. Route-family continuity

Continuity logic must not become so sticky that it blocks a truly required family upgrade.

Mitigation:

- continuity is a tiebreaker only after compatibility and capability requirements are satisfied

## Readiness assessment

Plan quality: strong

Implementation readiness:

- ready for deep-implement

Most important rule to preserve during implementation:

- auto resolution must never produce a model that downstream routing would reject immediately
