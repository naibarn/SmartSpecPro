# TDD Plan

## Test-first priorities

### 1. Persona and profile selection

Add or extend tests so they prove:

- Hermes profile metadata can be read and surfaced safely
- selecting a profile does not break the generic runtime path
- missing profile data fails closed instead of guessing
- legacy Hermes workers without the new metadata still render as generic workers

Expected failing condition:

- profile UI or service code either ignores persona selection or treats it as mandatory for all Hermes jobs

### 2. Channel companion workflows

Add or extend tests so they prove:

- channel capability summaries are displayed from runtime metadata
- callback and handoff behavior still respects the existing worker trust boundary
- channel-related UI does not claim ownership of upstream messaging sessions
- disconnected or reauthorized channels stop appearing as live capabilities
- inactive channel metadata is preserved as inactive rather than silently disappearing from audit views
- callback stop and metadata deactivation are owned by the correct services, not by UI state

Expected failing condition:

- the UI shows channel presence without policy context
- callback handling bypasses the existing worker callback flow

### 3. Opt-in memory and context sync

Add or extend tests so they prove:

- memory sync requires explicit opt-in
- user-only opt-in is enough for personal persona-scoped sync
- shared scopes require tenant approval
- sync is scope-limited to the selected persona, task, or memory set
- disabling sync leaves the base Hermes runtime usable
- revoking sync stops future use immediately and invalidates active access
- revoked shared scopes are quarantined rather than reused silently
- later cleanup is owned by archive/retention services, not by sync UI or delegation code

Expected failing condition:

- memory data starts syncing automatically
- scope or tenant boundaries are bypassed

### 4. Task specialization

Add or extend tests so they prove:

- each specialization mode maps to an allowed capability or route profile
- the generic fallback still works when no specialization applies
- the mode mapping reuses existing delegated profiles instead of inventing new auth classes
- unsupported job types fail closed rather than silently coercing to another mode
- task-mode metadata is visible in session or runtime summaries without creating a second auth path
- legacy sessions without task-mode fields still fall back safely to generic behavior

Expected failing condition:

- a specialization path becomes the only valid runtime path
- a task mode widens scope without policy review

### 5. Visibility and rollout

Add or extend tests so they prove:

- Teams and Admin Monitoring expose human-readable Hermes status summaries
- progress summaries are understandable without technical jargon
- feature gates keep each capability independently controllable
- summaries disagreeing with source records fail closed toward the source record values
- migrated workers with missing metadata still render safely and do not block the page

Expected failing condition:

- the UI regresses into ops-only terminology
- all Hermes enhancements become coupled behind one large toggle

## Regression checks

- existing Hermes registration and delegation tests continue to pass
- bound-worker and `external_connector` behavior remains unchanged for non-Hermes workers
- current monitoring screens still render without the new fields being present
- feature flags default to the existing safe posture
