# Cross-SPEC ownership and dependency matrix

Identity paths and baseline authority states are recorded in [G0](g0-snapshot.json). Each row below owns only its stated concern; consumers reference that owner instead of copying its state machine/schema. The shared C1–C10 contract in [amendment.md](amendment.md) is adopted through `REQ-<owner>-UWAC-01/02` in each owner's existing `spec.md`. No new SPEC number is allocated.

| Owner | Owns / reused contract | Consumes / dependency | Does not own | Amendment / work package |
|---|---|---|---|---|
| 196 | Goal/Plan meaning, outcome acceptance, semantic parent/child goals | 195 canonical jobs; 256 selection; 269 assistant delegation | Second job ledger / development-only routing | C1/C2, WP31/36 |
| 198 | Chat entry, explicit intent conversion, task tracking and evolution proposals | 196/269 work; 256 selection; 221 authoring; 277/294 projection | Another Chat execution engine or Skill publisher | C1/C3/C5, WP33/34/35 |
| 200 | Provider-independent external-task/adapter contract | 195 jobs; 205 Runner; 206 negotiation; 279 commands | Full parity for unobserved provider operations | C2/C3/C4, WP32/36 |
| 205 | Runner capability/session transport, replay/control delivery | 197 placement; 200 task; 278 durable session recovery; 279 policy | Canonical work outcome or provider entitlement | C2/C3/C4, WP32/36 |
| 206 | Negotiated A2A versus native capability mapping | 199 MCP; 200/205 adapters; 279 command policy | A2A availability from MCP presence or subscription | C2/C3/C4, WP32/36 |
| 218 | Development job/workspace/changeset and release-candidate contracts | 224 development; 293 source; 295 release; 221 Skills | General Work context or universal Git requirement | C1/C8, WP38 |
| 221 | Skill engineering, eval, immutable version/release/revoke | Existing Skill registry/Studio; 198 proposal; 256 selection; 195 jobs | Another discovery registry or tool authorization | C6/C7, WP35 |
| 224 | Existing development phases, continuation and scoped checkpoints | 218/293/295; workspace/integration authority; existing live grants | Every general task or parent Work lifecycle | C1/C8/C9/C10, WP38; live acceptance remains independent |
| 256 | Rebuildable tenant-filtered discovery projection/selection receipt | Existing catalog/registry; 196 intent; 221 release; 207 economics | Execution, publication or registry authority | C1/C6, WP34; documentary identity resolved in G0 |
| 269 | Assistant/team profiles, persistent Work and bounded delegation | 196 goal; 256 selection; 195 jobs; existing context/artifact owners | Chat backend, Skill publication, scheduler | C1/C2/C7, WP31/36/37 |
| 277 | Shared navigation, Task Control and Simple/Developer interactions | 294 evidence projection; 198 Chat; 287 rendering | Execution, billing or transition authority | C4/C5, WP33 |
| 279 | Agent command ingress/delegation into canonical domain mutation | 199 ingress; 220 auth; 207/280 economics; 195 jobs; domain owners | Second permission engine or mandatory route for every user UI read | C2/C3, WP36; user actions retain 226/220 |
| 287 | Versioned Design Contract and rendered conformance | 277 interaction; 240 surfaces; 226 action mapping; 220 authorization | Renderer, command protocol or UX state database | C5/C10, WP33/39 |
| 293 | Repository/workspace binding, source/ref freshness and ownership | Existing workspace_authority/canonical_source/integration-controller | Runtime success or an additional Git integration path | C1/C8, WP38 |
| 294 | Federated activity/evidence projection, truthful status/drilldown | All authoritative event owners, existing taskObservability read model | Scheduler, task database, stop engine or deployment authority | C2/C4/C5/C7/C10, WP32/37 |
| 295 | Build/release/deployment/runtime provenance and recovery | 293 authorized source; existing builders/promotion; 219/204 where applicable | Per-harness deploy lanes or fabricated remote/local parity | C8/C9/C10, WP38 |

Supporting contracts are consumed without expanding this amendment's ownership scope: 195 `worker_jobs`/events/outbox; 197 placement; 199 MCP; 204 approved Cloudflare isolation; 207/280 economics/billing; 220 permissions; 226 client action mapping; 229/230 retrieval; 248 optional Skill distribution; 266/268/292 context/memory; existing Library/R2/domain artifact and external-service authorities. These supporting specs are not declared complete or activated by reference.

## Contract handoffs

| Producer → consumer | Minimum boundary | Compatibility / rejection |
|---|---|---|
| Chat → work/goal owner | Authenticated context + explicit intent + outcome criteria + canonical admission receipt | Client tenant/project/app fields never grant scope; retry returns same canonical operation |
| Discovery → invoke/author | Skill/capability owner + immutable version/digest + capability/source freshness + selection receipt | Revalidate current grants/budget; reject revoked/retired/unknown offers; no implicit install |
| Parent → child | Parent/context IDs + objective/return refs + attenuated scope/budget + depth/dependency bindings | Existing job correlation; reject cycles, tenant escalation, budget multiplication and stale return destination |
| Source events → observation | Stable source/native IDs, generations/cursors, event+observed time, work/session bindings and evidence refs | Versioned upcast, dedup/replay and bounded projection; gaps/unsupported mapping remain explicit |
| Observation → Chat/Task/Mission | Scope + token/version + as-of + per-source watermarks + typed outcomes/blockers | Token is not an ACL; revoked scope rejects read; expired snapshot is explicit; mutable fields are labelled |
| Development → Git integration | Immutable checkpoint SHA + owner/lease + base/ref generation + check refs | Existing integration controller serializes merge-critical work only; stale admission rechecked |
| Authorized source → builder → release | Exact admitted SHA + ancestors + build provenance + digest + promotion/runtime receipts | Same semantics for local and Actions; mutable-only ref, mismatched digest or absent runtime proof cannot pass |

## Parallel implementation boundaries

WP31 and WP32 first agree metadata/event compatibility using existing types; no duplicate migrations or schemas. Then WP33 (UI), WP34 (invoke), WP35 (authoring) and WP37 (artifact adapters) use separately owned paths. WP36 changes delegation/command paths only after their contracts stabilize. WP38 owns development/Git/release consumer adapters and must coordinate shared contract edits with 31/32 rather than resetting active SPEC-224 work. WP39 performs cross-boundary acceptance. Actual workers receive explicit path ownership at dispatch time; section plans are not runtime authority grants.
