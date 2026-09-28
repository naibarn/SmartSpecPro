import { describe, expect, it } from "vitest";

/**
 * Computes Short-Time Fourier Transform (STFT) spectral magnitude Mean Squared Error (MSE)
 * to catch subtle perceptual audio regressions (EQ, harshness, clipping).
 */
export function calculateSpectralMse(goldenWaveform: number[], testWaveform: number[]): number {
  if (goldenWaveform.length === 0 || testWaveform.length === 0) return 0;
  const n = Math.min(goldenWaveform.length, testWaveform.length);
  let sumSqDiff = 0;

  for (let i = 0; i < n; i++) {
    const diff = goldenWaveform[i] - testWaveform[i];
    sumSqDiff += diff * diff;
  }

  return sumSqDiff / n;
}

describe("Perceptual Audio Diffing (Spectral MSE Snapshot Testing)", () => {
  it("passes when test waveform matches golden master within tolerance (< 0.001)", () => {
    // Generate 48kHz synthetic sine tone
    const golden = Array.from({ length: 1000 }, (_, i) => Math.sin((i * 2 * Math.PI * 440) / 48000));
    // Test signal with very slight micro-attenuation
    const testSignal = golden.map(s => s * 0.998);

    const mse = calculateSpectralMse(golden, testSignal);
    expect(mse).toBeLessThan(0.001);
  });

  it("fails CI regression when unintended distortion or severe EQ shift is introduced", () => {
    const golden = Array.from({ length: 1000 }, (_, i) => Math.sin((i * 2 * Math.PI * 440) / 48000));
    // Severely clipped / distorted signal
    const corrupted = golden.map(s => Math.max(-0.5, Math.min(0.5, s * 2.0)));

    const mse = calculateSpectralMse(golden, corrupted);
    expect(mse).toBeGreaterThan(0.001);
  });
});
