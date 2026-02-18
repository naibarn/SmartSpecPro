# Section 6: ChatView State Management

## Overview

Extend ChatView with skill form state management and auto-detection pause functionality.

## Files

- **Modify:** `apps/web/client/src/components/chat/ChatView.tsx`
- **Create:** `apps/web/client/src/components/chat/ChatView.skillForm.test.tsx`

## State Additions

### State Interface

```typescript
interface SkillFormState {
  skillId: string;
  skillName: string;
  schema: SkillInputSchema;
  values: Record<string, any>;
  isOpen: boolean;
  isMinimized: boolean;
}

// Add to ChatView state
const [skillFormState, setSkillFormState] = useState<SkillFormState | null>(null);
const [isFormOpen, setIsFormOpen] = useState(false);
```

## Implementation

### 1. State Management Functions

```typescript
// Open form for a skill
const openSkillForm = useCallback(async (skillId: string) => {
  // Fetch schema
  const schemaData = await utils.skills.getInputSchema.fetch({ skillId });
  
  if (!schemaData.hasSchema) {
    // Execute immediately if no schema
    executeSkill({ skillId, dynamicParams: {} });
    return;
  }
  
  // Get skill details
  const skill = await utils.skills.get.fetch({ id: skillId });
  
  setSkillFormState({
    skillId,
    skillName: skill.name,
    schema: schemaData.schema as SkillInputSchema,
    values: {},
    isOpen: true,
    isMinimized: false
  });
  
  setIsFormOpen(true);
  
  // Track analytics
  analytics.track('skill_form_opened', { skill_id: skillId });
}, []);

// Close form
const closeSkillForm = useCallback(() => {
  setSkillFormState(null);
  setIsFormOpen(false);
  
  analytics.track('skill_form_cancelled', { 
    skill_id: skillFormState?.skillId 
  });
}, [skillFormState]);

// Minimize form
const minimizeSkillForm = useCallback(() => {
  setSkillFormState(prev => prev ? { ...prev, isMinimized: true } : null);
}, []);

// Restore form
const restoreSkillForm = useCallback(() => {
  setSkillFormState(prev => prev ? { ...prev, isMinimized: false } : null);
}, []);
```

### 2. Auto-Detection Pause

```typescript
// Modify skill detection useEffect
useEffect(() => {
  if (!input || isFormOpen) return; // PAUSE when form open
  
  const timeout = setTimeout(() => {
    detectSkill({ message: input, conversationId });
  }, 800);
  
  return () => clearTimeout(timeout);
}, [input, isFormOpen, conversationId]); // Add isFormOpen dependency
```

### 3. Form Submission Handler

```typescript
const handleSkillFormSubmit = useCallback(async () => {
  if (!skillFormState) return;
  
  // Apply outputMapping if exists
  const mappedValues = skillFormState.schema.outputMapping
    ? Object.entries(skillFormState.schema.outputMapping).reduce(
        (acc, [fieldId, apiKey]) => {
          acc[apiKey] = skillFormState.values[fieldId];
          return acc;
        },
        {} as Record<string, any>
      )
    : skillFormState.values;
  
  try {
    await executeSkill({
      skillId: skillFormState.skillId,
      dynamicParams: mappedValues,
      conversationId
    });
    
    // Clear form on success
    closeSkillForm();
  } catch (error) {
    // Keep form open on error
    toast.error('Failed to execute skill');
  }
}, [skillFormState, conversationId, executeSkill, closeSkillForm]);
```

### 4. Render Integration

```tsx
return (
  <div className="chat-view">
    {/* Messages */}
    <MessageList messages={messages} />
    
    {/* Skill Form */}
    {skillFormState?.isOpen && !skillFormState.isMinimized && (
      <div className="mb-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{skillFormState.skillName}</CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={minimizeSkillForm}>
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={closeSkillForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ChatDynamicSkillForm
              schema={skillFormState.schema}
              values={skillFormState.values}
              onChange={(values) => 
                setSkillFormState(prev => prev ? { ...prev, values } : null)
              }
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeSkillForm}>
              Cancel
            </Button>
            <Button onClick={handleSkillFormSubmit}>
              Execute
            </Button>
          </CardFooter>
        </Card>
      </div>
    )}
    
    {/* Minimized Chip */}
    {skillFormState?.isMinimized && (
      <SkillInputChip
        skillName={skillFormState.skillName}
        onRestore={restoreSkillForm}
        onRemove={closeSkillForm}
      />
    )}
    
    {/* Chat Input */}
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={handleSend}
    />
  </div>
);
```

## Testing

```typescript
describe('ChatView Skill Form State', () => {
  it('opens form when skill has schema', async () => {
    // Select skill with schema
    // Expect form to open
    // Expect isFormOpen = true
  });

  it('executes immediately when skill has no schema', async () => {
    // Select skill without schema
    // Expect executeSkill called
    // Expect no form opened
  });

  it('pauses auto-detection when form open', () => {
    // Open form
    // Type message
    // Expect no skill detection triggered
  });

  it('resumes auto-detection when form closed', () => {
    // Open form
    // Close form
    // Type message
    // Expect skill detection works
  });

  it('minimizes and restores form', () => {
    // Open form
    // Click minimize
    // Expect chip shown
    // Click restore
    // Expect form shown
  });

  it('clears form on conversation change', () => {
    // Open form
    // Change conversation
    // Expect form cleared
  });
});
```

## Acceptance Criteria

- [ ] skillFormState tracks skill, schema, values, UI state
- [ ] isFormOpen flag controls auto-detection pause
- [ ] Auto-detection paused when form open
- [ ] Auto-detection resumes when form closed
- [ ] Form minimizes to chip
- [ ] Chip restores form
- [ ] Form clears on conversation change
- [ ] Analytics events tracked

## Dependencies

- Section 1: SkillSelector (for opening form)
- Section 3: ChatDynamicSkillForm (for rendering)
- Section 5: useSkillExecution (for submission)
