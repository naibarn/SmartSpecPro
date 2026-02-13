import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SilentRegion } from '../../../types/videoEditor';

/**
 * Pure functions for skip-silence logic testing.
 * These will be exported from SilenceDetectionDialog or a utility module.
 */

// Mock performance.now() for cooldown tests
const mockPerformanceNow = vi.fn(() => Date.now());
global.performance = { now: mockPerformanceNow } as any;

// Helper to create test regions
function createRegion(
  id: string,
  adjustedStartTime: number,
  adjustedEndTime: number,
  selected = true,
  skipped = false,
): SilentRegion {
  return {
    id,
    trackId: 'track-1',
    startTime: adjustedStartTime,
    endTime: adjustedEndTime,
    duration: adjustedEndTime - adjustedStartTime,
    adjustedStartTime,
    adjustedEndTime,
    adjustedDuration: adjustedEndTime - adjustedStartTime,
    selected,
    averageDb: -40,
    skipped,
  };
}

describe('findRegionAtTime (binary search)', () => {
  // Import will be added during implementation
  let findRegionAtTime: (regions: SilentRegion[], currentTime: number) => SilentRegion | null;

  beforeEach(async () => {
    // Dynamic import to be replaced with actual implementation
    try {
      const module = await import('../SilenceDetectionDialog');
      findRegionAtTime = (module as any).findRegionAtTime;
    } catch {
      // Stub for initial test run before implementation
      findRegionAtTime = () => null;
    }
  });

  it('should find correct region for given currentTime', () => {
    const regions = [
      createRegion('r1', 2, 4),
      createRegion('r2', 5, 8),
      createRegion('r3', 10, 15),
    ];

    const result = findRegionAtTime(regions, 6.0);
    expect(result).toBeTruthy();
    expect(result?.id).toBe('r2');
    expect(result?.adjustedStartTime).toBe(5);
    expect(result?.adjustedEndTime).toBe(8);
  });

  it('should return null for time outside all regions', () => {
    const regions = [
      createRegion('r1', 2, 4),
      createRegion('r2', 5, 8),
      createRegion('r3', 10, 15),
    ];

    const result = findRegionAtTime(regions, 9.0);
    expect(result).toBeNull();
  });

  it('should return null for empty regions array', () => {
    const result = findRegionAtTime([], 5.0);
    expect(result).toBeNull();
  });

  it('should handle time at exact region boundary (start)', () => {
    const regions = [createRegion('r1', 5.0, 8.0)];

    const result = findRegionAtTime(regions, 5.0);
    expect(result).toBeTruthy();
    expect(result?.id).toBe('r1');
  });

  it('should handle time at exact region boundary (end)', () => {
    const regions = [createRegion('r1', 5.0, 8.0)];

    const result = findRegionAtTime(regions, 8.0);
    expect(result).toBeTruthy();
    expect(result?.id).toBe('r1');
  });

  it('should only consider selected and non-skipped regions', () => {
    const regions = [
      createRegion('r1', 2, 4, false, false), // deselected
      createRegion('r2', 5, 8, true, true),   // skipped
      createRegion('r3', 10, 15, true, false), // valid
    ];

    // Pre-filter regions (as done in the component)
    const validRegions = regions.filter((r) => r.selected && !r.skipped);

    // Time inside deselected region should return null (not in validRegions)
    expect(findRegionAtTime(validRegions, 3.0)).toBeNull();

    // Time inside skipped region should return null (not in validRegions)
    expect(findRegionAtTime(validRegions, 6.0)).toBeNull();

    // Time inside valid region should return that region
    const result = findRegionAtTime(validRegions, 12.0);
    expect(result).toBeTruthy();
    expect(result?.id).toBe('r3');
  });

  it('should handle multiple valid regions and return the correct one', () => {
    const regions = [
      createRegion('r1', 1, 3),
      createRegion('r2', 5, 7),
      createRegion('r3', 10, 12),
      createRegion('r4', 15, 18),
    ];

    expect(findRegionAtTime(regions, 2.0)?.id).toBe('r1');
    expect(findRegionAtTime(regions, 6.0)?.id).toBe('r2');
    expect(findRegionAtTime(regions, 11.0)?.id).toBe('r3');
    expect(findRegionAtTime(regions, 16.0)?.id).toBe('r4');
  });
});

describe('shouldSkipSilence', () => {
  let shouldSkipSilence: (params: {
    enabled: boolean;
    currentTime: number;
    regions: SilentRegion[];
    lastSkipTimestamp: number;
    cooldownMs: number;
    boundaryGuardMs: number;
  }) => number | null;

  beforeEach(async () => {
    try {
      const module = await import('../SilenceDetectionDialog');
      shouldSkipSilence = (module as any).shouldSkipSilence;
    } catch {
      shouldSkipSilence = () => null;
    }
    mockPerformanceNow.mockClear();
  });

  it('should return adjustedEndTime when skip-silence is enabled and inside region', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1000);

    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 6.0,
      regions,
      lastSkipTimestamp: 0, // No recent skip
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBe(8); // Should skip to adjustedEndTime
  });

  it('should return null when skip-silence is disabled', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1000);

    const result = shouldSkipSilence({
      enabled: false,
      currentTime: 6.0,
      regions,
      lastSkipTimestamp: 0,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBeNull();
  });

  it('should not skip to deselected regions', () => {
    const allRegions = [createRegion('r1', 5, 8, false, false)]; // deselected
    const validRegions = allRegions.filter((r) => r.selected && !r.skipped);
    mockPerformanceNow.mockReturnValue(1000);

    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 6.0,
      regions: validRegions, // Pass pre-filtered regions
      lastSkipTimestamp: 0,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBeNull();
  });

  it('should not skip to skipped regions', () => {
    const allRegions = [createRegion('r1', 5, 8, true, true)]; // skipped
    const validRegions = allRegions.filter((r) => r.selected && !r.skipped);
    mockPerformanceNow.mockReturnValue(1000);

    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 6.0,
      regions: validRegions, // Pass pre-filtered regions
      lastSkipTimestamp: 0,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBeNull();
  });

  it('should respect cooldown and return null when within cooldown period', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1050); // 50ms after last skip

    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 6.0,
      regions,
      lastSkipTimestamp: 1000, // Skip happened 50ms ago
      cooldownMs: 100, // Cooldown is 100ms
      boundaryGuardMs: 0.05,
    });

    expect(result).toBeNull(); // Should not skip due to cooldown
  });

  it('should allow skip after cooldown period expires', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1150); // 150ms after last skip

    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 6.0,
      regions,
      lastSkipTimestamp: 1000, // Skip happened 150ms ago
      cooldownMs: 100, // Cooldown is 100ms
      boundaryGuardMs: 0.05,
    });

    expect(result).toBe(8); // Should skip now
  });

  it('should not skip when near region boundary (boundary guard)', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1000);

    // CurrentTime is 7.97, which is 0.03s from adjustedEndTime (8.0)
    // BoundaryGuard is 0.05s, so this should NOT skip
    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 7.97,
      regions,
      lastSkipTimestamp: 0,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBeNull(); // Should not skip due to boundary guard
  });

  it('should skip when NOT near region boundary', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1000);

    // CurrentTime is 7.0, which is 1.0s from adjustedEndTime (8.0)
    // BoundaryGuard is 0.05s, so this should skip
    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 7.0,
      regions,
      lastSkipTimestamp: 0,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBe(8); // Should skip
  });

  it('should return null when no region found at currentTime', () => {
    const regions = [createRegion('r1', 5, 8)];
    mockPerformanceNow.mockReturnValue(1000);

    const result = shouldSkipSilence({
      enabled: true,
      currentTime: 10.0, // Outside any region
      regions,
      lastSkipTimestamp: 0,
      cooldownMs: 100,
      boundaryGuardMs: 0.05,
    });

    expect(result).toBeNull();
  });
});

/**
 * Bidirectional sync between PreviewPlayer and SilenceWaveformOverlay
 * is tested via integration/manual testing:
 *
 * 1. Waveform -> Preview: Clicking waveform calls onSeek, which updates playbackTime
 * 2. Preview -> Waveform: playbackTime flows to waveform as currentTime prop
 * 3. PreviewPlayer playback: onTimeChange updates playbackTime during playback
 *
 * These require React component rendering and are not suitable for unit tests.
 */
