# Decisions

| ID | Decision | Evidence | Status |
|---|---|---|---|
| D-01 | Use fetched `origin/main` at `1f65499e1ed9f111ea8a5803a706ef2aba66f3ef` as baseline; audit ZIP is stale by four commits. | Git refs; ZIP handoff source SHA | Accepted |
| D-02 | Work in an isolated worktree; preserve all dirty primary and side worktrees. | `git worktree list`; per-worktree porcelain status | Accepted |
| D-03 | Model global Project identity additively and bind existing domain projects; do not big-bang migrate or elevate Spec 233. | `apps/web/drizzle/schema.ts`; Specs 233/292/284; audit matrix | Accepted |
| D-04 | Do not claim SPEC-268 R2.6 recovery until the exact R2.5 candidate is available and provenance can be recorded. | No candidate in attached audit ZIP, repo, or filename inventory | Open dependency |
| D-05 | Treat the two SPEC-269 R3.17 attachments as one byte-identical candidate; retain the R3.17 source and append a separately labeled additive amendment only if canonicalization is permitted by handoff validation. | SHA-256 `f22593c292daa2390cc8875675d9de182d1826e6873080f9707abf177bcdf1d4` | Accepted for recovery candidate |
| D-06 | Keep wallet/credit/debit/refund, capability revenue, and settlement authorities in Specs 166/207/280 and existing services; Spec 303 only defines asset identity/rights/distribution. | `creditService`, `skillRevenueBilling`, Specs 166/207/280 | Accepted |
| D-07 | Reserve 302/303/304 provisionally only within the fetched repository evidence; no global Library uniqueness claim is possible without an accessible external source. | No repo/history collision; external connector unavailable | Provisional |
| D-08 | Do not edit Spec 263/270 while its separate worktree has active dirty changes. | Dirty worktree `6c548c19b8963f5725db74210b94e43e60d874c6-build` | Accepted |
