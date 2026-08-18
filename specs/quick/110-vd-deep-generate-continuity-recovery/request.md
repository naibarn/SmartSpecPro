# Request

## Original request

ปรับปรุงระบบให้สมบูรณ์ ป้องกันการเกิดปัญหา ซ่อมรายการที่มีปัญหาเดิมหากทำได้ และทำตามแนวทางที่แนะนำให้ครบ

## Scope

- Fix Premium deep-generate canonical thread propagation.
- Validate continuity due dates before a full-season boundary.
- Add bounded, fail-closed repair/recovery behavior.
- Recover series #25 from the existing Redis checkpoint when safe.

## Constraints

- Preserve unrelated dirty worktree changes.
- Never fabricate thread resolutions.
- Validate all recovered data before writing bible or series memory.
- Use the existing package manager and test conventions.
