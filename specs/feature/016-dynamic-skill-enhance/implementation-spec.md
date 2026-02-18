# Implementation Specification: Dynamic Skill Input Enhancement for Chat

## Overview

Enable dynamic skill input forms in the chat interface, matching the functionality available in Media Studio. Users can select skills and fill out dynamic forms based on each skill's input schema, with support for cascading selects, conditional fields, and image uploads.

## Goals

1. **Parity with Media Studio**: Chat interface supports dynamic skill input forms
2. **Skill Discovery**: Users can easily find and select skills via slash commands or UI button
3. **Dynamic Form Rendering**: Forms render automatically based on skill input schema
4. **Cascading Selects**: Support optionGroups for dependent dropdowns
5. **Mobile Support**: Full-screen modal for forms on mobile devices
6. **Context Preservation**: Skill results saved as messages in conversation

## Architecture

### Component Structure

```
apps/web/client/src/components/chat/skill/
├── index.ts                    # Exports
├── SkillSelector.tsx           # Dialog for skill selection
├── ChatDynamicSkillForm.tsx    # Wrapper for DynamicSkillForm (chat context)
├── SkillInputChip.tsx          # Chip showing active skill input
├── SkillCommandButton.tsx      # Button to open skill selector
├── useSkillForm.ts             # Hook for skill form state
└── useSkillExecution.ts        # Hook for skill execution
```

### State Management

**ChatView.tsx additions:**
```typescript
const [skillFormState, setSkillFormState] = useState<{
  skillId: string;
  skillName: string;
  schema: SkillInputSchema;
  values: Record<string, any>;
  isOpen: boolean;
} | null>(null);
```

### API Changes

**chat.ts router - executeSkill mutation:**
```typescript
input: z.object({
  skillId: z.string(),
  prompt: z.string().optional(),
  dynamicParams: z.record(z.any()).optional(), // NEW
  conversationId: z.number(),
  // ... existing fields
})
```

### Form Display Modes

**Desktop:** Inline form below chat input
**Mobile:** Full-screen bottom sheet modal

## Detailed Design

### 1. Skill Selection

**Slash Command Menu:**
- Extend existing `SlashCommandMenu.tsx`
- Show indicator (⚙️) for skills with input schema
- On select: Check if skill has schema via `getInputSchema`
- If has schema: Open form dialog
- If no schema: Execute immediately (current behavior)

**Skill Command Button:**
- Add button to chat input area (right of attach button)
- Opens `SkillSelector` dialog
- Shows all user-visible skills with search/filter

### 2. Dynamic Form Rendering

**ChatDynamicSkillForm Component:**
- Wraps existing `DynamicSkillForm` from media components
- Adds chat-specific styling and behavior
- Handles mobile responsive (inline vs modal)

**Enhanced DynamicSkillForm:**
- Implement `optionGroups` support for cascading selects
- Maintain backward compatibility with existing media studio usage

**optionGroups Implementation:**
```typescript
// In renderField for select type
const options = field.optionGroups && field.dependsOn
  ? field.optionGroups[values[field.dependsOn.field]] || []
  : field.options || [];

// Reset child value when parent changes
useEffect(() => {
  if (field.dependsOn && field.optionGroups) {
    const parentValue = values[field.dependsOn.field];
    const validOptions = field.optionGroups[parentValue] || [];
    const currentValue = values[field.id];
    if (!validOptions.some(opt => opt.value === currentValue)) {
      updateValue(field.id, '');
    }
  }
}, [values[field.dependsOn?.field]]);
```

### 3. Form Submission

**Flow:**
1. User fills form
2. Click "Execute" or "Send"
3. Serialize form values via `outputMapping`
4. Call `executeSkillMutation` with `dynamicParams`
5. Show loading state
6. Add result as assistant message
7. Clear form state

**Value Mapping:**
```typescript
// Apply outputMapping if exists
const mappedValues = schema.outputMapping
  ? Object.entries(schema.outputMapping).reduce((acc, [fieldId, apiKey]) => {
      acc[apiKey] = values[fieldId];
      return acc;
    }, {} as Record<string, any>)
  : values;
```

### 4. Image Upload

**Implementation:**
- Reuse existing upload service
- Store uploaded URLs in form values
- Display thumbnails in form

### 5. Mobile Experience

**Bottom Sheet Modal:**
- Use shadcn/ui Sheet component
- Full height on mobile
- Swipe to dismiss
- Sticky footer with action buttons

## Technical Specifications

### Field Types Supported

| Type | Component | Notes |
|------|-----------|-------|
| text | Input | Single line text |
| textarea | Textarea | Multi-line, configurable rows |
| select | Select | Dropdown with options |
| multiselect | BadgeGroup | Multiple selection as badges |
| number | Input number | Numeric input with min/max |
| slider | Slider | Numeric with visual slider |
| boolean | Switch | Toggle on/off |
| imageUpload | ImageUpload | Multiple images with preview |

### Conditional Fields

**dependsOn Support:**
- Simple equality: `{ field: "category", value: "A" }`
- Not empty: `{ field: "category", notEmpty: true }`
- Field hidden when condition not met

### Bilingual Support

- All labels, placeholders, help text support EN/TH
- Use `labelTh`, `placeholderTh`, `helpTextTh` from schema
- Default to EN if TH not available

## Data Flow

```
User selects skill
    ↓
Load schema via getInputSchema
    ↓
Render ChatDynamicSkillForm
    ↓
User fills form (with conditional fields, cascading selects)
    ↓
Submit → Map values via outputMapping
    ↓
Call executeSkill with dynamicParams
    ↓
Execute via skillExecutor
    ↓
Add result as assistant message
```

## Error Handling

**Validation Errors:**
- Inline field validation (required fields)
- Show error message under field
- Prevent submit if invalid

**Execution Errors:**
- Toast notification for API errors
- Keep form open for retry
- Log error details to console

**Schema Errors:**
- Graceful degradation if schema invalid
- Show fallback simple form or error message

## Testing Requirements

### Unit Tests
- SkillSelector: Search, filter, selection
- ChatDynamicSkillForm: Render all field types
- Form validation logic
- Value mapping with outputMapping

### Integration Tests
- End-to-end skill execution flow
- Form submission → API call → Message display
- Cascading selects behavior
- Image upload in form

### E2E Tests
- Complete user journey: Select skill → Fill form → Submit → See result
- Mobile responsive form
- Error scenarios

## Rollout Plan

### Phase 1: Core Components (Days 1-4)
- Create SkillSelector component
- Create ChatDynamicSkillForm wrapper
- Implement optionGroups for cascading selects
- Create useSkillForm hook

### Phase 2: Chat Integration (Days 5-7)
- Extend ChatView with skillFormState
- Integrate form rendering in chat UI
- Extend executeSkill API with dynamicParams
- Connect form submission to execution

### Phase 3: Slash Commands (Days 8-9)
- Update SlashCommandMenu with schema indicator
- Open form when selecting skill with schema
- Quick skill shortcuts (/image, /video, /prompt)

### Phase 4: Polish & Mobile (Days 10-11)
- Mobile bottom sheet modal
- Loading states and animations
- Error handling improvements
- Keyboard shortcuts (Cmd/Ctrl+K)

## Dependencies

### Existing Components to Reuse
- `DynamicSkillForm` from media components
- `SkillSelectorDialog` pattern from media
- `SlashCommandMenu` existing logic
- tRPC hooks and mutations

### New Components to Create
- `ChatDynamicSkillForm` (wrapper)
- `SkillSelector` (chat-specific)
- `SkillInputChip`
- `SkillCommandButton`

## Security Considerations

- Validate all dynamicParams server-side before execution
- Maintain existing rate limiting per skill type
- File upload validation (type, size)
- User permission check for skill access

## Performance Considerations

- Cache skill schema for 5 minutes (React Query)
- Lazy load form components
- Debounce search in skill selector
- Optimize re-renders with React.memo

## Backward Compatibility

- executeSkill API: dynamicParams is optional
- Skills without schema work as before
- No changes to existing message format
- Feature flag for gradual rollout
