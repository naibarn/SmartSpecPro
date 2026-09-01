# Gap audit round 2 — identity, ACL, and queued-job races

- Checked model identity across provider, Worker, tenant, and local model IDs.
- Fixed provider/model collision with explicit `localProviderId` binding.
- Restricted sharing to same-tenant Groups created by the Worker owner and added
  transactional cancellation of queued non-owner jobs on ACL changes.
- Result: ACL, registry, and lifecycle focused tests passed.
