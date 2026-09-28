# Audit round 04 — adapter policy and preflight

- Checked Rust adapter policy tests and source inspection for `deny`, `allow_listed`, and `report_unknown` behavior.
- Confirmed missing configured runner returns `workflow_capability_blocked` and does not synthesize evidence.
- Finding: queue could previously be submitted before local runner preflight.
- Action: `worker_app_submit_speaker_aware_job` now probes the configured runner before POSTing the job.
