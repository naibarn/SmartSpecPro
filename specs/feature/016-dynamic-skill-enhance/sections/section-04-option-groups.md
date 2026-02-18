# Section 4: optionGroups Implementation

## Overview

Implement cascading select support in DynamicSkillForm using optionGroups. When a parent field changes, child field options update accordingly.

## Files

- **Modify:** `apps/web/client/src/components/media/DynamicSkillForm.tsx`
- **Create:** `apps/web/client/src/components/media/optionGroups.test.ts`

## Schema Example

```json
{
  "id": "styleName",
  "type": "select",
  "label": "Style Variation",
  "dependsOn": {
    "field": "styleCategory",
    "notEmpty": true
  },
  "optionGroups": {
    "A": [
      { "value": "Photorealistic", "label": "Photorealistic" },
      { "value": "Ultra-realistic", "label": "Ultra-realistic" }
    ],
    "B": [
      { "value": "Hollywood cinematic", "label": "Hollywood cinematic" }
    ]
  }
}
```

## Implementation

### 1. Type Updates

```typescript
// Add to SkillInputField
interface SkillInputField {
  // ... existing fields
  optionGroups?: Record<string, SelectOption[]>;
}
```

### 2. Option Resolution Function

```typescript
function useFieldOptions(
  field: SkillInputField, 
  values: Record<string, any>
): SelectOption[] {
  return useMemo(() => {
    // If field has static options, use them
    if (field.options) {
      return field.options;
    }
    
    // If field has optionGroups and dependsOn, filter by parent value
    if (field.optionGroups && field.dependsOn) {
      const parentValue = values[field.dependsOn.field];
      
      // Handle notEmpty condition
      if (field.dependsOn.notEmpty && !parentValue) {
        return [];
      }
      
      // Handle value condition
      if (field.dependsOn.value && parentValue !== field.dependsOn.value) {
        return [];
      }
      
      return field.optionGroups[parentValue] || [];
    }
    
    return [];
  }, [field, values]);
}
```

### 3. Value Reset Effect

```typescript
function useCascadingReset(
  field: SkillInputField,
  values: Record<string, any>,
  updateValue: (fieldId: string, value: any) => void
) {
  useEffect(() => {
    if (!field.dependsOn || !field.optionGroups) return;
    
    const parentValue = values[field.dependsOn.field];
    const currentValue = values[field.id];
    
    // If parent changed, check if current value is still valid
    const validOptions = field.optionGroups[parentValue] || [];
    const isValid = validOptions.some(opt => opt.value === currentValue);
    
    if (!isValid && currentValue) {
      // Reset to empty or first option
      updateValue(field.id, '');
    }
  }, [values[field.dependsOn?.field], field.id]);
}
```

### 4. Render Integration

```tsx
const renderSelect = (field: SkillInputField) => {
  const options = useFieldOptions(field, values);
  
  // Apply cascading reset
  useCascadingReset(field, values, updateValue);
  
  return (
    <Select
      value={values[field.id] || ''}
      onValueChange={(v) => updateValue(field.id, v)}
      disabled={options.length === 0}
    >
      <SelectTrigger>
        <SelectValue 
          placeholder={options.length === 0 
            ? `Select ${field.dependsOn?.field} first` 
            : 'Select...'
          } 
        />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
```

## Testing

```typescript
describe('optionGroups', () => {
  const mockSchema: SkillInputSchema = {
    sections: [{
      id: 'style',
      title: 'Style',
      fields: [
        {
          id: 'category',
          type: 'select',
          options: [
            { value: 'A', label: 'Category A' },
            { value: 'B', label: 'Category B' }
          ]
        },
        {
          id: 'subcategory',
          type: 'select',
          dependsOn: { field: 'category', notEmpty: true },
          optionGroups: {
            'A': [
              { value: 'A1', label: 'Sub A1' },
              { value: 'A2', label: 'Sub A2' }
            ],
            'B': [
              { value: 'B1', label: 'Sub B1' }
            ]
          }
        }
      ]
    }]
  };

  it('filters options based on parent value', () => {
    // Select category 'A'
    // Expect subcategory options to be A1, A2
  });

  it('resets child value when parent changes', () => {
    // Select category 'A', then subcategory 'A1'
    // Change category to 'B'
    // Expect subcategory reset to empty
  });

  it('disables child when parent empty', () => {
    // No category selected
    // Expect subcategory disabled with placeholder
  });

  it('handles missing optionGroups gracefully', () => {
    // Parent value not in optionGroups
    // Expect empty options, no crash
  });
});
```

## Acceptance Criteria

- [ ] optionGroups type added to SkillInputField
- [ ] Options filter based on parent field value
- [ ] Child value resets when parent changes to incompatible value
- [ ] Child select disabled when parent empty
- [ ] Placeholder updates based on state
- [ ] Works with CreateImagePrompt skill (styleCategory → styleName)
- [ ] Backward compatible with static options

## Test with Real Skill

```typescript
// Test with create-image-prompt skill
it('works with create-image-prompt schema', () => {
  // Load actual schema from skills/create-image-prompt/schemas/input.schema.json
  // Test styleCategory → styleName flow
  // Test vfxCategory → vfxEffect flow
});
```

## Dependencies

- Section 2: DynamicSkillForm Refactor (type updates)
- CreateImagePrompt skill schema for testing
