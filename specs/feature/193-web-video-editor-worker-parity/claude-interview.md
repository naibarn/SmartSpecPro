# Deep-plan interview transcript — Feature 193

## Stakeholder decisions captured from the conversation

### Q1. Should the Web editor require a Worker for Smart Camera and silence work?

**Answer:** No. Most functionality must remain usable in the browser because
some users do not have Worker App or cannot keep a computer/Worker available.
Lightweight editing and analysis should run locally; heavy rendering should be
sent to a Worker job.

**Plan consequence:** Browser Quick Face Focus, Face + Activity when the local
capability budget allows, playback, timeline review, and Quick Silence Cut are
first-class local paths. Worker execution is optional for Full Scan/fallbacks
and required for heavy final render/export.

### Q2. What behavior must be preserved from the Worker implementation?

**Answer:** Web behavior must be comparable to the Worker implementation,
including face tracking, activity-aware focus, and silence cutting. Preview and
render must not choose different framing or cut timing.

**Plan consequence:** Reuse Feature 191 shared composition types/planner and
Feature 186 job lifecycle. Browser detectors emit evidence; they do not create
a second composition algorithm or second job ledger.

### Q3. What must happen when Worker is unavailable or overloaded?

**Answer:** The editor must continue to work. Only operations that genuinely
need heavy execution may be queued, deferred, or reported as Worker-required.

**Plan consequence:** Capability state is explicit. A valid render request is
durably queued when an approved executor exists; otherwise the project remains
editable and the UI gives an actionable Worker-required message. Provider or
Worker saturation is not a reason to reject ordinary editing.

### Q4. What quality target is required for face focus?

**Answer:** The requested behavior includes five-point face focus plus
activity, in both play and render modes.

**Plan consequence:** Five-point evidence (left/right eye, nose, left/right
mouth) is a versioned shared contract. Face + Activity activity evidence must
be associated with the same face track, and the render path must validate that
evidence and fingerprints.

