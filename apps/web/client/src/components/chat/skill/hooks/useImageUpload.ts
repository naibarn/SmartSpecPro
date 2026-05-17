import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';

// Default upload configuration
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

export interface UploadConfig {
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
}

export interface UseImageUploadReturn {
  upload: (file: File, options?: { retry?: number; config?: UploadConfig }) => Promise<string>;
  isUploading: boolean;
  uploadProgress: number;
  error: Error | null;
  retry: () => void;
  retryCount: number;
  reset: () => void;
  validateFile: (file: File, config?: UploadConfig) => { valid: boolean; error?: string };
}

/**
 * Validates a file before upload
 */
function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.some(type => {
    if (type.endsWith('/*')) {
      const category = type.replace('/*', '');
      return file.type.startsWith(`${category}/`);
    }
    return file.type === type;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file for upload"));
    reader.readAsDataURL(file);
  });
}

export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const uploadMutation = trpc.ai.upload.useMutation();

  const validateFile = useCallback((file: File, config?: UploadConfig): { valid: boolean; error?: string } => {
    const maxFileSize = config?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const allowedTypes = config?.allowedTypes ?? DEFAULT_ALLOWED_TYPES;

    // Check file size
    if (file.size > maxFileSize) {
      const sizeMB = (maxFileSize / 1024 / 1024).toFixed(1);
      return {
        valid: false,
        error: `File size exceeds ${sizeMB}MB limit`,
      };
    }

    // Check file type
    if (!validateFileType(file, allowedTypes)) {
      const allowed = allowedTypes.join(', ');
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${allowed}`,
      };
    }

    return { valid: true };
  }, []);

  const upload = useCallback(
    async (
      file: File,
      options: { retry?: number; config?: UploadConfig } = {}
    ): Promise<string> => {
      const maxRetries = options.retry ?? 3;
      const config = options.config;

      // Validate file before upload
      const validation = validateFile(file, config);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          setIsUploading(true);
          setUploadProgress(5);
          setError(null);

          const fileBase64 = await readFileAsDataUrl(file);
          setUploadProgress(35);

          const result = await uploadMutation.mutateAsync({
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileBase64,
          });

          if (!result.url) {
            throw new Error("Upload response missing URL");
          }

          setUploadProgress(100);
          return result.url;
        } catch (err) {
          const isLastAttempt = attempt === maxRetries - 1;
          
          if (isLastAttempt) {
            const uploadError = err instanceof Error ? err : new Error('Upload failed');
            setError(uploadError);
            throw uploadError;
          }

          setRetryCount((count) => count + 1);

          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } finally {
          setIsUploading(false);
        }
      }

      throw new Error('Max retries exceeded');
    },
    [uploadMutation, validateFile]
  );

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
    setError(null);
    setUploadProgress(0);
  }, []);

  const reset = useCallback(() => {
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    setRetryCount(0);
  }, []);

  return {
    upload,
    isUploading,
    uploadProgress,
    error,
    retry,
    retryCount,
    reset,
    validateFile,
  };
}
