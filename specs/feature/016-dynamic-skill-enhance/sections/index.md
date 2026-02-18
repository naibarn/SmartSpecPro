## SECTION_MANIFEST

```yaml
feature: Dynamic Skill Input Enhancement for Chat
version: 1.0.0
total_sections: 11
generated_at: 2026-02-18
```

# Section Index

## Sections Overview

| # | Section | File | Dependencies | Est. Hours |
|---|---------|------|--------------|------------|
| 1 | SkillSelector Component | section-01-skill-selector.md | None | 8 |
| 2 | DynamicSkillForm Refactor | section-02-form-refactor.md | None | 8 |
| 3 | ChatDynamicSkillForm | section-03-chat-form.md | Section 2 | 6 |
| 4 | optionGroups Implementation | section-04-option-groups.md | Section 2 | 6 |
| 5 | Hooks (useSkillForm, useSkillExecution) | section-05-hooks.md | None | 6 |
| 6 | ChatView State Management | section-06-chat-state.md | Section 1, 3, 5 | 6 |
| 7 | API Extension (executeSkill) | section-07-api-extension.md | None | 6 |
| 8 | Form Submission Flow | section-08-submission-flow.md | Section 6, 7 | 6 |
| 9 | Slash Command Enhancement | section-09-slash-commands.md | Section 1 | 4 |
| 10 | Mobile Bottom Sheet | section-10-mobile-sheet.md | Section 3 | 6 |
| 11 | Testing and Polish | section-11-testing.md | All | 8 |

## Phase Mapping

### Phase 1: Core Components
- Section 1: SkillSelector
- Section 2: DynamicSkillForm Refactor
- Section 3: ChatDynamicSkillForm
- Section 4: optionGroups Implementation
- Section 5: Hooks

### Phase 2: Chat Integration
- Section 6: ChatView State Management
- Section 7: API Extension
- Section 8: Form Submission Flow

### Phase 3: Slash Commands
- Section 9: Slash Command Enhancement

### Phase 4: Mobile & Polish
- Section 10: Mobile Bottom Sheet
- Section 11: Testing and Polish

## Dependencies Graph

```
Section 1 (SkillSelector)
    ↓
Section 6 (Chat State) ← Section 3 (Chat Form)
    ↓                       ↑
Section 8 (Submission) ← Section 5 (Hooks)
    ↓
Section 11 (Testing)

Section 2 (Form Refactor)
    ↓
Section 3 (Chat Form)
    ↓
Section 4 (optionGroups)
    ↓
Section 10 (Mobile)

Section 7 (API) ←→ Section 8 (Submission)

Section 9 (Slash) → Section 6 (Chat State)
```

## Execution Order

**Recommended Implementation Order:**
1. Section 2 (Form Refactor) - Base component
2. Section 4 (optionGroups) - Feature addition
3. Section 1 (SkillSelector) - UI component
4. Section 5 (Hooks) - Logic
5. Section 3 (Chat Form) - Integration
6. Section 7 (API Extension) - Backend
7. Section 6 (Chat State) - State management
8. Section 8 (Submission Flow) - End-to-end
9. Section 9 (Slash Commands) - Enhancement
10. Section 10 (Mobile Sheet) - Mobile
11. Section 11 (Testing) - Verification

## Section File Locations

All section files are in: `specs/feature/016-dynamic-skill-enhance/sections/`

Naming convention: `section-XX-<kebab-name>.md`
