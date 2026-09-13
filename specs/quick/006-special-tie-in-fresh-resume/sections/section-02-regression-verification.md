# Section 02: regression verification

## Ownership

- Focused tests and static verification only; no production data or paid provider calls.

## Checks

- Fresh mode never runs the history hydration path.
- Resume mode keeps current history behavior.
- `initialInput` edit flow remains intact.
- Normal `generateNextEpisodes` flow is untouched.
- Prettier and diff checks pass for owned changes.
