# Series Profile as the Single Visual Look Selection

## Goal

Remove the duplicate creator-facing choice between `Series Profile` and
`ลุคภาพประจำซีรีส์`. The selected `Series Profile` becomes the only primary
selection and automatically determines the compatible series visual look.

## Approved behavior

- Keep the `Series Profile` card picker as the single primary control.
- Remove the separate editable `SeriesLookLockPicker` from the create wizard.
- When a profile changes, derive the legacy look-lock compatibility fields from
  that profile. Fiction profiles map to their matching legacy genre; non-fiction
  and hybrid profiles do not write a fiction-only legacy genre.
- Keep existing `visualBible`/visual notes and legacy look data readable for old
  series. They remain supplemental advanced customization and cannot override
  the canonical profile contract.
- Keep the server payload compatibility projection so older downstream paths
  continue to receive aligned values, while the profile remains authoritative.
- Show a concise visual-look summary in the profile picker so the creator can
  understand what the selected profile controls without making a second choice.

## Data and migration behavior

Existing values are preserved. Resolution remains profile-first, followed by
legacy format and look fallback for old records. No destructive migration or
database schema change is needed. A profile change may replace the derived
legacy look value, but does not delete free-form visual notes or managed media.

## Validation

Focused tests will prove that:

1. the separate look picker is not rendered in the create flow;
2. changing a profile derives the matching fiction look-lock compatibility
   value;
3. non-fiction/hybrid profiles clear the fiction-only look-lock genre;
4. visual notes remain present in the create payload; and
5. the profile picker exposes the selected profile's visual summary.

Browser-authenticated and deployment verification are outside this local
change and will be reported separately if not available.
