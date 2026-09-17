# Features 195–200 implementation boundary

This delivery establishes the shared, provider-neutral contract layer for the
195–200 sequence. Feature 195 remains the only durable execution ledger:
`worker_jobs`, attempts, events and outbox are the execution truth. Features
196–200 build plans, Runner offers, Chat projections, MCP grants and Agent
manifests around that ledger; they do not introduce a second Job table or a
direct provider-submission path.

## User entry points

- `/chat` is the end-user command surface for natural-language goals,
  clarification, plan/approval and live Job/result projection.
- `/workers/connect` is the device/Runner registration and health surface.
- MCP management remains in the existing MCP settings/admin surfaces.
- Existing worker-job history/control surfaces remain the operator recovery
  surface.

The current code delivery is intentionally contract-first. Production
activation of external providers, Cloudflare Queues/Containers, OAuth
upstreams, desktop process adapters and browser acceptance still requires the
deployment and account evidence listed in `release-gates.md`.
