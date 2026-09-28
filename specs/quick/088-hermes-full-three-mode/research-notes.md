# Research Notes

- The legacy `smartspec-hermes-hermes-1` container is healthy but does not
  register a Feature 135 worker.
- `smartspec-hermes-worker.service`, its secure environment file, the pinned
  host CLI, worker DB row, shared-worker setting, and provider connections are
  absent.
- Global/private/video flags are enabled; server-shared and server-personal
  flags are disabled.
- The current server connect implementation already provides:
  - admin-only creation for `server_shared`;
  - owner-only management for `server_personal` and `private_worker`;
  - per-connection isolated profile references;
  - tenant, worker-online, and capability checks.
- The central UI button ignores scope readiness and can open a flow that the
  backend will reject.
- No Windows Hermes runtime pack is published; the manifest returns
  `allowed:false`.
- The served Worker App is version `0.1.129`, built before the Hermes private
  runtime implementation landed.
- Official PyPI/GitHub sources currently publish `hermes-agent==0.18.2`.
- The repository contains:
  - a pairing script and dedicated systemd unit;
  - a Windows runtime-pack builder;
  - Worker App Hermes runtime code;
  - tests for pairing, worker control, connection service, token leakage, and
    runtime manifest routes.
- SocratiCode transport is closed; research used targeted source reads,
  metadata-only DB queries, service inspection, and official package sources.
