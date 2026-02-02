import { useState, useCallback } from 'react';
import { detectPlatform } from '@smartspec/shared';

export function useTauriInvoke<T>(command: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(
    async (args?: Record<string, unknown>): Promise<T> => {
      if (detectPlatform() !== 'desktop') {
        throw new Error('This feature requires the desktop app');
      }
      setLoading(true);
      setError(null);
      try {
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
        const result = await tauriInvoke<T>(command, args);
        setData(result);
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [command],
  );

  return { data, loading, error, invoke };
}

/** Helper to invoke a Tauri command directly (no hook state) */
export async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Listen to a Tauri event */
export async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<T>(event, (e) => handler(e.payload));
  return unlisten;
}
