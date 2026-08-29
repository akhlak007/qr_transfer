/**
 * TEXT_FLASH_PROTOCOL — deterministic synthetic camera/channel (TF2).
 * Models brightness variation, noise, sampling jitter, missed samples, and
 * reacquisition after missed *camera* samples only. Encoding unchanged.
 * Not a physical phone-camera success claim.
 */

import { TEXT_FLASH_DEFAULT_FRAME_MS, clampTextFlashFrameMs } from "./text-flash-types";
import {
  classifyTextFlashFrame,
  type TextFlashClassificationDiagnostics,
  type TextFlashClassifyResult,
} from "./text-flash-classifier";
import {
  createTextFlashPixelBuffer,
  createTextFlashRenderPlan,
  renderTextFlashPlanStep,
  type TextFlashPixelBuffer,
  type TextFlashRenderPlan,
} from "./text-flash-renderer";

/** Fast Mulberry32 — local copy so we never import VLC synthetic helpers. */
export class TextFlashSeededPRNG {
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

  nextGaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-15, this.nextFloat());
    const u2 = this.nextFloat();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }
}

export interface TextFlashSyntheticChannelConfig {
  seed: number;
  width: number;
  height: number;
  /** Additive luminance bias (e.g. -60..+60). */
  exposureBias: number;
  /** Gaussian noise std-dev on luminance. */
  noiseStdDev: number;
  /** Target camera FPS mean (jittered). */
  cameraFps: number;
  /** Uniform jitter fraction of nominal period (0..0.5). */
  timingJitterFraction: number;
  /** Probability a scheduled sample is dropped (missed camera frame). */
  missProbability: number;
  /** Gap (ms) above which a sample is counted as a miss / reacquisition candidate. */
  missGapMs: number;
}

export const TEXT_FLASH_CLEAN_CHANNEL: TextFlashSyntheticChannelConfig = {
  seed: 1,
  width: 160,
  height: 160,
  exposureBias: 0,
  noiseStdDev: 0,
  cameraFps: 30,
  timingJitterFraction: 0,
  missProbability: 0,
  missGapMs: 80,
};

export const TEXT_FLASH_NOISY_CHANNEL: TextFlashSyntheticChannelConfig = {
  seed: 42,
  width: 160,
  height: 160,
  exposureBias: 40,
  noiseStdDev: 12,
  cameraFps: 28,
  timingJitterFraction: 0.35,
  missProbability: 0.25,
  missGapMs: 80,
};

export interface TextFlashCameraSample {
  timestampMs: number;
  opticalStepIndex: number;
  buffer: TextFlashPixelBuffer;
  missedSincePrevious: boolean;
  reacquiring: boolean;
  classify: TextFlashClassifyResult;
}

export interface TextFlashSyntheticChannelResult {
  plan: TextFlashRenderPlan;
  samples: TextFlashCameraSample[];
  missedSampleCount: number;
  reacquisitionCount: number;
  /** BITCARD bytes recovered in optical order from classified samples (deduped by step). */
  recoveredBitcardBytesByStep: Map<number, number>;
}

function cloneBuffer(src: TextFlashPixelBuffer): TextFlashPixelBuffer {
  return {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data),
  };
}

/**
 * Apply exposure bias + noise to a copy. Does not mutate the clean source buffer.
 */
export function impairTextFlashBuffer(
  clean: TextFlashPixelBuffer,
  exposureBias: number,
  noiseStdDev: number,
  prng: TextFlashSeededPRNG,
): TextFlashPixelBuffer {
  const out = cloneBuffer(clean);
  for (let i = 0; i < out.data.length; i += 4) {
    const noise = noiseStdDev > 0 ? prng.nextGaussian(0, noiseStdDev) : 0;
    const v = Math.max(0, Math.min(255, out.data[i]! + exposureBias + noise));
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    // alpha unchanged
  }
  return out;
}

/**
 * Prove a zero-impairment pass leaves RGBA bytes identical to the clean render.
 */
export function buffersRgbaEqual(
  a: TextFlashPixelBuffer,
  b: TextFlashPixelBuffer,
): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

/**
 * Simulate a phone-like camera sampling an optical dwell sequence.
 * Missed samples are camera drops only — optical encoding/protocol unchanged.
 */
export function simulateTextFlashCamera(
  text: string,
  configPartial: Partial<TextFlashSyntheticChannelConfig> = {},
  frameMs: number = TEXT_FLASH_DEFAULT_FRAME_MS,
): TextFlashSyntheticChannelResult {
  const config: TextFlashSyntheticChannelConfig = {
    ...TEXT_FLASH_CLEAN_CHANNEL,
    ...configPartial,
  };
  const dwell = clampTextFlashFrameMs(frameMs);
  const plan = createTextFlashRenderPlan(text, dwell);
  const prng = new TextFlashSeededPRNG(config.seed);

  const cleanFrames: TextFlashPixelBuffer[] = [];
  const paint = createTextFlashPixelBuffer(config.width, config.height);
  for (let i = 0; i < plan.steps.length; i++) {
    renderTextFlashPlanStep(plan, i, paint);
    cleanFrames.push(cloneBuffer(paint));
  }

  const nominalPeriod = 1000 / Math.max(1, config.cameraFps);
  const samples: TextFlashCameraSample[] = [];
  let missedSampleCount = 0;
  let reacquisitionCount = 0;
  let lastEmitTs = -Infinity;
  let cumulativeMissed = 0;

  const totalDuration = plan.steps.length * dwell;
  let t = 0;

  while (t < totalDuration) {
    const stepIndex = Math.min(
      plan.steps.length - 1,
      Math.floor(t / dwell),
    );
    const drop = prng.nextFloat() < config.missProbability;
    const jitter =
      (prng.nextFloat() * 2 - 1) * config.timingJitterFraction * nominalPeriod;
    const nextT = t + Math.max(1, nominalPeriod + jitter);

    if (drop) {
      missedSampleCount++;
      cumulativeMissed++;
      t = nextT;
      continue;
    }

    const gap = t - lastEmitTs;
    const missedSincePrevious =
      samples.length > 0 && gap > config.missGapMs;
    if (missedSincePrevious) {
      missedSampleCount++;
      cumulativeMissed++;
    }

    const clean = cleanFrames[stepIndex]!;
    const impaired = impairTextFlashBuffer(
      clean,
      config.exposureBias,
      config.noiseStdDev,
      prng,
    );

    const reacquiring = missedSincePrevious;
    if (reacquiring) reacquisitionCount++;

    const classify = classifyTextFlashFrame(impaired, {}, {
      missedSamples: cumulativeMissed,
      reacquiring,
    });

    samples.push({
      timestampMs: t,
      opticalStepIndex: stepIndex,
      buffer: impaired,
      missedSincePrevious,
      reacquiring,
      classify,
    });

    lastEmitTs = t;
    t = nextT;
  }

  const recoveredBitcardBytesByStep = new Map<number, number>();
  for (const s of samples) {
    if (s.classify.classification.kind === "bitcard") {
      if (!recoveredBitcardBytesByStep.has(s.opticalStepIndex)) {
        recoveredBitcardBytesByStep.set(
          s.opticalStepIndex,
          s.classify.classification.byte,
        );
      }
    }
  }

  return {
    plan,
    samples,
    missedSampleCount,
    reacquisitionCount,
    recoveredBitcardBytesByStep,
  };
}

/**
 * Extract LENGTH + DATA bytes from a clean (or recovered) step→byte map using the plan.
 * Does not invent skipped transmitter dwells.
 */
export function bitcardBytesFromPlanSteps(
  plan: TextFlashRenderPlan,
  byStep: Map<number, number>,
): { length: number | null; data: number[] } {
  let length: number | null = null;
  const data: number[] = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    if (step.kind === "length" || step.kind === "data") {
      const b = byStep.get(i);
      if (b === undefined) continue;
      if (step.kind === "length") length = b;
      else data.push(b);
    }
  }
  return { length, data };
}

export function expectedBitcardBytesFromPlan(
  plan: TextFlashRenderPlan,
): { length: number; data: number[] } {
  const lengthStep = plan.steps.find((s) => s.kind === "length");
  const length = lengthStep?.byte ?? 0;
  const data = plan.steps
    .filter((s) => s.kind === "data")
    .map((s) => s.byte!);
  return { length, data };
}

/** Diagnostics snapshot from the latest sample (for TF2 tests / future receiver). */
export function latestSampleDiagnostics(
  result: TextFlashSyntheticChannelResult,
): TextFlashClassificationDiagnostics | null {
  const last = result.samples[result.samples.length - 1];
  return last ? last.classify.diagnostics : null;
}

export { sameOpticalClass } from "./text-flash-classifier";
