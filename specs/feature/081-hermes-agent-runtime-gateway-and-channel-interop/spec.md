# 081 - Hermes Agent Runtime, Gateway, and Channel Interop

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 071-openclaw-external-runtime-integration, 072-claw-worker-platform-access, 074-claw-worker-mcp-platform-completion, 075-unified-web-desktop-agent-platform, 077-distributed-worker-fabric-completion
Audience: Product, Runtime, Teams, Web Control Plane, MCP, Security, Admin, QA

---

## 1. Executive summary

SmartAIHub should recognize **Hermes Agent** as a serious bring-your-own agent ecosystem, but it should place Hermes in the right layer of the product.

Hermes should join the platform as:

- a **truthful external runtime family**
- a **user-owned bound-worker option**
- a **consumer of delegated SmartSpecPro HTTP and MCP access**
- a **channel-companion runtime** for external messaging and webhook-driven agent workflows

Hermes should **not** be treated as:

- the replacement for Pi
- the replacement for Agency Swarm
- the new core Desktop Host runtime inside Feature 075

This feature therefore adds a dedicated Hermes interoperability lane built around:

- a new runtime type: `hermes_agent_gateway`
- a SmartSpecPro-managed **Hermes bridge** that speaks the worker protocol on Hermes's behalf
- reused delegated worker HTTP and MCP access instead of a Hermes-only platform API
- owner-bound team binding and channel handoff semantics that preserve audit, billing, and trust boundaries

The product outcome is not "bolt Hermes onto Desktop Host."

The product outcome is:

- one unified runtime taxonomy
- one truthful distinction between local managed runtime and external user-owned runtime
- one safe way for Hermes to participate in the worker fabric
- one clear migration and positioning story for OpenClaw-adjacent users

---

## 2. Problem statement

The current SmartSpecPro runtime family already supports:

- `openclaw_gateway`
- `desktop_zeroclaw_managed`
- `nemoclaw_sandbox`
- `hiclaw_cluster`

That is a good start, but Hermes creates a new product question that the existing specs do not answer explicitly.

Hermes is not "just another Claw name."

Research shows that Hermes now combines:

- persistent agent profiles
- messaging gateways
- cron and webhook automation
- an OpenAI-compatible API server
- MCP consumption
- multiple execution backends
- an explicit migration path from OpenClaw

Without a dedicated SmartSpecPro position for Hermes, teams will drift into one of the following bad outcomes:

- pretending Hermes is just OpenClaw and mislabeling runtime identity
- trying to wedge Hermes into Desktop Host and weakening Feature 075's local-runtime model
- using Hermes out-of-band with raw API keys and no truthful SmartSpecPro audit or binding semantics
- treating Hermes channels, memories, and skills as trusted SmartSpecPro objects without an explicit policy model

This feature closes that gap by defining exactly where Hermes belongs and where it does not.

---

## 3. Goals

1. Add a truthful Hermes runtime family to the SmartSpecPro worker ecosystem.
2. Position Hermes as an external bring-your-own agent runtime, not as a Desktop Host core runtime.
3. Reuse existing delegated worker HTTP and MCP surfaces for Hermes platform access.
4. Let owner-bound Hermes workers participate in `external_connector` and bound-worker flows.
5. Support Hermes as a channel-companion runtime for messaging and webhook-driven agent workflows.
6. Preserve SmartSpecPro ownership of audit, billing, artifact publication, policy, and delegated auth.
7. Provide a clear migration and positioning story for OpenClaw-adjacent users who may adopt Hermes.
8. Keep rollout fail-closed and capability-driven.

---

## 4. Non-goals

1. This feature does not replace Pi or Agency Swarm.
2. This feature does not add Hermes to the Desktop Host internal runtime taxonomy from Feature 075.
3. This feature does not assume Hermes upstream already supports SmartSpecPro's worker control-plane protocol.
4. This feature does not import Hermes memories, skills, profiles, or messaging sessions into SmartSpecPro server-canonical objects by default.
5. This feature does not promise native Windows-managed Hermes embedding.
6. This feature does not make Hermes the default external runtime over OpenClaw on day one.
7. This feature does not introduce ACP/editor-mode integration as part of the first Hermes slice.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/shared/workerRuntime.ts` | Runtime families stop at OpenClaw/DesktopZeroClaw/NemoClaw/HiClaw | Add truthful Hermes identity and compatibility metadata |
| `apps/web/server/routes/workerRuntime.ts` and `workerRegistryService.ts` | Worker protocol already expects register/heartbeat/claim/event/artifact behavior | Add a Hermes bridge that can satisfy that contract |
| `apps/web/shared/workerDelegation.ts` and `workerDelegationService.ts` | Delegated worker tokens, scopes, route families, and MCP posture already exist | Reuse that surface for Hermes |
| `apps/web/server/services/teamService.ts` and Teams UI | Owner-bound `external_connector` members and `externalWorkerId` are already real | Let Hermes join the existing bound-worker path |
| Feature 075 Desktop Host model | Pi and Agency Swarm are locked as internal desktop runtimes | Keep Hermes outside the desktop-host core and preserve truthfulness |

This feature extends existing patterns rather than introducing a second external-agent system.

---

## 6. Research-backed Hermes fit summary

Research from official Hermes sources leads to five clear conclusions:

1. Hermes is strong as an **external autonomous runtime**.
   - It supports multiple execution backends and long-lived personal agent operation.

2. Hermes is strong as a **channel and webhook companion**.
   - It already operates across multiple messaging platforms and external delivery surfaces.

3. Hermes is strong as a **delegated platform consumer**.
   - It already supports MCP and an OpenAI-compatible API server, which map well to SmartSpecPro's delegated worker HTTP and MCP model.

4. Hermes is weak as a **truthful managed Desktop Host core runtime** for Feature 075.
   - Upstream explicitly prefers Linux, macOS, and WSL2 rather than promising native Windows parity.

5. Hermes is strategically relevant to the current Claw ecosystem.
   - Upstream migration tooling already targets OpenClaw users.

The integration consequence is straightforward:

- Hermes belongs on the **external runtime side** of the SmartSpecPro architecture
- Hermes does **not** belong inside the Desktop Host core runtime labels

---

## 7. Locked product decisions

### 7.1 Hermes runtime identity

- Hermes must be modeled as a dedicated worker runtime family:
  - `hermes_agent_gateway`
- Hermes must not be aliased to `openclaw_gateway`.

### 7.2 Hermes is external, not desktop-core

- Hermes is an external user-owned runtime.
- Pi and Agency Swarm remain the internal managed desktop runtimes from Feature 075.
- Desktop Host may hand off to Hermes through worker-fabric semantics, but Hermes does not become a desktop-host runtime label.

### 7.3 Bridge adapter is mandatory

- SmartSpecPro must require a **Hermes bridge** for v1.
- The bridge speaks SmartSpecPro's worker control-plane contract.
- The bridge talks to Hermes through upstream-supported transports such as the Hermes API server.

### 7.4 Initial ownership posture

- initial Hermes registration posture should be:
  - `workerMode = "per_user"`
  - `runtimeMode = "external_managed"`
- owner-bound and tenant-bound rules from Feature 072 remain mandatory.

### 7.5 Platform access posture

- Hermes should reuse existing delegated worker HTTP and MCP platform access.
- HTTP remains the preferred default.
- MCP remains opt-in and capability-filtered.

### 7.6 Bound-worker eligibility posture

- Hermes workers become eligible for bound-worker flows only when the bridge declares the required capability flags.
- Capability flags must be explicit, not inferred from runtime name alone.

### 7.7 Channel posture

- Hermes messaging gateways are external channel companions in v1.
- SmartSpecPro may show channel capability metadata and receive callbacks or handoff links.
- SmartSpecPro does not become the owner of Hermes messaging tokens or sessions in this feature.

### 7.8 Artifact and audit posture

- SmartSpecPro remains the system of record for:
  - worker registration
  - delegated auth
  - billing attribution
  - artifact publication
  - callback audit
- Hermes outputs must publish through the existing library and audit pipelines.

### 7.9 Runtime-state posture

- Hermes skills, memories, SOUL files, cron jobs, and profiles remain upstream-owned runtime state unless a later feature explicitly promotes them into SmartSpecPro canonical objects.

### 7.10 Rollout posture

- add feature flag:
  - `hermesAgentRuntime`
- registration may become available before full dispatch
- channel-companion behavior must stay narrower than base runtime registration

---

## 8. Where Hermes joins the platform

| Surface | Hermes role | Decision |
|---|---|---|
| Worker fabric | external runtime | Yes |
| Delegated worker HTTP access | platform consumer | Yes |
| Delegated MCP access | platform consumer | Yes, opt-in |
| Bound worker / `external_connector` | owner-bound personal agent | Yes |
| Room/workflow callbacks | result and progress reporting | Yes |
| Messaging/webhook companionship | external channel edge | Yes, gated |
| Desktop Host runtime labels | Pi / Agency Swarm replacement | No |
| Desktop signed package materialization | org-trusted desktop packages | No |
| ACP/editor integration | coding-agent follow-on | Later |
| Server-canonical memory/skill import | package-trust feature | Later |

---

## 9. Integration architecture

### 9.1 Bridge registration model

The Hermes bridge should register into SmartSpecPro with:

- `runtimeType = "hermes_agent_gateway"`
- `workerMode = "per_user"`
- `runtimeMode = "external_managed"`
- `externalReference = "hermes://..."` using a stable profile-oriented URI shape

Recommended runtime metadata:

- `hermesVersion`
- `profileName`
- `apiServerEnabled`
- `apiServerBaseUrl`
- `terminalBackend`
- `gatewayPlatforms`
- `hostPlatform`
- `hostExecutionMode`
- `supportsDelegatedHttp`
- `supportsDelegatedMcp`
- `supportsBoundConnector`
- `supportsCallbacks`

### 9.2 Bridge execution model

The bridge should:

1. register and heartbeat as a SmartSpecPro worker
2. claim a worker job
3. create or refresh a delegated worker session
4. call Hermes through the preferred upstream transport
5. translate Hermes progress into SmartSpecPro worker events and callbacks
6. publish artifacts back through the existing SmartSpecPro artifact and library flow

### 9.3 Transport priority

Preferred order:

1. Hermes API-server transport
2. optional CLI transport later if a real product need appears

The bridge should not rely on undocumented internal Hermes behavior when an official upstream transport exists.

### 9.4 Delegated platform access

Hermes should consume the existing SmartSpecPro delegated worker model:

- scoped bearer token
- owner-bound and tenant-bound context
- explicit scope profiles
- truthful HTTP route families
- capability-filtered MCP exposure

This keeps SmartSpecPro as the policy authority and avoids a Hermes-only access plane.

### 9.5 Channel and callback model

Hermes may surface:

- messaging-channel capability metadata
- webhook capability metadata
- room/workflow/user callback links

But v1 should keep the control boundary clear:

- Hermes owns the external messaging sessions
- SmartSpecPro owns the audit trail, worker identity, artifact links, and delegated platform access policy

---

## 10. Relationship to existing runtime families

| Runtime family | Primary posture | Hermes relationship |
|---|---|---|
| `openclaw_gateway` | stable external delegated runtime | Hermes is adjacent, not the same family |
| `desktop_zeroclaw_managed` | managed desktop projection runtime | Hermes is not a substitute |
| `nemoclaw_sandbox` | admin-gated secure sandbox | Hermes does not replace secure-sandbox posture |
| `hiclaw_cluster` | admin-gated collaborative cluster | Hermes does not replace collaborative cluster posture |

The purpose of this feature is not to flatten all external agents into one runtime label.

The purpose is to keep the runtime family honest while still welcoming Hermes into the platform ecosystem.

---

## 11. Security and trust model

### 11.1 No raw credential flattening

- SmartSpecPro must not copy tenant platform secrets or provider secrets into Hermes by default.
- Delegated SmartSpecPro access must happen through lease-bound delegated worker tokens.

### 11.2 Safe transport posture

- Hermes bridge should prefer loopback or approved private-network API-server endpoints.
- public remote Hermes endpoints should be denied by default unless later admin policy explicitly allows them

### 11.3 Capability truthfulness

- Hermes bridge capability claims must be explicit and auditable
- channel, MCP, and callback behavior must fail closed when the capability posture is not present

### 11.4 Artifact truthfulness

- Hermes artifacts should publish under the same worker-runtime library rules already used by OpenClaw and other worker families

---

## 12. Rollout and migration

### 12.1 Rollout stages

1. Add runtime identity, feature flag, and bridge contract.
2. Enable registration and fleet visibility.
3. Enable owner-bound dispatch and delegated HTTP access.
4. Enable delegated MCP for approved capability profiles.
5. Enable channel-companion behavior for a narrower pilot set.

### 12.2 OpenClaw-to-Hermes user story

SmartSpecPro should explicitly acknowledge that some users may:

- start with OpenClaw
- migrate their personal runtime state to Hermes using upstream tooling
- then bind Hermes back into SmartSpecPro as their new personal external agent

This should be presented as:

- a supported ecosystem path
- not as proof that Hermes and OpenClaw are the same runtime family

### 12.3 Help and product wording

Docs and UI should answer this simply:

- choose **Desktop Host** for governed local execution and local-file power
- choose **OpenClaw** for the current stable delegated external runtime path
- choose **Hermes** when you want a richer personal external agent with profiles, channel presence, and BYO runtime operation

---

## 13. Acceptance criteria

1. SmartSpecPro has a truthful Hermes runtime family with explicit feature gating.
2. Hermes joins the worker fabric only through a declared bridge adapter.
3. Hermes can consume delegated SmartSpecPro HTTP and filtered MCP access without a separate Hermes-only platform API.
4. Hermes can participate in owner-bound bound-worker flows through the current `external_connector` model.
5. Hermes channel and webhook behavior is represented as an external companion posture, not as hidden native SmartSpecPro channel ownership.
6. Feature 075 Desktop Host semantics remain intact.

---

## 14. Final takeaway

Hermes is worth supporting, but it should be supported in the part of the architecture where it is strongest and most truthful.

That means:

- yes to external runtime integration
- yes to delegated platform access
- yes to bound-worker and channel-companion flows
- no to pretending Hermes is the new Desktop Host core runtime

This feature gives SmartSpecPro a clean path to support Hermes without weakening the runtime story it already built across Features 071-077 and 075.
