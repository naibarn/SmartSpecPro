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

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
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
    const samplesPerPixel = Math.ceil(waveformData.length / width);

    for (let x = 0; x < width; x++) {
      const startSample = x * samplesPerPixel;
      const endSample = Math.min(startSample + samplesPerPixel, waveformData.length);

      // Find min and max in this pixel's range
      let min = 1;
      let max = -1;

      for (let i = startSample; i < endSample; i++) {
        const value = waveformData[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }

      // Draw vertical line for this pixel
      const yTop = middleY - (max * middleY);
      const yBottom = middleY - (min * middleY);

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
};

export default WaveformCanvas;
