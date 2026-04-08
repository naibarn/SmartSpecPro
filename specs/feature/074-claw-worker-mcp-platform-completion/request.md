# Request

## Original user request

สร้างเป็น spec สำหรับ implement ไว้ก่อนใน `specs/feature` run เลขต่อจากเดิม สำหรับการพัฒนา MCP ให้ครบถ้วนมากที่สุดเท่าที่ดูแล้วเป็นไปได้

## Normalized brief

Create a new feature spec that follows Features 071 and 072 and defines the next major implementation phase for MCP so that:

- delegated personal workers can use MCP safely and truthfully
- MCP becomes a real execution surface instead of mostly a placeholder bridge
- SmartSpecPro exposes the most complete feasible MCP tool surface based on existing backend services
- owner-bound Library, RAG, skills, agencies, media, jobs, presentations, video projects, workspace, drive, browser, and orchestrator actions can be reached through a canonical MCP path where practical
- billing, grants, concurrency, budget, and audit remain correct

## Design constraints captured from the current thread

- Bound Worker is a personal worker owned by the user who registered it
- workers must not cross user boundaries
- workers must not cross tenant boundaries
- user credit balance remains the billing source for SmartSpecPro-routed work
- external API usage that the worker pays for with its own credentials stays outside SmartSpecPro credit billing
- MCP should be made as complete as realistically possible, but the spec must stay truthful about what is already production-ready vs what still needs to be built

## Desired outcome

A new feature spec package that clearly defines:

- current MCP backend truth
- the gap between protocol readiness and execution readiness
- the canonical MCP endpoint and contract for delegated workers
- the tool families to make real first
- the security and billing design
- a phased implementation path toward the most complete feasible MCP surface
