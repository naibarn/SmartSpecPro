# Request

## Original user request

จากของเดิมที่รองรับหลาย ๆ openclaw และ claw อื่น ๆ อีกหลายค่าย ช่วยทำ research ตัว Hermes agent เพิ่มว่าจะเข้ามาร่วมในส่วนไหนได้บ้าง ทำเป็น spec เพิ่มต่อจาก spec เดิมใน specs/feature

## Normalized brief

Create the next feature package in `specs/feature` that researches **Hermes Agent** and defines where it should join the current SmartAIHub platform stack that already supports:

- OpenClaw and the existing Claw-family worker lineage
- the unified Web + Desktop Host model from Feature 075
- delegated worker platform access and MCP completion from Features 072 and 074
- runtime-general worker-fabric semantics from Feature 077

The new feature should stay grounded in the repository and answer a product-level question clearly:

- should Hermes be treated as a desktop runtime, an external runtime, a channel gateway, an MCP consumer, or some combination of those?

The output must be implementation-ready enough that engineering can decide whether to ship Hermes as a first-class runtime family, a bring-your-own external agent bridge, or a narrower interoperability path.

## Repository-informed assumptions

- `apps/web/shared/workerRuntime.ts` currently defines only four runtime families:
  - `openclaw_gateway`
  - `desktop_zeroclaw_managed`
  - `nemoclaw_sandbox`
  - `hiclaw_cluster`
- `apps/web/server/services/teamService.ts` already supports owner-bound `external_connector` members and auto-allows `openclaw_gateway` for bound-worker flows
- `apps/web/shared/workerDelegation.ts` and `apps/web/server/services/workerDelegationService.ts` already expose delegated HTTP and MCP access patterns that an external agent can consume
- Feature 075 already locks Pi and Agency Swarm as the main managed desktop-host runtimes, so Hermes should not be inserted casually into that slot without explicit justification
- the current spec lineage already distinguishes:
  - local managed desktop runtime semantics
  - external worker-fabric semantics
  - future admin-gated secure or clustered runtimes

## Constraints

- continue the numbering and folder structure style already used in `specs/feature`
- treat Hermes research as current-state research, not as a guess based on outdated agent ecosystem assumptions
- preserve the core Product/Runtime rule from Feature 075:
  - Desktop Host keeps Pi and Agency Swarm as its internal local runtime labels
  - external agent families stay truthful external runtimes
- preserve owner-bound and tenant-bound delegation rules from Feature 072
- preserve HTTP-first and truthful MCP posture from Feature 074
- do not assume Hermes upstream already speaks SmartSpecPro's worker claim/report protocol unless research confirms it

## Explicit non-goals for this planning package

- implementing Hermes integration
- replacing Pi, Agency Swarm, or Desktop Host with Hermes
- redefining the OpenClaw feature chain that already exists
- promising native Windows-managed Hermes embedding when upstream support does not justify that claim
- importing Hermes memories, skills, or messaging state into SmartAIHub server-canonical objects by default
