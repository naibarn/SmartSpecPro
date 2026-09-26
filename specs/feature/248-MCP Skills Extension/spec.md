---
title: "Spec 248 — MCP Skills Extension (SEP-2640): Distribution, Interoperability & Governance"
spec_id: 248
numbering_status: "PROPOSED — reserve after authoritative SmartSpecPro registry / main / PR / worktree collision check"
version: "1.2 — second independent ten-pass gap audit; 20 cumulative documented passes"
date: "2026-09-25"
status: "TWENTY DOCUMENT-AUDIT PASSES / IMPLEMENTATION CANDIDATE — NOT IMPLEMENTED; LIVE CONFORMANCE PENDING"
standard: "io.modelcontextprotocol/skills; stable extension against MCP 2026-07-28 or later"
owner: "SmartAIHub Core Platform"
related_specs: [186, 196, 199, 200, 206, 209, 212, 213, 215, 220, 221, 224, 225, 226, 229, 231, 233, 234, 238, 239, 241, 242, 243, 244]
---

# Spec 248 — MCP Skills Extension (SEP-2640): Distribution, Interoperability & Governance

> **Numbering rule:** 248 is the proposed next number after the Library-visible Spec 247. The authoritative SmartSpecPro repository registry, branches, PRs and worktrees were not accessible for collision verification; do not merge or implement under 248 until they have been checked. If 248 is occupied, reassign this *new document*, not the existing specs.
>
> **Implementation boundary:** Do not retroactively edit Specs 1–213, including 199/200/209/212/213. Spec 224 is actively being implemented and MUST NOT be rewritten. Integrate only through additive adapters, contracts, tests, migration/backlog items and subsequent specs; deployment flags default OFF. This document is a design specification, not evidence of implemented functionality.
>
> **Normative source:** [Stable MCP Skills Extension](https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx). The [SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension) proposal reached Final on 2026-09-13. Where this document conflicts with the stable standard, the stable standard wins for wire interoperability, and the local design must be updated before enabling production.

## 0. Decision and scope

SmartAIHub SHALL implement **both**: (a) an inbound MCP Skills **server** on its existing `/v1/mcp` ingress to publish eligible first-party and creator Skills; and (b) an outbound MCP Skills **client** in the existing Spec 199 gateway to discover, verify and selectively import/use upstream Skills. The canonical Skill Registry, publishing lifecycle and licensing remain under Spec 221; canonical retrieval under Spec 229; all authorization under existing policy/approval services; all execution and durable work under Feature 196 / Spec 215 / `worker_jobs`. No separate skill marketplace, orchestrator, approval authority, identity provider, long-running scheduler or ledger is permitted.

**Crucial separation:** Skills are instructions and supporting assets, not executable MCP Tools. An MCP-served Skill MUST NOT be automatically converted to a Tool, installed on a Runner, executed, added to model system instructions, indexed into RAG or publicly listed merely because a server advertises it. Skills may refer to Tools; the Tool call still requires independent per-action authorization and existing billing/approval.

**P0:** deterministic protocol conformance, 512-resource/16-MiB minimum interoperability, namespace-safe nested Skills; private first-party publishing; client discovery and content-bound verification; tenant isolation; explicit load/approve; compatibility fallback. **P1:** Marketplace publication and licensed remote distribution, safe dynamic skills, UX and certified external-client profiles. **P2:** optional directory enumeration, richer remote authoring/sync, provider-specific interoperability as separately verified capabilities.

### 0.1 Expected user journeys

- A user publishes a reviewed personal/project Skill, enables permitted MCP exposure and links an eligible external MCP client. Only Skills the authenticated client is entitled to see appear, and the client reads files on demand.
- SmartAIHub discovers a verified upstream server, paginates its `skills/list`, previews metadata, binds the exact source/revision and securely loads only a requested Skill and its required files.
- Chat/Workflow/Native Agent resolves the relevant Skill using the existing Retrieval Broker, gets explicit permission if required, reads/verifies approved content, then uses existing Tools or Workflow nodes independently.
- An external client without SEP-2640 support continues to use approved existing Tools, Resources, Prompts or a bounded compatibility bridge. No capability negotiation by client name alone.
- Revocation, upstream content changes, tenant policy changes or creator offboarding invalidate stale load/approval grants without deleting the original audit trail.

### 0.2 Explicit non-goals

No autonomous third-party code execution; no automatic mirroring of upstream skill trees; no arbitrary URL fetching from a skill's text; no promise that Codex, Claude, Hermes, Grok Bot, Gemini Spark or Muse supports the extension without version/account-level conformance; no blanket cross-tenant caching; no provider-wide shared credential; no assumed standardized skill install/execute method beyond the actual wire spec.

## 1. Verified standards baseline and normative versus local extensions

The normative Skills Extension identifier is `io.modelcontextprotocol/skills`. It binds the Agent Skills directory/`SKILL.md` format to existing MCP Resources. It is specified for the MCP base protocol `2026-07-28` or later. As specified in the stable document, server capability declaration occurs in `server/discover` under `capabilities.extensions` and MUST also include the base `resources` capability. The separate `directoryRead` boolean gates the **optional** `resources/directory/read` method. Do not copy pre-final drafts that negotiated the extension exclusively through `initialize`; do not assume historical draft semantics.

Required extension methods:

| Method | Required? | Purpose | Important invariant |
|---|---:|---|---|
| `skills/list` | YES | Paginated list of visible `Skill` entries | `PaginatedResult` **and** `CacheableResult`; bounded pages, stable cursor handling |
| `skills/get` | YES | Get one skill entry by its `SKILL.md` resource URI, including skills omitted from a partial listing | `CacheableResult`, content-bound refresh |
| `resources/read` | Base Resources dependency | Read individual skill files by URI | Reading alone does **not** load/activate/approve a Skill |
| `resources/directory/read` | Optional; only with `directoryRead: true` | Read direct children of directory (`inode/directory`) | Must not be called when undisclosed; never confuse with global `resources/list` |

A `Skill` entry includes the `uri` of its root `SKILL.md`, **verbatim** parsed frontmatter containing `name` and `description`, and a `resources` field that is either a **complete** file manifest or the literal `"dynamic"`. Static manifest items carry resource URI, `sha256:` digest of raw bytes (64 lowercase hexadecimal characters), and byte size. Preserve every defined field, including future-safe unknown fields, while rejecting invalid required fields. A static manifest MUST contain the actual `SKILL.md` file exactly once and cover every file in that Skill tree according to the stable specification, observing its nested-Skill boundary rules. Reject duplicate resource URIs, invalid digest syntax, negative/non-integer byte lengths and manifests that refer to a different source; never normalize an untrusted URI across server identities. Dynamic manifests have no complete immutable file manifest and are **not equivalent** to a statically content-verified release. Do not invent custom wire keys inside the reserved namespace.

`skills/list`, `skills/get` and `resources/read` cache hints `ttlMs` / `cacheScope` are performance hints, not authorization or integrity proofs; recheck identity/ACL at every use. Versioning is an internal SmartAIHub concern and must not create an incompatible extra required wire field. For exact request/response types, required `_meta`, pagination, errors and Resource result envelope, import the pinned published schemas and conformance fixtures; do not reimplement based on the abbreviated examples in this spec. **Mandatory interoperability floor:** a conforming host MUST accept static Skills containing up to and including **512 resource entries** and **16 MiB (16,777,216 bytes) total declared file size**. Local configurable budgets MAY be higher; a lower hard cap MUST NOT be advertised as full Skills Extension conformance. Check the full manifest before file fetch, then enforce cumulative actual-byte and token budgets during retrieval.

## 2. Architecture: one authority, two transport roles

```text
External MCP Skills Server                External MCP Skills Client
        |                                          ^
        v                                          |
Spec 199 Outbound MCP Client              /v1/mcp Inbound MCP Server
  - capability negotiation                - scoped skills/list, skills/get
  - list/get/resource read                - scoped resources/read
  - untrusted remote bytes                - optional directory/read
        |                                          ^
        v                                          |
   Skill Ingestion Adapter --------> Canonical Skill Registry (Spec 221)
      validation, source, digest       immutable releases + local grants
        |                                 ^       |
        +----> Retrieval Broker 229 -------+       +--> R2 file objects
                  Vectorize projections           PostgreSQL ACL/metadata
                                   |
                        Shared Capability Resolver
                                   |
           Existing Feature 196 / 209 / 215 / 200 / 206
                                   |
                      Existing Approval / worker_jobs
```

`/v1/mcp` is the **existing** tenant-aware inbound endpoint, not a second MCP server product. Its accepted client profiles and OAuth controls remain as specified by Spec 199 / approved Spec 239 extensions. Existing Spec 199 outbound remote/local MCP lifecycle, extension registry, OAuth, SSRF protection, package scans and runtime health are reused. Never let an upstream server become a direct executor, billing authority or approver merely through Skills advertisement.

### 2.1 Canonical ownership matrix

| Responsibility | Authority | New work here |
|---|---|---|
| Skill creation / tests / publication / license | 221 | SEP-2640 export/import profile and metadata projection |
| Inbound and outbound MCP protocol / transport | 199 | Skills Extension adapters and certification |
| User/tenant/project authorization and approvals | Existing 220 / common policy | Skill-file/read/load policy inputs; content-bound approval |
| Capability resolution / Skill activation | Existing 196 and Capability Registry | Scoped `loadSkill` adapter, NEVER via bare `resources/read` |
| Retrieval/indexing / Vectorize | 229 | Metadata projection, optional approved content indexing |
| External harness/bot execution | 200 / 206 / 239 | Capability-negotiated delivery profile; no forced remote installation |
| Workflow generation/run | 209 / 215 | Version-pinned references and dependency preflight |
| Jobs / retries / auditing | Existing worker_jobs | Side-effect-safe import/sync tasks; no separate worker queue |
| UI, approval and notifications | Existing Chat / Skill Studio / Task Center | Skills integration panels and load/approval receipts |
| Marketplace and billing | Existing Marketplace / ledger | Rights-aware remote distribution and ledger attribution |

## 3. Outbound MCP Skills Client

### 3.1 Capability negotiation

The gateway MUST capture observed protocol revision, discovered `resources` support, exact extension key/value and optional `directoryRead` per **server runtime revision** and **authenticated connection**. Never infer extension support from server name, SDK version or an unrelated `tools/list`. Disabled, unsupported, blocked and partially compatible statuses are distinct. If extension is absent, do not call `skills/list`/`skills/get`; offer a non-SEP compatibility route only when configured and explicitly labeled. If resource capability is missing while Skills Extension is advertised, mark protocol-invalid and do not load.

### 3.2 Discovery and refresh

`skills/list` MUST use server-advertised pagination until `nextCursor` is exhausted, with page/entry/byte/time limits, duplicate-cursor detection, explicit PARTIAL_CATALOG status without treating unlisted skills as absent, stable merge by `(connection_id, server_runtime_revision, skill_uri)` and generation-fenced refresh. Partial refresh MUST NOT replace a complete prior catalog or revoke otherwise valid unlisted Skills; direct URI lookup via `skills/get` remains usable if separately authorized even when discovery is incomplete. Catalog completeness is a search-quality signal, not a universal activation gate. `skills/get(uri)` can refresh any authorized skill URI directly, including a URI received in permitted server instructions, even if absent from listing. Server-authored instructions and frontmatter remain untrusted. Always enforce per-connection tenant/user/project visibility before displaying the result.

### 3.3 Read, verify, and pin

1. Select one eligible Skill via explicit user intent or the authorized Skill Resolver. Resolve source connection, server revision, Skill URI, frontmatter and manifest snapshot.
2. Before **host activation**, recheck effective policy, entitlement and approval; call `skills/get` as required by cache freshness/content-bound approval; independently validate frontmatter and complete manifest or classify `dynamic`.
3. For static manifest, request the selected `SKILL.md` and needed files via `resources/read`; enforce MIME/byte/depth/count/time ceilings and URI-containment checks. Verify **raw returned bytes** against declared digest and byte size before model or tool exposure. Preserve verified bytes in a content-addressed R2 quarantine/caching layer only where storage rights and policy allow.
4. Compare original vs refreshed manifests; if any content-bound input changed, invalidate previous load approval and any previously evaluated trust label; new review/approval may be necessary. Recheck at execution boundaries where instructions could authorize side effects.
5. Activate only through `SkillLoadService` with a content-bound receipt, scoped context, budget, TTL, approvals and permitted tools; separately authorize every tool execution. The host MUST retain the **held Skill entry** throughout the acting window, from the moment `SKILL.md` enters model context until it leaves at the earliest, and MAY retain it longer. An unlisted child MUST NOT be read or surfaced under that held entry; refreshing a changed entry invalidates content-bound approval. Plain `resources/read` is never an activation path.
6. Bind a workflow run to exact source digest(s) / release version / retrieval evidence. If upstream unavailable, a stored verified snapshot can be used only when offline rights and freshness policy explicitly permit it; otherwise fail safely.

### 3.4 Directory read, URI safety, and dynamic skills

Only call `resources/directory/read` when negotiated. Validate directory resource `mimeType: inode/directory`, prohibit traversal/encoded traversal, symlinks escaping the Skill root, recursive listing without depth limits, directory-to-file confusion and server-side request forgery through resource URIs. Never resolve `skill://` by rewriting it into a network URL; URI values are opaque within the **verified server connection**. For the conventional `skill://` mapping, require the final skill-path segment to match frontmatter `name`, forbid name shadowing across sources, and preserve descendants that are independent nested Skills rather than flattening their `SKILL.md` into their parent Skill. Directory read is paginated and returns **direct children only**; hosts MUST NOT use it to expand a held static manifest or infer new permissions.

Dynamic Skills (`resources: "dynamic"`) cannot receive static-manifest integrity assurance. Default policy: disabled for Marketplace publication and unattended execution. P1 optional policy requires explicit high-trust publisher approval, per-load fresh `skills/get`, constrained file access, separate content capture/scan of each delivered file, short expiry, manual review for privileged operations and an audit indication `UNVERIFIABLE_DYNAMIC`. Never label a dynamic Skill as digest-verified, and never infer an archive-based install flow (v1 distributes individual resources, not archives).

## 4. Inbound MCP Skills Server

### 4.1 Publishing eligibility

Expose only immutable Spec 221 Skill releases that pass (a) valid Agent Skills packaging, (b) rights/license and owner checks, (c) mandatory security scanning/evals for the visibility tier, (d) server-side ACL and permitted external-distribution policy, and (e) exact artifact bytes stored under R2 content-addressed keys. The approved scope may be `personal`, `project`, `team`, `tenant` or `marketplace`, with **separate remote-distribution grants**. Drafts, private secrets, credential files, nonredistributable licensed assets, unapproved executable scripts, and revoked versions must never leak through listing, `skills/get`, directory listing or direct resource access.

### 4.2 Inbound methods and consistent snapshots

Implement `skills/list` and `skills/get` on existing `/v1/mcp` whenever the Skills Extension is advertised; advertise `resources` simultaneously. A disabled tenant may omit the extension declaration entirely. `skills/list` is user-/connection-scoped, paginated, deterministic within generation where possible, and includes only currently entitled releases. `skills/get` is a separately authorized lookup for any **served** Skill URI, even if its list page has not been reached. Unknown or forbidden identifiers must not disclose private resource existence through error text/timing. `resources/read` and optional directory read must authorize **each file** at read time, including nested files, with the same tenant release/license boundaries. Revalidate signed URL grants if used; never reveal raw R2 private object URLs.

Use stable canonical resource URI mapping distinct from public user-controlled names; retain a server-side mapping `(tenant, release_id, revision, path)` and immutable manifest. Avoid publishing two different bytes under the same claimed immutable release URI. Content updates must create a new release identity/version or a documented revocation/rebinding action, not quietly mutate an approved digest.

### 4.3 Protocol compliance

The adapter MUST conform to the wire types of the pinned stable extension and underlying `2026-07-28` protocol (including required `_meta`, capabilities discovered via `server/discover`, caching fields, error envelope, `resultType` and resource content format). `directoryRead` is **false/absent at P0** unless the implementation genuinely supports and tests it; activate it as a P1/P2 feature only after directory security tests. Do not fake support or send proprietary extension fields where reserved. Return bounded errors for unsupported revision, malformed cursor, unknown URI, revoked privilege, invalid digest and incomplete manifest.

### 4.4 Changes, notifications, and revocation

On publication, revocation or ACL changes, invalidate cached server-facing projections across instances, increment catalog generation and process supported generic change subscriptions only when the deployed MCP revision and client have actually negotiated them. Do not assume a Skills-specific push event exists. Deny reads immediately after revocation at the policy layer; storage CDN/cache invalidation is defense in depth, never the sole access-control mechanism.

## 5. Canonical data model (additive; reconcile with deployed schema first)

Suggested **logical** entities; implementation must reuse existing records before adding tables:

```typescript
type MCPRemoteSkillSource = {
  connectionId: string; upstreamServerRuntimeRevision: string;
  protocolRevision: string; extensionEnabled: boolean;
  directoryRead: boolean; tenantId: string; catalogGeneration: string;
  observedAt: string; health: 'READY'|'PARTIAL'|'BLOCKED'|'OFFLINE';
};

type MCPDistributedSkillRef = {
  tenantId: string; connectionId: string; skillUri: string;
  frontmatter: Record<string, unknown>; // preserve verbatim extension-compatible values
  manifest: Array<{uri:string; digest:string; size:number}> | 'dynamic';
  manifestFingerprint?: string; // internal canonical hash, not wire field
  sourceRevision: string; trust: 'UNREVIEWED'|'VERIFIED_BYTES'|'REVIEWED'|'QUARANTINED';
  visibility: 'personal'|'project'|'team'|'tenant'|'marketplace';
  approvalPolicyRevision: string; lastValidatedAt: string;
};

type SkillLoadReceipt = {
  canonicalSkillId: string; sourceConnectionId?: string;
  skillUri: string; manifestFingerprint?: string;
  actorId: string; tenantId: string; projectId?: string;
  modelSessionId?: string; workerJobId?: string;
  approvalId?: string; policyRevision: string;
  allowedCapabilities: string[]; budgetId?: string;
  loadedAt: string; expiresAt: string; invalidatedAt?: string;
};
```

Store canonical IDs/permissions/licensing/revisions in PostgreSQL; immutable approved file bytes in R2; search projections in Vectorize via Spec 229. Cache keys MUST include connection, actor scope where data differs, tenant, server revision, Skill URI, manifest fingerprint and policy/ACL revision. Sensitive cached content is encrypted or stored in tenant-isolated R2; shared content-addressed blobs cannot create shared entitlement. A digest proves byte equality, not author identity, trustworthiness, license or absence of malware.

### 5.1 Internal API (NOT additional MCP methods)

`discoverRemoteSkills(connection, cursor?)`, `refreshRemoteSkill(connection, uri)`, `verifyManifestAndFiles(connection, uri, selectedPaths)`, `approveSkillLoad(actor, context, fingerprint, scope)`, `activateSkill(receipt)`, `publishSkillRelease(release, distributionPolicy)`, `revokeDistribution(release, scope)`.

Idempotency keys MUST separate discovery/ingestion from load/activation and actual tool execution. All APIs must use the existing request identity, tenant policy, approval ledger and auditable operation trace. For long-running import/scan jobs, enqueue through existing `worker_jobs` with bounded retries and cancellation; never automatically retry potentially side-effecting scripts or untrusted Tool calls.

## 6. Security and trust (release-blocking)

**Threat model:** prompt injection in `SKILL.md` or ancillary files; skill-to-tool privilege escalation; malicious shell/network script; forged publisher; compromised upstream server; manifest/content race; path traversal; cross-tenant cache leak; entitlement bypass via direct `resources/read`; resource-exhaustion or decompression attacks; dynamic-content bait-and-switch; malicious assets hidden behind a benign description; instruction laundering through RAG; stale content-bound approvals; license/IP infringement; secret exfiltration via subresources and debug traces.

Controls required before production:

- Treat **all** upstream text and files as untrusted, including metadata, tool outputs and `instructions`. The model must not be allowed to override system/developer/security policy through Skill text.
- Bind approval to actual source identity/connection, actor, tenant/project, exact static file manifest hash, policy revision, requested capability set and expiration. A changed manifest, authorization scope or risk class invalidates relevant approvals; dynamic content never inherits static approval.
- Scope ingestion and serving by authenticated principal, resource ACL, marketplace license and explicit allowed egress. Never accept client-supplied `tenantId`/`userId`/`role` as authority. Apply authorization on discovery, get, every read, activation, every tool action and artifact delivery.
- Apply maximum per-Skill count, bytes, path depth, script type, MIME/type sniff, read rates, token budget, per-connection quotas, timeouts, circuit breakers and fair scheduling. Scan text/files for malware, prompt injection indicators, secret material and declared/actual capability mismatch. A scanner's negative result is not proof of safety.
- No auto-run of `scripts/`, local commands, downloaded dependencies or other executable resources. Execution requires **existing** approved sandbox/Runner policy, explicit tool permissions and approval for privileged/destructive effects. Never bypass the actual `worker_jobs` admission/control plane.
- Upstream network access inherits Spec 199 SSRF, DNS rebinding, redirect, OAuth issuer/audience, token isolation and outbound allowlist checks. URI containment is enforced in the authoritative server mapping, not through fragile prefix checks alone.
- Hard-block export of secrets, hidden prompts, other users' documents and nonredistributable libraries. Sanitize Markdown/HTML previews and redact log payloads/opaque upstream request state. All mutation/admin actions have server-side auth, tamper-evident audit and emergency revocation.
- Cross-server dependency instructions cannot silently connect new providers, install new MCP servers or grant filesystem/network access. Transitive dependencies require explicit registry resolution, cycle guards, capability bounds and owner policy.

**Fail-closed state:** invalid manifest/digest for the selected Skill, unsupported protocol, prohibited dynamic content, expired permission, unresolved license or uncertain source provenance denies activation and publication. An incomplete catalog limits discovery and bulk synchronization but MUST NOT alone deny a directly fetched, independently verified, authorized Skill. Read-only metadata display may remain available when explicitly permitted.

## 7. Retrieval, routing, model context and quality

Spec 229 indexes only **authorized Skill metadata** by default (`name`, `description`, controlled tags, approved categories, package requirements, URI/source/version, compatible client profile and trust metadata). Do not put raw imported instructions or private supporting files into globally searchable vectors. Approved file-content indexing is separately opt-in, lineage-aware, ACL-revalidated, revocation-safe and tenant-namespaced; R2 remains artifact truth and Vectorize a rebuildable search index. A Skill match is an **advisory** suggestion, not an authorization to activate.

Skill Resolver ranking may consider relevant task, language, owner/project scope, model/client capabilities, verified trust, existing tool dependencies, cost and version stability, but MUST apply hard privacy/security and user approval filters before any candidate reaches the model. Only selected metadata enters model context first; `SKILL.md` and auxiliary files are loaded progressively on demand within per-run token/byte limits. Model routing (Spec 231) selects inference providers independently of Skill trust.

Workflow references MUST bind an immutable local release or verified upstream manifest plus source identity and allowed fallback. A skill update cannot silently change an in-flight Spec 224 development run or Spec 215 workflow version. Child operations inherit the parent policy, budget, deadline and audit/trace IDs.

## 8. External Agents and compatibility

Publish capability/extension negotiation in an actual handshake with each external MCP client. Maintain **client conformance records** per product + version + connection/entitlement + protocol revision, not marketing claims. A client that supports inbound Tools but lacks Skills Extension receives only existing approved capability-search, Tool or Prompt compatibility behavior. Never auto-push all Skill instructions to a client's context and never claim that the external host honors SmartAIHub's internal approval or trust labels. Where a client ingests a remote Skill, **SmartAIHub controls what bytes it serves and what later SmartAIHub tools it authorizes**; the external host remains responsible for its own local model/tool execution policy. Sensitive skills requiring enforceable host-side restrictions MUST NOT be remotely distributed to uncertified/untrusted hosts.

Existing Spec 199–200 cross-spec instructions prohibiting arbitrary Skill download shall be relaxed **only** for an authenticated, policy-allowlisted SEP-2640 `skills/get` + `resources/read` distribution path on the managed SmartAIHub endpoint. Direct connections from external agents to arbitrary upstream servers continue to be disallowed unless separately and explicitly authorized.

## 9. UI / product surfaces

**Admin / Tenant MCP Integrations:** Add a distinct **Skills** tab next to Tools, Resources, Prompts and Extensions. Show source connection, advertised protocol/extension, remote Skill count with pagination/incomplete warning, server revision, trust state, publisher/rights, import approval, sync age, compatibility test result, per-skill revoke/quarantine, dynamic-vs-static indicator and effective scope. Never expose raw tokens, tenant-private path mappings or other users' Skill names.

**Skill Studio / Marketplace (Spec 221):** Add `Export via MCP` and `Import from MCP Server` flows; generate Agent Skills-compliant package; surface manifest/digest, distribution scope, license, compatible clients and human approval before publishing. Display exact revision or digest behind every approval. Distinguish *published*, *retrievable*, *verified bytes*, *approved to load*, and *actually invoked*. Marketplace auto-distribution remains OFF until rights/revenue ledger and per-tenant entitlement tests pass.

**Chat / Mini App / Workflow:** Offer relevant Skill suggestions and an explicit `Load Skill` action (or appropriately constrained pre-approved load for low-risk personal Skills). Show capability dependencies, permission summary, estimated resource/token cost, source and manifest change warnings. Provide lightweight detail/consent surfaces usable on phones/tablets. A `resources/read` preview must NEVER display `Skill loaded` or confer extra permissions. UI changes produce audited server-side actions; hide protocol jargon from ordinary end users.

**Activity / Alerts:** Surface rejected/changed digest, blocked external client, quarantine, revoked entitlement, upstream outage and abusive import/read rate through existing admin notification channels; do not create a new alert scheduler.

## 10. Rollout and compatibility migration

| Stage | Deliverable | Feature flag | Rollback |
|---|---|---|---|
| 0 | Check live registry, deployed MCP protocol/Spec 199 state, source-file rights, actual Skills conformance fixtures | OFF | No production change |
| 1 | Stateless protocol adapter tests + internal `SkillLoadService` enforcing read ≠ load | `skills_core_internal` | Disable adapter; existing capability tools unaffected |
| 2 | First-party **private** inbound server `skills/list/get` + resources/read; live test against certified client | `mcp_skills_server` | Remove extension declaration; deny new Skills reads |
| 3 | Outbound client discovery/get, static manifest verification and selected read | `mcp_skills_client` | Disable remote ingestion/activation, retain audit |
| 4 | Scoped retrieval projection, Chat/Skill Studio UI, version-pinned Workflow refs | `skills_ui` | Hide entry point, allow existing pinned work to finish under policy |
| 5 | External-client certification, Marketplace license-aware publishing, optional directories and dynamic policy | Per-tenant/client flags | Revoke published Skills / disable nonconforming adapter |

Existing Tool-based Skills and imported local Agent Skills packages remain functional. Do not rewrite historical Skill records in place: add explicit **distribution adapter** fields and create immutable release mappings. Backfill metadata safely with a dry run and reversible migration only after inspecting deployed PostgreSQL schema, live Spec 221 artifact model and secret handling. Do not initiate an irreversible cutover while Spec 224/213 implementation or owner-rotation gates remain unresolved.

## 11. Conformance and acceptance tests

Automated protocol tests MUST run against the published stable MCP extension fixture/schema and a real test MCP server/client as well as mocked failure cases. Independent verification is mandatory before production labels. Minimum gates:

| ID | Required test | Expected |
|---|---|---|
| CON-01 | `server/discover` extension + resources capability; absent extension | Exact declaration; never call extension on unsupported server |
| CON-02 | Missing `resources` dependency / wrong `_meta` / unsupported protocol | Typed protocol failure, no Skill load |
| CON-03 | Paginated `skills/list`, repeated/invalid cursor, incomplete page, parallel refresh | Bounded, generation-fenced and no false catalog deletion |
| CON-04 | `skills/get` of listed and unlisted-but-served URI; unknown URI | Correct result and non-leaking error |
| CON-05 | Static SKILL.md and nested manifest, byte length, SHA-256 lower-hex | All files validated against raw bytes; mismatches blocked |
| CON-06 | `resources: "dynamic"` and changing bytes | No static VERIFIED label; manual/dynamic policy enforced |
| CON-07 | `resources/read` alone and load-then-act | Direct read never activates; only receipt-based load does |
| CON-08 | Optional `directoryRead` off/on; `inode/directory`; traversal | Only negotiated method allowed; traversal denied |
| CON-09 | `ttlMs`/`cacheScope` and policy/ACL revocation before cache expiry | Cache hints never extend access or approvals |
| CON-10 | Unauthorized tenants, cross-tenant cursor/URI/cache, direct file guessing | No cross-tenant metadata/content leakage |
| CON-11 | Prompt injection in frontmatter/Markdown/scripts; injected fake tool consent | Instruction text never elevates authority |
| CON-12 | Manifest race between get/read, changed immutable release, source outage | Content-bound abort or explicitly licensed pinned fallback |
| CON-13 | Publisher license revoked, marketplace entitlement expired, creator offboard | New discovery/read/load refused with audit |
| CON-14 | Malicious scripts, binary assets, huge/deep tree, MIME spoofing | Resource and sandbox controls stop abuse |
| CON-15 | External client with/without actual extension, protocol version drift | Honest compatibility status and safe fallback |
| CON-16 | Existing Spec 199 Tools/Resources/Prompts, Spec 221 local import, Spec 215 workflow | No regression and no duplicate execution authority |
| CON-17 | Worker/process restart during ingestion; duplicate callbacks; job cancellation | Idempotent `worker_jobs` reconciliation |
| CON-18 | Phone/tablet consent, empty/partial/errors, screen-reader navigation | Accessible UI, no false installed/verified states |
| CON-19 | Billing/usage by importing, loading, using downstream Tools and third-party cost | No double charge or undocumented external billing |
| CON-20 | Blue/green release, revocation rollout, restart, rollback | No stuck grants, stale approvals or broken legacy clients |

**Release gates:** zero critical tenant/security failures; all MUST-level stable protocol fixtures pass; all static-resource digest tests pass; external client profile marked supported ONLY after real account/version tests; independent security review signed; incident/revocation runbook rehearsed; regression suites for existing Spec 199, 221, 229 and 224 ingress pass. Record exact source revisions and CI evidence. Do not represent this planning spec or successful mock tests as live deployment certification.

## 12. Cross-spec improvement backlog (do not edit prior originals)

- **Spec 199 (implemented-boundary):** MCP Skills protocol adapter, extension allowlist, inbound/outbound user capability and security test backlog; keep former tool/resource/prompt flows intact.
- **Spec 200 / 206 / 239:** optional external-client profile and provider entitlement conformance, hosted/local execution boundary, no direct unapproved upstream connections.
- **Specs 209 / 215 / Spec 212 design baseline (runtime availability verified per owner):** Skill version pins and distribution provenance; incremental new catalog use cases via later additive Spec 234/candidate, not rewrite 212.
- **Spec 221:** MCP export/import adapter for existing immutable Skill releases and rights-aware creator flow; do not silently replace native Skill Registry.
- **Spec 229:** trusted metadata index projection, scoped dynamic lookup and revocation-safe reindex; production Vectorize remains the index.
- **Spec 224 (active implementation):** future ingress compatibility contract only; never change current blocked/active execution plan or its authoritative acceptance gates.
- **Spec 225/226/238:** consent/approval views, change notifications and operational monitoring through existing UI/Alert systems.
- **Spec 241/242/243/244:** explicitly scoped memory/context export, Cloudflare runtime placement when appropriate and evidence-based adaptive selection. These are consumers of the same Skill authority rather than separate Skill services.

## 13. Open deployment checks (must resolve before implementation PR)

1. Check actual SmartSpecPro canonical registry/main/PRs/worktrees for Spec 248 collision and installed Spec 199/221 contract shape.
2. Pin the exact **stable** `skills.mdx` revision/commit and published base MCP schema to a dependency lock; record diff whenever upstream changes.
3. Verify deployed `/v1/mcp` implements `server/discover` and required `2026-07-28` `_meta`/cache/result semantics or install the gated modern protocol adapter first; do not pretend an old initialize-only endpoint is compliant.
4. Identify which target external clients **actually** implement SEP-2640 for the deployed release, tenant location and connected account; maintain a real evidence matrix.
5. Validate current Skill Registry tables, release IDs, source bytes, allowed license terms and encrypted credentials before migration or public Marketplace rollout.
6. Approve resource, context, file-size and token budgets per tenant and define client-side behavior for unavailable upstreams.
7. Schedule security signoff and an incident drill for rapid revoke of a compromised published Skill and a compromised inbound/outbound connection.

## 14. Standards and reference baseline

- Official stable Skills Extension: https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx
- SEP-2640 accepted proposal: https://modelcontextprotocol.io/seps/2640-skills-extension
- Official extension overview: https://modelcontextprotocol.io/extensions/skills/overview
- Working Group decisions (non-normative): https://github.com/modelcontextprotocol/ext-skills/blob/main/docs/decisions.md
- MCP repository: https://github.com/modelcontextprotocol/modelcontextprotocol
- Agent Skills format: https://agentskills.io/specification

**Specification control:** Reconcile and test against official stable text rather than historical SEP draft excerpts. Third-party client implementation is not inferred from the published protocol. This document is additive and contingent on the actual live SmartSpecPro registry, deployed adapters, credentials, and test evidence.


---

## 15. R1.1 normative corrections and ten-pass production audit (2026-09-25)

**Audit method:** The ten passes below reviewed every original section (0–14), reconciled the described wire semantics with the published *stable* Skills Extension specification, and checked control-plane ownership and failure paths against the Library-visible SmartAIHub architecture. Each pass records a concrete identified gap, the binding correction, and an acceptance oracle. This is a **document audit**: it is not ten executions of the application, a claim that repository tests ran, or independent certification. Clauses in this section supplement and, in any conflict, supersede older wording above. The official stable wire specification takes precedence over both.

### Pass 01 — Wire exactness, capability negotiation and reserved methods

**Gap:** The original spec named the methods correctly but left the exact response-envelope and error invariants to later schema imports; the implementation could accidentally mix the September stable extension with older initialize-only MCP SDK behavior.

**Binding correction:** Pin a tagged/immutable stable-source commit, base `2026-07-28` schema and generated types at build time. Advertise `capabilities.extensions["io.modelcontextprotocol/skills"]` **and** `capabilities.resources` in `server/discover`; use `directoryRead` only when supported. Both `skills/list` and `skills/get` return `resultType: "complete"` with mandatory `ttlMs` and `cacheScope`, and list responses include `skills` and optional `nextCursor`. `skills/get` accepts exactly the skill's root `SKILL.md` URI, returns `skill`, and sends JSON-RPC `-32602` for a URI that does not identify a served Skill. Preserve base `_meta` and result structures. Do not add proprietary keys inside reserved `skills/` methods; expose SmartAIHub-specific workflow operations through its existing tool/HTTP gateway, not new undocumented MCP Skills verbs. Auth failures follow base transport/security requirements without leaking resource existence.

**Acceptance oracle:** Compare raw discovery, list, get, read, unknown-URI and error traces byte/schema-wise to pinned stable fixtures; reject missing caching attributes, wrong discriminators, omitted Resources capability, and an illegal optional directory call.

### Pass 02 — Catalog partiality and resource identity

**Gap:** An incomplete `skills/list` was previously conflated with a fail-closed inability to activate even an independently verified `skills/get` Skill; that contradicts the explicitly partial/un-enumerable catalogue model.

**Binding correction:** `skills/list` may legitimately return an empty or partial catalogue. Track `PARTIAL_CATALOG`, `PAGINATION_INTERRUPTED`, `COMPLETE_OBSERVED`, and `DIRECT_URI_ONLY` separately. A client never interprets empty/partial discovery as absence; an explicit URI from the user, server `instructions`, or another approved Skill is validated with `skills/get` on the **same authenticated connection** and authorization scope. `skill://` is conventional, **not privileged**: accept other permitted resource URI schemes meeting the published structural requirements; never infer that URI scheme alone proves a Skill. Keep issuer/source connection + URI in identity and cache keys. On listing conflict, `skills/get` is a point-in-time authoritative refresh for the particular Skill, not evidence that the global catalogue is complete.

**Acceptance oracle:** An empty-list server can serve a verified direct-URI Skill; mismatched hostname/connection cannot borrow the same URI's approval; a `skill://` ordinary resource does not gain Skill identity without list/get confirmation; failed pagination does not delete existing pinned entries.

### Pass 03 — Complete static manifests, byte-level integrity and encoding

**Gap:** Digest verification was present but absent an exact decoder contract and source-of-truth rule when frontmatter, Resource content and entry disagree.

**Binding correction:** Every static `resources` array is the **complete** file manifest for the Skill and includes its root `SKILL.md`. Check unique URI/path identity, valid positive or zero byte size according to schema, lowercase `sha256:` followed by 64 hex digits, bounded sorted/canonical internal representation, and every declared file before exposing that file to a model. Compute digest and length over the **raw file bytes** (decode base64 resource payloads first where the Resource representation uses encoded blobs; UTF-8 encode textual payloads exactly, with no newline/Unicode normalization). Do not conflate a display-rendered Markdown preview with the bytes to verify. After verifying `SKILL.md`, parse its YAML safely and check that the advertised frontmatter matches the actual frontmatter, including retained optional fields and compatible type normalization under the pinned schema. If the file differs, quarantine the fetched bytes and refresh `skills/get`; no use of either stale entry or stale approval. Bound file count/total bytes prior to bulk fetch and avoid fetching every file eagerly.

**Acceptance oracle:** CRLF-versus-LF, BOM, Unicode-normalization, base64 decode, wrong byte count, duplicate URIs, omitted `SKILL.md`, mismatched YAML values, extra unlisted child and altered single file all fail or require fresh entry and approval as applicable.

### Pass 04 — Held-entry acting window, TOCTOU and consent

**Gap:** The first revision mentioned content-bound approvals without a fully enforceable per-model-context *held-entry acting window*. This could admit a newly discovered file or new manifest digest during an in-flight agent session.

**Binding correction:** Create a `SkillActingWindow` record, or an equivalent existing context/session metadata field, linking `session_id`, `source_connection_id`, `skill_uri`, immutable entry fingerprint, load receipt, model context epoch, `opened_at`, `closed_at`, and policy revision. Open when verified `SKILL.md` is introduced into model context; hold the original entry until that instruction has definitely left context, and never close before that moment. `resources/directory/read` is a **live observation**, not a snapshot token: it cannot extend the held static manifest. On an unlisted child, changed digest/size or missing listed child, **stop that read**; optionally refresh `skills/get`, show a content-change warning and seek a *new* approval before using changed content. Existing unrelated tools still require per-action permission. A new Skill revision cannot alter a pinned in-flight Workflow or Spec 224 run; restart/rebind is explicit and audited.

**Acceptance oracle:** Model context retains old `SKILL.md` while upstream adds a malicious child: child is not surfaced. A refreshed manifest forces new consent despite identical display name. Cancellation, context compaction, session transfer and restart cannot silently reopen an expired load receipt.

### Pass 05 — Dynamic manifests, directories and defensible trust claims

**Gap:** The first version treated dynamic publication as an optional hardening exercise without describing what operators could truthfully verify when no fixed manifest exists or when directory capability is absent.

**Binding correction:** `resources: "dynamic"` is a compliant declaration but **does not provide a complete digest-bound manifest**. P0 may discover and display such Skills as `DYNAMIC_UNVERIFIABLE` but MUST block unattended activation, Marketplace distribution and privileged-tool dependency until a separately reviewed P1 policy is enabled. That policy documents read-time scans, data minimization, short-lived grants, live provenance, high-risk human approvals, and separate *per-file transient* hashes that never masquerade as a stable upstream guarantee. If directory enumeration is required for the requested dynamic task but `directoryRead` was not advertised, report `DIRECTORY_UNAVAILABLE`, request an explicit known URI only when allowed, or block the operation. A directory result is never allowed to replace the authoritative static manifest. Explicitly mark unknown/missing dynamic dependencies rather than importing recursively.

**Acceptance oracle:** No automatic directory call to non-advertising server; dynamic files changing between sequential reads never acquire static VERIFIED_BYTES status; unlisted static children cannot be loaded even if directory read exposes them.

### Pass 06 — Authz, tenancy, revocation and cache leakage

**Gap:** The original design stated per-file authorization, but lacked precise revocation propagation and reusable negative tests spanning server-side pages, R2 signed URLs, cached content, vectors and external clients.

**Binding correction:** Compute effective privileges using authenticated caller + current tenant/project ACL + active external distribution consent + owner/license/seat entitlement + resource sensitivity + purpose/tool policy at list/get/read/load/**each downstream tool call**. The same URI may appear with different visibility on different connections; never cache an entitlement solely by digest or URI. Scope list cursors to server runtime generation and authenticated principal/scope; sign or MAC them, expire them and reject cross-tenant replay. Revoke database grants transactionally first, then propagate generation/policy invalidation to all gateway instances, caches, search projections and signed delivery grants. For preissued R2 URLs, use a bounded TTL and an authorization-gated delivery proxy for sensitive files; immediate revocation MUST NOT depend on eventually expiring public URLs. Invalidate ongoing future reads/actions, not merely future discoveries. Track revocation acknowledgement and alert on propagation failure.

**Acceptance oracle:** A revoked user cannot fetch old URIs via cached list/get, direct read, stale cursor, cloned R2 URL, offline snapshot or cross-tenant vector entry. Existing bytes already delivered to an untrusted external client cannot be clawed back; security UI and policy must state that irreversibility explicitly.

### Pass 07 — Supply chain, licensing and external-host trust

**Gap:** A digest alone cannot establish provenance, redistribution rights, runner execution safety or enforceability of restrictions after the bytes leave SmartAIHub.

**Binding correction:** Before publish/import, require policy-dependent source provenance (verified server endpoint and publisher assertion separately labeled), rights record, license ID/version/allowed redistribution and hosting, SBOM or file inventory for executable dependencies, scanning evidence, and immutable release mapping. Reject license conflicts in composite Skills and transitive references. Bound cross-server dependency depth and cycles; follow references only after separate connection authorization. For outbound proprietary/private Skills, require explicit external egress consent and client trust profile; once a client downloads instructions/files, **SmartAIHub cannot technically enforce their subsequent local copying, indexing or tool execution**. Never promise retractability of delivered plaintext. For scripts and binaries, isolate scanning from execution and use existing approved sandbox/Runner controls with deterministic dependency locks and no inherited secret access. Trust labels should enumerate verified facts (digest verified, reviewer approved, signature checked if available) rather than a universal `SAFE` status.

**Acceptance oracle:** License-unknown content never reaches public Marketplace; malicious transitive Skill cannot install another server silently; forged publisher display names do not pass verified provenance; previously delivered confidential content is reported as an irreversible exposure in incident response.

### Pass 08 — Progressive disclosure, routing quality and spend control

**Gap:** Global discovery/indexing and model context injection can turn thousands of Skills into high token costs, leak private metadata, or rank unapproved instructions ahead of user context.

**Binding correction:** Index only entitlement-safe metadata using Spec 229 and tenant-scoped Vectorize; R2 + PostgreSQL remain source-of-truth. Resolve with coarse catalog metadata, then retrieve a single verified Skill entry, then load checked `SKILL.md`, then only the files required for the current objective. Search projections MUST carry source connection, license, tenant, release, digest/fingerprint, ACL revision and indexed-at watermark; reauthorize on hydration. Put hard caps on candidate count, bytes, context tokens, tool scopes, wall-time, external-connection fan-out and retries, with per-tenant fairness and a measured baseline versus existing Skills. Do not require every imported Skill to be locally mirrored or embedded. Each consumption stage emits an auditable cost event and distinguishes external vendor charges from SmartAIHub credits; catalog read must not accidentally start a paid execution.

**Acceptance oracle:** Relevance queries with 10k candidate Skills keep memory/token/latency bounded; ACL or index lag cannot leak another tenant's metadata; duplicate imports do not double-charge; an inaccessible external server does not block unrelated first-party Skills.

### Pass 09 — Durable operation, deployment migration and observability

**Gap:** The earlier rollout specified feature flags but lacked stage-level transactional boundaries and exact rollback handling for a partial publish, mid-fetch crash, failed audit write or out-of-order invalidation.

**Binding correction:** Make PostgreSQL publication/entitlement/revocation the single transactional authority and write lifecycle events via existing outbox. Publish to R2 using immutable object digests, validate object existence/content before flipping DB `PUBLISHED` and advertising via MCP; compensate orphan uploads asynchronously. Keep refresh generation and fencing tokens so stale workers cannot replace fresh catalogs or re-enable a revoked Skill. Use existing `worker_jobs` only for genuinely durable import/scan/sync, not for every read-only protocol call. Persist per-file verified state and source manifest fingerprint; after restart resume only idempotent remaining downloads with reauthorization and digest recheck. Include SLOs and metrics for discovery latency, get/read p95, digest failures, stale-catalog percentages, authorization denials, byte ingress/egress, revocation propagation and double-charge incidents. Feature flags are tenant/client scoped and fail closed on protocol mismatch without disabling legacy Tools/Resources/Prompts.

**Acceptance oracle:** Crash after R2 write but before publication yields no advertised half-Skill; stale sync callback cannot undo revocation; deployment rollback preserves legacy MCP behavior and old pinned runs while denying newly revoked reads; kill-switch propagation is observable and rehearsed.

### Pass 10 — External-client certification, UI correctness and cross-spec integration

**Gap:** Advertised feature labels can be mistaken for live external compatibility, and a user-facing “Skill loaded” state can accidentally imply full tool authorization or remote installation.

**Binding correction:** Certification matrix is per real client build, active account/region, negotiated base protocol and exact observed extension methods, with dated test evidence and expiry. Separate statuses: `SERVER_ADVERTISES`, `CLIENT_NEGOTIATED`, `ENTRY_FETCHED`, `BYTES_VERIFIED`, `LOAD_APPROVED`, `IN_CONTEXT`, and `DOWNSTREAM_TOOL_AUTHORIZED`; none imply the next. In Chat, Skill Studio, Mini App and Workflow, expose permission, publisher, license, cost/egress, manifest change and active-context scope without claiming that an external host enforces platform restrictions. For unsupported clients, use existing authorized Tools/Resources/Prompts compatibility profile, never a mass conversion of every Skill into a Tool. Extend **only** contracts and backlog touching Specs 199, 200, 206, 209, 212, 215, 221, 229, 239, 241–244; Specs 1–213 originals and in-progress Spec 224 remain immutable. The native Skill Registry and existing kernel/approval/billing/job authorities are unchanged.

**Acceptance oracle:** End-to-end test one certified external client and one unsupported client; inspect real wire traces, UI states, phone/tablet approvals, tenancy isolation, revoked revisions, original Spec 199 regressions, and existing 224 ingress tests. A successful mock handshake alone does not qualify as deployed certification.

## 16. R1.1 additional required acceptance cases (execute before rollout)

| ID | Requirement / negative case | Release oracle |
|---|---|---|
| CON-21 | `skills/list` truly empty or partial; explicit URI obtained out-of-band | Verified authorized `skills/get` succeeds without false `NO_SKILLS` or catalog-complete claim |
| CON-22 | Scheme spoofing and same skill URI on two different upstream connections | URI scheme is not authority and identities/approvals never cross connections |
| CON-23 | `skills/get` exact `-32602` unknown-served-URI behavior and cacheable complete result | Published stable schema and error contract pass without revealing forbidden resource existence |
| CON-24 | Static frontmatter differs from verified `SKILL.md`; binary/text encoding variants | Mismatched entry quarantined; digest and size computed on exact bytes |
| CON-25 | Held entry through context compaction, agent handoff and resumable run | No new unlisted file or changed manifest without new approved load |
| CON-26 | Static `resources/directory/read` returns new file absent from held entry | Directory result cannot extend static manifest; must refresh and reapprove |
| CON-27 | Dynamic Skill on server without optional directory capability | Explicit blocked/limited result; no unnegotiated directory call |
| CON-28 | Cross-tenant cursor, CDN, signed URL, R2 object and vector cache reuse | No metadata or content leakage, including after revoke |
| CON-29 | Publication crash, concurrent refresh, source byte change and reversed events | Immutable release/invalidation fencing; no zombie published Skill |
| CON-30 | Real external-client account/version certification and legacy regression | Only demonstrated extension support is labeled interoperable; old MCP flows still pass |

### 16.1 Evidence template for each release gate

For each `CON-01`–`CON-30`, store: tested spec commit and base protocol revision; source file digests; product/connection software versions; test environment and scoped tenant; command/fixture or real trace ID; pass/fail/blocked and owner; replay and failure-injection evidence when required; reviewer signoff; UTC timestamps; outstanding deviations and release waiver identifier. **No release waiver** may bypass tenant isolation, authz, integrity or content-bound approval MUST requirements. A failed negative test blocks production activation of the affected capability even if a mocked happy-path passes.

### 16.2 Updated completion criteria

- All stable protocol MUST requirements exercised by pinned conformance fixtures against **both** inbound server and outbound client; all `CON-01`–`CON-30` gates recorded.
- Static manifest digest+size and verified root-frontmatter reconciliation pass on real file bytes. Held-entry acting-window and dynamic Skills policy negative tests pass.
- Scoped private distribution and explicit-URI retrieval tested under tenant/user revocation, late cache invalidation and offline/upstream outage.
- No unreviewed change to original Specs 1–213 or active Spec 224; any necessary work lands as new additive contracts, tests and implementation backlog.
- Independent security review and production rollback/incident drill complete; actual deployed support status remains `NOT_CERTIFIED` until real system evidence is available.


---

## 17. R1.2 second ten-pass independent document audit — passes 11–20 (2026-09-25)

**Audit scope and precedence.** This pass revisits the complete R1.1 artifact after comparison with the official *stable* Skills Extension (not its draft SEP), Agent Skills format boundary, and SmartAIHub's additive-implementation constraints. Every finding below is a **binding amendment** to Sections 0–16; when local statements differ, this R1.2 amendment governs internal requirements, while the pinned stable normative specification governs wire semantics. Ten reviews here are distinct architectural failure-mode reviews, **not** ten repository/test executions. There is no claim of live server support or independently verified repository compatibility.

### Pass 11 — Normative per-Skill limits and transparent budgets

**Gap:** R1.1 requested limits but never stated the stable spec's interoperable acceptance floor. An implementation could set a smaller global byte/file cap and still mistakenly claim conformance.

**Correction:** Inbound server SHOULD serve at most **512 files, including SKILL.md**, totaling at most **16 MiB = 16,777,216 raw bytes** per static Skill. Outbound host MUST support entries **at** those limits and MAY support more. Validate counts and integer byte sizes before any fetch; use overflow-safe summation. Distinguish file-byte limits from decoded text/token limits, compressed transport lengths and actual bytes. For `dynamic`, apply the same 16 MiB baseline to cumulative retrieved bytes, enforce file-count/rate/time budgets locally, and stop safely at the cap. Policy can decline an oversized Skill but MUST explain why; supporting fewer than the stable floor cannot be called conformant. Reconcile larger tenant budgets with filesystem/sandbox/LLM context constraints without reducing wire acceptance.

**Acceptance:** 512 files / 16,777,216 bytes succeeds when authorized; 513 / 16,777,217 produces an explicit, non-crashing oversized outcome; 64-bit overflow, malicious negative/float size and excessive dynamic streams do not allocate resources or bypass caps.

### Pass 12 — Nested Skills, resource-mapping identity and namespace collisions

**Gap:** A nested `SKILL.md` can represent a second Skill rather than an arbitrary support file; flat directory copying and name-only keys can conflate nested releases or let remote content shadow a trusted local Skill.

**Correction:** Implement the stable conventional mapping `skill://<skill-path>/<file-path>`, with the final skill-path segment equal to its own frontmatter `name`; preserve any non-`skill://` resource URI as an opaque server-scoped identity, never assuming the scheme creates trust. Handle nested Skills according to the stable Skill-tree boundary, with separate root URI, manifest, permission and acting window where they are independently exposed. Maintain internal identity `(authenticated connection_id, server runtime revision, exact skill URI, release/manifest fingerprint)`, and present a host-assigned origin label plus disambiguating path whenever names collide, including same-server paths, other-server names, or local filesystem Skills. Do not silently replace previously selected skills after import or reconnect.

**Acceptance:** Two identical names on different servers and same-name nested descendants remain distinct; parent approval never loads a nested child by implication; URI case/percent-encoding ambiguity, nonstandard schemes, relabelled origins and source rotation cannot reuse approvals.

### Pass 13 — Frontmatter fidelity and reserved metadata ownership

**Gap:** Metadata serialization can drop unknown author keys, normalize frontmatter incorrectly, or write proprietary annotations inside reserved MCP namespaces.

**Correction:** The wire `frontmatter` is the verbatim YAML frontmatter **represented as a JSON object**, preserving all author-defined fields supported by the Agent Skills format. Validate minimum `name` and `description`, name/directory consistency and declared format, but do not treat remote frontmatter as executable policy. On every statically verified `SKILL.md` read, parse with a safe YAML parser (no arbitrary constructors/anchors causing expansion), compare the complete relevant object to the entry with a defined equality/normalization procedure, and quarantine mismatches. Skill resource `_meta` extension fields, when used, SHOULD have the `io.modelcontextprotocol.skills/` prefix. Frontmatter `metadata` keys beginning `io.modelcontextprotocol/` are reserved; proprietary SmartAIHub provenance must use a distinct nonreserved namespace in internal storage, not stealth wire extensions.

**Acceptance:** Unknown valid frontmatter round-trips losslessly as data; malicious YAML alias bombs and type changes are rejected; wrong root name and spoofed reserved keys fail; a valid third-party key survives export/import.

### Pass 14 — Cacheability, snapshot refresh and emergency kill switch

**Gap:** `ttlMs`/`cacheScope` are required on list/get/read but the last spec did not separate cache freshness from a *durable approval snapshot*, nor guarantee emergency denial across distributed replicas.

**Correction:** Consume every published cache attribute exactly as defined by pinned base protocol; partition `private`/connection-scoped cache entries by effective authenticated identity, tenant, source runtime and policy epoch. Catalog snapshots are observational only. A held static entry is immutable for its acting window; when content drifts or `skills/get` returns a new manifest, revoke prior content-bound approval before admitting any changed bytes. At every load, additional file read, privileged tool call and resumed worker action, revalidate a strongly consistent entitlement/kill-switch epoch from the canonical policy authority; bounded caches may reduce reads but MUST NOT serve revoked material after acknowledged revocation. An upstream `ttlMs` never guarantees continued authorization; cached offline use requires separate explicit owner rights and immutable byte snapshots. Do not pretend previously downloaded third-party client plaintext can be revoked remotely.

**Acceptance:** Cached `skills/get` survives harmless refresh but no rights extension; cross-instance revoked grant blocks direct `resources/read` even with cache hit; stale event ordering, worker restart and authorization service outage fail closed; existing previously fetched plaintext is reported accurately.

### Pass 15 — Independent content verification and TOCTOU under mixed resources

**Gap:** Verifying only the root `SKILL.md` or only downloaded selected files while approving a complete release may miss a malicious unused declared script that is loaded later.

**Correction:** Distinguish **entry validation** (complete manifest syntax, uniqueness, total budget, root entry), **file verification** (digest/size of every file *when read*), **review certification** (security/license review of all files in a release where publication policy requires it), and **activation approval** (bind entire static manifest fingerprint). Only verified file bytes may enter any model context or execution input. For published first-party releases, verify all stored file bytes against the release manifest before advertising; for remote on-demand Skills, a not-yet-fetched file remains `UNVERIFIED_FILE` and is individually checked before its first use. Verification of a subset MUST NOT be described as a fully downloaded/certified Skill. Enforce no mixed-generation files: if any file mismatches, quarantine it, refresh entry and require reapproval where the manifest changed; never silently combine old and new file versions.

**Acceptance:** Correct root plus malicious late-read script is blocked on read; mixed-generation multi-file reads cannot pass as one release; partial verify UI is honest; first-party publish fails if any stored file hash mismatches.

### Pass 16 — Directory listing completeness and dynamic resource budgets

**Gap:** Directory listing was described but not given a bounded pagination/empty-partial rule, leaving dynamic Skill browsing vulnerable to infinite cursors, confusing parent/child paths and hidden size growth.

**Correction:** Only call `resources/directory/read` after `directoryRead: true`; the directory resource MUST use `mimeType: inode/directory` and the method returns direct children with paginated `resources` and `nextCursor` under the pinned base version. Apply bounded pagination, cursor loop detection, deduplication, containment, and actor-specific permissions on **each child**. A static held entry may satisfy child enumeration locally from its manifest and MUST NOT expose directory items absent from the held entry until a refreshed entry and renewed approval permit them. A dynamic Skill cannot assert full-tree integrity; track cumulative bytes/file counts, digest actual captured bytes internally for audit, label them observed rather than manifest-verified, and prevent directory cycling/fan-out abuse.

**Acceptance:** Nested directory pagination and directory-read disabled path pass; duplicate/looping cursor stops deterministically; a new file found mid-window is not surfaced as part of a static Skill; dynamic reads halt safely at the byte budget.

### Pass 17 — Import/export rights, immutable publishing and egress boundaries

**Gap:** Spec 221 already handles package export; a new MCP export switch risks bypassing downstream rights, licensing revocations or hidden secrets through separately addressable files and the optional directory endpoint.

**Correction:** An MCP-published Skill is a **distribution projection** of an immutable approved Spec 221 release, never a mutable copy with its own owner. Require explicit effective external-distribution rights on **every file and nested dependency**, reconcile imported third-party license against the requested tenant/Marketplace use, and generate a release-scoped service manifest from exactly the R2 bytes approved for export. Before advertising, server-side enumerate every path and compare to the manifest; deny unknown resources even when direct URI guessed. Presigned URLs are internal transport only, never a substitute for the ingress ACL; no cross-user shared plaintext cache. For public paid Skills, state the business limitation: once complete instructions are legitimately delivered, future offline reuse/copying may be technically uncontrollable; choose licensing, short-lived grants and **paid execution services**, not an unenforceable per-read revenue claim. Store content-access audit and royalty/ledger ownership using existing Spec 207 and marketplace contracts.

**Acceptance:** One disallowed nested file blocks export, direct read and directory enumeration; revoked license blocks new remote fetches and receipts; crash before DB publish leaves no advertised half-package; ledger never charges an unexecuted local read without declared policy.

### Pass 18 — Resource exhaustion, prompt-injection boundaries and egress

**Gap:** Generic scanning is necessary but cannot enforce runtime/tool separation after instructions reach a model or preclude malicious auxiliary file content embedded in previews and indexes.

**Correction:** The remote Skill is always **lower trust than platform/tenant policy**, whether supplied by `server/discover` instructions, `skills/get`, RAG snippets or `resources/read`. Separate model-readable instructions from executable assets by MIME sniffing, script quarantine, output sanitization, untrusted citation/provenance labelling and sandbox read-only mounts where appropriate. Grant no new network, shell, filesystem, secret or cross-server connector capability based on Skill text alone. Route all actions via current Capability Resolver and existing per-action approval with immutable actor/tenant/tool-input fingerprints. Add per-source circuit breakers, total concurrent-import limits, request-byte rate caps, antivirus/archive policy when archive assets are embedded, SSRF and Unicode/path canonicalization guards; a source that repeatedly violates digests is quarantined pending manual review. Track vendor egress before retrieval or execution, not retroactively.

**Acceptance:** Skill text requesting hidden-policy exfiltration or unauthorized installs cannot call Tools; script file renamed `.md` is flagged; nested path traversal/encoded bypass and compressed payload bombs are rejected; a quarantined upstream cannot be used from a still-indexed Vectorize hit.

### Pass 19 — Client/server feature detection, protocol adapter isolation and rollback

**Gap:** An inbound `/v1/mcp` server that advertises a modern extension to a legacy MCP client, or assumes every modern client can render a loaded Skill, creates inconsistent UX and protocol errors.

**Correction:** Bind exact observed modern `server/discover`, MCP `2026-07-28` semantics and optional `directoryRead` to a **separate Spec 199 version-gated adapter**. Do not add unstable methods to the legacy `initialize` path; do not silently downgrade OAuth/resource validation to make an old client work. An old client may continue using approved MCP Tools/Resources/Prompts without understanding Skills, while a new host must demonstrate a real list → get → verify → approve → read → act trace before being labelled certified. Use flags by protocol adapter, connection/tenant and publishing scope; modern Skills OFF cannot disable existing MCP core features. Roll out private pilot, independent security gate, then tenant/Marketplace canary with reversible metadata migration and emergency revoke. Explicitly report unsupported client, unsupported server, declined dynamic Skill and incompatible base revision as different errors.

**Acceptance:** One real certified and one real unsupported client tested with on-wire traces; fail-safe protocol downgrade and OAuth regression checked; rollback restores old adapter without weakening revocation or half-publishing a release.

### Pass 20 — Operational evidence, cross-Spec authority and completion definition

**Gap:** A second design-review cycle could be misinterpreted as new operational test coverage; repository ownership and original-Spec constraints require an auditable handoff for production implementation.

**Correction:** Keep the project source of truth unchanged: PostgreSQL metadata/ACL/ledger, R2 immutable files, Vectorize rebuildable index, Spec 221 Skill Registry and lifecycle, Spec 199 inbound/outbound MCP protocol, existing Feature 196 / 209 / 215 orchestration, existing approvals and `worker_jobs`. Specs 1–213 remain untouched in original source; the active Spec 224 contract is not rewritten; issue *additive* implementation PRs, compatibility adapters and regression tests instead. Maintain a cross-Spec impact sheet naming owner, current deployed revision, required interface, acceptance artifact and rollback. Every production claim MUST have a test-case-to-wire-fixture-to-CI-evidence chain, negative tests, independent review, current license/protocol snapshots, and a distinct `DESIGN_AUDITED` vs `IMPLEMENTED` vs `LIVE_CERTIFIED` status. Verify the proposed **248** number against the actual repository registry/branches/worktrees before merging.

**Acceptance:** All `CON-01`–`CON-45` automated and real interoperability evidence captured (or P1/P2 test explicitly scoped from the P0 release), no skipped release-critical security test, original-Spec diff guard passes, real server/client traces and rollback drill attached. No claim of production quality solely from this MD document.

## 18. R1.2 new mandatory acceptance cases

| ID | Scenario | Required oracle |
|---|---|---|
| CON-31 | Static manifest exactly 512 resources and 16 MiB; invalid 513/over-limit and overflow | Host accepts permitted boundary; oversized rejects clearly; no overflow/DoS |
| CON-32 | Dynamic Skill streaming cumulative 16 MiB with disconnect/reconnect | Per-load actual bytes enforced across all reads/retries; no accounting reset |
| CON-33 | Nested independent Skills, same-name skills in one/many origins, local Skills collision | Origin/path disambiguation; no shadowing, implicit nested grant or alias theft |
| CON-34 | `skill://` path/name mismatch and alternative URI scheme | Conventional mapping validated; opaque alternative URI verified by serving connection |
| CON-35 | Extra valid YAML fields, reserved `_meta` prefix, malicious aliases and root mismatch | Lossless data handling, no unsafe YAML execution/expansion, namespace respect |
| CON-36 | Metadata-only verification vs actual per-file byte verification | UI, audit and gateway never call unfetched files `VERIFIED_BYTES` |
| CON-37 | Late auxiliary-file mismatch while held static root is in model context | No unverified byte exposed; re-get and changed-manifest reapproval mandatory |
| CON-38 | Directory direct-child listing with pagination/cursor cycle/revocation | No implicit recursion, new static file leakage, unbounded pagination or ACL bypass |
| CON-39 | Immutable first-party R2 publication with withheld file and guessed read URI | Incomplete release not advertised and hidden file never readable |
| CON-40 | Cached entry plus immediate kill-switch during paused job/remote load | Canonical policy epoch denies subsequent reads and tool effects despite TTL |
| CON-41 | Same-name remote source reconnect with rotated server identity | No previous source approval/name binding reused |
| CON-42 | Malicious script disguised as text and prompt-injected auxiliary document | Cannot grant tool scope, access hidden prompts or skip independent approval |
| CON-43 | Distributed simultaneous import, quota and circuit-breaker failure | Bounded work, isolated tenant fairness and idempotent recovery |
| CON-44 | Real modern and real legacy client, downgrade attempt, rollback | Correct capability negotiation, OAuth safety and unaffected legacy MCP |
| CON-45 | Implementation evidence chain and immutable-Spec repository diff guard | Required gates backed by CI/wire traces and no edits to original 1–213/active 224 |

### 18.1 Release sequencing and explicit deferments

**P0 production gate:** complete `CON-01`–`CON-05`, `CON-07`–`CON-12`, `CON-14`–`CON-17`, `CON-20`–`CON-26`, `CON-28`–`CON-31`, `CON-33`–`CON-37`, `CON-39`–`CON-42`, `CON-44`–`CON-45` relevant to enabled features, plus independent security review. For dynamic Skill loading and optional directory read, keep OFF until all associated tests, particularly `CON-06`, `CON-08`, `CON-27`, `CON-32`, `CON-38` pass. Marketplace-paid export remains OFF until `CON-13`, `CON-19`, `CON-39` and explicit licensing/ledger tests pass. A gate may be genuinely inapplicable only when the capability is entirely disabled and **not advertised**; record evidence of disabled-path negative tests.

**Evidence record:** For each case capture exact stable spec revision/commit, exact MCP base schema, Spec 248 revision/commit, code/adapter SHA, scoped connection and tenant (redacted), input fixture, raw protocol trace (sanitized), expected/observed, deterministic replay or fault injection where relevant, reviewer, remediation owner and UTC timestamp. Static specification audit is not implementation evidence.

### 18.2 Exit criteria and remaining external blockers

- Do not enable any Skills method until `server/discover` + Resources capability and base `2026-07-28` adapter are genuinely deployed and tested, with per-client negotiation evidence.
- Audit rights and every file of any exported Skill; internal previews, RAG search and directory listing are never distribution-authority substitutes.
- Implement a transactional publication and revocation epoch first; test kill-switch from multiple replicas and the previously paused `worker_jobs` path.
- Verify actual SmartSpecPro registry/branches/worktrees before finalizing proposed spec number 248; adjust **only the new spec** if occupied.
- Track open blockers as `NOT_IMPLEMENTED` / `NOT_TESTED` / `BLOCKED_EXTERNAL`, not as release-complete or implied conformance.
