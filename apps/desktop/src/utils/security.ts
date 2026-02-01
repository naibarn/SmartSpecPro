/**
 * Security utilities for preventing XSS and other attacks
 */

/**
 * Sanitize HTML string to prevent XSS attacks
 * Escapes dangerous characters that could execute scripts
 */
export function sanitizeHtml(str: string): string {
  if (typeof str !== 'string') return '';

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize project name for display
 * Limits length and removes dangerous characters
 */
export function sanitizeProjectName(name: string): string {
  if (typeof name !== 'string') return 'Untitled Project';

  // Trim and limit length
  const trimmed = name.trim().slice(0, 256);

  // Sanitize HTML
  return sanitizeHtml(trimmed) || 'Untitled Project';
}

/**
 * Sanitize filename for display
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';

  // Remove path separators to prevent path traversal display
  const cleaned = filename.replace(/[/\\]/g, '_');

  return sanitizeHtml(cleaned);
}

/**
 * Validate and sanitize number input
 */
export function sanitizeNumber(
  value: number,
  min: number,
  max: number,
  defaultValue: number
): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, value));
}

/**
 * Validate bitrate input
 */
export function validateBitrate(bitrate: number, isAudio: boolean = false): number {
  if (isAudio) {
    // Audio bitrate: 64-320 kbps
    return sanitizeNumber(bitrate, 64, 320, 192);
  } else {
    // Video bitrate: 1000-50000 kbps
    return sanitizeNumber(bitrate, 1000, 50000, 6000);
  }
}

/**
 * Validate volume (0-2, where 1 is 100%)
 */
export function validateVolume(volume: number): number {
  return sanitizeNumber(volume, 0, 2, 1);
}

/**
 * Validate FPS
 */
export function validateFPS(fps: number): number {
  const allowedFPS = [24, 25, 30, 50, 60, 120];

  // Find closest allowed FPS
  const closest = allowedFPS.reduce((prev, curr) => {
    return Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev;
  });

  return closest;
}

/**
 * Validate resolution
 */
export function validateResolution(width: number, height: number): { width: number; height: number } {
  const validatedWidth = sanitizeNumber(width, 1, 7680, 1920);
  const validatedHeight = sanitizeNumber(height, 1, 4320, 1080);

  return { width: validatedWidth, height: validatedHeight };
}

/**
 * Safe console logging for production
 * Strips sensitive data
 */
export function safeLog(message: string, data?: any): void {
  if (import.meta.env.DEV) {
    console.log(message, data);
  } else {
    // Production: log without sensitive data
    console.log(message);
  }
}

/**
 * Safe error logging
 */
export function safeError(message: string, error?: any): void {
  if (import.meta.env.DEV) {
    console.error(message, error);
  } else {
    // Production: log without sensitive data
    if (error instanceof Error) {
      console.error(message, error.message);
    } else {
      console.error(message);
    }
  }
}
