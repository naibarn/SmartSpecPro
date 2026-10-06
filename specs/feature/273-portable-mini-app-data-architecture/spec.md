# Spec 273 — Portable Mini App Data Architecture, Database Authority, Storage Resolution & Migration Control

**Status:** Implementation-ready — R1.1 after 12-pass gap review  
**Revision:** R1.1 / 2026-10-02  
**Spec type:** Additive platform architecture / Mini App data plane / Spec 224 integration contract  
**Date:** 2026-10-02  
**Primary systems:** SmartAIHub Mini Apps, Spec 224 Development Orchestrator Runtime, Mini App runtime/package layer, Cloudflare runtime, SmartAIHub Desktop/Runner  
**Related specs:** Spec 224, Spec 232/245/267, Spec 256, Spec 269, Spec 271, Spec 272 and the current Mini App / Marketplace / Multi-tenant architecture  
**Normative language:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY are normative requirements.

---

## 1. Executive Summary

SmartAIHub MUST NOT treat PostgreSQL, Cloudflare D1, SQLite, Microsoft SQL Server, MySQL, or any other specific database product as the universal database contract for Mini Apps.

The canonical design is:

> **Portable Data Contract First → Storage Resolver → Runtime/Deployment Adapter → Concrete Database**

The platform MUST allow all of the following without changing the fundamental Mini App architecture:

1. A stateless Mini App with no database.
2. A Mini App using SmartAIHub-managed Cloudflare D1.
3. A portable/local Mini App using SQLite.
4. A high-scale Mini App using PostgreSQL.
5. A Mini App connecting to a user-owned PostgreSQL database.
6. A Mini App connecting to a user-owned MySQL database.
7. A Mini App connecting to a user-owned Microsoft SQL Server.
8. A Mini App using another supported external database.
9. A Mini App reading an existing enterprise database without changing it.
10. A Mini App writing application data into an existing database.
11. A Mini App managing schema migrations on a user-owned database.
12. A Mini App replacing an existing system, redesigning its schema, migrating data, cutting over, and retiring the legacy schema where the user explicitly grants the required authority.

Cloudflare D1 SHOULD be the default managed relational backend for small/normal Cloudflare-hosted Mini Apps when its capability and workload profile fit.

SQLite SHOULD be the default local/desktop/container relational backend where a single-node SQLite-compatible deployment is appropriate.

PostgreSQL remains SmartAIHub's platform System of Record / control-plane database and MAY also be used as a Mini App backend where workload, feature, scale, or tenant requirements justify it.

Spec 273 MUST NOT reduce user capability merely because a database is externally owned. Instead, access and mutation MUST be controlled by an explicit **Intent + Authority + Risk** model.

Spec 224 is already implemented and MUST NOT be redesigned wholesale. Spec 273 therefore introduces additive contracts and fail-closed compliance gates that Spec 224 MUST consume before a Mini App can reach Final Verify or deployment.

---

# 2. Problem Statement

SmartAIHub is evolving from a fixed application into a platform where users, creators, agents, and tenants can generate many Mini Apps.

If each generated Mini App creates arbitrary tables in the main SmartAIHub PostgreSQL database, several problems appear:

- uncontrolled schema growth;
- unused tables from abandoned experiments;
- migration conflicts;
- index and catalog bloat;
- backup and restore complexity;
- coupling between application lifecycle and platform control-plane lifecycle;
- poor tenant isolation;
- difficult app deletion/export;
- inability to move Mini Apps to another runtime or infrastructure;
- tight coupling between Spec 224 generated code and a particular database provider.

Conversely, making D1 mandatory would create a different problem:

- Mini Apps become Cloudflare-dependent;
- source code may depend on D1 bindings;
- moving to Desktop, Docker, VPS, another cloud, or customer infrastructure becomes harder;
- user-owned databases become second-class citizens.

Making SQLite mandatory would also be insufficient:

- shared/multi-instance cloud workloads may outgrow a single SQLite file;
- enterprise customers may already use PostgreSQL, MySQL, SQL Server, or managed databases;
- some users may explicitly want a new Mini App to replace an existing system and take full schema ownership.

Therefore SmartAIHub needs a provider-neutral Mini App data architecture.

---

# 3. Core Architectural Decision

## 3.1 Canonical rule

Mini App application logic MUST target the **SmartAIHub Portable Data Contract** by default.

It MUST NOT target a concrete provider API unless the Mini App explicitly declares a provider-specific portability mode.

The platform architecture is:

```text
                         Mini App
                            |
                            v
                SmartAIHub Portable Data Contract
                            |
                            v
                     Storage Resolver
                            |
          +-----------------+-------------------+
          |                 |                   |
          v                 v                   v
      Managed           Local/Self-host       External/BYODB
          |                 |                   |
     +----+----+         SQLite        +---------+----------+
     |         |                       |         |          |
     D1    PostgreSQL               PostgreSQL  MySQL     MSSQL
                                      /other supported engines
```

## 3.2 Separation of responsibilities

### PostgreSQL platform control plane

The SmartAIHub platform PostgreSQL database SHOULD contain:

- users;
- tenants;
- Mini App registry;
- Mini App versions;
- deployments;
- installations;
- storage bindings;
- database connection metadata;
- authority grants;
- migration run metadata;
- approvals;
- billing/credits;
- audit;
- resource lifecycle metadata.

It MUST NOT automatically contain arbitrary per-Mini-App business tables.

### Mini App data plane

Mini App application data MAY live in:

- D1;
- SQLite;
- PostgreSQL;
- MySQL;
- Microsoft SQL Server;
- other future adapters;
- multiple stores at the same time where explicitly declared.

### Secret plane

Secrets MUST be resolved through Spec 272.

Spec 273 MUST store references and non-secret metadata only.

---

# 4. Design Principles

## P1 — Data Contract First

Application code in P1 portable mode MUST depend on a logical data capability rather than a database provider. P2 MAY use the Portable SQL Profile; P3/P4 MAY use explicitly declared provider-specific capabilities.

Example:

```ts
const db = ctx.data.primary;

const customer = await db
  .table("customers")
  .where({ id: customerId })
  .first();
```

The default generated application code SHOULD NOT contain provider-specific calls such as:

```ts
env.DB.prepare(...)
new Pool(...)
new sql.ConnectionPool(...)
mysql.createConnection(...)
sqlite3(...)
```

unless the manifest explicitly declares a provider-specific mode.

---

## P2 — No unnecessary resource provisioning

Creating a Mini App MUST NOT automatically create a database.

Default lifecycle:

```text
CREATE MINI APP
      |
      v
UNPROVISIONED
      |
      | first persistent requirement / deployment requirement
      v
PROVISIONING
      |
      v
ACTIVE
```

A Mini App that remains stateless SHOULD consume no relational database resource.

---

## P3 — D1 is a backend, not the contract

Cloudflare D1 MAY be the preferred managed relational backend for eligible Cloudflare-hosted Mini Apps.

Mini App source code MUST NOT be forced to depend on D1 bindings merely because the Cloudflare deployment uses D1.

---

## P4 — BYODB is first-class

Users MAY bring their own database.

Supported first-class categories SHOULD include:

- PostgreSQL;
- MySQL;
- Microsoft SQL Server;
- SQLite/local file;
- future adapters.

The connection target MAY be:

- a new empty database;
- an existing application database;
- a replica/read-only database;
- a database the user expects SmartAIHub to fully redesign.

---

## P5 — External ownership does not imply read-only

A user-owned database MAY grant:

- read-only access;
- data write access;
- DDL access;
- schema migration authority;
- destructive change authority;
- full system replacement/cutover authority.

The platform MUST govern these by explicit authority, not by assuming that external databases are immutable.

---

## P6 — Capability is not safety authority

A connector being technically capable of `DROP TABLE` MUST NOT imply that the current run is authorized to execute `DROP TABLE`.

The platform MUST distinguish:

```text
connector capability
        !=
granted authority
        !=
run-specific approval
```

---

## P7 — Preserve portability by default

Spec 224 SHOULD generate the highest practical portability level unless the requested functionality requires a lower portability level or the user explicitly chooses a provider-specific implementation.

Portability MUST NOT be silently downgraded.

---

## P8 — Destructive work is allowed when authorized

SmartAIHub MUST be able to support complete replacement of a legacy system, including schema redesign and cutover.

The platform MUST NOT prohibit destructive database operations categorically.

Instead, destructive operations MUST pass the required policy, impact analysis, backup/rollback, approval, and verification gates.

---

## P9 — Enforcement before execution, not only at Final Verify

Architecture validation at Final Verify is necessary but insufficient.

Every mutating database action initiated by Spec 224, a sub-agent, an external harness, a Skill, MCP tool, Runner, or Mini App migration MUST pass a runtime **Database Policy Interceptor** before execution.

The interceptor MUST evaluate at least:

```text
actor / principal
tenant
installation
binding
environment
intent
authority grant
operation
risk
approval state
schema fingerprint / precondition
```

A generated SQL statement MUST NOT become executable merely because it exists in an implementation artifact.

---

## P10 — Authority is scoped, expiring, and environment-specific

Authority levels A0–A5 describe maximum capability, but every grant MUST also carry a scope.

A production A3 grant MUST NOT automatically authorize the same operation against another database, schema, tenant, installation, or environment.

---

## P11 — Multi-store applications are first-class

A Mini App MAY use more than one data binding, for example:

```text
primary relational DB
analytics DB
legacy read-only DB
object store
vector store
cache/state store
```

The manifest MUST name roles and MUST NOT assume one physical database per Mini App.

---

## P12 — Cross-store atomicity is not implied

The Portable Data Contract MUST NOT pretend that a transaction can atomically span unrelated D1, SQLite, PostgreSQL, MSSQL, MySQL, R2, Vectorize, queues, or external APIs.

Cross-resource workflows MUST use explicit patterns such as:

```text
outbox
inbox/idempotency
saga/compensation
checkpointed workflow
reconciliation
```

where required.

---

# 5. Mini App Data Manifest

Every Mini App that uses persistent data MUST have a machine-readable data manifest.

Example:

```yaml
architecture:
  contract: smartaihub-miniapp-v1
  data_contract_version: 1

portability:
  level: P1

data:
  primary:
    interface: portable-data
    backend: auto
    ownership: app
    lifecycle: managed

  objects:
    interface: object-storage
    backend: auto

  vector:
    interface: semantic-store
    backend: auto

secrets:
  mode: secret-ref
```

External SQL Server example:

```yaml
architecture:
  contract: smartaihub-miniapp-v1

portability:
  level: P1

data:
  primary:
    interface: portable-data
    backend: external
    engine: mssql
    connection_ref: dbconn_customer_erp
    ownership: user
    authority_ref: dbgrant_customer_erp_prod

secrets:
  mode: secret-ref
```

Replacement-system example:

```yaml
data:
  primary:
    backend: external
    engine: mssql
    connection_ref: dbconn_legacy_erp
    ownership: user

database_intent:
  mode: replacement
  target_system: legacy-erp
  required_authority: A5
```

---

# 6. Portability Levels

## P0 — Stateless

No persistent database.

Typical examples:

- calculators;
- converters;
- prompt utilities;
- simple AI wrappers;
- ephemeral tools.

---

## P1 — Portable Data API

Default for new Mini Apps.

Application code MUST use SmartAIHub portable data primitives.

Expected deployability:

- SmartAIHub Cloud;
- Cloudflare + D1;
- Desktop + SQLite;
- Docker/self-host + SQLite or another adapter;
- PostgreSQL;
- MySQL;
- Microsoft SQL Server where adapter capability is sufficient.

Provider-specific APIs are prohibited unless explicitly escaped.

---

## P2 — Portable SQL Profile

Application MAY issue raw SQL, but SQL MUST conform to the SmartAIHub Portable SQL Profile.

The profile SHOULD contain only syntax/features for which the selected target adapters have validated translations/compatibility.

P2 MUST NOT promise transparent portability for features that have divergent semantics.

---

## P3 — Backend Enhanced

The Mini App uses a portable core plus provider-specific enhanced capabilities.

Examples:

- PostgreSQL-specific JSON/array/extension features;
- MSSQL-specific T-SQL behavior;
- D1-specific integration;
- backend-specific full-text features.

The manifest MUST disclose the dependency.

---

## P4 — Backend Locked

The Mini App intentionally requires one backend/provider.

Examples:

```yaml
portability:
  level: P4
  required_backend: mssql
```

P4 is allowed.

Spec 224 MUST NOT describe a P4 app as portable.

---

# 7. SmartAIHub Portable Data Contract

The first implementation SHOULD provide a stable logical API rather than attempting to normalize every database feature.

Proposed namespaces:

```ts
ctx.data.primary
ctx.data.named(name)
ctx.storage.object
ctx.storage.cache
ctx.storage.vector
ctx.storage.state
ctx.secrets
```

Minimum relational operations:

```ts
db.table(name)
db.transaction(...)
db.query(...)
db.execute(...)
db.schema.inspect(...)
```

Higher-level portable operations SHOULD include:

```ts
table.find()
table.findOne()
table.insert()
table.insertMany()
table.update()
table.delete()
table.count()
query.where()
query.orderBy()
query.limit()
query.join()
```

Raw SQL MAY be available through:

```ts
db.sql(...)
```

but MUST be classified as P2/P3/P4 according to compatibility and provider-specific syntax.

---

# 8. Storage Resolver

The Storage Resolver MUST select the physical backend using declarative requirements.

Inputs SHOULD include:

```text
- portability level
- deployment target
- existing user database
- database engine requirement
- expected workload
- concurrency
- data volume
- latency
- locality/region
- tenant policy
- cost policy
- feature requirements
- authority
- ownership
- compliance constraints
- backup/recovery requirements
```

Example resolution:

```text
Cloudflare deployment
+ small/normal workload
+ portable relational
+ no existing DB
              |
              v
             D1
```

```text
Desktop
+ local-first
+ portable relational
              |
              v
           SQLite
```

```text
High concurrency
+ advanced relational
+ managed deployment
              |
              v
         PostgreSQL
```

```text
Existing customer ERP database
+ MSSQL
              |
              v
        External MSSQL
```

The resolver output MUST be explicit and reproducible. At minimum it SHOULD record:

```text
binding role
selected adapter + adapter version
physical target class
selection reasons
rejected alternatives where material
capability requirements
portability consequences
estimated resource/cost class
network placement requirement
```

The resolver MUST NOT silently migrate an existing binding to a different physical backend merely because a different backend later appears cheaper or faster. Backend change requires an explicit migration/rebind workflow.

---

# 9. Database Ownership Model

Each binding MUST declare ownership semantics.

## APP

Schema is owned by the Mini App.

The platform MAY create and migrate it within granted policy.

```yaml
ownership: app
```

## USER

Database is owned by the user/tenant.

The user MAY grant any authority level including full schema replacement.

```yaml
ownership: user
```

## SHARED

Database contains structures used by multiple systems.

Schema changes require stronger impact analysis.

```yaml
ownership: shared
```

## PLATFORM

SmartAIHub control-plane storage.

Mini App code MUST NOT directly mutate platform-owned tables.

```yaml
ownership: platform
```

---

# 10. Database Intent Model

Spec 224 MUST classify the intended use of a database before implementation.

Supported intent classes:

```text
NEW
INTEGRATE
EXTEND
MODERNIZE
MIGRATE
REPLACE
ANALYZE
READ_ONLY
```

### NEW

Build a new system and new schema.

### INTEGRATE

Use an existing database with minimal schema assumptions.

### EXTEND

Add functionality to an existing system/schema.

### MODERNIZE

Restructure and improve an existing schema while preserving the system.

### MIGRATE

Move data/schema from one backend to another.

### REPLACE

Build a replacement system and perform controlled cutover.

### ANALYZE

Use database contents primarily for analytics/research.

### READ_ONLY

Explicit read-only access.

---

# 11. Database Authority Model

Authority MUST be explicit and machine-enforced.

## A0 — No Access

No database access.

## A1 — Read

Allowed:

- schema inspection where permitted;
- SELECT;
- read metadata.

Not allowed:

- writes;
- DDL.

## A2 — Data Mutation

Allowed:

- A1;
- INSERT;
- UPDATE;
- DELETE according to run policy.

Not allowed by default:

- schema mutation.

## A3 — Schema Managed

Allowed:

- A2;
- CREATE TABLE;
- CREATE INDEX;
- ALTER compatible structures;
- controlled migrations.

Destructive schema operations still require risk policy.

## A4 — Full Database Control

Allowed:

- A3;
- destructive DDL where approved;
- DROP/TRUNCATE;
- schema replacement;
- broad data migration.

## A5 — Replacement / Cutover Authority

Highest application-level database authority.

Allowed:

- redesign target schema;
- migrate legacy data;
- dual-write or shadow operation;
- perform cutover;
- retire legacy schema/system;
- destructive post-cutover cleanup where separately authorized by policy.

A5 MUST NOT imply platform-level SmartAIHub administrative authority.

## 11.1 Authority Grant Scope

Every authority grant MUST include or resolve the following scope dimensions:

```text
principal / actor class
tenant_id
mini_app_id / installation_id
connection_id / binding_id
environment: dev | test | staging | production
database/catalog scope
schema scope
table/object scope where applicable
allowed operation classes
intent
valid_from
expires_at or run-bound lifetime
approval requirements
```

`A5` therefore means full replacement/cutover authority **within the declared scope**, not unrestricted control of the server.

Authority MUST be re-evaluated at execution time. Cached authorization decisions MUST NOT survive grant revocation or expiry beyond the platform's explicitly documented cache window.

Approval and authority MUST remain distinct:

```text
authority = what this principal may do
approval  = whether this particular high-risk action may proceed now
```

---

# 12. Risk Classification

Database operations MUST be classified independently from authority.

## R0 — Read-only

No mutation.

## R1 — Reversible data mutation

Example:

- insert/update with transaction/rollback path.

## R2 — Non-trivial schema/data mutation

Example:

- adding tables/indexes;
- backfill;
- large data transforms.

## R3 — Destructive

Example:

- drop column;
- truncate;
- mass delete;
- destructive type conversion.

## R4 — Potentially irreversible / cutover

Example:

- production database replacement;
- legacy schema retirement;
- migration with lossy transformation;
- cutover that changes the system of record.

---

# 13. Intent + Authority + Risk Decision Model

Execution permission MUST NOT be derived from any one dimension alone.

Example:

```text
intent = REPLACE
authority = A5
risk = R4
```

This is valid, but MUST invoke the replacement/cutover workflow.

Example:

```text
intent = ANALYZE
authority = A1
risk = R0
```

Normal read workflow.

Example:

```text
intent = EXTEND
authority = A2
requested operation = ALTER TABLE
```

MUST fail as:

```text
DATABASE_AUTHORITY_INSUFFICIENT
```

unless authority is elevated through the approved flow.

---

# 14. Destructive Database Operations

The system MUST NOT globally prohibit destructive operations.

For R3/R4 operations, the execution plan MUST consider:

1. authority verification;
2. affected object discovery;
3. dependency analysis;
4. impact estimation;
5. backup/snapshot/export capability;
6. dry run where possible;
7. rollback strategy;
8. approval policy;
9. execution fencing;
10. post-execution validation;
11. audit evidence.

Examples:

```text
DROP TABLE
DROP DATABASE
TRUNCATE
DROP COLUMN
mass DELETE
mass UPDATE
schema rewrite
lossy migration
```

No LLM or external agent MAY bypass these gates merely because it generated the SQL.

For R3/R4 actions, the Database Policy Interceptor MUST create an execution decision before the database driver receives the operation.

Where an operation crosses an irreversible barrier, the workflow MUST persist a durable checkpoint immediately before execution and MUST record whether rollback is technically possible or whether recovery requires restore/forward-fix.

---

# 15. Migration / Replacement Workflow

For `MIGRATE`, `MODERNIZE`, or `REPLACE` intents, Spec 224 SHOULD orchestrate:

```text
DISCOVER
   |
   v
SCHEMA SNAPSHOT
   |
   v
DEPENDENCY ANALYSIS
   |
   v
TARGET DESIGN
   |
   v
DATA MAPPING
   |
   v
MIGRATION PLAN
   |
   v
BACKUP / RECOVERY CHECK
   |
   v
DRY RUN / TEST MIGRATION
   |
   v
VALIDATION
   |
   v
SHADOW / DUAL-WRITE (when appropriate)
   |
   v
CUTOVER APPROVAL
   |
   v
CUTOVER
   |
   v
POST-CUTOVER VERIFY
   |
   v
RETIRE LEGACY (optional/separate authority)
```

The exact workflow MAY vary by database engine and system constraints.

Migration planning MUST additionally evaluate:

```text
table/data size
expected lock duration
online-vs-offline DDL support
application write traffic during migration
CDC/change capture availability
dual-write feasibility
write-freeze requirement
downtime window
replication lag
sequence/identity transfer
trigger/procedure dependencies
large-object handling
retry/resume checkpoints
```

Long-running migrations MUST be resumable or explicitly classified as non-resumable.

A retry MUST NOT replay a completed destructive step. Migration steps therefore MUST have stable step IDs, idempotency semantics, durable receipts, and postcondition checks.

For online replacement, the plan MUST define a source-of-truth transition point and how writes occurring during copy are reconciled before cutover.

## 15.1 Application Version / Schema Version Compatibility

A Mini App deployment MUST declare the schema version range it can safely operate against.

Recommended metadata:

```text
app_version
schema_version
minimum_compatible_schema
maximum_compatible_schema
migration_set_version
```

Rolling or zero-downtime deployments SHOULD use expand/contract evolution where feasible:

```text
expand schema
 -> deploy code compatible with old+new shape
 -> backfill
 -> switch reads/writes
 -> verify
 -> contract/remove legacy shape
```

The platform MUST NOT route an app version to a database schema known to be incompatible.

Destructive contract steps SHOULD occur only after no active deployment depends on the removed shape.

---

# 16. Lazy Provisioning

Managed databases MUST be provisioned lazily by default.

Creation of:

- Mini App definition;
- draft;
- initial source generation;
- UI preview;

MUST NOT automatically create D1/PostgreSQL resources unless required.

Provisioning triggers MAY include:

- deployment requiring persistence;
- first persistent write;
- explicit creator request;
- migration/import request;
- installation requiring isolated tenant storage.

"Lazy" means **not provisioned merely because the Mini App definition exists**. It does not require the platform to wait until the first end-user write.

For production applications with required persistence, the preferred flow SHOULD provision and validate storage before the deployment becomes ready to receive traffic.

If first-write provisioning is used, it MUST be concurrency-safe. Competing first writes MUST converge on one binding/resource using an idempotency key, unique binding identity, lease/fencing, or equivalent mechanism. Failed provisioning MUST be resumable/cleanable without producing duplicate orphan databases.

---

# 17. Installation-Level Isolation

A Mini App definition MUST NOT be assumed to map one-to-one to a physical database.

The model SHOULD be:

```text
Mini App Definition
       |
       +-- Version
       |
       +-- Installation / Deployment
                |
                +-- Data Binding(s)
```

Marketplace example:

```text
CRM Mini App
   |
   +-- Tenant A -> D1 A
   +-- Tenant B -> PostgreSQL B
   +-- Tenant C -> MSSQL C
   +-- Desktop user -> SQLite file
```

This separation is mandatory for portable Marketplace distribution.

## 17.1 Multiple Named Data Bindings

An installation MAY define multiple named relational/data bindings.

Example:

```yaml
data:
  operational:
    role: primary
    backend: auto
    interface: portable-data

  legacy_erp:
    role: legacy-source
    backend: external
    engine: mssql
    authority_ref: read-only-grant

  analytics:
    role: analytics
    backend: external
    engine: postgres
```

Each binding MUST have independent ownership, authority, network route, lifecycle, and portability metadata.

The platform MUST NOT infer cross-binding transactionality.

---

# 18. Managed Backend Selection

Recommended default policy:

| Context | Preferred default |
|---|---|
| Stateless Mini App | none |
| Cloudflare, light/normal relational | D1 |
| Desktop/local | SQLite |
| Single-node self-host | SQLite unless requirements demand otherwise |
| High concurrency / advanced relational | PostgreSQL |
| Existing user DB | external adapter |
| Required MSSQL features | MSSQL |
| Required MySQL features | MySQL |

These are defaults, not hard restrictions.

---

# 19. PostgreSQL Boundary

SmartAIHub platform PostgreSQL remains the authoritative platform SoR.

Mini App business data MUST NOT be placed in arbitrary new control-plane tables by default.

If Mini App data is stored in PostgreSQL, it SHOULD use a clearly isolated application data model such as:

- dedicated database;
- dedicated schema;
- dedicated tenant namespace;
- explicitly managed external PostgreSQL.

The exact isolation mode MUST be declared.

---

# 20. D1 Rules

When D1 is selected:

- application code SHOULD still use the Portable Data Contract;
- D1 binding details belong to deployment/runtime configuration;
- Mini App source MUST NOT assume `env.DB` in portable modes;
- D1 schema/migrations MUST be generated from canonical app migration artifacts;
- export/migration capability MUST be retained;
- D1 MUST be replaceable with another adapter for portable Mini Apps.

---

# 21. SQLite Rules

SQLite SHOULD serve as the default portable/local relational backend where appropriate.

Mini App package SHOULD contain:

```text
database/
  schema/
  migrations/
```

SQLite MUST NOT be treated as proof that a workload is safe for shared multi-instance cloud deployment.

The Storage Resolver MUST consider concurrency and topology before selecting it.

---

# 22. BYODB Connection Model

External database connection metadata SHOULD include:

```text
connection_id
tenant_id
owner_id
engine
host metadata
port
database/catalog name
region/location hint
TLS mode
network mode
secret_ref
capability probe result
schema fingerprint
created_at
updated_at
```

Sensitive fields MUST be stored/resolved by Spec 272.

Examples of secrets:

- passwords;
- private keys;
- client certificates;
- connection strings containing credentials;
- database tokens.

## 22.1 Network Route and Execution Placement

BYODB MUST NOT assume that the database is publicly reachable from SmartAIHub Cloud.

Supported connection/placement classes SHOULD include:

```text
PUBLIC_TLS
PRIVATE_TUNNEL
VPN_OR_PRIVATE_NETWORK
CUSTOMER_GATEWAY
SMARTAIHUB_DESKTOP_RUNNER
CUSTOMER_HOSTED_RUNNER
CLOUD_PRIVATE_RUNTIME
```

The connection registry MUST describe the allowed route class without storing the secret material itself.

Spec 224 / runtime placement resolution MUST choose an execution location that can reach the database and is permitted to receive the corresponding credential.

Examples:

```text
Customer MSSQL reachable only from office LAN
    -> execute DB capability through approved Desktop/Customer Runner

Private cloud PostgreSQL
    -> approved private connector / customer-hosted runtime

Public managed PostgreSQL with TLS
    -> cloud adapter may connect directly if tenant policy permits
```

Credential material MUST NOT be moved to a different execution plane merely to make connectivity convenient when tenant policy prohibits that placement.

Connectivity probing MUST distinguish DNS, TCP, TLS, authentication, authorization, and database capability failures.

---

# 23. Spec 272 Integration

Spec 273 MUST NOT become a secret manager.

Relationship:

```text
Spec 273
  |
  +-- database connection metadata
  +-- secret_ref
            |
            v
         Spec 272
            |
            v
       runtime secret
```

Generated Mini App code SHOULD request logical secrets through a runtime binding.

Example:

```ts
const credential = await ctx.secrets.get("customer_erp");
```

The app MUST NOT receive platform master secrets.

Credential references MUST support rotation/version changes without rewriting the Mini App package.

Where the database driver supports short-lived credentials, workload identity, certificate rotation, or token-based authentication, adapters SHOULD prefer those mechanisms over long-lived static passwords when tenant policy and provider support permit.

Connection pools MUST react safely to credential rotation and MUST NOT keep revoked credentials alive indefinitely.

For development/migration orchestration, raw database credentials SHOULD be resolved directly to the approved adapter/action broker rather than exposed to the LLM/harness process whenever technically possible.

A P3/P4 runtime that genuinely needs a provider-native client MAY receive a scoped runtime binding/credential according to policy, but that exception MUST be explicit in the manifest and authority model.

---

# 24. Spec 224 Integration Addendum

This section is normative and MUST be implemented additively.

Spec 224 MUST NOT be rewritten solely to satisfy Spec 273.

## 24.1 Architecture intent generation

Before implementation of data-dependent Mini Apps, Spec 224 MUST produce or resolve:

```text
- data requirements
- database intent
- portability level
- ownership
- required authority
- storage/backend constraints
- migration requirements
```

## 24.2 Generated code contract

Portable Mini Apps MUST use SmartAIHub data interfaces.

Spec 224 MUST NOT directly generate provider-specific database logic in P1 unless a provider-specific extension is explicitly declared.

## 24.3 Architecture admission gate

The Spec 224 run MUST include a compliance gate before Final Verify:

```text
IMPLEMENT
   |
   v
TEST
   |
   v
ARCHITECTURE COMPLIANCE
   |
   v
PORTABILITY COMPLIANCE
   |
   v
DATABASE AUTHORITY / RISK COMPLIANCE
   |
   v
UAT
   |
   v
FINAL VERIFY
```

Failure MUST block deployment.

Canonical blocker:

```text
ARCHITECTURE_COMPLIANCE_BLOCKED
```

Additional blockers MAY include:

```text
PORTABILITY_CONTRACT_VIOLATION
DATABASE_AUTHORITY_INSUFFICIENT
DESTRUCTIVE_CHANGE_APPROVAL_REQUIRED
DATABASE_BACKEND_UNSUPPORTED
DATA_MIGRATION_VALIDATION_FAILED
```

## 24.4 No silent portability downgrade

If a generated design must change:

```text
P1 -> P3
```

or:

```text
P1 -> P4
```

Spec 224 MUST record the reason.

If user/policy approval is required, Final Verify MUST remain blocked until resolved.

## 24.5 Infrastructure separation

Spec 224 SHOULD produce:

```text
Application Package
```

and:

```text
Deployment Intent
```

as separate artifacts.

Example:

```yaml
application:
  data_interface: portable-data

deployment:
  cloudflare:
    preferred_backend: d1
  desktop:
    preferred_backend: sqlite
```

## 24.6 Runtime database action broker

All database-changing operations originating from Spec 224 MUST pass through a common runtime action broker / policy interceptor.

This requirement applies equally to:

```text
SmartAIHub native development agent
Codex/Claude/Hermes/other external harness
MCP tools
Skills
Runner jobs
migration executors
generated admin tools
```

No execution path MAY gain mutation authority simply by bypassing the portable application API and invoking a lower-level driver.

The broker MUST issue a durable execution receipt containing the binding, operation class, authority decision, risk classification, and result.

Read-only access MAY use an optimized path, but the effective A1 scope MUST still be enforced.

The interceptor MAY be implemented as an in-process/runtime capability check for high-volume A2 application writes; it does not have to add a remote network hop to every INSERT/UPDATE. The security semantics, scope enforcement, and audit correlation MUST remain equivalent.

## 24.7 SQL classification and unknown-operation handling

For raw SQL or provider-specific escape hatches, the policy layer MUST classify statements using the correct database dialect.

Requirements:

- multi-statement scripts MUST be classified per executable statement;
- parameter values MUST not be confused with SQL structure;
- unknown/unparseable statements MUST fail closed for schema/destructive execution;
- dynamic SQL inside procedures/triggers/functions MUST be treated conservatively;
- creation or modification of executable database code SHOULD be at least R2 and MAY be elevated to R3 according to impact;
- the executed statement set MUST match the approved/assessed artifact or the operation MUST be re-assessed.

String/regex matching alone MUST NOT be the sole production classifier for destructive SQL.

## 24.8 Durable dispatch, fencing and stale-worker protection

Database-changing work orchestrated by Spec 224 MUST use its durable run/job semantics rather than ad-hoc fire-and-forget execution.

For R2-R4 operations, execution SHOULD carry:

```text
run_id
step_id
attempt_id
binding_id
idempotency_key
fencing/lease token where applicable
expected schema fingerprint
```

A stale worker, expired lease, duplicated delivery, or resumed external harness MUST NOT be able to replay an already-settled destructive step.

Spec 273 SHOULD reuse the existing Spec 224 approval/job/audit infrastructure rather than create a competing approval system.

---

# 25. Architecture Compliance Validator

Spec 273 MUST define a machine-enforced validator.

Minimum checks:

### Manifest validation

- required fields present;
- valid portability level;
- valid data ownership;
- valid authority references;
- valid backend declaration.

### Source validation

For P1, flag direct imports/usages of:

- D1 provider bindings;
- direct PostgreSQL clients;
- direct MSSQL clients;
- direct MySQL clients;
- direct SQLite drivers;
- provider secret SDKs;
- infrastructure provisioning APIs.

Exceptions MUST be declared.

### Migration validation

- migration files are ordered;
- migration version is known;
- destructive migration classification exists;
- rollback strategy exists where required.

### Deployment validation

- selected backend satisfies capability requirements;
- required secrets exist;
- required network reachability is available;
- required authority is active.

---

# 26. Runtime Capability Isolation

Static validation alone is insufficient.

Runtime execution MUST be capability-scoped.

Portable Mini Apps SHOULD receive:

```text
logical database binding
logical object storage binding
logical secrets binding
approved network capabilities
```

They SHOULD NOT receive:

```text
Cloudflare account API tokens
platform PostgreSQL superuser credentials
tenant-global infrastructure admin credentials
Spec 272 root/master material
```

Provider management capability MUST be separately granted.

---

# 27. Database Capability Discovery

External databases SHOULD undergo a capability probe before planning migrations.

Probe output MAY include:

```text
engine/version
transaction support
DDL capability
schema/catalog layout
JSON capability
full-text capability
generated columns
index features
foreign key behavior
stored procedures/triggers
collation/encoding
maximum identifier constraints
connection limits
read-only status
```

Spec 224 MUST use the capability result instead of assuming all SQL engines behave alike.

---

# 28. Schema Introspection

Where authority allows, the platform SHOULD inspect:

- tables;
- columns;
- indexes;
- constraints;
- foreign keys;
- views;
- triggers;
- procedures/functions where supported;
- dependencies;
- row counts/size estimates;
- existing migrations if discoverable.

Large production systems SHOULD avoid unbounded scans.

---

# 29. Schema Fingerprints

For external or shared databases, SmartAIHub SHOULD capture a schema fingerprint before migration.

Example concept:

```text
engine + normalized schema metadata -> SHA-256 fingerprint
```

Migration execution SHOULD detect unexpected schema drift between planning and execution.

If drift is material:

```text
DATABASE_SCHEMA_DRIFT_DETECTED
```

and execution SHOULD be re-planned or explicitly approved.

---

# 30. Transactions and Concurrency

Portable Data API semantics MUST specify transactional expectations.

The abstraction MUST NOT falsely claim identical concurrency semantics across D1, SQLite, PostgreSQL, MySQL, and MSSQL.

Capabilities MUST be discoverable:

```ts
db.capabilities.transactions
db.capabilities.concurrentWrites
db.capabilities.savepoints
db.capabilities.returning
...
```

Spec 224 SHOULD plan against actual backend capabilities.

## 30.1 Portable Data Semantics

The Portable Data Contract MUST define canonical semantics for at least:

```text
nullability
boolean
signed integer ranges
decimal / money precision
floating point
string / unicode
binary
UUID / identifier
date
time
timestamp + timezone policy
JSON/document values
auto/generated identifiers
unique constraints
foreign-key expectations
sorting/collation declarations
pagination/cursor semantics
affected-row/result semantics
error classification
```

Adapters MUST NOT silently coerce values in a way that can cause data loss.

If a canonical type or behavior cannot be represented faithfully on a selected backend, resolution MUST either:

1. choose an explicit compatible representation;
2. downgrade portability with disclosure; or
3. fail with `DATABASE_SEMANTIC_CAPABILITY_MISMATCH`.

Currency/business-critical decimals MUST NOT silently degrade to floating-point.

Time handling MUST have a canonical timezone policy and MUST NOT depend on implicit server-local timezone behavior.

## 30.2 Distributed consistency boundary

`db.transaction()` applies only to the capabilities explicitly declared atomic by that binding.

A transaction on one relational binding MUST NOT be presented as atomic with object storage, vector storage, another database binding, or an external API unless an implementation genuinely supplies such a guarantee.

For cross-resource changes, Spec 224 SHOULD use durable workflow/outbox/saga patterns and reconciliation.

---

# 31. Migration Artifact Standard

Every app-managed schema SHOULD use migration artifacts.

Recommended structure:

```text
database/
  manifest.yaml
  schema/
    canonical.yaml
  migrations/
    0001_initial.*
    0002_...
  adapters/
    optional-provider-overrides/
```

Migration metadata SHOULD contain:

```text
migration_id
from_version
to_version
risk
reversible
required_authority
supported_engines
preconditions
postconditions
```

---

# 32. Canonical Schema Model

To avoid tying Mini App generation to one SQL dialect, Spec 273 SHOULD define a provider-neutral canonical schema model for common structures.

Example conceptual model:

```yaml
tables:
  customers:
    columns:
      id:
        type: uuid
        primary_key: true
      name:
        type: string
        nullable: false
      created_at:
        type: timestamp
```

Adapters MAY emit backend-specific DDL.

Raw provider-specific DDL MAY be included for P3/P4 apps.

---

# 33. Data Export / Portability

Portable Mini Apps SHOULD support a standard export bundle containing, where applicable:

```text
app package
data manifest
schema definition
migration history
portable data export
object manifest
version metadata
portability metadata
```

Export MUST NOT expose secrets.

Provider-native snapshots MAY be attached as optional optimization artifacts.

---

# 34. Import / Rebind

A portable Mini App SHOULD be able to:

```text
Export from D1
   |
   v
Portable export
   |
   v
Import to SQLite/PostgreSQL/etc.
```

subject to capability compatibility.

When features cannot be mapped automatically, migration MUST produce an explicit compatibility report rather than silently losing behavior.

## 34.1 Backup / Restore Readiness

Before R3/R4 production mutations, the plan MUST classify recovery capability:

```text
SNAPSHOT_RESTORE
LOG_POINT_IN_TIME_RECOVERY
EXPORT_IMPORT
TRANSACTION_ROLLBACK
FORWARD_FIX_ONLY
NO_VERIFIED_RECOVERY
```

The plan MUST record:

```text
backup owner
backup timestamp/version
restore target
expected RPO
expected RTO
restore procedure
restore verification status
```

A statement that a backup "exists" is insufficient for R4 work unless restore feasibility has been validated to the level required by policy.

If no acceptable recovery path exists, execution MUST stop unless the applicable policy explicitly allows the risk and the required approval is obtained.

## 34.2 Data Reconciliation

Migration/cutover verification MUST be stronger than schema comparison alone.

The validation plan SHOULD use an appropriate combination of:

```text
row counts
partitioned counts
checksums/hashes
primary-key coverage
null/error counts
foreign-key integrity
aggregate totals
sampled record comparison
business invariants
application-level acceptance queries
CDC lag / pending change count
```

Tolerance MUST be explicit where exact equality is not expected.

A cutover MUST NOT be declared successful merely because the target database is reachable.

---

# 35. Backend Promotion / Demotion

Managed Mini Apps SHOULD support backend evolution.

Example:

```text
D1
 |
 | workload growth
 v
PostgreSQL
```

or:

```text
Hosted PostgreSQL
 |
 | user wants self-host
 v
External PostgreSQL
```

Promotion MUST preserve the logical data contract where possible.

Application source code SHOULD NOT require changes for P1-compatible promotion.

Backend promotion/demotion MUST be treated as a migration event, not an implicit resolver decision.

The migration MUST define:

```text
source binding
target binding
copy/catch-up method
read/write switch point
rollback/rebind path
reconciliation criteria
final ownership/lifecycle state
```

---

# 36. Lifecycle State Machine

Recommended data binding states:

```text
UNPROVISIONED
PROVISIONING
ACTIVE
DEGRADED
IDLE
MIGRATING
SYNCING
CUTOVER_PENDING
ROLLBACK_PENDING
ARCHIVED
DELETING
DELETED
ERROR
```

Transitions MUST be auditable.

---

# 37. Resource Cleanup

Deleting a Mini App definition MUST NOT automatically destroy external user-owned databases.

Deletion policy MUST distinguish:

```text
app metadata
managed storage
external bindings
external data
archive/export
retention requirements
```

Managed storage MAY support retention windows.

External storage SHOULD default to disconnecting the binding unless the user explicitly authorizes destructive cleanup.

Managed resource cleanup MUST be idempotent and SHOULD include orphan detection for failed provisioning/deletion runs.

A retention or archive policy MUST distinguish:

```text
logical app deletion
binding deletion
managed database deletion
backup/snapshot retention
object/vector side data
audit retention
legal/tenant retention policy
```

---

# 38. Multi-Tenant Rules

Every binding MUST include tenant scope.

Cross-tenant database bindings MUST be explicitly authorized.

Marketplace installations SHOULD default to isolated storage or explicitly declared shared storage.

The platform MUST prevent accidental reuse of another tenant's D1, SQLite file, PostgreSQL schema, or external database connection.

If multiple tenants intentionally share one physical database, tenant isolation MUST be explicitly declared as one of:

```text
DATABASE_PER_TENANT
SCHEMA_PER_TENANT
TABLE_NAMESPACE_PER_TENANT
ROW_SCOPED
CUSTOM_EXTERNAL_ISOLATION
```

For `ROW_SCOPED`, tenant predicates/policies MUST be enforced by a mechanism that Mini App business logic cannot casually omit. Application convention alone is insufficient for high-trust multi-tenant isolation.

Cross-tenant administrative operations MUST have separate authority scope and audit evidence.

---

# 39. Marketplace Rules

Published Mini Apps MUST disclose:

```text
portability level
required data capabilities
supported database engines
provider-specific requirements
required authority level
migration requirements
external network requirements
```

Example listing:

```text
Portable: P1
Managed cloud default: D1
Local: SQLite
BYODB: PostgreSQL / MySQL / MSSQL
Schema control: A3 required for app-owned install
```

---

# 40. Mini App Creation Decision Flow

Spec 224 SHOULD follow:

```text
Does the app require persistence?
 |
 +-- No -> P0 / no DB
 |
 +-- Yes
       |
       v
Is an existing/user database required?
       |
       +-- No -> managed/local resolver
       |
       +-- Yes
             |
             v
Discover engine + ownership + authority
             |
             v
Classify intent
             |
             v
Choose portability level
             |
             v
Generate manifest + migration/data contract
             |
             v
Implement
             |
             v
Compliance gates
```

---

# 41. New-System Replacement Flow

If the user requests replacement of an existing system:

1. Spec 224 records `intent=REPLACE`.
2. Database capability discovery runs.
3. Schema and dependency discovery runs.
4. Required authority is calculated.
5. If insufficient, execution stops before mutation.
6. Target architecture/schema is designed.
7. Migration strategy is generated.
8. Backup/recovery path is verified.
9. Test migration runs where practical.
10. Validation evidence is collected.
11. Cutover proceeds only according to run policy.
12. Legacy retirement is treated as a distinct destructive step.
13. Final Verify includes business/data consistency checks.

---

# 42. Spec 271 Integration

Spec 271 SHOULD provide UAT profiles for Spec 273.

Minimum profiles:

### Portable Backend UAT

Run the same functional contract against at least two supported adapters where applicable.

Example:

```text
D1 vs SQLite
```

### Migration UAT

Test:

- clean install;
- upgrade;
- downgrade/rollback where supported;
- data preservation;
- schema drift detection.

### BYODB UAT

Test:

- read-only;
- read/write;
- A3 migration;
- insufficient authority failure;
- connectivity interruption.

### Replacement UAT

Use disposable databases to test:

- schema discovery;
- migration;
- cutover simulation;
- rollback;
- destructive operation gating.

---

# 43. Observability

Every database execution SHOULD produce correlated events.

Recommended event fields:

```text
run_id
mini_app_id
installation_id
tenant_id
binding_id
backend
operation_class
risk_class
authority_level
migration_id
approval_id
result
duration
rows_affected
error_code
```

Sensitive SQL values SHOULD be redacted according to platform policy.

## 43.1 Connection and Query Operations

Adapters MUST define operational policies for:

```text
connection pooling
maximum concurrent connections
statement/query timeout
lock timeout where available
retryable error classes
non-retryable error classes
circuit breaking
backoff
cancellation
health checks
read/write routing where applicable
failover behavior
```

Retries MUST NOT duplicate non-idempotent writes.

For generated applications, the runtime SHOULD expose query budget/telemetry sufficient to detect obvious unbounded scans, N+1 query patterns, and runaway request-level database work.

The Portable Data API MUST permit explicit pagination and MUST NOT encourage unbounded `SELECT *` patterns for large collections.

---

# 44. Audit

For R3/R4 operations, audit evidence MUST preserve:

- actor/request origin;
- plan;
- authority grant;
- approval where required;
- schema fingerprint before;
- migration artifact;
- execution result;
- schema fingerprint after;
- verification result;
- rollback status.

---

# 45. Failure Semantics

Recommended stable error codes:

```text
ARCHITECTURE_COMPLIANCE_BLOCKED
PORTABILITY_CONTRACT_VIOLATION
DATABASE_CONNECTION_UNAVAILABLE
DATABASE_BACKEND_UNSUPPORTED
DATABASE_CAPABILITY_MISMATCH
DATABASE_AUTHORITY_INSUFFICIENT
DATABASE_SCHEMA_DRIFT_DETECTED
DATABASE_MIGRATION_PRECONDITION_FAILED
DATABASE_MIGRATION_FAILED
DATA_MIGRATION_VALIDATION_FAILED
DESTRUCTIVE_CHANGE_APPROVAL_REQUIRED
DATABASE_CUTOVER_FAILED
DATABASE_ROLLBACK_FAILED
SECRET_REFERENCE_UNRESOLVED
DATABASE_NETWORK_ROUTE_UNAVAILABLE
DATABASE_POLICY_INTERCEPTOR_DENIED
DATABASE_SEMANTIC_CAPABILITY_MISMATCH
DATABASE_RECOVERY_NOT_READY
DATABASE_RECONCILIATION_FAILED
DATABASE_CUTOVER_INCOMPLETE
DATABASE_ADAPTER_CONFORMANCE_FAILED
DATABASE_RESOURCE_BUDGET_EXCEEDED
```

Failures MUST be surfaced to Spec 224 in machine-readable form.

---

# 46. Security Requirements

1. Secrets MUST be delegated to Spec 272.
2. Database credentials MUST follow least privilege by default.
3. Full-control credentials MAY be used only when required by granted authority.
4. External database traffic SHOULD use TLS when supported.
5. Network exposure SHOULD be minimized.
6. Platform root credentials MUST NOT be passed into Mini Apps.
7. Runtime database capability MUST match the active authority grant.
8. Audit logs MUST NOT contain plaintext secrets.
9. Connection strings and SQL diagnostics MUST be redacted before logging.
10. Generated SQL identifiers MUST be safely quoted/validated by adapters; user values MUST use parameter binding rather than string concatenation.
11. Data classification/residency policy MUST be evaluated before moving or copying data between regions/providers/execution planes.
12. A migration MUST NOT copy production data into development/test environments unless tenant policy explicitly permits it.

---

# 47. Compatibility Requirements

Spec 273 MUST NOT require a destructive refactor of completed Spec 224 functionality.

Implementation SHOULD be additive through:

- new manifest schema;
- new storage/data interfaces;
- resolver;
- adapters;
- validators;
- Spec 224 admission gates;
- Spec 271 UAT profiles;
- Spec 272 secret binding.

Existing Mini Apps SHOULD receive a compatibility classification:

```text
LEGACY_UNCLASSIFIED
P1_COMPATIBLE
P2_COMPATIBLE
P3_PROVIDER_ENHANCED
P4_PROVIDER_LOCKED
```

Legacy apps MUST NOT be silently rewritten.

---

# 48. Migration of Existing Spec 224 Generated Mini Apps

Existing Mini Apps SHOULD undergo inventory:

1. detect direct database imports;
2. detect D1 bindings;
3. detect PostgreSQL/MySQL/MSSQL/SQLite clients;
4. identify embedded credentials;
5. identify schema/migration artifacts;
6. classify portability;
7. generate remediation plan.

Possible outcomes:

```text
NO_CHANGE
WRAP_WITH_ADAPTER
MIGRATE_TO_PORTABLE_DATA_API
DECLARE_P3
DECLARE_P4
MANUAL_REVIEW_REQUIRED
```

Migration of existing Spec 224 behavior SHOULD be rolled out behind compatibility flags/canaries.

The platform MUST be able to distinguish:

```text
legacy generation path
Spec-273 enforced generation path
```

during transition, while preventing newly created apps from silently entering the legacy path once the enforcement milestone is declared complete.

---

# 49. Implementation Components

Minimum components:

```text
MiniAppDataManifest
PortableDataAPI
PortableSchemaModel
StorageResolver
StorageAdapterRegistry
D1Adapter
SQLiteAdapter
PostgresAdapter
MySQLAdapter
MSSQLAdapter
ExternalDatabaseConnectionRegistry
DatabaseCapabilityProbe
DatabaseAuthorityService
DatabaseRiskClassifier
MigrationPlanner
MigrationExecutor
SchemaFingerprintService
ArchitectureComplianceValidator
PortabilityValidator
DatabaseAuditEmitter
DatabasePolicyInterceptor
DatabaseActionBroker
ExecutionPlacementResolver
ConnectionRouteRegistry
AdapterConformanceKit
DataReconciliationService
RecoveryReadinessService
ResourceBudgetService
Spec224IntegrationGate
```

Adapters MAY be delivered incrementally.

---

# 50. Suggested Internal Interfaces

Conceptual interface:

```ts
interface DataBinding {
  id: string;
  kind: "managed" | "local" | "external";
  engine: string;
  ownership: "app" | "user" | "shared" | "platform";
  portabilityLevel: "P0" | "P1" | "P2" | "P3" | "P4";
  authorityRef?: string;
  connectionRef?: string;
}
```

```ts
interface DatabaseAuthority {
  level: "A0" | "A1" | "A2" | "A3" | "A4" | "A5";
  tenantId: string;
  bindingId: string;
  environment: "dev" | "test" | "staging" | "production";
  databaseScope?: string;
  schemaScope?: string[];
  objectScope?: string[];
  operationClasses?: string[];
  intent?: string[];
  expiresAt?: string;
}
```

```ts
interface DatabaseOperationAssessment {
  intent: string;
  authorityRequired: string;
  risk: "R0" | "R1" | "R2" | "R3" | "R4";
  approvalRequired: boolean;
  backupRequired: boolean;
  dryRunRequired: boolean;
}
```

---

# 51. Implementation Phases

## Phase 273-A — Contract Foundation

Deliver:

- manifest schema;
- portability levels;
- ownership model;
- intent model;
- authority model;
- risk model;
- stable error codes.

No production database mutation is required for this phase.

## Phase 273-B — Portable Data API

Deliver:

- API interfaces;
- adapter registry;
- SQLite adapter;
- D1 adapter;
- portable schema/migration format.

## Phase 273-C — Spec 224 Guardrails + Runtime Policy Interceptor

Deliver:

- manifest generation;
- source compliance checks;
- portability checks;
- Final Verify admission gate;
- fail-closed blockers;
- Database Policy Interceptor / Action Broker;
- scoped authority enforcement;
- durable mutation receipts;
- stale-worker/replay fencing.

**Production database mutation beyond controlled reference tests MUST NOT be enabled before Phase 273-C enforcement is active.**

## Phase 273-D — PostgreSQL + BYODB

Deliver:

- PostgreSQL adapter;
- connection registry;
- capability probe;
- Spec 272 secret binding;
- external DB read mode;
- external DB A2 write mode only through the Phase 273-C policy path;
- initial private-network/Runner route support.

## Phase 273-E — MySQL + MSSQL

Deliver:

- engine adapters;
- schema discovery;
- capability maps;
- migration translation where safe.

## Phase 273-F — Migration / Replacement

Deliver:

- schema fingerprints;
- migration planner;
- destructive risk workflow;
- backup/rollback integration;
- cutover state machine.

## Phase 273-G — Marketplace / Portable Export

Deliver:

- portability disclosure;
- export/import bundle;
- installation-level database binding;
- migration compatibility report.

## Phase 273-H — BYODB Placement / Production Migration Safety Completion

Deliver:

- complete private-network route classes;
- hardened Desktop/Customer Runner DB execution path;
- online migration planning;
- checkpoint/resume;
- recovery-readiness gate;
- data reconciliation service;
- production cutover qualification tests.

## Phase 273-I — Adapter Conformance / Governance

Deliver:

- adapter capability/version registry;
- conformance test kit;
- data semantic portability tests;
- resource budgets/quotas;
- data residency/classification hooks;
- operational query/connection policies.

---

# 52. Acceptance Criteria

Spec 273 is not complete until the following are demonstrable.

## AC-01 — No DB for unused Mini App

Creating a draft Mini App that does not need persistence MUST NOT create a D1/PostgreSQL database.

## AC-02 — Cloud D1 portability

A P1 Mini App deployed to Cloudflare MAY use D1 without application source depending directly on `env.DB`.

## AC-03 — Local SQLite portability

The same P1 Mini App can run with SQLite using the same application-level data contract.

## AC-04 — BYODB PostgreSQL

A user can bind a PostgreSQL database and run a Mini App without moving data into SmartAIHub's platform PostgreSQL.

## AC-05 — BYODB MSSQL

A user can bind Microsoft SQL Server through Spec 272-backed credentials.

## AC-06 — Read-only authority

A1 binding MUST prevent writes/DDL.

## AC-07 — Schema management

A3 binding can execute approved application schema migrations.

## AC-08 — Full replacement

A5 + REPLACE can execute a disposable end-to-end replacement/cutover test including destructive cleanup when separately approved.

## AC-09 — Portability enforcement

P1 app containing direct provider database imports MUST fail architecture compliance.

## AC-10 — No silent downgrade

If provider-specific features are added, portability classification MUST change or Final Verify MUST fail.

## AC-11 — Spec 224 enforcement

Spec 224 MUST NOT reach Final Verify when Spec 273 compliance gates fail.

## AC-12 — Secrets separation

No plaintext external DB credential is stored in Mini App manifest or Spec 273 metadata.

## AC-13 — Schema drift

A material external schema change between plan and migration MUST be detected.

## AC-14 — Migration evidence

R3/R4 migration MUST emit authority/risk/approval/verification evidence.

## AC-15 — Marketplace isolation

Two installations of the same Mini App can bind different database backends without source fork.

## AC-16 — Runtime policy interception

A mutating SQL operation issued through an external harness or lower-level tool MUST still be denied when the run lacks sufficient authority, even if source validation is bypassed.

## AC-17 — Private-network BYODB

A Mini App can access a test database reachable only through an approved Desktop/Customer Runner without exposing that database publicly.

## AC-18 — Scoped authority

An A3 grant for staging MUST NOT authorize the equivalent production schema change.

## AC-19 — Multi-binding

One Mini App can bind a managed primary DB and a separate read-only legacy external DB with independent authority.

## AC-20 — Cross-store transaction disclosure

A workflow touching two independent stores MUST NOT be reported as atomically committed unless that guarantee is genuinely supplied.

## AC-21 — Semantic portability

Canonical decimal, timestamp, UUID/identifier, null, JSON, and pagination tests pass for each adapter claiming P1 support, or unsupported semantics are rejected explicitly.

## AC-22 — Resumable migration

An interrupted long-running migration can resume without replaying a completed destructive step.

## AC-23 — Recovery readiness

R4 production cutover is blocked when the required recovery/restore evidence is absent.

## AC-24 — Reconciliation gate

A migration with mismatched reconciliation criteria MUST fail before successful cutover is declared.

## AC-25 — Credential rotation

A database secret can rotate through Spec 272 without modifying the Mini App package, and stale pooled connections are retired according to policy.

## AC-26 — Tenant isolation

A row-scoped or schema-scoped multi-tenant reference deployment demonstrates that one tenant cannot access another tenant's rows/schema through normal Mini App queries.

## AC-27 — Resource cleanup

A failed provision/delete sequence can be retried idempotently and orphaned managed resources are detectable.

## AC-28 — Adapter conformance

An adapter cannot advertise P1 support unless the Spec 273 conformance suite passes its required capability/semantic tests.

## AC-29 — Resource budget

Provisioning or query execution that exceeds tenant/app resource policy is blocked or throttled with a machine-readable result.

## AC-30 — Data placement policy

A migration is blocked when it would move classified data to a disallowed provider/region/execution plane.

## AC-31 — Lazy provisioning race

Two concurrent first-use attempts MUST NOT create duplicate managed databases/bindings for the same installation role.

## AC-32 — App/schema compatibility

A deployment known to require schema v5 MUST NOT be routed to a binding still at an incompatible schema version.

## AC-33 — Stale-worker fencing

A stale or duplicate migration worker cannot replay a settled R3/R4 step after lease/fencing authority has moved to another attempt.

## AC-34 — Raw SQL fail-closed

An unknown/unparseable provider-specific mutating statement cannot bypass risk classification and execute as a low-risk operation.

---

# 53. Non-Goals

Spec 273 does NOT:

- force every Mini App to use D1;
- force every Mini App to use SQLite;
- replace the platform PostgreSQL control plane;
- prevent users from redesigning their own databases;
- normalize every SQL feature into one universal dialect;
- guarantee automatic migration between every pair of database engines;
- store database secrets directly;
- grant database authority merely because a credential technically allows it;
- redesign the Spec 224 state machine beyond additive compliance integration.

---

# 54. Key Architectural Invariants

The following MUST remain true:

### INV-1
Mini App creation does not imply database creation.

### INV-2
D1 is a backend adapter, not the canonical Mini App API.

### INV-3
External database does not imply read-only.

### INV-4
User-authorized full schema replacement is supported.

### INV-5
Authority and technical capability are separate.

### INV-6
Destructive operations are controlled, not globally prohibited.

### INV-7
Portable Mini App code does not depend directly on provider database SDKs.

### INV-8
Spec 224 cannot Final Verify a Mini App that violates the declared data architecture.

### INV-9
Secrets are resolved via Spec 272.

### INV-10
Platform PostgreSQL is not a dumping ground for arbitrary Mini App schemas.

### INV-11
A single Mini App definition can bind different database backends per installation.

### INV-12
Portability downgrade is explicit and auditable.

### INV-13
Every mutating execution path is subject to the same runtime authority/risk policy, including external harnesses and low-level tools.

### INV-14
Authority is scoped to concrete bindings/environments and is not a server-wide implication.

### INV-15
A Mini App may use multiple independently governed data bindings.

### INV-16
Cross-store atomicity is never implied without a real guarantee.

### INV-17
R4 cutover cannot be declared successful without reconciliation and recovery-readiness evidence required by policy.

### INV-18
Private-network BYODB does not require public exposure of the user's database.

### INV-19
Adapters cannot claim portability levels they have not passed through the conformance suite.

### INV-20
Backend changes are explicit migration/rebind events, not silent Storage Resolver actions.

### INV-21
Lazy provisioning is idempotent and concurrency-safe.

### INV-22
Application/schema version compatibility is checked before routing production traffic.

### INV-23
Unknown raw database mutations fail closed rather than being guessed safe.

### INV-24
A stale worker or duplicated job delivery cannot replay settled destructive database work.

---

# 55. Required Spec 224 Addendum Text

The following requirements SHOULD be copied or referenced normatively by Spec 224:

> **Mini App Data Architecture Compliance**
>
> Spec 224 MUST generate and validate a Spec 273-compatible Mini App data manifest for every Mini App with persistent data requirements.
>
> Spec 224 MUST prefer the SmartAIHub Portable Data Contract and MUST NOT assume D1, SQLite, PostgreSQL, MySQL, MSSQL, or another provider unless required by user intent, deployment constraints, or declared Mini App capabilities.
>
> Spec 224 MUST classify database intent, ownership, required authority, risk, and portability before executing database-changing work.
>
> Spec 224 MUST NOT reach Final Verify or deployment when Spec 273 Architecture Compliance fails.
>
> Spec 224 MAY perform destructive schema changes, full migrations, and system replacement when explicit authority and risk-policy requirements are satisfied.
>
> Spec 224 MUST NOT silently downgrade Mini App portability.
>
> Spec 224 MUST use Spec 272 for database secrets and credential material.
>
> Every Spec 224 database mutation MUST pass the Spec 273 Database Policy Interceptor / Action Broker at execution time, including mutations initiated through external agents, MCP tools, Skills, Runners, migration executors, or provider-specific escape hatches.
>
> Spec 224 MUST resolve network/execution placement for BYODB and MUST NOT require a private customer database to be exposed publicly merely to support a Mini App.
>
> Spec 224 MUST treat backend promotion, database replacement, and production cutover as durable migration workflows with reconciliation and recovery-readiness gates.

---

# 56. Final Architecture

```text
                         SmartAIHub
                             |
                +------------+-------------+
                |                          |
          Platform Control             Spec 224
          PostgreSQL SoR         Development Orchestrator
                |                          |
                |                    Architecture Intent
                |                          |
                +------------+-------------+
                             |
                             v
                 Spec 273 Data Architecture
                             |
             +---------------+----------------+
             |               |                |
        Data Contract   Authority/Risk   Storage Resolver
             |               |                |
             +---------------+----------------+
                             |
          +------------------+------------------------+
          |                  |                        |
        Managed            Local                   BYODB
          |                  |                        |
     +----+----+           SQLite        +------------+----------+
     |         |                         |            |          |
     D1    PostgreSQL                PostgreSQL     MySQL      MSSQL
          |
          +---- future adapters
                             |
                             v
                       Spec 272
                    Secret Resolution
```

---

# 57. Implementation Decision

**Proceed with Spec 273 as an additive architecture layer.**

Do not retrofit Spec 224 with provider-specific D1 logic.

Instead:

1. introduce the Portable Data Contract;
2. introduce Data Manifest + portability classification;
3. introduce Intent + Authority + Risk;
4. introduce Storage Resolver and adapters;
5. integrate Spec 272 for secrets;
6. insert Spec 273 compliance gates into Spec 224 before Final Verify;
7. add Spec 271 UAT coverage;
8. inventory existing generated Mini Apps and classify/remediate them incrementally.

This preserves the work already completed in Spec 224 while preventing future Mini Apps from violating the new data architecture.

---

# 58. Definition of Done

Spec 273 is DONE only when:

- new Mini Apps cannot bypass the declared data contract unnoticed;
- Spec 224 refuses Final Verify on architecture violations;
- D1 and SQLite work as interchangeable P1 backends for at least one reference Mini App;
- external PostgreSQL and MSSQL reference integrations exist;
- Spec 272-backed credential resolution is proven;
- authority levels are enforced at runtime;
- destructive replacement workflow is demonstrated on disposable infrastructure;
- portability metadata appears in Mini App artifacts;
- Marketplace/installations can bind different databases independently;
- existing Mini Apps have a migration/classification path;
- no new arbitrary Mini App schema is created in SmartAIHub control-plane PostgreSQL by default;
- runtime mutation policy applies consistently to native agents, external harnesses, Skills, MCP and Runners;
- a private-network BYODB reference path is proven without making the DB public;
- at least one interrupted migration resumes safely from durable checkpoints;
- R4 cutover demonstrates recovery-readiness + data reconciliation;
- P1 adapters pass the semantic/conformance suite;
- multi-binding and cross-store consistency behavior is explicitly tested;
- tenant/resource/data-placement policies can block unsafe provisioning or migration.

---

# 59. Twelve-Pass Gap Review and Resolutions

This R1.1 revision was reviewed in twelve distinct passes. The purpose of this section is to make the architectural closure explicit and prevent future implementation from losing the rationale.

| Pass | Review focus | Gap found | Resolution added |
|---|---|---|---|
| 1 | Core architecture / data topology | Original spec implicitly centered many examples on one primary relational binding | Added first-class multiple named data bindings with independent ownership, authority, route and lifecycle |
| 2 | Spec 224 enforcement | Final Verify/static validation could detect a dangerous operation only after lower-level execution | Added mandatory Database Policy Interceptor / Action Broker before every mutation, including external harness/tool paths |
| 3 | Portability semantics | P1 API did not define value/type semantics precisely enough for SQLite/D1/Postgres/MySQL/MSSQL | Added canonical data semantics for decimal, timestamps, IDs, JSON, nullability, collation, pagination and error behavior |
| 4 | BYODB connectivity | Assumed external DB could be reached by the cloud runtime | Added network route classes and execution placement through private tunnel, private runtime, Desktop/Customer Runner, etc. |
| 5 | Authority safety | A0-A5 levels were too coarse without binding/environment/object scope | Added scoped, expiring authority grants and explicit distinction between authority and per-action approval |
| 6 | Online migration | Migration workflow lacked lock/downtime/CDC/dual-write/resume detail | Added online/offline DDL evaluation, CDC/catch-up, write-freeze, durable step IDs, idempotency and resumable checkpoints |
| 7 | Recovery | Backup existence was not enough to prove rollback/recovery | Added recovery capability classification, RPO/RTO, restore-readiness and irreversible barrier checkpoints |
| 8 | Cutover correctness | Schema success could be mistaken for data migration success | Added row/checksum/business-invariant reconciliation and explicit cutover validation |
| 9 | Operational DB behavior | Pooling, timeouts, retries, cancellation and duplicate-write risks were underspecified | Added connection/query operational contract, retry classification, circuit breaking, query budgets and pagination |
| 10 | Tenant/governance/cost | Multi-tenant physical sharing, resource budgets and data placement were insufficiently constrained | Added tenant isolation modes, resource-budget acceptance criteria and data classification/residency gates |
| 11 | Adapter trust | No formal mechanism prevented an adapter from overstating P1 support | Added adapter capability/version registry and conformance-kit requirement |
| 12 | Existing Spec 224 rollout | Additive integration lacked a safe transition strategy for existing generated apps | Added compatibility classification, legacy/enforced paths during rollout, canary/feature-flag migration and no silent new legacy apps after enforcement milestone |

A post-edit consistency pass additionally closed four sequencing/runtime gaps: Phase 273-C now includes the runtime policy interceptor before production BYODB mutation is enabled; lazy provisioning is concurrency-safe; app/schema compatibility is explicit; and raw SQL/stale-worker execution fails closed.

No review pass changes the core user capability principle: a properly authorized user can still use a private or external database, fully redesign its schema, migrate it, or replace the existing system. The added controls govern intent, scope, execution safety, portability and recoverability rather than prohibiting legitimate work.

---

# 60. Adapter Capability and Conformance Contract

Every adapter MUST publish a machine-readable capability descriptor with at least:

```text
adapter_name
adapter_version
engine
engine_version_range
data_contract_versions
claimed_portability_levels
transaction semantics
DDL features
type/semantic mappings
concurrency characteristics
migration capabilities
network/placement requirements
known limitations
```

A P1 claim MUST require passing the relevant Spec 273 conformance suite.

Adapter behavior MUST be versioned independently of a Mini App package. Deployment records MUST capture the adapter version actually used so that a later adapter upgrade cannot make historical execution evidence ambiguous.

Breaking adapter behavior MUST require compatibility evaluation before rollout.

Adapters used for privileged database mutation MUST come from an allowlisted/trusted registry and SHOULD be pinned by version/digest in execution evidence. Dynamically supplied third-party adapters MUST NOT automatically inherit production database authority.

---

# 61. Resource Budget and Cost Governance

Lazy provisioning reduces waste but does not eliminate resource abuse or accidental cost.

Every managed binding SHOULD support policy limits such as:

```text
max databases / installations
max storage class
max requests/queries
max concurrent DB work
max migration runtime
max export/import size
max backup retention class
max provisioned resources
```

The resolver MUST evaluate applicable tenant/platform quotas before provisioning.

Resource budget policy MUST be independent from user database authority: A5 over a customer's SQL Server does not grant unlimited SmartAIHub-managed resource spending.

Budget denial MUST be machine-readable and MUST NOT be misreported as a database capability failure.

---

# 62. Data Classification, Residency and Environment Boundaries

Spec 273 MUST expose hooks for tenant/platform data-governance policy.

A data binding or migration MAY carry classifications such as:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
CUSTOM
```

and placement constraints such as:

```text
allowed providers
allowed regions
allowed execution planes
dev/test copy policy
retention class
export restrictions
```

Spec 224 MUST consult these constraints before choosing a backend, copying data, creating test fixtures from production data, or moving execution to another runtime.

Spec 273 does not itself define jurisdiction-specific legal rules; it provides the enforceable architecture points required for tenant/platform policy to do so.

---

# 63. Open Implementation Questions That Must Be Resolved During Coding

The following are implementation decisions, not architecture gaps, and MUST be captured in implementation ADRs/tests rather than guessed silently:

1. Concrete TypeScript/Rust/Python shape of the Portable Data API.
2. Whether the canonical schema representation is YAML, JSON, typed AST, or generated code.
3. Exact SQL subset allowed by P2 Portable SQL Profile.
4. Initial support depth for stored procedures/triggers across MSSQL/MySQL/PostgreSQL.
5. Exact private-network technologies used by each deployment plane.
6. Concrete backup integration available per provider/engine.
7. Initial tenant-isolation mode supported for managed PostgreSQL.
8. Resource-budget values and billing integration.
9. Exact conformance-test matrix per adapter and engine version.
10. Initial CDC strategy for each supported source/target pair.

These decisions MUST NOT weaken the invariants in this specification.

---

**End of Spec 273**
