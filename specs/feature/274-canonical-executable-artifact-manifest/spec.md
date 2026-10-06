---
spec_id: 274
title: Canonical Executable Artifact Manifest & Lightweight Integrity Contract
numbering_status: CANONICAL_ID_PRESERVED_AFTER_COLLISION_REVIEW
status: PROPOSED_ADDITIVE_BACKWARD_COMPATIBLE
recovery_note: Recovered from prior canonical artifact; conflicting Longdo map draft renumbered to Spec 290.
---

# Spec 274 --- Canonical Executable Artifact Manifest & Lightweight Integrity Contract

**Status:** Proposed / Additive / Backward-Compatible\
**Scope class:** Thin standardization layer --- **no new infrastructure
subsystem**\
**Primary goal:** Standardize the minimum metadata needed for SmartAIHub
Skills, Plugins, Mini Apps, Workflows, Agents, Harness adapters, and
executable packages so existing systems can discover capabilities,
evaluate permissions, select runtimes, and verify artifact integrity
consistently.

------------------------------------------------------------------------

## 1. Executive Decision

SmartAIHub SHALL adopt one small canonical manifest contract for
executable artifacts.

This specification SHALL **NOT** create: - a new artifact registry; - a
new trust service; - a new marketplace; - a new package manager; - a new
runtime; - a new capability registry; - a new secrets system; - a new
federation protocol; - an AT Protocol dependency; - a new signing PKI; -
a new database solely for manifests; - mandatory migration of existing
artifacts.

Existing SmartAIHub Marketplace, Capability Registry, Skill-first
routing, Development Runtime, Runner, Cloudflare runtime, Secret Broker,
and Mini App infrastructure remain authoritative.

The manifest is metadata consumed by those systems, not another control
plane.

------------------------------------------------------------------------

## 2. Motivation

SmartAIHub already supports or plans multiple executable artifact types:

-   Skill
-   Plugin
-   Mini App
-   Workflow
-   Agent
-   Harness / external-agent adapter
-   MCP integration
-   Data connector
-   reusable execution package

Without a common minimum contract, each subsystem can independently
invent fields for:

-   identity;
-   version;
-   capabilities;
-   permissions;
-   supported execution runtimes;
-   integrity digest;
-   compatibility.

That creates schema duplication and increases coupling.

Spec 274 solves only this duplication problem.

### 2.1 Design principle

> **One manifest, existing systems, no additional platform layer.**

The manifest describes an artifact. It does not own execution,
discovery, billing, secrets, permissions, deployment, or lifecycle.

------------------------------------------------------------------------

## 3. Relationship to Existing Architecture

### 3.1 Existing systems remain authoritative

  -----------------------------------------------------------------------
  Concern                 Authoritative system    Spec 274 role
  ----------------------- ----------------------- -----------------------
  Development             Spec 224                Supplies metadata only
  orchestration                                   

  Skill-first capability  Spec 256                Supplies normalized
  resolution                                      capability declarations

  Agent/package           Spec 261                Supplies common package
  distribution                                    metadata where useful

  Cloudflare execution    Existing                Declares supported
  placement               Cloudflare/runtime      runtime targets only
                          specs                   

  Secret                  Spec 272                Declares secret
  storage/brokerage                               requirements by
                                                  reference only

  Mini App                Existing Mini App       Supplies common
  packaging/deployment    standards               executable metadata

  Marketplace /           Existing marketplace    Optional display/index
  entitlement / billing   system                  metadata only

  Approval/policy         Existing                Supplies requested
                          policy/approval system  permissions only

  Runner / worker_jobs    Existing execution      Supplies runtime
                          control plane           compatibility only
  -----------------------------------------------------------------------

### 3.2 Dependency direction

``` text
Artifact
   │
   └── canonical manifest
            │
            ├── Spec 256 may read it
            ├── Spec 224 may generate/read it
            ├── Marketplace may index it
            ├── Runtime Resolver may read it
            ├── Policy Engine may read requested permissions
            └── Installer may verify digest
```

There SHALL NOT be a new mandatory service between these components.

------------------------------------------------------------------------

## 4. Non-Goals

Spec 274 explicitly does **not** attempt to implement the broader EmDash
registry architecture.

The following are deferred unless a future demonstrated requirement
justifies them:

1.  decentralized registries;
2.  AT Protocol;
3.  registry federation;
4.  publisher-owned remote release ledgers;
5.  global cryptographic publisher identity;
6.  transparency logs;
7.  Merkle inclusion proofs;
8.  dedicated artifact trust fabric;
9.  mandatory artifact signing;
10. independent provenance service;
11. cross-marketplace settlement;
12. replacement of npm, pip, OCI, GitHub, MCP, or existing package
    mechanisms.

A future specification MAY extend the manifest without changing this
contract.

------------------------------------------------------------------------

## 5. Canonical Manifest

### 5.1 File

Preferred filename:

``` text
smartaihub.manifest.yaml
```

JSON representation MAY also be accepted:

``` text
smartaihub.manifest.json
```

The logical schema MUST be equivalent.

### 5.2 Minimum manifest

``` yaml
schema_version: "1"

id: "video.translate"
type: "skill"
version: "1.2.0"

capabilities:
  - "media.translate"

runtime:
  supported:
    - "cloudflare.worker"
    - "cloudflare.container"
    - "desktop.runner"

permissions:
  network:
    allowed_hosts:
      - "api.openai.com"

integrity:
  algorithm: "sha256"
  digest: "..."
```

### 5.3 Core fields

#### Required for newly manifest-aware artifacts

-   `schema_version`
-   `id`
-   `type`
-   `version`

#### Optional

-   `name`
-   `description`
-   `publisher`
-   `capabilities`
-   `runtime`
-   `permissions`
-   `secrets`
-   `integrity`
-   `compatibility`
-   `entrypoints`
-   `metadata`

Optional means absence MUST NOT automatically make an existing artifact
invalid.

------------------------------------------------------------------------

## 6. Artifact Types

Initial normalized values:

``` text
skill
plugin
mini_app
workflow
agent
harness
mcp
connector
package
```

Unknown future types MAY be carried as namespaced values.

Example:

``` text
vendor.example_type
```

Consumers MUST use tolerant parsing and MUST NOT fail merely because an
unknown artifact type exists unless execution specifically requires
understanding that type.

------------------------------------------------------------------------

## 7. Capability Declaration

Capabilities describe **what the artifact can do**.

They SHALL NOT determine whether the artifact is allowed to do it.

Example:

``` yaml
capabilities:
  - media.read
  - media.translate
  - media.write
```

Spec 256 or the existing Capability Resolver remains responsible for
routing and selection.

### 7.1 No duplicate capability database

Implementers MUST NOT create another capability catalog solely for Spec
274.

Existing capability records MAY cache or normalize manifest fields.

------------------------------------------------------------------------

## 8. Permission Declaration

Permissions describe **requested access**, not granted access.

Example:

``` yaml
permissions:
  storage:
    read:
      - project.media
    write:
      - project.outputs

  network:
    allowed_hosts:
      - api.openai.com

  external_actions:
    email.send: approval_required
```

The existing SmartAIHub policy/approval system remains authoritative.

A manifest MUST NOT be able to self-grant a permission.

### 8.1 Fail-safe rule

``` text
manifest request ≠ authorization
```

Runtime authorization MUST be derived from existing policy, tenant,
user, project, entitlement, approval, and execution context.

------------------------------------------------------------------------

## 9. Secret Requirements

Manifest files MUST NOT contain plaintext secrets.

Allowed:

``` yaml
secrets:
  required:
    - provider.openai
```

Forbidden:

``` yaml
secrets:
  OPENAI_API_KEY: "sk-..."
```

Spec 272 or its implemented secret broker remains authoritative.

A runtime MAY resolve a logical secret reference into brokered provider
access without exposing plaintext credentials to the artifact.

------------------------------------------------------------------------

## 10. Runtime Declaration

Capabilities and execution placement SHALL remain separate concepts.

``` yaml
runtime:
  supported:
    - cloudflare.worker
    - cloudflare.container
    - desktop.runner

  preferred:
    - cloudflare.worker
```

The manifest expresses compatibility/preference only.

The existing Runtime Resolver chooses the actual execution location
based on:

-   availability;
-   policy;
-   resource needs;
-   user configuration;
-   cost;
-   data locality;
-   required devices;
-   secrets;
-   tenant constraints;
-   runtime health.

The artifact SHALL NOT force a runtime merely by declaring `preferred`.

------------------------------------------------------------------------

## 11. Entrypoints

Optional entrypoints allow an existing execution system to understand
how the artifact exposes functionality.

Example:

``` yaml
entrypoints:
  - name: translate_video
    capability: media.translate
    kind: skill
```

Spec 274 does not define a new invocation protocol.

Each existing subsystem continues to use its existing invocation
contract.

------------------------------------------------------------------------

## 12. Integrity Digest

For packaged executable artifacts, SmartAIHub SHOULD support SHA-256
verification.

Example:

``` yaml
integrity:
  algorithm: sha256
  digest: "7ab..."
```

### 12.1 Purpose

The digest answers only:

> "Are these bytes the artifact version we expected?"

It does **not** answer:

-   Is the publisher trustworthy?
-   Is the code safe?
-   Was the source repository compromised?
-   Is the artifact authorized?

Those remain separate concerns.

### 12.2 Verification

Where a digest is available:

``` text
fetch/read artifact
      ↓
calculate digest
      ↓
compare expected digest
      ↓
match → continue
mismatch → fail closed
```

A digest mismatch MUST prevent execution of that resolved artifact
version.

### 12.3 Legacy behavior

Existing artifacts without a digest SHALL continue under their existing
trust/execution policy.

No forced migration is introduced by Spec 274.

------------------------------------------------------------------------

## 13. Publisher Metadata

Optional:

``` yaml
publisher:
  id: "user_123"
```

The value SHALL reference the existing SmartAIHub identity/account model
where applicable.

Spec 274 SHALL NOT create a parallel publisher identity system.

Future signature support MAY extend this object.

------------------------------------------------------------------------

## 14. Compatibility

Optional:

``` yaml
compatibility:
  smartaihub:
    min: "2026.10"
```

Compatibility declarations SHOULD remain minimal.

Do not create a complex dependency solver unless real package conflicts
demonstrate the need.

------------------------------------------------------------------------

## 15. Manifest Resolution

Manifest resolution SHOULD use the artifact's existing source of truth.

Examples:

``` text
Marketplace artifact record
Repository/package
Mini App package
Skill package
Installed local artifact
```

An implementation MAY store normalized manifest data in an existing
artifact/marketplace record for indexing efficiency.

It MUST NOT introduce a separate manifest database unless later
operational evidence demonstrates a concrete need.

------------------------------------------------------------------------

## 16. Backward Compatibility

This is a launch-blocking requirement.

### 16.1 Legacy artifacts

Artifacts created before Spec 274:

-   remain valid;
-   remain installable/executable according to current rules;
-   do not require immediate manifest creation;
-   do not require republishing;
-   do not require database migration solely for Spec 274.

### 16.2 Adapter behavior

Where an existing artifact already exposes equivalent metadata, a
compatibility adapter MAY produce an in-memory canonical representation.

``` text
legacy metadata
      ↓
thin adapter
      ↓
CanonicalManifest object
```

Do not rewrite the original artifact unless necessary.

### 16.3 New artifacts

Spec 224 and other creation flows SHOULD emit the canonical manifest for
newly generated executable artifacts once support is available.

This adoption MAY be progressive.

------------------------------------------------------------------------

## 17. Progressive Enforcement Levels

To prevent rollout disruption:

### Level 0 --- Legacy

No manifest.

Existing behavior remains unchanged.

### Level 1 --- Descriptive

Manifest exists but is informational.

### Level 2 --- Integrity-aware

Digest is verified where present.

### Level 3 --- Policy-aware

Existing policy engine consumes declared permission requirements.

### Level 4 --- Strict publishing

Only selected future marketplace/public publishing flows MAY require
mandatory manifest fields.

Moving between levels requires explicit rollout decisions and test
evidence.

Spec 274 itself SHALL NOT silently elevate enforcement.

------------------------------------------------------------------------

## 18. Marketplace Integration

Marketplace MAY index:

-   artifact type;
-   capabilities;
-   supported runtimes;
-   version;
-   publisher reference.

Marketplace remains responsible for:

-   discovery;
-   commercial metadata;
-   price;
-   entitlement;
-   revenue sharing;
-   ratings/reviews;
-   moderation;
-   visibility.

These commercial fields SHOULD NOT be duplicated into the canonical
executable manifest unless needed for portable descriptive metadata.

------------------------------------------------------------------------

## 19. Spec 224 Integration

Spec 224 SHALL NOT be redesigned.

When generating a new executable artifact, the development runtime MAY
add:

``` text
Generate/Update Canonical Manifest
```

as a packaging/finalization step.

Final verification SHOULD validate:

1.  schema parses;
2.  declared entrypoints exist where applicable;
3.  requested capabilities are syntactically valid;
4.  no plaintext secret is embedded;
5.  digest matches when generated.

Failure in optional manifest generation MUST NOT corrupt or invalidate
an otherwise legacy-compatible artifact unless the target publication
mode explicitly requires the manifest.

------------------------------------------------------------------------

## 20. Spec 256 Integration

Spec 256 MAY consume normalized `capabilities` and permission metadata.

Spec 256 SHALL remain the capability/intent routing authority.

No new resolver is created.

``` text
User intent
    ↓
Spec 256 resolver
    ↓
existing capability records
    ↑
manifest metadata may populate/enrich them
```

------------------------------------------------------------------------

## 21. Spec 261 Integration

Where Spec 261 packages or distributes Agents/Harnesses/related
executable components, it SHOULD reuse the canonical fields instead of
defining parallel equivalents.

Spec 274 SHALL not replace the installation/package mechanisms already
implemented by Spec 261.

------------------------------------------------------------------------

## 22. Spec 272 Integration

Only logical secret requirements appear in the manifest.

``` text
Manifest
  ↓ secret reference
Existing policy
  ↓
Spec 272 Secret Broker
  ↓
Provider/API
```

No credential material SHALL be persisted in the manifest.

------------------------------------------------------------------------

## 23. Cloudflare / Desktop Runtime Integration

The same manifest MAY describe multiple compatible targets.

Example:

``` yaml
runtime:
  supported:
    - cloudflare.worker
    - cloudflare.container
    - desktop.runner
```

This avoids separate package metadata formats solely because execution
occurs in different locations.

Runtime-specific configuration MAY remain in existing runtime
configuration where appropriate.

------------------------------------------------------------------------

## 24. Database Impact

### Default decision: no new database.

Implementations SHOULD first reuse existing
artifact/skill/plugin/marketplace metadata storage.

If indexing fields are needed, add only the smallest additive nullable
columns or existing JSON metadata required by current implementation.

A dedicated Spec 274 table/database is explicitly discouraged.

Any proposed schema change MUST demonstrate that existing JSON/metadata
storage cannot meet the requirement.

------------------------------------------------------------------------

## 25. API Impact

No new public API is required.

Existing artifact/package/marketplace APIs MAY return an optional:

``` json
{
  "manifest": {}
}
```

or normalized subset where useful.

Consumers MUST tolerate absence.

------------------------------------------------------------------------

## 26. Security Rules

1.  Manifest is untrusted input until parsed and validated.
2.  Unknown fields MUST NOT imply permissions.
3.  Requested permission MUST NOT equal granted permission.
4.  Plaintext secrets MUST be rejected from publishable manifests.
5.  Digest mismatch MUST fail closed when digest verification is active.
6.  Network host declarations MUST NOT bypass runtime egress policy.
7.  Runtime declarations MUST NOT bypass placement policy.
8.  Publisher metadata MUST NOT independently establish trust.
9.  Manifest parsing MUST have bounded size/depth.
10. YAML parsing MUST use safe parsing; executable/custom YAML tags are
    prohibited.

------------------------------------------------------------------------

## 27. Schema Evolution

`schema_version` controls the manifest schema.

Rules:

-   additive optional fields SHOULD be preferred;
-   consumers SHOULD ignore unknown optional fields;
-   breaking semantic changes require a new schema major version;
-   old supported schema versions remain readable during a defined
    compatibility period;
-   no version negotiation service is introduced.

------------------------------------------------------------------------

## 28. Observability

Reuse existing logs/events.

Useful fields MAY be attached to existing execution/install events:

``` text
artifact_id
artifact_type
artifact_version
manifest_schema_version
artifact_digest
digest_verified
```

Do not create a separate telemetry pipeline.

------------------------------------------------------------------------

## 29. Implementation Plan

### Phase A --- Schema only

1.  Define canonical TypeScript/Python/Rust-compatible schema
    representation as needed by existing code.
2.  Add parser/validator.
3.  Add safe YAML/JSON parsing tests.
4.  Add compatibility adapter for one existing artifact type.
5.  No production behavior changes.

### Phase B --- New artifact emission

1.  Spec 224-generated executable artifacts MAY emit manifests.
2.  Existing packaging flow calculates digest where practical.
3.  Add Final Verify checks.
4.  Legacy artifacts remain unchanged.

### Phase C --- Read integration

1.  Spec 256 reads normalized capabilities where useful.
2.  Runtime Resolver reads supported runtimes where useful.
3.  Policy layer reads requested permissions where useful.
4.  Marketplace optionally indexes selected fields.

### Phase D --- Selective enforcement

Only after production evidence:

1.  digest verification for manifest-aware packaged artifacts;
2.  required manifest for selected new public marketplace publications;
3.  permission declaration validation.

No global mandatory migration.

------------------------------------------------------------------------

## 30. Explicit Complexity Budget

Spec 274 implementation MUST satisfy all of the following:

-   **0** new standalone services;
-   **0** new mandatory runtimes;
-   **0** new registries;
-   **0** new databases by default;
-   **0** mandatory migration of legacy artifacts;
-   **0** new public protocols;
-   **0** required decentralized dependencies;
-   **1** canonical manifest schema;
-   thin adapters only where existing metadata differs.

If implementation requires violating this budget, work MUST stop and
require a separate architectural decision.

------------------------------------------------------------------------

## 31. Acceptance Criteria

### AC-1 --- No regression

All existing artifacts that worked before Spec 274 continue to work
without modification.

### AC-2 --- Single schema

At least Skill, Plugin, and Mini App can be represented by the same core
manifest schema without losing their existing specialized metadata.

### AC-3 --- No parallel authority

Capability, policy, secrets, runtime placement, marketplace, billing,
and execution remain owned by their existing systems.

### AC-4 --- Secret safety

Publishable manifests cannot contain plaintext provider credentials.

### AC-5 --- Integrity

A manifest-aware artifact with an expected digest fails closed on digest
mismatch.

### AC-6 --- Optional adoption

Absence of a manifest does not invalidate legacy artifacts.

### AC-7 --- Runtime independence

A manifest may declare multiple supported runtimes without controlling
final placement.

### AC-8 --- Unknown-field tolerance

Older consumers safely ignore unknown optional fields.

### AC-9 --- Bounded parser

Malformed, oversized, deeply nested, or unsafe YAML/JSON manifests fail
safely.

### AC-10 --- Complexity gate

No new standalone service, registry, database, or control plane is
introduced.

------------------------------------------------------------------------

## 32. Required Tests

### Schema

-   valid minimal manifest;
-   valid extended manifest;
-   unknown optional field;
-   unsupported schema major;
-   invalid artifact type handling;
-   malformed YAML/JSON;
-   unsafe YAML tag rejection;
-   size/depth limit.

### Security

-   plaintext secret detection;
-   permission self-grant attempt ignored/rejected;
-   unsupported network target does not bypass egress policy;
-   runtime preference does not bypass placement policy;
-   digest mismatch fails closed when verification is enabled.

### Compatibility

-   legacy Skill without manifest;
-   legacy Plugin without manifest;
-   legacy Mini App without manifest;
-   compatibility adapter output;
-   mixed legacy + manifest-aware marketplace results.

### Integration

-   Spec 224 artifact generation;
-   Spec 256 capability consumption;
-   existing policy evaluation;
-   Spec 272 secret reference resolution;
-   Worker/Container/Desktop runtime selection.

------------------------------------------------------------------------

## 33. Rollback

Because Spec 274 is additive, rollback SHALL be simple:

1.  disable manifest-aware reads;
2.  stop emitting new manifests if necessary;
3.  continue using existing metadata/contracts;
4.  do not delete manifests from already packaged artifacts;
5.  preserve digest metadata for auditability.

No core execution path should depend exclusively on Spec 274 during
initial rollout.

------------------------------------------------------------------------

## 34. Future Extensions --- Explicitly Deferred

Only create future work when concrete demand exists.

Potential extensions:

-   artifact signing;
-   publisher signature verification;
-   build provenance / SBOM;
-   external registry adapters;
-   private enterprise registries;
-   decentralized publication;
-   transparency logs;
-   portable entitlement descriptors.

These are **not part of Spec 274**.

------------------------------------------------------------------------

## 35. Architectural Guardrail

Any future proposal that says:

> "Because we now have the manifest, we should build another
> registry/service/control plane..."

MUST first prove that the capability cannot be implemented by an
existing SmartAIHub subsystem.

Default decision is reuse.

------------------------------------------------------------------------

## 36. Definition of Done

Spec 274 is complete when:

-   one canonical manifest schema exists;
-   existing systems can optionally consume it;
-   new artifacts can optionally emit it;
-   integrity digest works for selected packaged artifacts;
-   permission and secret declarations are descriptive and safely
    brokered;
-   legacy execution remains unchanged;
-   no new infrastructure subsystem was created.

The intended outcome is **less duplication, not more architecture**.

------------------------------------------------------------------------

## 37. Final Architecture

``` text
                   Existing SmartAIHub
                         │
          ┌──────────────┼──────────────┐
          │              │              │
        Skill          Plugin        Mini App
          │              │              │
          └──────────────┼──────────────┘
                         │
               Canonical Manifest
                    (Spec 274)
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
 Existing Spec 256  Existing Policy  Existing Runtime
 Capability Resolver     Engine          Resolver
        │                │                 │
        └────────────────┼─────────────────┘
                         │
                  Existing Runner
                         │
          ┌──────────────┼──────────────┐
        Worker        Container       Desktop
```

**No additional control plane is inserted.**
