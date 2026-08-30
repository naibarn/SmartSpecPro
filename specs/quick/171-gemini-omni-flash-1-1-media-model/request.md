# Request

เพิ่ม media model จาก Kie.ai รุ่น `google/gemini-omni-flash-1-1` เป็น model แยก โดยคง `Gemini Omni Video` เดิมไว้ และต้องตรวจให้แน่ใจว่าใช้งานได้จริง

## Assumptions

- The new row is an enabled video model available through the existing Kie.ai market adapter.
- Existing `gemini-omni-video` tasks and UI behavior must remain compatible.
- The provider page is authoritative for the new model's API ID and input constraints.
- No DB schema change is needed; the seed script is the persistence boundary.

## Scope

- static and seed model catalogs
- shared Gemini Omni model/capability validation
- Kie provider model resolution and payload tests
- Media Studio and Vertical Drama ID predicates where they currently recognize only the old ID
- focused local verification and optional credential-gated provider smoke

## Non-goals

- changing unrelated providers
- changing Character/Audio asset APIs
- deploying or mutating production data without an explicit operational run
