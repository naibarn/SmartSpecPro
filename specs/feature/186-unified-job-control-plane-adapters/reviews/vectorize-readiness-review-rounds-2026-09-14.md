# Vectorize migration readiness convergence review

Date: 2026-09-14

Scope: Cloudflare Vectorize preparation, full application vector-source
inventory, tenant/privacy boundaries, indexing/deletion paths, and evidence
gates. This is local implementation evidence. It is not a target-account or
production cutover approval.

## Final disposition

`LOCAL_CONTRACT_READY / TARGET_ACCOUNT_PROOF_PENDING / FULL_SYSTEM_CUTOVER_BLOCKED`

The local Node, Python, and Cloudflare contracts are implemented and the
focused regression suites pass. The system must not claim that all vector
stores have migrated: the inventory now contains thirteen named source
families, of which four have a Vectorize contract path and nine remain pending
their own migration or an explicit approved legacy disposition.

## Ten-round convergence ledger

| Round | Review surface | Result and closure |
|---:|---|---|
| 01 | Vectorize API contract and limits | PASS — v2 paths, NDJSON writes, bounded IDs/metadata/filters/batches/top-k, and exact 768-dimensional finite vectors are enforced in Node and Python. |
| 02 | Embedding and credential parity | FIXED — Workers AI uses `@cf/baai/bge-base-en-v1.5` at 768 dimensions; Vectorize and Workers AI credentials are separate; Python injected embeddings are validated before any write. |
| 03 | Deterministic identity and rebuild | FIXED — safe deterministic IDs, `sourceId` recovery metadata, upsert-before-stale-delete, and resumable source/checkpoint policy are recorded. Legacy IDs are not exposed as canonical domain IDs. |
| 04 | Tenant isolation and destructive operations | FIXED — Vectorize deletes use get-before-delete ownership/item correlation; missing or ambiguous records fail closed; Google Drive and OneDrive cleanup no longer fall back to Chroma when Vectorize is active. |
| 05 | Read-path and metadata filtering | PASS — approved library/docs/images/drama paths apply tenant filters and bounded metadata; malformed or cross-tenant provider matches are rejected. Generic read-path parity remains an external/source-specific gate. |
| 06 | Mutation evidence and ambiguous recovery | FIXED — successful upsert/delete operations require provider `mutationId` evidence; 429/5xx/transport failures retry within bounds, while unresolved mutation ambiguity remains operator-review work. |
| 07 | Domain lifecycle and privacy cleanup | FIXED — library, Google Drive, and OneDrive cleanup preserve the authoritative-row/Vectorize ordering and use the active provider policy. Multimodal, episodic, social, agency, and generic stores remain explicitly pending rather than being silently treated as migrated. |
| 08 | Complete source inventory | FIXED — static inventory review found and registered thirteen source families: four approved Vectorize families, conversation chunks, scoped memories, two agency stores, episodic collections, social archive, generic vector documents, multimodal memory vectors, and Kilo memory. |
| 09 | Cloudflare runtime and target evidence gates | FIXED — binding-injected Workers seams, Hyperdrive boundary, at-least-once consumer, local readiness, exact four-index allowlist, exact thirteen-source evidence shape, file-presence requirement, and non-placeholder legacy approval references are enforced; activation remains disabled. |
| 10 | Integrated proof and final gap scan | PASS WITH BLOCKERS — Node 47/47, Python 43/43, Cloudflare 13/13, local readiness, Feature 186 verifier, call-site audit, Python compile, and diff checks pass. Target probes, live recovery, legacy-source decisions, and PITR evidence remain unproven and block cutover. |

## Source inventory closure

The authoritative local inventory is
`ops/feature-187/vectorize-readiness-manifest.yaml`. It is enforced by
`apps/web/scripts/verify-cloudflare-target-readiness.ts` and the target
evidence schema requires exactly thirteen source entries. A target evidence
bundle may mark a source as `migrated_to_vectorize` only with embedding parity,
read-path parity, privacy-deletion, and rebuild-checkpoint evidence. A legacy
source requires a non-empty, externally auditable approval reference; local
placeholder references do not constitute approval.

## Evidence executed

- Web Vectorize/provider/indexing/search/embedding/target-readiness tests:
  `6 files, 47 tests passed`.
- Python Vectorize store, library indexing, Google Drive, and scoped RAG tests:
  `43 passed`.
- Cloudflare runtime package tests: `13 passed`.
- Target-evidence JSON Schema parses successfully and rejects placeholder
  legacy approval references consistently with the executable verifier.
- `verify:cloudflare-local-readiness`: `localContractReady=true`,
  `productionProof=false`, `targetAccountProof=false`.
- `verify:cloudflare-target-readiness -- --mode local`: local mode remains
  green while listing all target gates as unproven.
- `audit:feature-186-call-sites`: zero direct BullMQ/Celery producers,
  forty-seven adapter-owned submissions, three explicit legacy transport calls,
  and seven centralized rollback-only compatibility status readers.
- `verify:feature-186`: correctly reports production readiness false.
- Python `compileall` for the changed Vectorize and cleanup modules: passed.
- `git diff --check`: passed.

## Remaining non-local gates

These cannot be closed by adding mocks or local evidence files:

1. Probe all four target indexes in the approved Cloudflare account, including
   dimensions, cosine metric, metadata indexes, binding, write/query/get/delete,
   tenant-negative tests, and index-level limits.
2. Prove Hyperdrive origin reachability, cache safety for control-plane reads,
   TLS/ACL, pool capacity, transaction duration, and regional latency budgets.
3. Run real rebuilds with source checkpoints, stale-vector reconciliation, and
   rollback/old-index retention evidence.
4. Run provider 429/5xx/lost-response/ambiguous-mutation recovery against the
   target account and prove no duplicate paid/provider/artifact side effect.
5. Migrate or externally approve the nine remaining source families, then
   prove each source's embedding model/dimension, tenant-filtered read path,
   privacy deletion, and checkpoint recovery.
6. Complete deployment restart/rollback, backup/PITR restore replay, and
   production incident/recovery evidence before enabling traffic.

No target credentials, account identifiers, live bindings, or production
activation flags were added to the repository.
