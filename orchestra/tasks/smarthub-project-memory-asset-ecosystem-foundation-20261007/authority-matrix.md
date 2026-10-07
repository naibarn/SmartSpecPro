# Authority Matrix

| Concern | Proposed authority | Existing evidence | Boundary |
|---|---|---|---|
| Global project identity and app/domain bindings | SPEC-302 | No global Project table/service found; domain tables in `apps/web/drizzle/schema.ts` | Additive federation layer; no domain table replacement |
| Living project intelligence/evolution | SPEC-233 | `specs/feature/233-.../spec.md` | Not global identity, ACL, or lifecycle SoT |
| Knowledge/evidence semantics | SPEC-266 | `specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/spec.md` | Additive R1.3 erratum maps Portable Mini App Knowledge runtime to SPEC-281; preserve R1.2 historical references |
| Work/collaboration projection | SPEC-292 | `specs/feature/292-.../spec.md` | Consume canonical project identity; retain collaboration semantics |
| Project evidence/artifact continuity | SPEC-284 | `specs/feature/284-.../spec.md` | Query resolved identity and enforce tenant/project ACL; no identity selection by vector score |
| Memory scope/authority | SPEC-268 (source recovery pending) | User request plus existing Chat/memory code; R2.5 candidate missing | No new authority can be declared recovered until source is supplied |
| Shared specialist/assistant runtime | SPEC-269 candidate | Two identical R3.17 attachment files | Preserve source revision and add explicitly versioned contract only |
| UI conformance/governance | SPEC-287 | `specs/feature/287-.../spec.md` | Add shared primitives as a consumer contract |
| Asset ownership, commercial rights, distribution | SPEC-303 | New contract | Must not absorb credit or settlement ledger |
| Capability commerce/revenue attribution | SPEC-280 | `specs/feature/280-.../spec.md`; `skillRevenueBilling` | Continues to own capability commerce policy |
| Credit lineage | SPEC-166 | `specs/feature/166-.../spec.md`; `creditService` | Extend dimensions additively; no ledger duplication |
| Wallet/economic/settlement infrastructure | SPEC-207 | `specs/feature/207-.../spec.md` | Remains settlement infrastructure authority |
| Existing credit debit/refund ledger | `credit_transactions` / `creditService` | `apps/web/drizzle/schema.ts`, service search | Existing transactional authority; no new ledger |
| Stable application identity/routing/context | SPEC-304 | New contract | App identity is independent of URL/slug/owner; integrate with 295 |
| Release/deployment/migration/health/rollback | SPEC-295 | `specs/feature/295-.../spec.md` | Deployment lifecycle remains 295; 304 supplies app identity and binding |
| Resource Fabric | SPEC-288 | `specs/feature/288-.../spec.md` | Runtime resource authority, not app identity |
| Portable package and knowledge | SPEC-261 / SPEC-281 | Current canonical Specs | Consume 304 identity and preserve portable-runtime boundaries |

## Number reservation

302–304 have no collision in fetched `origin/main` tree, reachable Git history inspected, or registered worktree inventory. External Library and unregistered import/archive sources were not accessible; mark reservations provisional until that surface is verified. Existing 299/300/301 remain occupied and must not be overwritten.
