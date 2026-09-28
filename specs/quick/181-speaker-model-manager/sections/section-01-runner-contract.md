# Section 01 — runner capability contract

Modify `apps/worker-app/speaker-aware-runner/speaker_aware_runner.py` and its
tests. Add a no-input `--capabilities` JSON mode using `adapter_capabilities()`.
Keep output machine-readable and fail closed. Do not add network access.

Acceptance: all eight adapter IDs are present; model/runtime remediation is
truthful; existing version and scan tests pass.
