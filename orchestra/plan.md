# Orchestra Plan

## Task
Security audit of all recently developed code (last 5 days, ~30 commits) covering orchestrator, feedback, virtual admin, personas, help system, agency preview, and vector search.

## Classification
- scope: medium
- risk: high
- affected_domains: [tRPC routers, FastAPI endpoints, Frontend components, Services, Database]
- estimated_file_count: 80+
- chosen_route: multi-agent waves (Pattern A: Security Audit)
- task_summary: Comprehensive security audit of all new code from last 5 days
- security_gate_required: true

## Affected Areas (by commit group)
1. **Team Orchestrator** (d62de972, fff1e653, 249c9142, bbe9b384, 7b0a32a4, a42ae5ee) — SSE streaming, event bus, inter-agent communication, Python services, auto-stop
2. **Virtual Admin Agent** (046 series) — rule engine, actuators, approval gate, tRPC router, notification dispatcher, health banner, guardian dashboard, feedback hub
3. **Feedback System** (87083a89, d6ba43c5) — file attachments, drag & drop, notification deep-links
4. **Personas** — persona service, templates, sanitization, chat context
5. **Help System** — help content service, help context injector, help router
6. **Agency Preview** — preview cards, commit button, result router
7. **Video Editor** — background media import, reference image picker
8. **Admin** — multi-provider model config, LLM providers
9. **Vector Search** (842e407e) — pgvector migration
10. **Scoped Memory** — memory service, embedding

## Wave Plan

### Wave 1: Parallel Security Audit (read-only)
- Agent A: ssp-security-trpc → Audit all changed tRPC routers
- Agent B: ssp-security-fastapi → Audit all changed FastAPI endpoints
- Agent C: ssp-security-frontend → Audit all changed React components

### Wave 2: Security Aggregation
- Agent D: ssp-security-review → Aggregate findings from Wave 1, produce verdict

### Wave 3: Fix Critical/High Findings (if any)
- Dispatch ssp-security or domain-specific agents based on findings
