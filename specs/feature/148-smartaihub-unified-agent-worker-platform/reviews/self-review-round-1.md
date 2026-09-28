# Plan Self-review — Round 1

## Scorecard

| Category                             | Score | Result                                                                                                                     |
| ------------------------------------ | ----: | -------------------------------------------------------------------------------------------------------------------------- |
| Structural integrity                 |   5/5 | PASS — each section has target files, flow, and acceptance                                                                 |
| Completeness versus synthesized spec |   5/5 | PASS — MCP/OAuth, browserless clients, Hermes parent/child, ComfyUI, runtime, UI, quotas, telemetry, and gates are covered |
| Implementability                     |   4/5 | NEEDS FIX — parent/child persistence fallback and exact no-migration decision need stronger implementation guidance        |
| Internal consistency                 |   5/5 | PASS — existing Hermes gateway, Hermes media namespace, MCP media tasks, and typed worker jobs remain distinct             |
| Edge cases/failure modes             |   5/5 | PASS — token, replay, disconnect, cancel, lease, upload, runtime, and external-gate failures are named                     |

## Issue found

The plan allowed an additive migration after inspection but did not say how the
first implementation should represent parent/child linkage when no migration
is needed. An implementer could create a duplicate Agent Task table or put
unbounded opaque JSON in job metadata.

## Auto-fix

Add a bounded shared correlation schema in `workerRuntime.ts` and make the
existing `workerJobs.metadataJson`/`instructionsJson` projection the first
storage option. Require a migration only if an owning conversation/team/job
authority cannot query or retain the fields needed for status/recovery. The
schema must cap strings, child ids, and summaries and must not contain secrets,
binary data, or URLs.

## Round result

After this correction the plan is implementation-ready. No stakeholder choice
remains unresolved; real-machine/runtime/provider evidence remains an explicit
external production gate.
