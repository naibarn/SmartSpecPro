# Interview Transcript: OpenSandbox Integration

## Q1: What is the deployment topology for OpenSandbox?

**Answer**: Two environments:
- **Localhost (dev)**: OpenSandbox runs as a Docker service via `docker-compose.sandbox.yml` on the same machine, using separate Docker networks (`opensandbox-network` + `opensandbox-exec`) to avoid port and network conflicts with existing services.
- **Production**: GCP Cloud Run handles core services. OpenSandbox runs on a Hetzner CPX31 server in Singapore (~$16/month). Python orchestrator on Cloud Run calls OpenSandbox API on Hetzner via HTTPS. Both are in Singapore, so latency is 1-5ms.

The GCP migration plan (011-DeployPlan) is NOT affected — Hetzner is additive.

## Q2: What is the migration priority and which workloads move first?

**Answer**: Phased migration by risk level:
1. **Phase 1** (highest risk): FFmpeg media pipeline, PTY shell sessions, Docker executor
2. **Phase 2**: Python skill runner (Node spawn), RestrictedPython code executor
3. **Phase 3**: PPTX/document parsers, presentation import/export, connectors
4. **Phase 4**: Hetzner production setup (parallel with Phase 2-3)
5. **Phase 5-7**: File processing, admin tooling, production hardening
6. **Phase 8**: Future K8s migration (when upstream supports it)

Feature flags (`OPENSANDBOX_ENABLED`, `DISPATCH_MODE=optional`) enable gradual rollout with legacy fallback.

## Q3: How should sandbox failures be handled?

**Answer**: Core services must remain unaffected:
- Circuit breaker pattern (aiobreaker) prevents cascade failures when OpenSandbox is down
- Retry with exponential backoff (tenacity) handles transient errors
- During `DISPATCH_MODE=optional`, fallback to legacy subprocess paths
- During `DISPATCH_MODE=required`, jobs fail gracefully with user-friendly error messages
- Core LLM/CRUD/auth always works regardless of sandbox availability
- Cloud Tasks provides job queuing — retries are handled at queue level

## Q4: What authentication model is used between SmartSpecPro and OpenSandbox?

**Answer**:
- `OPENSANDBOX_API_KEY` environment variable for lifecycle API authentication
- Key stored in `.env` locally, GCP Secret Manager in production
- OpenSandbox itself has no built-in auth — we implement API key validation at the Nginx proxy level on Hetzner
- Firewall on Hetzner restricts inbound to GCP Cloud Run egress IPs only
- In-sandbox: NEVER inject tenant secrets as raw env vars — use short-lived scoped tokens and signed URLs

## Q5: How does artifact transfer work between sandbox and core services?

**Answer**:
- Input: Orchestrator stages files from S3/R2 into sandbox via Filesystem API
- Output: Orchestrator collects outputs via Filesystem API, uploads to S3/R2
- Shared volumes are NOT used — all transfer via API
- Signed URLs (15-min TTL) for file access from both GCP and Hetzner
- Cloudflare R2 accessible from both GCP and Hetzner (global)

## Q6: What about the existing skill system — how does it change?

**Answer**:
- `executionMode` enum gets extended: `core-text`, `sandbox-code`, `sandbox-command`, `sandbox-browser`, `sandbox-file`, `sandbox-media`
- Backward compatibility: `llm-only` → `core-text`, `media-generate` → `sandbox-media`
- New fields on skills table: `sandboxProfileSlug`, `requiresNetwork`, `requiresBrowser`, `maxRuntimeSeconds`, `maxInputMb`
- Skills with `core-text` execute unchanged
- Skills with `sandbox-*` dispatch through sandbox job system

## Q7: What are the 4 initial sandbox profiles?

**Answer**:
1. **code-default**: 1 CPU, 2GB RAM, 10min timeout, network deny, code interpreter enabled
2. **media-processing**: 2 CPU, 4GB RAM, 30min timeout, network deny, command enabled
3. **browser-default**: 2 CPU, 4GB RAM, 10min timeout, network allow (with egress allowlist)
4. **file-parser**: 1 CPU, 2GB RAM, 5min timeout, network deny, command enabled

## Q8: What about multi-tenancy and quotas?

**Answer**:
- `tenant_sandbox_policies` table controls per-tenant limits
- Max concurrent sandboxes (default 5), max daily runtime (10 hours), max single job (30 min)
- Default network action (deny), egress rules per tenant, allowed images
- Cost attribution: tenant → package → feature → job
- Admin UI for policy management

## Q9: What testing approach should be used?

**Answer**:
- **TypeScript**: Vitest (already in use) — test sandbox router, dispatch service, status projection
- **Python**: pytest with markers (already in use) — test sandbox client, lifecycle, execution, profiles
- **Integration tests**: Test full flow from tRPC call → Python orchestrator → sandbox create/execute/destroy
- **Mocking**: Mock OpenSandbox HTTP API for unit tests; use real sandbox for integration tests
- **Coverage**: Maintain 80% minimum for Python backend

## Q10: What is the rollback strategy?

**Answer**:
- Phase 1-4: Feature flags = `optional`, legacy paths active, set `OPENSANDBOX_ENABLED=false` to disable
- Phase 5+: Feature flags = `required`, no legacy fallback
- Emergency rollback: Re-enable legacy subprocess paths via environment variable override
- Per-feature granularity: Can disable sandbox for specific feature types while keeping others
