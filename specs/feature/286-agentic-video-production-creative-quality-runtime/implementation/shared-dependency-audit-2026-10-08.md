# SPEC-286 Shared Dependency and Studio Discovery Audit — 2026-10-08

## Scope and source

- Audited isolated worktree `codex/spec286-shared-dependency-20261008` at canonical `origin/main` SHA `048caf5d7ac1d5544b062c6624a60c0414fd10f7`.
- The primary checkout remains untouched; Runner worktrees and branches were not opened for writes.
- Normative identity remains `specs/feature/286-agentic-video-production-creative-quality-runtime/spec.md` (R1.7). The config registry (`specs/_config/spec-id-registry.json`) has no canonical owner binding for ID 286. Generated inventory/classification artifacts report the path but do not establish ownership. Preserve `authority=UNRESOLVED` and `disposition=DORMANT_UNRESOLVED`; do not mutate generated classification output.
- `python3 -m tools.spec_handoff classifications --check` reports global classification/evidence drift for canonical SPEC-208 and SPEC-286. This scoped task does not regenerate global status artifacts or infer an authority decision from the drift.

## Shared retrieval audit — shared owner is SPEC-229

| Surface | Source evidence | Finding |
|---|---|---|
| Retrieval contract / Broker | SPEC-229 `spec.md` §0.1 and §16 (`SAH-RETRIEVAL-2`); source search under `apps/web` and `python-backend` | SPEC-229 owns the cross-spec contract, but no canonical runtime `RetrievalBroker` or recipe consumer exists. The rollout-bundle string is contract metadata, not a Broker call. |
| Vectorize | `apps/web/server/services/vectorize.ts`, `vectorizeContract.ts`, `vectorize-search.ts` | Existing direct provider helpers and tenant namespace/filtering exist. Current embedding is English-only `@cf/baai/bge-base-en-v1.5`, 768 dimensions; it is not the multilingual target described by SPEC-229. |
| Index registry | `apps/web/drizzle/0329_feature_194_vector_index_registry.sql` | A prior vector-index registry table migration exists. No recipe index registration/authority or usable Broker contract is established by its existence. No migration is requested or added. |
| ACL / tenancy | `vectorizeContract.ts`, `vectorize-search.ts`, `vectorize-indexing.ts` | Direct Vectorize helper paths scope namespace and metadata by tenant. They do not prove canonical cross-source visibility/ACL resolution required by `SAH-RETRIEVAL-2`. |
| Consumers | `libraryService.ts`, `vectorize-search.ts`, public knowledge/RAG surfaces and Python hybrid-RAG identified in SPEC-229 §0.1 | Existing retrieval paths remain fragmented; no unified migration to the Broker was found. Do not add a recipe-specific Vectorize path. |

Shared hybrid retrieval, multilingual embedding/index policy, tenant ACL resolution, registry integration, ranking and consumer migration remain owned by SPEC-229. SPEC-286 may consume only the future approved Broker and recipe index contract; its current local deterministic fallback and mock candidate seam remain bounded fallback/test seams.

## Rights and recipe visibility boundary

- `apps/web/server/services/promptRecipeLibrary.ts` retains an injected rights callback and fresh per-use rights recheck. No live source-catalog-specific Rights Authority binding was found.
- Marketplace auto-review rights envelopes and other domain rights records govern their own assets/workflows. They are not grants for third-party creator prompts and must not be adapted as if they were.
- First-party recipes may be surfaced as reusable full-text only when their ownership/provenance is established by an existing platform authority and policy decision. This audit found no bound recipe-specific first-party authority; no implicit “internal means approved” rule is added.
- External references remain metadata-only (attribution/link/category/tags). No external prompt text, media, or executable code may be indexed, returned to a model, copied, or reused until the existing Rights Authority supplies a current positive decision for the intended tenant/user/purpose. Revocation, expiry, unknown, stale, or authority outage must fail closed.
- No new Rights Authority, policy store, registry, database, or migration is introduced.

## Video Studio discovery readiness

- `apps/web/server/routers/videoProjects.ts` already provides authenticated project procedures, tenant-scoped project repository access, master Video Intelligence feature flag checks, and per-studio `videoIntelligenceMotionStudioEnabled` gating for Motion project creation.
- `apps/web/server/services/videoProjectRepo.ts` and `videoProjects.ts` preserve project revision checks for document writes; the client passes the current project revision to revision-sensitive actions.
- Existing route/UI does not expose Prompt Recipe discovery. There is no recipe-specific feature flag and no discovery procedure that binds a query to a tenant-owned project and its current revision. The current rights and Broker dependencies are also unavailable.
- Therefore read-only Studio discovery is **BLOCKED** at this checkpoint. Do not expose a route or UI path until the canonical Broker/index, Rights Authority, project-ownership/revision binding, and an authorized feature-flag decision are all present. No project document or motion candidate is modified by this audit.

## Scope outcome

- No application runtime change was safe: every candidate integration would cross the unavailable SPEC-229 Broker and/or catalog Rights Authority boundary, and the Studio discovery gate is incomplete.
- Existing Recipe Library implementation and tests are preserved. No generated motion source is executed. No Runner, Remotion Executor, Sandbox, queue, timeline, production setting, or database migration is changed.
- `completion_eligible` remains false. WP0.4 remains PARTIAL/BLOCKED pending real Golden Render A/B/C receipts from the authorized Windows Runner; Linux readiness remains separately unverified.

## Verification classes and QA rounds

This checkpoint is an audit/handoff documentation change, not a runtime implementation. The ten rounds below are bounded source/spec/handoff checks; they do not claim application integration or runtime PASS.

| Round | Check | Result |
|---|---|---|
| 1 | Worktree is isolated and clean at audited base SHA | PASS |
| 2 | Registry config has no SPEC-286 canonical owner binding | PASS; unresolved retained |
| 3 | Classification check reproduces SPEC-208/286 drift | PASS; generated artifacts untouched |
| 4 | SPEC-229 contract owner and §0.1 current-state claims inspected | PASS |
| 5 | RetrievalBroker call-site search across web/Python source | PASS; no runtime found |
| 6 | Vectorize embedder, dimensions, tenant namespace and filters inspected | PASS; existing direct helpers, non-multilingual target |
| 7 | Existing index-registry migration inspected | PASS; no recipe authority inferred |
| 8 | Recipe service rights callback, freshness/revocation behavior and metadata-only path inspected | PASS; live authority remains absent |
| 9 | Studio route, tenant checks, Motion feature flag and revision flow inspected | PASS; Recipe Discovery route/gate absent |
| 10 | `git diff --check`; 10 consecutive `spec_handoff validate` rounds; global classification check | PASS for patch and handoff (10/10 valid, zero validation errors, `completion_eligible=false`); classification check reproduces existing SPEC-208/286 drift, which remains unmodified |

Unit evidence: existing Recipe Library fixture/mock tests are preserved; no behavior was changed in this checkpoint. Ten QA rounds are audit/handoff checks, not application unit tests. Integration evidence: none against Broker, Rights Authority, or a live Studio route. Runtime evidence: none. Mock/unit evidence is not integration/runtime PASS.
