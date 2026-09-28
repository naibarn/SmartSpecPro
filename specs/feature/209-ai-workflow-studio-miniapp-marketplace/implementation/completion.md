# Feature 209 implementation completion

All six planned sections have repository-level contracts, migrations, focused
tests, and UI building blocks: semantic workflow/version/access contracts,
deterministic AI candidate compiler, mockup-led builder canvas and inspector,
typed subflow bindings and stale-run protection, Mini App and public
marketplace contracts, and Feature 207 economics/correlation. The spec header
and this addendum intentionally do not claim production-complete execution;
the canonical run/executor/artifact path is still an upstream integration
gate.

The UI is wired at `/studio/workflow` and `/studio/workflow/run`. It follows
the attached mockups: left navigation and top-down graph, right
Configure/Settings/Notes inspector, bottom Run/Debug drawer, subflow typed
binding view, and the separate input/progress/activity/artifact run surface.
No `/workflows` route or legacy engine caller was added.

Code evidence: `WorkflowStudioPage.tsx`, `workflowStudio` router/services,
`0341_feature_209_workflow_studio.sql`, bilingual workflow keys, and wiring
tests. Focused Feature 209 tests passed; the repository's unrelated
`localeFiles.test.ts` baseline still expects retired `agency.json` and is
recorded separately in the release gate.

Current audit addendum: marketplace discovery now reads persisted published
app/version/tag rows and publication is owner/admin guarded. The Run surface
is mockup-aligned and has browser regression evidence at 390x844, 768x1024,
and 1440x900. It fails closed on empty input and does not claim Job admission.
A production Run mutation, canonical Job executor, artifact upload/recovery,
real entitlement/economic settlement and live provider certification remain
release gates; no retired `/workflows` path was introduced to fill those gaps.
