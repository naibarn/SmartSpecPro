# Deep-Plan Interview — Spec 205 SmartAIHub Runner

No additional stakeholder question was required. The user supplied the
business scope and the primary operating constraints directly; technical
choices were resolved from the codebase and the related specifications.

## Q1 — What product/runtime must be added?

**Answer:** Add a standalone SmartAIHub Runner that works on Windows, macOS
Intel (x64), macOS arm64 (Apple Silicon) and Linux x86_64. It must be separate from the
existing SmartAIHub Worker App, with its own package identity, process,
configuration, credentials and lifecycle.

## Q2 — How must Cloudflare Container relate to the Runner?

**Answer:** Cloudflare Container will also be a Runner, but as a shared Runner
used by all users. It must be controlled through the canonical worker_jobs
control plane and must not become a direct user-to-container channel or a
second task ledger. Feature 204 owns Cloudflare provisioning, pooling,
autoscaling, cost limits and deployment; Feature 205 owns the compatible
Runner execution entrypoint and in-container isolation.

## Q3 — How should Runner artifacts be built?

**Answer:** Build the Runner in GitHub Actions manually. The release workflow
must not auto-build on push or pull request. Native local artifacts and the
shared Container artifact may be selected explicitly by workflow dispatch, with
publishing/deployment remaining an explicit operator decision.

## Auto-decisions

- Use a new Rust package under apps/runner-app because the existing Worker App
  is a Tauri/media runtime with an incompatible product boundary.
- Reuse the canonical Feature 195 Job/lease/fence/event/outbox contracts and
  extend existing runnerContracts additively where required.
- Model two profiles under one execution contract:
  LOCAL_DEVICE_RUNNER and SHARED_CONTAINER_RUNNER.
- Keep local durable journal/reconnect semantics only for local device Runners.
  Shared Containers use ephemeral in-process state and canonical external
  acknowledgement/reconciliation.
- Use the existing Feedback/Chat launcher and Universal Control Plane/Task
  Control projections for status, rather than adding another product page.
- Keep Feature 204 as the only Cloudflare lifecycle/deployment owner.
- Use focused Rust, Web/Vitest, workflow-static and Playwright checks. Do not
  run whole-repository TypeScript typecheck because of the repository RAM
  constraint.
- Do not introduce retired Agency, work request, workpack, custom workflow,
  OpenSandbox, sandbox_jobs or Docker/OpenSandbox dispatch paths.
