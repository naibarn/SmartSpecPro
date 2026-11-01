# Section 06: Chat, agents and remaining execution dependencies

## Requirements

REQ-311-08, REQ-311-12, REQ-311-14.

## Prerequisites

section-03, section-04, section-05. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

Active Chat/model/agent/media execution services and registered canonical job handlers; Worker stream/provider adapters and existing native computation entrypoints.

## Implementation tasks

Port model/provider I/O, streaming, tool orchestration, durable continuation, cancellation and credit settlement. Test Worker CPU/memory/subrequest/bundle/deadline limits against actual dependencies, reconnect and client disconnect. Preserve the approved Python OpenAI Agents API runtime boundary; run a compatibility proof rather than assume complete Python backend portability or substitute an agent framework.

For media rendering/FFmpeg/native modules and other Worker-incompatible work, evaluate Worker implementation and existing provider/approved external-worker paths. Record concrete compatibility proof, cost/bounds/artifact handling and named unresolved decisions. No Container exception is accepted by this plan. If an irreducible dependency remains, leave cutover blocked pending the owner's specific decision. If explicitly accepted later, use only existing bounded per-job Containers and keep web/auth/control fully independent.

## Focused verification

Stream TTFT/error/cancel/reconnect, durable step recovery and usage settlement; actual pinned Worker limits/crypto/native import compatibility; Python Agents API compatibility spike with retained contracts; native media dependency proof and absent owner exception -> cutover BLOCKED.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
