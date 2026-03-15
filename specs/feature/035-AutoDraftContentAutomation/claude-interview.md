# Interview Transcript — Spec 035: Auto Draft & Content Automation Engine

## Q1: Phasing Plan

**Q**: What is your phasing plan? Should we implement all 3 levels (Auto Draft Agent, Multi-Source Input, Content Automation Engine) in one go, or prioritize Level 1 first?

**A**: Go with Levels 1+2 together first, then ship Level 3 in Phase 2 after validating adoption and content quality.

## Q2: Spec 034 Dependency Status

**Q**: Spec 035 depends on Spec 034 (AgencyResultEnvelope, ResultRouter, builtin-skill-discovery). What is the current implementation status of Spec 034?

**A**: Spec 034 is partially implemented.

## Q3: Content Automation Dashboard

**Q**: For the Content Automation Dashboard (Level 3) — should it be a standalone page or integrated into an existing view?

**A**: New standalone page (/content-automation).

## Q4: Which Spec 034 Components Are Implemented?

**Q**: Which Spec 034 components are already implemented? Which need to be stubbed for Spec 035?

**A**: AgencyResultEnvelope + ResultRouter done. (Implies builtin-skill-discovery and builtin-presentation-create are pending.)

## Q5: Cross-Service Communication Pattern

**Q**: For the auto-draft-pipeline call from Python → Node.js: should the Python batch task call the Node.js /api/internal/tools/auto-draft endpoint (HTTP), or should it call generateAIDraft() logic directly via a shared database approach?

**A**: HTTP call to Node.js (recommended by spec). Python calls POST /api/internal/tools/auto-draft → Node.js handles everything.

## Q6: File Parsing Libraries

**Q**: The spec mentions both Papa Parse and SheetJS for file parsing. Since the file-parse endpoint runs on Node.js server-side, should we use Papa Parse + SheetJS, or a different library combination?

**A**: Papa Parse + SheetJS as specified. Both have Node.js server-side support.

## Q7: Feature Flag Scope

**Q**: For the feature flag ENABLE_CONTENT_AUTOMATION — should it gate only Level 3, or all levels?

**A**: Gate everything (all 3 levels). Single flag controls auto-draft, schedule-draft, and content automation engine.

## Q8: Expected Scale

**Q**: What's the expected concurrency and scale?

**A**: Small scale (1-10 concurrent, <50 specs). Single server, limited users, startup stage.

## Q9: Chat Command Implementation

**Q**: For Level 2 chat commands — should NLP intent detection be LLM-based or a structured command parser?

**A**: LLM-based (agent instructions). Agent analyzes natural language and extracts intent/schedule/topic using LLM reasoning.

## Q10: Pipeline Concerns

**Q**: Any specific concerns about the existing generateAIDraft() pipeline being called programmatically?

**A**: Credit tracking concerns. Specifically about the synthetic PresentationActor not having real user credit balance context.

## Q11: Credit Tracking Detail

**Q**: Can you elaborate on the credit tracking concern?

**A**: Synthetic actor credit context. The pipeline expects a real user session for credit deduction. Synthetic actor may bypass or fail credit checks.

## Q12: Testing Approach

**Q**: Are there existing tests to extend, or will tests be written fresh?

**A**: Extend existing tests. There are test files for aiPresentationService and/or agency_tools that can be extended.

---

## Key Decisions Summary

| Decision | Choice |
|----------|--------|
| Implementation phasing | L1+L2 first, L3 in Phase 2 |
| Spec 034 status | Partially done (Envelope + Router done, skill-discovery pending) |
| Dashboard | New standalone page at /content-automation (Phase 2) |
| Cross-service pattern | HTTP call: Python → Node.js /api/internal/tools/auto-draft |
| File parsing | Papa Parse + SheetJS (server-side) |
| Feature flag | Single `ENABLE_CONTENT_AUTOMATION` gates all levels |
| Scale target | Small (1-10 concurrent, <50 specs) |
| Chat commands | LLM-based intent detection (agent instructions) |
| Key risk | Synthetic PresentationActor for credit deduction — needs verified |
| Testing | Extend existing test files |
