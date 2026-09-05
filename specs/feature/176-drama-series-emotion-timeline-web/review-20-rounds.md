# Feature 176 + 177 — 20-round specification review

Date: 2026-09-05. Scope: both specifications, not implementation or paid generation.

User direction: emotion understanding must be LLM-based and skill-first, never keyword/intent text classification. Explicit minimum 20 rounds overrides the skill's default smaller review limit.

Method: sequential focused reviews of the evolving pair; fix identified design gaps, check corresponding clauses, record exact post-review hashes. Assertions check document contracts, not model intelligence or acoustic quality. Rounds are not separate reviewer agents or runtime experiments. External evidence remains the dated research in spec 177; no new legal/provider claims are inferred from these checks.

Code inspected this turn: verticalDramaScriptGeneration.ts (skill loader and executeJsonPlanningCallWithRetry), verticalDramaStoryBible.ts (skill-owned critique), skillFiles.ts (manifest resolution), existing Drama skills. SocratiCode tools unavailable; shell fallback used.

## Round 01 — Mandatory skill-first semantic authority

MUST_FIX: generic prompting did not require a registered skill. Both specs now require LLM skill execution for semantics and restrict deterministic code to technical operations.

Verification: focused contract checks PASS (2 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `efc9dedad6b07f755f2e050d64dc1b53894a5f0d684dfaeaa7efabdc90e6310c`

177 SHA-256: `c66d99a6ae1b55c8546180e22ccf3e6a0dd823d22dbe6c2d62dbe31d6161af39`

## Round 02 — Concrete skill package and execution path

MUST_FIX: no skill owner/slug or loader path existed. Spec now identifies proposed skill modes, files and explicit binding using verified repository loader patterns; Worker consumes compiled skill output.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `b6140bf9ed0d5d6dfd9e21b603242a591e3e06c52cd3f0ea4b18d761f4e0249d`

177 SHA-256: `5d8302b103db4eb6f861f6bd4183afd74243fef116a8b68fbab31189c3646047`

## Round 03 — Skill failure, pinning and provenance

MUST_FIX: skill version/cache changes and missing references could bypass approval. Added immutable skill execution provenance and fail-closed rules; corrected section placement so the cross-spec §5.3 reference resolves.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `403ad214eca97ae0bd786f7e822ebca651a5b7f69be205b2fc3b9e0cc759277f`

177 SHA-256: `2759d40a095e1e20c460a8f24cde24a54a7f01a3d19292f36baa74586ed3e55e`

## Round 04 — Runtime semantic review and bounded repair

MUST_FIX: schema validity was treated as sufficient semantic review and retry ceilings were ambiguous. Added skill-based critique/revision with a shared call budget; documentation's 20 rounds are not 20 paid runtime calls.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `5c601180403b96beaba4489bc1928de6367fef80ef44cdb5d14cce0991c97259`

177 SHA-256: `f91e4cf99b3c2c146306e7b3534a728159fe3ac17908d2007fca0ba53a839b17`

## Round 05 — Emotion semantics, ambiguity and evidence

MUST_FIX: unconstrained labels could hide copied keyword classifications or overconfident emotion. Added nuanced LLM evidence requirements and contrastive acceptance cases, retaining manual authority.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `4e0d2e0b6bb43c95cfeffae12047d1def41a742c44c915ff839885f493162ee8`

177 SHA-256: `fff21e5576882fa8a058e2ea6ea11c73f2997ac02f03d5907af4c00bed71bd83`

## Round 06 — Long-context selection and spoiler boundaries

MUST_FIX: bounded context could silently omit decisive story information or leak future knowledge. Added explicit input coverage and skill-authored context handling; missing evidence cannot become high-confidence output.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `a7d9131e2448b31f5520a50debe629b6de8c289eeee7fddcf2e05e1c5abfab85`

177 SHA-256: `ed90ce42791958d904d52630b30667d64560d354f8dda56d7ecfa8cc4196f83c`

## Round 07 — Planning identity and source resolution

MUST_FIX: planning-key materialization and automatic source preference could detach approved plans. Added stable lineage mapping, explicit source-choice evidence and no cross-version fuzzy migration.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `e52815348e190395ccf9165fc6d102d3485b1c928bfd41a5e79e8e3e06964352`

177 SHA-256: `9271e292f626f512483d4d4e906dedf61789a2ee3a9a5f3b2dde35d7c3c3ff85`

## Round 08 — Time precision and ASR coverage

MUST_FIX: headline precision could be achieved by abstaining on most dialogue or confusing ASR alignment with observed words. Added coverage/error reporting and manual timestamp provenance in both specs.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `7af35023f916db7f57d721af3eb34113a887d1f8670f7e049b8a9d2a1f0c9ac1`

177 SHA-256: `2aaf7f58c27c96ca4563581e67e9bade3350a6c525f09e88a9037ba70a2c9d48`

## Round 09 — Creative grouping versus deterministic editing

MUST_FIX: the 12–45 second heuristic and six-cue cap could become code-driven emotional segmentation. Moved creative length/grouping decisions to the skill; technical admission must reject rather than truncate the plan.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `ef2f189fd039303d00649f9bde33af9ceb40d52d80369d35182699b0d7f76c36`

177 SHA-256: `82d8ea2b5c086ec41840ce9e81906b28a601d7e42d534564ea08b6b8cde39201`

## Round 10 — Multimodal evidence and privacy

MUST_FIX: optional visual/audio evidence lacked capability/privacy admission and could imply nonexistent modality analysis. Added explicit modality declarations, skill interpretation and authenticated evidence transfer.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `ccbf56dde9dd173d67db6bde2ae639c13c571245489738d4abca84aa6602f0ce`

177 SHA-256: `8b722548624a945026f648a3763ce8ddefef55597e87711eb6ae0b5407950720`

## Round 11 — Prompt injection and trust separation

MUST_FIX: skill-first alone does not stop source text from masquerading as instructions or modifying rights/budgets. Added trust boundaries and negative execution tests across both specs.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `c585dc058ed4bd2f6b63821004301e592d2fa1e78680a91e795d6b222cc1ecc7`

177 SHA-256: `27307d45ddf50c2320b74222fa48aa40587e1145aaa19af31e02528ffbe23e09`

## Round 12 — Transactions, retries and billing

MUST_FIX: multi-stage authorization lacked settlement/restart semantics. Added durable reservation/dispatch reconciliation and separation of upload retries from semantic/music inference.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `f8ea275108785b76fc57b163c120001050a0294e79a296092d21a91906a34841`

177 SHA-256: `b1de445a24ad599a718207ad979a33160415a59b08891a683d6f8451c8dad323`

## Round 13 — Cross-runtime schema completeness

MUST_FIX: shared shapes omitted explicit semantic/caption provenance and a wire-version/validation contract. Added strict shared fields, conformance fixtures and artifact timebase/hash checks.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `11c3283e0958b61ef8e7c403334c6c255b0619cb74fbac8359ca03e908ccbf19`

177 SHA-256: `d54849c9b5e26692f44331df26f2a2be91322f3bfe0b6daccdc6f11378fc1af0`

## Round 14 — Rights propagation and creative prompt changes

MUST_FIX: approved rights could be inherited across changed captions/takes or revoked ancestors. Added separate evidence-bound clearance and export-time dependency checks; no legal judgment delegated to the emotion skill.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `0fb5fa59f6e37dedf174c028b52e773c590713c9fdf7631cdd5120a499503639`

177 SHA-256: `055e758726314a5bb5f0ac45242cea20b9447b3e3a0b05198fbe7b8c695fca58`

## Round 15 — Measurable mix acceptance and silence

MUST_FIX: QC required reports without explicit behavior for protected windows or frame/sample tolerances. Added measurable silence/sync/ducking proof and separated technical repair from semantic replanning.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `b287af3d4583abe98da8dedbff23a85ad56c74a20c5a86f97ccc255a05d8d885`

177 SHA-256: `6f0a3ae3511884791d23824cce2d5465e3946fb99b621c5377bd2b1d40c8d392`

## Round 16 — Manual edits and production-episode joins

MUST_FIX: manual changes and full-episode joins could bypass caption review or erase local edits. Added scoped reconciliation and atomic apply invariants across both specs.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `a9b9930701734ad0528a8348e06d96f8cbe28888ee9239218d6d26a0788bf2df`

177 SHA-256: `cd614d9b5eafe1eda841bf68403beb97d6df941bd35602ec2cdce11ec8320cdd`

## Round 17 — Implementation acceptance and review traceability

MUST_FIX: implementation slices/tests did not yet require the new skill bundle, real semantic eval or exact loaded-instruction proof. Updated deliverables and replaced stale two-pass summaries with this audit record.

Verification: focused contract checks PASS (3 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `37651c0c9f324616115fd51cc7d517eafe4102cd4b064132b933bf45505c552b`

177 SHA-256: `bff46a225412a96a20b37899601f8f4356fa65a40084a4e0e32a0987cfd82f1e`

## Round 18 — Full-pair contradiction and caption review closure

MUST_FIX: compiled captions needed their own semantic check, which changes the call ceiling; legacy undo wording and transcript-only badge contradicted newer clauses. Closed these conflicts and rechecked shared admission.

Verification: focused contract checks PASS (5 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `ea8bd6883e440d1b21932025b1d02431ff695872b81d0685483eb3a8cf9ad0a7`

177 SHA-256: `ace69c4b08a04ac862b1e00f265af001d2de08fc708c87b523354e09e3bff152`

## Round 19 — Cross-spec regression and dependency review

CLEAN: rechecked evolved contracts after round 18 across skill execution, mode/call budget, provenance, timing origin, manual edits, genuine-only runtime, rights and undo. No new material inconsistency found. Relative links/headings and stale-wording checks passed; proposed skill was not accidentally implemented.

Verification: focused contract checks PASS (9 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `ea8bd6883e440d1b21932025b1d02431ff695872b81d0685483eb3a8cf9ad0a7`

177 SHA-256: `ace69c4b08a04ac862b1e00f265af001d2de08fc708c87b523354e09e3bff152`

## Round 20 — End-to-end adversarial acceptance review

CLEAN: walked both specs through overview-only nine-shot plans, conflicting script/ASR, silent scenes, absent/changed skill or LLM, malicious instructions, stale/canceled/duplicate Worker results, manual mood edits/production joins, genuine Music 3 failure and revoked export rights. Each has explicit provenance and review/failure behavior without semantic heuristics or substitute music. No new material design gap after round 19. One initial literal-text assertion used different wording than the clause; corrected the assertion without changing either spec and reran. This closes document reviews, not runtime/audible-quality proof.

Verification: focused contract checks PASS (13 assertions); both documents readable, fences balanced. Documentation checks, not runtime tests.

176 SHA-256: `ea8bd6883e440d1b21932025b1d02431ff695872b81d0685483eb3a8cf9ad0a7`

177 SHA-256: `ace69c4b08a04ac862b1e00f265af001d2de08fc708c87b523354e09e3bff152`

## Final result

20 completed sequential reviews: 18 rounds with design fixes, followed by 2 clean regression/end-to-end rounds. No known unresolved in-scope specification gap from these reviews. Both final specification hashes match rounds 18–20. Relative links, headings, contract assertions and document integrity checks passed. Implementation, real LLM evaluations, GPU inference, licensing deployment review and listening tests remain the explicit future acceptance gates. No paid generation, production edits or application-skill implementation occurred.
