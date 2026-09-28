# Decision Log

## Depth

- Chosen depth: micro.
- Rationale: one source catalog entry, one regression test, then a controlled DB upsert.

## Decisions

- Add a separate `higgsfield/seedream_v5_pro` image row; do not replace Lite.
- Reuse Higgsfield `generate_image` and `higgsfield.generate_image` routing.
- Do not invent optional provider parameters; leave the model to provider defaults.
- Verify with a focused Vitest suite, TypeScript check, seed dry-run, and a production DB row query.

## Plan review rounds

1. Complete: source of truth and runtime data path identified.
2. Complete: confirmed the seed is explicit, not automatic deployment behavior.
3. Complete: isolated one source file plus one focused regression test.
4. Complete: avoided unverified provider-only defaults that could break generation.
5. Complete: included production upsert verification and non-destructive rollback (disable row).
6. Clean: no material scope, security, or tenant-boundary gap remains.
7. Clean: plan remains micro scope and implementation-ready.
