# Section 04 — Expandable Task Control UI

## Objective

Make the existing Task Control tab useful for several active multi-step jobs
without adding another global button or navigating away.

## Implementation

1. Query `workerJobs.taskGroups` with bounded polling and group pagination.
2. Render every returned group, a clear aggregate status/progress and an
   accessible expand/collapse control.
3. In the expanded region render each step’s ordinal, job type, status,
   progress bar, latest phase/message, worker identity and permitted cancel.
4. Add load-more, refresh, loading/error/empty/degraded states and preserve
   the composer handoff/connections/navigation cards.

## UI/UX contract

| State | Required behavior |
|---|---|
| Loading | Keep panel heading and controls visible; show busy task area |
| Open groups | Show all returned groups and aggregate progress |
| Expanded | Show ordered steps, status, event and cancel affordance |
| Empty | Explain that no open tasks exist |
| Partial error | Keep readiness and composer usable; identify task error |
| Degraded metadata | Keep the job visible as an isolated single group |
| More results | Show explicit load-more continuation |

Responsive behavior: one-column compact cards on mobile, readable two-column
metrics on tablet/desktop, vertical scrolling only, no horizontal overflow.
Accessibility: native buttons, visible labels, `aria-expanded`,
`aria-controls`, `role=progressbar` with bounded values, and cancel buttons that
remain separate from expand controls.

## Tests before code

Use jsdom Testing Library to test render/expand/collapse, step state/progress,
cancel refresh, loading/error/empty and load-more while retaining the task
composer test.

## Completion evidence

Run the focused component test before browser verification.
