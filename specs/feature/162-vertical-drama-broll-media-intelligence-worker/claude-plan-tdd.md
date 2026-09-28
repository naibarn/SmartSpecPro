# Feature 162 TDD plan

## Shared contracts

- Reject raw paths, URLs, provider credentials, arbitrary graphs, unknown keys,
  and client authority fields.
- Accept valid root/source/probe/edit/QC/workflow/start-frame/reference-frame
  payloads and enforce bounds/order/revisions.
- Resolve Admin default, allowed user override, auto workflow, and stale policy
  deterministically with rejection reason codes.

## Persistence/server

- Migration dry-run detects unresolved owners, duplicate active roots, invalid
  policies, and orphan Series IDs.
- Job idempotency and revision conflicts are deterministic.
- Artifact publication rejects wrong tenant/Series, checksum/manifest/QC/rights
  failures and accepts only verified derived media.
- Vector/index projection is tenant + Series filtered and idempotent.

## Native pipeline

- Root validation rejects symlink/junction escapes, unstable files, unsupported
  media, derived-output recursion, and source mutation.
- Analysis/planning handles dead air, black/frozen/blur, scene ranges,
  subject focus, shot budget, still motion, and 9:16 reframe policies.
- Checkpoints resume only matching fingerprints/revisions/idempotency and
  quarantine partial output after interruption.
- Publication sends derived artifact only; source bytes remain local.

## MCP/generated shot

- MCP manifest/version/capability mismatch blocks admission.
- Start frame and ordered reference pack preserve role/order/revision and are
  included in the immutable WorkflowResolution.
- H3 is unavailable until probe/license/resource checks pass; no arbitrary
  graph or direct HTTP browser path is accepted.

## UI

- Nine-shot cards/drawer cover loading, empty, stale, denied, blocked,
  processing, QC, ready, publish, retry, and revoked-root states.
- User mode/workflow override and start/reference frame controls obey policy.
- Keyboard/focus/labels/reduced motion/responsive and Thai/English copy are
  covered for storyboard and Media Workspace surfaces.

## Integration/rollout

- Local source → derived QC → R2 verification → Series asset → vector index →
  B-roll/shot picker completes with immutable lineage.
- Flags disable new admissions while preserving local jobs, artifacts, and
  legacy storyboard behavior.
