export type Platform = 'web' | 'desktop';

export function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return 'desktop';
  }
  return 'web';
}
