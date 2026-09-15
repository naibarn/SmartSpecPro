# Hard Cutover Research

## Repository evidence

- Feature 186 foundation exists in `apps/web/server/services/jobControlPlane.ts`,
  `jobOutboxPublisher.ts`, `jobTransportAdapters.ts`, `jobExecutor.ts`,
  `jobReporter.ts`, and the Python compatibility port.
- `publishJobOutboxRow()` is a callable publisher primitive, but no single
  producer-facing gateway or complete executor registry currently owns all
  workload mappings.
- `unifiedJobControlPlaneReconcilerJob.ts` runs only when its feature flag is
  enabled. Existing application startup has many independent queue initializers.
- The inventory script found 52 direct transport submissions outside the two
  allowed adapter files: 8 Node BullMQ sites and 44 Python Celery sites.
- Existing direct producers carry domain-specific payloads and handlers. A
  generic envelope alone cannot execute them; each must register a handler or
  retain a deliberately scoped compatibility shim.
- Existing worker functions often use broker/task IDs and provider task IDs for
  recovery. These must remain references linked to the canonical job and must
  not become a replacement identity.
- Existing focused tests use Vitest for web and pytest for Python. Typecheck is
  explicitly excluded because of the user's memory constraint.

## Root cause

The new control plane is currently an observability/lifecycle layer around
legacy ingress. Since business services can still submit directly to BullMQ or
Celery, the outbox is bypassed and the canonical row may not exist before a
side effect. Since legacy consumers do not all claim/report through the new
ports, even a canonical row would not necessarily be authoritative at runtime.

## Design constraints

1. Preserve all unrelated dirty work; no reset, broad formatting, or destructive
   migration is allowed.
2. Do not run typecheck.
3. Keep Redis/BullMQ/Celery as transport adapters until every mapped handler is
   canonical and production recovery evidence exists.
4. Never dual-run paid/provider/artifact/notification side effects.
5. Make the first active wave low-risk and independently reversible.

## SocratiCode note

The repository instructions require SocratiCode first, but no `codebase_*` MCP
tool is available in this session. Discovery therefore used targeted `rg`,
small source reads, the existing inventory script, and focused tests.
