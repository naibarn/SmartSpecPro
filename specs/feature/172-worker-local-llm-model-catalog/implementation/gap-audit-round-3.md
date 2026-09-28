# Gap audit round 3 — Worker sync, secrets, and rollout controls

- Checked Worker settings → registry → heartbeat → server projection.
- Added revision bumping, secret-free inventory sync, idempotency, and tombstone
  projection for removed models.
- Added tenant flag `workerLocalLlmModels` at catalog and dispatch boundaries.
- Verified URL/keyring and inventory secret/private-data rejection tests.
