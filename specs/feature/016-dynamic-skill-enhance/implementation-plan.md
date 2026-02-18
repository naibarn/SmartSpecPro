# Implementation Plan: Dynamic Skill Input Enhancement for Chat

## Executive Summary

This plan implements dynamic skill input forms in the chat interface, enabling users to interact with skills that require structured input (like Create Image Prompt) directly within chat conversations. The implementation leverages existing Media Studio components while adding chat-specific adaptations for inline form rendering and mobile responsiveness.

## Phase Overview

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | 4 days | Core components (SkillSelector, ChatDynamicSkillForm, optionGroups) |
| Phase 2 | 3 days | Chat integration (state management, API extension, execution flow) |
| Phase 3 | 2 days | Slash command enhancement and quick shortcuts |
| Phase 4 | 2 days | Mobile experience, polish, and testing |

**Total Duration:** 11 working days

## Phase 1: Core Components (Days 1-4)

### Day 1: SkillSelector Component

**Objective:** Create a skill selection dialog optimized for the chat context.

**Implementation Details:**
The SkillSelector component will be a dialog that displays all user-visible skills with search and category filtering capabilities. Unlike the Media Studio version, this selector needs to indicate which skills have input schemas (requiring form fill-out) versus those that execute immediately.

**Key Design Decisions:**
- Use shadcn/ui Dialog as the base component
- Implement real-time search across skill names and descriptions
- Group skills by category with collapsible sections
- Add visual indicator (gear icon) for skills requiring form input
- Support keyboard navigation (arrow keys, Enter to select, Escape to close)

**Integration Points:**
- Fetch skills via `trpc.skills.getUserVisibleSkills`
- On skill selection, check for input schema via `trpc.skills.getInputSchema`
- Call `onSelect(skillId, hasSchema)` callback

### Day 2: Refactor DynamicSkillForm + Create Wrapper

**Objective:** Make DynamicSkillForm generic and create chat-optimized wrapper.

**Implementation Details:**
The existing DynamicSkillForm has tight coupling with media-specific features. We need to refactor it first:

**Step 1: Refactor DynamicSkillForm**
- Extract media-specific props (`referenceImages`, `onRemoveImage`, `onStyleAction`) into optional props
- Make image upload handling generic via `onImageUpload` callback
- Ensure backward compatibility with existing Media Studio usage
- Add `excludeFields` prop to hide fields not applicable to context

**Step 2: Create ChatDynamicSkillForm Wrapper**
- Create wrapper in `components/chat/skill/` directory
- Pass chat-appropriate callbacks to DynamicSkillForm
- Handle chat color scheme and spacing
- Support both inline (desktop) and modal (mobile) rendering modes

**Key Design Decisions:**
- Refactor DynamicSkillForm to be context-agnostic
- Create thin wrapper for chat-specific behavior
- Test backward compatibility with Media Studio

**Integration Points:**
- Import DynamicSkillForm from `components/media/DynamicSkillForm`
- Use existing upload service for imageUpload field type
- Connect to chat's tRPC client

**Image Upload Error Handling (Review Fix):**
- Add retry mechanism (3 attempts with exponential backoff)
- Show user notification on upload failure
- Prevent form submission if image uploads failed

### Day 3: optionGroups Implementation

**Objective:** Implement cascading select support in DynamicSkillForm.

**Implementation Details:**
Currently, DynamicSkillForm supports `dependsOn` for conditional visibility but does not implement `optionGroups` for cascading dropdown options. Many skills (like create-image-prompt) use this pattern where selecting a category changes the available sub-options.

**Implementation Strategy:**
1. Extend the select field rendering logic to check for `optionGroups`
2. When a field has `optionGroups` and `dependsOn`, filter options based on parent field value
3. Reset child field value when parent changes to an incompatible option
4. Maintain backward compatibility with existing `options` array

**Example Behavior:**
- User selects styleCategory = "F" (Anime/Manga)
- styleName dropdown updates to show only Anime-related options
- If user had selected a non-Anime styleName, it resets to empty

### Day 4: Hooks and Utilities

**Objective:** Create custom hooks for skill form state and execution.

**useSkillForm Hook:**
- Manages form values state
- Handles default values from schema
- Provides validate() function for required fields
- Returns { values, setValue, reset, isValid }

**useSkillExecution Hook:**
- Wraps `trpc.chat.executeSkill.useMutation()`
- Handles loading states
- Manages error handling and retry logic
- Returns { execute, isLoading, error }

**Integration Points:**
- Use in ChatDynamicSkillForm for state management
- Connect to chat's mutation cache for optimistic updates

## Phase 2: Chat Integration (Days 5-7)

### Day 5: Extend ChatView State Management

**Objective:** Add skill form state to ChatView component with auto-detection pause.

**State Additions:**
```typescript
interface SkillFormState {
  skillId: string;
  skillName: string;
  schema: SkillInputSchema;
  values: Record<string, any>;
  isOpen: boolean;
  isMinimized: boolean; // For chip display
}

// Also add flag for auto-detection control
const [isFormOpen, setIsFormOpen] = useState(false);
```

**Implementation Details:**
Add `skillFormState` to ChatView's state management. This state tracks:
- Which skill is currently being configured
- The loaded schema
- Current form values
- UI state (open/minimized/closed)

**Auto-Detection Pause (Review Fix):**
- Set `isFormOpen = true` when form opens
- Skip skill auto-detection when `isFormOpen === true`
- Resume auto-detection when form closes (`isFormOpen = false`)
- This prevents conflict between manual form and auto-detection

**State Transitions:**
- User selects skill → Load schema → Set state with isOpen: true, isFormOpen = true
- User minimizes → Set isMinimized: true (keep isFormOpen = true)
- User submits → Execute skill → Clear state, isFormOpen = false
- User cancels → Clear state, isFormOpen = false

**Accessibility (Review Fix):**
- Add ARIA labels to all form controls
- Ensure keyboard navigation works
- Manage focus when form opens/closes

### Day 6: API Extension - executeSkill

**Objective:** Extend the executeSkill mutation to accept dynamicParams.

**Backend Changes:**
In `apps/web/server/routers/chat.ts`, extend the executeSkill input schema:
- Add `dynamicParams: z.record(z.any()).optional()`
- Pass dynamicParams through to skillExecutor.executeSkill as extraParams

**Server-Side Validation (Uplift):**
Add validation for dynamicParams to ensure:
- All params match expected types from skill config
- No unknown/injected params are accepted
- File URLs are validated (must be from our domain)
- Log validation failures for monitoring

**Skill Executor Integration:**
The skillExecutor already supports `extraParams` in `SkillExecutionParams`. The executeSkill function passes these through to media generation services. No changes needed in skillExecutor.ts beyond ensuring the parameter flows correctly.

**Backward Compatibility (Uplift):**
- dynamicParams is optional
- Existing skill executions without dynamicParams continue to work
- Schema validation happens client-side before submission
- Test with existing clients to ensure no regression

### Day 7: Form Rendering and Submission Flow

**Objective:** Integrate form rendering into ChatView and implement submission.

**UI Integration:**
Render the ChatDynamicSkillForm component in ChatView at the appropriate location:
- Desktop: Inline, below chat input area
- Show above input when skillFormState.isOpen
- Show minimized chip when skillFormState.isMinimized
- Mobile breakpoint: 768px (below this uses bottom sheet)

**Submission Flow:**
1. User clicks "Execute" in form
2. Validate all required fields (inline validation)
3. Map values via outputMapping if defined in schema
4. Check if skill already executing (prevent concurrent)
5. Call executeSkillMutation with:
   - skillId
   - dynamicParams (mapped values)
   - conversationId
   - Optional: prompt from chat input (if user typed additional context)
6. Show loading state, disable form
7. On success: Add result as assistant message, clear form state
8. On error: Show error toast, keep form open for retry

**Analytics Events (Uplift):**
- Track: skill_form_opened, skill_form_submitted, skill_form_cancelled, skill_form_error
- Add user properties: skill_id, form_completion_time

## Phase 3: Slash Command Enhancement (Days 8-9)

### Day 8: Update SlashCommandMenu

**Objective:** Enhance slash command menu to handle skills with schemas.

**Implementation Details:**
Currently, SlashCommandMenu executes skills immediately when selected. We need to:
1. Load schema when skill is highlighted (or cache schema info)
2. Show indicator (⚙️) for skills requiring form input
3. On selection:
   - If has schema: Open form dialog (don't execute yet)
   - If no schema: Execute immediately (existing behavior)

**Optimization:**
- Consider prefetching schema on skill hover
- Or extend getSlashCommands to include hasSchema flag

### Day 9: Quick Skill Shortcuts

**Objective:** Add quick shortcuts for common skills.

**Implementation:**
Extend SlashCommandMenu to recognize and handle:
- `/image` → Opens form for image-generation skill
- `/video` → Opens form for video-generation skill
- `/prompt` → Opens form for prompt-enhancement skill

**Mapping:**
- Map shortcuts to skill IDs via configuration
- Allow easy addition of new shortcuts
- Show shortcuts in command menu help

## Phase 4: Mobile Experience and Polish (Days 10-11)

### Day 10: Mobile Bottom Sheet with Vaul

**Objective:** Implement mobile-optimized form display using vaul library.

**Implementation Details:**
On mobile devices (viewport < 768px), forms should display as bottom sheet modals:
- Use vaul library for native-feeling bottom sheet
- Full width, snap points at 50% and 90%
- Swipe down to dismiss with proper gesture handling
- Sticky header with title and close button
- Sticky footer with action buttons (Cancel, Execute)
- Scrollable content area for form fields
- Backdrop tap to dismiss

**Dependency:**
```bash
npm install vaul
```

**Responsive Logic:**
```typescript
const isMobile = useMediaQuery('(max-width: 768px)');
return isMobile 
  ? <MobileSkillFormVaul>...</MobileSkillFormVaul> 
  : <InlineForm>...</InlineForm>;
```

**Navigation Confirmation (Review Fix):**
- Detect unsaved changes in form
- Show confirmation dialog if user tries to navigate away
- Allow user to discard changes or stay on page

### Day 11: Testing, Error Handling, and Polish

**Testing:**
- Unit tests for new components
- Integration tests for end-to-end flow
- Mobile responsiveness testing
- Cross-browser testing

**Error Handling:**
- Inline field validation with error messages
- Toast notifications for API errors
- Graceful degradation for invalid schemas
- Retry mechanism for failed executions

**Polish:**
- Loading skeletons for schema loading
- Smooth animations for form open/close
- Keyboard shortcuts (Cmd/Ctrl+K for skill selector)
- Empty state for skill selector

## Risk Assessment and Mitigation

### Risk 1: State Management Complexity
**Risk:** Adding form state to ChatView could interfere with existing streaming and detection state.

**Impact:** High
**Likelihood:** Medium

**Mitigation:**
- Keep skill form state completely isolated from message/streaming state
- Clear form state on conversation change
- Use separate state variable (not nested in existing state)
- Thorough testing of state interactions

### Risk 2: optionGroups Implementation
**Risk:** Implementing cascading selects in DynamicSkillForm could break existing Media Studio usage.

**Impact:** Medium
**Likelihood:** Low

**Mitigation:**
- Maintain backward compatibility with existing `options` array
- Feature flag the optionGroups implementation initially
- Test Media Studio forms after changes
- Keep fallback to options if optionGroups not provided

### Risk 3: Mobile UX Issues
**Risk:** Forms may not fit well or be usable on mobile devices.

**Impact:** Medium
**Likelihood:** Medium

**Mitigation:**
- Use bottom sheet pattern for mobile (proven UI pattern)
- Test on actual mobile devices, not just emulator
- Ensure touch targets are large enough (min 44px)
- Support swipe gestures for dismissal

### Risk 4: Performance Degradation
**Risk:** Loading schemas and rendering forms could slow down chat interface.

**Impact:** Low
**Likelihood:** Medium

**Mitigation:**
- Cache schemas with React Query (5 minute stale time)
- Lazy load form components
- Use React.memo for form field components
- Debounce search in skill selector

## Data Safety

### Database Risk Assessment: LOW

This feature does not modify database schema. Changes are:
- Client-side UI components
- API parameter extension (optional field)
- Existing skill execution flow

**No migration required.**

### Backup/Restore: NOT REQUIRED

No database changes means no backup/restore needed. Rollback strategy:
- Feature flag disable
- Revert code changes via git
- No data loss risk

## Regression Prevention

### Existing Features to Protect

1. **Chat Message Flow:** Ensure normal chat messages work unchanged
2. **Skill Auto-Detection:** Existing skill detection continues to work
3. **Media Studio:** DynamicSkillForm changes don't break media studio
4. **Slash Commands:** Skills without schemas execute immediately as before

### Testing Strategy

**Unit Tests:**
- SkillSelector rendering and interaction
- ChatDynamicSkillForm field rendering
- optionGroups filtering logic
- Value mapping with outputMapping

**Integration Tests:**
- End-to-end skill execution with form
- Form submission → API → Message display
- Cascading select behavior
- Mobile responsive form

**E2E Tests:**
- Complete user journey
- Mobile experience
- Error scenarios

### Monitoring

- Track skill execution success rate
- Monitor form completion rate
- Log errors for schema loading failures
- Alert on execution errors

## Compatibility Notes

### Backward Compatibility

- `executeSkill` API: `dynamicParams` is optional parameter
- Skills without schemas: Continue to work exactly as before
- Chat message format: No changes to existing messages
- Database: No schema changes

### Forward Compatibility

- Schema format extensible for new field types
- API supports additional dynamicParams without changes
- Component structure allows for future enhancements

## Rollout Strategy

### Feature Flag

Use existing feature flag system:
```typescript
const isEnabled = useFeatureFlag('chat-dynamic-skill-forms');
```

### Gradual Rollout

1. **Week 1:** Enable for internal team only
2. **Week 2:** Enable for 10% of users
3. **Week 3:** Enable for 50% of users
4. **Week 4:** Enable for all users

### Rollback Plan

1. Disable feature flag (immediate)
2. Revert code if needed (within 1 hour)
3. No data migration needed

## Success Metrics

### Primary Metrics

- **Form Completion Rate:** % of opened forms that are submitted
- **Skill Execution Success:** % of form submissions that succeed
- **User Adoption:** % of users who use dynamic skill forms within 30 days

### Secondary Metrics

- **Time to Complete:** Average time from form open to submission
- **Error Rate:** % of form submissions that fail
- **Mobile Usage:** % of forms opened on mobile devices

### Monitoring Dashboard

Create dashboard tracking:
- Daily active users of dynamic forms
- Most used skills with forms
- Form completion funnel
- Error rates by skill type

## Documentation Requirements

### User Documentation

- Help article: "Using Skills in Chat"
- Video tutorial: "How to use dynamic skill forms"
- In-app tooltips for first-time users

### Developer Documentation

- API documentation for executeSkill with dynamicParams
- Component documentation for ChatDynamicSkillForm
- Schema format specification updates

### Admin Documentation

- How to create skills with input schemas
- Testing guide for new skills
- Troubleshooting common issues
