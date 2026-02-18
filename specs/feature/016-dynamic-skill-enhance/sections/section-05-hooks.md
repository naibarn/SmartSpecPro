# Section 5: Hooks (useSkillForm, useSkillExecution)

## Overview

Create custom hooks for skill form state management and skill execution.

## Files

- **Create:** `apps/web/client/src/components/chat/skill/hooks/useSkillForm.ts`
- **Create:** `apps/web/client/src/components/chat/skill/hooks/useSkillExecution.ts`
- **Create:** `apps/web/client/src/components/chat/skill/hooks/useSkillForm.test.ts`
- **Create:** `apps/web/client/src/components/chat/skill/hooks/useSkillExecution.test.ts`

## useSkillForm Hook

### Interface

```typescript
interface UseSkillFormOptions {
  schema: SkillInputSchema;
  initialValues?: Record<string, any>;
}

interface UseSkillFormReturn {
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  setValues: (values: Record<string, any>) => void;
  reset: () => void;
  isValid: boolean;
  errors: Record<string, string>;
  validate: () => boolean;
}
```

### Implementation

```typescript
export function useSkillForm(options: UseSkillFormOptions): UseSkillFormReturn {
  const { schema, initialValues } = options;
  
  // Extract default values from schema
  const defaultValues = useMemo(() => {
    const defaults: Record<string, any> = {};
    
    schema.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.default !== undefined) {
          defaults[field.id] = field.default;
        }
      });
    });
    
    return { ...defaults, ...initialValues };
  }, [schema, initialValues]);
  
  const [values, setValues] = useState<Record<string, any>>(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const setValue = useCallback((fieldId: string, value: any) => {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    // Clear error when value changes
    setErrors(prev => { 
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);
  
  const reset = useCallback(() => {
    setValues(defaultValues);
    setErrors({});
  }, [defaultValues]);
  
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;
    
    schema.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.required) {
          const value = values[field.id];
          if (value === undefined || value === null || value === '') {
            newErrors[field.id] = `${field.label} is required`;
            valid = false;
          }
        }
      });
    });
    
    setErrors(newErrors);
    return valid;
  }, [schema, values]);
  
  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0;
  }, [errors]);
  
  return {
    values,
    setValue,
    setValues,
    reset,
    isValid,
    errors,
    validate
  };
}
```

## useSkillExecution Hook

### Interface

```typescript
interface UseSkillExecutionOptions {
  conversationId: number;
}

interface UseSkillExecutionReturn {
  execute: (params: {
    skillId: string;
    prompt?: string;
    dynamicParams: Record<string, any>;
  }) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  result: SkillExecutionResult | null;
}
```

### Implementation

```typescript
export function useSkillExecution(options: UseSkillExecutionOptions): UseSkillExecutionReturn {
  const { conversationId } = options;
  const [result, setResult] = useState<SkillExecutionResult | null>(null);
  
  const utils = trpc.useUtils();
  
  const mutation = trpc.chat.executeSkill.useMutation({
    onSuccess: (data) => {
      setResult(data);
      // Invalidate messages to show result
      utils.chat.getMessages.invalidate({ conversationId });
      
      // Track analytics
      analytics.track('skill_form_submitted', {
        skill_id: data.skillId,
        conversation_id: conversationId,
        success: data.success
      });
    },
    onError: (error) => {
      analytics.track('skill_form_error', {
        conversation_id: conversationId,
        error: error.message
      });
    }
  });
  
  const execute = useCallback(async (params: {
    skillId: string;
    prompt?: string;
    dynamicParams: Record<string, any>;
  }) => {
    setResult(null);
    
    await mutation.mutateAsync({
      skillId: params.skillId,
      prompt: params.prompt,
      dynamicParams: params.dynamicParams,
      conversationId
    });
  }, [conversationId, mutation]);
  
  return {
    execute,
    isLoading: mutation.isPending,
    error: mutation.error,
    result
  };
}
```

## Testing

### useSkillForm Tests

```typescript
describe('useSkillForm', () => {
  const mockSchema: SkillInputSchema = {
    sections: [{
      id: 'basic',
      title: 'Basic',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'age', type: 'number', label: 'Age', default: 18 }
      ]
    }]
  };

  it('initializes with default values', () => {
    const { result } = renderHook(() => useSkillForm({ schema: mockSchema }));
    expect(result.current.values.age).toBe(18);
  });

  it('sets value correctly', () => {
    const { result } = renderHook(() => useSkillForm({ schema: mockSchema }));
    act(() => result.current.setValue('name', 'John'));
    expect(result.current.values.name).toBe('John');
  });

  it('validates required fields', () => {
    const { result } = renderHook(() => useSkillForm({ schema: mockSchema }));
    const valid = result.current.validate();
    expect(valid).toBe(false);
    expect(result.current.errors.name).toBeDefined();
  });

  it('clears errors on value change', () => {
    const { result } = renderHook(() => useSkillForm({ schema: mockSchema }));
    result.current.validate();
    act(() => result.current.setValue('name', 'John'));
    expect(result.current.errors.name).toBeUndefined();
  });

  it('resets to defaults', () => {
    const { result } = renderHook(() => useSkillForm({ schema: mockSchema }));
    act(() => result.current.setValue('name', 'John'));
    act(() => result.current.reset());
    expect(result.current.values.name).toBeUndefined();
    expect(result.current.values.age).toBe(18);
  });
});
```

### useSkillExecution Tests

```typescript
describe('useSkillExecution', () => {
  it('calls executeSkill mutation', async () => {
    const { result } = renderHook(() => 
      useSkillExecution({ conversationId: 123 })
    );
    
    await act(async () => {
      await result.current.execute({
        skillId: 'test-skill',
        dynamicParams: { key: 'value' }
      });
    });
    
    // Expect mutation called with correct params
  });

  it('returns loading state', () => {
    const { result } = renderHook(() => 
      useSkillExecution({ conversationId: 123 })
    );
    
    act(() => {
      result.current.execute({ skillId: 'test', dynamicParams: {} });
    });
    
    expect(result.current.isLoading).toBe(true);
  });

  it('tracks analytics on success', async () => {
    // Mock analytics
    // Execute skill
    // Expect analytics.track called
  });
});
```

## Acceptance Criteria

- [ ] useSkillForm initializes with schema defaults
- [ ] setValue updates single field
- [ ] validate checks required fields
- [ ] errors cleared on value change
- [ ] reset returns to defaults
- [ ] useSkillExecution calls executeSkill mutation
- [ ] Returns loading, error, result states
- [ ] Invalidates messages cache on success
- [ ] Tracks analytics events

## Dependencies

- tRPC client setup
- Analytics service
- Testing: @testing-library/react-hooks
