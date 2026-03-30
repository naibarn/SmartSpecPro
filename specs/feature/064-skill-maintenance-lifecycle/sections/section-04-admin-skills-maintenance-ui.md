# Section 04: Admin Skills Maintenance UI

## Goal

Add maintenance review actions and queue views to Admin > Skills.

## Files to Create

- `apps/web/client/src/components/admin/SkillMaintenanceAdvicePanel.tsx`
- `apps/web/client/src/components/admin/SkillMaintenanceQueue.tsx`
- `apps/web/client/src/components/admin/__tests__/SkillMaintenanceAdvicePanel.test.tsx`

## Files to Modify

- `apps/web/client/src/pages/AdminSkills.tsx`

## TDD - Tests to Write First

- skill row renders `Analyze` action
- clicking `Analyze` triggers maintenance API call
- maintenance tab renders recommendation queue
- recommendation detail panel shows risk, compatibility, and affected files
- dismissed recommendations disappear or move out of default queue

## Implementation Guidance

1. Add row actions:
   - `Analyze`
   - `View Advice`
   - `Apply Upgrade`
2. Add a `Maintenance` tab for queue review.
3. Show quality score, risk, recommendation type, GenJS candidate badge, and last analyzed time.
4. Use explicit confirmation UI before apply.

## Compatibility Constraints

- existing skill create/edit/import/proposal flows must remain intact
- proposal queue UI must remain usable
