# Section 04 review

- Snapshot fingerprints exclude volatile source URLs/timestamps from identity through the existing visual-source canonicalizer.
- Snapshot persistence rejects identity mutation and run validation fails closed on revision/fingerprint mismatch.
- Story generation admission accepts the snapshot as the durable source boundary without changing legacy callers.
- Focused stale-fence proof passed. Caller-by-caller propagation is tracked in the final traceability matrix.
