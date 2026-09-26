# Section 12 — Certification, regression, and rollout

## Goal

Prove completeness across the catalog, use cases, runtime, security, UI, and
mockup-led browser flow before declaring the platform implemented.

## Owned paths

- existing focused Feature 209 unit/component/service test locations;
- `apps/web/tests/e2e/workflow-studio-browser.spec.ts`;
- `node-platform-v1/implementation/ui-browser-evidence.md`;
- `node-platform-v1/implementation/catalog-certification.md`.

## Certification matrix

Generate a row for every node type in `spec.md` with columns for registry ID/
version, input ports, output ports, settings form, bindings, readiness,
adapter, runtime job type, output/preview/artifact, error behavior, unit test,
integration test, and browser evidence where user-visible.

## Representative workflows

Certify at least:

1. form/file → parser/OCR/extractor → structured LLM → Result View;
2. Library input → vector search → rerank → citation → LLM → artifact;
3. prompt template → condition/switch → different AI branches → merge;
4. Skill with actual `input.json`/`ui.json` → output preview;
5. HTTP/MCP/connector flow with permission/SSRF rejection and success fixture;
6. media generation → QC → render → preview/artifact publication;
7. browser session start → instruction → user wait/review gate → evidence;
8. human approval → waiting → approve/reject → resume;
9. retry/cancel/partial run/checkpoint/run-from/run-until/run-subflow;
10. nested Subflow and Marketplace instantiate/run;
11. Result View/output mapping plus Trace Event/Log/Metric/Run Status evidence;
12. AI Draft/Edit create, review, reject, apply, and revision conflict.
13. Spec 200 coding: context-package → workspace-bind → code-task →
    git-operation → verification → artifact with Capability/Runner evidence.
14. Spec 204 media: media-qc → render using a selected runtime profile →
    preview/artifact with resource, progress, stall and cleanup evidence.
15. Spec 206 A2A: capability-search/describe → external-agent-task with
    `a2a_preferred`, Agent Card/conformance snapshot and safe pre-dispatch
    fallback/reconciliation.
16. Spec 207 paid run: economic-quote → budget-guard → reserve/authorization →
    capability-invoke → capture or release → economic-status/settlement report.
17. Spec 208 browser: session-start → observe → typed browser-action/file
    transfer → verify, including review gate and human takeover.
18. Specs 210/211 external runtime: external-agent-task with Orca or ACP/Gas
    City → managed-agent-fleet/session-control → child lineage, recovery,
    verification and aggregate budget.

## Verification commands

Use focused Vitest commands for changed tests, the existing Feature 209
Playwright spec at required viewports, the web build, migration/schema parity,
and relevant security tests. Do not run `npm run typecheck` or full equivalent
under repository rules unless explicitly requested. Record exact commands,
results, skipped gates, and residual risks.

## Audit loop

Perform at least 20 distinct implementation/UI review passes. Each pass must
inspect a different dimension or representative flow and record findings:

- catalog/contract;
- ports/config/forms/bindings;
- core adapters;
- control flow;
- human/recovery;
- LLM/skills;
- tools/security;
- media/artifacts;
- runtime/jobs/outbox;
- outputs/events/traces/logs;
- Library/Marketplace;
- AI Draft/Edit;
- graph interactions;
- subflow navigation;
- inspector/JSON round-trip;
- responsive/accessibility;
- mockup visual hierarchy;
- Dashboard/run flow;
- migration/rollback/tenant safety;
- browser evidence/build/deployment boundary.

Any discovered gap is fixed in the owning section/source and the relevant test
is rerun before the next pass. A counter without evidence is not an audit.

## Rollout gates

- All catalog rows certified or explicitly blocked with truthful readiness.
- Cross-spec matrix has a row for Specs 200, 204, 205, 206, 207, 208, 210,
  and 211, including source authority, node/metadata mapping, adapter/runtime
  evidence, permission/approval boundary, economic linkage where required,
  output/evidence projection, failure/retry/recovery and browser proof.
- Focused tests/build pass; no new browser console errors or clipped critical
  actions in required viewports.
- Authenticated tenant/security and provider/runtime evidence exists where
  required; unavailable external proof is marked residual risk.
- Feature flag and rollback preserve existing definitions and published versions.

## Exit criteria

The certification report can answer, for every node and use case, what it takes
as input, what it produces, how it is configured, which real capability runs it,
what happens on failure, and what evidence proves it works.

## UI/UX Contract

### Target User / JTBD

N/A for a new UI; this section verifies the UI contracts delivered by section 10 and AI states delivered by section 11.

### Existing Pattern Reference

Reuse the existing Feature 209 browser spec plus the UI verification contract; no new component is owned here.

### Surface Inventory

N/A — certification/evidence artifacts only.

### Component Map

N/A — tests consume the components owned by earlier sections.

### State Matrix

Certification must cover loading, empty, error, not-ready, success, partial, approval, retry, canceled, resumed, and artifact states.

### Responsive Matrix

Required evidence: mobile 390x844, tablet 768x1024, desktop 1440x900, plus extended dense-canvas sizes.

### Accessibility Acceptance

Certification checks keyboard path, labels, focus, contrast, reduced motion, and non-color status signals.

### Copy Contract

Record Thai/English labels and actionable validation/error copy in the evidence report.

### Browser Evidence Required

Use `ui-browser-verification.md`; skipped tooling is explicitly recorded as skipped, never pass.
