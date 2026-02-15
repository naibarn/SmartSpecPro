/**
 * Waveform Canvas Component
 * Renders audio waveform visualization for timeline clips
 */

import React, { useRef, useEffect } from 'react';

interface WaveformCanvasProps {
  waveformData: number[];
  width: number;
  height: number;
  color?: string;
  backgroundColor?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = React.memo(({
  waveformData,
  width,
  height,
  color = '#00b294',
  backgroundColor = 'transparent'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData || waveformData.length === 0) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    const middleY = height / 2;
    const safeWidth = Math.max(1, Math.floor(width));
    const totalSamples = waveformData.length;
    const samplesPerPixel = totalSamples / safeWidth;
    const hasNegative = waveformData.some((v) => v < 0);

    for (let x = 0; x < safeWidth; x++) {
      // Map each canvas pixel to a proportional sample window.
      // This keeps waveform geometry consistent when zooming in/out.
      const rawStart = x * samplesPerPixel;
      const rawEnd = (x + 1) * samplesPerPixel;
      const startSample = Math.max(0, Math.min(totalSamples - 1, Math.floor(rawStart)));
      const endSample = Math.max(
        startSample + 1,
        Math.min(totalSamples, Math.ceil(rawEnd)),
      );

      // Find min and max in this pixel's range
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;

      for (let i = startSample; i < endSample; i++) {
        const value = waveformData[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;

      let yTop: number;
      let yBottom: number;
      if (hasNegative) {
        // Signed waveform [-1,1]
        yTop = middleY - (max * middleY);
        yBottom = middleY - (min * middleY);
      } else {
        // Absolute/envelope waveform [0,1] - boost low amplitudes for readability.
        const peak = Math.max(Math.abs(min), Math.abs(max));
        const boosted = Math.min(1, Math.pow(peak, 0.65) * 1.15);
        yTop = middleY - (boosted * middleY);
        yBottom = middleY + (boosted * middleY);
      }

      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBottom);
      ctx.stroke();
    }
  }, [waveformData, width, height, color, backgroundColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block'
      }}
    />
  );
});

export default WaveformCanvas;
