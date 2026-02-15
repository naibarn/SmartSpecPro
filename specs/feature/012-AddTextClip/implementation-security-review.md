# Implementation Security Re-Review (2026-02-15)

## update-after-fix_now

- `2026-02-15`: `fix_now` applied for prior high-severity rollout bypass finding.
- implemented:
  - tenant-aware server admission gate for text-bearing media jobs in `apps/web/server/routers/mediaJobs.ts`
  - rollout policy module + tests in `apps/web/server/services/textClipRollout.ts` and `apps/web/server/services/textClipRollout.test.ts`
- result: prior high finding is resolved; remaining items are medium/low hardening opportunities.

## critical

- none

## high

- none

## medium

- **Operational alert thresholds are hardcoded in worker helper logic**
  - path: `python-backend/app/tasks/media_job_worker.py`
  - risk: threshold changes require code deployment and may drift from on-call policy documents/configured SLO targets.
  - recommended fix direction: source alert thresholds from centralized config and expose current effective thresholds in diagnostics output.

## low

- **Runtime canary override is mutable in browser global scope**
  - paths: `apps/web/client/src/components/videoeditor/textRollout.ts`, `apps/web/server/services/textClipRollout.ts`
  - risk: client-side runtime override is intentionally flexible but should not be treated as a trust boundary for policy enforcement.
  - recommended fix direction: keep UI gate as UX control only and pair with authoritative backend enforcement (now implemented); continue documenting that browser globals are non-authoritative.
