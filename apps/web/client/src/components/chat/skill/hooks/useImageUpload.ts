import { useState, useCallback } from 'react';

export interface UseImageUploadReturn {
  upload: (file: File, options?: { retry?: number }) => Promise<string>;
  isUploading: boolean;
  error: Error | null;
  retry: () => void;
  retryCount: number;
  reset: () => void;
}

export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const upload = useCallback(
    async (
      file: File,
      options: { retry?: number } = {}
    ): Promise<string> => {
      const maxRetries = options.retry ?? 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          setIsUploading(true);
          setError(null);

          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Upload failed: ${response.statusText}`);
          }

          const data = await response.json();
          
          if (!data.url) {
            throw new Error('Upload response missing URL');
          }

          return data.url;
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
    []
  );

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setIsUploading(false);
    setError(null);
    setRetryCount(0);
  }, []);

  return {
    upload,
    isUploading,
    error,
    retry,
    retryCount,
    reset,
  };
}
