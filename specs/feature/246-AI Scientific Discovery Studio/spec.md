# Spec 246 — AI Scientific Discovery Studio

> **Status:** DOCUMENT-REVIEWED / IMPLEMENTATION-PENDING (canonical registry, repository contracts and production conformance unverified)  
> **Version:** 1.2.0 — 12-pass architectural / scientific / cross-spec gap audit  
> **Date:** 2026-09-25  
> **Product:** SmartAIHub — Scientific Research & Discovery Vertical  
> **Suggested priority:** P1 foundation, P2 domain extensions, P3 laboratory-in-the-loop  
> **Numbering:** 246 is provisional until checked against the canonical spec registry. If occupied, renumber this **new** document; do not overwrite an existing spec.

---

## R1.2 normative amendment — 12 focused document-review passes

**Audit baseline:** this R1.1 Spec 246 document; latest accessible Spec 240 R0.6 design artifact (2026-09-24). **Audit scope:** architecture, scientific rigor, evidence, provenance, data governance, execution/recovery, security, GenUI, costs, laboratory boundary and delivery gates. Each of the 12 distinct audit passes is documented in §18, with corrective requirements in the relevant sections and new AT-29–AT-48. This is a **specification review, not evidence that code, endpoints, migrations, lab equipment or security tests have passed**.

**R1.2 precedence:** the changes below supersede conflicting R1.1 language where expressly identified; otherwise R1.1 requirements and AT-01–AT-28 remain mandatory. **No retroactive updates** to historical Specs 1–213 or in-progress Spec 224; use additive compatibility contracts/backlogs and verify the canonical registry before assigning the number 246. Spec 240 owns the shared GenUI renderer and interaction lifecycle; Spec 246 owns scientific domain correctness and data contracts. Physical experiments remain excluded from MVP.

## R1.1 change note — Spec 240 is the presentation owner

The separate **Spec 240 — Agent-Generated UI & Safe Interactive Surfaces** (latest reviewed planning artifact available: R0.6, dated 2026-09-24) already defines shared result-to-interactive-UI generation for Chat, Mini Apps, Mobile/PWA and Product Shell. **This Spec 246 must not invent or duplicate a GenUI planner, component registry, surface lifecycle, streaming-patch engine, action-binding infrastructure, renderer or marketplace template mechanism.** Its ten UI capabilities are functional *views/surfaces*, not a requirement to build ten independent applications or pages.

Spec 240 R0.6 is a **design-reviewed proposal, not confirmed implemented or production-certified**. Phase 0 checks actual deployment and versioned interfaces. Until the required Spec 240 capabilities are deployed and certified, provide usable project-scoped Chat with existing deterministic, schema-driven result components and an accessible text/table/structured export fallback. The absence or failure of GenUI cannot block canonical scientific jobs, evidence capture, protocol approvals or independent verification.

**R1.1 changes:** add explicit Spec 240 and 220/225/226 ownership; replace ten fixed-page assumptions with a minimal stable Research Workspace shell plus AI-generated task-specific surfaces; specify Scientific Result → GenUI adapter, server-authoritative scientific status, trusted approval boundaries, failover and cross-host acceptance tests; add Spec 240 readiness gates to the phased implementation plan. All other scientific-domain and runtime ownership boundaries remain unchanged.

---

## 0. Executive decision

Build a **scientific-research product vertical on top of existing SmartAIHub shared infrastructure**, not a separate orchestration platform. The product supports literature review → evidence graph → hypothesis generation → experimental design → approved computational execution → independent verification → reproducibility package → findings → iterative research. Laboratory integration comes later, under explicit institutional approval and safety governance.

**Non-negotiable boundaries**

1. Existing Durable Orchestration Kernel + Workflow Runtime + `worker_jobs` remain the single execution and job-status authorities. This spec does **not** introduce a second job scheduler, agent control plane, approval authority, wallet, tenant IAM or source of truth for user memory.
2. Treat Specs **1–213, including 213, as frozen**; specify additive improvement backlog, adapter contracts and later-spec extensions instead of editing original files. Treat in-progress **Spec 224** as frozen for the same reason. Validate the actual state/contract of every referenced spec at implementation time; a reference here does not assert it is deployed.
3. PostgreSQL remains the transactional source of truth (target: managed PostgreSQL over Cloudflare Hyperdrive); Cloudflare R2 stores versioned artifacts; **Cloudflare Vectorize is the production vector index**, not pgvector. Vector embeddings/search results are **not** authoritative scientific evidence.
4. Agent output is a **proposal** or **analysis**, never automatically a validated discovery. Track `claim_state`, verification level, uncertainty, limitations and human sign-off separately.
5. Physical-lab execution, clinical interventions, dangerous biological/chemical procedures, and autonomous control of hazardous equipment are **out of scope for MVP**. Later connectors must pass institutional and domain-specific safety review; no blanket authorization.
6. Default deny on tenant, project, dataset, external tool and lab-equipment access. No training on user research or cross-tenant memory sharing without separate, explicit permission.
7. **Spec 240 owns generated presentation**; Spec 246 owns scientific schemas, data provenance, scientific status, domain actions and research policy. A generated surface is a view over canonical scientific data, never the source of truth or proof of scientific validity.

## 1. Scope, personas and objectives

### 1.1 Personas

- **Researcher / Principal Investigator (PI):** creates research projects, approves study protocols and scientific conclusions.
- **Research assistant / student:** reviews literature, proposes hypotheses, runs permitted computational experiments.
- **Statistician / methodologist:** reviews design, statistical analysis plan and uncertainty.
- **Lab operator:** receives separately approved experimental instructions and uploads instrument results in future phases.
- **Institutional compliance officer:** handles risk categories, restricted datasets and laboratory policies when required.
- **Tenant admin / platform admin:** manages quotas, connectors and incidents; **cannot read project data solely by virtue of platform-administrator status**.
- **Independent verifier:** reviews immutable experiment snapshots, reruns computational results and issues signed verification findings.

### 1.2 In-scope MVP

Research project/workspace; existing Chat plus optional bounded project-scoped mini chat (only where the shared host implements it); citation-backed literature ingestion and research retrieval; structured hypothesis registry; experimental plan and preregistration snapshot; approved Python/container simulations; dataset handling; provenance graph; statistical and reproducibility checks; independent review; iterative research loop; alerts; cost caps; research report/export; template-based mini apps.

### 1.3 Non-goals

Creating a foundation science model; claiming original discoveries are proven without external validation; automatically performing physical experiments; replacing institutional review boards, ethics committees or scientific peer review; unrestricted crawling of paywalled content; building an independent graph DB by default; replacing the current Development Orchestrator; modifying the original specs 1–213/224.

### 1.4 Outcomes and initial target users

Begin with **computationally verifiable** use cases: ML benchmarking, environmental time-series analysis, materials-property datasets and other safe, reproducible data-science experiments. Expand to domain-specific and physical-lab integrations only after observing operational performance, paying demand, governance readiness and reproducibility metrics.

## 2. Cross-spec integration and ownership

| Existing spec or subsystem | Reuse / new adapter | Single authority / anti-duplication rule |
|---|---|---|
| 186 unified job control (if deployed), `worker_jobs`, retry/outbox | `scientific_experiment` job kind and metadata | Shared job-control plane owns execution state and leases |
| 196 assistant runtime / Chat | project-scoped Research Copilot and conversational entry point | Existing session and tool invocation ownership; no separate scientific chat runtime |
| **240 Agent-Generated UI (R0.6 design; readiness unverified)** | Shared result-to-surface planner, declarative components, chart/table/interactive visualization, reusable UI templates, responsive rendering in Chat and Mini Apps | **Single GenUI/presentation owner**; Spec 246 adds only typed scientific result adapters and vetted scientific presentation hints, never a forked rendering engine |
| 220 / 225 / 226 | Authoritative action/data policy, trusted approval chrome, Chat/mobile surface and semantic command bindings | Spec 246 may declare scientific action intents, but only existing trusted host and command gateway may authorize/execute them |
| 199 MCP Gateway / 200 External Agent Gateway / 206 A2A | scientific tools, researchers, domain agents | Tool and agent registration through existing governance |
| 209 Workflow Studio / 214 Node Types / 215 Workflow Runtime | scientific node pack and research template graphs | Original workflow engine owns graph execution |
| 212 Marketplace | add-on research use-case catalog and versioned Research Mini Apps | Reuse publishing, entitlement, billing/reviews; never mutate deployed versions silently |
| 224 Development Orchestrator, in progress | optional code generation, scientific scripts and test harness via published bridge | No changes to active Spec 224; cannot act as scientific peer-review authority |
| 229 Retrieval / 231 Routing | evidence retrieval, source ranking, task-specific model choice | Verified original sources and signed evidence snapshots govern factual claims |
| 238 Alert | experiment complete, budget warning, review required, integrity failures | Single alert/notification pipeline; redact sensitive details |
| 233 Project Memory + 241 cross-scope memory / project resolution (if deployed) | canonical research-project memory through Spec 233; Spec 241 governs auto-project resolution, user consent and cross-scope sharing | Do not create a Spec 246 memory store/resolver; fail closed to manual project selection if 241 is absent or ambiguous |
| 242 Cloudflare Agents/Sandbox | isolated Python/Node/Shell execution when available | Container is an execution adapter; no autonomous authorization or job SoT |
| 243 Managed Cloud Agents, 244 research/project iteration, 245 cloud migration | compatibility extension points where applicable | Reconcile actual registry, contracts and readiness gates before implementation; Spec 244 may propose iterations, not authorize scientific verification or experiment execution |
| R2 / Vectorize / PostgreSQL / Hyperdrive | files / semantic index / relational SoT | No primary experimental truth in embeddings, queues or ephemeral container state |

**Compatibility-first rule:** before writing code, inventory actual schemas, published events, APIs, permission model, wallet, runner capacities, cloud migration phase and existing project mini-chat contracts. Missing components become explicitly tracked dependencies and are never silently simulated as deployed infrastructure.

## 3. Architecture

```text
User / Research Project / Research Mini App / Project-scoped Chat
       │
       ▼
Scientific Product API + RBAC/ABAC + Research Policy Gateway
       │
       ├── Literature & Evidence Service ── Retrieval (229) ── Vectorize
       ├── Hypothesis + Study Protocol Registry ─────────────── PostgreSQL
       ├── Experiment Plan / Scientific Verification Service ─── PostgreSQL
       ├── Evidence & Provenance Service ─────────────────────── PostgreSQL + R2
       └── Scientific Workflow Node Pack ── Workflow Runtime (209/215)
                                                │
                                        Existing approvals
                                                │
                                     Existing worker_jobs + outbox
                                                │
                          Scientific Tool Adapter / Sandbox / Runner
                                                │
                                 R2 artifacts + provenance events
                                                │
                        Independent verifier + human sign-off + reports
```

The scientific service provides **domain entities and policy checks**; it does not own workflow scheduling, durable agent state, user identity, payment, or alerts. R2 objects are immutable by version/digest where required, but logical project records remain editable through appended versions.

### 3.1 Scientific adapter capability manifest

Each tool is registered through existing MCP/External Agent/Capability Registry with additional scientific descriptors:

```json
{
  "tool_id": "python-statistics",
  "tool_version": "1.0.0",
  "interface": "mcp|a2a|container|managed_api|lab_readonly",
  "science_domains": ["statistics", "machine_learning"],
  "input_schema_ref": "sha256:...",
  "output_schema_ref": "sha256:...",
  "software_image_digest": "sha256:...",
  "network_policy": "deny_by_default",
  "resource_limits": {"cpu": 2, "memory_mb": 4096, "timeout_seconds": 1800},
  "data_classification_max": "internal",
  "risk_class": "computational_low",
  "required_approval": "project_operator",
  "billing_meter": "cpu_seconds",
  "evidence_export": ["stdout", "stderr", "environment_lock", "artifact_hashes"]
}
```

Every manifest is immutable per version, attested where supported, administratively reviewed for high-risk capabilities and bound to an allowlist of projects/tenants. The runtime must reject unregistered tool versions, schema mismatches, forged capability claims, unapproved network egress and attempts to use broader privileges than the approved run.

### 3.2 Initial adapter strategy

- **MVP:** sandboxed Python (NumPy/SciPy/pandas, subject to license and version pinning), R2 datasets, existing code-runner integration, notebook import/export.
- **Phase 2:** Jupyter execution adapter; Nextflow for pipelines, AiiDA for provenance-capable computational workflows, MLflow for tracking **as optional interoperability**. Evaluate and map metadata rather than making all three mandatory dependencies.
- **Phase 3:** HPC/Slurm-like job bridges or external compute services, then read-only ELN/LIMS; physical equipment controls require separate safety certification and signed project authorization.
- Never run arbitrary researcher-supplied code inside the Cloudflare Worker isolate. Use an isolated execution environment with CPU/memory/storage/time/network limits, explicit image pinning and controlled artifact egress.

### 3.3 Scientific capability admission and independent-review separation (R1.2)

Every scientific adapter MUST declare `(tenant/project allowlist, domain-risk tier, intended purpose, required dataset classifications, network/egress domains, compute envelope, output evidence schema, approval semantics, software supply-chain digest and revocation policy)` in its versioned manifest. Accept only the intersection of project policy, current user entitlement and registered tool capability. A science-domain label returned by an external agent does not widen this intersection. Tool discovery is read-only; executable capability must pass a separately trusted admission gate.

The actor that generated a result MUST NOT be the sole authority to certify that result as independently reproduced. Store distinct `producer_actor`, `verifier_actor`, `reviewer_actor`, `review_scope`, `verified_snapshot_digest` and declared independence limitations. Separate reviewer-role authority from tool execution and from mere access to raw data. High-risk/irreversible actions are not exposed through GenUI or research chat simply because an agent proposed them.

## 4. Domain model and storage

### 4.1 Canonical entities

| Entity | Required properties / relations |
|---|---|
| `research_projects` | tenant_id, project_id, owner, purpose, domain, visibility, data policy, risk profile, current protocol |
| `research_sources` | source_id, DOI/URL if present, publisher, publication/version, license, retrieval timestamp, fulltext access status, immutable snapshot digest, retraction/correction status |
| `research_evidence` | source spans/locator, extraction method, source version and identity, evidence quality, human-vs-model attribution, supporting/contradicting status, access/license/consent scope and downstream dependencies |
| `research_hypotheses` | version, question, proposed mechanism, testable predictions, assumptions, falsification criteria, links to supporting/opposing evidence |
| `study_protocols` | immutable version/digest, controls, assignment/randomization where relevant, sample-size rationale, primary/secondary endpoints, estimand/analysis plan, missing-data and multiple-testing plan, planned exclusions, ethical approvals and preregistration timestamp/reference (when applicable) |
| `research_experiments` | protocol digest, exact parameters/seed, input manifest, tool and executor image digests, dataset split/lineage, resource/hardware metadata, preapproved tolerance/budget/egress envelope, approval epoch and canonical job_id |
| `experiment_artifacts` | R2 versioned object key, SHA-256, content type, data class, retention/legal hold and acquisition method |
| `experiment_observations` | input/output mapping, timestamp, units, calibration metadata if applicable, raw vs transformed status |
| `verification_reports` | distinct verifier identity and independence declaration, tested immutable snapshot, independent environment, preapproved tolerance/test plan, rerun evidence, discrepancies, statistical findings, severity and signed disposition |
| `research_claims` | statement, evidence edges, claim_state, confidence **as calibrated assessment only**, limitations, review and publication status |
| `provenance_nodes/edges` | W3C PROV-mappable Entity/Activity/Agent relationships, source and integrity digests |
| `research_exports` | report, version-pinned RO-Crate manifest when permitted, restricted-byte exclusion manifest, citation/license metadata, content digests, recipient/expiry and signed release policy |

**Canonical identifiers:** use tenant-scoped UUID/ULID or current project ID conventions; all cross-entity foreign keys enforce tenant scope and project access. Include immutable `created_at`, creator agent/human identity, valid-time/transaction-time or append-only event history where necessary. Dataset deletions follow retention, consent withdrawal and legal hold policy; never promise unconditional erasure where law or institutional obligations prohibit it.

### 4.2 Persistence placement

- **PostgreSQL:** authoritative relational records, state transitions, evidence links, signed dispositions, R2 pointers, ACLs, approvals and financial references.
- **R2:** raw/processed datasets, notebooks, code, lockfiles, stdout/stderr, generated reports and export packages; object version ID + content hash + tenant/project prefix + server-side authorization.
- **Vectorize:** chunk/embedding index for permitted sources, project-index filtering, authorization verified *again after retrieval*. On removal/revocation, issue tombstone + async index purge; fail closed on stale index versions.
- **Existing Redis/queue or future Cloudflare Queues:** ephemeral dispatch only; no sole record of experiment decisions.
- **Optional knowledge graph:** start with relational edges and graph traversal queries; do not add an operational graph database until measured workload justifies it.

### 4.3 Provenance and research-object interoperability

Map **Agent, Activity, Entity** and derivation to W3C PROV. Maintain machine-readable input/output hashes, source licenses, tool/container image digest, environment lock, parameter set, random seeds, timestamps, approval chain, analysis code and the exact report version. Evaluate RO-Crate for portable research bundles with schema/version validation. Import/export must declare any mapping loss; an incomplete chain visibly reduces reproducibility status.

### 4.4 Evidence intake, retraction propagation and purpose-limited derived data (R1.2)

- Build an intake ledger for each source: stable identifier if available (DOI, accession, canonical URL), bibliographic metadata, normalized duplicate group, version/edition, retrieved timestamp, source identity confidence, license/allowed usage, eligibility decision, quote/extraction spans and correction/retraction checks. **Never fabricate a DOI, paper, citation locator or an accessible full-text license.** If evidence is unverifiable or a full-text source is inaccessible, retain metadata and explicitly mark limitations.
- Evidence screening supports inclusion/exclusion reasons, contradictory and null findings, duplicate reports of the same underlying dataset, human adjudication on conflicts and an append-only screening history. A citation retrieved through Vectorize is a *candidate*: check the authoritative PostgreSQL source version, access, exact passage/locator and retraction/correction state before asserting it.
- Maintain a dependency index from `source_version/dataset_version/derived_summary` → evidence → hypothesis → protocol/experiment → claim → GenUI snapshot/report/published Mini App. On source withdrawal/retraction, license expiration, consent withdrawal or ACL revocation, **atomically block new authoritative reads/releases**, mark affected descendants `REVIEW_REQUIRED`/`WITHDRAWN_PENDING_REVIEW` as appropriate, queue idempotent impact analysis and invalidate affected caches/surfaces/index references. Historical records are preserved or deleted according to lawful retention and tenant policy; never silently rewrite an immutable experimental snapshot.
- Derived analyses, AI summaries, embeddings, statistics and charts inherit appropriate classification, purpose, consent and provenance from their inputs; do not treat aggregation or a newly generated surface as automatic declassification. Export/share/LLM-provider routing requires current recipient, purpose, provider-region and field/row authorization checks. Restricted source bytes may be omitted from portable bundles while preserving authorized redacted provenance.

### 4.5 FAIR identifiers and portable research packages (R1.2)

Assign persistent globally resolvable identifiers only when actually registered/eligible (e.g. a verified DOI); otherwise use stable tenant/project-scoped identifiers and explicitly distinguish them from public persistent identifiers. Record dataset schema, column definitions, units/UCUM or domain vocabulary, missing-value conventions, licenses, collection/calibration metadata and access method. Version RO-Crate export against a pinned compatible release (verify the **1.3** specification and conformance tooling at implementation), include W3C PROV-mappable lineage and schema-valid `ro-crate-metadata.json`, plus signed checksums for included artifacts. For inaccessible third-party assets, export allowed metadata, access instructions and content-hash if legally held; never bundle restricted data by default.

## 5. End-to-end workflow and lifecycle

1. `PROJECT_CREATED`: choose domain, privacy, members, data sensitivity and allowed tools.
2. `RESEARCH_SCOPED`: user defines objective, inclusion/exclusion criteria, budget and stopping condition.
3. `EVIDENCE_GATHERED`: fetch licensed/public literature, record source/version, detect duplicates and contradictions, flag corrections/retractions.
4. `HYPOTHESES_PROPOSED`: generated hypotheses are explicitly marked AI-generated and linked to evidence; user edits/accepts a version.
5. `PROTOCOL_DRAFTED`: preregister analysis plan where relevant, define endpoint/controls/sample-size or explain limitations.
6. `PROTOCOL_APPROVED`: human authorizer signs an immutable protocol hash and risk-sensitive approval. Approval is **not** inherited after materially changing protocol or tool permissions.
7. `EXPERIMENT_QUEUED/RUNNING`: submit through existing workflow + job control, using idempotency key and lease fencing; stage inputs after permission and integrity checks.
8. `OUTPUTS_QUARANTINED`: ingest artifacts with hashes, provenance and malware/format policy scanning; no automatic citation as verified evidence.
9. `COMPUTATION_VERIFIED`: deterministic tests, independent recomputation where possible, statistical and contamination/leakage review.
10. `SCIENTIFICALLY_REVIEWED`: qualified human verifies interpretation, limitations, conflicts and readiness for disclosure/publication.
11. `CLAIM_REGISTERED`: store claim state and evidence version; allow negative/null results, rejected hypotheses and contradictory findings.
12. `ITERATION_PROPOSED`: AI proposes next experiment linked to prior outcomes; new protocol/budget/approval required before execution.

**Orthogonal states (do not conflate):** execution (`DRAFT → APPROVED → QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELED | EXPIRED`), verification (`NOT_STARTED → IN_PROGRESS → PASSED | FAILED | INCONCLUSIVE`), scientific claim (`HYPOTHESIS → PRELIMINARY → CORROBORATED | REFUTED | INCONCLUSIVE | RETRACTED`), and public-release (`PRIVATE → READY_FOR_REVIEW → APPROVED_FOR_RELEASE → PUBLISHED | WITHDRAWN`). A successful job cannot automatically transition a claim to CORROBORATED or a report to PUBLISHED.

**Protocol change control (R1.2):** approval binds a canonical digest of the entire protocol, input dataset/split, endpoint/analysis plan, tool/image, spend envelope, scientific risk and authorization epoch. Material changes (including source license/consent, dataset revision, outcome definition, trial assignment, analysis or tool privileges) fork a **new** version and require renewed approvals. Minor presentation edits produce only a new Spec 240 surface revision. Keep a preregistered vs performed-analysis deviation ledger; exploratory post-hoc findings are explicitly labeled and cannot silently replace preregistered hypotheses. Define stop criteria for the research loop and require human review before additional resource-consuming iterations.

**Non-terminal recovery (R1.2):** `EXPERIMENT_QUEUED`, `RUNNING`, provider `UNKNOWN`, `OUTPUTS_QUARANTINED`, `VERIFICATION_PENDING` and `CLAIM_REVIEW_REQUIRED` are orthogonal domain projections over canonical job/approval/events, not a second physical-job state machine. A provider timeout or job lease expiry MUST NOT imply that an external experiment did not run; reconcile provider receipts/artifact digests before any new submission and account for non-idempotent external side effects.

### 5.1 Chat and research sub-agents

Use existing chat / project memory / research iteration capabilities. Suggested role-specific agents: Literature Scout, Evidence Critic, Hypothesis Generator, Methodology Designer, Statistical Reviewer, Reproducibility Reviewer, Science Reporter. They are **logical capabilities and bounded workflow roles**, not additional scheduler instances. The mini chat sees only explicitly authorized project sources, experiment outputs and enabled public literature; automatic project inference and cross-scope memory follow Spec 241 when actually deployed, while Spec 233 is the project-memory content owner; ambiguous or unavailable resolution requires a scoped manual selector and must not fall back to global memory; it cannot import another project via prompt, invented project ID, vector cross-scope result or tool-call injection. All factual claims in chat show source passages or are labeled speculative.

### 5.2 Failure and durable recovery

Persist every transition via canonical job/event outbox; use idempotency (`tenant/project/protocol-version/experiment-key`), compare-and-set state changes, lease epoch/fencing, bounded exponential retry and dead-letter triage. Recovery reconciles provider jobs and R2 artifacts; orphaned outputs are quarantined and never attached to another tenant/run. Human approvals survive disconnect/restart; resumed runs **revalidate** approval epoch, policy, budget and dataset permissions. Cancel means cancel request and eventual observed terminal status, not a fabricated immediate termination.

### 5.3 Atomic ingest, reconciliation and lifecycle failure windows (R1.2)

For `(tenant, project, experiment, protocolDigest, attempt)` persist an immutable intent/idempotency record, budget reservation and authoritative job request before external dispatch. Use the existing transactional outbox and canonical scheduler; on ambiguous dispatch consult a provider idempotency token/status or explicitly mark `EXTERNAL_OUTCOME_UNKNOWN` and escalate rather than blind retry. Upload output as quarantined R2 staging objects, compute size/hash/malware and schema checks, then attach the immutable manifest to the experiment through compare-and-set; stale workers/providers cannot overwrite newer attempts. Reconcile callback-before-DB-commit, crash-after-provider-accept, duplicate callback, partial R2 upload, cancellation race, lost lease, credit settlement timeout and post-approval revocation. Terminal state must derive from observed canonical job/provider evidence. Retain failed/negative results and provenance subject to policy, even when an experiment is not scientifically usable.

## 6. Scientific verification contract

Each reported result receives a **verification vector**, not a misleading single score:

- **Integrity:** hashes, identity, schema and provenance completeness.
- **Computational:** code/tests, frozen environment, rerun agreement within prespecified tolerance.
- **Statistical:** preregistered endpoints if applicable; statistical power/uncertainty, effect size/intervals, multiple testing, missing data, leakage, sensitivity and negative results.
- **Methodological:** controls, confounders, blinding where relevant, instrument limits, protocol deviations.
- **External:** independent dataset, external replication or physical-laboratory corroboration where available.
- **Human review:** reviewer identity, scope and sign-off; disagreements and limitations retained.

A `verification_report` states applicable checks, `PASS / FAIL / INCONCLUSIVE / NOT_APPLICABLE`, evidence references, rerun environment, discrepancies and unresolved limitations. Never turn an LLM self-review into independent verification. An independent verifier cannot sign the same check using identical mutable working context without declared independence limitations. Automated statistical checks are advisory unless the protocol establishes them as valid for the study.

**Claim gate:** a paper/report can describe a preliminary result without marking it scientifically corroborated; expose confidence as documented uncertainty or calibrated model output, not an arbitrary 0–100 truth score. Retractions and upstream source corrections trigger downstream impact analysis and notification.

### 6.1 Scientific decision policy and non-deterministic computation (R1.2)

Before approving an experiment, define: primary endpoint/estimand, control/baseline, unit conventions, expected noise, exclusion/missing-data criteria, significance or decision threshold **if relevant**, multiple-comparison correction, data split/leakage controls, exploratory vs confirmatory labels and a protocol-specific reproducibility tolerance. Require statistical-method reviewer sign-off when methodology exceeds the selected domain-pack capability. No single generic `PASS` threshold applies across domains; `NOT_APPLICABLE` requires a documented rationale.

Capture runtime hardware architecture, accelerator and driver versions when they materially affect results, deterministic flags, source/dependency lockfiles, random seeds, dataset snapshot/digest, numeric precision and known nondeterministic operations. For nondeterministic GPU/stochastic work, compare a prespecified distribution or repeated-run tolerance, not an unconditional bit-for-bit hash. A rerun on the same immutable inputs/toolchain validates computational repeatability; **independent corroboration** requires separately justified methods, data or execution independence and must record limitations. A verifier must compare raw result evidence, not merely rephrase the producer LLM's conclusion. Report failed replication, null results and unplanned analysis transparently.

### 6.2 Scientific claims, disagreement and downstream validity (R1.2)

Keep computational repeatability, statistical checks, methodology review, external replication, human release sign-off and scientific claim status separately. Permit `REVIEW_REQUIRED`, `SUPERSEDED` and `WITHDRAWN` as explicit orthogonal report/evidence validity flags rather than silently overwriting historical claim state. An AI-generated literature synthesis never certifies that an experiment has been performed. Publication or marketplace previews must show source revisions, applicable checks, limitations, conflicts, and the date and actor of release. Any stale source, protocol mismatch, reviewer revocation or suspected data contamination disables a previously minted GenUI publish/export action until re-evaluated.

## 7. Security, safety, ethics and privacy

### 7.1 Controls

- Enforce tenant/project ABAC at API, vector metadata filters **and post-retrieval**, signed R2 URLs, agent-tool boundary, exports and audit queries. Add authorization regression tests for direct-object references, stale permissions and forged project context.
- Risk-tier each project/tool: `LOW_COMPUTATIONAL`, `RESTRICTED_DATA`, `SENSITIVE_DOMAIN`, `PHYSICAL_LAB`. Tier controls connector approval and available execution environments; no unrestricted escalation by users or agents.
- Secret broker handles short-lived scoped credentials; never place secrets in notebooks, agent prompts, logs, provenance exports or R2 user-visible manifests. Scrub execution output; rotate on exposure.
- Deny arbitrary internet ingress/egress in compute by default; dependencies from approved registries with pinned versions and vulnerability/license review. Restrict shell/filesystem privileges; no privileged containers.
- Detect malicious instructions embedded in PDFs, websites, datasets and tool responses. Retrieved text is evidence **data**, not an instruction source. High-impact actions require explicit authorization.
- Respect publication copyrights and licenses, dataset terms, personal-data consent, retention and geographical/institutional requirements. Restricted datasets must not leak into public mini apps, previews or cross-tenant telemetry.
- Biological/chemical/clinical/physical-lab connectors are disabled by default; institutional validation, biosafety/chemical safety, IRB/ethics review and competent human operators apply where relevant. AI may prepare documents or analyze data but cannot bypass these processes.
- Scientific integrity: maintain authorship attribution, conflicts of interest, protocol deviations, selective-reporting warnings, provenance of AI contributions and correction/retraction workflow.

### 7.2 Threat-model acceptance scenarios

Cross-tenant vector match; prompt-injection document requesting credential exfiltration; malicious notebook abusing egress; tampered input or image digest; unauthorized equipment action; stale approval replay; duplicate experiment charge; signed URL leaked across projects; retracted source affecting claims; unauthorized dataset export; malicious tool output forging verification; stalled run recovery with old lease. Each scenario requires automated deny/recovery evidence before release.

### 7.3 Research-data controls and laboratory hard stop (R1.2)

Classify data at ingestion and **derive** effective classification on each transformation; private project identifiers inside prompt, charts, logs, tool schemas, Mini App preview URLs and assistant summary are protected data. Every cross-provider/model and geographic egress path requires tenant-approved purposes, allowed locations, network egress and a revocable audit receipt. A dataset owner may permit analysis while forbidding export, external inference, template publication and training; these are separate permissions. Data tombstones take effect on authoritative reads immediately even if Vectorize/R2/cache cleanup is asynchronous. Periodic scrub verifies orphaned R2 staging objects, revoked signed links, erased cache entries and retention/legal-hold conflicts.

The MVP MUST have **no discoverable executable physical-equipment command surface**: physical connectors absent or read-only and separately authenticated; deny all tool namespace aliases that could reach hazardous lab actions indirectly. Future lab integration requires institution-owned procedures, equipment emergency-stop verification, calibration/chain-of-custody, human operator approval and an explicit independent release/certification decision; ordinary project-owner or platform-admin permission is insufficient.

## 8. User interface and API

### 8.1 UI decision: Chat-first, Workspace-backed, Spec-240-rendered

**Do not implement ten new standalone pages or a second scientific UI generator.** Keep a minimal stable **Research Workspace shell** (project selector/permissions, project lifecycle, navigation, scoped chat, current jobs and budgets, trusted approval entry point and export history). The existing first-party Chat is a valid research entry point; an authorized research Mini App may also launch directly without a general Chat session, according to Spec 240/216/225 and the actual deployed host contracts.

| UI concern | Canonical owner / implementation |
|---|---|
| Conversational research entry and optional project-scoped Mini Chat | Feature 196 / existing Chat; Spec 241 + actual memory/ACL contracts provide scoped context; do not create another research-agent session authority |
| Persistent project navigation, dataset access management, status and budget shell | Existing first-party host plus **small Spec 246 research-domain shell** backed by server-authoritative project APIs |
| Literature & Evidence Board; Hypothesis Canvas | **Spec 240 GenUI** surfaces over Spec 246 typed evidence/hypothesis results; reusable approved templates optional |
| Experiment Designer (typed variables/controls/statistical plan) | Spec 246 supplies schema, scientific validators, protocol state and immutable snapshot; **Spec 240** renders safe forms and local drafts; commit via existing governed command APIs |
| Workflow Graph / Run Console | Reuse Spec 209/215 builder and canonical job-console views; Spec 240 may display task-specific summaries, but cannot maintain a second workflow graph or execution state |
| Results & Verification (tables, charts, uncertainty, comparison) | Spec 246 supplies authoritative data and independent verification status; **Spec 240** builds accessible interactive surfaces; no new chart/table/component framework |
| Provenance Explorer; Research Report | Spec 246 supplies source/experiment/evidence lineage and export semantics; **Spec 240** presents them using vetted graph/table/report components or accessible fallbacks |
| Approval, publication, billable/irreversible actions | **Trusted existing host** (Specs 220/225/226 and current approval gateway), never agent-authored approval widgets or an inferred permission from a generated button |
| Admin Research Monitor | Existing admin monitoring/alert shell + scoped scientific status projections; sensitive raw research data inaccessible by default |

The ten previously identified capabilities are **task surfaces inside Chat, a Research Workspace, or an authorized Research Mini App**, generated on demand when supported and optionally pinned as a reviewed template. A chart produced for one experiment need not become a permanent product page. Context switching (Chat ↔ Workspace ↔ Mini App) preserves the scientific project/run reference and provenance but creates a **fresh authorized host binding**; no cross-project data or permissions are copied implicitly.

**Mobile/tablet:** default to conversational entry, compact status cards, accessible evidence/result tables, trusted approvals and exports. Larger graph editing may remain desktop-first. All essential scientific states, errors, uncertainty and source citations remain accessible without graph rendering. WCAG 2.2 AA and Thai/English support are targets inherited from shared rendering and host contracts.

### 8.1.1 Scientific result → Spec 240 GenUI adapter (new in 246)

Provide a versioned, **read-only domain-to-presentation adapter** that converts authorized research-domain query/experiment outputs to Spec 240's current normalized `GeneratedSurfaceEnvelope` or its actual deployed equivalent. The following **illustrative scientific payload** is not a replacement for the Spec 240 envelope:

```json
{
  "schema": "smartaihub.scientific-result.v1",
  "domainRefs": {
    "projectRef": "opaque-authorized-project-ref",
    "experimentRef": "opaque-experiment-ref",
    "scientificSnapshotRef": "immutable-snapshot-ref"
  },
  "scientificStates": {
    "execution": "SUCCEEDED",
    "verification": "INCONCLUSIVE",
    "claim": "PRELIMINARY",
    "release": "PRIVATE"
  },
  "evidenceRefs": ["authorized-source-version-ref"],
  "dataRefs": ["authorized-dataset-or-result-ref"],
  "presentationHints": ["comparison_table", "uncertainty_chart", "citation_cards"],
  "proposedActionIntents": ["request_independent_rerun", "export_read_only_report"]
}
```

- **Server-stamped scope:** never trust the model to supply `tenantId`, `principalId`, `projectId`, experiment ACLs, verified flags or approval status. The server resolves domain refs and current permissions before issuing the Spec 240 envelope. Presentation hints are untrusted suggestions, **not** component/action grants.
- **Scientific correctness:** chart data/units/axes/error bars/statistical summaries must derive from versioned authoritative data and verified transformations, never regenerated from AI prose. A successful job is not independent verification; a surface must not upgrade `INCONCLUSIVE`/`PRELIMINARY` to `PASSED`/`CORROBORATED`. Label simulated vs observed measurements, retractions, missing controls, uncertainty and stale data.
- **Separate revision controls:** Spec 240 owns `surfaceRevision`, template lifecycle and stream-patch protocol. Spec 246 owns immutable experiment/data/protocol versions and claim/verification transitions. Re-rendering a surface is not re-running an experiment, changing a research protocol or charging the experiment twice.
- **Bound actions:** Spec 246 only proposes semantic intents; Spec 240 gets **server-issued** action bindings through the existing Spec 220/226 policy gateway. Execute through existing approvals and canonical `worker_jobs` where required; risk, parameters, actual target and cost are confirmed in host-controlled UI from fresh server state.
- **Resumability and safe fallback:** source-data revocation, device switching, offline/reconnect, missing renderer, unknown component or malformed UI patches cause current ACL re-evaluation and render a deterministic citation-backed text/table/JSON alternative. Never lose authoritative results or accept stale/offline high-consequence approvals.
- **Retention and productization:** pinned surfaces/templates contain approved layout and schema, not raw confidential datasets, long-lived action tokens or implicit release approval. Research Mini Apps/Product distribution follow Specs 216/217 and current marketplace governance; presentation-generation metering follows Spec 207 and cannot double-charge the domain experiment.

### 8.1.2 Deployment-dependent UI gate

Spec 240's latest accessible R0.6 artifact is **design-reviewed but not proven implemented**. Phase 0 must verify its actual status, renderer schema, component manifest, supported hosts, action bindings, secure streaming, accessibility and mobile behavior. Until the required capabilities pass integration and tenant-isolation tests, use current Chat plus existing deterministic typed renderers, server-generated research forms and readable/exportable results. Enable research-specific GenUI behind a feature flag with renderer-only rollback; canonical experiments, approval, evidence and audit proceed independently.

### 8.1.3 Scientific visualization correctness and presentation invariants (R1.2)

The Spec 246 adapter returns **validated typed domain data**, not a precomputed React tree or model-authored executable chart formula. For every numeric series provide `{measureId, unit, unitSystem, dataSnapshotDigest, resultVersion, x/y semantics, missingValuePolicy, transformId/version, uncertaintyDefinition, sampleCount, simulatedVsObserved, verificationRefs}` as applicable. Canonical server computations supply statistical summaries; display-level filtering must not mutate the scientific dataset or create a claim. Chart captions identify sample size, units, denominator, error-bar semantics, missing values and preliminary/inconclusive status. If conversion, transformations or model-planned graph types fail validation, fall back to a semantic table with unchanged authoritative values.

The shared Spec 240 compiler/renderer is responsible for responsive surfaces, revisions and accessibility. Spec 246 **only** supplies permitted presentation intents, scientific schemas, domain validators and per-result factual assertion checks. Streaming or offline replay must compare scientific data and claim revisions before applying patches; after a retraction or revoked role, replace an affected surface with a truthful stale/withdrawn indicator and remove bindings. **No publication/approval controls in generated component trees**; the trusted host must show latest canonical risk, immutable protocol digest, actual run target, cost and signer. A research result shown in an independent Mini App is reauthorized under that run's effective scope, never copied with the source Chat's bearer permissions.

### 8.1.4 Minimal stable UI vs conditional dynamic UI (R1.2)

**Stable, domain-owned shell:** project and member selector (no ambiguous inferred project auto-attachment), timeline/status, budget and consent summary, explicit provenance/citation viewer, immutable protocol and reviewer disposition viewer, and trusted `Approve / Rerun / Publish / Withdraw` entry points *only if existing action registry authorizes them*. Reuse existing host/navigation and workflow monitor rather than rebuilding the dashboard. **Generated by 240 when certified:** evidence comparison, exploratory hypothesis canvas, experiment charts, cross-run result tables, citation cards and optional protocol-form projections (validated and committed by 246). **Fallback:** deterministic accessible table/form/read-only export with source/version/uncertainty labels if 240 is incomplete, disabled or fails. The MVP does not depend on a UI LLM's availability.

### 8.2 Proposed API extension (adapt to current route conventions)

```text
POST   /api/research/projects
GET    /api/research/projects/{project_id}
POST   /api/research/projects/{project_id}/sources/ingest
GET    /api/research/projects/{project_id}/evidence?query=...
POST   /api/research/projects/{project_id}/hypotheses
POST   /api/research/projects/{project_id}/protocols
POST   /api/research/projects/{project_id}/protocols/{version}/approval-request
POST   /api/research/projects/{project_id}/experiments
POST   /api/research/experiments/{id}/execute
POST   /api/research/experiments/{id}/cancel
GET    /api/research/experiments/{id}/provenance
POST   /api/research/experiments/{id}/verify
GET    /api/research/projects/{project_id}/claims
POST   /api/research/projects/{project_id}/exports
GET    /api/research/projects/{project_id}/audit
```

Use existing authentication/approval/job APIs behind routes. Mutations require version preconditions (`If-Match` or equivalent), idempotency keys where applicable, tenant and project authorizations, rate limits and stable audit correlation IDs. Return opaque job IDs from canonical job control; emit versioned events (`research.protocol.approved.v1`, `research.experiment.completed.v1`, `research.verification.failed.v1`, `research.claim.retracted.v1`) through the **existing** outbox. Specify pagination, error schema and event ordering in implementation contracts; avoid inventing a second pub/sub delivery guarantee.

## 9. Scientific workflow node pack and mini apps

Proposed **additive** node types for Spec 214 integration: `ResearchQuestion`, `LiteratureSearch`, `EvidenceScreen`, `CitationVerify`, `HypothesisPropose`, `HypothesisCritique`, `StudyDesign`, `RiskPolicyGate`, `HumanProtocolApproval`, `DatasetSnapshot`, `ScientificToolInvoke`, `SimulationRun`, `StatisticalAnalyze`, `ProvenanceCapture`, `IndependentRerun`, `MethodologyReview`, `ClaimRegister`, `ResearchReport`, `ResearchIteration`, `ControlledPublish`. Map to existing generic nodes wherever semantics/authorization match; only introduce types when domain-specific schema or verification gates genuinely require them.

Versioned starter templates / Marketplace extensions (illustrative catalog, **not** a claim about existing Spec 212 ID availability):

| Proposed template key | Use case | Execution tier | Required verification |
|---|---|---|---|
| SCI-LIT-001 | Systematic literature mapping and contradiction board | Retrieval only | Citation/source review |
| SCI-ML-002 | Reproducible ML benchmark on permitted dataset | Computational | Leakage check and independent rerun |
| SCI-ENV-003 | Environmental time-series hypothesis test | Computational | Statistical review and dataset lineage |
| SCI-MAT-004 | Materials-properties dataset exploration | Computational | Unit validation and out-of-sample assessment |
| SCI-STAT-005 | Reproduce analysis from published methods | Computational | Environment, data-access and result comparison |
| SCI-META-006 | Evidence synthesis and limitations report | Retrieval + analysis | Source selection and statistical review where applicable |
| SCI-LAB-007 | Read-only instrument-result review (future) | Physical-lab data, read-only | Operator attestation and calibration provenance |
| SCI-ITER-008 | AI proposes next computational experiment | Planning only | New budget/protocol approval before run |

Marketplace publication: dependency/license/security scan; schema and pricing preview; dataset entitlements; explicit provenance and verification capabilities; review process; template pinning and safe migration; isolation of creator analytics from consumer research data. Public mini apps may use only public/synthetic/sample datasets by default. Creator royalties use existing three-party revenue-sharing contracts rather than a new payout engine.

## 10. Cost control, quotas and operating model

Estimate before approval: source licensing, retrieval, LLM tokens, storage, CPU/GPU/HPC duration, external API calls, verification reruns and egress. Set per-experiment and per-project **hard budgets**, concurrency, maximum iterations, compute time, artifact size and daily tenant cap. Charge via existing credits/wallet from metered verified consumption; reserve before paid execution; reconcile on cancel/retry/idempotent duplicate and refund according to existing wallet policy. Any proposal above cap waits for explicit approval and cannot split itself into smaller jobs to evade quota.

Cloudflare Worker handles API/control-plane only. Long-running scientific compute executes in bounded managed containers/runners/external HPC; async result ingest survives provider outages. Store cost attribution by tenant/project/run/tool/model; warn before budget exhaustion. Cache only identical, license-permitted, tenant-safe artifacts whose input+tool+environment+permission hashes match. Never treat cached output as new independent replication.

### 10.1 Budget enforcement and cache-safe research iteration (R1.2)

Maintain an additive project-wide **aggregate reserved + committed + uncertain-external-cost** accounting view from the existing Spec 207 wallet/ledger rather than a new balance authority. An experiment budget comprises the entire iteration graph, child jobs, retries, optional independent reruns, provider requests, storage and egress, not just the top-level Python step. Reserve estimated worst-case spend before dispatch; block when available credit or project cap is insufficient; on provider-unknown state conservatively hold unsettled funds until reconciliation. Budget increases require an authorized new version/approval. Maintain visible estimate vs measured vs uncertain costs; avoid falsely promising exact cost before HPC jobs finish.

Caching must include tool/container digest, exact dataset/source version and license, parameters, environment/hardware where material, principal purpose and scope, verification policy and relevant revocation epoch. Cache reuse carries original lineage and must not increment independent-replication count, fabricate new evidence or circumvent data deletion. Low-cost GenUI regeneration and interactive filtering remain separate billable decisions from execution; never charge for the same `worker_job` twice.

## 11. Observability, SLO and governance

Track research pipeline completion and stage latency, claim citation coverage, protocol approval latency, reproducibility rerun success, artifact/provenance completeness, policy-denied actions, sandbox security events, stale-index misses, reviewer backlog, budget forecast accuracy and cost/run. Telemetry uses redacted run IDs and technical metrics; no raw research data by default. Proposed initial SLOs to validate with real workload: control API 99.9% monthly availability; 100% of approved run transitions auditable; zero accepted cross-tenant authorization escapes; 100% of claims published via product require explicit release sign-off and evidence mapping; 100% of computational runs retain manifest/hash even on failure (or flag irrecoverable evidence loss). Define incident severity, containment, rollback and reviewer escalation in the current platform incident-management integration.

### 11.1 Operability, portability and cutover proof (R1.2)

Define observable stage/run identifiers and redacted correlation from request → shared workflow → `worker_jobs` → provider → R2 manifest → verification → shared GenUI surface, without copying confidential research content into telemetry. Track `EXTERNAL_OUTCOME_UNKNOWN`, orphaned staging objects, stale evidence index, source-withdrawal queue delay, expired release bindings and partial export errors. Define operational owners for security incident, disputed scientific interpretation, source-retraction response, data-subject request and wallet reconciliation; scientific disputes are not automatically platform outages.

The Debian→Cloudflare transition must not alter experiment hashes, canonical approval/job ownership or immutable R2 references. Use dual-read/shadow checks **without double execution or billing**, replayable outbox projections, versioned API contracts, per-tenant rollout and rollback to existing deterministic UI. Backup/restore drills restore PostgreSQL scientific relations and verify R2 manifests/Vectorize rebuild against authorization tombstones. Explicitly document provider data-location and managed-postgres/Hyperdrive suitability at Phase 0; do not make a planned provider a currently deployed fact.

## 12. Delivery plan and exact gates

### Phase 0 — Current-state discovery and interface compatibility (**mandatory**)

- Locate canonical spec registry, deployed contracts for 186/196/199/200/209/212/214/215/**240**/224/229/231/233/238/241/242/243/244/245, existing project chat and permissions, runner/job APIs, managed PostgreSQL migration and R2/Vectorize indexing. Confirm source-provenance, release-approval, retention and provider-region contracts before schema design.
- Produce `compatibility-matrix.md`: deployed / in progress / planned / absent; exact route/event/schema owners; no retroactive edits to specs 1–213 or 224.
- Check if **246** is available in canonical registry. If occupied, renumber only this new spec.
- Threat model and data classification; choose one bounded computational scientific domain for pilot.
- Exit gate: approved contract mapping, project auth matrix, budget model, evidence/verification semantics, source-retention and taint-propagation matrix, 233/241 memory ownership resolution, verified candidate RO-Crate 1.3 tooling and explicit Spec 240 capability matrix (implemented / in progress / design-only) with fallback decision.

### Phase 1 — Research and evidence MVP

- Minimal Research Workspace shell + existing Chat, authorized citation metadata/source-version capture, licensed ingestion and chunk-level retrieval, hypothesis registry, project-scoped copilot, R2 artifact snapshots and relational provenance graph; add Spec 240 generated evidence/hypothesis surfaces only if certified, else deterministic rendering.
- Exit gate: independent citation reviewer validates grounding; tests prove no cross-project/vector/R2 leakage; retraction status is visible; users can export source provenance.

### Phase 2 — Approved computational loop

- Schema-driven protocol editor with **trusted host** approvals, scientific workflow nodes, Python/container adapter, dataset/lockfile snapshots, canonical job outbox + recovery, spend controls, reproducibility verifier and report/export; add typed scientific-result → Spec 240 adapter and cross-host verification when supported.
- Exit gate: golden-path experiment produces valid report + version-pinned RO-Crate manifest; negative/failure/cancel/retry/provider-unknown/crash-window tests pass; predeclared deterministic **and** stochastic rerun tolerances are tested on representative fixtures; independent verifier can reproduce a representative run in a clean environment.

### Phase 3 — Research Mini App vertical and domain packs

- Spec 240/216 versioned **presentation** templates over Spec 246 versioned scientific **workflow** templates, bounded Mini Chat, creator submission/review, opt-in data access, cost accounting and additional scientific domain adapters; preserve published Mini App policy and action-scope versioning.
- Exit gate: marketplace entitlement/royalty compatibility, template version rollback, project isolation and billing-reconciliation tests.

### Phase 4 — Laboratory-in-the-loop (separate go/no-go decision)

- Read-only ELN/LIMS ingestion, operator-confirmed data, calibration metadata, institutional safety policies and domain-specific audit. Any tool capable of controlling equipment requires **separate** product/security/institutional approval and per-action human control.
- Exit gate: institution-owned operating procedure and risk assessment, physical safety review, authorization revocation test, equipment disconnect and emergency-stop strategy (if applicable).

## 13. Production-grade acceptance tests

**Functional**

- AT-01 Researcher creates scoped project, ingests approved papers/datasets, sees exact citation passages and source versions; unlicensed full text is not copied.
- AT-02 Hypothesis links supporting and contradicting evidence; source retraction triggers impact notification and review status.
- AT-03 Approved protocol freezes hash, parameters, tool version, budget and approval scope; changed parameters require reapproval when material.
- AT-04 Controlled Python experiment records dataset/version, seed, environment digest, stdout/stderr, artifact hashes, cost and provenance edges.
- AT-05 Independent rerun explicitly reports match/mismatch/tolerance; failed replication never displays as corroborated discovery.
- AT-06 Report distinguishes AI proposal, preliminary computational result and independently corroborated claim; reviewer controls release.
- AT-07 Project chat cannot retrieve another project, tenant or private creator template dataset, even when prompted with known IDs.
- AT-08 Run cancellation/provider outage preserves real job state, approvals and partial artifacts; job lease fencing prevents stale worker commits.
- AT-09 Duplicate API delivery charges once according to canonical wallet idempotency; hard cost cap cannot be bypassed by retries or recursion.
- AT-10 Public mini app cannot publish protected project data; template rollback and dependency changes are audited.

**Security, resilience and scientific quality**

- AT-11 Prompt injection in retrieved PDF/tool response cannot change tool scopes, exfiltrate secrets or bypass a protocol approval.
- AT-12 Corrupt dataset, mismatched object hash, unpinned image or revoked source permission blocks experiment or flags result as invalid.
- AT-13 Old consent/approval, project removal, source license revocation and stale vector index fail closed at time of access.
- AT-14 Failed statistical assumptions/missing controls yield `INCONCLUSIVE` or `FAILED`, not auto-verified PASS.
- AT-15 Offline/disconnected verifier can independently inspect exported manifest without privileged live database access.
- AT-16 Crash immediately before/after durable approval, provider callback, artifact upload and billing reconciliation is recoverable with no phantom verification.
- AT-17 Logs, alerts, public previews and admin dashboards contain no sensitive raw dataset or secrets by default.
- AT-18 Physical-lab endpoints are absent or disabled in MVP; unapproved action attempts are denied and auditable.
- AT-19 Benchmark on representative pilot dataset documents latency, computation cost, scientific-review burden and reproducibility results.
- AT-20 A human reviewer can reject/withdraw any generated claim and see the exact downstream affected reports/mini apps.

**Spec 240 interoperability (must run against actual deployed contracts when available)**

- AT-21 The same authorized typed scientific result renders with equivalent facts and source/verification labels in Chat, an eligible Research Mini App and accessible text/table fallback; Mini App does not require a general Chat session.
- AT-22 A forged or model-supplied `VERIFIED`, `CORROBORATED`, approval or source citation in presentation hints cannot alter canonical experiment/claim/verification states or impersonate trusted host approval UI.
- AT-23 A user from another tenant/project cannot recover a surface snapshot, saved template input, R2 data pointer or action binding; cross-host/device reopen and revocation recheck current field/row-level permissions.
- AT-24 An experiment result/data version change invalidates stale UI data/action bindings while preserving correct distinct `surfaceRevision`; duplicate/reordered stream patches cannot produce a privileged or factually misleading transition.
- AT-25 A Spec 240 failure, flag-off, unsupported mobile component or revoked source falls back to deterministic readable/exportable results; existing research jobs, approval receipts and provenance remain intact.
- AT-26 Form drafts generated from protocol schema cannot commit invalid units/sample sizes or bypass scientific validation; all material protocol changes after approval trigger existing reapproval semantics.
- AT-27 A read-only Research UI Template is not auto-promoted to an executable or public Mini App; creator opt-in, Spec 216 release/policy review, data classification and Spec 207 idempotent billing are verified.
- AT-28 Rendering a new chart, changing a local filter or reopening a result does not launch a new experiment or charge twice. A deliberate rerun displays trusted target/parameters/budget and generates one canonical job/receipt lineage.

**R1.2 new conformance tests (documented test obligations; NOT executed by this review)**

- AT-29 (ownership): auto project resolution respects Spec 241 when deployed, otherwise ambiguous cases require manual selection; Spec 233 retains project memory, no unscoped fallback or second memory store.
- AT-30 (source integrity): DOI/URL dedup, passage/locator validation, metadata-only inaccessible article and contradictory/negative study fixture reject fabricated citations and unauthorized full text.
- AT-31 (impact graph): corrected/retracted/licensed-out/consent-withdrawn source atomically blocks new reads, invalidates affected derived summaries/GenUI share actions and marks claims/reports/Mini Apps for human review; unrelated projects remain unchanged.
- AT-32 (derived privacy): restricted data transformed into a chart, summary, aggregate or embedding cannot be exported, previewed or sent to an unauthorized model/provider/region by relabeling it as public.
- AT-33 (protocol control): material changes to planned endpoint, dataset split, software image, spend/risk envelope or consent create new immutable protocol version, revoke stale approval bindings and preserve the preregistered-vs-executed deviation record.
- AT-34 (statistical rigor): multiple-testing, missing-data, unbalanced controls, outcome switching and train/test contamination fixtures report invalid/inconclusive rather than manufactured confirmation.
- AT-35 (stochastic repeatability): prespecified tolerance policy and repeated-run distribution pass/fail on nondeterministic hardware are distinct from bitwise reproducibility and from external corroboration.
- AT-36 (export): an offline reader validates schema-pinned RO-Crate 1.3-compatible metadata, digest and permitted W3C PROV mapping; restricted data are excluded or replaced with legitimate access metadata.
- AT-37 (unknown provider outcome): crash after external acceptance, duplicate callback, cancellation race and stale lease reconcile to at most one intended external effect under supported provider idempotency; if unsupported, enter manual hold rather than redispatch.
- AT-38 (staging): failed checksum/format/malware scan or orphan R2 upload never attaches to a trusted experiment; retention cleanup honors legal hold and records a disposal receipt.
- AT-39 (scientific independence): producing agent cannot sign independent verifier disposition; conflicts/dependent tools are disclosed; signed evidence binds an immutable snapshot digest and permits disagreement/rejection.
- AT-40 (tool admission): forged MCP/A2A manifest, unregistered digest or disallowed egress rejects execution; generated UI cannot widen an approved tool scope.
- AT-41 (lab boundary): every physical/equipment-writing connector alias is absent or denied in MVP, including through generic shell/MCP and Mini Apps; future read-only connectors do not inherit control privileges.
- AT-42 (chart truth): unit conversion, denominator, error-bar interpretation, sample size, missing values, observed-vs-simulated labeling and stale dataset versions match canonical server calculations in Chat, Mini App, mobile and fallback.
- AT-43 (GenUI state): out-of-order patch and revoked claim/role/device replay cannot restore stale factual labels, masked data or executable publish/approval bindings; science revisions and surface revisions stay distinct.
- AT-44 (budget lineage): split child jobs, retry, independent rerun and provider-unknown settlement enforce aggregate reserve/spend cap; no duplicate domain or renderer billing and no free bypass via cache.
- AT-45 (cloud cutover): shadow reads, outbox replay, DB recovery/R2 manifest verification and Vectorize tombstone rebuild preserve tenant isolation and canonical job identity with no duplicate execution.
- AT-46 (FAIR): verify stable identifier versus genuine DOI distinction, units/domain vocabulary, metadata/license provenance and restricted-asset references in public/private package fixtures.
- AT-47 (withdrawal): source retraction after a report was published invalidates affected release actions, records consumer notifications when policy requires them and supports reviewed withdraw/correction without deleting lawful audit history.
- AT-48 (release evidence): each high-risk test has a fixture, repo hash, environment, owning reviewer, observed result and rollback evidence; unrun tests remain explicitly NOT_RUN and block their relevant rollout phase.

**Gate policy:** unit + contract + integration + authorization + failure-injection + independent verification are mandatory for Phase 2 GA. A passing happy-path demo alone is insufficient. Every test has a reproducible fixture, owner, test report, environment/commit reference, observed outcome and closure decision; no fabricated passing result.

## 14. Repository deliverables and ownership

Suggested additive file tree; **adjust to current repository conventions found in Phase 0**:

```text
specs/246-ai-scientific-discovery-studio.md
specs/246/compatibility-matrix.md
specs/246/threat-model.md
specs/246/domain-model-and-migrations.md
specs/246/scientific-tool-contracts.json
specs/246/workflow-node-pack.json
specs/246/research-template-catalog.json
specs/246/ui-acceptance.md
specs/246/spec240-scientific-result-adapter-contract.md
specs/246/scientific-methods-and-statistics-policy.md
specs/246/source-retraction-and-derived-data-policy.md
specs/246/reproducibility-and-rocrate-export.md
specs/246/operational-recovery-and-cost-reconciliation.md
specs/246/verification-conformance.md
specs/246/12-round-design-audit-and-test-matrix.md
specs/246/implementation-plan.md
specs/246/golden-path-evidence/README.md
```

The proposed domain-model migrations must be **additive** and reversible where feasible; no destructive migration before tenant-scoped backfill, dry-run and rollback plan. Generate API schemas and event schema contracts from repository-standard tooling. Owner sign-off required from platform architecture, research methodology representative, security/privacy and finance/billing; institutional review joins for laboratory phase.

## 15. Risks, alternatives and explicit decisions

| Risk / trade-off | Decision / mitigation |
|---|---|
| LLM hallucination and fabricated citations | Require source-anchored passages, immutable versions, separate hypothesis and verified findings |
| Multiple orchestration authorities | Existing workflow/job kernel only; scientific layer supplies typed nodes and policies |
| Duplicate UI generator and ten bespoke screens | Spec 240 is the sole generated-surface planner/renderer; 246 supplies scientific schemas and a thin host shell; deterministic fallback until 240 certified |
| Building a giant graph database too early | PostgreSQL relations first, W3C PROV export; graph database only after measured need |
| Research data leakage via embeddings, logs and marketplace | Dual retrieval/post-retrieval ACL, least privilege, tenant-safe telemetry and explicit sharing |
| Scientifically invalid but computationally successful experiment | Distinct execution, statistical/methodological verification and human review states |
| GPU/HPC cost spikes | Hard caps, approved resource envelopes, limited concurrency, independent rerun allocation |
| Complex lab safety | Read-only initial integration and separately governed equipment control in future |
| Connector/API version drift | Pinned immutable manifests, contract tests, staged rollout, rollback |
| Cloudflare migration overlap | Scientific compute as portable execution adapter; no hard dependency on all-in-one migration cutover |
| Source license/retraction changes | Store license terms and source version; propagate withdrawal/retraction impact to claims/reports |

## 16. Research standards and external reference pointers

This document uses the following standards as **design inputs**, not a certification claim:

- W3C PROV-O / PROV-DM — model origin, transformation and attribution: https://www.w3.org/TR/prov-o/
- FAIR Guiding Principles — findable/accessible/interoperable/reusable research metadata and data: https://www.gofair.foundation/fair-principles
- RO-Crate 1.3 — current pinned portable research-object packaging baseline for implementation verification: https://www.researchobject.org/ro-crate/specification/1.3/
- Nextflow — workflow/pipeline optional adapter: https://www.nextflow.io/docs/latest/
- AiiDA — computational science workflows and provenance: https://www.aiida.net/
- MLflow — experiment tracking optional adapter: https://mlflow.org/docs/latest/
- NIH scientific rigor and reproducibility guidance (domain-sensitive): https://grants.nih.gov/policy-and-compliance/policy-topics/reproducibility
- WCAG 2.2 — target accessibility: https://www.w3.org/TR/WCAG22/

Reference versions, licensing terms, actual SDK capabilities, jurisdictional rules and provider pricing **must be checked at implementation time**. Research workflows involving regulated or sensitive subject matter require additional domain-specific standards and legal/institutional review.

## 17. Definition of Done (for MVP GA)

- [ ] Canonical spec number confirmed and Phase-0 compatibility matrix approved.
- [ ] No retroactive edits to Specs 1–213 or in-progress Spec 224.
- [ ] The scientific domain model is tenant-safe, versioned, indexed and auditable.
- [ ] A complete safe computational research workflow is approved, executed, verified and exported.
- [ ] Existing project-scoped Chat (and optional Mini Chat only when deployed) gives citation-backed, project-authorized responses and refuses out-of-scope retrieval; Research Workspace reuses Chat and does not fork Spec 240 UI generation.
- [ ] Every displayed scientific claim visibly distinguishes AI proposal, preliminary findings and independently reviewed evidence.
- [ ] Sources, data, code, hardware context, environment and result hashes map to a reproducibility manifest with version-pinned RO-Crate export, legal source restrictions and a declared reproducibility tolerance.
- [ ] Incident, credential-revocation, immediate ACL tombstone, index-purge, source-retraction/derived-impact, provider-unknown, stochastic reproducibility and aggregate budget-stop procedures have recorded conformance evidence.
- [ ] Functional/security/recovery/scientific acceptance tests AT-01 through AT-48 have recorded results and independent sign-off appropriate to the phase; AT-21–28 and AT-42–43 require deployed Spec 240 for GenUI certification, or remain explicitly gated with tested deterministic fallback if it is not deployed.
- [ ] Runbook, on-call ownership, financial metering, rollback plan and user-facing documentation are delivered.
- [ ] All physical lab-control entry points, aliases and generic-connector workarounds are absent/disabled pending separate institutional and platform review.

## 18. Twelve-pass document audit and closure register (R1.2)

A *pass* means one distinct, complete concern-based review of the R1.1 clauses and their cross-spec consequences. **CLOSED** below means the identified gap was corrected in this R1.2 document; **NOT TESTED** means real repository code, deployment and empirical scientific conformance remain unverified. These are not twelve successful automated integration-test runs.

| Pass | Audited concern | Concrete R1.1 gap | R1.2 correction | Test gate / disposition |
|---|---|---|---|---|
| 01 | Cross-spec ownership | Spec 241 memory was referenced without Spec 233 authority or a fail-closed project-resolution fallback | §2 + §5.1: 233 owns content; 241 owns shared policy/resolution; manual scoped fallback | AT-29 · document CLOSED; runtime NOT TESTED |
| 02 | Literature & evidence | DOI/source identity, duplicate underlying data and inaccessible full text lacked a deterministic intake/adjudication contract | §4.4: source ledger, license and passage checks, negative/contradictory screening | AT-30 · document CLOSED; runtime NOT TESTED |
| 03 | Revocation & derived data | Downstream reports, summary caches, generated UI and published Mini Apps could retain previously valid but withdrawn inputs | §§4.4, 7.3: dependency impact graph, tombstones, classification inheritance | AT-31–32, AT-47 · document CLOSED; runtime NOT TESTED |
| 04 | Protocol scientific rigor | R1.1 froze a protocol but lacked explicit endpoint-switching, post-hoc exploration and expanded change approval criteria | §§4.1, 5, 6.1: immutable digest, deviations, testing plan and renewals | AT-33–34 · document CLOSED; runtime NOT TESTED |
| 05 | Reproducibility | Identical hash/rerun language lacked stochastic hardware, tolerance and independence semantics | §§4.1, 6.1–6.2: deterministic vs stochastic vs independent corroboration | AT-35, AT-39 · document CLOSED; runtime NOT TESTED |
| 06 | Provenance/standards | Package version, genuine persistent-ID policy, metadata units and licensed-asset exclusions were underspecified | §§4.5, 16: version-pinned RO-Crate 1.3 and FAIR/W3C metadata mapping | AT-36, AT-46 · document CLOSED; runtime NOT TESTED |
| 07 | Durable execution | Provider-accepted/response-lost retry, output attachment race and unknown external cost were not operationally specified | §§5.2–5.3, 10.1: transactional intent, quarantine, provider reconciliation | AT-37–38, AT-44 · document CLOSED; runtime NOT TESTED |
| 08 | Capability/security & lab | Registered tool fields insufficiently constrained provider purpose/egress; read-only lab could be bypassed via generic connector | §§3.3, 7.3: admission intersection, signed digest and explicit hard-stop | AT-40–41 · document CLOSED; runtime NOT TESTED |
| 09 | Spec 240 GenUI | Existing scientific payload did not normatively define units, error bars, transformations and stale-surface truth constraints | §§8.1.3–8.1.4: validated numeric metadata, host-owned actions and deterministic fallback | AT-42–43 · document CLOSED; runtime NOT TESTED |
| 10 | Cost/accounting | Per-run cap could be bypassed by child jobs, unknown provider completion or repeated renderer generation | §10.1: aggregate reserved/settled/unknown cost and cache lineage | AT-44 · document CLOSED; runtime NOT TESTED |
| 11 | Migration/operations | No cross-platform recovery proof connecting database, R2, Vectorize tombstones and rollback to running research | §11.1 and Phase 0/2: cutover shadow/rebuild and ownership | AT-45 · document CLOSED; runtime NOT TESTED |
| 12 | Deliverability and acceptance | Some requirements were advisory without executable rejection oracle, provenance of tests or implementation evidence | §§12–14, 17–18: AT-29–48, owners/fixtures/observations and explicit blocked rollout gates | AT-48 · document CLOSED; runtime NOT TESTED |

**Residual blockers before implementation:** verify canonical number and latest committed specs (especially 233/240/241/244/245), actual deployed schema/route/ACL/Spec-240 renderer versions, platform safety officer/research-methodologist owners, resource limits and real compute provider contracts. No document-only audit can establish that all defects are absent; production release requires actual negative/security/recovery/scientific test evidence for the chosen domain and deployment.

---

**Implementation instruction:** Begin with Phase 0 contract verification against actual SmartSpecPro repository and deployed SmartAIHub runtime. Where this specification conflicts with an existing canonical interface, preserve the existing single authority, record an additive compatibility adapter/backlog task, and document the discrepancy before proceeding. Specifically, resolve scientific visualizations/forms through Spec 240 when certified and retain deterministic fallbacks; do not create a second generated-UI stack.
