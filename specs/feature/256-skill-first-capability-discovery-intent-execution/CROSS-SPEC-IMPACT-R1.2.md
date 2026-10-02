# Spec 256 R1.2 — Cross-spec implementation impact and non-ownership

**This is an additive proposed map, not authorization to rewrite any frozen source.** Resolve each seam against actual current repository APIs at G0 before assigning implementation.

| Existing owner | R1.2 consumes or proposes | Forbidden overlap |
|---|---|---|
| Feature 196 shared Chat/Capability Registry | Read-only filtered projection; strict public card and trusted intent ceiling; map to existing invoke | No new global registry, Chat or planner execution authority |
| Specs 225/226 Task Control | Existing goal/job/approval cards carry checkpoint/receipt refs and mobile review | No separate Film Chat or new Task ledger |
| Spec 221 Skill Registry | Reviewed content-bound release IDs and activation status | No second publisher, automatic remote Skill activation or code installer |
| Spec 229 Retrieval Broker/Vectorize | Advisory metadata search with post-filter source checks and policy epochs | No index-based permission or globally searchable private Skill text |
| Spec 248 MCP Skills extension | Real `skills/list`, `skills/get`, individual `resources/read` via existing gateway | `capability-public-result` is *not* MCP wire or a Skill activation command |
| Spec 253 cross-product adapters | Canonical ProductActionManifestV1 and ProductCommandEnvelopeV1; currently authorized handoff | No direct edits to another product's data or second command bus |
| Spec 254 Film adaptive execution | Film task and qualified backend offer; actual local/cloud eligibility | No new GPU scheduler or Film-only physical job subsystem |
| Spec 255 semantic media graph | Optional typed media pass/lineage reference when feature flag ON | No duplicate semantic graph or workflow invalidation authority |
| Specs 209/215 logical workflow | Explicit opt-in saved plans and authoritative dependency/invalidation checks | No silent persistence, no new DAG scheduler in Skill-first resolver |
| Feature 195 / Spec 186 physical jobs | Existing canonical job/attempt/lease and unknown paid reconciliation | No independent `film_jobs` or assistant-controlled async queue |
| Specs 207/220/227 credits, rights, publication | Existing quote/reservation/approval/current policy receipts | No inferred Skill grants, no auto publish or double settlement |
| Specs 197/231/242/243 and installed Runner | Backend offers and current qualification/placement | No unqualified ComfyUI node installing or assumed cloud GPU |
| Specs 240/241 UI/context | Safe typed UI and authorized target selection | Page hints are not access grants; no untrusted script UI |
| Specs 252/251 Film/Creator domain | Per-shot/per-asset pass IDs and canonical domain revisions | No replacement of Film/Creator edit truth or locked timeline |

G0 output SHALL mark every proposed R1.2 schema field `EXISTING_EXACT`, `ADAPTER_REQUIRED`, `OWNER_EXTENSION_REQUIRED` or `DUPLICATE_REMOVE`. Block any persistent/schema change requiring unavailable owner approval. New feature flags `public_projection_v2`, `delegation_envelope_v1` and `step_review_v1` remain OFF until staged safety gates complete.
