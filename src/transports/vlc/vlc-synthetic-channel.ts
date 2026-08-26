/**
 * Deterministic Synthetic Optical Channel Simulator (Milestone 3C)
 *
 * Simulates physical optical transmission impairments:
 * - Gaussian / shot-like photon noise
 * - Ambient illumination offset & baseline drift
 * - Display / camera exposure gain variation & temporal flicker
 * - Lens blur & optical temporal smoothing (impulse response)
 * - Quantization noise
 * - Symbol timing jitter
 * - RGB channel imbalance & ambient color cast
 *
 * Uses a deterministic seeded PRNG for 100% reproducible tests.
 * NOTE: For simulation and automated testing only; does not replace physical validation.
 */

import type { RGBColor } from "./vlc-modulator";

export interface SyntheticChannelConfig {
  seed: number;
  noiseStdDev: number;           // Standard deviation of additive Gaussian noise (e.g. 0..20)
  ambientOffset: number;         // Static ambient illumination offset (e.g. 0..40)
  ambientDriftRate: number;      // Drift slope per symbol (e.g. 0..0.05)
  exposureGain: number;          // Overall exposure scale multiplier (e.g. 0.8..1.2)
  flickerAmplitude: number;      // 50Hz/60Hz AC exposure flicker amplitude (e.g. 0..10)
  flickerFrequency: number;      // Flicker frequency in cycles/symbol (e.g. 0.1)
  temporalSmoothing: number;     // Exponential moving average smoothing factor alpha (0 = none, 0.4 = mild blur)
  quantizationBits: number;      // ADC quantization resolution (e.g. 8 for 0..255)
  rgbImbalance: [number, number, number]; // [R, G, B] channel gains (e.g. [1.05, 0.98, 0.92])
  ambientColorCast: RGBColor;    // Ambient background color tint added to all channels
  frameDropProbability: number;  // Probability of dropped / repeated frame sample (0..0.1)
}

export const DEFAULT_SYNTHETIC_CHANNEL_CONFIG: SyntheticChannelConfig = {
  seed: 12345,
  noiseStdDev: 0,
  ambientOffset: 0,
  ambientDriftRate: 0,
  exposureGain: 1.0,
  flickerAmplitude: 0,
  flickerFrequency: 0.1,
  temporalSmoothing: 0,
  quantizationBits: 8,
  rgbImbalance: [1.0, 1.0, 1.0],
  ambientColorCast: [0, 0, 0],
  frameDropProbability: 0,
};

/**
 * Fast, deterministic Mulberry32 PRNG.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed = 12345) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Box-Muller transform for standard normal Gaussian random variable (mean 0, std 1).
   */
  nextGaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-15, this.nextFloat());
    const u2 = this.nextFloat();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

export interface SyntheticChannelSample {
  rgb: RGBColor;
  luminance: number;
  timestamp: number;
}

export interface SyntheticChannelResult {
  samples: SyntheticChannelSample[];
  config: SyntheticChannelConfig;
  totalGenerated: number;
  droppedCount: number;
}

/**
 * Simulate optical transmission of intensity symbols (OOK / 4-PAM).
 */
export function simulateIntensityChannel(
  levels: Uint8Array | number[],
  configPartial: Partial<SyntheticChannelConfig> = {}
): SyntheticChannelResult {
  const config = { ...DEFAULT_SYNTHETIC_CHANNEL_CONFIG, ...configPartial };
  const prng = new SeededPRNG(config.seed);
  const samples: SyntheticChannelSample[] = [];

  let prevLuma = levels.length > 0 ? levels[0] : 0;
  let droppedCount = 0;

  for (let i = 0; i < levels.length; i++) {
    // Check random frame drop / duplicate
    if (config.frameDropProbability > 0 && prng.nextFloat() < config.frameDropProbability) {
      droppedCount++;
      continue; // Frame dropped in transmission
    }

    const rawLuma = levels[i];

    // 1. Exposure gain & AC flicker
    const flicker = config.flickerAmplitude * Math.sin(2 * Math.PI * config.flickerFrequency * i);
    let luma = (rawLuma * config.exposureGain) + flicker;

    // 2. Ambient offset and drift
    const ambient = config.ambientOffset + (config.ambientDriftRate * i);
    luma += ambient;

    // 3. Gaussian photon / shot noise
    if (config.noiseStdDev > 0) {
      luma += prng.nextGaussian(0, config.noiseStdDev);
    }

    // 4. Temporal smoothing (lens/sensor low-pass response)
    if (config.temporalSmoothing > 0) {
      luma = (1 - config.temporalSmoothing) * luma + (config.temporalSmoothing * prevLuma);
    }
    prevLuma = luma;

    // 5. Clamping & Quantization (0..255)
    const maxQuant = (1 << config.quantizationBits) - 1;
    const clamped = Math.max(0, Math.min(255, Math.round(luma * (maxQuant / 255))));

    samples.push({
      rgb: [clamped, clamped, clamped],
      luminance: clamped,
      timestamp: i * 33.33, // ~30 FPS
    });
  }

  return {
    samples,
    config,
    totalGenerated: samples.length,
    droppedCount,
  };
}

/**
 * Simulate optical transmission of RGB color symbols (CSK-8 / CSK-16).
 */
export function simulateColorChannel(
  colors: RGBColor[],
  configPartial: Partial<SyntheticChannelConfig> = {}
): SyntheticChannelResult {
  const config = { ...DEFAULT_SYNTHETIC_CHANNEL_CONFIG, ...configPartial };
  const prng = new SeededPRNG(config.seed);
  const samples: SyntheticChannelSample[] = [];

  let prevRgb: RGBColor = colors.length > 0 ? [...colors[0]] : [0, 0, 0];
  let droppedCount = 0;

  for (let i = 0; i < colors.length; i++) {
    if (config.frameDropProbability > 0 && prng.nextFloat() < config.frameDropProbability) {
      droppedCount++;
      continue;
    }

    const rawColor = colors[i];
    const flicker = config.flickerAmplitude * Math.sin(2 * Math.PI * config.flickerFrequency * i);
    const ambient = config.ambientOffset + (config.ambientDriftRate * i);

    let r = rawColor[0] * config.exposureGain * config.rgbImbalance[0] + flicker + ambient + config.ambientColorCast[0];
    let g = rawColor[1] * config.exposureGain * config.rgbImbalance[1] + flicker + ambient + config.ambientColorCast[1];
    let b = rawColor[2] * config.exposureGain * config.rgbImbalance[2] + flicker + ambient + config.ambientColorCast[2];

    // Additive Gaussian noise per channel
    if (config.noiseStdDev > 0) {
      r += prng.nextGaussian(0, config.noiseStdDev);
      g += prng.nextGaussian(0, config.noiseStdDev);
      b += prng.nextGaussian(0, config.noiseStdDev);
    }

    // Temporal smoothing
    if (config.temporalSmoothing > 0) {
      r = (1 - config.temporalSmoothing) * r + (config.temporalSmoothing * prevRgb[0]);
      g = (1 - config.temporalSmoothing) * g + (config.temporalSmoothing * prevRgb[1]);
      b = (1 - config.temporalSmoothing) * b + (config.temporalSmoothing * prevRgb[2]);
    }
    prevRgb = [r, g, b];

    const clampedR = Math.max(0, Math.min(255, Math.round(r)));
    const clampedG = Math.max(0, Math.min(255, Math.round(g)));
    const clampedB = Math.max(0, Math.min(255, Math.round(b)));
    const luma = Math.round(0.299 * clampedR + 0.587 * clampedG + 0.114 * clampedB);

    samples.push({
      rgb: [clampedR, clampedG, clampedB],
      luminance: luma,
      timestamp: i * 33.33,
    });
  }

  return {
    samples,
    config,
    totalGenerated: samples.length,
    droppedCount,
  };
}
