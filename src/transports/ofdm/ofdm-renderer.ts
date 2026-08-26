/**
 * Visual OFDM Spatial Renderer (Milestone 4B)
 *
 * Implements:
 * - Inverse 2D transform (2D-IDCT) from frequency subcarriers to spatial luminance pixels
 * - Dynamic range normalization and DC bias scaling for optical display
 * - Optical alignment border & canvas rendering
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

import { idct2D } from "./ofdm-fft";
import type { OfdmSymbolGrid } from "./ofdm-modulator";

export interface RenderedOfdmPattern {
  gridSize: number;
  width: number;
  height: number;
  spatialLuminance: Float64Array;
  pixelBuffer: Uint8ClampedArray; // RGBA format
}

/**
 * Transform frequency-domain subcarriers to spatial luminance pixels.
 */
export function renderOfdmGridToPixels(
  grid: OfdmSymbolGrid,
  targetDisplaySize = 256
): RenderedOfdmPattern {
  const N = grid.gridSize;
  const freqMatrix = new Float64Array(N * N);

  // Use real components for spatial intensity
  for (let i = 0; i < N * N; i++) {
    freqMatrix[i] = grid.carriers[i].real;
  }

  // 1. Inverse 2D-DCT Transform
  const spatial = idct2D(freqMatrix, N);

  // 2. Find min/max for dynamic range normalization
  let minVal = Number.POSITIVE_INFINITY;
  let maxVal = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < spatial.length; i++) {
    if (spatial[i] < minVal) minVal = spatial[i];
    if (spatial[i] > maxVal) maxVal = spatial[i];
  }

  const range = maxVal > minVal ? maxVal - minVal : 1.0;

  // 3. Upsample / scale to target display pixel buffer
  const width = targetDisplaySize;
  const height = targetDisplaySize;
  const pixelBuffer = new Uint8ClampedArray(width * height * 4);

  const blockW = width / N;
  const blockH = height / N;

  for (let gridY = 0; gridY < N; gridY++) {
    const yStart = Math.ceil(gridY * blockH);
    const yEnd = Math.min(height, Math.ceil((gridY + 1) * blockH));
    for (let gridX = 0; gridX < N; gridX++) {
      const xStart = Math.ceil(gridX * blockW);
      const xEnd = Math.min(width, Math.ceil((gridX + 1) * blockW));
      const val = spatial[gridY * N + gridX];
      const normalized = 15 + ((val - minVal) / range) * 225;
      const low = Math.floor(normalized);
      const highPixels = Math.round((normalized - low) * (xEnd - xStart) * (yEnd - yStart));
      let localIndex = 0;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          // Deterministic spatial dithering preserves the fractional cell average
          // through an 8-bit canvas without altering OFDM constellation math.
          const quantized = localIndex++ < highPixels ? low + 1 : low;
          const idx = (y * width + x) * 4;
          pixelBuffer[idx] = quantized;
          pixelBuffer[idx + 1] = quantized;
          pixelBuffer[idx + 2] = quantized;
          pixelBuffer[idx + 3] = 255;
        }
      }
    }
  }

  return {
    gridSize: N,
    width,
    height,
    spatialLuminance: spatial,
    pixelBuffer,
  };
}

/**
 * Render rendered pattern onto an HTML5 Canvas element.
 */
export function renderOfdmToCanvas(canvas: HTMLCanvasElement, pattern: RenderedOfdmPattern): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imgData = ctx.createImageData(pattern.width, pattern.height);
  imgData.data.set(pattern.pixelBuffer);
  ctx.putImageData(imgData, 0, 0);
}
