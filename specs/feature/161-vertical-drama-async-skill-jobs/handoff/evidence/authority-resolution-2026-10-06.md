# SPEC-161 Authority Resolution

## Decision

Disposition **C — `RECONSTRUCT_CANONICAL_FROM_EVIDENCE`**. SPEC-161 is an independent, active canonical feature Spec. This decision restores its missing normative document from the strongest surviving approved source; it does not claim that a normative `spec.md` historically existed.

## Source and provenance

- Approved source: `docs/portable-skill-pack/specs/2026-08-25-vertical-drama-async-skill-jobs-design.md`
- Source SHA-256: `3ab5930dc85d84d02b8de32f3e17d69ce09993241c99d5474fb25754a07532ce`
- Reconstructed canonical `spec.md` SHA-256: `b3a3049809ebb3970a608e1e3b543f62cc687896c2c16825f0cb5ead25766c5f`.
- Source introduction: commit `13a313d474df163d6741ccf10e50df8aac2e30f0` (`2026-08-30`, `chore: reconcile accumulated repository changes`). The source says “Approved design; implementation pending” and contains the goals, non-negotiable job/billing/security contracts, queue architecture, client behavior, completion validation, acceptance criteria, and tests.
- `claude-spec.md` SHA-256: `11334444419c7a0ebb419dc62d44f9224b9ff9e1a0497cc1b6fb99fd56aaff43`. It labels itself “Synthesized specification” and points directly to the approved design. At seven lines it is a summary, not the complete contract, so disposition B is not used.
- Git history across available refs contains no `specs/feature/161-vertical-drama-async-skill-jobs/spec.md`; the design and planning bundle first appear together in the import/reconciliation commit above. No renumber, alias, successor, or supersession evidence was found. Existing `claude-spec.md`, plans, sections, reviews, and the approved design are preserved.
- Runtime corroboration (not an implementation-completion claim): `apps/web/server/services/verticalDramaInteractiveJobs.ts`, `apps/web/server/services/verticalDramaStoryJobs.ts`, and `apps/web/server/__tests__/verticalDramaInteractiveJobsWiring.test.ts` contain durable interactive/story job paths and wiring evidence.

The reconstructed `spec.md` uses the approved design's semantic content without adding requirements. Only trailing Markdown whitespace was normalized in the canonical copy so the new file passes repository whitespace checks; the approved portable source remains byte-for-byte unchanged. Its opening provenance note identifies the source, digest, introducing commit, and reconstructed status.

## Downstream reference classification

| Spec | Reference | Meaning | Repair |
|---|---|---|---|
| 166 | `spec.md:13-15` | Related architectural/billing context; weaker than a normative dependency | None; canonical target now exists |
| 168 | `spec.md:6` | Explicit normative dependency for async skill jobs | None; canonical target now exists |
| 173 | `spec.md:11-15` | Explicit normative dependency for async skill jobs | None; canonical target now exists |
| 175 | `spec.md:11` | Explicit normative dependency for async skill jobs | None; canonical target now exists |
| 176 | `spec.md:7,105,130,215` | Builds on and reuses durable job/cost infrastructure | None; canonical target now exists |
| 185 | `spec.md:70` | Reuses the durable status/idempotency/model/billing pattern | None; canonical target now exists |

All six references were semantically reviewed. They refer to the async job contract or its concrete durable job/billing pattern, not to a superseded ID or historical implementation. Their text remains accurate; no blind reference replacement was made. No outgoing dependency or supersession claim from 161 was evidenced by the source or its bundle.

## Integrity effect

The existing dynamic inventory record changes from one `MALFORMED_CANDIDATE` / `UNRESOLVED_AUTHORITY` to one `CANONICAL_SPEC` / `CANONICAL_ACTIVE`. Inventory record count remains unchanged; canonical Spec count increases by one because the configured feature-root record is now backed by `spec.md`. The six inbound links are now resolvable. No alias or successor entry is added. Runtime implementation completeness and acceptance remain outside this authority-resolution decision and are not asserted here.
