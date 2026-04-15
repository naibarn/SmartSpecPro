# Research Notes

Checked: 2026-04-10

## Existing spec lineage

### `071-openclaw-external-runtime-integration`

Key findings:

- SmartSpecPro already has a first-class pattern for an external general-purpose runtime through `openclaw_gateway`
- the worker control plane is based on register, heartbeat, claim, event, and artifact publication flows
- OpenClaw is explicitly not the default desktop-local runtime

Implication:

- Hermes can reuse the worker-fabric pattern, but only if SmartSpecPro adds a truthful Hermes-specific runtime identity and a compatible adapter path

### `072-claw-worker-platform-access`

Key findings:

- bound-worker semantics are already owner-bound and tenant-bound
- runtime-aware bound-connector expansion already exists conceptually
- the current model allows future runtimes to join later if they advertise the right capability and policy signals

Implication:

- Hermes fits naturally as a future bound-worker family for personal agents if it can declare safe capability flags through a SmartSpecPro bridge

### `074-claw-worker-mcp-platform-completion`

Key findings:

- SmartSpecPro already prefers HTTP-first platform access with MCP as a controlled fallback
- delegated workers already receive truthful manifest discovery, route families, and MCP tool visibility

Implication:

- Hermes does not need a brand-new platform-access surface; it can consume the existing delegated HTTP and MCP contracts if a bridge translates Hermes sessions into SmartSpecPro worker sessions

### `075-unified-web-desktop-agent-platform`

Key findings:

- Feature 075 locks Pi and Agency Swarm as the internal desktop-host runtime labels
- Desktop Host may project into worker fabric as `desktop_zeroclaw_managed`, but it is still not "just another external worker"
- Feature 075 explicitly preserves external worker families rather than replacing them

Implication:

- Hermes should join beside Feature 075 as a bring-your-own external runtime and channel companion, not as a surprise replacement for the Desktop Host core runtime stack

### `077-distributed-worker-fabric-completion`

Key findings:

- the runtime family has been generalized across the worker fabric, but the shared enum still has only four runtime identities
- the repo already treats runtime truthfulness as important product behavior, not just an implementation detail

Implication:

- if Hermes becomes first-class, it should receive its own truthful runtime type instead of being mislabeled as `openclaw_gateway`

## Current codebase touchpoints

### Worker runtime vocabulary

Files:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0132_openclaw_worker_runtime_foundation.sql`

Findings:

- the repo currently exposes four runtime families only
- runtime definitions already carry:
  - feature flag
  - registration support posture
  - dispatch support posture
  - compatibility versions
  - gateway compatibility metadata

Implication:

- Hermes can be added cleanly, but it must extend shared enums, schema, migrations, and runtime-definition metadata intentionally

### Bound-worker and external connector behavior

Files:

- `apps/web/server/services/teamService.ts`
- `apps/web/client/src/pages/Teams.tsx`

Findings:

- the UI and services already support `external_connector` members with optional `externalWorkerId`
- `openclaw_gateway` is auto-eligible for bound-worker flows
- non-OpenClaw runtimes must opt in through capability flags such as `supportsBoundConnector`

Implication:

- Hermes should integrate first through the existing external-connector model rather than inventing a new team-member type

### Delegated platform access

Files:

- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/workerRuntime.ts`

Findings:

- delegated sessions already support:
  - scoped bearer tokens
  - LLM, skills, agency, media, library, RAG, and MCP route families
  - worker callbacks
  - MCP family visibility and operator policy
- this surface is already runtime-aware and records runtime metadata for audit

Implication:

- Hermes is a strong fit as a delegated-platform consumer
- the missing piece is a bridge that maps Hermes conversation execution to SmartSpecPro worker jobs

### Existing help and product positioning

Files:

- `apps/web/docs/help/en/openclaw-workers.md`
- `apps/web/docs/help/th/openclaw-workers.md`

Findings:

- current user-facing docs position OpenClaw as the stable external delegated runtime path
- the docs also make the family split clear between desktop, OpenClaw, NemoClaw, and HiClaw

Implication:

- Hermes needs explicit product documentation and runtime-family language, otherwise users will misread it as either "just OpenClaw" or "the new desktop runtime"

## Hermes Agent upstream research

### Official repo and product summary

Sources:

- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/user-guide/configuration/

Findings:

- Hermes positions itself as a self-improving agent with memory, skills, messaging gateways, cron, delegation, and multiple execution backends
- upstream advertises six terminal backends:
  - local
  - docker
  - ssh
  - modal
  - daytona
  - singularity
- upstream install guidance says native Windows is not supported and recommends WSL2 instead

Implication:

- Hermes is a strong external runtime candidate
- Hermes is not a good truthful fit for the managed cross-platform Desktop Host core runtime defined in Feature 075

### Profiles and multi-agent posture

Source:

- https://hermes-agent.nousresearch.com/docs/reference/profile-commands/

Findings:

- Hermes supports named profiles with create, use, export, import, alias, and clone workflows
- profiles are the upstream answer for multiple agent identities and multiple imported OpenClaw agents

Implication:

- SmartSpecPro should treat Hermes profiles as user-owned runtime instances or personas behind one registered worker bridge, not as server-canonical team members by default

### OpenAI-compatible API server and web frontend compatibility

Source:

- https://hermes-agent.nousresearch.com/docs/user-guide/messaging/open-webui/

Findings:

- Hermes exposes a built-in API server with `/v1/chat/completions`, `/v1/responses`, `/v1/models`, and a health endpoint
- Open WebUI can talk to Hermes the same way it talks to an OpenAI-compatible backend
- Hermes streams tool progress and final responses over that API layer

Implication:

- the SmartSpecPro bridge can prefer Hermes API-server transport instead of trying to shell out to a CLI for every task
- this API compatibility is useful for bridge-to-agent transport, but it does not replace the SmartSpecPro worker control-plane contract

### MCP consumption model

Source:

- https://hermes-agent.nousresearch.com/docs/guides/use-mcp-with-hermes/

Findings:

- Hermes can consume MCP servers and supports include/exclude filtering for tools, prompts, and resources
- upstream guidance explicitly recommends a smallest-useful-surface approach

Implication:

- SmartSpecPro can expose its existing MCP surface to Hermes through delegated worker sessions with minimal new product surface area

### ACP editor mode

Source:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/

Findings:

- Hermes can run as an ACP server for editor-native coding workflows
- ACP mode exposes file, terminal, web, memory, skills, code execution, and delegation tools

Implication:

- ACP is promising for a future coding-agent feature line
- it is not required for the first Hermes runtime integration slice because the current repo already has stronger worker-fabric and desktop-host primitives for coding flows

### OpenClaw migration

Source:

- https://hermes-agent.nousresearch.com/docs/guides/migrate-from-openclaw

Findings:

- Hermes ships `hermes claw migrate`
- the migration imports persona, memory, skills, messaging settings, selected secrets, and OpenClaw config
- archived OpenClaw multi-agent lists map to Hermes profiles

Implication:

- Hermes is strategically relevant to the existing Claw-adjacent ecosystem
- SmartSpecPro should acknowledge Hermes as a credible migration target for users who started in OpenClaw land but want a richer personal/channel agent experience

## Research-based fit matrix

| Hermes capability | SmartSpecPro fit | Decision |
|---|---|---|
| External persistent agent runtime | worker fabric | Yes |
| Owner-bound personal agent | bound worker / `external_connector` | Yes |
| OpenAI-compatible agent endpoint | bridge-to-agent transport | Yes |
| MCP consumer | delegated MCP + HTTP platform access | Yes |
| Messaging gateways and webhooks | channel handoff and callback companion | Yes, but gated |
| Profiles / multiple agent identities | per-user runtime instance modeling | Yes |
| Self-managed skills and memory | upstream-owned runtime state | Yes, but not server-canonical |
| Editor ACP mode | future coding-agent interop | Later |
| Managed desktop-host core runtime | Feature 075 Desktop Host | No |
| Organization-signed desktop package sync | Feature 075 package trust | No |

## Recommended scope from research

Keep the feature focused on a truthful Hermes interoperability lane:

- introduce `hermes_agent_gateway` as a first-class external runtime family
- require a SmartSpecPro-managed bridge adapter between Hermes and the worker control plane
- let Hermes consume delegated SmartSpecPro HTTP and MCP access instead of inventing a separate platform API
- let Hermes participate in bound-worker and channel-handoff flows where owner-bound and tenant-bound rules already exist
- keep Hermes state, memories, messaging tokens, and channel sessions upstream-owned unless later features explicitly promote parts of that state into SmartSpecPro canonical objects
- keep Hermes outside the Desktop Host core runtime taxonomy from Feature 075
