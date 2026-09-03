# Implementation audit round 3 — safety, continuity, and failure isolation

- `getEpisodeDetail` no longer runs detection or performs catalog writes; detection is an explicit advisory mutation.
- Detector output persists evidence, confidence, context fingerprint, version, decision, and expiry fields.
- Object work is optional: missing assets and provider/capability limitations are represented as warnings or disabled actions, not storyboard blockers.
- Manual unlink is a soft removal/tombstone; explicit reset is required before the detector can re-suggest it.
- Fix applied: re-linking a previously removed shot link restores `active` state, and unlink now deletes only the projection-owned shot reference by ledger ID, never all legacy `prop_object` rows in the shot.

Result: PASS for non-blocking and lineage safety.
