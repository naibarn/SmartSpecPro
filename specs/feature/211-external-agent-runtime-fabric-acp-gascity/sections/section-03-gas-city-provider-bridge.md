# Section 03 — Gas City Provider Bridge

Add a managed registry/profile and provider interface for session/runtime/store
capabilities. Pin the actual Gas City/Beads/Dolt or certified file-provider
tuple, attest executables, isolate workspace/store endpoints and provide
backup/restore metadata. Tests cover missing/version/license mismatch, endpoint
propagation, process custody and recovery. No request handler may shell out
directly or silently change provider.

