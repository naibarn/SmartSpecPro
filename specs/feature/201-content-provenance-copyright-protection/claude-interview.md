# Deep-plan Interview — Feature 201

The prior conversation supplied the required product decisions. No additional
domain question was necessary to start implementation.

## Q1 — Primary product surface

**Question:** Which access model should Content Protection use?

**Answer:** Use a top-level Content Protection workspace and Dashboard quick
links. Include protected assets, verification, cases, rights/evidence, and
settings in the workspace.

## Q2 — Supported media

**Question:** Should the ownership/evidence flow cover only video?

**Answer:** It must support images as well. Image verification must remain
modality-specific and image inputs used in a later video compound must not be
mistaken for final video protection.

## Q3 — User control

**Question:** Who controls whether a digital watermark is used?

**Answer:** The user can turn watermarking on or off per protect/export/compound
operation. A user default may exist, but an explicit per-operation choice wins.
The UI must show the effective choice and the exact stage at which watermarking
is created.

## Q4 — Ownership language

**Question:** What may the product claim from a verification result?

**Answer:** Technical match/provenance evidence is allowed; the product must not
claim that a watermark alone is conclusive legal ownership. Rights holder,
creation certificate, chain of title, and external reviewer evidence are
separate evidence surfaces.

## Auto-decisions

- Use existing React/Wouter/tRPC/Drizzle conventions.
- Use the canonical `worker_jobs` plus outbox for long-running protection and
  verification work.
- Use server-derived tenant/user scope for every query and mutation.
- Use Vitest, Rust tests, and focused Playwright evidence matching current repo
  conventions.
- Keep the initial default configurable instead of silently hardcoding ON or
  OFF. The per-operation user choice is authoritative.
- Treat unavailable or unverified providers as `UNPROTECTED`/`INCONCLUSIVE`,
  never as `Protected`.
