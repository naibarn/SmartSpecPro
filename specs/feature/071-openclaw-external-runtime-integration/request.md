# Request

## Original user request

เพิ่มเติม feature ใหม่รองรับ OpenClaw โดยเพิ่ม spec file ต่อจาก spec เดิมใน `specs/feature` ใช้ guideline ชุด SmartSpecPro Distributed Worker Fabric Spec (Revised) มาประกอบ

## Follow-up request

1. ตรวจสอบความสมบูรณ์ของ spec และเทียบกับ code ที่พัฒนาไปแล้ว
2. ตรวจสอบว่า gateway ที่มีอยู่ทำหน้าที่เป็น proxy LLM gateway สำหรับตระกูล Claw ได้หรือยัง
3. ทำตามคำแนะนำให้ครบ และวางแผนเผื่อให้ครบทุกจุดที่เป็นไปได้

## Normalized brief

Create a new feature package under `specs/feature` that extends the prior worker-runtime direction with a focused, implementation-ready spec for **OpenClaw external runtime support**.

The planning package should now go beyond the first spec draft and leave behind a **comprehensive implementation roadmap** that covers:

- continue from `059-external-worker-provider-framework` instead of rewriting the full worker-fabric program
- use the revised worker-fabric guideline as the authoritative design input for OpenClaw positioning
- stay aligned with the current repository structure and naming patterns
- be concrete enough that implementation can start without re-opening major product questions
- explicitly cover the current HTTP LLM gateway, MCP public gateway, tenant feature-flag behavior, docs gaps, and rollout/testing work required for credible Claw-family support

## Repository-informed assumptions

- `059-external-worker-provider-framework/spec.md` is the baseline worker-fabric spec, but its OpenClaw positioning is still broad and partially outdated relative to the revised guideline
- the current web app already has a notion of `external_connector` team members through `assistant_profiles.externalRef`, but there is no canonical worker registry yet
- the current repo already has runtime-profile and job-management patterns via sandbox tables, services, and admin UI that can inform worker-runtime design without forcing OpenClaw into the sandbox stack
- SmartSpec Desktop and `apps/tauri-shell` already exist, so this feature should not invent a separate desktop product line
- the existing gateway already provides real `/v1/chat/completions`, `/v1/responses`, and `/v1/models` routes, but MCP LLM parity and tenant-safe normalization are still incomplete

## Constraints

- OpenClaw must be modeled as an **external general-purpose runtime**, not as the default desktop media worker
- Desktop + ZeroClaw MVP must remain the primary path for local Windows file access and GPU/media workloads
- the control plane should use interoperable REST endpoints for worker registration and job execution, not tRPC-only contracts
- artifact publication, audit, and tenant isolation must remain SmartSpecPro-owned
- the plan should not claim gateway parity that the current code does not actually provide

## Explicit non-goals for this planning package

- implementing the feature
- rewriting the entire worker-fabric specification family
- defining NemoClaw or HiClaw production rollout in detail
- replacing the current desktop or sandbox architecture
- promising full family-wide MCP parity before the route handlers and docs actually support it
