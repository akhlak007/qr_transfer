export const SOFTWARE_CHANNEL_LABEL = "SOFTWARE OPTICAL CHANNEL / SIMULATION" as const;

export interface SoftwareOpticalChannelConfig {
  seed: number;
  luminanceNoise: number;
  rgbNoise: number;
  brightnessDrift: number;
  dropRate: number;
  corruptionRate: number;
  samplingVariation: number;
  dropUnitIndices: number[];
  corruptUnitIndices: number[];
}

export interface SoftwareOpticalChannelDiagnostics {
  channelLabel: typeof SOFTWARE_CHANNEL_LABEL;
  unitsProcessed: number;
  unitsDelivered: number;
  unitsDropped: number;
  unitsCorrupted: number;
}

export const DEFAULT_SOFTWARE_CHANNEL_SEED = 0x8e2026;

const DEFAULT_CONFIG: SoftwareOpticalChannelConfig = {
  seed: DEFAULT_SOFTWARE_CHANNEL_SEED,
  luminanceNoise: 0,
  rgbNoise: 0,
  brightnessDrift: 0,
  dropRate: 0,
  corruptionRate: 0,
  samplingVariation: 0,
  dropUnitIndices: [],
  corruptUnitIndices: [],
};

export class SoftwareOpticalChannel {
  private readonly config: SoftwareOpticalChannelConfig;
  private randomState: number;
  private unitsProcessed = 0;
  private unitsDelivered = 0;
  private unitsDropped = 0;
  private unitsCorrupted = 0;

  constructor(config: Partial<SoftwareOpticalChannelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.randomState = this.config.seed >>> 0;
  }

  transmitVlcSymbol(
    luminance: number,
    rgb: [number, number, number],
    unitIndex: number,
  ): { luminance: number; rgb: [number, number, number] } | null {
    const disposition = this.disposition(unitIndex);
    if (disposition === "drop") return null;
    const drift = 1 + this.config.brightnessDrift * Math.sin(unitIndex * 0.17);
    const sampling = this.config.samplingVariation * Math.sin(unitIndex * 0.41);
    const corruption = disposition === "corrupt" ? 255 - luminance : luminance;
    const outputLuminance = this.clamp(
      corruption * drift + this.symmetricNoise(this.config.luminanceNoise) + sampling,
    );
    const outputRgb = rgb.map((channel) => this.clamp(
      (disposition === "corrupt" ? 255 - channel : channel) * drift
        + this.symmetricNoise(this.config.rgbNoise)
        + sampling,
    )) as [number, number, number];
    return { luminance: outputLuminance, rgb: outputRgb };
  }

  transmitOfdmGrid(spatial: Float64Array, unitIndex: number): Float64Array | null {
    const disposition = this.disposition(unitIndex);
    if (disposition === "drop") return null;
    if (disposition === "corrupt") return new Float64Array(spatial.length);
    const output = new Float64Array(spatial.length);
    const drift = 1 + this.config.brightnessDrift * Math.sin(unitIndex * 0.17);
    for (let index = 0; index < spatial.length; index++) {
      output[index] = spatial[index] * drift
        + this.symmetricNoise(this.config.luminanceNoise)
        + this.config.samplingVariation * Math.sin((index + unitIndex) * 0.23);
    }
    return output;
  }

  transmitRgba(
    source: { data: Uint8ClampedArray; width: number; height: number },
    unitIndex: number,
  ): { data: Uint8ClampedArray; width: number; height: number } | null {
    const disposition = this.disposition(unitIndex);
    if (disposition === "drop") return null;
    const output = new Uint8ClampedArray(source.data);
    const drift = 1 + this.config.brightnessDrift * Math.sin(unitIndex * 0.17);
    for (let index = 0; index < output.length; index += 4) {
      for (let channel = 0; channel < 3; channel++) {
        const value = disposition === "corrupt" ? 255 - output[index + channel] : output[index + channel];
        output[index + channel] = this.clamp(value * drift + this.symmetricNoise(this.config.rgbNoise));
      }
    }
    return { data: output, width: source.width, height: source.height };
  }

  getDiagnostics(): SoftwareOpticalChannelDiagnostics {
    return {
      channelLabel: SOFTWARE_CHANNEL_LABEL,
      unitsProcessed: this.unitsProcessed,
      unitsDelivered: this.unitsDelivered,
      unitsDropped: this.unitsDropped,
      unitsCorrupted: this.unitsCorrupted,
    };
  }

  private disposition(unitIndex: number): "deliver" | "drop" | "corrupt" {
    this.unitsProcessed++;
    if (this.config.dropUnitIndices.includes(unitIndex) || this.random() < this.config.dropRate) {
      this.unitsDropped++;
      return "drop";
    }
    if (this.config.corruptUnitIndices.includes(unitIndex) || this.random() < this.config.corruptionRate) {
      this.unitsCorrupted++;
      this.unitsDelivered++;
      return "corrupt";
    }
    this.unitsDelivered++;
    return "deliver";
  }

  private random(): number {
    let state = this.randomState += 0x6d2b79f5;
    state = Math.imul(state ^ state >>> 15, state | 1);
    state ^= state + Math.imul(state ^ state >>> 7, state | 61);
    return ((state ^ state >>> 14) >>> 0) / 4294967296;
  }

  private symmetricNoise(amplitude: number): number {
    return amplitude === 0 ? 0 : (this.random() * 2 - 1) * amplitude;
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(255, value));
  }
}
