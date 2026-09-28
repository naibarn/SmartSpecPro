# Spec 208 — Repository Alignment Audit

Date: 2026-09-19
Status: Completed

This spec was reviewed in the fresh 20-round 207–210 cross-spec/codebase audit
documented in `orchestra/spec-audit-207-210-2026-09-19.md`.

Immediate repairs in Spec 208:

- added current `workerJobs`/outbox and Job Control Plane evidence;
- added `sah-runner-v1`, Runner route, Runner identity and fencing references;
- aligned native reasoning with the approved OpenAI Agents internal bridge;
- clarified governed LangGraph use versus the retired custom `/workflows` engine;
- restricted Cloud Browser to approved provider/Cloudflare execution boundaries;
- explicitly prohibited new retired-system callers and parallel local-control paths.
- added explicit Spec 209 workflow ownership and Spec 210 Orca-to-Computer-Use
  Capability Gateway boundaries.

Browser Companion, WebMCP fallback, cross-device execution and production
reconciliation remain implementation/release gates.
