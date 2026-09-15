# Section 05 — Project Apply and Undo

Implement a pure guarded projection. Verify proposal fingerprint and project revision. Rebuild only eligible image clips with new order, starts, durations, and safe trims. Preserve audio clips, subtitle clips, transcript words, and unrelated tracks byte-for-byte.

Capture exact project JSON for undo and persist bounded additive `metadata.visualMatch` containing contract, fingerprints, matcher revision, appliedAt, and source order. Undo restores only when current revision descends from the apply; otherwise report stale undo instead of overwriting edits.

Test stale proposals, both timing choices, voice/subtitle preservation, repeat idempotence, undo success, and stale undo protection.
