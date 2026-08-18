# Feature 146: SmartAIHub MCP Server v2 Compatibility, Discovery, Resources, and Production Hardening

**Status:** SPEC READY FOR DEEP-IMPLEMENT — implementation not started by this spec pass
**Version:** 1.0.0
**Created:** 2026-08-17
**Priority:** P1 — protocol compatibility, safe discovery, and complete MCP surface
**Owner:** SmartAIHub Platform / MCP / Hermes Runtime
**Depends-on:** Feature 145 (`145-hermes-remotion-render-executor`), existing Worker Control Plane, existing MCP registry, existing Library/Media ACL services
**Related:** Feature 133 (`remotion_render_video`), Feature 077 (distributed worker fabric), Feature 081 (Hermes Agent Runtime Gateway)

Primary predecessor: [Feature 145 spec](../145-hermes-remotion-render-executor/spec.md).
This document is a protocol/discovery/security successor; it does not replace
Feature 145's executor, worker, artifact, pairing, or native Windows/macOS
release gates. Its Feature 145 MCP and download sections are the compatibility
baseline to preserve.

## 1. Purpose and decision

This feature upgrades the public SmartAIHub MCP endpoint so a modern MCP client
can discover, authenticate, negotiate the protocol era, list and call tools,
read machine documentation, and track asynchronous image/video/Remotion jobs
without breaking the current Hermes/Worker App integration.

The canonical endpoint remains:

```text
https://smartaihub.app/v1/mcp
```

The implementation must be an additive compatibility layer around the existing
application services. It must not create a second render queue, a second credit
ledger, a second media-history source, a second library permission engine, or a
second worker upload protocol.

The target behavior is:

```text
Modern MCP 2026-07-28
  server/discover -> tools/list -> tools/call -> job status/result
  stateless per request; horizontally scalable; no MCP session dependency

Legacy MCP 2025-era, including 2025-11-25
  initialize -> Mcp-Session-Id -> tools/list/tools/call
  retained until telemetry-supported sunset

Both eras
  same authenticated principal -> same SmartAIHub tool registry
  same core services -> same job, credit, artifact, ACL, and audit behavior
```

This spec is a successor/compatibility hardening spec to Feature 145. Feature
145 remains authoritative for Hermes Connector installation, Windows 11/macOS
runtime packs, Remotion executor identity, device pairing, worker leases, and
artifact upload. Feature 146 changes the MCP protocol boundary and completes
the missing discovery/resource/modern-client behavior; it does not replace the
executor architecture.

## 2. Inputs and research basis

### 2.1 User-provided guide

The attached guide was read in full:

`/home/dev/.codex/attachments/fc34f79d-ff7a-44a2-a2d6-a422ae615090/pasted-text.txt`

The guide supplied the target architecture and checklist for:

- modern `2026-07-28` and legacy `2025-11-25` compatibility;
- `server/discover`, Streamable HTTP, per-request metadata, `Mcp-Method`, and
  `Mcp-Name`;
- result metadata, cache hints, tool schemas, annotations, structured results;
- image/video/render/model/credit tools;
- idempotency, credit reservation/settlement, DB/outbox, and worker callbacks;
- Tasks, subscriptions, Resources, docs, OAuth protected-resource metadata;
- SSRF, signed R2 URLs, ownership, rate limits, audit, tracing, health, CORS,
  load testing, failure injection, Inspector, and rollout gates.

The guide is design input, not an instruction to copy pseudocode or invent
tables that duplicate SmartAIHub's existing data model.

### 2.2 Official protocol/SDK research

The implementation team must re-check the locked official specification and SDK
release at implementation time. The research baseline used for this spec is:

- [MCP TypeScript SDK v2 protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)
- [MCP SDK v2 support for 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)
- [MCP SDK v1 to v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)
- [MCP `createMcpHandler`](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/createMcpHandler.html)
- [MCP Resources specification](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)

Important research corrections applied to this spec:

1. A client may default to the legacy initialize handshake even when an SDK v2
   package is installed. Modern `2026-07-28` behavior is an explicit opt-in or
   negotiated era, so the server must implement both paths and must test the
   actual wire behavior rather than infer it from the package version.
2. The modern handler is per-request/stateless. Legacy compatibility may use a
   sessionful or stateless fallback, but modern requests must not depend on a
   Redis session or sticky load balancer.
3. Modern wire-only fields such as `resultType`, reserved `_meta` envelope
   keys, and retry state are protocol-layer concerns. The application adapter
   must preserve them correctly but must not treat untrusted `clientInfo` as
   identity.
4. `resources/list` and `resources/read` are protocol surfaces, not a license
   to expose arbitrary filesystem paths, R2 keys, signed URLs, or user media.
   Phase 1 resources are immutable machine documentation only. User files and
   media remain ACL-checked tools.
5. The SDK migration is staged. The existing codebase does not currently
   declare `@modelcontextprotocol/server` v2 in `apps/web/package.json`; a
   whole-repository codemod or a one-shot replacement of the current hand-rolled
   transport is not allowed without an impact review.

### 2.3 Codebase research method and evidence

SocratiCode was not callable in this execution environment, so discovery used
targeted `rg`, line-range reads, existing tests, and current feature/spec files.
The implementation wave must repeat the same evidence using SocratiCode first
when the MCP is available, then verify exact symbols and line ranges locally.

Current relevant evidence:

| Area | Current evidence | Consequence |
|---|---|---|
| Transport | `apps/web/server/_core/mcpPublicServer.ts:692-862` accepts JSON-RPC, `initialize`, `ping`, `tools/list`, and `tools/call`; all non-initialize calls require `Mcp-Session-Id`. | Modern stateless dispatch and era routing are missing. |
| Version | `SUPPORTED_PROTOCOL_VERSIONS` is only `2025-03-26` at `mcpPublicServer.ts:56`; initialize silently falls back to that version. | Add explicit modern/legacy negotiation and unsupported-version behavior. |
| Discovery | `/.well-known/mcp.json` exists at `mcpPublicServer.ts:882-890`; `/v1/mcp/catalog` exists; neither implements the modern `server/discover` JSON-RPC probe. | Add modern discovery while retaining product catalog/well-known compatibility. |
| Root | `vite.ts:230-265` serves SPA HTML for non-API paths. | `/` is not an MCP endpoint; do not advertise or route clients to root. |
| Resources | No `resources/list` or `resources/read` implementation exists. | Add documentation resources only in Phase 1. |
| Registry | `mcpRegistry.ts:4468-4520` owns session-scoped visibility, annotations, execution, and idempotency requirements. | Extend one registry with aliases, output schemas, cache policy, and scopes. |
| Tool names | Existing names include `smartspec.media.generate_image`, `smartspec.media.generate_video`, `smartspec.media.history.*`, `smartspec.knowledge.library.*`, `smartspec.gateway.models.list`, `smartspec.gateway.credits.get`, and `smartspec.remotion.*`. | Preserve existing names; add guide aliases only through a compatibility mapping. |
| Security | `authz.ts:80-99` accepts Bearer/X-Api-Key and static tokens; `authz.ts:227-255` validates owner/device-bound pairing tokens and revocation. | Reuse principal/authz; narrow static-token policy and add OAuth metadata/challenge. |
| OAuth | `services/mcpOAuthBroker.ts` is primarily an outbound MCP-provider OAuth broker. | Do not confuse outbound provider OAuth with SmartAIHub's inbound MCP Resource Server metadata. |
| Legacy route | `mcpRoutes.ts:479+` exposes `/api/mcp/tools` and `/api/mcp/call` as an older REST tool gateway and rejects delegated workers from using it. | Keep it for legacy/internal compatibility; do not make it the modern protocol endpoint. |
| Result shape | Current public `tools/call` wraps registry results as content/context output; the registry has input schemas/annotations but no uniform output schema/result-type/cache contract. | Add a server-side normalized result adapter. |
| Outer idempotency | `mcpPublicServer.ts:593-673` reads/writes the generic replay result in Redis, keys it through the MCP session/tool/key path, and silently tolerates a Redis write failure; this is a best-effort cache, not an exactly-once business-effect record. | Bind every mutating alias to the authoritative durable idempotency/job service; modern keys must be principal/request-hash based, not session based; use Redis only as an optimization. |
| HTTP methods | The current public route registers POST/DELETE but no explicit GET/OPTIONS MCP behavior. | Add Streamable HTTP method matrix, authenticated GET/SSE policy, CORS preflight, and tests for 405/204 behavior. |
| CORS | Shared CORS in `apps/web/server/_core/index.ts:280-286` does not yet list the modern MCP routing headers. | Add a narrowly scoped allow/expose header policy for `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, session, auth challenge, and trace headers. |
| SDK | `apps/web/package.json` has Remotion and app dependencies but no declared MCP v2 server/express/node/core package. | Add a staged, pinned SDK plan with a v1/v2 boundary; do not run a repository-wide codemod blindly. |
| Tests | `mcpPublicServer.test.ts` has 51 passing tests for current legacy behavior; no resource or modern discovery tests. The security suite currently has 2 failing tests caused by an incomplete session/test harness path. | Add a new protocol matrix and fix the existing harness failures before claiming green. |

## 3. Goals

### G1 — Modern and legacy protocol compatibility

Support one public endpoint with explicit modern `2026-07-28` behavior and
legacy `2025-11-25` behavior. Support the current deployed `2025-03-26` tests
during migration if the compatibility flag remains enabled; sunset it only
after telemetry and a published policy.

### G2 — Self-describing client flow

An MCP client must be able to discover the endpoint and supported protocol era,
obtain a permission-filtered `tools/list`, call tools, understand input/output
schemas, and read human/machine documentation without hard-coded tool names.

### G3 — Complete supported media/render workflow

Through the existing registry and core services, an authorized Hermes client
must be able to:

- list models and capabilities;
- estimate credits and read the owner's balance;
- submit image/video generation;
- submit approved Remotion jobs;
- read/list/cancel owned jobs;
- retrieve the published image/video result via a short-lived server-owned
  reference;
- list/read/download owned Library and media-history files through ACL-checked
  tools;
- inspect and revoke its own connected device where Feature 145 permits it.

### G4 — Keep server-owned business effects

MCP handlers call application services directly in-process. They must not call
SmartAIHub's own REST endpoints over loopback, spawn a shell command, accept an
arbitrary worker callback URL, or reimplement credits, jobs, storage, or ACL.

### G5 — Remove modern dependency on session affinity

Modern requests are independently routable to any application instance. Any
state needed across requests is stored in the existing persistent job/credit/
artifact services or in signed request state. Redis may accelerate ephemeral
operations but cannot be the source of truth for ownership, charges, jobs, or
published artifacts.

### G6 — Harden inbound authentication and authorization

MCP access is authenticated as a user/device/API-key principal with explicit
scopes. OAuth discovery, 401 challenges, audience/resource validation, device
binding, revocation, CSRF/origin policy, rate limiting, audit, and redaction
must be complete before external rollout.

### G7 — Preserve Feature 145's executor and upload contracts

MCP only creates/observes/cancels intent. Remotion execution, worker lease,
progress, checksum, R2 upload, completion publication, media history, and
download ACL continue through Feature 145's existing server/worker contracts.

## 4. Non-goals and hard boundaries

The following are explicitly out of scope for Feature 146:

- replacing the Worker App or requiring Xcode to render on macOS;
- moving Chromium/FFmpeg rendering into `smartspec-web`;
- exposing a general shell/terminal tool to Hermes;
- exposing raw R2 bucket listing, object keys, permanent public URLs, or local
  filesystem paths through MCP Resources;
- accepting arbitrary external media URLs without SSRF validation;
- creating a new `render_jobs` table if existing worker/media job tables already
  represent the authoritative business object;
- granting `mcp:write`, admin, provider, or worker scopes automatically to every
  OAuth client or static token;
- advertising Tasks, subscriptions, prompts, or dynamic user-data resources
  until their end-to-end implementation and tests exist;
- making the `/` SPA route a protocol endpoint;
- silently renaming/removing `smartspec.*` tools.

## 5. Current-to-target compatibility matrix

| Surface | Current | Target in Feature 146 | Compatibility rule |
|---|---|---|---|
| Canonical URL | `POST /v1/mcp` | Same | No new public MCP URL. |
| Product discovery | `GET /.well-known/mcp.json` | Keep and enrich | It is a product manifest, not a substitute for JSON-RPC `server/discover`. |
| Static catalog | `GET /v1/mcp/catalog` | Keep and generate from registry | Mark it static/documentation-oriented; never use it as permission proof. |
| Root `/` | SPA HTML | SPA HTML | Never advertise root as MCP. |
| Modern probe | Missing | `server/discover` JSON-RPC on `/v1/mcp` | Must be safe before legacy initialize and must not create a session. |
| Legacy handshake | `initialize` creates Redis session | Preserve for legacy; support 2025-11-25 and migration version | Session identity is never used for modern calls. |
| Modern calls | Missing | Per-request authenticated dispatch | No `Mcp-Session-Id` required. |
| Legacy methods | `ping`, `tools/list`, `tools/call` | Preserve | Existing clients and tests must continue. |
| Resources | Missing | `resources/list/read` for docs in Phase 1 | No user media/data resources in Phase 1. |
| Prompts | Missing | Remain unavailable | Advertise false until implemented. |
| Tasks | Missing | Do not advertise initially; optional later | Job fallback is always `job_id` + `render.get`/alias. |
| Subscriptions | Missing | Do not advertise initially; optional later | Polling hints/backoff are sufficient for first release. |
| Tool names | `smartspec.*` | Existing names plus compatibility aliases | Alias calls must normalize to one canonical handler and audit name. |
| Auth | session, bearer, API key, pairing, delegated worker | Same principal resolver plus OAuth metadata/challenge | Caller-supplied tenant/user/clientInfo never overrides token claims. |
| Result | content/context projection | normalized content + structured output + schema/cache metadata | Legacy response remains wire-compatible where possible. |
| Files | ACL tools/download broker exist in Feature 145 work | complete typed read/list/download contract | Reference IDs only; short-lived signed retrieval. |
| Billing | existing media/remotion services | estimate → reserve/create → settle/release | Reuse existing transactions and idempotency; no duplicate ledger. |
| Session/cache | Redis session TTL and idempotency | Redis optional for legacy/ephemeral; modern stateless | A Redis outage cannot corrupt or authorize business state. |

## 6. Target architecture

```text
MCP client / Hermes / Hermes Connector
                 │ HTTPS Streamable HTTP
                 ▼
      /v1 middleware: CORS, host/origin, auth,
      feature flag, rate limit, trace, audit
                 │
                 ▼
       MCP Era/Transport Adapter
        ├─ modern 2026-07-28, stateless
        └─ legacy 2025-era, compatibility session
                 │
                 ▼
       Authenticated Principal Context
                 │
                 ▼
      Single Tool/Resource Registry
        ├─ permission-filtered tools/list
        ├─ canonical names + aliases
        ├─ input/output schema + annotations
        └─ docs resources/cache policy
                 │
                 ▼
       Application Service Adapters
        ├─ media generation/history
        ├─ Remotion/worker job services
        ├─ model/credit services
        ├─ Library ACL/download broker
        └─ connected-device/pairing services
                 │
                 ▼
 Existing DB/job/credit/outbox/worker/R2 sources of truth
```

### 6.1 Required layering

Implement or refactor only the minimum needed to create these boundaries:

1. `mcpTransportAdapter`: content type, batch limits, era detection,
   modern/legacy header validation, JSON-RPC dispatch, HTTP status mapping.
2. `mcpPrincipalAdapter`: call existing `authorizeRequest`, pairing revocation,
   tenant/user/device binding, scope normalization, and safe trace identity.
3. `mcpRegistryAdapter`: one canonical registry for tools and resources,
   aliases, schemas, annotations, required scopes, feature gates, and audit
   labels.
4. `mcpResultAdapter`: normalize structured data, content blocks, output schema,
   `isError`, `resultType`, cache hints, and safe public error codes.
5. `mcpApplicationAdapters`: direct calls to current media, Remotion, worker,
   Library, history, model, credit, storage, and connected-device services.
6. `mcpDiscoveryAdapter`: `server/discover`, well-known product manifest, and
   static catalog generated from the same capability source.

The implementation may use the official TypeScript SDK v2 behind these
boundaries, but no v1 and v2 SDK object/type may cross the adapter boundary.
During migration, the old hand-rolled legacy handler and the modern handler may
coexist while sharing only JSON-RPC wire contracts and the application
registry/services.

## 7. Protocol and HTTP contract

### 7.1 Endpoint rules

| Request | Required behavior |
|---|---|
| `POST /v1/mcp` | JSON-RPC 2.0 request/notification/batch, modern or legacy dispatch. |
| `DELETE /v1/mcp` | Legacy session termination only; modern request is a no-op/appropriate protocol response and must not revoke a user/device. |
| `GET /.well-known/mcp.json` | Product discovery manifest with canonical endpoint and advertised eras/capabilities. |
| `GET /v1/mcp/catalog` | Static catalog generated from registry; not tenant-specific authorization proof. |
| `GET /server/discover` | Optional compatibility endpoint only if a client ecosystem requires HTTP discovery; if added, return the same discovery document and do not duplicate logic. |
| `POST /server/discover` | Not a second MCP business endpoint. If supported by the locked SDK/protocol, route to the same modern discovery handler or reject with a documented 404/405. |
| `/` | Remains web SPA; no MCP JSON is returned. |

The final method/path behavior must be confirmed against the locked official SDK
version before implementation. The server must not claim a surface in discovery
unless the route/method has a passing integration test.

#### 7.1.1 Streamable HTTP method and media-type matrix

The implementation must choose and test one deterministic behavior for every
HTTP method; it must not rely on Express fallback ordering:

| Method | Phase 1 policy |
|---|---|
| `POST /v1/mcp` | Primary JSON-RPC request/notification/batch endpoint. Modern responses may be JSON; SSE is enabled only when the locked SDK/feature flag requires it. |
| `GET /v1/mcp` | No standalone subscription stream in Phase 1. Return an authenticated, non-leaking `405` with `Allow` if the client asks for a stream; do not return a public event stream. If subscriptions are later enabled, require an authenticated subscription and enforce per-principal limits. |
| `DELETE /v1/mcp` | Preserve legacy session termination. For modern/no-session calls, return `204` as a no-op; never revoke a user/device or delete durable credentials. |
| `OPTIONS /v1/mcp` | CORS preflight only; validate allowed Origin and requested headers, return no tool/auth data, and never create a session. |
| `HEAD /v1/mcp` | Return `405` with no protocol/auth details. |
| `GET /`, `HEAD /` | Remain the web SPA/normal web route, never MCP discovery. |

For POST, parse `Content-Type` by media type and require JSON. The `Accept`
contract must include `application/json` and, when streaming is enabled,
`text/event-stream`; unexpected media types receive a safe 406/415 response.
Responses must set `Vary: Origin` and any required protocol/cache headers. The
implementation must document whether the SDK handles SSE priming/keepalive and
client disconnect cancellation or whether the adapter does it.

#### 7.1.2 CORS and preflight contract

Update the shared CORS allowlist narrowly rather than enabling wildcard headers.
The MCP browser client contract must explicitly cover:

```text
Request: Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method,
         Mcp-Name, Mcp-Session-Id, traceparent, tracestate, baggage
Response: WWW-Authenticate, MCP-Protocol-Version, Mcp-Session-Id,
          Content-Type, ETag, Cache-Control
```

Only configured SmartAIHub/approved client origins may receive credentialed
CORS. Preflight must not be treated as an authenticated MCP call and must not
leak whether a tenant, tool, or device exists.

### 7.2 Modern era (`2026-07-28`)

Modern requests:

- do not call `initialize`;
- do not require `Mcp-Session-Id`;
- include `MCP-Protocol-Version: 2026-07-28` when required by the locked
  transport contract;
- include the protocol-required `Mcp-Method` header and `Mcp-Name` for routed
  operations when required by the locked transport contract;
- carry reserved protocol/client metadata in `params._meta`; the server lifts
  protocol metadata into the request context and does not pass reserved fields
  as business arguments;
- treat reserved `io.modelcontextprotocol/*` envelope keys and future
  `inputResponses`/`requestState` fields as protocol-owned; reject collisions or
  unsupported use rather than forwarding them into tool arguments;
- may be served by any application instance;
- must reject header/body method or tool-name disagreement with the official
  protocol error code, never execute the body-selected operation silently.

Required dispatch examples:

```text
server/discover
tools/list
tools/call
resources/list
resources/read
ping (if supported by the locked SDK)
```

Modern transport must validate `Content-Type: application/json` by parsed media
type, accept only bounded JSON bodies, preserve required `Accept` semantics for
JSON/SSE if streaming is enabled, and return the correct protocol/HTTP error
class for malformed requests.

### 7.3 Legacy era (`2025-11-25` and migration version)

Legacy behavior remains available behind `mcpLegacyCompatibilityEnabled`:

1. `initialize` negotiates only a version in the server's supported legacy set.
2. A successful initialize may create the existing short-lived session record.
3. `notifications/initialized`, `ping`, `tools/list`, `tools/call`, and DELETE
   session behavior remain compatible with current clients.
4. `resources/list/read` are implemented only if the legacy wire version supports
   them; otherwise return the correct method-not-found response without claiming
   them in that era's capabilities.
5. Current deployed `2025-03-26` tests must remain green during migration. The
   sunset date for that older revision is a product/telemetry decision, not a
   silent code deletion.

Legacy session records must contain only the minimum principal/policy snapshot
needed by the compatibility handler. They must not contain refresh tokens,
provider credentials, raw file data, or arbitrary request bodies.

### 7.4 Unsupported and mismatched versions

Implement deterministic behavior for:

- modern request pinned to an unsupported revision;
- legacy initialize requesting an unsupported version;
- missing/invalid modern protocol header;
- modern header says one method while JSON-RPC body says another;
- modern `Mcp-Name` disagrees with `tools/call.params.name`;
- legacy session sending modern-only methods;
- modern request sending legacy-only session headers when the locked protocol
  treats that as invalid.

Responses must expose a stable public error code/message and a server-side audit
event, while never reflecting arbitrary method/tool strings in HTML or logs
without sanitization.

### 7.5 Cancellation and disconnect semantics

Cancellation must be defined separately at three layers:

1. **HTTP request cancellation:** if the client closes a modern response stream,
   abort only the in-flight MCP handler work that has not committed a business
   effect. Once a durable job/credit reservation is committed, disconnect must
   not roll it back implicitly.
2. **Protocol cancellation:** support legacy `notifications/cancelled` exactly
   for the negotiated legacy era. Modern request-stream close is the primary
   cancellation signal; do not advertise a modern cancellation method that the
   adapter does not implement.
3. **Business cancellation:** `render.cancel`/media cancel invokes the existing
   owner-checked job cancellation service, then maps worker/provider state and
   credit settlement according to the existing job state machine. A cancelled
   HTTP request is not automatically a cancelled render.

Cancellation tests must cover disconnect before and after commit, duplicate
cancel, worker already completed, provider cancellation timeout, and credit
release/settlement. No cancellation path may create a second job or double
release credits.

### 7.6 Modern MRTR and `requestState` policy

Phase 1 does not advertise elicitation, sampling, roots, or `input_required`.
If a client sends `inputResponses` or `requestState` to a tool that does not
support MRTR, reject it as unsupported/invalid before executing the tool. Do not
silently ignore it.

If MRTR is enabled in a later phase, `requestState` must be an opaque,
authenticated, time-limited envelope bound to the principal, tenant, canonical
tool, normalized request hash, protocol era, and one-time nonce. It must have
replay protection and a maximum round count; Redis may hold only the short-lived
replay marker. A valid signature alone is not sufficient if ownership, expiry,
scope, or request hash does not match.

## 8. Discovery contract

### 8.1 Modern `server/discover`

Return a versioned, cacheable discovery object generated from the same capability
registry as `tools/list`:

```json
{
  "serverInfo": {"name": "SmartAIHub", "version": "<server-version>"},
  "endpoint": "https://smartaihub.app/v1/mcp",
  "protocolVersions": ["2026-07-28", "2025-11-25"],
  "eras": {"modern": true, "legacy": true},
  "capabilities": {
    "tools": {"listChanged": false},
    "resources": {"subscribe": false, "listChanged": false},
    "prompts": false,
    "tasks": false,
    "subscriptions": false
  },
  "authorization": {
    "required": true,
    "protectedResourceMetadata": "https://smartaihub.app/.well-known/oauth-protected-resource"
  },
  "ttlMs": 60000,
  "cacheScope": "public"
}
```

The exact official schema must be applied from the locked SDK/spec. Fields not
recognized by the protocol are allowed only as documented extension fields and
must not be relied on for negotiation. The discovery response must not include
user-specific tool visibility, file URLs, tenant IDs, or token expiry.

### 8.2 Product well-known manifest

Keep `/.well-known/mcp.json` for SmartAIHub's existing clients and human/admin
diagnostics. Update it to expose:

- canonical endpoint;
- supported eras and versions;
- `serverDiscover: true` only when tested;
- `tools: true`, `resources: true` after Phase 1 resources ship;
- `prompts/tasks/subscriptions` accurately;
- docs and catalog URLs;
- authorization metadata URL;
- no claim that `/` is an MCP endpoint.

### 8.3 Static catalog

`/v1/mcp/catalog` remains useful for worker/delegated-manifest tooling. It must:

- include canonical tool names, aliases, scopes, input/output schema versions,
  annotations, idempotency mode, and execution mode;
- be generated from the registry, not maintained separately;
- clearly state that tenant grants and feature flags can hide tools;
- never contain raw credentials, local paths, signed URLs, or provider secrets;
- have a version independent of the protocol revision so a catalog update does
  not imply a protocol upgrade.

### 8.4 Capability truth and cache invalidation

Create one capability snapshot builder used by `server/discover`, the
well-known manifest, catalog, `initialize`, and `tools/list` capability fields.
The snapshot must evaluate global/tenant feature flags, deployment version,
protocol era, principal scope, delegated-worker manifest, and operator policy in
that order. A public discovery response may expose only global capability truth;
user-specific visibility belongs in the authenticated `tools/list` response.

The `tools/list` cache key must include at least tenant, user/device principal,
scope fingerprint, delegated manifest revision, feature-flag revision, protocol
era/version, and registry schema version. Never serve a cached list from another
principal or after a revoke/flag change. Cache invalidation must be triggered by
registry deployment, tenant flag change, scope/device revoke, and delegated
manifest change. Until a working change-notification mechanism exists,
`listChanged` must remain false and clients must re-fetch using TTL/refresh
behavior rather than being promised push notifications.

## 9. Unified tool registry and compatibility aliases

### 9.1 Single source of truth

Extend the current `TOOL_REGISTRY` contract with:

```text
canonicalName
aliases[]
description
inputSchema
outputSchema
schemaVersion
requiredScopes[]
readWrite
annotations
idempotencyMode
resultType
cachePolicy
availability/feature flag
delegated-worker policy
auditAction
execute adapter
```

`tools/list`, `/v1/mcp/catalog`, docs resources, snapshots, and any REST/OpenAPI
documentation must be generated from this contract. A tool must not appear in
`tools/list` if its availability predicate or scope check would reject it.

### 9.2 Canonical names and guide aliases

Do not rename the existing `smartspec.*` names. Add compatibility aliases only
where the mapping is unambiguous:

| Guide name | Existing canonical tool | Required action |
|---|---|---|
| `image.generate` | `smartspec.media.generate_image` | Alias with schema adapter; preserve existing input fields and normalize safe asset refs. |
| `video.generate` | `smartspec.media.generate_video` | Alias with schema adapter; asynchronous response and existing media task semantics. |
| `render.get` | `smartspec.remotion.job.status` for Remotion; `smartspec.media.status` for media | Prefer one explicit job-kind adapter; do not guess across unrelated IDs. |
| `render.list` | `smartspec.jobs.list` plus media/remotion history adapters | Add owner-scoped filtered list with stable cursor and explicit job kind. |
| `render.cancel` | `smartspec.remotion.job.cancel` / `smartspec.media.cancel` | Add a normalized alias only if cancel semantics are identical and ownership is checked. |
| `models.list` | `smartspec.gateway.models.list` | Alias with media capability/pricing fields sourced from model registry. |
| `credits.estimate` | no verified single canonical equivalent | Add a core credit estimate adapter; do not estimate from client-supplied price. |
| `account.get_balance` | `smartspec.gateway.credits.get` | Alias with a stable balance output schema. |

If a guide alias would merge incompatible job domains, expose separate explicit
tools instead of a misleading polymorphic alias. Every alias call must audit
both `requestedToolName` and `canonicalToolName`.

### 9.3 Tool input safety

Schemas must reject or normalize:

- unknown fields where the operation is security-sensitive;
- arbitrary local paths, shell commands, callback URLs, credit amounts, worker
  tokens, provider credentials, and tenant/user overrides;
- unbounded prompts, arrays, metadata, and binary/base64 bodies;
- arbitrary `reference_image_urls` unless they pass the approved media-reference
  resolver and SSRF policy.

Feature 145's owner-scoped library/media references are preferred over raw URL
inputs. When a provider requires a URL, the server mints a short-lived signed
broker URL after authorization and preserves the correct file extension/MIME.

### 9.4 Annotations and schemas

Every visible tool must include:

- `inputSchema` with required fields and bounds;
- `outputSchema` for structured JSON results;
- read-only/destructive/idempotent hints matching actual behavior;
- credit-consuming and cancellation behavior in the description;
- required scope and ownership semantics in registry metadata, not only prose;
- examples only with synthetic IDs and no secrets.

Changing a required input, enum meaning, output type, read/write behavior, or
pricing semantics is a breaking change. Add optional fields first, publish a
schema snapshot change, and version a tool only when necessary.

### 9.5 Pagination and cursor integrity

All potentially large lists (`tools/list`, `render.list`, media history,
Library search, and future resources) use bounded page sizes and opaque cursors.
The cursor must encode or reference the principal/tenant/scope fingerprint,
filter/sort definition, schema version, expiry, and last position. It must be
signed or server-bound and must not contain raw secrets or sensitive object IDs.
An empty cursor has one documented meaning (initial page or end-of-list) and is
handled consistently across both eras. Tampered, expired, cross-tenant, or
oversized cursors return invalid-params without changing query scope.

## 10. Standard result and error model

### 10.1 Normalized result

The application result adapter must produce a stable structured result for new
modern calls:

```json
{
  "resultType": "complete",
  "content": [
    {"type": "text", "text": "The request was accepted."}
  ],
  "structuredContent": {
    "job_id": "owner-scoped-id",
    "status": "queued",
    "estimated_cost_credits": 30,
    "reserved_credits": 30,
    "created_at": "2026-08-17T06:00:00+07:00"
  },
  "ttlMs": 0,
  "cacheScope": "private"
}
```

The final wire shape must follow the locked official codec. The application
must not blindly serialize `resultType` into a legacy result if the legacy wire
version does not support it; instead use the compatible legacy projection.

Rules:

- protocol/transport failures are JSON-RPC errors;
- expected business/tool failures use a safe tool error projection and
  `isError: true` where supported;
- internal/provider errors map to stable public codes such as
  `PROVIDER_UNAVAILABLE`, `JOB_NOT_FOUND`, `INSUFFICIENT_CREDITS`, or
  `RENDER_NOT_READY`; raw stack traces, internal URLs, SQL, keys, and provider
  payloads stay in access-controlled logs;
- `JOB_NOT_FOUND` is returned for both unknown and another-user job IDs;
- result URLs are short-lived and signed; the response includes MIME and expiry,
  never a permanent public bucket URL.

### 10.2 Cache policy

| Result | Cache policy |
|---|---|
| `server/discover` | `public`, short TTL, no user data. |
| docs `resources/list/read` | `public` or version-scoped, ETag/content hash, immutable revision. |
| `tools/list` | `private` when scope/tenant/feature visibility affects it. |
| model list | `private` or tenant-scoped, short TTL. |
| credit balance | `private`, no shared cache. |
| job status/result | `private`, bounded TTL; never cache across users. |
| signed download URL | do not cache as a durable application result; expiry is authoritative. |

Absent or non-positive TTL means immediately stale. A cache hit must never bypass
the current principal/tenant/feature check.

## 11. Asynchronous jobs, idempotency, credits, and workers

### 11.1 Unified job adapter

The guide's generic job object is an MCP projection, not a new source of truth.
Build a normalized adapter over existing media tasks, worker jobs, Remotion
jobs, and published artifacts:

```text
job_id, kind, status, progress, created_at, updated_at,
estimated_cost_credits, reserved_credits, charged_credits,
result reference, public error code, retry/cancel capability
```

The adapter must retain the original authoritative ID and job kind internally so
an ID from one subsystem cannot be looked up in another subsystem accidentally.

### 11.2 Submit transaction

For generation/render mutations, the server must preserve the existing service
transaction order:

1. authenticate principal and verify scope/tenant/feature/model capability;
2. normalize the request and compute a deterministic request hash;
3. require or generate an idempotency key according to tool policy;
4. check an existing durable idempotency record for same principal/tool/hash;
5. estimate cost using the server model/price registry;
6. atomically reserve credits and create/reuse the authoritative job;
7. publish the existing queue/outbox event transactionally;
8. return accepted job projection without waiting for render completion.

Do not add a duplicate `render_jobs`/`credit_transactions` table if the current
schema already provides the same invariant. If a durable idempotency uniqueness
constraint is missing, add the smallest migration after schema/live-ledger
preflight and document rollback/reconciliation.

The current outer MCP replay cache is not sufficient for exactly-once effects:
`mcpPublicServer.ts:593-673` caches a rendered response in Redis and ignores a
cache write failure. Therefore the implementation must classify each tool:

| Tool class | Idempotency authority |
|---|---|
| Pure read/list/resource | No durable mutation; cache only under the result cache policy. |
| Media/Remotion/job submission | Existing durable media/worker job idempotency key and unique tenant/owner/request fingerprint. |
| Credit reservation/settlement | Existing credit transaction idempotency/transaction boundary. |
| Download grant | Existing grant/token one-time or expiry/redeem policy; never generic MCP replay cache alone. |
| Device connect/revoke | Existing pairing/device consent and revocation lineage. |

The generic Redis cache may short-circuit a repeat response only after the
authoritative service has recorded the effect. A same key with a different
normalized request hash must return a stable conflict, never execute a second
effect. A Redis outage must not turn a previously committed mutation into an
unknown/retryable state without consulting the durable service.

### 11.3 Worker completion

Feature 145 remains authoritative:

- executor claims the correct runtime/contract;
- worker reports progress through worker control routes;
- worker initializes a server-owned artifact upload;
- worker uploads bytes to the presigned destination;
- worker completes artifact with checksum/size/MIME/probe metadata;
- server verifies lease/ownership/checksum and transitions job;
- billing settles or releases exactly once;
- media history and ACL-visible result are published.

MCP must not accept a client callback URL or let Hermes upload directly to an
arbitrary bucket. Duplicate callbacks must be idempotent.

### 11.4 Tasks and subscriptions

Do not advertise `tasks`, `tasks/get`, `tasks/cancel`, or
`subscriptions/listen` in Feature 146 Phase 1 unless all of the following are
implemented and tested:

- persistent task-to-job mapping;
- ownership and revocation;
- restart/load-balancer recovery;
- notification fanout and backpressure;
- task cancellation mapping;
- legacy fallback behavior;
- metrics and failure injection.

The required first-release async contract is `job_id` plus `render.get`/status
polling with server-provided `poll_after_ms`/backoff hints. Tasks can be a later
flagged extension without changing the job/credit source of truth.

The guide's Tasks recommendation is not automatically the modern baseline:
official SDK v2 treats the 2025 task vocabulary as deprecated wire
interoperability and excludes `tasks/*` from the modern typed method maps. The
server must not advertise or invent modern task methods. If legacy task
interoperability is required later, it must be an explicit legacy-only adapter
with its own fixtures and sunset policy.

Resource templates are also not advertised in Phase 1. Only concrete,
allowlisted documentation URIs are exposed; no user-controlled URI template can
be used to turn `resources/read` into a filesystem, HTTP, or R2 proxy.

### 11.5 Model capability, quota, and expensive-action policy

Before generation/render submission, resolve the requested model through the
server model registry and validate:

- model exists and is enabled for the tenant/principal;
- operation (image/video/edit/i2v/Remotion profile) is supported;
- aspect ratio, duration, resolution, reference count, MIME, and provider
  connection satisfy model limits;
- current tenant/user/API-key quotas, concurrency, and credit limits permit the
  operation;
- provider account/connection is authorized and its capability manifest is
  current;
- price/credit estimate is calculated server-side and has a bounded maximum.

`credits.estimate` must be callable before a charge. For operations over a
configurable credit threshold or quota risk threshold, the tool must require an
explicit confirmation value bound to the same request hash and short expiry, or
return a clear next action. A natural-language phrase such as “yes” outside the
validated confirmation contract must not authorize a hidden charge.

## 12. Resources and manual access

### 12.1 Phase 1 documentation resources

Implement `resources/list` and `resources/read` for machine-readable, immutable
documentation only, for example:

```text
smartaihub://docs/mcp/getting-started
smartaihub://docs/mcp/authentication
smartaihub://docs/mcp/tools
smartaihub://docs/mcp/jobs
smartaihub://docs/mcp/credits
smartaihub://docs/mcp/files
smartaihub://docs/mcp/errors
smartaihub://docs/mcp/compatibility
```

Resource rules:

- URI must be parsed as an allowlisted scheme/authority/path; reject traversal,
  percent-encoded traversal, symlink escapes, unknown authorities, and arbitrary
  `file://`, `http://`, `https://`, `r2://`, or local paths;
- content is generated from the same registry/schema/docs source where
  possible, not manually duplicated text that can drift;
- response includes stable revision/hash and cache hints;
- no user-specific content, tenant names, credentials, job IDs, signed URLs,
  worker paths, or provider secrets;
- unknown URI returns a non-leaking not-found error.

### 12.2 User Library, R2, and media history remain tools

The previous requirement that Hermes can access every permitted file is met via
ACL-checked tools, not arbitrary MCP resources:

- `smartspec.knowledge.library.search/get/download` use the existing Library
  permission engine and storage authorization service;
- `smartspec.media.history.list/get/download` use the merged media-history
  sources and apply tenant/user filtering at every source;
- Remotion/media result download uses the server-owned artifact/publication
  path;
- R2-backed objects are resolved through a short-lived broker grant and signed
  URL after ACL authorization;
- download outputs contain file ID/reference, filename, MIME, size (when safe),
  expiry, and a one-time/short-lived retrieval reference—not a bucket key;
- every download grant is audit logged with principal, device, object class,
  object ID hash, purpose/tool, issued/expiry time, and outcome;
- binary bytes are not embedded in `tools/call` except for an explicitly
  bounded future capability with separate limits and review.

### 12.3 Extensions, MCP Apps, and Skills boundary

Feature 146 does not advertise unimplemented MCP extensions, MCP Apps/UI
resources, prompts, roots, sampling, or Skills-over-MCP execution. Unknown
extension metadata is ignored or rejected according to the negotiated protocol;
it must never cause an arbitrary handler, browser action, shell command, or
client-supplied callback to run. Future extensions require their own capability
flag, scope, schema, security review, and legacy/modern compatibility fixture.

## 13. Authentication, OAuth, and connected-device security

### 13.1 Principal hierarchy

Trusted identity is derived only from a validated credential:

| Principal | Allowed purpose |
|---|---|
| Browser session | User-authorized MCP calls with origin/CSRF protection. |
| Scoped API key | Server-to-server calls within tenant/key scopes and quotas. |
| OAuth bearer access token | MCP client calls after issuer/audience/resource/scope validation. |
| Feature 145 agent-pairing token | One owner/device-bound Hermes Connector session with exact consented scopes. |
| Delegated worker token | Worker-control-plane operations only; no legacy `/api/mcp` bypass. |

`clientInfo`, `clientCapabilities`, request metadata, `X-Tenant-Id`,
`X-User-Id`, job IDs, file IDs, and device labels are not authentication.

### 13.2 Protected Resource Metadata

Add a server-side route:

```text
GET /.well-known/oauth-protected-resource
```

It must be generated from deployment configuration and contain only validated
public metadata:

- `resource` equal to the canonical protected MCP resource identifier;
- supported authorization server issuer(s);
- supported scopes;
- optional resource documentation URL.

Do not expose client secrets or internal provider metadata. The route must be
cacheable but must not be user-specific.

### 13.2.1 Authorization Server discovery decision gate

Protected Resource Metadata is incomplete unless every advertised authorization
server can be discovered and can issue tokens intended for the SmartAIHub MCP
resource. Before enabling `mcpOAuthProtectedResourceEnabled`, choose exactly one
deployment mode:

1. **External authorization server:** configure a fixed issuer and its RFC 8414
   or OpenID Connect metadata URL, JWKS, audience/resource identifier, supported
   scopes, and operational ownership. SmartAIHub verifies only tokens issued for
   this resource and never accepts a token from an unrelated provider merely
   because it is a valid JWT.
2. **SmartAIHub authorization server:** implement and test the authorization,
   token, revocation, and metadata endpoints using the existing identity/device
   system, with PKCE S256 for public clients and explicit redirect/client policy.

Dynamic Client Registration is disabled by default. If enabled later, restrict
redirect URIs to HTTPS/approved loopback rules, require PKCE, validate client
metadata, rate-limit registration, and never allow arbitrary redirect domains.
Client ID Metadata Documents or pre-registered clients may be preferred over
open registration. The decision, issuer, resource URI, JWKS rotation, token
audience, and key-cache outage behavior must be recorded in deployment config
and tested as a release gate.

Feature 145's Hermes device pairing is a separate owner/device credential flow;
it must not be mislabeled as an OAuth authorization server or used to satisfy
the PRM issuer requirement without a standards-compliant token verifier.

### 13.3 401 challenge

Unauthenticated access to the protected MCP endpoint returns 401 with a
standards-compliant `WWW-Authenticate: Bearer` challenge that points to the
protected-resource metadata. Invalid/expired tokens must not be converted into
a legacy fallback. Insufficient scope returns the correct 403/protocol error.

The implementation must distinguish:

- missing credentials;
- malformed credentials;
- invalid issuer/signature/audience/resource;
- expired/revoked credential;
- authenticated but insufficient scope;
- revoked connected device.

Public responses remain generic enough to avoid token/account enumeration;
internal audit events retain the reason category.

### 13.4 Scope model

Keep current scopes as compatible aliases while introducing least-privilege
scopes where needed:

```text
mcp:read
mcp:write
llm:chat
media:generate
media:read
media:download
remotion:submit
remotion:read
remotion:cancel
library:read
library:download
library:search
library:upload
hermes:connect
hermes:read
hermes:generate
hermes:disconnect
```

The old `models:read` and `render:*` names remain accepted only as OAuth
request aliases and are normalized to `llm:chat` and `remotion:*` before a
grant/token is issued. Write tools require both `mcp:write` and their specific
operation scope.

`mcp:write` and static server tokens must not silently grant all new scopes in
new OAuth/device flows. A temporary legacy mapping may remain behind
`mcpLegacyBroadScopeCompatibilityEnabled`, with audit and sunset telemetry.

Scope checks happen before tool availability and again in the application
service for sensitive object access. Tool listing is permission-filtered; a
hidden tool must not be callable by guessing its name.

### 13.5 Connected-device and Feature 145 pairing

Preserve Feature 145's browser approval, PKCE, refresh rotation, DPAPI/Keychain
storage, owner/device binding, revocation, and connected-device UI. Feature 146
adds protocol compatibility only:

- modern MCP calls authenticate with the pairing access token without a Redis
  session;
- device revocation invalidates future access and refresh use;
- token expiry is displayed as metadata only, never token material;
- a device can access only its owner's tenant and consented scopes;
- `smartspec.hermes.agent.disconnect` remains an explicit revoke tool and must
  not be exposed to another user's device;
- no MCP response returns worker refresh tokens, pairing refresh tokens,
  provider OAuth tokens, local paths, or runtime secrets.

### 13.6 User and tenant control plane

The server must provide a real control plane for access that is limited to the
authenticated user's own devices/keys, with tenant-admin actions explicitly
separate:

- user Settings lists only the user's connected MCP/Hermes devices and API keys;
- each row exposes safe label/fingerprint suffix, platform/runtime, created at,
  last seen, last IP/region only where policy permits, granted scopes, status,
  and access/refresh expiry timestamps;
- the user can revoke one of their own devices/keys and a safe “revoke all my
  devices” action must be available; revoke is idempotent and takes effect for
  modern calls immediately;
- raw access/refresh/API key values are shown only once at issuance when
  applicable and are never returned by list/audit endpoints;
- tenant admins can manage tenant feature flags and emergency revoke according
  to RBAC, with actor, reason, before/after, and timestamp audit;
- a user cannot enable their own tenant's modern MCP/Remotion feature flag or
  grant themselves a broader scope through MCP.

The UI/API contract must cover loading, empty, expired, revoked, inaccessible,
and backend-error states. This is a functional security control, not a mockup or
an optional admin convenience.

## 14. Security hardening requirements

### 14.1 SSRF and URL handling

For every URL-like input or provider reference:

- prefer a server-owned asset/library ID over a raw URL;
- allow only approved schemes and provider/storage hosts;
- resolve DNS and block loopback, link-local, RFC1918, metadata endpoints,
  localhost aliases, IPv4-mapped private IPv6, redirects to private addresses,
  and rebinding changes;
- enforce connect/read timeout, response-size limit, content-type/MIME check,
  redirect count, and safe extension policy;
- never log bearer/query credentials;
- use the existing `storageReadBuffer`/storage adapter for managed objects,
  not unauthenticated internal HTTP fetches.

### 14.2 Ownership and enumeration

Every job, media task, library item, artifact, download grant, connection, and
device lookup is constrained by tenant and owner. Cross-owner IDs return the
same not-found shape as unknown IDs. Cursors are opaque, signed or server-bound,
bounded, and cannot be altered to change tenant scope.

### 14.3 Origin, host, and CORS

- preserve the existing cookie-session origin check;
- validate allowed hostnames and reject untrusted `Host`/`Origin` combinations;
- Bearer/API-key agent traffic may omit browser Origin, but browser cookie calls
  cannot bypass production origin/CSRF policy;
- expose only required MCP headers (`MCP-Protocol-Version`, `Mcp-Method`,
  `Mcp-Name`, `Mcp-Session-Id`, `WWW-Authenticate`, tracing headers) through
  CORS;
- never use wildcard credentials CORS;
- protect `/.well-known` responses from tenant-specific caching.

### 14.4 Request and result limits

Retain current batch/body/result safeguards and add per-tool limits for prompt
length, references, array sizes, page size, cursor length, resource URI length,
and signed-download lifetime. Rate-limit by principal/tenant/tool and add
separate protection for render submission, status polling, downloads, and
discovery/list operations.

### 14.5 Logging and privacy

Audit at minimum:

```text
request accepted/rejected
protocol era/version/header mismatch
auth outcome and scope denial
tools/list visibility summary
tools/call requested/canonical name, outcome, duration
job/idempotency/credit transitions
resource URI class (not sensitive content)
download grant issued/used/expired
device connect/revoke
worker callback and artifact publication
```

Logs must hash or redact user/file/job/token identifiers as appropriate, never
record bearer tokens, provider credentials, signed URLs, raw prompts when policy
forbids it, or full binary content. OpenTelemetry trace context may propagate
through reserved metadata after validation and redaction.

### 14.6 Retry, timeout, concurrency, and backpressure

Retry policy must be operation-specific:

| Operation | Retry rule |
|---|---|
| Discovery/list/read/status | Bounded exponential backoff with jitter; honor `Retry-After` and cache TTL; safe to retry only with the same principal/visibility context. |
| Generation/render submit | Never blind-retry after an uncertain commit; consult durable idempotency/job state first, then retry only when the service contract says the effect was not committed. |
| Cancel | Idempotent retry; return the current authoritative state. |
| Download grant redemption | Retry only transport failures before redemption; never replay a redeemed one-time grant. |
| Worker/provider callback | Retry through existing outbox/worker reconciliation and callback idempotency, not from the MCP client. |

Every operation has a server timeout, an upstream timeout, and a total budget;
long renders are always asynchronous. The adapter must propagate abort signals
to work that has not committed, but must preserve committed job/credit state.
Per-principal, tenant, tool, provider connection, and global concurrency limits
must apply before expensive work. Queue admission returns a bounded retryable
error instead of accepting unbounded work; status polling receives backoff hints
to prevent a `render.get` storm.

### 14.7 Trace context and correlation

Accept only validated W3C trace context (`traceparent`, `tracestate`, and
`baggage`) within the protocol's reserved metadata/header contract. Generate a
server trace ID when absent, never use a client-supplied value as an audit
identity, and propagate a sanitized child context to core services, queue,
worker callback, R2 publication, and download redemption. Logs and metrics must
correlate the request/alias/job without exposing bearer tokens or signed URLs.

## 15. Redis, persistence, and failure behavior

Redis is not removed globally by this feature and is not made the authority for
business data. Its permitted uses are:

- legacy MCP session TTL during compatibility;
- short-lived pairing/download grants already defined by Feature 145;
- rate limits, short cache, notification fanout, distributed locks, and
  reconciliation hints.

The following must remain persistent/authoritative:

- job and task business state;
- ownership/tenant relationship;
- credit reservation/settlement/release;
- idempotency outcome for generation effects;
- artifact publication/checksum and media-history record;
- connected-device consent/revocation lineage.

Failure rules:

| Failure | Required behavior |
|---|---|
| Redis unavailable on modern read | Continue if operation does not require ephemeral cache; fail closed for auth-sensitive grant/session checks. |
| Redis unavailable on modern generation | Use durable idempotency/core service; do not create an untracked charge/job. |
| Redis unavailable on legacy session | Return retryable auth/session error; never treat it as a new authenticated session. |
| DB timeout after credit reserve | Transaction rolls back or reconciler settles/release exactly once. |
| queue/outbox unavailable | Durable job remains explicitly pending/retryable; no false success. |
| worker crash | Existing worker reconciliation recovers job; MCP status remains authoritative. |
| duplicate worker callback | Idempotent by job/attempt/artifact/checksum and lease. |
| R2 upload failure | Job does not publish a successful result; reservation is settled/released per existing contract. |

### 15.1 Persistent data and retention contract

Before any migration, perform a live-schema/Drizzle-ledger preflight and map
the required invariants to existing tables. The implementation must explicitly
identify the authoritative records for:

```text
MCP request/audit event
durable mutation idempotency fingerprint and outcome
media task / worker job / Remotion job
credit reserve/settle/release transaction
artifact publication/checksum
download grant/redeem/expiry
connected-device consent/revocation
```

If an invariant is missing, add the smallest tenant/owner-scoped migration with
transactional preflight, unique indexes, backfill/null-row policy, rollback or
forward-repair plan, and migration ledger verification. Do not create generic
tables with names from the guide until this mapping proves they are necessary.

Define configurable retention and deletion behavior for:

- legacy MCP sessions and Redis idempotency response cache;
- audit/security events and token/device metadata;
- expired download grants and signed result references;
- completed/failed/cancelled job projections and media history;
- documentation resource revisions and ETags;
- abandoned credit reservations and reconciliation records.

Retention must not delete a still-user-visible media artifact or billing record,
and deletion must preserve the minimum audit/billing evidence required by
SmartAIHub policy. Expired URLs/grants must fail closed even if an old response
is replayed from a client cache.

## 16. Feature flags and rollout

Add or reuse explicit flags; default them off for new surfaces:

```text
mcpModernProtocolEnabled=false
mcpLegacyCompatibilityEnabled=true
mcpResourcesEnabled=false
mcpGuideToolAliasesEnabled=false
mcpOAuthProtectedResourceEnabled=false
mcpModernStatelessLegacyFallbackEnabled=false
mcpTasksEnabled=false
mcpSubscriptionsEnabled=false
mcpLegacyBroadScopeCompatibilityEnabled=true   # temporary, audited
```

Flag evaluation order is `global emergency kill switch` → `deployment
environment` → `tenant flag` → `principal/device policy` → `tool availability`.
There is no user-controlled override that can widen access. Flag reads must be
consistent across all application instances; if the configured flag store is
unavailable, sensitive new capabilities fail closed and legacy behavior follows
the documented compatibility policy. Every change records actor, tenant,
previous value, new value, reason, and timestamp.

The existing tenant-level `remotionDedicatedExecutorEnabled` remains the gate
for dedicated Remotion execution. MCP protocol enablement must not implicitly
enable Remotion rendering or broaden tenant permissions.

Rollout stages:

1. **Offline contract:** registry/schema snapshots, unit tests, protocol fixture
   tests, no public behavior change.
2. **Internal modern:** allow internal/test principals; modern discovery and
   tools/resources read only; collect metrics.
3. **Selected tenants:** enable modern transport and aliases; keep legacy and
   kill switch; validate Windows 11/macOS Hermes Connector and Worker App flows.
4. **General availability:** enable resources/docs and approved aliases after
   security/load/failure gates; keep legacy until telemetry-backed sunset.
5. **Sunset review:** publish deprecation date, inspect legacy traffic, migrate
   clients, then remove only obsolete revisions/aliases with a versioned change.

## 17. Observability and operational gates

Metrics:

```text
mcp_requests_total{method,era,version,status}
mcp_request_duration_ms{method,era}
mcp_protocol_errors_total{code,era}
mcp_header_mismatch_total{header}
mcp_auth_failures_total{reason}
mcp_scope_denials_total{scope,tool}
mcp_tools_list_total{cache,visible_count}
mcp_tools_calls_total{requested_tool,canonical_tool,status}
mcp_resource_reads_total{resource_class,status}
mcp_idempotency_hits_total{tool}
mcp_job_created/completed/failed/cancelled_total{kind}
mcp_credit_reserve/settle/release_failures_total
mcp_download_grants_total{object_class,status}
mcp_worker_callback_duplicates_total
mcp_r2_upload_failures_total
mcp_legacy_sessions_active
mcp_modern_requests_without_session_total
```

The rollout telemetry must additionally partition request records by
`transport` (`modern_http`, `legacy_rest`, `pairing`, `download_broker`, or
`oauth`), exact endpoint, client name, client version, protocol version, auth
mode, status, and duration. Client identity is read from MCP client headers or
the initialize `clientInfo` object. Telemetry is metadata-only: never persist
authorization headers, bearer/refresh tokens, prompts, tool arguments, raw
request bodies, or signed URLs. Modern `/v1/mcp` requests use the existing
public API audit path exactly once; compatibility transports use the shared
MCP audit path and public audit storage when a tenant principal is known.

Legacy REST and pairing are compatibility fallbacks, not removal candidates at
launch. Keep them enabled while telemetry shows any traffic. A deprecation
review requires at least 30 consecutive days with zero legacy requests; use a
90-day observation window for external clients where practical. Removal also
requires a published migration date, user notification, a rollback switch,
and separate evidence that Hermes, Claude, Codex, and internal clients have
migrated to `/v1/mcp` with OAuth or an explicitly supported modern credential.

Alerts:

- modern/legacy protocol errors or header mismatch spike;
- 401/403 spike by issuer/device/tool;
- MCP 5xx, queue backlog, render latency, worker callback duplicates, credit
  mismatch, or R2 failure exceeds threshold;
- abnormal status polling/download burst;
- Redis failure causes fail-closed auth or legacy session errors;
- discovery advertises a capability whose integration tests are failing.

Health/readiness must distinguish:

- HTTP/MCP route reachable;
- auth metadata configured;
- DB/core services ready;
- queue/worker fabric available;
- R2 signing available;
- optional Redis availability;
- feature flags/capability gates.

Health must not leak credentials or tenant data and must not report `healthy`
when the advertised modern path is disabled or misconfigured.

## 18. Implementation plan and file ownership

The deep-implement plan must verify current filenames/symbols before editing.
Expected ownership is:

| Workstream | Likely files/areas | Required outcome |
|---|---|---|
| Transport/era adapter | `apps/web/server/_core/mcpPublicServer.ts`, new focused `mcp*` adapter modules, route registration | Modern/legacy dispatch, headers, content type, batch, errors. |
| HTTP/CORS edge | `apps/web/server/_core/index.ts` shared CORS/CSRF middleware plus public MCP route registration | OPTIONS/GET/HEAD policy, exact MCP header allow/expose lists, Origin/Host behavior, no wildcard credentialed CORS. |
| Discovery | same public server + docs/catalog generator | `server/discover`, well-known, catalog consistency. |
| Registry | `apps/web/server/_core/mcpRegistry.ts` and tests | aliases, output schemas, result/cache metadata, scope/audit metadata. |
| Result/errors | public MCP adapter + shared types if needed | normalized modern result and legacy projection. |
| Resources | new focused resource registry/service + public tests | allowlisted docs `resources/list/read`, no user-data exposure. |
| Auth/OAuth | `authz.ts`, token/scopes, route middleware, new metadata route/tests | 401 challenge, protected-resource metadata, scope/audience/resource checks. |
| Authorization-server integration | configured issuer/metadata/JWKS verifier or SmartAIHub AS boundary | PRM is paired with a real discoverable issuer; PKCE/client registration policy and key rotation are tested. |
| Jobs/credits | existing media/remotion/worker services only | adapter/projection; no duplicate business source. |
| Library/media downloads | existing Feature 145 download/storage/ACL services | complete object authorization and safe short-lived references. |
| Observability | existing audit/metrics/trace services | method/era/tool/job/device metrics with redaction. |
| Control plane | Feature 145 connected-device UI/services, `apiKeys` router/service, tenant feature-flag service | user-only device/key revoke, tenant-admin flag audit, expiry display, no self-escalation. |
| Persistence/retention | existing Drizzle schema/migrations and Redis ephemeral services | live-schema/ledger preflight, durable idempotency mapping, retention/reconciliation policy. |
| Docs | MCP docs source and registry-generated resources | human and machine docs from one source. |
| Tests | `apps/web/server/_core/__tests__`, service tests, protocol fixtures | full acceptance matrix below. |
| Dependencies | `apps/web/package.json`, lockfile | staged SDK v2 addition; no blind v1 replacement. |

No implementation wave may modify unrelated dirty files. Feature 145's current
uncommitted work is user-owned; use narrow diffs and preserve it.

### 18.1 Dependency and migration strategy

Because the current app is Node 22/TypeScript and does not yet declare the MCP
v2 packages, use an incremental package boundary:

1. Pin the official `@modelcontextprotocol/server` v2 line and only the adapter
   packages actually required (`express`/`node`/`core` as applicable), together
   with the compatible Zod version, after lockfile review.
2. Keep any existing v1/hand-rolled transport isolated while the modern adapter
   is introduced. Do not pass v1 SDK classes, v2 SDK classes, or their nominal
   types across the boundary; share JSON wire fixtures and application service
   types only.
3. Confirm ESM/CommonJS, Node engine, Express middleware/body parser, error
   handling, CORS, and test-runner compatibility in a focused package test
   before replacing the old handler.
4. Remove old dependencies only after imports/tests prove no v1 consumer
   remains. Record the exact package versions and protocol revision in the MCP
   changelog and lockfile.

The deep-implement plan must include a dependency rollback path: if SDK v2
cannot serve the current legacy behavior without a regression, retain the
adapter and old legacy handler behind the compatibility flag rather than
forcing a one-shot production migration.

### 18.2 Compatibility documentation and changelog

Maintain a versioned `docs/mcp/CHANGELOG.md` or the repository's canonical MCP
documentation source with each protocol/catalog/schema/alias/scope change. Each
entry must state whether the change is additive, deprecating, or breaking, the
minimum client era/version, migration guidance, feature-flag state, and sunset
date if applicable. Generate machine documentation Resources from the same
source where possible so the human docs and `resources/read` contract cannot
drift.

## 19. Test-first acceptance matrix

### 19.1 Unit tests

- modern/legacy era detection and version negotiation;
- header/body method and tool-name mismatch;
- content type, body, batch, cursor, URI, and input limits;
- alias normalization and audit-name preservation;
- input/output schema and annotation snapshots;
- result/error mapping and redaction;
- cache policy by result class;
- scope implication/legacy compatibility mapping;
- ownership and not-found non-enumeration;
- SSRF/private-address/redirect/rebinding protections;
- signed URL/download grant lifetime and MIME/extension preservation;
- request hash/idempotency normalization;
- job state and credit projection;
- resource URI allowlist/traversal rejection.

### 19.2 Protocol integration tests

Modern:

- `server/discover` without a session;
- modern `tools/list` without `Mcp-Session-Id`;
- modern `tools/call` routed to another app instance with the same principal;
- `GET /v1/mcp`, `OPTIONS /v1/mcp`, `HEAD /v1/mcp`, content type, and `Accept`
  behavior;
- browser preflight and exposure of the exact modern MCP headers without
  wildcard credentialed CORS;
- `resources/list/read` docs and unknown URI;
- modern header/body mismatch and unsupported version;
- modern request disconnect before/after durable commit and legacy
  `notifications/cancelled`;
- MRTR/requestState rejection in Phase 1 and signed/replay-bound requestState
  fixtures for the future phase;
- structured result, error result, `ttlMs`, and `cacheScope` wire shape;
- no modern capability is advertised when its flag is off.

Legacy:

- initialize for 2025-11-25 and migration version;
- current 2025-03-26 compatibility tests while flag is on;
- initialized notification, session expiry, DELETE, tools/list/call;
- legacy projection does not emit unsupported modern-only fields;
- legacy delegated-worker restriction remains enforced.

### 19.3 Business integration tests

- MCP image generation calls the same media core as web/API;
- MCP video generation calls the same media task/credit/idempotency path;
- Remotion submit maps to Feature 145's existing job/worker lane;
- status/list/cancel enforce owner and job kind;
- worker completion publishes the same R2/media-history result as Worker App;
- duplicate submit/callback cannot double-create or double-charge;
- Redis replay-cache loss cannot create a second durable generation or hide the
  authoritative idempotency conflict;
- model capability, quota, max-credit, and expensive-action confirmation
  policies are enforced before mutation;
- failure releases/settles credits exactly once;
- library/media-history list/get/download works for images, videos, audio,
  documents, archives, and future registered MIME types only where ACL grants;
- R2 object key knowledge alone cannot download another user's file.

### 19.4 Security tests

- missing/expired/revoked/invalid-audience/invalid-resource bearer token;
- 401 `WWW-Authenticate` metadata challenge;
- authorization-server metadata/JWKS discovery, key rotation, PKCE/redirect
  policy, and external-issuer token rejection;
- insufficient scope and hidden-tool guessed call;
- pairing device revocation and cross-device/tenant denial;
- browser cookie call with missing/untrusted Origin;
- host/DNS rebinding/SSRF/private-IP/redirect checks;
- cursor tampering and cross-tenant job/file ID attempts;
- token/URL/provider error redaction in response and audit logs;
- rate limits and bounded concurrency for list/call/download.

### 19.5 Control-plane and retention tests

- user sees only their own connected devices/API keys and can revoke them;
- tenant-admin flag change is audited and propagates consistently to all
  instances;
- user cannot self-enable a tenant flag or self-widen scopes;
- expiry/deletion of sessions, grants, cache entries, job projections, and
  resource revisions follows policy without deleting billing/artifact evidence;
- migration preflight detects schema/ledger drift and refuses unsafe execution.

### 19.6 Load/failure/real-client tests

- 1,000 `tools/list`/minute and 5,000 `render.get`/minute with bounded DB/cache;
- concurrent image/video/Remotion submissions with idempotency collisions;
- load-balancer instance switching with no modern session affinity;
- DB timeout, queue unavailable, worker crash, provider timeout, duplicate
  callback, R2 failure, Redis unavailable, client disconnect, duplicate retry;
- official MCP Inspector pinned in CI with a locked version and a documented
  CLI invocation;
- real Hermes CLI/agent and Hermes One connector smoke on Windows 11 x64,
  macOS arm64, and macOS x64 where packs are supported;
- existing Worker App Windows render/upload regression;
- macOS standalone Remotion render without Xcode build, as defined in Feature
  145's native release gate.

### 19.7 Existing baseline failures to close

The research run found:

- `mcpPublicServer.test.ts`: current legacy suite passed 51 tests;
- `mcpPublicServerSecurity.test.ts`: 5 passed and 2 failed. One test timed out
  while testing `smartspec.files.read`; another attempted to send an undefined
  session ID because setup did not obtain a session. These must be diagnosed and
  fixed or explicitly reclassified before the new modern suite is considered
  green. They must not be hidden by disabling the tests.

The repository-wide TypeScript baseline also contains unrelated errors in
`client/src/components/chat/settings/SkillSettings.tsx` and
`server/routers.ts`; the implementation report must separate those baseline
failures from Feature 146 diagnostics.

## 20. Definition of Done

Feature 146 is complete only when all conditions hold:

### Protocol/discovery

- Modern `2026-07-28` passes locked protocol tests and does not require a
  session or sticky load balancer.
- Legacy `2025-11-25` passes, plus the current migration compatibility version
  while its flag remains on.
- `server/discover`, `/.well-known/mcp.json`, and `/v1/mcp/catalog` agree on
  endpoint/version/capability truth.
- POST/GET/DELETE/OPTIONS/HEAD, content-type, Accept, CORS, disconnect
  cancellation, and MRTR/requestState behavior are explicit and tested.
- `/` remains web HTML and is never advertised as MCP.
- No capability is advertised before its implementation/tests exist.

### Tools/resources

- Existing `smartspec.*` tools remain compatible.
- Guide aliases are typed adapters, not duplicated handlers.
- Tools expose accurate input/output schemas, annotations, scopes, idempotency,
  cache policy, and safe descriptions.
- `resources/list/read` exposes only allowlisted docs in Phase 1.
- Library/media-history file access is complete through ACL-checked tools and
  includes safe images/videos/R2 download references.

### Security

- Auth uses validated bearer/session/API-key/pairing principals; client metadata
  and caller tenant/user headers are never trusted.
- Protected-resource metadata and 401 challenge work for configured OAuth.
- The advertised authorization server has working metadata/JWKS/token
  verification, resource/audience validation, PKCE/client policy, and key
  rotation evidence; PRM is never enabled as a placeholder.
- Scopes, device revocation, object ownership, SSRF, CORS/origin, host, cursor,
  rate limits, audit, and redaction tests pass.
- User-only device/API-key revoke and tenant-admin feature-flag audit controls
  are functional; users cannot self-escalate.
- No token, provider credential, raw R2 key, permanent URL, or local path leaks.

### Business correctness

- Image/video/Remotion calls use existing core/worker/credit/storage paths.
- Idempotency prevents duplicate jobs/charges.
- The generic Redis replay cache is not relied on for exactly-once effects;
  durable service idempotency survives cache loss.
- Worker completion and uploads produce the same media history and ACL-visible
  result as web/Worker App flows.
- Redis is optional/ephemeral for modern behavior; persistent business state is
  never lost or authorized solely from Redis.

### Operations

- Metrics, traces, audits, health/readiness, feature flags, kill switch, and
  rollout telemetry exist.
- Retention, migration preflight, credit reconciliation, and expired-grant
  behavior are documented and tested.
- Inspector, unit, integration, protocol, security, load, failure-injection,
  and platform smoke tests are documented and run.
- Native Windows/macOS executor evidence remains a Feature 145 release gate;
  MCP protocol readiness alone is not claimed as native rendering readiness.

## 21. Implementation order

1. Freeze official spec/SDK versions and write wire fixtures for modern and
   legacy; record the version decision.
2. Add the modern/legacy transport adapter behind flags without changing the
   current registry behavior; close current security test harness failures.
3. Implement discovery and OAuth metadata/challenge routes; verify no root-route
   regression.
4. Add registry metadata, aliases, output schemas, normalized results, error
   mapping, and snapshots.
5. Add docs Resources and cache policy; keep user data in existing tools.
6. Add job/credit/idempotency/result adapters using existing services; verify
   Feature 145 Remotion and Worker App parity.
7. Harden object/download/SSRF/scope/cursor/rate-limit paths and run security
   review.
8. Add load/failure/Inspector/real-client tests and observability.
9. Enable internal modern flag, then selected tenants, then controlled GA.
10. Only after telemetry and a published sunset plan remove obsolete legacy
    revisions or broad-scope compatibility.

## 22. Review checklist before `/deep-implement`

- [ ] Exact current tool names and service symbols re-verified after any Feature
      145 changes.
- [ ] Official MCP/SDK version frozen; guide-only assumptions marked.
- [ ] Modern `server/discover` wire fixture approved.
- [ ] Legacy version policy and sunset telemetry approved.
- [ ] No duplicate job/credit/idempotency/storage source proposed.
- [ ] Resource URI allowlist and no-user-data boundary approved.
- [ ] OAuth issuer/audience/resource/scopes and 401 challenge configured.
- [ ] Static-token broad-scope migration/sunset documented.
- [ ] Windows 11/macOS executor boundary remains Feature 145-owned.
- [ ] Current security-suite failures have a concrete fix/test owner.
- [ ] Schema snapshot and compatibility policy are part of CI.
- [ ] Implementation wave is split into transport, registry, resources, auth,
      business adapters, security, and verification with single-writer paths.

## 23. Implemented verification gates and deployment contract

The implementation adds these executable gates; none of them silently turns a
missing environment into a pass:

- `npm run check:mcp146` runs the web compiler and fails on diagnostics in the
  MCP/auth/download/feature-flag path set, while reporting unrelated full-repo
  baseline diagnostics separately.
- `npm run security:mcp146` scans the MCP/auth/download source and working-tree
  scripts for private keys, cloud keys, production API-key patterns, and
  high-confidence secret literals.
- `npm run mcp:smoke` runs the modern stateless contract against
  `MCP_SMOKE_URL` using `MCP_SMOKE_TOKEN`; it verifies manifest,
  `server/discover`, `tools/list`, `tools/call`, `resources/list`, and
  `resources/read`.
- `npm run mcp:failure-harness` verifies malformed modern usage, unknown-method
  redaction, and unauthenticated rejection.
- `load-tests/scenario-mcp-v2.js` is the k6 load gate and requires an explicit
  `MCP_TOKEN`; it is manually selected in the existing load-test workflow.
- CI invokes the official pinned Inspector CLI
  `@modelcontextprotocol/inspector@2.2.0` for live `tools/list` evidence.

Inbound OAuth is opt-in only. In production, the authenticated platform admin
sets the equivalent values in `Settings → Infrastructure → MCP/OAuth`; they
are persisted in encrypted/safe `system_settings` rows under category `mcp`.
The process must not require operators to edit `MCP_*` env values. The
readiness command reads this UI/database source and fails closed when the
complete verifier configuration is absent. The JWKS URI and issuer/resource
URLs must be HTTPS and credential-free. Without the complete verifier
configuration, Protected Resource Metadata returns 404 and bearer tokens
cannot be accepted as OAuth tokens. Env values remain test/development
fallbacks only.

The live gate requires separately provisioned secrets and fixtures for the
deployed endpoint, R2/Media History, and Windows 11/macOS native executor.
The CI workflow fails its live-evidence job when those secrets are absent so
that a code-only run cannot be mistaken for production/native readiness.

The current implementation evidence, exact test counts, and unresolved
environment gates are maintained in
`implementation/evidence.md`.
