# Research Brief: Draft with AI Dialog & Skill Dynamic Input Rendering

**Date**: 2026-03-09
**Scope**: Complete system for skill input form rendering in Presentation Editor's "Draft with AI" modal
**Status**: Research Complete

---

## Findings

### 1. Draft with AI Modal Component
The "Draft with AI" dialog is a **self-contained React component** in:
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx` (1900+ lines)
- **Component**: `AIDraftModal` function
- **Props interface**: `AIDraftModalProps` (lines 89-108)

The modal provides a complex form for generating AI-powered slides with customizable parameters including:
- Article/content generation settings (language, topic, slide count, custom article text)
- Media generation (image/video skill override, model selection, aspect ratio)
- Audio generation (model selection, voice tier)
- Advanced media options (extra model parameters)
- Dynamic skill-specific inputs (rendered via DynamicSkillForm)

**Key insight**: The modal manages **30+ form state variables** using React hooks (lines 323-371). The most relevant to skill inputs is:
- `articleSkillParams`: `Record<string, any>` (line 358) — stores dynamic form field values

---

### 2. Skill Selection Flow

**How skills are picked and displayed**:

1. **Skills list fetched** (line 385):
   ```typescript
   const skillsQuery = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
   const skills = (skillsQuery.data?.skills ?? []) as VisibleSkillOption[];
   ```

2. **User selects a skill** via combobox (line 330):
   ```typescript
   const [selectedArticleSkill, setSelectedArticleSkill] = useState(() =>
     loadSavedValue("smartspec_aiDraft_articleSkill")
   );
   ```
   - `selectedArticleSkill` is a **skill slug** (string identifier)
   - Previous selections saved to localStorage for quick re-selection

3. **Skill's schema is fetched** (lines 419-422):
   ```typescript
   const skillSchemaQuery = trpc.skills.getInputSchema.useQuery(
     { skillId: selectedArticleSkill },
     { enabled: selectedArticleSkill !== "", staleTime: 300_000 },
   );
   const skillSchema = skillSchemaQuery.data?.hasSchema
     ? (skillSchemaQuery.data.schema as SkillInputSchema)
     : null;
   ```
   - **tRPC query** to `skills.getInputSchema`
   - Only fetches when `selectedArticleSkill` is not empty
   - 5-minute cache (300_000ms)

4. **Selected skill record** extracted (lines 426-429):
   ```typescript
   const selectedDraftSkillRecord = useMemo(
     () => skills.find((skill) => skill.slug === selectedArticleSkill) ?? null,
     [skills, selectedArticleSkill],
   );
   ```
   - Used to determine skill capabilities, media type, execution mode

---

### 3. Dynamic Skill Input Rendering System

#### Component: `DynamicSkillForm`
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/media/DynamicSkillForm.tsx` (1000+ lines)
- **Responsibility**: Renders form from `SkillInputSchema` JSON
- **Props** (lines 444-459):
  ```typescript
  interface DynamicSkillFormProps {
    schema: SkillInputSchema;
    language?: "en" | "th";
    values: Record<string, any>;  // Current form state
    onChange: (values: Record<string, any>) => void;  // Update handler
    onImageUpload?: (files: FileList) => Promise<string[]>;
    referenceImages?: ReferenceImage[];
    onRemoveImage?: (index: number) => void;
    isUploading?: boolean;
    excludeFields?: string[];  // Skip rendering certain fields
    onStyleAction?: (action: StyleAction) => void;  // Handle special actions
    className?: string;
  }
  ```

#### Integration in AIDraftModal (lines 1024-1050)
```typescript
{skillSchema && (
  <DynamicSkillForm
    schema={skillSchema}
    language={language}
    values={articleSkillParams}
    onChange={setArticleSkillParams}
    onImageUpload={uploadReferenceMutation.mutateAsync}
    referenceImages={/* ... */}
    isUploading={uploadReferenceMutation.isPending}
    excludeFields={/* excluded field IDs */}
    onStyleAction={/* callback for special actions */}
  />
)}
```

---

### 4. Skill Schema Data Structures

#### SkillInputSchema (DynamicSkillForm.tsx:143-150)
```typescript
interface SkillInputSchema {
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  sections: SkillInputSection[];  // Form sections (collapsible groups)
  outputMapping?: Record<string, string>;  // Maps field IDs to output keys
}
```

#### SkillInputSection (DynamicSkillForm.tsx:130-141)
```typescript
interface SkillInputSection {
  id: string;
  title: string;
  titleTh?: string;
  description?: string;
  descriptionTh?: string;
  fields: SkillInputField[];
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  icon?: string;  // Lucide icon name (e.g., "sparkles", "palette")
}
```

#### SkillInputField (DynamicSkillForm.tsx:84-128)
```typescript
interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "slider"
      | "boolean" | "image" | "images" | "imageUpload" | "file" | "files"
      | "model-search" | "workflow-selector" | "array";
  label: string;
  labelTh?: string;
  placeholder?: string;
  placeholderTh?: string;
  description?: string;
  descriptionTh?: string;
  helpText?: string;
  helpTextTh?: string;
  required?: boolean;
  default?: any;
  defaultValue?: any;
  options?: Array<{ value: string; label: string; labelTh?: string }>;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;  // For textarea
  maxItems?: number;
  minItems?: number;
  itemLabel?: string;
  itemFields?: SkillInputField[];  // Nested fields for array type
  maxImages?: number;
  maxCount?: number;
  multiple?: boolean;
  accept?: string;
  readOnly?: boolean;
  searchable?: boolean;

  // Conditional/dependent field support
  dependsOn?: {
    field: string;
    value?: any;
    notEmpty?: boolean;
  };

  // Cascading select support
  optionGroups?: Record<string, Array<{
    value: string;
    label: string;
    labelTh?: string;
  }>>;
}
```

---

### 5. Fetching Skill Schemas via tRPC

#### Endpoint: `skills.getInputSchema`
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts`
- **Lines**: 1019-1134
- **Input**: `z.object({ skillId: z.string() })`
- **Output**:
  ```typescript
  {
    skillId: string;
    hasSchema: boolean;
    schema: SkillInputSchema | null;
  }
  ```

#### Schema Discovery Logic (lines 1042-1118)
The endpoint searches for skill schemas in this order:

1. **Skill folder path** (if available):
   ```
   {skillFilePath}/schemas/ui.schema.json
   {skillFilePath}/schemas/input.schema.json
   ```

2. **SKILLS_DIR variations** (handle hyphen/underscore differences):
   ```
   skills/{skillId}/schemas/ui.schema.json
   skills/{skillId.replace(/-/g, "_")}/schemas/ui.schema.json
   skills/{skillId.replace(/_/g, "-")}/schemas/ui.schema.json
   (+ same for input.schema.json)
   ```

3. **Root skills directories** (full scan):
   ```
   ..../skills/{*}/schemas/ui.schema.json (all folders)
   ..../skills/{*}/schemas/input.schema.json (all folders)
   ```

**Priority**: `ui.schema.json` checked BEFORE `input.schema.json`

#### Schema Format Detection (lines 1105-1113)
```typescript
if (schema.sections) {
  foundSchema = schema;  // Custom UI schema format — use as-is
  break;
} else if (schema.properties) {
  // Standard JSON Schema — convert to UI schema format
  foundSchema = convertJsonSchemaToSkillSchema(schema, input.skillId);
  break;
}
```

**Supports two formats**:
- **Custom UI schema**: `ui.schema.json` with `sections` array (preferred)
- **Standard JSON Schema**: `input.schema.json` with `properties` (auto-converted)

---

### 6. Data Flow: From Selection to Submission

#### Step 1: User Picks Skill from Combobox
```
User clicks "Draft Skill" dropdown
  → Select "VEO Video Creator"
  → setSelectedArticleSkill("veo-video-creator")
```

#### Step 2: Schema Fetches via tRPC
```
selectedArticleSkill changes to "veo-video-creator"
  → useQuery({ skillId: "veo-video-creator" }) triggered
  → skills.getInputSchema endpoint locates ui.schema.json
  → Returns { hasSchema: true, schema: {...} }
  → skillSchemaQuery.data.schema is now available
```

#### Step 3: Form Renders with DynamicSkillForm
```
skillSchema becomes non-null
  → DynamicSkillForm component rendered
  → Iterates schema.sections
  → For each section, renders fields based on field.type
  → Current values from articleSkillParams
  → User fills form fields
```

#### Step 4: Form State Updates
```
User types in text field / selects option / uploads image
  → DynamicSkillForm onChange callback fired
  → setArticleSkillParams({ ...values, [fieldId]: newValue })
  → articleSkillParams state updated
  → Form re-renders with new values
```

#### Step 5: Submit with Parameters
```
User clicks "Generate"
  → generateDraft.mutate({ ...config })
  → In config:
     - draftSkillParams: articleSkillParams (if not custom article)
     - articleSkillParams: articleSkillParams (if article skill)
  → Backend receives all skill input parameters
```

---

### 7. Field Rendering Support

DynamicSkillForm renders all field types (lines 597-900+):

| Field Type | Component | Notes |
|---|---|---|
| `text` | Input | Single-line text |
| `textarea` | Textarea | Multi-line with configurable rows |
| `select` | Select (Radix UI) | Dropdown with options |
| `multiselect` | Combobox/Command | Multiple values allowed |
| `number` | Input type="number" | Numeric validation |
| `slider` | Slider | Range input (min/max/step) |
| `boolean` | Switch | Toggle control |
| `image` | File input | Single image upload |
| `images` | File input | Multiple images, max count |
| `imageUpload` | File input | Handles upload via onImageUpload |
| `file` | File input | Generic file upload |
| `files` | File input | Multiple files |
| `model-search` | ModelSearchField | Combobox of LLM models (line 158-276) |
| `workflow-selector` | WorkflowSelectorField | Workflow JSON picker (line 278-438) |
| `array` | Array renderer | Repeatable nested fields |

---

### 8. Advanced Features

#### Conditional/Dependent Fields (lines 494-547)
```typescript
// Field visibility based on parent field value
dependsOn?: {
  field: string;        // Parent field ID
  value?: any;          // If parent equals this value
  notEmpty?: boolean;   // OR if parent is not empty
};
```

**Example**: Show "voice ID" field only when "provider" field is "uvoice"

#### Cascading Selects (lines 549-557)
```typescript
// Field options grouped by parent value
optionGroups?: Record<string, Array<{
  value: string;
  label: string;
  labelTh?: string;
}>>;
```

**Example**: Media model options change based on selected skill type

#### Section Collapse State (lines 476-492)
- Each section can be collapsible
- Initial collapsed state from schema (`collapsed`, `defaultCollapsed`)
- User can toggle open/closed
- Icon displayed in section header (lucide icon from `section.icon`)

#### Language Support (lines 516-519)
- Fields render English OR Thai text based on `language` prop
- Falls back to English if Thai not provided
- `labelTh`, `descriptionTh`, `helpTextTh` for Thai content

---

### 9. Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ AIDraftModal Component                                      │
│ (Presentation Editor: "Draft with AI" dialog)              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ├─ selectedArticleSkill (skill slug)
                           ├─ skillSchemaQuery = trpc.skills.getInputSchema
                           └─ articleSkillParams (form values)
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────────────┐            ┌──────────────────┐
│ tRPC Backend         │            │ DynamicSkillForm │
│ skills.getInputSchema│ ─────────> │ (Form Renderer)  │
│                      │            │                  │
│ 1. Sync skill        │            │ - Renders        │
│ 2. Find schema file  │            │   sections       │
│ 3. Parse JSON        │            │ - Renders fields │
│ 4. Convert if needed │            │ - Handles input  │
│ 5. Return schema     │            │ - Updates state  │
└──────────────────────┘            └──────────────────┘
        │                                     │
        │                                     │
        └─────────────────┬───────────────────┘
                          │
                    Skill Parameters
                    (articleSkillParams)
                          │
        ┌─────────────────┴──────────────────┐
        │                                    │
        ▼                                    ▼
   On Generate              Backend AI Draft
   Send to backend          (presentation.ai.generateDraft)
   as draftSkillParams      Uses params in skill execution
```

---

### 10. File Locations Summary

| Purpose | File | Key Lines |
|---------|------|-----------|
| Main dialog component | `/apps/web/client/src/components/presentation/AIDraftModal.tsx` | 306-1900+ |
| Form rendering | `/apps/web/client/src/components/media/DynamicSkillForm.tsx` | 1-1000+ |
| Schema fetch endpoint | `/apps/web/server/routers/skills.ts` | 1019-1134 |
| Schema loading | `/apps/web/server/routers/skills.ts` | 780-820 |
| Chat skill form (similar pattern) | `/apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx` | — |
| Skill form hook | `/apps/web/client/src/components/chat/skill/hooks/useSkillForm.ts` | — |
| MediaStudio uses schemas | `/apps/web/client/src/pages/MediaStudio.tsx` | — |

---

## Current Architecture

The system uses a **schema-driven form generation pattern**:

1. **Declarative schemas**: Each skill defines its inputs as `ui.schema.json` or `input.schema.json`
2. **Dynamic component**: `DynamicSkillForm` reads schema and renders form
3. **Type-safe backend**: tRPC endpoint safely retrieves and validates schema
4. **Localization ready**: Supports English and Thai labels
5. **Advanced features**: Dependent fields, cascading selects, custom field types
6. **Flexible**: Auto-converts standard JSON Schema to custom UI schema format

---

## Risks

1. **Schema file discovery**: Complex path resolution with multiple fallbacks — could pick wrong schema if naming conventions not followed
2. **Performance**: Full directory scan if schema not found in targeted paths (lines 1069-1084)
3. **Type safety**: UI schema format and JSON Schema format coexist — conversion logic required
4. **User experience**: If schema has many sections, form could be overwhelming (no pagination)
5. **Image upload**: `onImageUpload` callback must be provided, no fallback
6. **Model search**: ModelSearchField queries all available models on every keystroke (no debounce visible)

---

## Options

### Option A: Extend DynamicSkillForm for Media Skill Override Parameters
**Approach**: Add a second DynamicSkillForm when user selects "Media Skill Override" (imageSkill)
- **Pro**: Reuses existing, tested form rendering logic
- **Pro**: Consistent UX with article skill form
- **Con**: Two forms in modal might be cluttered
- **Effort**: ~50 lines of React code

### Option B: Create Tabbed Skill Configuration Panel
**Approach**: Separate tabs for Article Skill and Media Skill parameters
- **Pro**: Clean separation, no clutter
- **Pro**: Can expand to audio skill parameters later
- **Con**: More UI complexity
- **Effort**: ~150 lines (React tabs + form integration)

### Option C: Collapsible Advanced Skill Section
**Approach**: Add collapsible "Skill Advanced Options" section that renders Media Skill form
- **Pro**: Maintains current flat layout
- **Pro**: Optional advanced section (hidden by default)
- **Con**: Requires scroll on long forms
- **Effort**: ~100 lines

---

## Recommendation

**Implement Option A** (extend DynamicSkillForm for Media Skill Override):

1. Add new state: `mediaSkillParams: Record<string, any>`
2. Fetch media skill schema (similar to article skill schema fetch)
3. Render second DynamicSkillForm when Media Skill Override selected
4. Include media skill params in generateDraft mutation

**Rationale**:
- Minimal code, minimal risk
- Reuses proven pattern
- User can skip if not needed (both optional)
- Aligns with current modal UX
- Skill schemas already support this use case

---

## Open Questions

1. **Are Media Skill parameters currently supported by the backend?** Need to verify if `generateDraft` mutation accepts and uses media skill parameters.

2. **Should media skill parameters be optional?** (Assume yes — only include if selected)

3. **Should we filter media skills to only video/image generation types?** (Recommend yes — only show skills that can generate media)

4. **Icon mapping**: Are all 13 lucide icons in the iconMap sufficient, or should we expand support?

5. **Nested array fields**: DynamicSkillForm supports `itemFields` for array types. Are any skills using this? If so, test thoroughly.

6. **Error handling**: What happens if schema parsing fails? Currently returns `hasSchema: false` — is this the desired fallback behavior?

7. **Performance at scale**: If a skill has 50+ fields across 10 sections, does DynamicSkillForm performance degrade? (Test with large schema)

---

## Implementation Checklist

- [ ] Identify Media Skill parameters needed by backend
- [ ] Add `mediaSkillParams` state to AIDraftModal
- [ ] Fetch media skill schema (only if media skill selected)
- [ ] Render DynamicSkillForm for media skill (with `excludeFields` if needed)
- [ ] Include media skill params in generateDraft mutation
- [ ] Test with a media skill (e.g., "VEO Video Creator")
- [ ] Verify backend receives and uses media skill parameters
- [ ] Test cascading selects between article and media skill params
- [ ] Test image upload in media skill form
- [ ] Verify Thai language rendering for media skill form
