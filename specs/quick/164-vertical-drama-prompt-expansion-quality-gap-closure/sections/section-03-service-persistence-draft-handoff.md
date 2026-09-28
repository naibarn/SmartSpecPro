# Section 03: Service, Persistence, and Draft Handoff

## Objective

Make preview/apply durable and conflict-safe, then pass the approved treatment
to Draft exactly once while retaining original and generated lineage.

## Owned paths

- `apps/web/server/services/verticalDramaPromptExpansionService.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/drizzle/schema.ts` and a new migration only if an indexed/relational
  field is truly required
- relevant Draft boundary code in `verticalDramaStoryBible.ts`

## Implementation contract

Preview saves the v2 contract, successful real-run evidence, diagnostics, source
hash, skill/model/provider provenance, and run ID under tenant/user ownership.
Failed preflight/provider/parse/quality calls may save only sanitized failed
status and error code; they never save fallback expansion text. Idempotency is keyed by
tenant/user/key and must include source hash/profile compatibility. Enforce the
key at the database/index boundary when possible; if two requests race, handle
the unique-conflict reread and verify hash/profile before returning the existing
run. Define legal transitions for preview/failed/applied/cancelled/stale. Legacy JSON is
read through an adapter.

Apply requires owner, tenant, run ID, current preview status, expected revision,
source hash, and approved-payload hash. Use one compare-and-swap update. Same
approved payload may be idempotent; a different payload or concurrent edit is a
conflict. Never leak whether another tenant's run exists.

Retain original prompt/hash and approved treatment separately. Add an optional
`promptExpansionContext` at the existing Draft input boundary. The merge order
is creator fact, user edit, model inference; open questions and assumptions stay
labelled. Draft may organize the treatment into its existing series outputs but
must not silently contradict approved facts. A stale/missing/cross-owner run
blocks the handoff or requires re-preview. Existing users without a treatment
continue through the current premise path.

No new Draft route, Draft table, provider, or automatic second architecture
pipeline is allowed.

## TDD stubs

Test tenant/user/idempotency ownership, legal transitions, migration-unavailable
error, legacy adapter, exact apply success, stale hash/revision, concurrent
CAS, same-approved-hash idempotency, wrong-owner isolation, Draft lineage,
single merge, stale/missing treatment rejection, and no-expansion backward
compatibility.

## Completion gate

An integration fixture must show: original prompt → approved real-LLM treatment → one
Draft context merge with run/hash lineage, while a changed prompt or wrong owner
cannot apply or generate from stale data. A real-provider smoke run must show
provider/model/request evidence; a fixture-only result is insufficient.
