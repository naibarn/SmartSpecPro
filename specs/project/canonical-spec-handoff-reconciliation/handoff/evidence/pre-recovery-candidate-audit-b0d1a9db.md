# Pre-recovery candidate observation and framework follow-up

- Observation type: read-only candidate preflight; not a canonical inventory/reconciliation result.
- Framework revision: `b0d1a9dbfaa81edfe433ab6ef14239d65615a471` on `refs/heads/main`.
- Integrated at: `2026-10-06T02:42:07Z` (PR #54).
- Framework verification on that exact SHA: 69 Handoff tests passed.
- Current migration state remains `WAITING_POST_RECOVERY_SPEC_UPLOAD`.

## Framework follow-up

A generic inventory parser fix reads a top-level YAML `title` when a Spec heading is beyond the bounded heading scan. A generic regression test covers this input shape. The read-only parser check now extracts the title and numeric revision from the prepared Spec 286 frontmatter; no candidate Spec was modified or uploaded.

## Candidate files observed in the primary checkout

The primary checkout contains 12 untracked candidate Spec directories with `spec.md`: 271, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, and 286. These remain outside canonical `origin/main`. The primary checkout does not contain `specs/_config/handoff-roots.toml`, so the canonical inventory CLI cannot validate that checkout directly. Full validation remains pending until the set is uploaded into a configured canonical checkout.

Observed identity overlaps requiring evidence-led authority resolution after upload:

- Candidate `specs/feature/278-durable-runner-execution-sessions-recovery-fabric-r1-4/spec.md` has the same path/ID as the current canonical path but a different digest (`e8c4e7cb…` candidate; `8973e026…` current).
- Candidate `specs/feature/282-adaptive-work-context-organizational-collaboration-federated-exchange-r1-0/spec.md` shares ID `282` with current canonical path `specs/feature/282-smartaihub-continuous-canonicalization-durable-work-convergence-r1-0` (candidate digest `5c82aa08…`; current digest `e22d6134…`).

These are observations, not winner selections or final per-Spec classifications. Resolve through explicit supersession, history, architecture, code, and decision evidence; do not prefer by revision/date/path alone.

## Resume boundary

Resume predicate remains: `Recovered/canonical Spec set has been uploaded, validated, and integrated into canonical ref`.

After that predicate is true, refresh dynamic inventory, validate all handoffs, regenerate global views, rerun inventory-dependent scenarios 8, 9, 10, 11, 19, and 20, then begin bulk reconciliation. Do not regenerate or close inventory-derived outputs before recovery.
