## Original request

ตรวจสอบว่าระบบรองรับแล้ว openclaw รองรับตามสเปก SmartSpecPro Distributed Worker Fabric Spec (Revised) ทั้งหมดหรือยัง ถ้ายังให้เพิ่ม spec การปรับปรุงต่อจาก `specs/feature` เดิมในส่วนที่ยังขาดอยู่

## Task summary

Assess the current SmartSpecPro repository against the revised distributed worker fabric architecture, with special attention to:

- what SmartSpecPro already supports in code and in the existing feature chain
- whether current OpenClaw assumptions are still accurate
- what remains missing from the revised runtime-fabric specification
- the next feature-spec package needed to close those gaps without rewriting Features 071-074

## Likely affected areas

- `specs/feature/059-external-worker-provider-framework`
- `specs/feature/071-openclaw-external-runtime-integration`
- `specs/feature/072-claw-worker-platform-access`
- `specs/feature/074-claw-worker-mcp-platform-completion`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/tauri-shell/src-tauri/src/video_editor/*`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/app/video/pipeline.py`

## Constraints

- Keep the assessment truthful about current implementation status.
- Continue from the existing feature chain instead of pretending the older specs never existed.
- Prefer a follow-on feature package over large retroactive rewrites of 071-074.
- Treat external runtime claims as time-sensitive and verify OpenClaw against official docs.

## Assumptions

- The user wants spec and planning updates, not immediate runtime implementation work.
- Features 071-074 remain valid for the OpenClaw control-plane, delegated-platform, and MCP slices already defined.
- Feature 059 still provides useful baseline vocabulary, but its ZeroClaw sidecar framing is outdated where it conflicts with the revised architecture.
- Official OpenClaw docs checked on 2026-04-08 are sufficient for current product-positioning verification.

## Explicit non-goals for this task

- No production code changes to worker/runtime execution behavior.
- No destructive edits to unrelated files already modified in the worktree.
- No attempt to fully re-plan the entire SmartSpecPro platform outside the worker-fabric scope.
