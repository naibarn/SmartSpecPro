# Integration Notes

## Accepted Suggestions

- Accepted: align tests with existing repository conventions.
- Rationale: low-impact clarification that reduces implementation drift and does not alter architecture.

- Accepted: make operational ownership explicit in rollout and alerting.
- Rationale: low-impact clarification that improves rollout execution and incident triage.

- Accepted: define `LiveBrowserSessionManager` as a dedicated long-lived Python runtime component.
- Rationale: the user selected the dedicated runtime option, which matches the review recommendation and reduces split-ownership risk relative to Celery-orchestrated live state.

## Rejected Suggestions

- None at this stage.
