# Implementation Plan

## Outcome

Every Grok via Hermes setup and operations page exposes contextual bilingual
help using the existing Help side panel.

## Work

1. Add four English and four Thai Markdown topics with frontmatter, related
   links, setup instructions, connection ownership, readiness, and
   troubleshooting.
2. Add localized Help buttons to the five relevant UI surfaces.
3. Add service and component tests for topic discovery and button routing.
4. Run focused tests and review the scoped diff.

## Acceptance criteria

- All four slugs load in both locales.
- `/settings`, `/admin/settings`, `/admin/tenants`, `/workers/connect`, and
  `/admin/monitoring` expose the intended topic.
- Existing `hermes-workers` remains the Agent Gateway topic.
- Help remains reachable in disabled/not-ready states.
- Labels and content change with English/Thai locale.
- Existing responsive wrapping and keyboard-accessible HelpButton behavior are
  preserved.

