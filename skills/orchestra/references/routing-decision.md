# Routing Decision

Select the smallest execution path that produces a working result. A route is a choice of tools, **not a new acceptance gate**.

## SPEC-ID resolution (all SPECs)

For any request keyed by a SPEC-ID, first identify the configured canonical ref
and resolve the ID from its canonical Spec index/registry. Follow registry
aliases, dispositions, and conflicts; never infer authority from a matching
folder name or copied task prose. The resolved canonical `spec.md` defines scope.
Read its existing `handoff/manifest.json`, requirement ledger, history and
generated status as applicable, plus relevant planning and implementation
artifacts and current Git/PR reality. Then choose among existing Deep Plan, Deep
Implement, resume, or debug routes from evidence:

- No adequate plan yet → `deep-plan` (or the established quick-plan route when
  the canonical requirement is bounded and implementation-ready).
- Plan exists and requirements remain unimplemented → `deep-implement` from the
  first actually incomplete requirement/section.
- Existing in-flight state → reconcile artifacts and commits, then resume the
  earliest incomplete step without repeating integrated work.
- Current defect/failure → data-first debug, retaining the canonical SPEC as the
  scope boundary.

User-provided descriptions are intent/context only; they cannot replace or
expand canonical SPEC identity. If the ID cannot be resolved authoritatively,
stop changes to SPEC files and refresh/repair the existing registry evidence.
Continue autonomously through functional output, normal protected integration,
and an auditable update to the existing Spec HandOff. A commit, merge receipt,
generated status refresh, or documentation-only change does not itself satisfy
functional requirements or constitute completion. For an actual documentation
requirement, verify the requested document directly and record its evidence in
the existing HandOff; never chase repeated receipt-only commits.

| Situation | Route |
|---|---|
| Simple bug or cosmetic UI edit | Direct code edit, focused check, integrate, preview |
| Clear medium-sized feature | Direct execution or owned independent parallel slices when useful |
| Explicit SPEC planning | `deep-plan` then `deep-implement` |
| Large concrete product requirement | `deep-project` only if decomposition is genuinely necessary, then existing Deep skills |
| Unresolved product direction | Ask one material product question or use `brainstorming`; do not redo planning automatically |
| Specialized task with an installed skill | Run only the relevant specialist skill |
| Debug/recovery | Read error and current code, repair, retest and continue; preserve unrelated state |
| Actual auth/tenant/secrets/data-sensitive change | Targeted relevant security verification, not universal specialist dispatch |

Parallelism is beneficial only when file ownership and dependencies permit it. Do not require scout waves, task packet formats, multiple reviewer agents or a planning artifact for a clear single-scope job.

Deep workflows proceed automatically when the user requested end-to-end execution. Use the existing HandOff to resume unfinished sections and record real blockers; do not require a seven-stage convergence ledger, fixed loop counters, or repeated clean review rounds before code can merge.

Always honor actual protected-branch conditions, avoid force pushes and respect irreversible-action authority. Full UAT and production release remain separate from ordinary development integration.
