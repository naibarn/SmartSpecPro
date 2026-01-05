# Phase 3: Natural Language & Execution - Plan

**Duration:** Simplified to 2-3 hours (from 4 weeks)  
**Focus:** Core natural language features only

---

## 🎯 Objectives

1. Add natural language input component
2. Integrate OpenAI for command translation
3. Add execution queue UI
4. Improve workflow runner

---

## 📋 Tasks (Simplified)

### Task 3.1: Natural Language Input Component
- [ ] Create NaturalLanguageInput component
- [ ] Add text input with submit button
- [ ] Show loading state during translation
- [ ] Display translated command
- [ ] Add execute button

### Task 3.2: OpenAI Integration
- [ ] Create OpenAI service module
- [ ] Add command translation function
- [ ] Use gpt-4.1-mini model
- [ ] Handle errors gracefully

### Task 3.3: Enhanced Workflow Runner
- [ ] Add natural language input section
- [ ] Show command translation result
- [ ] Add quick execute button
- [ ] Improve output display

### Task 3.4: Testing & Documentation
- [ ] Test natural language translation
- [ ] Test workflow execution from NL
- [ ] Update documentation
- [ ] Commit changes

---

## 🚀 Implementation Plan

### 1. OpenAI Service (30 min)
```typescript
// src/services/openai.ts
- translateToCommand(naturalLanguage: string): Promise<string>
- Uses OpenAI API with gpt-4.1-mini
- System prompt for command translation
```

### 2. NaturalLanguageInput Component (45 min)
```typescript
// src/components/NaturalLanguageInput.tsx
- Text input for natural language
- Translate button
- Show translated command
- Execute button
- Loading & error states
```

### 3. Enhanced Runner (30 min)
```typescript
// Update WorkflowRunner.tsx
- Add NL input section at top
- Show translation result
- Quick execute from NL
```

### 4. Testing & Docs (30 min)
- Test NL → Command → Execute flow
- Update README
- Commit

---

## 📊 Success Criteria

- [ ] User can input natural language
- [ ] System translates to workflow command
- [ ] User can execute translated command
- [ ] Error handling works
- [ ] Documentation updated

---

## 🎓 Notes

**Simplified from original plan:**
- No multi-tab execution (keep single tab)
- No execution queue (simple sequential)
- No workflow templates (future)
- Focus on core NL translation only

**Why simplified:**
- Core value is NL translation
- Multi-tab adds complexity
- Queue can be added later
- Templates need more design

---

## ⏱️ Timeline

```
Task 3.1: NL Input Component      ████████░░ 45 min
Task 3.2: OpenAI Integration      ████░░░░░░ 30 min
Task 3.3: Enhanced Runner         ████░░░░░░ 30 min
Task 3.4: Testing & Docs          ████░░░░░░ 30 min
─────────────────────────────────────────────
Total:                            ~2-3 hours
```

---

**Status:** Planning Complete  
**Next:** Implementation
