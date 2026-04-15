<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-canonical-automation-run-model
section-02-mode-selection-workflow-template-resolution-and-transition-rules
section-03-execution-adapters-step-routing-boundaries-and-surface-allowlists
section-04-checkpoints-human-edits-approval-gates-and-resume-semantics
section-05-evidence-drafts-media-outputs-and-operator-surfaces
section-06-rollout-guardrails-and-regression-coverage
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-canonical-automation-run-model | - | section-02, section-03, section-04, section-05, section-06 | No |
| section-02-mode-selection-workflow-template-resolution-and-transition-rules | section-01 | section-03, section-04, section-06 | Yes |
| section-03-execution-adapters-step-routing-boundaries-and-surface-allowlists | section-01 | section-04, section-05, section-06 | Yes |
| section-04-checkpoints-human-edits-approval-gates-and-resume-semantics | section-01, section-02, section-03 | section-05, section-06 | No |
| section-05-evidence-drafts-media-outputs-and-operator-surfaces | section-01, section-03, section-04 | section-06 | No |
| section-06-rollout-guardrails-and-regression-coverage | section-01, section-02, section-03, section-04, section-05 | - | No |

## Execution Order

1. section-01-canonical-automation-run-model
2. section-02-mode-selection-workflow-template-resolution-and-transition-rules and section-03-execution-adapters-step-routing-boundaries-and-surface-allowlists
3. section-04-checkpoints-human-edits-approval-gates-and-resume-semantics
4. section-05-evidence-drafts-media-outputs-and-operator-surfaces
5. section-06-rollout-guardrails-and-regression-coverage

## Section Summaries

### section-01-canonical-automation-run-model
Defines the automation-run envelope, step history, checkpoint model, and mode-change events tied to Work OS case identity.

### section-02-mode-selection-workflow-template-resolution-and-transition-rules
Defines mode selection, workflow template resolution, and the policy for moving between manual, semi-auto, and fully auto.

### section-03-execution-adapters-step-routing-boundaries-and-surface-allowlists
Defines the adapter boundary for Skills, Agency Swarm, Automation Copilot, Document Management, Media Studio, and Video Editor.

### section-04-checkpoints-human-edits-approval-gates-and-resume-semantics
Defines checkpoint editing, approval gates, safe resume, and rollback semantics for the first workflow family.

### section-05-evidence-drafts-media-outputs-and-operator-surfaces
Defines how runs surface in Work OS timelines and operator dashboards, and how external artifacts are linked rather than duplicated.

### section-06-rollout-guardrails-and-regression-coverage
Defines staged rollout, idempotency, tenant safety, and regression coverage for the fabric.
