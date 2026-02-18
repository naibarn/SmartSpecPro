# Research Notes: Dynamic Skill Input Enhancement for Chat

## Codebase Recon

### Chat System Architecture

**Key Components:**
- `ChatView.tsx` (~2620 lines) - Main chat component with state management
- `ChatInput.tsx` - Input handling
- `SlashCommandMenu.tsx` - Skill command UI with autocomplete
- `SkillSettings.tsx` - Per-conversation skill configuration

**Current Skill Execution Flow:**
1. User types message → Debounced skill detection (800ms)
2. Skill detected → Store `detectedSkill` state with confidence, executionMode
3. User sends message → Check execution mode
4. Execute via `executeSkillMutation` or stream via LLM

**State Management:**
- Local state: `useState` for form inputs, UI toggles, streaming content
- Server state: tRPC queries/mutations
- Skill detection state: `detectedSkill` with id, name, type, confidence, executionMode

**Integration Point for Dynamic Forms:**
- Add `skillFormData` state to ChatView
- Load schema via `trpc.skills.getInputSchema.useQuery()`
- Render `DynamicSkillForm` above input area when skill selected
- Pass form values to `executeSkillMutation` as `extraParams`

### Skill System Architecture

**Skill Registry (`skillRegistry.ts`):**
- Primary source: Database (`skills` table)
- Secondary: Folder auto-sync from `skills/` directory
- Content hash tracking prevents unnecessary updates
- Key functions: `getSkillRegistryAsync()`, `getSkillById()`, `getAvailableSkills()`

**Skill Executor (`skillExecutor.ts`):**
- Execution modes: `llm-only`, `media-generate`, `python`, `enhance-prompt`
- `extraParams` already supported for dynamic input fields
- Rate limiting per skill type

**Schema System (`skills.ts` router):**
- `getInputSchema` endpoint loads `ui.schema.json` or `input.schema.json`
- Supports custom UI schema format with sections, fields, outputMapping
- Converts standard JSON Schema to UI schema if needed

**Database Schema:**
- `skills` table: slug, name, category, executionMode, configJson, etc.
- `userSkillVisibility`: Per-user visibility preferences
- Categories: image_generation, video_generation, prompt_enhancement, etc.

### Media Studio (Reference Implementation)

**DynamicSkillForm Component:**
- Location: `apps/web/client/src/components/media/DynamicSkillForm.tsx`
- Schema-driven form renderer with TypeScript interfaces
- Supports field types: text, textarea, select, multiselect, number, slider, boolean, image, images, imageUpload

**Key Features:**
- Bilingual support (EN/TH) via `labelTh`, `placeholderTh`, `helpTextTh`
- Collapsible sections with icons
- Conditional visibility via `dependsOn` (simple equality check)
- Tooltip with info icon for help text
- Default values from schema

**Schema Types:**
```typescript
interface SkillInputSchema {
  title: string;
  titleTh?: string;
  sections: SkillInputSection[];
  outputMapping?: Record<string, string>;
}

interface SkillInputSection {
  id: string;
  title: string;
  fields: SkillInputField[];
  collapsible?: boolean;
  collapsed?: boolean;
  icon?: string;
}

interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider" | "boolean" | "image" | "images" | "imageUpload";
  label: string;
  labelTh?: string;
  dependsOn?: { field: string; value: any };
  optionGroups?: Record<string, SelectOption[]>; // For cascading selects
}
```

**Current Gaps in DynamicSkillForm:**
1. `optionGroups` for cascading selects - NOT implemented
2. `dependsOn.notEmpty` - Server supports but client doesn't
3. `dynamicOptions` - Schema has but not implemented

**SkillSelectorDialog:**
- Search filters by name, description, type
- Grouping: "Recommended" vs "Other"
- Sorting by priority
- Visual badges for type and selection state

### Relevant APIs

**tRPC Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `skills.getUserVisibleSkills` | Get user's visible skills |
| `skills.getInputSchema` | Get schema for form generation |
| `chat.detectSkill` | Auto-detect skill from message |
| `chat.executeSkill` | Execute skill with params |

**Current `executeSkill` Input:**
```typescript
{
  skillId: string;
  prompt?: string;
  dynamicParams?: Record<string, any>; // NEW - needs to be added
  conversationId: number;
  aspectRatio?, numImages?, duration?, voice?, quality?, style?
}
```

### Key Files for Implementation

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `ChatView.tsx` | Main chat UI | Add form state, render DynamicSkillForm, pass values to executeSkill |
| `SlashCommandMenu.tsx` | Command UI | Show indicator for skills with forms |
| `chat.ts` router | Backend API | Extend executeSkill to accept dynamicParams |
| `skillExecutor.ts` | Skill execution | Ensure extraParams flow through correctly |
| `DynamicSkillForm.tsx` | Form renderer | May need optionGroups implementation |

## Web Research

### Cascading Select Implementation Patterns

**Key Findings:**
- Dependent dropdowns (cascading) are a common UI pattern where options in one dropdown change based on another selection
- Implementation approach:
  1. Parent select onChange → update child options
  2. Reset child value when parent changes
  3. Filter child options based on parent value
- For optionGroups pattern: Store all options grouped by parent value, then filter

**Implementation Strategy for DynamicSkillForm:**
```typescript
// When rendering select field with optionGroups
const options = field.optionGroups && field.dependsOn
  ? field.optionGroups[values[field.dependsOn.field]] || []
  : field.options || [];
```

**Reference:** freeCodeCamp - How to Build Dependent Dropdowns in React (Jan 2025)

### Chat UI Form Design Patterns

**Key Findings:**
- Chat forms should be compact and non-intrusive
- Common patterns:
  - Inline expansion below input
  - Modal/overlay for complex forms
  - Collapsible sections for advanced options
- Mobile considerations:
  - Full-screen takeover for forms
  - Bottom sheet pattern
  - Minimized chip showing active form

**Reference:** UXPin - Chat User Interface Design (Apr 2023)

### tRPC Optimistic Updates

**Key Findings:**
- Use `utils.useContext()` for cache invalidation
- Optimistic updates pattern:
  ```typescript
  const utils = trpc.useContext();
  const mutation = trpc.chat.executeSkill.useMutation({
    onSuccess: () => {
      utils.chat.getMessages.invalidate({ conversationId });
    }
  });
  ```
- For skill execution, optimistic UI less critical since we wait for result

**Reference:** tRPC documentation on optimistic updates

## Risk Areas Identified

1. **optionGroups Implementation Gap:** Cascading selects not implemented in DynamicSkillForm
   - Risk: Skills with dependent dropdowns won't work correctly
   - Mitigation: Implement optionGroups support or document limitation

2. **State Management Complexity:** Adding form state to ChatView
   - Risk: Could interfere with existing streaming/detection state
   - Mitigation: Keep form state isolated, clear on skill change

3. **Mobile Responsiveness:** Form in chat context
   - Risk: May not fit well in mobile chat UI
   - Mitigation: Full-screen modal for forms on mobile

4. **Backward Compatibility:** executeSkill API change
   - Risk: Existing skill executions may break
   - Mitigation: Make dynamicParams optional, default to empty
