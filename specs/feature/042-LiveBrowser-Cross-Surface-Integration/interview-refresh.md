# Interview Refresh

Date: 2026-03-12
Mode: `delta`

## Delta Scope

- include Agency Swarm runtime support where a running agency graph can open and hand off a Browser Session
- include browser-visible automation scenarios that require login, MFA, captcha, and human takeover
- include browse-heavy tasks from Chat such as research, ticket comparison, hotel comparison, and proximity-aware shortlist generation
- include guardrails for payment or booking confirmation so irreversible actions require explicit human confirmation

## Missing Or Weak Areas In The Previous Plan

- Agency `browser_session` existed in builder and chat UI but was not planned deeply enough as executable runtime behavior
- Browser Session workspace was treated as an integration shell, not explicitly as a rendered remote browser viewport
- Chat launch flow focused on toolbar entry and reopen behavior, not conversation-native invocation
- Research and booking comparison output contracts were not normalized
- Captcha and commitment-gate states were not distinguished from generic user-input pauses

## Focus

- focus: `all`
- emphasis:
  - runtime execution
  - browser rendering
  - structured comparison outputs
  - human safety and confirmation gates
  - rollout isolation for advanced automation slices
