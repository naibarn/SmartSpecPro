---
name: Teams Feature UI-Documentation Discrepancy
description: Help docs claim Teams UI has create team button and form, but actual UI only shows team list and room management. Gap between documentation and implementation.
type: project
---

# Teams Feature: Documentation vs. Implementation Discrepancy

**Status:** AUDIT COMPLETE — CRITICAL DOCUMENTATION ERRORS IDENTIFIED
**Date:** 2026-03-18

## Summary

The help documentation for "Teams" (both English and Thai) describes UI elements that **do not exist in the actual application**:

### What Help Docs Claim EXISTS
1. **Teams Page** with visible menu link
2. **"+ New Team" button** in the Teams sidebar header
3. **Create Team form** with name/description fields
4. **Add Members section** in team detail page
5. **Team templates** (Research Trio, Content Review, Brainstorm Panel, Technical Review)

### What ACTUALLY EXISTS in Code
1. ✅ **Teams page route** (`/teams`, `/teams/:teamId`) — IMPLEMENTED
2. ✅ **Teams component** (`client/src/pages/Teams.tsx`) — IMPLEMENTED
3. ✅ **Team list sidebar** with search
4. ✅ **Room management** (create rooms, view rooms, archive teams)
5. ✅ **tRPC router** with `team.create`, `team.list`, `team.archive`, `team.updateMember` — IMPLEMENTED
6. ✅ **Database schema** with `assistantTeams`, `assistantProfiles`, `assistantTeamTemplates` tables — IMPLEMENTED
7. ❌ **UI for creating teams** — MISSING
8. ❌ **UI for adding members to teams** — MISSING
9. ❌ **Team templates section** — MISSING (schema exists but no UI)

---

## Detailed Findings

### Help Documentation Files

**English:**
- `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/teams.md`
- Lines 20-48: Describes "Creating a Team" section with steps like:
  - "Navigate to Teams in the main menu"
  - "Click New Team"
  - "Enter a name and optional description"
  - "Click Create"

**Thai:**
- `/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/teams.md`
- Lines 20-26: Describes "สร้างทีม" (Create Team) with similar non-existent UI

### Actual Frontend Implementation

**Route exists:**
```typescript
// App.tsx lines 302-303
<Route path="/teams" component={Teams} />
<Route path="/teams/:teamId" component={Teams} />
```

**Teams.tsx component structure:**
- **Left sidebar:** Team list with search (lines 119-185)
  - Shows: team name, member count, room count
  - NO button to create new teams
  - Team entries are clickable to select, not editable

- **Right panel:** Team detail view (lines 188-301)
  - When no team selected: "Select a team" message
  - When team selected: Team name, description (read-only)
  - "New Room" button (creates ROOMS, not teams)
  - "Archive" button
  - NO "Add Member" button
  - NO team settings/management

- **Dialog:** Only for creating ROOMS, not teams (lines 304-359)
  - Fields: Room Type (dropdown), Objective/Goal (textarea)
  - NO team creation capability

### Backend Implementation (EXISTS but not wired to UI)

**tRPC team router** (`server/routers/team.ts`):
```typescript
// Line 28-45: CREATE endpoint exists
create: protectedProcedure
  .input(z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.string().max(100).optional(),
    defaultViewMode: z.enum(["transparent", "milestone", "summary"]).optional(),
    defaultAutonomyLevel: z.enum(["manual", "guided", "autonomous"]).optional(),
    defaultModelId: z.string().max(100).optional(),
    members: z.array(memberInputSchema).min(1).max(10), // REQUIRES members!
  }))
  .mutation(async ({ input, ctx }) => { ... })
```

**Key constraint:** `members: z.array(...).min(1)` — backend requires AT LEAST 1 member when creating a team, but there's no UI to add members.

**Database schema** (`drizzle/schema.ts`):
```typescript
// Lines 5812-5835: assistantTeams table exists
// Lines 5847-5878: assistantProfiles table exists (team members)
// Lines 5883-5898: assistantTeamTemplates table exists (team presets)
```

---

## Root Cause Analysis

1. **Backend was implemented** (team creation, member management, templates)
2. **Frontend route was added** (Teams.tsx page exists at /teams)
3. **Frontend UI was partially implemented** (sidebar list, room management)
4. **Frontend UI was NOT completed** (no create team form, no add members UI)
5. **Help docs were written for the PLANNED UI**, not the actual implementation
6. **The discrepancy was never caught** during help system audit

---

## Impact Assessment

| Element | Status | User-Facing Impact |
|---------|--------|-------------------|
| **View teams** | ✅ Works | Users can see teams they're invited to |
| **Create teams** | ❌ Impossible | Users CANNOT create teams (only admin/backend) |
| **Add members** | ❌ Impossible | Users CANNOT add members to teams |
| **Create rooms** | ✅ Works | Users CAN create team rooms once a team exists |
| **View templates** | ❌ No UI | Templates exist in DB but not accessible |
| **Archive teams** | ✅ Works | Users CAN archive teams they own |

**Critical Gap:** A user cannot go to `/teams` and create a new team as the help docs claim. The feature is incomplete.

---

## Files That Need Correction

### Help Documentation (MUST BE UPDATED OR REMOVED)

1. **`apps/web/docs/help/en/teams.md`**
   - Lines 42-47: Remove or rewrite "Creating a Team" section
   - Lines 123-134: Remove "Templates" section
   - Lines 49-66: Remove or heavily edit "Team Members" section (especially "Adding Members")
   - Update `pages:` frontmatter (currently claims `/teams` route works, but team creation doesn't)

2. **`apps/web/docs/help/th/teams.md`**
   - Lines 20-26: Remove "สร้างทีม" section
   - Lines 28-39: Remove team member assignment section
   - Lines 66-74: Remove template section
   - Update `pages:` frontmatter

### Codebase (OPTIONAL - if feature should be completed)

To complete the feature, would need:
- `teams.md` would be correct
- Add "Create Team" dialog in Teams.tsx sidebar
- Add "Add Member" UI in team detail view
- Wire up tRPC mutations (already exist)
- Add team template selector

---

## Recommendations

### Option A: **Remove Incomplete Feature from Help (RECOMMENDED)**
- Delete or archive teams.md in both English and Thai
- Update help manifest to remove teams topic
- Mark Teams page as work-in-progress / not user-facing

**Rationale:** Feature is incomplete and help docs mislead users. Better to hide than confuse.

**Effort:** 30 minutes (remove 2 files, update manifest)

### Option B: **Complete the Frontend Feature**
- Implement "Create Team" dialog in Teams.tsx
- Implement "Add Members" in team detail view
- Wire up existing backend endpoints
- Update help docs to match actual UI

**Rationale:** Feature exists in backend, just needs frontend polish.

**Effort:** 8-12 hours (create form components, state management, testing)

### Option C: **Update Help Docs Only (SHORT-TERM FIX)**
- Rewrite teams.md sections to match actual UI
- Remove references to non-existent features
- Document workarounds (e.g., "teams must be created via API or admin panel")

**Rationale:** Quick patch, but doesn't solve incomplete feature.

**Effort:** 2 hours

---

## Suggested Help Doc Content (If Option C)

**New "Finding Teams" section (keep):**
- Teams page at `/teams`
- Team list with search
- Click team to select and view rooms

**Remove:**
- "Creating a Team" (no UI exists)
- "Adding Members" (no UI exists)
- "Templates" (no UI exists)

**New "Creating Rooms" section (rename from "Team Rooms"):**
- Document room types (team, direct, auto_team, job_review)
- Explain how to set objective
- Note: Requires existing team (team creation is admin-only currently)

---

## Open Questions

1. **Was team creation intentionally disabled?** (No UI added despite backend being complete)
2. **Should this feature be completed or hidden?** (Is it on the roadmap?)
3. **Are teams currently managed via API only?** (Or is there an admin UI?)
4. **Should help docs remain as aspirational** (documenting planned features) or reflect only shipped functionality?

