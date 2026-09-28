---
spec_id: 253
numbering_status: PROVISIONAL_PENDING_CANONICAL_REGISTRY_CHECK
title: SmartAIHub Universal Product Command, Media Handoff & Capability Interoperability
revision: 1.2-proposed-second-20pass-audited
status: DOCUMENT_AUDITED_R1_2_IMPLEMENTATION_UNVERIFIED
prepared: 2026-09-27
original_baseline_revision: 1.0-proposed
audit_passes: 40  # cumulative: previous 20 + a second, distinct set of 20
owner_review_status: PENDING_CANONICAL_REPOSITORY_RECONCILIATION
source_design: SmartAIHub AI Film Studio Blueprint v1.4 Sections M/N/O
proposed_path: specs/feature/253-universal-product-command-and-media-handoff/spec.md
implementation_boundary: Specs 1-214 immutable; Spec 224 active unchanged; no second global Chat/Job/Approval/Capability authority
feature_flag: product_interop.enabled=false
primary_owner: versioned cross-product adapter contracts and conformance only
companion_specs: [196,195,200,206,207,215,216,220,224,225,226,231,233,237,239,240,241,242,243,244,247,248,251,252,254]
---

# Spec 253 — Universal Product Command & Capability Interoperability

## 0. Unique gap and explicit non-ownership

Every product can already or prospectively invoke capabilities, but cross-product tasks risk inventing mutually incompatible command adapters, artifact transfers and UI result envelopes. Spec 253 owns **only the normalized, versioned interoperability contract and its conformance harness** for tasks that involve two or more distinct first-party products (Film Studio, Creator Workspace, Video Editor, Vertical Drama, Media Studio, Mini Apps and future products) and/or need portable capability handoffs. It does NOT own a new conversation, planner, global registry, execution engine, physical job ledger, authorization source, UI renderer or generic media database.

Feature 196 remains the universal goal/intent authority; Specs 225/226 own one shared Chat + Task Control UX/compatibility; Spec 215 owns logical Workflow compilation; Feature 195 owns physical `worker_jobs`; Spec 240 owns safe generated UI; Spec 242 owns Cloudflare placement adapters; Spec 243 owns hosted harness; Spec 231/model gateway owns inference. Spec 253 is the versioned seam that lets those owners and independently usable domain products interoperate. Product entry points remain individually usable with this feature flag OFF.

## 1. One chat, many products, distinct context boundaries

The **same** conversation, messages and task cards must be visible in full Chat, the compact `AI Chat & Feedback` launcher, Task Control and authorized mobile/tablet views. Opening Task Control does not create a new chat. Returning from a specialized product does not discard the conversation. The conversation is not equal to one Product Workspace or one Project: it may contain message ranges referring to different authorized products and projects. Each domain mutation must bind an unambiguous `tenantId/projectId/targetRef/baseRevision` and be independently reauthorized.

Page context is **a hint**, never a permission. Current page/selection receives conversational precedence only when fresh and consistent with user intent. Trusted explicit product/project selection overrides the page. If the user has no open page, resolve eligible projects via Spec 241; general commands and capability discovery work without a Project ID. An ambiguous project, cross-project write, cross-tenant asset, stale selection or closed mobile page cannot be mutated on the basis of an LLM guess.

```ts
interface UniversalCommandContextV1 {
  schemaVersion:'sah.command.context.v1';
  conversationRef:string; messageRef:string; clientSessionRef:string;
  originSurface:'full_chat'|'compact_chat'|'task_control'|'product_ui'|'pwa'|'mobile'|'tablet';
  locale:string; timezone:string;
  selectedProductRef?:string; confirmedProjectRef?:string;
  pageHint?:{pageId:string; pageInstanceId:string; contextFingerprint:string;
    selectedEntityRefs:string[]; capturedAt:string; expiresAt:string};
  explicitTargetRefs:string[]; intentScope:'CURRENT_PAGE'|'PROJECT'|'UNIVERSAL'|'COMPARISON';
}
interface ProductCommandEnvelopeV1 {
  schemaVersion:'sah.product.command.v1'; commandId:string; idempotencyKey:string;
  actorRef:string; tenantId:string; targetProjectId:string; targetDomain:string;
  targetResourceRef:string; expectedSourceRevision:string;
  semanticActionId:string; actionSchemaVersion:string; typedPayload:unknown;
  originatingConversationRef:string; originMessageRef:string;
  actionBindingRef:string; previewDigest?:string; approvalRefs:string[];
}
```

User text, third-party Agent Card, Skill description, A2UI payload and pageHint are never sufficient to forge `actorRef`, grant or approval. Server mints scoped action bindings with TTL and revisits policy/current revision immediately before dispatch. Old action bindings are invalid after user switches product, project, tenant or device authority epoch.

## 2. Universal command resolution and typed domain commits

1. Feature 196 receives the command through the **same canonical ingress** used by both full/compact Chat. The existing Capability Resolver chooses semantic operations using registered product action manifests (not all provider schemas stuffed into the prompt).
2. Context Broker combines current page semantic envelope, user-confirmed project, bounded conversation and authorized Spec 241/233 memory. Fetch Tier-B authoritative entity data only as needed; screenshots are optional Tier C with consent, never raw DOM by default.
3. Compiler generates a **typed plan** with product-qualified commands, causal dependencies, cost/egress/license disclosures and immutable input refs. Spec 215 validates graph and accepts only frozen Spec 214 semantic Node Types; no bespoke `film.node`, `creator.node`, etc.
4. For each intended domain edit, request a domain-specific non-mutating `preview`; user receives diff/thumbnail/time-range/cost and protected-field summary in a common artifact card or safe Spec 240 UI.
5. `apply` requires the user- or policy-authorized command receipt; domain API rechecks current ACL, target/revision, locks, rights, budget and idempotency before transaction. Never let a generalized Chat mutation write another product's canonical tables.
6. Cross-product workflow advances only on committed domain receipts. A partial failure produces a recoverable step with a compensation plan and pointers to already completed immutable results. It MUST NOT imply distributed atomic transactions across existing products; **no silent undo of published outputs**.
7. The canonical work object is existing WorkflowRun/worker_jobs/domain-run state. Task Control aggregates source projections, not a second universal workflow DB. All consequential buttons and natural-language controls call the identical semantic source API.

## 3. Product adapter manifest — mandatory before registration

```ts
interface ProductActionManifestV1 {
  schemaVersion:'sah.product.actions.v1'; productId:string; productVersion:string;
  actions:Array<{semanticActionId:string; version:string; inputSchemaRef:string;
    outputSchemaRef:string; previewSupported:boolean; allowedTargetKinds:string[];
    requiredGrants:string[]; riskClass:'READ'|'DRAFT'|'PAID'|'PRIVILEGED'|'PUBLISH';
    requiredCapabilities:string[]; costQuoteCapabilityRef?:string;
    revisionFenceField:string; cancellationSemantics:'SUPPORTED'|'BEST_EFFORT'|'NOT_SUPPORTED'}>;
  handoffImports:string[]; handoffExports:string[]; uiSurfaceRefs:string[];
  conformanceSuiteRef:string; ownerContactRef:string;
}
```

Required initial adapters:

| Product | Minimum commands | Must stay authoritative |
|---|---|---|
| Film Studio (252) | plan shot, preview, change motion/camera, compare/regenerate/approve take, prepare handoff | Film/shot/performance/camera revisions |
| Vertical Drama | series/episode lookup, draft next episode, enhance selected shot, import candidate take, assemble candidate | Story/Series Bible/Episode/Shot/audio canon |
| Existing Video Editor | read selection, suggest/draft/apply bounded EDL, import candidate clips, preview/export | Canonical timeline version, manual locks and media render contract |
| Spec 251 Creator | inspect/import authorized source, translate selected segment, change dub/subtitles, export variant | Creator revisions and locale/voice policy |
| Media Studio | start authorized image/video generation, inspect job/result | Existing media gateway/artifact job contract |
| Mini App (216/240) | expose only reviewable registered semantic actions | Own product scope; no arbitrary tool authority |

Each adapter MUST support `readCapability`, `authorizeTarget`, `preview`, `apply`, `queryState`, and explicit `UNSUPPORTED` for unimplemented operations. An adapter may expose additional actions only with a versioned manifest, permission test and domain owner review. Domain-local editors continue using their own UI and commit paths without installing universal Chat.

## 4. Versioned MediaHandoffBundle — immutable origin, candidate target

```ts
interface MediaHandoffBundleV1 {
  schemaVersion:'sah.media.handoff.v1'; handoffId:string; intentId:string;
  source:{productId:string; tenantId:string; projectId:string;
    entityRef:string; revisionRef:string; sourceContentDigest:string};
  target:{productId:string; projectId:string; targetEntityRef?:string;
    requestedOperation:'IMPORT_CANDIDATE'|'CREATE_DERIVATIVE'|'REVIEW_ONLY'};
  payload:{assetRefs:string[]; selectedShotRefs?:string[]; selectedTimeRanges?:Array<{
      start:{num:number;den:number}; end:{num:number;den:number}; sourceTimebaseRef:string
    }>;
    editorialPlanRef?:string; sourceTimelineRevisionRef?:string;
    characterAndContinuityRefs?:string[]; cameraVariantRefs?:string[];
    audioManifestRef?:string; localeVariantRefs?:string[];
    frameAspect?:string; sourcePtsManifestRef?:string};
  governance:{rightsEvidenceRefs:string[]; consentReceiptRefs:string[];
    policyVersion:string; lineageRef:string; sourceRevocationEpoch:number;
    exportEligibility:'DRAFT'|'REVIEW_REQUIRED'|'APPROVED';
    hashBoundCertificationRef?:string};
  control:{createdBy:string; createdAt:string; expiresAt:string;
    idempotencyKey:string; permittedOperationRefs:string[]};
}
```

**Protocol:** `prepare` does authorization, compatibility/timebase/license/availability checks and cost preview, returns signed short-lived candidate read refs; `accept` in destination validates newest entitlement/source hash/revision, imports derivative refs as a **new candidate revision**, and responds with `destinationReceiptRef`; `finalize` links lineage back to source and optionally offers a separate user-controlled accept-as-current action. Source original, certified output, existing timeline or current drama take never auto-overwritten. Expired/revoked source, unknown checksum, codec/timebase mismatch or unapproved cross-region egress must yield explicit fail/needs-review.

Use Case A: Film shot -> Drama episode candidate take: preserve episode story/shot identity and existing native-audio track; new motion/film output cannot overwrite series Sound Bible or regenerate approved lines unasked. Use Case B: Film/Drama -> Video Editor: import candidate clips/EDL with current timeline revision; respect locked regions and manual tracks. Use Case C: any authorized output -> Creator: independent per-locale transcript/voice/subtitle derivatives and hash-bound export approval. Use Case D: Editor selection -> Film: selection copied as a bounded approved source reference, not project-wide read grant.

## 5. One task board without collapsing product semantics

Spec 225/226 Task Control is a **presentation projection** over `source_domain`, `source_object_ref`, `source_revision/epoch`, canonical state, latest activity, estimated and actual cost, accepted action set and artifact refs. A user goal may have a single visible **goal card** whose nested domain tasks retain original IDs/owners; cross-product stage summaries are read projections from Spec 215 causal graph. A queued child job must not present fake percentage when provider exposes only coarse status. Controls (`pause`, `cancel`, `retry`, `approve`, `review`, `return-to-editor`) resolve to actual owner command APIs. Cancellation after provider acceptance is best-effort and must reconcile upstream costs.

The compact Chat and full Chat use the **same conversation**; Task Control can show work started from any conversation or product. On cross-device reconnect, cursor/replay/fresh-read restores status and reissues action bindings, never replays billing or provider requests. Review artifacts render through Spec 240 vetted surfaces, with text/native fallback on low-end phones.

## 6. Discovery, Capability Fabric, placement and self-development

This spec is **not** a second Capability Registry. Use Feature 196's shared registry/resolver, Spec 248 skills distribution, Spec 199 MCP, Spec 206 A2A and Specs 242/243 execution backends. Normalize a *read-only* capability/resource/qualification view for cross-product plans: semantic input/output profile, provider/model/skill version, compatible hardware/runtime, region/license, per-account eligibility, observation age, verified confidence status, price/budget, egress/privacy, health, revocation and tested fallback. Only independently certified combinations may be selected automatically for material work.

Resource placement ranks authorized local Runner/ComfyUI when user opted in and data fit; Cloudflare Workers/Agents for bounded control; Sandbox/Container for approved isolated CPU/media processing; certified remote GPU for heavy generation; managed hosted agent only for allowed delegated reasoning/harness tasks. Lack of a home computer must not block a cloud-capable use case. Home computer discovery grants **no** unsolicited GPU access or remote filesystem read. Cloudflare Containers are not presumed to supply large model GPUs; Secret Broker mints minimum scoped credentials outside untrusted code.

Continuous Research Spec 244 may propose external tool trials but **never auto-install**, inherit secrets, distribute copyrighted/forbidden weights or promote uncensored model output to production. Novel API/ControlNet/LoRA/ComfyUI workflows are admitted through pinned signed pack manifests, sandbox evaluation, hardware/quality/license benchmark, cost check and owner approval. Genuine missing integration may create a bounded Spec 224 development request (fork -> tests -> PR -> owner promotion) without letting normal user workflow modify core code.

## 7. Failure and security semantics

- Cross-tenant or unauthorized project refs never appear in chooser/preview; derived Vectorize matching never establishes access.
- Shared conversation can refer to multiple projects, but action target and effect scope are explicit per command. Stale page selection is ignored after route switch or timeout; ambiguous "แก้ตรงนี้" leads to safe chooser, not arbitrary edit.
- Prompt injection in a script, transcript, web source, external agent result, screenshot, plugin resource or ComfyUI metadata cannot grant tools, change project or override cost/approval policy.
- A Mini App publisher cannot inherit consumer assets, private memory or system admin tools; Spec 240 action bindings are per consuming principal and resource revision.
- Partial external failure preserves accepted artifacts and the parent's accurate `WAITING_SYSTEM`, `RECOVERING` or `NEEDS_REVIEW` state, not duplicate job/ledger entries.
- A provider outage causes capability degradation with clear alternatives, not a mandatory UI redirect or silent weaker conditioning.
- No credential, signed URL or raw media is stored in general event text. Keep signed URL TTL short and tenant isolation enforced at origin and destination.
- Deletion/consent revocation tombstones pending exports and prevents stale callbacks resurrecting private content or licensing new re-runs.

## 8. Rollout order and explicit acceptance

| Phase | Deliverable | Release gate |
|---|---|---|
| X0 | Read-only real code/API/migration/spec registry audit | Identify actual product action owners, no historic overwrite |
| X1 | Action manifest + schema validators for existing products | Old clients work with extension disabled; no dual routes for same command |
| X2 | Full/compact Chat same conversation + context/page/project selector bridge | Reconnect/multi-tab cross-context tests, no stale action grant |
| X3 | Versioned Film/Editor/Drama/Creator MediaHandoff v1 | Acceptance, reject/conflict/revocation and source-asset immutability tests |
| X4 | Cross-product Spec 215 workflow and unified Task Control projection | One goal/child receipts, no duplicate worker jobs or billing |
| X5 | Scope-aware capability discovery and execution backend choices | CPU-only phone, opt-in local GPU, remote GPU failover benchmark |
| X6 | Safe GenUI/Mini App actions and developer/extensibility handoff | Signed/versioned bundles, ACL, sandbox & canary approval |
| X7 | Two-tenant canary and per-product rollback | Existing editor/drama/creator E2E parity and no lost customer jobs |

**Conformance is per operation, not a global "integration complete" checkbox.** Minimum P0 demonstrations: one conversation opened compact -> full -> phone without new chat; a command with confirmed selected editor clip; unrelated phone command without a page; one film shot imported into existing Drama as candidate while original stays approved; Editor manual lock protected against Chat AI; one localized Creator derivative with independent release QA; existing legacy editor/vertical series/creator all work with integration flag OFF; Runner 0/0 and MCP 0/0 do not block provider API/cloud-supported work. No production changes until current migration, approvals and source-owner reviews permit them.


---

## SPEC-254-INTEGRATION-DELTA — Film-specific external task portability (2026-09-27; PROPOSED, additive)

**Dependency:** proposed Spec 254, provisional number; current live repository owner/version confirmation required. This appendix is not evidence of deployed functionality.

**253-E254-01.** Cross-product ProductActionManifest/MediaHandoffBundle may attach read-only references to proposed Spec 254 `FilmExecutionRequest`, `FilmExecutionOffer` and `FilmExecutionResult` for source provenance and review, without copying resource secrets or taking execution authority.

**253-E254-02.** Spec 253 owns versioned *interoperability* and handoff acceptance; Spec 254 owns Film-specific conditioning/profile/qualification. Universal Chat/Task Control are still Specs 225/226; no extra Film conversation or global registry.

**253-E254-03.** Editor/Drama/Creator continue to use their native command handlers, original revision fences and manual locks. Film-derived outputs are imported as candidate revisions through an authorized handoff, never by direct cross-product DB mutation.

**Unexecuted acceptance gates:**

- [ ] Editor/manual lock unchanged after rejected Film output
- [ ] Creator/Drama imports preserve origin checksum and independent policy


---

# AUDIT-R1.1 / 20-PASS IMPLEMENTATION HARDENING — SPEC 253 (2026-09-27)

**Normative precedence and compatibility.** This additive full-document R1.1 proposal supersedes a conflicting earlier proposal clause only where explicitly addressed. Keep v1 wire schemas in `CONTRACTS/*.v1.schema.json` for historical package fixtures; introduce separate **v1.1** schema/version adapters for new operations. A source owner may not promote an unverified v1→v1.1 adapter to production. No global command/router/job/authorization implementation resides in Spec 253.

## B1. Universal command context without product lock-in

A command in Full Chat, compact modal, Task Control or mobile reuses the same Feature 196 conversation/message IDs and Spec 225/226 task projections. **Conversation context, active product, confirmed project and selected entity are separate concepts**. PageHint must include pageInstance ID, selection revision and expiry; changing tab, product, project, permission epoch or device invalidates a stale selection-derived action binding. A phone with no open product remains capable of authorized general goals. Spec 241 resolves candidate projects from authorized profiles and short relevant message ranges; it must not auto-approve a project-specific write merely from semantic similarity. Concurrent commands in one conversation may target separate products/projects with independently checked action bindings.

Server-stamped trusted `UniversalCommandContextV1_1` should add `contextBinding` (selection revision, product epoch, observed authorization epoch and contextual target provenance). Client-supplied context is a navigation hint, **never** a permission; restore exact current authorized domain record at command validation time. Reopening Chat does not duplicate a job or silently create a new conversation. A page-free `UNIVERSAL` command may produce a READ or SUGGEST result without any Project; creating/editing a Project-specific asset requires a confirmed, scoped target.

## B2. Product action manifest, effect semantics and old-client compatibility

A product declares independently versioned semantic actions with input/output JSON Schemas, effects (`READ_ONLY`, `LOCAL_DRAFT`, `DOMAIN_COMMIT`, `EXTERNAL_BILLABLE`, `PUBLISH`), per-action target kinds and resource permission requirements. `preview` MUST be pure/side-effect free (including no paid provider send). If a provider charges for sampling, declare a **separate priced preview action** with explicit quote/approval, not a 'free' preview. Product adapter maps `Suggest/Draft/Apply` onto its existing native API; Spec 253 registers metadata and runs conformance but never implements the domain's mutation code.

Each command carries verified `expectedSourceRevision`, `expectedPolicyEpoch`, `targetScopeDigest`, `previewDigest` (when applicable), `authorizationBindingRef` and semantic idempotency key. An external Agent/UI proposal cannot mint actor or grant fields. A stale command fails with a machine-readable `REVISION_CONFLICT` and latest authorized summary for user rebase. Retried same command returns the prior canonical receipt. Schema evolution MUST support old clients with unsupported actions suppressed and known old operations unchanged; no automatic renaming of native commands.

## B3. Handoff as a recoverable inter-product saga

Define a domain-independent **HandoffAttempt** projection referencing the canonical Spec 215 workflow step and the destination's actual API receipt, *not* a second global queue. States: `PREPARED`, `ACCEPT_REQUESTED`, `DESTINATION_COMMITTED`, `SOURCE_LINKED`, `NEEDS_RECONCILIATION`, `REJECTED`, `EXPIRED`, `REVOKED`. Prepare computes rights/consent, exact source hash+revision and initial compatibility/timebase requirements, then returns scoped expiring read refs. Accept carries a destination optimistic version fence and dedup key; **only the destination owner** may commit an immutable candidate or derivative. Finalize registers source→destination lineage after a verified commit receipt, but must not mutate a source's approved asset.

If the accept network response is lost after the destination has committed, first query the destination by `handoffId + idempotencyKey` and reconcile its receipt. Do not re-import or rebill blind. If finalize fails, the candidate stays in a clearly marked `DESTINATION_COMMITTED` reconciliation state; the source still keeps its historical approved version. Hard deletion/revocation after Prepare fences Accept; revoke after Accept marks derivative usage/export eligibility for the existing rights/policy owner and initiates approved deletion/retention handling. There is no distributed ACID assumption across products.

When the source is local-only media, a reference-only handoff cannot authorize cloud upload. `prepare` must show local materialization/egress constraints; if the destination is cloud-only and the user denies upload, offer a non-destructive local/import-deferred path. A signed URL and a `sourceContentDigest` are **not** proof of grant; destination must recheck current ACL, exact AssetRef version and source revocation epoch.

## B4. Exact product preservation boundaries

**Existing Video Editor:** original Timeline version, all manual clips and locked ranges, TrackID, render mode (`legacy_worker`, `web_beta`, `web_default`) and .sahvideo relink behavior survive with interop OFF. Imported Film output defaults to an inactive candidate bin; preview EDL overlay is reversible; Apply uses editor's own expected timeline version; a source Film shot's changed duration is not allowed to silently shift protected editor audio/subtitle tracks.

**Vertical Drama:** original Series Bible, Episode/Scene/Shot IDs, nine-shot/ten-second default where the actual preset applies, character appearance, Native Audio master and Series Sound Bible remain owned by Drama. Film output returns as a candidate Take with explicit shot mapping and timebase; the Drama handler decides whether/when to switch the episode's active Take and whether an approved native-audio replacement is authorized. No mandatory Film 3D stage for ordinary Drama generation.

**Spec 251 Creator:** receives an authorized immutable source revision plus optional dialogue/continuity references. Localized transcript, translated subtitle, TTS, voice consent and per-locale export certification stay independent Creator/Spec 247/227 derivatives. A Film take's approval does not certify a translated or re-dubbed export.

**Mini Apps/third-party UI:** a published Mini App does not gain its publisher access to consumer source data. Spec 240 only displays validated surface data and server-issued action bindings; custom app scripts cannot call unlisted arbitrary product APIs. Existing product UI remains fully operable with GenUI disabled.

## B5. Task Control, offline and cross-device consistency

Goal/task cards are authorized read projections of existing Spec 215/195/domain event histories with stable `sourceDomain`, `sourceObjectId`, `sourceVersion`, `sequence`, `eventDigest` and a replay cursor. One visible goal may expand into many source-owned child jobs. Backend callback/event duplication must not reorder `WAITING_HUMAN` and `COMPLETED`; stale cached cards cannot enable consequential buttons. Cancellation semantics are per owner (`NOT_SUPPORTED`, `BEST_EFFORT`, `SUPPORTED`) and provider accepted/unknown effects remain explicit.

Phone/Tablet may review, compare, annotate, retry eligible steps and approve as permitted; full Timeline/3D editing is an **optional** deep link, not a requirement for core approvals. Offline text or draft commands queue locally *without authorization* and must revalidate on reconnect; never auto-resend paid requests or upload local-only content from offline queues. Every notification resolves canonical current state and current tenant grants.

## B6. Cross-product plan boundaries and exact budgets

Feature 196 defines user goal and target plan, Spec 215 compiles logical DAG using frozen 214 Node Types, Spec 253 contributes versioned product semantic adapters, source-specific receipts and handoff compensation steps. One cross-product goal has a configurable **total approved spend ceiling** plus independently quoted stages; adding a provider or recutting audio after approval may require a new quote. Spec 207 owns reservation/settlement and protects against duplicate user charges; a recovered export retries only invalidated derived stages. An unsafe or policy-ineligible downstream action cannot cause a different product's approved source revision to be overwritten.

## B7. Future product admission and API conformance

New SmartAIHub products join via signed/versioned ProductActionManifest + `readCapability`, `authorizeTarget`, `preview`, `apply`, `queryState`, handoff serializers and explicit unsupported actions. Require compatible schema migration fixtures, deterministic rollback for adapter-only changes, sandbox use of synthetic non-secret content and owner-approved canary. A richer third-party Mini App UI or managed Agent may present/propose an operation, but only current authoritative domain APIs commit. Never turn cross-product interoperability into a license to access every workspace.

**Acceptance gates A253-01–15 (design-only):** 01 compact/full/mobile same conversation; 02 no-page general task; 03 page selection timeout and route switch; 04 authorized two-project switch; 05 stale source revision conflict; 06 free-preview purity; 07 one command/one receipt across retries; 08 handoff lost response after commit; 09 finalize failure reconciliation; 10 revoke between prepare/accept; 11 Editor locks/legacy mode; 12 Drama native audio/shot preservation; 13 Creator per-language export independent; 14 Mini App tenant isolation; 15 two-tenant canary and per-product feature-flag rollback. Each needs source-owner QA evidence and exact source API version, not document-only claims.


---

# AUDIT-R1.2 — NEW 20-PASS DEEP CONFORMANCE HARDENING (passes 21–40 cumulative)

**Precedence:** Normative proposed extension to the full R1.1 contract above. No new universal Chat runtime, approval service, global workflow state machine, source-file overwrite or cross-product super-database. The wire v1.2 contracts are additions to v1/v1.1, not silent schema mutations.

## E1. Context provenance and lease-fenced conversation targets (pass 28)

Full Chat, compact launcher, Task Control and phone/tablet use *the same* first-party Conversation ID but **not the same ephemeral selection**. `UniversalCommandContextV1_2` adds a server-minted `contextResolution` binding: confirmed target/product ID, precise actor/principal+tenant, message-range association, target provenance, selection revision, page instance, issuing device scope, policy epoch, expiry, and refresh nonce. Server compares the token to fresh canonical domain/ACL data before READ of sensitive data or any mutation. A switch in browser tab/page, active Project, mobile device, browser session, team membership or target rights invalidates stale bindings; continuing an old conversation only restores history, never grants a prior selection. If no product is open, general read/planning remains available and only relevant confirmed target writes are gated.

**Acceptance D253-28:** user selects Film shot on Web, then opens mobile and asks “edit this”; system presents an authorized selector instead of reusing a stale Web clip. Reconnecting to the same task reuses Conversation ID without duplicate work.

## E2. Commit evidence, approval snapshot and idempotent semantic actions (passes 29–30)

`ProductCommandV1_2` SHALL bind command `intentDigest`, exact `targetRef`+base revision, server-confirmed `authEpoch`, preview digest+expiry, quote ID/expiry+approved ceiling where billable, allowed side-effect/egress scope, and specific approval/decision epoch. Distinguish free **pure Preview** from explicitly paid sample generation; a `previewDigest` is meaningful only if it binds the exact source/target, schema+action version and output-affecting parameters. At Apply, source domain re-fetches current project rights, source revision/locks, quote validity, consent and decision epoch *atomically with its own domain commit*. User messages and tool-generated JSON cannot set actor identity, mint a binding or bypass domain-owned commit. Repeated same semantic idempotency key returns the original receipt; same key with different digest is `IDEMPOTENCY_CONFLICT`.

Result review is distinct from creating an edit: read-only approval cards must refer to immutable result/QA hashes and expiry; approval of an old take must not approve newly regenerated output with reused friendly Shot name. Stale Task Cards render `REOPEN_TO_REVIEW` and disable buttons until a fresh authoritative snapshot is available. If the user rejects a candidate, only the candidate's review state changes; source Film or Editor original remains untouched.

**Acceptance D253-29/30:** quote expiry before Apply blocks paid dispatch; same key/different command fails; regenerate after review snapshot invalidates prior approval; read-only Task Control access cannot mutate owner-domain tables.

## E3. Multi-asset handoff with exactly identified bytes (pass 31)

`MediaHandoffBundleV1_2` SHALL carry a `sourceAssetManifest[]` where each entry binds asset ID+immutable revision, actual bytes digest (SHA-256, not an illustrative string), byte length, media type, source PTS/timebase, ownership/rights and required transfer mode (reference-only/local-only/authorized materialize); entry order and `role` are explicit. The destination's `accept` is an owner-domain **atomic candidate commit** for a handoff batch; optional partial acceptance is permitted only through a separately numbered requested `partialAcceptancePolicy`, explicit accepted/rejected manifest entries and a fresh quote. Before `accept`, resolve current grants for both source AND destination independently, verify content bytes, any required audio/voice permission, and target version. A prepared bundle never changes any approved source. After an `ACCEPT_REQUESTED` timeout, reconcile by `handoffId + acceptIdempotencyKey` before retrying. Late source deletion or rights revocation fences delivery/release and informs every authorized derivative owner.

**Acceptance D253-31:** upload of two assets with one revoked between prepare and commit produces no invisible partial import; lost commit response reconciles exactly one candidate; local-only assets cannot be uploaded by an indirect hosted tool.

## E4. Explicit cross-tenant/Project grants and product compatibility (passes 32–33)

Project membership for source is not authorization for target Project, even within a tenant; cross-tenant movement requires separately verified export + import entitlements, data-residency/consent rights and an auditable target-scoped grant. Source-owner and destination-owner data authority remain independent. Tokenized signed asset URLs are transport grants with TTL and *not* equivalent to source access/publishing or recipient authority. A revoked capability must fail closed while unrelated first-party Chat and native editor workflows remain operational.

**Compatibility is bidirectional:** Video Editor keeps original timeline/TrackIDs, lock regions, source media, `legacy_worker` mode and portable `.sahvideo` relink state; Drama keeps Series Bible, original Native Audio master, default nine × ten-second preset where applicable and voice policy; Spec 251 keeps transcript/glossary, locale-specific subtitles, dubbing consent and release approval. Film-to-product import defaults to versioned inactive candidate; editing the candidate cannot rewrite the foreign source. Source→destination and destination→source conversions use owner-approved typed adapters with explicit unsupported states, not automatic project merging.

**Acceptance D253-32/33:** one tenant's public Mini App cannot see a separate tenant's private Film; export granted but target import denied results in safe non-mutation; disabling Film+interop flags leaves legacy timeline/drama/creator golden samples unchanged.

## E5. Task Control event repair and human-action state (pass 34)

Spec 253 contributes only product event **adapters** to Specs 225/226 projections. Each source event SHALL include canonical source ID, generation/epoch, source-local monotonic sequence, content digest and scope. Late, out-of-order, duplicated and missing events trigger snapshot replay by canonical owner; if replay is unavailable, display `STATE_UNKNOWN` and prevent consequential actions instead of fabricating progress or assuming completion. `ACKNOWLEDGED` notification is not `APPROVED` decision; old device approvals are fenced by current source/decision epoch. Per-product Cancel/Resume/Retry semantics come from the current action manifest and source runtime, not a universal status label. Enforce stable accessible action semantics across compact/desktop/mobile, with explicit fallback when generated UI cannot render.

**Acceptance D253-34:** multi-device replay of duplicate `WAITING_HUMAN`/`COMPLETED` events converges to canonical owner state; acknowledged push leaves approval pending; network disconnect does not auto-send stale paid command.

## E6. Upgrade and backward-compatibility protocol

Advertise the exact supported protocol range per adapter: v1/v1.1 readers accept approved historical payloads only with field and semantic adapters; *new* cross-product writes MUST satisfy v1.2. Unknown privileged fields, untrusted attachments, unsupported version or missing signed owner adapter cause an explicit, localized `UNSUPPORTED_VERSION`/`UNAVAILABLE_CAPABILITY`, not permissive free-text execution. Record true owner of each implementable change: Feature 196/Spec 241 context resolution; Specs 225/226 Chat+Task Control projections; Spec 253 product-handoff adapters; each source product its own commit; existing Spec 215/195 job runtime. Avoid editing actively implemented Spec 224.
