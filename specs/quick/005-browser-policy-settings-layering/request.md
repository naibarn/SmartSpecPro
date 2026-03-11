# Request

## Original Request

พิจารณาการจัดวาง setting ให้สมบูรณ์ครบถ้วน ที่สำคัญคือ policy ระบบ tenant และ policy ของแต่ละ user ที่ยืดหยุ่น user กำหนดได้เอง หา solution ที่เหมาะสมว่า policy อะไรเป็นระบบ tenant อันไหนระดับ Admin และ อันไหนระดับ user ให้ยืดหยุ่นมากที่สุดแต่ยังคงปลอดภัย

## Task Summary

Define a complete ownership and settings model for browser-policy and adjacent automation settings across:

- platform admin
- tenant admin (`domain_admin`)
- workflow/tool owners
- end users

The result should fit the current SmartSpecPro codebase and existing UI surfaces, especially:

- tenant feature flags in `tenants.featureFlags`
- tenant browser policy config/rules/entitlements
- current admin-only `AutomationSettingsPanel`
- existing user settings/preferences patterns

## Constraints

- preserve deny-by-default and fail-closed safety
- do not let user-scoped settings widen access beyond tenant or platform ceilings
- keep backward compatibility with legacy `tenant_automation` settings until migration is complete
- fit current roles: `admin`, `domain_admin`, `user`

## Assumptions

- browser-policy remains a tenant-scoped enforcement system at runtime
- workflow entitlements remain the main place for workflow-specific capability limits
- user-level flexibility should primarily mean self-restriction, personal defaults, and approval UX, not privilege expansion

## Non-Goals

- implementing the new settings model in this task
- redesigning unrelated settings pages
- creating a full RBAC system beyond the current three roles
