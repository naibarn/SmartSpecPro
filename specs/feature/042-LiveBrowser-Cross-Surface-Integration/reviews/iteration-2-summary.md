# Iteration 2 Review Summary

## Improvements

### High

- Agency `browser_session` is now planned as executable runtime behavior
  - Affected area: Python orchestrator, Agency runtime context, Agency Chat
  - Recommended action: implement an explicit executor path and structured session event output
  - Impact: high-impact

- Browser Session workspace is now planned as a rendered remote viewport
  - Affected area: Automation workspace, stream token handling, reconnect behavior
  - Recommended action: add a stream renderer that uses existing viewer/controller token contracts
  - Impact: high-impact

- Captcha and commitment gates are now explicit safety concepts
  - Affected area: Browser Session state mapping, workflow/agency branching, irreversible browser actions
  - Recommended action: add durable barrier types and mandatory human confirmation rules
  - Impact: high-impact

### Medium

- Chat and Agency launch flow now includes structured suggestion and confirmation paths
  - Affected area: conversation UX and Browser Session artifact persistence
  - Recommended action: add assistant-proposed launch cards alongside existing toolbar entrypoints
  - Impact: medium-impact

- Browse-heavy comparison output is now normalized in the plan
  - Affected area: research, ticket comparison, hotel comparison, shortlist review
  - Recommended action: add a reusable comparison contract with evidence-linked fields
  - Impact: medium-impact

- Advanced automation rollout now has isolated validation guidance
  - Affected area: canary sequencing, scenario tests, rollback boundaries
  - Recommended action: validate advanced Browser Session behaviors separately from the base cross-surface rollout
  - Impact: medium-impact
