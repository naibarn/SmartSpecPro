# Mission Control UX prototype — interaction flows

Status: interactive DEV concept; every fleet record is synthetic and local to the page.

## Main flow

1. Open `/dev/mission-control-prototype` on an authenticated DEV session.
2. Choose a demo workspace/project, disclosure mode, and theme from the header.
3. Choose a fleet view (Overview, Harnesses, Agents, Runners, Active Work, Waiting / Attention, History, Mission Detail, or Execution Inspector).
4. Narrow the execution list by Agent, Harness, Runner, and status; sort by recent activity or name; reset filters when needed.
5. Select an execution to persist its demo key in the URL and inspect the corresponding execution details.
6. Use inspector tabs for overview/activity and the availability states for evidence not present in the fixture.
7. Navigate locally to the related Chat or Task Control preview, then return to the same selected execution.
8. Open the decision preview to inspect the UX; it cannot approve, reject, dispatch, or resume work.

## Responsive flow

- Desktop: fleet navigation and filters on the left, selected work in the center, inspector on the right.
- Tablet: fleet content remains full-page; Menu and Details controls expose the navigation and inspector as on-demand drawers.
- Mobile: header controls wrap into clear rows; Menu and Details open accessible drawers; execution rows become single-column cards.

## State and data boundaries

- Demo state selector locally presents Ready, Loading, Error, Empty, and Offline examples.
- All fixtures are marked `demo-*` and the page is labeled `DEMO · synthetic data · not live`.
- No network call, worker job, database write, scheduler dispatch, or production mutation is made by this prototype.
- Missing Agent/Run/Harness/Runner identifiers remain absent and render as “Not reported” or “Unavailable”.
