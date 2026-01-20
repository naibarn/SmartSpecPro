/**
 * Waveform Utilities
 * Generate and process waveform data for audio visualization
 */

/**
 * Generate dummy waveform data for demonstration
 * In production, this should be generated from actual audio file
 */
export function generateDummyWaveform(samples: number = 1000): number[] {
  const waveform: number[] = [];

  for (let i = 0; i < samples; i++) {
    // Generate a more realistic waveform with varying amplitude
    const baseAmplitude = Math.sin(i / 50) * 0.5;
    const variation = Math.random() * 0.3 - 0.15;
    const envelope = Math.exp(-i / samples * 2); // Decay envelope

    waveform.push((baseAmplitude + variation) * (0.3 + envelope * 0.7));
  }

  return waveform;
}

/**
 * Downsample waveform data to fit target width
 */
export function downsampleWaveform(waveform: number[], targetSamples: number): number[] {
  if (waveform.length <= targetSamples) {
    return waveform;
  }

  const downsampled: number[] = [];
  const samplesPerBin = waveform.length / targetSamples;

  for (let i = 0; i < targetSamples; i++) {
    const start = Math.floor(i * samplesPerBin);
    const end = Math.floor((i + 1) * samplesPerBin);

    let max = -Infinity;
    let min = Infinity;

    for (let j = start; j < end; j++) {
      if (waveform[j] > max) max = waveform[j];
      if (waveform[j] < min) min = waveform[j];
    }

    // Store both min and max for better visualization
    downsampled.push(max);
    if (i < targetSamples - 1) {
      downsampled.push(min);
    }
  }

  return downsampled;
}

/**
 * Normalize waveform data to range [-1, 1]
 */
export function normalizeWaveform(waveform: number[]): number[] {
  const max = Math.max(...waveform.map(Math.abs));
  if (max === 0) return waveform;

  return waveform.map(v => v / max);
}

/**
 * Generate waveform from audio buffer (for future implementation with Web Audio API)
 */
export async function generateWaveformFromAudio(
  audioBuffer: AudioBuffer,
  targetSamples: number = 1000
): Promise<number[]> {
  const rawData = audioBuffer.getChannelData(0); // Get first channel
  const samples = audioBuffer.length;
  const blockSize = Math.floor(samples / targetSamples);
  const waveform: number[] = [];

  for (let i = 0; i < targetSamples; i++) {
    const start = blockSize * i;
    let sum = 0;

    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[start + j]);
    }

    waveform.push((sum / blockSize) * 2 - 1); // Normalize to [-1, 1]
  }

  return waveform;
}
