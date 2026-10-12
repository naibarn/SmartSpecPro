# Routing Decision

Select the smallest execution path that produces a working result. A route is a choice of tools, **not a new acceptance gate**.

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
