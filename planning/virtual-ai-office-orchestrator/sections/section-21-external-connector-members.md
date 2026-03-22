# Section 21: External Connector Members

## Goal

Let outside systems such as OpenClaw, Manus, ComfyUI, and n8n participate in teams as connector-backed members that can receive and return work safely.

## Deliverables

- external connector registry
- connector-backed roster member model
- capability-based routing rules
- authenticated handoff/callback contract
- connector health and approval policy

## Required Rules

- connector-backed members appear in the team roster but are not personas
- routing to a connector member is based on declared capabilities plus approval policy
- every outbound handoff and inbound callback is audit-logged
- connector failure, timeout, or degraded health must surface in the room timeline and daily operations board
- returned results re-enter the team quality loop; they do not bypass review automatically

## Example Connector Types

- `openclaw`
- `manus`
- `comfyui`
- `n8n`
- future MCP-backed custom agents

## Acceptance Clues

- an unsupported native action can be delegated to a connector member without losing task traceability
- the user can see which connector handled a task, what capability was used, and whether human approval was required
