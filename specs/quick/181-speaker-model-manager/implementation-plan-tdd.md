# TDD guidance

1. Runner test: `--capabilities` returns all adapter IDs and truthful status
   without requiring a media input; unset model variables produce
   `missing_model` where dependencies are importable.
2. Rust tests: unknown adapter paths are rejected; set/clear round-trips the
   dedicated JSON file; capability JSON with a required missing model blocks
   admission; an explicit ready fallback is accepted.
3. UI tests: loading, healthy, missing-model, missing-runtime, and error states
   render distinct copy; selecting/clearing a path invokes the native command;
   blocked preflight exposes remediation and does not queue a job.
4. Regression: existing speaker-aware workflow and runtime manifest suites
   remain green.
