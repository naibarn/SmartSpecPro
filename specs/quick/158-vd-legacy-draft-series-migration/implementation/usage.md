# Usage and operational notes

- Deploy/apply `0240_vertical_drama_draft_series_link.sql` before enabling the
  index migration mutation.
- Opening `/drama-series` runs an owner-scoped migration batch (maximum 100)
  before loading the lightweight Draft index. Remaining rows are picked up on
  the next visit.
- Migrated work is found in the normal Series list. Open `วางแผน` and choose
  `กู้คืน Draft เดิม` only when the old Draft body/QC result is needed.
- The Draft list's trash action is an archive/remove-from-list action, not a
  destructive version delete.
- Browser/authenticated production proof and database migration execution must
  still be verified in the target deployment environment.
