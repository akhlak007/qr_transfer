import {
  CSK16_CONSTELLATION,
  CSK8_CONSTELLATION,
  PAM4_INTENSITY_LEVELS,
  type RGBColor,
} from "./vlc-modulator";

export type VlcReceiverModulation = "ook" | "4pam" | "csk8" | "csk16";

export interface SymbolDecision {
  symbol: number;
  bits: number[];
  errorEstimate: number;
  colorDistance: number;
  colorConfidence: number;
}

export interface VlcSymbolDecoder {
  readonly modulation: VlcReceiverModulation;
  update(sample: { luminance: number; rgb: RGBColor }): void;
  preambleBit(sample: { luminance: number; rgb: RGBColor }): number;
  decode(sample: { luminance: number; rgb: RGBColor }): SymbolDecision;
  getAdaptiveThresholds(): number[];
  getLegacyThreshold(): number;
  getSnrEstimateDb(): number;
  reset(): void;
}

export interface SymbolDecoderConfig {
  adaptiveSmoothingAlpha: number;
  initialThreshold: number;
  minDynamicRange: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bitsFor(symbol: number, width: number): number[] {
  return Array.from({ length: width }, (_, index) => (symbol >> (width - index - 1)) & 1);
}

export class OokSymbolDecoder implements VlcSymbolDecoder {
  readonly modulation = "ook" as const;
  private readonly config: SymbolDecoderConfig;
  private threshold: number;
  private highLumaEma = 220;
  private lowLumaEma = 30;

  constructor(config: SymbolDecoderConfig) {
    this.config = config;
    this.threshold = config.initialThreshold;
  }

  update(sample: { luminance: number }): void {
    const alpha = this.config.adaptiveSmoothingAlpha;
    if (sample.luminance >= this.threshold) {
      this.highLumaEma = (1 - alpha) * this.highLumaEma + alpha * sample.luminance;
    } else {
      this.lowLumaEma = (1 - alpha) * this.lowLumaEma + alpha * sample.luminance;
    }
    if (this.highLumaEma < this.lowLumaEma + this.config.minDynamicRange) {
      this.highLumaEma = this.lowLumaEma + this.config.minDynamicRange;
    }
    this.threshold = Math.round((this.highLumaEma + this.lowLumaEma) / 2);
  }

  preambleBit(sample: { luminance: number }): number {
    return sample.luminance >= this.threshold ? 1 : 0;
  }

  decode(sample: { luminance: number }): SymbolDecision {
    const symbol = this.preambleBit(sample);
    const span = Math.max(1, (this.highLumaEma - this.lowLumaEma) / 2);
    const margin = Math.abs(sample.luminance - this.threshold) / span;
    return {
      symbol,
      bits: [symbol],
      errorEstimate: clamp01(1 - margin),
      colorDistance: 0,
      colorConfidence: 0,
    };
  }

  getAdaptiveThresholds(): number[] {
    return [this.threshold];
  }

  getLegacyThreshold(): number {
    return this.threshold;
  }

  getSnrEstimateDb(): number {
    const dynamicRange = Math.max(1, this.highLumaEma - this.lowLumaEma);
    const noiseEstimate = Math.max(1, (255 - dynamicRange) * 0.05 + 2);
    return Math.round(10 * Math.log10(Math.max(1, (dynamicRange / noiseEstimate) ** 2)) * 10) / 10;
  }

  reset(): void {
    this.threshold = this.config.initialThreshold;
    this.highLumaEma = 220;
    this.lowLumaEma = 30;
  }
}

export class Pam4SymbolDecoder implements VlcSymbolDecoder {
  readonly modulation = "4pam" as const;
  private readonly config: SymbolDecoderConfig;
  private centroids = [...PAM4_INTENSITY_LEVELS];

  constructor(config: SymbolDecoderConfig) {
    this.config = config;
  }

  update(sample: { luminance: number }): void {
    const nearest = this.nearestLevel(sample.luminance);
    const alpha = this.config.adaptiveSmoothingAlpha;
    this.centroids[nearest] = (1 - alpha) * this.centroids[nearest] + alpha * sample.luminance;
    const minimumSeparation = Math.max(1, this.config.minDynamicRange / 3);
    for (let i = 1; i < this.centroids.length; i++) {
      this.centroids[i] = Math.max(this.centroids[i], this.centroids[i - 1] + minimumSeparation);
    }
  }

  preambleBit(sample: { luminance: number }): number {
    return sample.luminance >= this.getAdaptiveThresholds()[1] ? 1 : 0;
  }

  decode(sample: { luminance: number }): SymbolDecision {
    const level = this.nearestLevel(sample.luminance);
    const graySymbols = [0b00, 0b01, 0b11, 0b10];
    const thresholds = this.getAdaptiveThresholds();
    const lower = level === 0 ? 0 : thresholds[level - 1];
    const upper = level === 3 ? 255 : thresholds[level];
    const halfCell = Math.max(1, Math.min(this.centroids[level] - lower, upper - this.centroids[level]));
    const errorEstimate = clamp01(Math.abs(sample.luminance - this.centroids[level]) / halfCell);
    return {
      symbol: level,
      bits: bitsFor(graySymbols[level], 2),
      errorEstimate,
      colorDistance: 0,
      colorConfidence: 0,
    };
  }

  getAdaptiveThresholds(): number[] {
    return [0, 1, 2].map((index) => Math.round((this.centroids[index] + this.centroids[index + 1]) / 2));
  }

  getLegacyThreshold(): number {
    return this.getAdaptiveThresholds()[1];
  }

  getSnrEstimateDb(): number {
    const minimumSpacing = Math.min(
      this.centroids[1] - this.centroids[0],
      this.centroids[2] - this.centroids[1],
      this.centroids[3] - this.centroids[2],
    );
    return Math.round(20 * Math.log10(Math.max(1, minimumSpacing / 4)) * 10) / 10;
  }

  reset(): void {
    this.centroids = [...PAM4_INTENSITY_LEVELS];
  }

  private nearestLevel(luminance: number): number {
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.centroids.length; i++) {
      const candidate = Math.abs(luminance - this.centroids[i]);
      if (candidate < distance) {
        distance = candidate;
        nearest = i;
      }
    }
    return nearest;
  }
}

class CskSymbolDecoder implements VlcSymbolDecoder {
  readonly modulation: "csk8" | "csk16";
  private readonly constellation: RGBColor[];
  private readonly bitWidth: number;
  private readonly config: SymbolDecoderConfig;
  private channelMax = [255, 255, 255];
  private lumaThreshold: number;
  private highLumaEma = 220;
  private lowLumaEma = 30;

  constructor(
    modulation: "csk8" | "csk16",
    constellation: RGBColor[],
    bitWidth: number,
    config: SymbolDecoderConfig,
  ) {
    this.modulation = modulation;
    this.constellation = constellation;
    this.bitWidth = bitWidth;
    this.config = config;
    this.lumaThreshold = config.initialThreshold;
  }

  update(sample: { luminance: number; rgb: RGBColor }): void {
    const alpha = this.config.adaptiveSmoothingAlpha;
    const maximumChannel = Math.max(...sample.rgb);
    const minimumChannel = Math.min(...sample.rgb);
    if (sample.luminance >= this.lumaThreshold && minimumChannel >= maximumChannel * 0.35) {
      for (let channel = 0; channel < 3; channel++) {
        const observed = Math.max(1, sample.rgb[channel]);
        this.channelMax[channel] = (1 - alpha) * this.channelMax[channel] + alpha * observed;
      }
    }
    if (sample.luminance >= this.lumaThreshold) {
      this.highLumaEma = (1 - alpha) * this.highLumaEma + alpha * sample.luminance;
    } else {
      this.lowLumaEma = (1 - alpha) * this.lowLumaEma + alpha * sample.luminance;
    }
    this.lumaThreshold = Math.round((this.highLumaEma + this.lowLumaEma) / 2);
  }

  preambleBit(sample: { luminance: number }): number {
    return sample.luminance >= this.lumaThreshold ? 1 : 0;
  }

  decode(sample: { rgb: RGBColor }): SymbolDecision {
    const normalized = sample.rgb.map((value, channel) => clamp01(value / this.channelMax[channel]));
    const rgbSum = normalized[0] + normalized[1] + normalized[2];
    const chromaticity = rgbSum > 0
      ? normalized.map((value) => value / rgbSum)
      : [0, 0, 0];
    const intensity = rgbSum / 3;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let secondDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.constellation.length; index++) {
      const targetRgb = this.constellation[index].map((value) => value / 255);
      const targetSum = targetRgb[0] + targetRgb[1] + targetRgb[2];
      const targetChromaticity = targetSum > 0
        ? targetRgb.map((value) => value / targetSum)
        : [0, 0, 0];
      const targetIntensity = targetSum / 3;
      const chromaDistance = Math.sqrt(targetChromaticity.reduce(
        (sum, value, channel) => sum + (chromaticity[channel] - value) ** 2,
        0,
      ));
      const rgbDistance = Math.sqrt(targetRgb.reduce(
        (sum, value, channel) => sum + (normalized[channel] - value) ** 2,
        0,
      ));
      // Chromaticity is unstable close to black, so weight it by optical energy.
      const chromaWeight = 0.25 * Math.sqrt(intensity * targetIntensity);
      const distance = Math.sqrt(rgbDistance ** 2 + (chromaWeight * chromaDistance) ** 2);
      if (distance < nearestDistance) {
        secondDistance = nearestDistance;
        nearestDistance = distance;
        nearest = index;
      } else if (distance < secondDistance) {
        secondDistance = distance;
      }
    }

    const confidence = secondDistance > 0 && Number.isFinite(secondDistance)
      ? clamp01((secondDistance - nearestDistance) / secondDistance)
      : 0;
    return {
      symbol: nearest,
      bits: bitsFor(nearest, this.bitWidth),
      errorEstimate: 1 - confidence,
      colorDistance: nearestDistance,
      colorConfidence: confidence,
    };
  }

  getAdaptiveThresholds(): number[] {
    return [];
  }

  getLegacyThreshold(): number {
    return this.lumaThreshold;
  }

  getSnrEstimateDb(): number {
    const dynamicRange = Math.max(1, this.highLumaEma - this.lowLumaEma);
    return Math.round(20 * Math.log10(Math.max(1, dynamicRange / 4)) * 10) / 10;
  }

  reset(): void {
    this.channelMax = [255, 255, 255];
    this.lumaThreshold = this.config.initialThreshold;
    this.highLumaEma = 220;
    this.lowLumaEma = 30;
  }
}

export function createVlcSymbolDecoder(
  modulation: VlcReceiverModulation,
  config: SymbolDecoderConfig,
): VlcSymbolDecoder {
  switch (modulation) {
    case "4pam":
      return new Pam4SymbolDecoder(config);
    case "csk8":
      return new CskSymbolDecoder("csk8", CSK8_CONSTELLATION, 3, config);
    case "csk16":
      return new CskSymbolDecoder("csk16", CSK16_CONSTELLATION, 4, config);
    case "ook":
      return new OokSymbolDecoder(config);
  }
}
