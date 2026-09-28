# Spec 211 Research

## Repository evidence

Targeted shell discovery was used because SocratiCode was unavailable. The
repository has `agentControlPlaneContracts.ts`, native OpenAI Agents bridges,
Runner `sah-runner-v1`, external-agent Job admission and workflow/PTY residue,
but no ACP adapter, Gas City bridge, ACP/Gas City dependency, Spec 211 route or
conformance harness.

Feature 195 remains the durable Job truth; Feature 197 owns Runner; Specs 200
and 206 own external-agent/A2A boundaries; Spec 210 owns the Orca runtime
adapter; Spec 207 owns economic authorization.

## External primary research

- ACP uses JSON-RPC 2.0, `session/prompt`, `session/update`, permission
  requests and `session/cancel`; the official schema permits extension fields
  and requires protocol-version/capability negotiation.
- Gas City is an orchestration-builder SDK with runtime providers including
  subprocess, exec, ACP and Kubernetes, plus a controller, work routing and a
  Beads store. Its public repository states that `bd` commonly uses Dolt, but a
  file provider also exists; SmartSpecPro must pin and certify the actual
  dependency tuple rather than infer it.
- OpenAI Agents SDK documentation confirms tools, handoffs, guardrails,
  sessions, tracing and usage are runtime concerns; SmartSpecPro should retain
  its own Job/economic/tenant authority around them.

Sources:

- ACP schema: https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json
- ACP overview: https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/protocol/v2/overview.mdx
- Gas City: https://github.com/gastownhall/gascity
- Gas City architecture: https://github.com/gastownhall/gascity/blob/main/engdocs/architecture/nine-concepts.md
- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/

## Testing

Use Vitest for Node contracts/routes, Python pytest where ACP/provider process
helpers are Python, and Runner/Cargo tests for protocol framing. Real provider
installation, license, process custody, Dolt/Beads compatibility and soak are
external certification gates.

