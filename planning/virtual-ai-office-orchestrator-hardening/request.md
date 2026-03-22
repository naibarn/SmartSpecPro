# Request

Create a focused deep plan for the delta work that hardens the Virtual AI Office Orchestrator spec before implementation.

This planning package exists to remove ambiguity from the main orchestrator spec in four high-risk areas:

1. external connector callback security
2. work-item revision concurrency
3. mixed-member API contracts
4. room posting redaction and data minimization

## Constraints

- The main source of truth remains `planning/virtual-ai-office-orchestrator/spec.md`
- This folder is a scoped deep plan for additional hardening work, not a replacement product spec
- The rule that one persona may belong to multiple teams must remain unchanged
- Room-first collaboration remains required, but sensitive content must be sanitized/redacted appropriately

## Expected Outcome

- The hardening work is broken into clear implementation slices
- Security and concurrency rules are concrete enough to implement without reinterpretation
- API contracts are explicit for persona, human, and external connector members
- Testing guidance covers the new failure modes and abuse cases
