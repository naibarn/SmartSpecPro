# Implementation Plan with TDD Approach

## Overview

This document mirrors the implementation plan with test-driven development practices. Each phase includes test stubs and verification criteria.

## Phase 1: Core Components (Days 1-4)

### Day 1: SkillSelector Component

**Test-First Development:**

**Test File:** `SkillSelector.test.tsx`
```
Test Cases:
- [ ] Renders skill list from API data
- [ ] Search filters skills correctly
- [ ] Category grouping works
- [ ] Schema indicator (⚙️) shows for skills with forms
- [ ] Calls onSelect with correct args on click
- [ ] Keyboard navigation (arrow keys, enter, escape)
- [ ] Loading state while fetching
- [ ] Empty state when no skills
```

**Verification Criteria:**
- [ ] All tests pass
- [ ] Component renders in Storybook
- [ ] Accessibility audit passes (axe-core)

### Day 2: Refactor DynamicSkillForm + Create Wrapper

**Test-First Development:**

**Test File:** `DynamicSkillForm.test.tsx` (updated)
```
Test Cases:
- [ ] Renders all field types correctly
- [ ] optionGroups filtering works (cascading selects)
- [ ] dependsOn conditional visibility works
- [ ] Default values populate correctly
- [ ] onChange called with correct values
- [ ] Image upload triggers onImageUpload
- [ ] Required field validation
- [ ] Bilingual labels display correctly
```

**Test File:** `ChatDynamicSkillForm.test.tsx`
```
Test Cases:
- [ ] Wraps DynamicSkillForm correctly
- [ ] Applies chat styling
- [ ] Handles image upload with retry
- [ ] Error state on upload failure
- [ ] Backward compatibility with Media Studio
```

**Verification Criteria:**
- [ ] All tests pass
- [ ] Media Studio forms still work
- [ ] Image upload retry works (mock failure)

### Day 3: optionGroups Implementation

**Test-First Development:**

**Test File:** `optionGroups.test.ts`
```
Test Cases:
- [ ] Filters options based on parent value
- [ ] Resets child value when parent changes
- [ ] Handles missing optionGroups gracefully
- [ ] Works with dependsOn conditions
- [ ] Maintains selection when valid
```

**Verification Criteria:**
- [ ] Cascading selects work in CreateImagePrompt skill
- [ ] Style category → Style name flow works
- [ ] VFX category → VFX effect flow works

### Day 4: Hooks and Utilities

**Test-First Development:**

**Test File:** `useSkillForm.test.ts`
```
Test Cases:
- [ ] Initializes with default values from schema
- [ ] setValue updates specific field
- [ ] reset clears to defaults
- [ ] isValid true when required fields filled
- [ ] isValid false when required fields empty
```

**Test File:** `useSkillExecution.test.ts`
```
Test Cases:
- [ ] Calls executeSkillMutation with correct params
- [ ] Returns loading state during execution
- [ ] Returns error on failure
- [ ] Retries on network error (up to 3 times)
```

**Verification Criteria:**
- [ ] All hook tests pass
- [ ] Integration with tRPC works

---

## Phase 2: Chat Integration (Days 5-7)

### Day 5: Extend ChatView State Management

**Test-First Development:**

**Test File:** `ChatView.skillForm.test.tsx`
```
Test Cases:
- [ ] skillFormState initializes as null
- [ ] Opens form when skill selected
- [ ] Pauses auto-detection when form open
- [ ] Resumes auto-detection when form closed
- [ ] Minimizes to chip when minimize clicked
- [ ] Clears state on conversation change
```

**Verification Criteria:**
- [ ] Auto-detection stops when form opens
- [ ] Auto-detection resumes when form closes
- [ ] State cleared on navigation

### Day 6: API Extension - executeSkill

**Test-First Development:**

**Test File:** `chat.router.test.ts`
```
Test Cases:
- [ ] Accepts dynamicParams in input schema
- [ ] Validates dynamicParams types
- [ ] Rejects unknown params
- [ ] Passes dynamicParams to skillExecutor
- [ ] Backward compatible (no dynamicParams)
- [ ] Rate limiting still applies
```

**Verification Criteria:**
- [ ] API tests pass
- [ ] Old clients still work
- [ ] Validation rejects invalid params

### Day 7: Form Rendering and Submission Flow

**Test-First Development:**

**Test File:** `ChatView.formSubmission.test.tsx`
```
Test Cases:
- [ ] Renders form when skillFormState.isOpen
- [ ] Shows chip when minimized
- [ ] Validates required fields before submit
- [ ] Maps values via outputMapping
- [ ] Calls executeSkill with correct params
- [ ] Shows loading state during execution
- [ ] Adds result message on success
- [ ] Shows error toast on failure
- [ ] Clears form on success
- [ ] Keeps form open on failure
```

**Analytics Tests:**
```
Test Cases:
- [ ] Tracks skill_form_opened event
- [ ] Tracks skill_form_submitted event
- [ ] Tracks skill_form_cancelled event
- [ ] Tracks skill_form_error event
- [ ] Includes correct metadata in events
```

**Verification Criteria:**
- [ ] End-to-end flow works
- [ ] Analytics events fire correctly

---

## Phase 3: Slash Command Enhancement (Days 8-9)

### Day 8: Update SlashCommandMenu

**Test-First Development:**

**Test File:** `SlashCommandMenu.test.tsx`
```
Test Cases:
- [ ] Shows ⚙️ indicator for skills with schema
- [ ] Opens form for skills with schema
- [ ] Executes immediately for skills without schema
- [ ] Loading state while checking schema
- [ ] Handles schema load failure gracefully
```

**Verification Criteria:**
- [ ] Skills with forms show indicator
- [ ] Selection behavior correct

### Day 9: Quick Skill Shortcuts

**Test-First Development:**

**Test File:** `quickShortcuts.test.ts`
```
Test Cases:
- [ ] /image opens image-generation form
- [ ] /video opens video-generation form
- [ ] /prompt opens prompt-enhancement form
- [ ] Unknown shortcuts ignored
```

**Verification Criteria:**
- [ ] Shortcuts work as expected
- [ ] Documentation updated

---

## Phase 4: Mobile Experience and Polish (Days 10-11)

### Day 10: Mobile Bottom Sheet with Vaul

**Test-First Development:**

**Test File:** `MobileSkillForm.test.tsx`
```
Test Cases:
- [ ] Renders as bottom sheet on mobile
- [ ] Inline on desktop
- [ ] Swipe down dismisses
- [ ] Backdrop tap dismisses
- [ ] Snap points work (50%, 90%)
- [ ] Sticky header/footer visible
```

**Navigation Confirmation Tests:**
```
Test Cases:
- [ ] Detects unsaved changes
- [ ] Shows confirmation on navigate
- [ ] Allows discard changes
- [ ] Allows stay on page
```

**Verification Criteria:**
- [ ] Mobile UX feels native
- [ ] Confirmation dialog works

### Day 11: Testing, Error Handling, and Polish

**Test-First Development:**

**Integration Tests:**
```
Test Cases:
- [ ] Complete flow: select → fill → submit → result
- [ ] Mobile complete flow
- [ ] Error recovery flow
- [ ] Concurrent execution prevention
```

**E2E Tests:**
```
Test Cases:
- [ ] User can complete skill with form
- [ ] User can cancel form
- [ ] Error handling works end-to-end
- [ ] Mobile responsive
```

**Verification Criteria:**
- [ ] All tests pass (unit, integration, e2e)
- [ ] Code coverage > 80%
- [ ] Accessibility audit passes
- [ ] Performance benchmarks met

---

## Test Infrastructure

### Required Test Setup

```typescript
// Test utilities
const renderWithProviders = (component) => {
  return render(
    <TRPCProvider>
      <QueryClientProvider>
        {component}
      </QueryClientProvider>
    </TRPCProvider>
  );
};

// Mock services
const mockUploadService = {
  upload: jest.fn(),
  retry: jest.fn(),
};

const mockAnalytics = {
  track: jest.fn(),
};
```

### Coverage Requirements

| Category | Target |
|----------|--------|
| Unit Tests | 80% |
| Integration Tests | Key flows |
| E2E Tests | Critical paths |

### Test Commands

```bash
# Unit tests
npm test -- --coverage --watchAll=false

# Integration tests
npm test -- --testPathPattern="integration"

# E2E tests
npm run test:e2e
```

## Verification Checklist

### Pre-Deployment

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests pass
- [ ] Code coverage > 80%
- [ ] Accessibility audit passes
- [ ] Performance audit passes
- [ ] Security review completed

### Post-Deployment

- [ ] Feature flag enabled for team
- [ ] Monitoring dashboards active
- [ ] Error tracking configured
- [ ] Analytics events firing
