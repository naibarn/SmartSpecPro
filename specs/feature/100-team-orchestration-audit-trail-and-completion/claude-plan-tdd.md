# TDD Plan: Team Orchestration Audit Trail And Auto Completion

## 1. Test strategy

The test strategy should mirror the implementation order:

1. backend data model and service behavior
2. run progression and review/rework transitions
3. Team room API responses
4. Team page rendering and control states
5. auto-completion and stop-reason regressions

## 2. Backend service tests

### Work item lifecycle

Test that a work item:

- records creation and revision events
- transitions into review
- transitions back to revision after rejection
- preserves the rejected attempt
- transitions to completed after approval

### Run engine lifecycle

Test that an `auto_team` run:

- starts automatically for auto rooms
- creates a structured plan artifact
- attaches owner and reviewer information
- persists review state
- records terminal stop reasons when needed

### Audit event emission

Test that each meaningful transition emits the expected event type and durable payload.

### Attempt audit payload

Test that each model-driven attempt preserves:

- actor identity
- provider/model
- prompt or instruction refs
- context/evidence refs
- tool-call refs
- raw output refs
- summary projections for the UI

## 3. Router and API tests

### Active run recovery

Test that the Team room query can recover an active run and expose it to the page.

### Structured ledger payload

Test that the Team-facing API returns enough structured data for:

- objective
- plan
- step state
- review state
- timeline reconstruction
- attempt drill-down
- completion gate state
- unresolved versus resolved review findings
- derived-history partial labeling for old rooms

## 4. Component tests

### Team dashboard panels

Test that the page renders:

- objective summary
- plan cards
- review cards
- audit timeline
- supporting conversation feed as secondary content
- auto rooms with the conversation panel collapsed by default

### Status visibility

Test that the UI distinguishes:

- running
- blocked
- needs rework
- awaiting review
- completed
- stopped

### Auto-start behavior

Test that creating an `auto_team` room starts the run without requiring a second manual start action.

## 5. Regression tests

### Review loop regression

Create a scenario where:

1. output is produced
2. review fails
3. rework is triggered
4. revised output passes

Assert that the history shows all four stages.

### Multi-loop completion regression

Create a scenario where the work requires more than one revision cycle and verify that:

1. earlier failed findings remain visible
2. later attempts resolve those findings explicitly
3. the run only completes after the final gate passes

### Terminal-stop regression

Create a scenario where auto execution cannot continue and verify that the final UI and API state expose the stop reason.

### Audit reconstruction regression

Create a scenario with multiple attempts and ensure the history is still readable as a timeline of events rather than an unstructured transcript.

### Reload and long-history regression

Create a scenario with a long room history and verify that after reload or active-run recovery the page still shows:

- prior attempts
- prior reviews
- terminal or current completion gate state
- links to detailed attempt drill-down data

### Historical-room derivation regression

Create a scenario with pre-feature historical data and verify that:

1. the room derives a usable ledger on first open
2. partial data is labeled as reconstructed or incomplete
3. the UI does not pretend missing prompt/review detail exists when it does not
