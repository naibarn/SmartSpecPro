# Section 3: ChatDynamicSkillForm

## Overview

Create a chat-optimized wrapper around the refactored DynamicSkillForm. Handles chat-specific styling and image upload.

## Files

- **Create:** `apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx`
- **Create:** `apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.test.tsx`

## Interface

```typescript
interface ChatDynamicSkillFormProps {
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  isLoading?: boolean;
  error?: string | null;
}
```

## Implementation

### 1. Component Structure

```tsx
export function ChatDynamicSkillForm({
  schema,
  values,
  onChange,
  isLoading,
  error
}: ChatDynamicSkillFormProps) {
  const { upload, isUploading, error: uploadError, retry } = useImageUpload();

  const handleImageUpload = async (files: FileList): Promise<string[]> => {
    const urls: string[] = [];
    
    for (const file of Array.from(files)) {
      try {
        const url = await upload(file, { retry: 3 });
        urls.push(url);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
        throw err;
      }
    }
    
    return urls;
  };

  return (
    <div className="chat-dynamic-form">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {uploadError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Upload failed. 
            <Button variant="link" onClick={retry}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      
      <DynamicSkillForm
        schema={schema}
        values={values}
        onChange={onChange}
        onImageUpload={handleImageUpload}
        excludeFields={[]} // Can exclude media-specific fields
        className="chat-form-styling"
        language="en"
      />
      
      {isLoading && (
        <div className="flex items-center gap-2 mt-4">
          <Loader2 className="animate-spin" />
          <span>Loading...</span>
        </div>
      )}
    </div>
  );
}
```

### 2. Image Upload Hook

```tsx
// hooks/useImageUpload.ts
export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const upload = async (
    file: File, 
    options: { retry?: number } = {}
  ): Promise<string> => {
    const maxRetries = options.retry || 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        setIsUploading(true);
        setError(null);
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        return data.url;
      } catch (err) {
        if (attempt === maxRetries - 1) {
          setError(err as Error);
          throw err;
        }
        // Exponential backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      } finally {
        setIsUploading(false);
      }
    }
    
    throw new Error('Max retries exceeded');
  };

  const retry = () => {
    setRetryCount(c => c + 1);
    setError(null);
  };

  return { upload, isUploading, error, retry, retryCount };
}
```

### 3. Styling

```css
/* Chat-specific form styling */
.chat-dynamic-form {
  @apply bg-muted/30 rounded-lg p-4;
}

.chat-dynamic-form .form-section {
  @apply mb-4 last:mb-0;
}

.chat-dynamic-form .form-field {
  @apply space-y-2;
}
```

## Testing

```typescript
describe('ChatDynamicSkillForm', () => {
  it('renders DynamicSkillForm with chat styling', () => {
    // Render with schema
    // Expect chat styling applied
  });

  it('handles image upload', async () => {
    // Mock file upload
    // Expect upload API called
    // Expect URLs returned
  });

  it('retries failed uploads', async () => {
    // Mock failed upload
    // Expect retry mechanism
  });

  it('shows upload error', async () => {
    // Mock upload failure
    // Expect error alert
  });

  it('forwards values to onChange', () => {
    // Change form value
    // Expect onChange called
  });
});
```

## Acceptance Criteria

- [ ] Wraps DynamicSkillForm correctly
- [ ] Applies chat-specific styling
- [ ] Handles image upload with retry (3 attempts)
- [ ] Shows upload error with retry button
- [ ] Forwards all props to DynamicSkillForm
- [ ] Shows loading state
- [ ] Shows error alert

## Dependencies

- Section 2: DynamicSkillForm Refactor
- useImageUpload hook
- Alert component from shadcn/ui
