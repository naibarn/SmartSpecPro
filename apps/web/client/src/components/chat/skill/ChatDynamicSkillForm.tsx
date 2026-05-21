import React, { useEffect, useRef, useState } from 'react';
import DynamicSkillForm, { SkillInputSchema, resolveSkillUiLanguage } from '@/components/media/DynamicSkillForm';
import { useImageUpload } from './hooks/useImageUpload';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, X, Upload, Languages } from 'lucide-react';
import { toast } from 'sonner';

export interface ChatDynamicSkillFormProps {
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  isLoading?: boolean;
  error?: string | null;
  onClearError?: () => void;
  /** Language for form labels. Defaults to the current page language. */
  language?: "en" | "th";
}

export function ChatDynamicSkillForm({
  schema,
  values,
  onChange,
  isLoading,
  error,
  onClearError,
  language: initialLanguage,
}: ChatDynamicSkillFormProps) {
  const pageLanguage = resolveSkillUiLanguage(initialLanguage);
  const [language, setLanguage] = useState<"en" | "th">(pageLanguage);
  const previousAutoLanguageRef = useRef<"en" | "th">(pageLanguage);
  const { upload, isUploading, uploadProgress, error: uploadError, retry, reset, validateFile } = useImageUpload();

  useEffect(() => {
    setLanguage((current) => {
      if (current === previousAutoLanguageRef.current) {
        previousAutoLanguageRef.current = pageLanguage;
        return pageLanguage;
      }
      return current;
    });
  }, [pageLanguage]);

  const handleImageUpload = async (files: FileList | File[]): Promise<string[]> => {
    const urls: string[] = [];

    for (const file of Array.from(files)) {
      // Pre-validate file before upload
      const validation = validateFile(file);
      if (!validation.valid) {
        toast.error(`${file.name}: ${validation.error}`);
        throw new Error(validation.error);
      }

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

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>Uploading...</span>
            </div>
            <span className="text-muted-foreground">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      {/* Form */}
      <div className="bg-muted/30 rounded-lg p-4">
        {/* Language toggle for form labels */}
        <div className="flex justify-end mb-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setLanguage((current) => {
                const next = current === "th" ? "en" : "th";
                previousAutoLanguageRef.current = next;
                return next;
              });
            }}
          >
            <Languages className="h-3.5 w-3.5" />
            {language === "th" ? "TH" : "EN"}
          </Button>
        </div>
        <DynamicSkillForm
          schema={schema}
          values={values}
          onChange={onChange}
          onImageUpload={handleImageUpload}
          excludeFields={[]}
          className="space-y-4"
          language={language}
        />
      </div>

      {/* Loading State */}
      {isLoading && !isUploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
}

export default ChatDynamicSkillForm;
