<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-persona-profile-and-selection
section-02-channel-companion-and-webhook-workflows
section-03-opt-in-memory-and-context-sync
section-04-task-specialization-and-work-dispatch
section-05-visibility-observability-and-rollout
section-06-future-hermes-to-work-os-integration
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-persona-profile-and-selection | - | section-02, section-03, section-04, section-05 | Yes |
| section-02-channel-companion-and-webhook-workflows | section-01 | section-04, section-05 | Yes |
| section-03-opt-in-memory-and-context-sync | section-01 | section-04, section-05 | Yes |
| section-04-task-specialization-and-work-dispatch | section-01, section-02 | section-05 | Yes |
| section-05-visibility-observability-and-rollout | section-01, section-02, section-03, section-04 | - | No |
| section-06-future-hermes-to-work-os-integration | section-01, section-02, section-03, section-04, section-05, Feature 082 | - | No |

## Execution Order

1. section-01-persona-profile-and-selection
2. section-02-channel-companion-and-webhook-workflows and section-03-opt-in-memory-and-context-sync in parallel
3. section-04-task-specialization-and-work-dispatch
4. section-05-visibility-observability-and-rollout
5. section-06-future-hermes-to-work-os-integration if and when Feature 082 is available

## Section Summaries

### section-01-persona-profile-and-selection
Define how Hermes profiles are surfaced as user-friendly personas, how users select them, and how the generic runtime path remains available.

### section-02-channel-companion-and-webhook-workflows
Expand channel presence, channel capability summaries, and webhook workflow handling so Hermes is easier to use in messaging-heavy work.

### section-03-opt-in-memory-and-context-sync
Add consented, scoped memory or context sync so Hermes can retain useful context without auto-importing upstream state.

### section-04-task-specialization-and-work-dispatch
Add named task modes and specialization packs that map to the existing capability model without making Hermes less flexible.

### section-05-visibility-observability-and-rollout
Improve plain-language progress summaries, status surfaces, and rollout gates so the feature can be adopted safely and understood quickly.

> Note: If future work extends Hermes into direct Work OS intake, case, queue, or approval flows, create a separate integration section that depends on Feature 082 rather than folding that work into the five slices above.

### section-06-future-hermes-to-work-os-integration
Define the follow-on integration path where Hermes can create and update canonical Work OS records once Feature 082 is available.

This section is intentionally follow-on only:

- it depends on Feature 082 for the work-item model
- it does not introduce a parallel queue or case system
- it should only be activated if the product team decides Hermes should act as a front-end assistant for Work OS intake, update, or progression

#### Dependency map

| Layer | Role in the flow |
|---|---|
| Feature 081 | Hermes bridge and external runtime connectivity |
| Feature 082 | Canonical Work OS model for request, case, task, approval, exception, outcome, and queue state |
| Feature 093 | Hermes UX and capability layer that can present personas, channels, memory sync, task modes, and visibility |
| section-06 of Feature 093 | Future integration slice that lets Hermes drive Work OS records through the canonical 082 APIs |

#### Intended flow

1. A user starts a task in Hermes.
2. Hermes classifies the intent and, if appropriate, creates or updates the canonical work item through Feature 082 APIs.
3. Work OS becomes the source of truth for assignment, state, approvals, exceptions, and outcome.
4. Hermes reflects status back in plain language without becoming a second work model.

#### Safety rules

- Hermes must never invent its own queue, case, or approval state.
- If the work target is ambiguous, Hermes must route to triage.
- All actions must preserve tenant isolation and audit attribution from the Work OS boundary.
