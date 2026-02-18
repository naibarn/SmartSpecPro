# Section 2: DynamicSkillForm Refactor

## Overview

Refactor the existing DynamicSkillForm to be more generic and context-agnostic. Extract media-specific features into optional props.

## Files

- **Modify:** `apps/web/client/src/components/media/DynamicSkillForm.tsx`
- **Create:** `apps/web/client/src/components/media/DynamicSkillForm.test.tsx`

## Current Issues

The current DynamicSkillForm has tight coupling with media-specific features:
- `referenceImages` and `onRemoveImage` props
- `onStyleAction` callback
- Media-specific styling assumptions

## Refactoring Plan

### 1. Extract Optional Props

```typescript
// Before
interface DynamicSkillFormProps {
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onImageUpload: (files: FileList) => Promise<string[]>;
  referenceImages?: ReferenceImage[];
  onRemoveImage?: (index: number) => void;
  onStyleAction?: (action: StyleAction) => void;
}

// After
interface DynamicSkillFormProps {
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onImageUpload?: (files: FileList) => Promise<string[]>;
  // Media-specific props made optional
  referenceImages?: ReferenceImage[];
  onRemoveImage?: (index: number) => void;
  onStyleAction?: (action: StyleAction) => void;
  // New generic props
  excludeFields?: string[];
  className?: string;
  language?: "en" | "th";
}
```

### 2. Make Image Upload Optional

```typescript
// In renderField for image types
if (!onImageUpload) {
  return (
    <div className="text-sm text-muted-foreground">
      Image upload not available
    </div>
  );
}

// Render upload button
return (
  <Button onClick={triggerUpload} disabled={isUploading}>
    {isUploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
  </Button>
);
```

### 3. Add Field Exclusion

```typescript
// Filter visible fields and exclude specified fields
const visibleFields = section.fields
  .filter(isFieldVisible)
  .filter((field) => !excludeFields?.includes(field.id));
```

### 4. Remove Hardcoded Media Behavior

```typescript
// Remove or make optional the special style action check
const updateValue = (fieldId: string, value: any) => {
  onChange({ ...values, [fieldId]: value });

  // Make style action optional
  if (onStyleAction && fieldId === "style" && value === "upscale") {
    onStyleAction("upscale");
  }
};
```

### 5. Generic Styling

```typescript
// Use className prop for context-specific styling
return (
  <div className={cn("space-y-4", className)}>
    {schema.sections.map((section) => renderSection(section))}
  </div>
);
```

## optionGroups Support (Day 3 Prep)

Add support for cascading selects:

```typescript
// In renderField for select type
const getSelectOptions = (field: SkillInputField): SelectOption[] => {
  // If field has optionGroups and dependsOn, filter by parent value
  if (field.optionGroups && field.dependsOn) {
    const parentValue = values[field.dependsOn.field];
    return field.optionGroups[parentValue] || [];
  }
  return field.options || [];
};

// Reset child value when parent changes
useEffect(() => {
  if (!field.dependsOn || !field.optionGroups) return;
  
  const parentValue = values[field.dependsOn.field];
  const validOptions = field.optionGroups[parentValue] || [];
  const currentValue = values[field.id];
  
  if (!validOptions.some(opt => opt.value === currentValue)) {
    updateValue(field.id, '');
  }
}, [values[field.dependsOn?.field], field.id]);
```

## Testing

### Backward Compatibility Tests

```typescript
describe('DynamicSkillForm Media Studio', () => {
  it('renders with reference images', () => {
    // Render with referenceImages prop
    // Expect reference images to show
  });

  it('calls onStyleAction for upscale', () => {
    // Select upscale style
    // Expect onStyleAction called
  });

  it('calls onRemoveImage when remove clicked', () => {
    // Click remove on reference image
    // Expect onRemoveImage called
  });
});

describe('DynamicSkillForm Chat Context', () => {
  it('renders without reference images', () => {
    // Render without referenceImages
    // Expect no error
  });

  it('excludes specified fields', () => {
    // Pass excludeFields
    // Expect those fields not rendered
  });

  it('uses custom className', () => {
    // Pass className
    // Expect class applied
  });
});
```

## Acceptance Criteria

- [ ] All existing Media Studio tests still pass
- [ ] Form renders without optional props
- [ ] excludeFields works correctly
- [ ] className applied to container
- [ ] Image upload optional
- [ ] No console errors in chat context
- [ ] optionGroups type added (implementation in Section 4)

## Dependencies

- Existing DynamicSkillForm component
- Backward compatibility with Media Studio
