# Section 01 Code Review Interview

## Review Triage

### Auto-fixed
- **Seed function not wired**: Added `seedAssistantTeamTemplates()` call to `scripts/seed-multi-provider.ts`

### Let go (with rationale)
- **Partial unique index**: Already applied via manual SQL — reviewer missed it (verified: `assistant_profiles_team_lead_idx` exists)
- **Scope creep claim**: False positive — reviewer hallucinated extra tables from snapshot JSON metadata
- **Tests don't hit DB**: Schema shape tests verify ORM definitions; DB integration tests planned for section-18
- **No updatedAt trigger**: Consistent with all 100+ existing tables in codebase
- **No unique on agencyId**: Plan allows multiple teams wrapping same agency (design decision)
- **jsonb no validation**: Consistent with existing patterns; Zod validation happens at tRPC router level
- **genderStyle vs assistantGender naming**: Different purpose (display style vs identity attribute)
- **Migration pollution**: Unavoidable branch drift from schema.ts changes on feature branch

## Applied Fixes
1. `apps/web/scripts/seed-multi-provider.ts` — added import and call for `seedAssistantTeamTemplates`
