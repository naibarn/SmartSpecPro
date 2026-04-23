# Claude Spec

## Objective

Redesign the Team experience so that work is represented as a structured, auditable workflow instead of a chat transcript.

## Must-haves

- show the objective and expected result up front
- show a plan before work starts
- show which team member owns each step
- show which team member reviews each step
- show reviewer comments and change requests
- show whether the work looped back for rework
- show what changed after rework
- show whether the next review passed
- show why a run stopped if it did not finish
- support `auto_team` runs that continue until terminal completion evidence exists
- keep a human-readable audit trail that allows the work to be reconstructed later

## UX requirements

- Team should feel like an orchestration dashboard, not a chat window
- plan, execution, review, rework, and completion should be visible as separate phases
- the conversation feed should be secondary

## Data and workflow requirements

- use structured entities for objective, plan, step, attempt, review, and audit event
- preserve rejected attempts when rework happens
- show terminal stop reasons explicitly
- allow manual and auto modes to share the same ledger model

## Quality requirements

- every meaningful step should have attributable evidence
- users should be able to tell who did what and why
- completion must be evidence-based, not inferred from a "looks done" message

