# Research Notes

## Current flow

- `VerticalDramaShell` owns `wizardOpen`, recovery selection, and the global
  `CreateSeriesWizard` mount.
- `CreateSeriesWizard` persists a browser snapshot in session storage and already
  polls server-side composition/QC recovery by `draftSessionId`.
- `vertical_drama_draft_ledgers` and immutable versions already provide a durable,
  tenant/user-scoped pre-create ledger.
- `VerticalDramaSeriesDetailPage` uses a local tab state with an initial `?tab=`
  resolver; Planning is additive and remains on the existing Series route.
- Existing `verticalDramaRoutes` and App routes already provide the durable
  `/drama-series/:seriesId` identity, so no static draft route is required.

## Existing pattern decision

Reuse the existing `CreateSeriesWizard`, `Dialog` primitives, `AppPage`,
`VerticalDramaShell`, and current tab components. The new page mode changes the
surface wrapper and route ownership only; it does not invent a second wizard.

## Risks

- The wizard is a large stateful component; wrapper changes must preserve modal
  behavior and recovery hydration.
- The Series shell snapshot must not collide with generated composition ledger
  rows; the ledger remains immutable history/job recovery only.
- Legacy `bible.draftQualityQc.history` arrays must be projected out of normal
  Series reads so old rows do not retain the payload problem.
- Planning links must not imply that a generated document is editable from a
  read-only summary card.
- Existing unrelated dirty release artifacts must not be touched.

## Verification targets

- Route resolver and tab resolver tests.
- Planning shell/promotion ownership and revision tests.
- Default status/detail responses without historical Draft/QC arrays; explicit
  history metadata/content tests.
- Wizard page-mode and recovery UI tests.
- Planning tab rendering and deep-link tests.
- Focused typecheck/lint/Prettier plus browser evidence when a dev server is
  available.
