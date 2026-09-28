# Section 01 — Shared Twin DNA

## Ownership

Own pure shared helpers under `apps/web/shared/verticalDramaSeries/` and their tests.

## Work

- Define symmetric relation resolution over the existing one-way pointer.
- Define shared face/age field allowlist and local override allowlist.
- Select the most authoritative approved DNA deterministically.
- Merge/materialize shared fields with source id/revision provenance.
- Validate that selected variants in one shot use compatible age ranges.

## TDD and acceptance

Write failing unit tests first for one-way/reverse links, missing DNA, deterministic
selection, local override preservation, and infant-vs-school-age rejection. Keep helpers
side-effect-free and browser-safe.

## Risks

Do not add `node:crypto` or DB imports to browser-shared modules. Preserve existing DNA
schema names and avoid silently treating an age-stage variant as an identical twin.
