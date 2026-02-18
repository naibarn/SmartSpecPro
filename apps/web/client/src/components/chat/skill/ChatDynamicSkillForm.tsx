import React from 'react';
import DynamicSkillForm, { SkillInputSchema } from '@/components/media/DynamicSkillForm';
import { useImageUpload } from './hooks/useImageUpload';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export interface ChatDynamicSkillFormProps {
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  isLoading?: boolean;
  error?: string | null;
  onClearError?: () => void;
}

export function ChatDynamicSkillForm({
  schema,
  values,
  onChange,
  isLoading,
  error,
  onClearError,
}: ChatDynamicSkillFormProps) {
  const { upload, isUploading, error: uploadError, retry, reset } = useImageUpload();

  const handleImageUpload = async (files: FileList): Promise<string[]> => {
    const urls: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const url = await upload(file, { retry: 3 });
        urls.push(url);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Upload failed';
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
        throw err;
      }
    }

    return urls;
  };

  const handleClearUploadError = () => {
    reset();
  };

  return (
    <div className="space-y-4">
      {/* General Error Alert */}
      {error && (
        <Alert variant="destructive" className="relative">
          {onClearError && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2 h-6 w-6 p-0"
              onClick={onClearError}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Upload Error Alert */}
      {uploadError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Upload failed: {uploadError.message}</span>
            <Button variant="link" size="sm" onClick={retry} className="h-auto p-0">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <div className="bg-muted/30 rounded-lg p-4">
        <DynamicSkillForm
          schema={schema}
          values={values}
          onChange={onChange}
          onImageUpload={handleImageUpload}
          excludeFields={[]}
          className="space-y-4"
          language="en"
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Processing...</span>
        </div>
      )}

      {/* Uploading State */}
      {isUploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Uploading images...</span>
        </div>
      )}
    </div>
  );
}

export default ChatDynamicSkillForm;
