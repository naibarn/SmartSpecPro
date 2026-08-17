# Section 02 review input

The repository is dirty, so this review input intentionally avoids a broad
staged diff. Review these exact owned changes against
`sections/section-02-client-dialog.md`:

- New `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStaleDraftCleanupDialog.tsx`
- New `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaStaleDraftCleanupDialog.test.tsx`
- Only the stale-cleanup imports, counts, offer hook call, mutation, and dialog
  mount hunks in `apps/web/client/src/components/verticalDramaSeries/VerticalDramaShell.tsx`

Verification before review: focused dialog/helper suite passed 5/5.
