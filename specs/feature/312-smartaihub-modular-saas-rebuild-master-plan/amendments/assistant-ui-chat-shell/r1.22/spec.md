# SPEC-312 R1.22 — Tenant Mission source and Core integration

**Date:** 2026-11-15 · **Status:** PARTIAL · **Continuation:** R1.21 Chat/Artifact and Task Control behavior stays intact.

## Authority and ownership

SPEC-294 owns tenant Mission semantics and the versioned Mission projection contract. Its platform-engineering Project/Run catalog is a separate scope and MUST NOT be used as a tenant Mission source. SPEC-277 continues to own Task Control and the upstream `workerJobs.observabilityV1` API. Modular Core owns only its tenant Chat Mission persistence adapter over the existing Core workspace and canonical Chat Jobs.

## Tenant Mission V1

An explicit Mission is owned by the authenticated account and bound to exactly one environment tenant, authorized workspace, and canonical Chat conversation. Ordinary conversations MUST NOT create Missions implicitly. A Mission is a read/organization layer; creating, reading, refreshing or opening one MUST NOT enqueue, redispatch, retry or cancel a Job.

The DTO `smartaihub.tenant-mission.v1` contains `missionId`, `tenantId`, `workspaceId`, nullable `projectId`, `sessionId`, `threadId`, `conversationId`, `status`, `jobIds[]`, `runIds[]`, `agentIds[]`, `eventCursor`, `artifactIds[]`, `createdAt`, and `updatedAt`. IDs must come from persisted Mission rows or authorized canonical Job, event, run and artifact sources. Unsupported identities remain null or empty; tenant IDs are never substituted for workspace IDs.

The Mission lifecycle is explicit and bounded (`active`, `completed`, `archived`). Job status and event high-watermark are read from the existing Job Control Plane. Jobs correlate only by owner, environment tenant, workspace and canonical conversation relation. Run and Agent IDs are populated only when a source provides verified identities. Artifact IDs are sourced from unexpired authorized worker artifact registrations. This amendment does not introduce job membership independent of the canonical conversation, a second queue, an orchestration engine or a parallel event ledger.

Core Mission creation and reads require the normal authenticated Core session and workspace authorization. Database functions repeat workspace and conversation ownership checks; data access is through narrowly granted SECURITY DEFINER routines. No browser legacy cookie is forwarded. Retention follows the owning tenant/workspace and conversation retention. DTO changes require a new schema version; consumers must reject malformed ownership and retain absent optional fields as null/empty.

## Chat Shell behavior

Mission Control navigation opens a real tenant Mission view. The user can explicitly create a Mission for the selected conversation, inspect its actual status, Job/Run/event cursor and artifact references, and return to the same canonical conversation after refresh. Mission data refreshes from the authoritative read model as Chat execution events advance. Inspectors and reconnects remain read-only and cannot duplicate dispatch. Mission artifact references resolve only through the existing authorized artifact panel.

## Acceptance limits

Contract, Core authorization, Chat proxy/UI, disposable SQL integration, exact DEV runtime, owner Task API runtime and authenticated MFA UAT are recorded independently. This amendment does not close SPEC-312 until database/runtime and applicable authenticated UAT criteria pass. Production deployment remains out of scope.

## Requirements

- **REQ-312-R122-01:** SPEC-294 defines tenant Mission authority, identity, lifecycle, retention and a versioned DTO distinct from platform engineering Mission/Run data.
- **REQ-312-R122-02:** Core persists an explicitly created Mission bound to authenticated owner, environment tenant, authorized workspace and canonical Chat conversation, and derives Job/event/artifact relationships only from verified records.
- **REQ-312-R122-03:** Core APIs and Chat proxies enforce authentication, workspace and conversation ownership; forbidden cross-scope reads fail closed.
- **REQ-312-R122-04:** Chat Shell navigation opens Mission Control, preserves canonical conversation identity on refresh, renders actual Mission/Job/Run/event/artifact facts and never redispatches work.
- **REQ-312-R122-05:** SPEC-277 Task owner runtime evidence is checked separately; absent workspace IDs remain null and no legacy session cookie crosses the Core boundary.
- **REQ-312-R122-06:** Existing Chat/artifact/SSE behavior remains covered by regression checks; disposable SQL tests and authenticated browser UAT are executed only where isolated database and normal authorized MFA session are available.
