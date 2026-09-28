# Code Review: Section 02 — Client dialog

Initial review found two actionable gaps: the modal was mounted for one passive
effect cycle after leaving the index route, and mutation success/zero/error
callbacks lacked focused coverage. Both were auto-fixed.

Re-review verdict: **PASS**. The dialog now mounts only on the index route, and
the extracted mutation hook proves count success, zero-row race, close/refetch
signal, and retryable error behavior.
