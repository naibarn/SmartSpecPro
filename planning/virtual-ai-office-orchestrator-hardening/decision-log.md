# Decision Log

- Planning mode: focused deep-plan delta
- Upstream source of truth remains `planning/virtual-ai-office-orchestrator/spec.md`
- This package exists to isolate high-risk implementation clarifications from the broader orchestrator product plan
- Chosen workstreams:
  - external callback security
  - revision concurrency
  - mixed-member API contracts
  - room redaction and data minimization
- Core compatibility decision: keep room-first collaboration and multi-team persona reuse unchanged
