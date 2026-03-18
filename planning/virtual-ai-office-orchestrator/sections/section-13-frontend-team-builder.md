The section-12 file doesn't exist yet, which is fine -- this section just depends on it conceptually. Now I have all the context needed.

# Section 13 -- Frontend Team Builder

## Overview

This section extends the existing Agency Builder page (`/apps/web/client/src/pages/AgencyBuilder.tsx`) to support team-specific configuration. When a user creates or edits a team (as opposed to a standalone agency), additional UI panels appear for team metadata, persona binding per member, policy configuration, template quick-start, and a validation overlay that enforces team-specific constraints (exactly one lead, every member bound to a persona, memory scopes provisioned).

### Dependencies

- **Section 04 (Team Service)**: Provides the `team.create`, `team.update`, `team.cloneFromTemplate`, `team.listTemplates` tRPC procedures that this frontend calls.
- **Section 12 (Frontend Shell and Sidebar)**: Provides the sidebar redesign, creation menu, and route model. The team builder is navigated to from the sidebar "New Team" action or by clicking an existing team entry. The route will be `/agencies/:id/edit?mode=team` or `/teams/new`.

### What This Section Covers

1. **Team metadata panel** -- a collapsible panel above or alongside the ReactFlow canvas for team name, description, category, default view mode, default autonomy level, and default model.
2. **Persona binding modal** -- each agent/supervisor node gets a "Bind Persona" action that opens a modal listing available personas (from `persona.list` tRPC query) for selection.
3. **Policy configuration panel** -- per-member and team-level policy editors for autonomy, visibility, memory, and approval policies stored as JSON.
4. **Template quick mode** -- selecting a team template populates the canvas with pre-configured nodes, edges, and team metadata from the template's `teamConfigJson` and `memberTemplateJson`.
5. **Validation overlay** -- extends the existing `useAgencyValidation` hook to add team-specific rules (at least one member, exactly one lead, every member persona-bound).

---

## Tests First

All tests use Vitest with React Testing Library (happy-dom environment). Place new test files at:

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/TeamBuilder.test.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/__tests__/useTeamValidation.test.ts`

### Test File: `TeamBuilder.test.tsx`

```typescript
/**
 * @vitest-environment jsdom
 *
 * Tests for the Team Builder overlay on the Agency Builder.
 * Verifies team metadata panel, persona binding, template instantiation,
 * and validation overlay behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock reactflow, trpc, AuthContext similar to existing AgencyBuilder.test.tsx
// (see apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx
//  for the standard mock setup pattern)

describe("TeamBuilder", () => {
  describe("Team metadata panel", () => {
    it("renders the team metadata panel with name, description, and category fields when mode=team", async () => {
      // Render the AgencyBuilder page with ?mode=team query param
      // Assert: fields for team name, description, category are visible
    });

    it("does NOT render team metadata panel when mode is absent (standard agency)", () => {
      // Render AgencyBuilder without mode=team
      // Assert: team metadata panel is NOT in the document
    });
  });

  describe("Persona binding", () => {
    it("shows persona binding modal with existing personas when 'Bind Persona' is clicked on a node", async () => {
      // Setup: render with a single agent node, click node to open property panel
      // Click "Bind Persona" button
      // Assert: modal appears listing personas from mock persona.list query
    });

    it("updates node data with selected personaId after persona selection", async () => {
      // Setup: open persona binding modal, select a persona
      // Assert: the node's data now includes personaId matching the selection
    });
  });

  describe("Validation overlay", () => {
    it("validates at least 1 member and 1 lead", () => {
      // Setup: render team builder with zero nodes
      // Assert: validation shows "At least one team member required"
      // Add one agent node without isLead
      // Assert: validation shows "Exactly one lead is required"
    });

    it("validates that template instantiation populates all member slots", async () => {
      // Setup: select a template that defines 3 members
      // Assert: canvas contains 3 nodes after template instantiation
      // Assert: each node has persona binding from the template
    });
  });
});
```

### Test File: `useTeamValidation.test.ts`

```typescript
/**
 * Tests for the useTeamValidation hook which extends
 * useAgencyValidation with team-specific rules.
 */
import { describe, it, expect } from "vitest";
// Import the hook (or its pure validation function) and types

describe("useTeamValidation", () => {
  it("returns error when no nodes have isLead=true in team mode", () => {
    // Input: nodes with 2 agents, neither isLead
    // Expected: error map includes "Exactly one team member must be designated as lead"
  });

  it("returns error when multiple nodes have isLead=true", () => {
    // Input: 2 agents both with isLead=true
    // Expected: error includes "Only one lead allowed per team"
  });

  it("returns error when an agent node is missing personaId in team mode", () => {
    // Input: 1 agent with isLead, no personaId in node data
    // Expected: error includes "Persona binding required for team members"
  });

  it("returns no team-specific errors when all constraints satisfied", () => {
    // Input: 2 agents, one isLead, both have personaId
    // Expected: no team-specific validation errors
  });
});
```

---

### Guided Builder Flow (from spec §16.8.6)

The team builder supports 3 creation modes:
- **Quick Team**: Start from system template, minimal fields (name + template selection)
- **Guided Builder**: 5-step wizard:
  Step 1: Team purpose (name, goal/category, recommended templates based on user persona)
  Step 2: Team composition (choose preset members, add/remove, mix role templates, choose lead)
  Step 3: Persona binding (per member: choose existing persona / create inline / clone+adapt / platform/tenant personas)
  Step 4: Runtime policies (autonomy level, visibility mode, summary mode, approval defaults, memory defaults)
  Step 5: Review (member roster, persona sources, tools summary, expected behavior)
- **Advanced Builder**: Opens the ReactFlow graph editor (existing Agency Builder)

Inline persona creation minimum fields: persona name, assistant nickname, gender style, description, template source, system prompt prefix, tone, language, restrictions.

Persona source types per member: existing_user_persona, existing_tenant_persona, existing_platform_persona, inline_new_persona, inline_cloned_persona.

---

## Implementation Details

### 1. Extend `AgencyNodeData` Type

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts`

Add team-specific optional fields to the existing `AgencyNodeData` interface:

```typescript
export interface AgencyNodeData {
  // ... existing fields ...

  // Team-mode extensions (only populated when editing a team)
  personaId?: string;
  personaName?: string;
  roleTitle?: string;
  isLead?: boolean;
  sortOrder?: number;
  modelSelectionPolicy?: "fixed" | "cost_optimized" | "quality_optimized" | "auto";
  approvalPolicyJson?: Record<string, unknown>;
  memoryPolicyJson?: Record<string, unknown>;
  visibilityPolicyJson?: Record<string, unknown>;
}
```

This is additive -- existing agency-only usage ignores these fields because they are all optional.

### 2. Team Metadata Panel Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/TeamMetadataPanel.tsx`

A collapsible panel that appears above the ReactFlow canvas when in team mode. Contains:

- Team name (Input, required)
- Description (Textarea)
- Category (Select with predefined options like "Research", "Content", "Engineering", "Custom")
- Default view mode (Select: transparent / milestone / summary)
- Default autonomy level (Select: manual / guided / autonomous)
- Default model (reuse existing `ModelPicker` component from `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ModelPicker.tsx`)

The panel receives a `teamMetadata` state object and an `onTeamMetadataChange` callback. This state is managed in the parent AgencyBuilder page.

```typescript
interface TeamMetadata {
  name: string;
  description: string;
  category: string;
  defaultViewMode: "transparent" | "milestone" | "summary";
  defaultAutonomyLevel: "manual" | "guided" | "autonomous";
  defaultModelId?: string;
  memoryPolicyJson?: Record<string, unknown>;
  artifactPolicyJson?: Record<string, unknown>;
}

interface TeamMetadataPanelProps {
  metadata: TeamMetadata;
  onChange: (updates: Partial<TeamMetadata>) => void;
}
```

### 3. Persona Binding Modal

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/PersonaBindingModal.tsx`

A dialog that shows when the user clicks "Bind Persona" on an agent node in team mode. It:

1. Fetches personas via `trpc.persona.list.useQuery()` (same query used by the existing `PersonaSelector` component at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/PersonaSelector.tsx`).
2. Renders a grid of persona cards with name, description, and icon.
3. On selection, calls back with the `personaId` and `personaName`, which the parent writes into the node's `AgencyNodeData`.

```typescript
interface PersonaBindingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPersonaId?: string;
  onSelect: (personaId: string, personaName: string) => void;
}
```

### 4. Policy Configuration in Agent Property Panel

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgentPropertyPanel.tsx` (modify existing)

When in team mode, the existing `AgentPropertyPanel` gains additional collapsible sections below the existing tool/model sections:

- **Persona** section: shows currently bound persona name with a "Change" button that opens `PersonaBindingModal`.
- **Role** section: `roleTitle` text input, `isLead` toggle switch, `sortOrder` number input.
- **Policies** section (collapsed by default): JSON editors or simplified form fields for `approvalPolicyJson`, `memoryPolicyJson`, `visibilityPolicyJson`, and `modelSelectionPolicy` dropdown.

The team mode flag is passed down as a prop `isTeamMode: boolean`. When false, these sections are hidden.

### 5. Template Quick Mode

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/TeamTemplateModal.tsx`

Similar to the existing `AgencyTemplateModal` at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencyTemplateModal.tsx`, but calls `team.listTemplates` and `team.cloneFromTemplate` tRPC procedures (from Section 04 / Section 10).

When a template is selected:
1. The modal calls `team.cloneFromTemplate({ templateId, overrides })`.
2. The response includes the new team ID, agency ID, and member profiles.
3. The builder navigates to `/agencies/{agencyId}/edit?mode=team&teamId={teamId}`.
4. The builder hydrates the ReactFlow canvas from the template-generated agency nodes, and populates `TeamMetadata` and per-node persona bindings from the returned team data.

### 6. Validation Hook Extension

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useTeamValidation.ts`

A new hook that wraps `useAgencyValidation` and adds team-specific rules:

```typescript
/**
 * Extends useAgencyValidation with team-specific validation rules.
 * Only active when isTeamMode is true.
 */
export function useTeamValidation(
  nodes: Node<AgencyNodeData>[],
  edges: Edge[],
  isTeamMode: boolean,
): Map<string, string[]> {
  // 1. Call useAgencyValidation for base agency rules
  // 2. If isTeamMode:
  //    a. Check exactly one node has isLead=true among agent/supervisor nodes
  //    b. Check every agent/supervisor node has a personaId
  //    c. Check at least one member node exists
  // 3. Merge team errors into the base error map
}
```

### 7. AgencyBuilder Page Modifications

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AgencyBuilder.tsx`

Changes to the existing page:

1. **Detect team mode** from URL query parameter: `const isTeamMode = searchParams.get("mode") === "team"`.
2. **Team metadata state**: `const [teamMetadata, setTeamMetadata] = useState<TeamMetadata>(...)`.
3. **Fetch team data** when `teamId` query param is present: `trpc.team.get.useQuery({ teamId })` to hydrate metadata and per-node persona bindings.
4. **Render `TeamMetadataPanel`** above the canvas when `isTeamMode` is true.
5. **Use `useTeamValidation`** instead of `useAgencyValidation` -- the former delegates to the latter internally.
6. **Save handler extension**: when saving in team mode, call `team.create` or `team.update` (from Section 10 tRPC routers) in addition to the existing `agency.saveBuilder` call. The team service wraps the agency creation in a transaction (Section 04).

### 8. Validation Overlay Display

The existing AgencyBuilder already shows validation dots on nodes using the error map from `useAgencyValidation`. Since `useTeamValidation` returns the same `Map<string, string[]>` shape, the overlay display logic works without changes. Team-specific errors (missing persona, no lead) appear as red dots on the affected nodes, with error messages visible in the property panel.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/client/src/components/agency/nodes/types.ts` | Modify | Add team extension fields to `AgencyNodeData` |
| `apps/web/client/src/components/agency/TeamMetadataPanel.tsx` | Create | Team name, description, category, defaults panel |
| `apps/web/client/src/components/agency/PersonaBindingModal.tsx` | Create | Persona selection dialog for agent nodes |
| `apps/web/client/src/components/agency/TeamTemplateModal.tsx` | Create | Team template selection and instantiation |
| `apps/web/client/src/components/agency/AgentPropertyPanel.tsx` | Modify | Add persona/role/policy sections in team mode |
| `apps/web/client/src/hooks/useTeamValidation.ts` | Create | Team-specific validation wrapping `useAgencyValidation` |
| `apps/web/client/src/pages/AgencyBuilder.tsx` | Modify | Team mode detection, metadata state, team save flow |
| `apps/web/client/src/components/agency/__tests__/TeamBuilder.test.tsx` | Create | Tests for team builder UI |
| `apps/web/client/src/hooks/__tests__/useTeamValidation.test.ts` | Create | Tests for team validation hook |

---

## Key Design Decisions

1. **Extend, do not fork**: The team builder is the same AgencyBuilder page with team-mode overlays, not a separate page. This avoids duplicating the ReactFlow canvas, node types, edge types, toolbar, undo/redo, and auto-layout logic.

2. **`AgencyNodeData` extension is additive**: Team fields are optional properties on the same interface. Non-team agencies simply never set these fields.

3. **Persona binding is per-node, not global**: Each agent/supervisor in the team has its own persona. This matches the `assistant_profiles` schema where each profile has its own `personaId`.

4. **Validation hook composition**: `useTeamValidation` calls `useAgencyValidation` internally and merges results. This ensures all existing agency validations (model required, instructions required, entry point rules) still apply in team mode.

5. **Template instantiation goes through the backend**: The `team.cloneFromTemplate` tRPC call creates the agency, team, and profiles server-side in a transaction (Section 04). The frontend then hydrates from the response rather than trying to construct the graph client-side. This ensures data consistency.