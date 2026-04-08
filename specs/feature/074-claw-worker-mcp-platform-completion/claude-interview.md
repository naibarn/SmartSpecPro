# Interview Transcript

## Note

No separate live interview was required during this deep-plan run because the current thread already contained detailed product clarifications from the user. This file records those clarified decisions as the planning transcript.

## Captured clarifications

### Q1. What is the most important product meaning of Bound Worker?

The user clarified that `Bound Worker` should behave like a real worker or team member that does work on the user’s behalf. The user should ask for an outcome and let the worker execute the operational steps instead of manually clicking through the normal web UI.

Planning impact:

- MCP completion must make workers genuinely useful for delegated execution, not just discovery or routing.

### Q2. Who owns and registers a worker?

The user clarified that workers are personal workers. A normal user registers their own worker. Admins do not create workers for ordinary usage.

Planning impact:

- worker ownership remains explicit
- delegated MCP access is owner-only
- admin visibility does not imply delegated usage rights

### Q3. Can workers cross user or tenant boundaries?

No. The user explicitly required:

- no cross-user delegation
- no cross-tenant delegation
- no worker access to another user’s rights just because they are in the same tenant

Planning impact:

- delegated MCP sessions must remain owner-bound and same-tenant
- knowledge, jobs, rooms, workflows, files, and callbacks must remain owner-safe

### Q4. What credit source should be charged?

The user clarified that SmartSpecPro-routed usage must charge the owning or acting user’s SmartSpecPro credit balance, not a worker wallet and not a tenant-shared wallet.

Planning impact:

- MCP wrappers must preserve the owner user balance model from Feature 072
- downstream service source types should remain accurate

### Q5. What about external APIs paid directly by the worker?

The user clarified that if a worker uses an external API with its own credentials outside SmartSpecPro billing, that usage may continue normally and does not need to be charged through SmartSpecPro credits.

Planning impact:

- Feature 074 should meter SmartSpecPro-routed MCP actions, not all possible worker-local activity.

### Q6. Should workers be budget-limited?

Yes. The user asked for worker spending guardrails over rolling windows so a malfunctioning worker cannot consume too many SmartSpecPro credits too quickly.

Required windows:

- hourly
- five-hour
- daily
- weekly
- monthly

Planning impact:

- MCP execution must respect the same worker budget model already established for delegated HTTP usage.

### Q7. How should runtimes learn what the platform can do?

The user asked how OpenClaw, ZeroClaw, or similar runtimes can know which functions are available. The thread concluded that:

- OpenAPI is useful for the stable HTTP contract
- OpenAPI alone is not enough for per-job truth
- a delegated capability manifest is still needed
- MCP `tools/list` must become truthful for the current session

Planning impact:

- Feature 074 should publish a machine-readable static MCP catalog plus session-specific truthful discovery.

### Q8. What knowledge access should the worker have?

The user requested that the worker be able to use the owner user’s Library and RAG where allowed:

- search owner Library
- read owner Library items
- search owner RAG
- upload allowed files into owner Library
- ingest allowed content into owner RAG

Planning impact:

- MCP knowledge tools are high priority
- direct vector-store side channels are not acceptable; ingestion must reuse the normal platform pipeline

### Q9. How complete should MCP become?

The user asked for MCP to become as complete as realistically possible based on the current backend, but still truthful about what is already real and what is still being built.

Planning impact:

- the plan should phase work by highest-value parity first
- no fake tool advertising
- no claims of full parity before the execution path is real
