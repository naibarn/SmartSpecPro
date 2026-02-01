/**
 * Sanitize HTML string to prevent XSS attacks
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
 */
export function sanitizeProjectName(name: string): string {
  if (typeof name !== 'string') return 'Untitled Project';
  const trimmed = name.trim().slice(0, 256);
  return sanitizeHtml(trimmed) || 'Untitled Project';
}

/**
 * Sanitize filename for display
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';
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
    return sanitizeNumber(bitrate, 64, 320, 192);
  } else {
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
  return allowedFPS.reduce((prev, curr) =>
    Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev
  );
}

/**
 * Validate resolution
 */
export function validateResolution(width: number, height: number): { width: number; height: number } {
  return {
    width: sanitizeNumber(width, 1, 7680, 1920),
    height: sanitizeNumber(height, 1, 4320, 1080),
  };
}
