# SPEC-286 Retrieval and Rights Authority Audit — 2026-10-08

## Canonical source and handoff

- Initial audited source: `origin/main` SHA `aaca5264ab366c556d9a24c6c11fa4a299a596ea`. Before PR preparation, refreshed canonical source through `7d3791488afaa6b7381c670302ce895782c5cc8b` and `c32a13652a04999646f8dc28f0b827c008a4320d`; deltas were unrelated public-homepage polish and its SPEC-263 evidence/handoff. This task worktree is reconciled to the latest tip before promotion.
- Normative identity: `specs/feature/286-agentic-video-production-creative-quality-runtime/spec.md`, revision 1.7, current digest recorded in the handoff manifest.
- Registry: `specs/_config/spec-id-registry.json` has no SPEC-286 canonical owner binding; the canonical inventory identifies the path by discovery but does not settle authority. Keep authority `UNRESOLVED` and disposition `DORMANT_UNRESOLVED` pending explicit identity reconciliation.
- Handoff was reconciled through `python3 -m tools.spec_handoff reconcile --spec-dir ... --write`, then updated only through the shared writer; generated `STATUS.md` is never edited directly. All 756 ledger entries remain unresolved; no unproven PASS is recorded.
- `python3 -m tools.spec_handoff classifications --check` reports existing global classification drift for SPEC-208 and SPEC-286. Do not regenerate the global artifact as part of this scoped change.

## Retrieval dependency evidence

- `specs/feature/229-Unified RAG Retrieval Intelligence, Cloudflare AI Search & Vectorize/spec.md` §1 and §P229.1 explicitly report that the canonical `RetrievalBroker` / `SAH-RETRIEVAL-2` runtime, Cloudflare AI Search provider, and unified consumer migration were not found. Direct Vectorize utilities in `apps/web/server/services/vectorize-search.ts` do not establish that Broker authority or a recipe index.
- No direct Broker caller is added. This change adds a pure optional vector-candidate fusion seam in the existing Prompt Recipe Library and retains deterministic local retrieval as fallback. Unit tests supply mock candidates; live vector integration remains BLOCKED pending the canonical Broker and approved indexing contract.

## Rights authority evidence

- Existing source rights checking is only an injected importer callback in `apps/web/server/services/promptRecipeLibrary.ts`; there is no catalog-specific live authority binding for the linked creator prompts.
- Existing rights paths found in source are scoped to other products/data and do not authorize this creator catalog. They are not reused as a substitute.
- Full prompt output now requires a tenant/user/purpose-scoped positive decision, evidence reference, check timestamp no older than 60 seconds, and future expiry on each retrieval. Missing, stale, denied, unknown, revoked, expired, and failed checks return no prompt. Metadata-only public attribution discovery omits prompt, media, and executable source.
- Until an actual catalog Rights Authority is bound, import approval remains unavailable to production callers; mock grants are unit evidence only.

## Bounded change and evidence classes

- Existing importer, Motion Template Registry routing, project/candidate authority, and no-code-execution boundary are preserved. No database, queue, vector database, Registry, executor, or timeline is added.
- Unit evidence: focused Vitest fixture/mock suite; 18 tests passed in 10 consecutive rounds after final fixes.
- Integration evidence: none against a live Retrieval Broker or Rights Authority. The current tests only exercise mock boundaries.
- Runtime evidence: none. Windows Runner remains externally blocked, Linux remains unverified, generated motion remains non-executable, and WP0.4 remains PARTIAL/BLOCKED pending real Golden Render A/B/C receipts.
