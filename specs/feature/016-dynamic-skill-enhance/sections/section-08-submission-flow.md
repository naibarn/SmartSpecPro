# Section 8: Form Submission Flow

## Overview

Implement the end-to-end form submission flow from ChatView through API to result display.

## Files

- **Modify:** `apps/web/client/src/components/chat/ChatView.tsx`
- **Create:** `apps/web/client/src/components/chat/skill/SkillInputChip.tsx`
- **Create:** `apps/web/client/src/components/chat/ChatView.submission.test.tsx`

## Components

### 1. SkillInputChip Component

```typescript
// SkillInputChip.tsx
interface SkillInputChipProps {
  skillName: string;
  fieldCount?: number;
  onRestore: () => void;
  onRemove: () => void;
}

export function SkillInputChip({
  skillName,
  fieldCount,
  onRestore,
  onRemove
}: SkillInputChipProps) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm mb-3">
      <Settings className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">{skillName}</span>
      {fieldCount && (
        <span className="text-muted-foreground">
          ({fieldCount} fields)
        </span>
      )}
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onRestore}
          className="p-1 hover:bg-primary/20 rounded"
          title="Edit"
        >
          <Edit2 className="h-3 w-3" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 hover:bg-destructive/20 rounded text-destructive"
          title="Remove"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
```

### 2. Submission Handler

```typescript
// In ChatView.tsx
const handleSkillFormSubmit = useCallback(async () => {
  if (!skillFormState) return;
  
  // Validate form
  const isValid = validateForm(skillFormState.schema, skillFormState.values);
  if (!isValid) {
    toast.error('Please fill in all required fields');
    return;
  }
  
  // Prevent concurrent execution
  if (isExecuting) {
    toast.info('Please wait for the current operation to complete');
    return;
  }
  
  setIsExecuting(true);
  
  try {
    // Apply outputMapping
    const mappedValues = applyOutputMapping(
      skillFormState.values,
      skillFormState.schema.outputMapping
    );
    
    // Execute skill
    const result = await executeSkillMutation.mutateAsync({
      skillId: skillFormState.skillId,
      prompt: input, // Include chat input as context
      dynamicParams: mappedValues,
      conversationId
    });
    
    if (result.success) {
      // Add user message with skill context
      await sendMessageMutation.mutateAsync({
        conversationId,
        content: `[Using ${skillFormState.skillName}]`,
        skillContext: {
          skillId: skillFormState.skillId,
          params: mappedValues
        }
      });
      
      // Clear input and form
      setInput('');
      closeSkillForm();
      
      toast.success('Skill executed successfully');
    } else {
      toast.error(result.error || 'Skill execution failed');
    }
  } catch (error) {
    toast.error('Failed to execute skill');
    console.error('Skill execution error:', error);
  } finally {
    setIsExecuting(false);
  }
}, [skillFormState, input, conversationId, executeSkillMutation, sendMessageMutation]);
```

### 3. Output Mapping

```typescript
function applyOutputMapping(
  values: Record<string, any>,
  outputMapping?: Record<string, string>
): Record<string, any> {
  if (!outputMapping) return values;
  
  return Object.entries(outputMapping).reduce(
    (acc, [fieldId, apiKey]) => {
      const value = values[fieldId];
      
      // Handle nested keys (e.g., "typography.font")
      if (apiKey.includes('.')) {
        const keys = apiKey.split('.');
        let current = acc;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!current[key]) current[key] = {};
          current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
      } else {
        acc[apiKey] = value;
      }
      
      return acc;
    },
    {} as Record<string, any>
  );
}
```

### 4. Form Validation

```typescript
function validateForm(
  schema: SkillInputSchema,
  values: Record<string, any>
): boolean {
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.required) {
        const value = values[field.id];
        
        if (value === undefined || value === null || value === '') {
          return false;
        }
        
        // Array fields
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
      }
    }
  }
  
  return true;
}
```

### 5. Loading State

```tsx
{isExecuting && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>Executing {skillFormState.skillName}...</span>
  </div>
)}
```

### 6. Error Display

```tsx
{executeError && (
  <Alert variant="destructive" className="mb-4">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Execution Failed</AlertTitle>
    <AlertDescription>
      {executeError.message}
      <Button 
        variant="link" 
        onClick={handleSkillFormSubmit}
        className="ml-2"
      >
        Retry
      </Button>
    </AlertDescription>
  </Alert>
)}
```

## Testing

```typescript
describe('Form Submission Flow', () => {
  it('submits form with mapped values', async () => {
    // Fill form
    // Submit
    // Expect executeSkill called with mapped values
  });

  it('prevents submission when validation fails', async () => {
    // Leave required field empty
    // Submit
    // Expect validation error
    // Expect executeSkill not called
  });

  it('prevents concurrent execution', async () => {
    // Submit form
    // Submit again while loading
    // Expect second submit ignored
  });

  it('applies outputMapping correctly', () => {
    const values = { userIdea: 'test', style: 'A' };
    const mapping = { userIdea: 'prompt', style: 'style_name' };
    
    const result = applyOutputMapping(values, mapping);
    
    expect(result.prompt).toBe('test');
    expect(result.style_name).toBe('A');
  });

  it('handles nested outputMapping', () => {
    const values = { font: 'Arial' };
    const mapping = { font: 'typography.fontFamily' };
    
    const result = applyOutputMapping(values, mapping);
    
    expect(result.typography.fontFamily).toBe('Arial');
  });

  it('clears form on success', async () => {
    // Submit form
    // Mock success
    // Expect form closed
    // Expect skillFormState null
  });

  it('keeps form open on error', async () => {
    // Submit form
    // Mock error
    // Expect form still open
    // Expect error displayed
  });
});
```

## Acceptance Criteria

- [ ] Form validates before submission
- [ ] outputMapping applied correctly
- [ ] Concurrent execution prevented
- [ ] Loading state shown during execution
- [ ] Error displayed on failure with retry
- [ ] Form clears on success
- [ ] Form stays open on error
- [ ] SkillInputChip shows when minimized

## Analytics Events

```typescript
// Track submission flow
analytics.track('skill_form_submit_clicked', {
  skill_id: skillFormState.skillId,
  field_count: Object.keys(skillFormState.values).length
});

analytics.track('skill_form_submit_success', {
  skill_id: result.skillId,
  credits_used: result.creditsUsed,
  execution_time_ms
});

analytics.track('skill_form_submit_error', {
  skill_id: skillFormState.skillId,
  error_type: error.code,
  error_message: error.message
});
```

## Dependencies

- Section 6: ChatView State Management
- Section 7: API Extension
