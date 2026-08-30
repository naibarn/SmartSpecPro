# Section cross-consistency review round 2

Status: PASS.

- Shared names are consistent: `WorkerJobSummary`, four canonical Comfy job
  types, profile/permission/policy/projection revisions, and
  `workerMediaWorkflowPolicy`.
- Worker-local secrets/paths stay outside server projections in every section.
- Series shot UI consumes server preflight and shared projection; it does not
  create a second queue or call Comfy directly.
- Section 09 consumes all section gates and does not own production behavior.
