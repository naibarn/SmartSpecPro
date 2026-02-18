import { useState, useCallback } from 'react';

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

export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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
          setUploadProgress(0);
          setError(null);

          const formData = new FormData();
          formData.append('file', file);

          // Create XMLHttpRequest for progress tracking
          const xhr = new XMLHttpRequest();
          
          const uploadPromise = new Promise<string>((resolve, reject) => {
            xhr.upload.addEventListener('progress', (event) => {
              if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                setUploadProgress(progress);
              }
            });

            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText);
                  if (data.url) {
                    resolve(data.url);
                  } else {
                    reject(new Error('Upload response missing URL'));
                  }
                } catch {
                  reject(new Error('Invalid upload response'));
                }
              } else {
                try {
                  const errorData = JSON.parse(xhr.responseText);
                  reject(new Error(errorData.message || `Upload failed: ${xhr.statusText}`));
                } catch {
                  reject(new Error(`Upload failed: ${xhr.statusText}`));
                }
              }
            });

            xhr.addEventListener('error', () => {
              reject(new Error('Network error during upload'));
            });

            xhr.addEventListener('abort', () => {
              reject(new Error('Upload aborted'));
            });
          });

          xhr.open('POST', '/api/upload');
          xhr.send(formData);

          const url = await uploadPromise;
          setUploadProgress(100);
          return url;
        } catch (err) {
          const isLastAttempt = attempt === maxRetries - 1;
          
          if (isLastAttempt) {
            const uploadError = err instanceof Error ? err : new Error('Upload failed');
            setError(uploadError);
            throw uploadError;
          }

          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } finally {
          setIsUploading(false);
        }
      }

      throw new Error('Max retries exceeded');
    },
    [validateFile]
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
