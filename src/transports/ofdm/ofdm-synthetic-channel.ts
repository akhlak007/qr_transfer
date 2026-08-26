/**
 * Deterministic Synthetic Optical Channel Simulator for Visual OFDM (Milestone 4C)
 *
 * Implements:
 * - 2D Spatial optical degradation models (Gaussian noise, exposure drift, blur, perspective tilt)
 * - Sensor quantization and photon shot noise
 * - Seeded deterministic PRNG for 100% reproducible tests
 *
 * NOTE: For automated stress-testing only; does not replace physical camera experiments.
 */

import { SeededPRNG } from "../vlc/vlc-synthetic-channel";

export interface OfdmChannelConfig {
  seed: number;
  noiseStdDev: number;          // Additive Gaussian noise standard deviation (0..15)
  exposureGain: number;         // Multiplicative optical gain (0.8..1.2)
  ambientOffset: number;        // Static baseline luminance offset (0..30)
  ambientDrift: number;         // Spatial gradient tilt across rows/cols (0..0.5)
  spatialBlurRadius: number;    // Spatial smoothing factor (0..1)
  perspectiveTiltX: number;     // Spatial perspective gradient factor along X (0..0.05)
  perspectiveTiltY: number;     // Spatial perspective gradient factor along Y (0..0.05)
  quantizationBits: number;     // ADC resolution (8 = 256 levels)
  dropProbability: number;      // Frame drop probability (0..0.1)
}

export const DEFAULT_OFDM_CHANNEL_CONFIG: OfdmChannelConfig = {
  seed: 98765,
  noiseStdDev: 0,
  exposureGain: 1.0,
  ambientOffset: 0,
  ambientDrift: 0,
  spatialBlurRadius: 0,
  perspectiveTiltX: 0,
  perspectiveTiltY: 0,
  quantizationBits: 8,
  dropProbability: 0,
};

/**
 * Simulate optical channel degradation over a 2D spatial luminance pattern.
 */
export function simulateOfdmSpatialChannel(
  spatial: Float64Array | number[],
  N: number,
  configPartial: Partial<OfdmChannelConfig> = {}
): Float64Array {
  const config = { ...DEFAULT_OFDM_CHANNEL_CONFIG, ...configPartial };
  const prng = new SeededPRNG(config.seed);
  const degraded = new Float64Array(N * N);

  // 1. Apply Gain, Ambient Offset, Perspective Tilt, and Gaussian Noise
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      let val = spatial[idx];

      // Multiplicative Exposure Gain
      val *= config.exposureGain;

      // Ambient Offset & Spatial Drift
      val += config.ambientOffset + config.ambientDrift * (r + c);

      // Perspective Tilt (Geometric illumination gradient)
      val *= (1.0 + config.perspectiveTiltX * (c - N / 2) + config.perspectiveTiltY * (r - N / 2));

      // Additive Gaussian Noise
      if (config.noiseStdDev > 0) {
        val += prng.nextGaussian(0, config.noiseStdDev);
      }

      degraded[idx] = val;
    }
  }

  // 2. Apply 2D Spatial Blur (Weighted neighbor blending)
  if (config.spatialBlurRadius > 0) {
    const smoothed = new Float64Array(N * N);
    const alpha = Math.min(0.25, 0.12 * config.spatialBlurRadius);

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        let neighborSum = 0;
        let count = 0;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
              neighborSum += degraded[nr * N + nc];
              count++;
            }
          }
        }
        const neighborAvg = count > 0 ? neighborSum / count : degraded[r * N + c];
        smoothed[r * N + c] = (1 - alpha) * degraded[r * N + c] + alpha * neighborAvg;
      }
    }

    degraded.set(smoothed);
  }

  // 3. Sensor Quantization & Clamping
  if (config.quantizationBits < 8) {
    const maxLevels = (1 << config.quantizationBits) - 1;
    for (let i = 0; i < N * N; i++) {
      degraded[i] = Math.round(degraded[i] * (maxLevels / 255)) * (255 / maxLevels);
    }
  }

  return degraded;
}
