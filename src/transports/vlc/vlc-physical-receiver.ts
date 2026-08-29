import { VlcOokReceiver, type OpticalSource, type VlcReceiverFrameEvent } from "./vlc-receiver";
import { extractCenterRoiAverage } from "./vlc-demodulator";
import { opticalDiagnosticTrace } from "../../diagnostics/optical-trace";

export type PhysicalVlcState = "CALIBRATING" | "SEARCHING_CLOCK" | "SEARCHING_SYNC"
  | "LOCKED_RECEIVING" | "FRAME_DECODED" | "SIGNAL_TOO_WEAK" | "CLOCK_LOST"
  | "INVALID_MANCHESTER" | "CRC_FAILED" | "REACQUIRING";

export interface PhysicalVlcDiagnostics {
  state: PhysicalVlcState;
  message: string;
  dynamicRange: number;
  chipRate: number;
  invalidManchesterPairs: number;
  validFramesCount: number;
  corruptFramesCount: number;
  crcStatus: string;
  sampledLuminance: number;
  lowEstimate: number;
  highEstimate: number;
  adaptiveThreshold: number;
  contrastPercent: number;
  observationGapMs: number;
  observations: number;
  transitions: number;
  recoveredChips: number;
  recoveredBits: number;
  clockResets: number;
  softReacquisitions: number;
  phaseErrorMs: number;
  barkerCorrelation: number;
  syncLocks: number;
  bufferedFrameBits: number;
  expectedFrameBits: number | null;
  frameProgressPercent: number;
  lastRejectedReason: string | null;
  timingLocked: boolean;
}

interface TimedLevel {
  at: number;
  level: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const weight = rank - lo;
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight;
}

export class PhysicalVlcReceiver {
  private chipPeriodMs: number;
  private readonly configuredChipPeriodMs: number;
  /** Stricter Barker (10/11) reduces false locks that never yield valid headers. */
  private readonly decoders = [
    new VlcOokReceiver({ barkerSyncThreshold: 10 / 11 }),
    new VlcOokReceiver({ barkerSyncThreshold: 10 / 11 }),
  ];
  private readonly listeners = new Set<(event: VlcReceiverFrameEvent) => void>();
  private low = 255;
  private high = 0;
  private adaptiveThreshold = 128;
  private readonly luminanceWindow: number[] = [];
  private previousLevel: number | null = null;
  private previousAt = 0;
  private lastTransitionAt: number | null = null;
  private nextCenterAt: number | null = null;
  private chips: number[] = [];
  private pairsProcessed = [0, 0];
  private invalidPairs = 0;
  private state: PhysicalVlcState = "CALIBRATING";
  private emittedFrames = 0;
  private sampledLuminance = 0;
  private observationGapMs = 0;
  private observations = 0;
  private transitions = 0;
  private recoveredChips = 0;
  private clockResets = 0;
  private softReacquisitions = 0;
  private phaseErrorMs = 0;
  private readonly sampleVotes: TimedLevel[] = [];

  constructor(chipRate = 10) {
    if (!Number.isFinite(chipRate) || chipRate <= 0) throw new RangeError("VLC chip rate must be positive");
    this.chipPeriodMs = 1000 / chipRate;
    this.configuredChipPeriodMs = this.chipPeriodMs;
    for (const decoder of this.decoders) decoder.onFrame((event) => {
      this.emittedFrames++;
      this.state = "FRAME_DECODED";
      opticalDiagnosticTrace.record("PhysicalVlcReceiver", "frame-emitted", {
        frameSequence: event.frame.seqNumber, payloadLength: event.rawPayload.length,
      });
      for (const listener of this.listeners) listener(event);
    });
  }

  ingestFrame(source: OpticalSource, capturedAt = performance.now()): PhysicalVlcDiagnostics {
    const normalized = this.normalize(source);
    if (!normalized || !Number.isFinite(capturedAt)) {
      opticalDiagnosticTrace.record("PhysicalVlcReceiver", "observation-rejected", { reason: "invalid-camera-source" }, capturedAt);
      return this.getDiagnostics();
    }
    const { luminance } = extractCenterRoiAverage(normalized, 0.5);
    return this.ingestSample(luminance, capturedAt);
  }

  ingestSample(luminance: number, capturedAt: number): PhysicalVlcDiagnostics {
    if (!Number.isFinite(luminance) || !Number.isFinite(capturedAt)) {
      opticalDiagnosticTrace.record("PhysicalVlcReceiver", "observation-rejected", { reason: "non-finite-luminance-or-timestamp" });
      return this.getDiagnostics();
    }
    const previousState = this.state;
    this.sampledLuminance = luminance;
    this.observations++;
    this.observationGapMs = this.previousLevel === null && this.previousAt === 0
      ? 0
      : capturedAt - this.previousAt;

    // Soft stall: keep frame/Barker state, force chip re-lock. Hard stall: full reset.
    // Use previousLevel (not previousAt>0) so a first sample at t=0 still arms gap detection.
    if (this.previousLevel !== null && capturedAt - this.previousAt > this.chipPeriodMs * 1.5) {
      const gap = capturedAt - this.previousAt;
      const softLimit = this.configuredChipPeriodMs * 4;
      if (gap <= softLimit && (this.state === "LOCKED_RECEIVING" || this.state === "SEARCHING_SYNC" || this.state === "REACQUIRING" || this.state === "SEARCHING_CLOCK")) {
        this.softReacquire(capturedAt);
        return this.traceObservation(capturedAt, previousState);
      }
      this.resetClock("CLOCK_LOST");
      this.previousAt = capturedAt;
      return this.traceObservation(capturedAt, previousState);
    }

    this.luminanceWindow.push(luminance);
    if (this.luminanceWindow.length > 60) this.luminanceWindow.shift();
    const sorted = this.luminanceWindow.slice().sort((a, b) => a - b);
    this.low = percentile(sorted, 0.1);
    this.high = percentile(sorted, 0.9);
    const mid = (this.low + this.high) / 2;
    this.adaptiveThreshold = this.adaptiveThreshold * 0.85 + mid * 0.15;
    const range = this.high - this.low;

    if (range < 12) {
      // Keep timeline alive so AE dips do not invent a multi-chip stall → CLOCK_LOST.
      this.state = "SIGNAL_TOO_WEAK";
      this.previousAt = capturedAt;
      return this.traceObservation(capturedAt, previousState);
    }

    const level = luminance >= this.adaptiveThreshold ? 1 : 0;
    this.sampleVotes.push({ at: capturedAt, level });
    while (this.sampleVotes.length > 0 && this.sampleVotes[0]!.at < capturedAt - this.chipPeriodMs * 4) {
      this.sampleVotes.shift();
    }

    if (this.previousLevel === null) {
      this.previousLevel = level;
      this.previousAt = capturedAt;
      if (this.state !== "REACQUIRING") this.state = "SEARCHING_CLOCK";
      return this.traceObservation(capturedAt, previousState);
    }

    if (this.nextCenterAt === null && level !== this.previousLevel) {
      this.transitions++;
      const boundary = (this.previousAt + capturedAt) / 2;
      this.commitChip(this.previousLevel);
      this.nextCenterAt = boundary + this.chipPeriodMs / 2;
      this.lastTransitionAt = boundary;
      this.state = "SEARCHING_SYNC";
    } else if (this.nextCenterAt !== null && level !== this.previousLevel) {
      this.transitions++;
      const boundary = (this.previousAt + capturedAt) / 2;
      if (this.lastTransitionAt !== null) {
        const elapsed = boundary - this.lastTransitionAt;
        const elapsedChips = Math.max(1, Math.round(elapsed / this.chipPeriodMs));
        const measuredPeriod = elapsed / elapsedChips;
        if (measuredPeriod >= this.configuredChipPeriodMs * 0.75
          && measuredPeriod <= this.configuredChipPeriodMs * 1.35) {
          this.chipPeriodMs = this.chipPeriodMs * 0.9 + measuredPeriod * 0.1;
        }
      }
      const precedingBoundary = this.nextCenterAt - this.chipPeriodMs / 2;
      const nearestBoundary = precedingBoundary
        + Math.round((boundary - precedingBoundary) / this.chipPeriodMs) * this.chipPeriodMs;
      const phaseError = Math.max(-this.chipPeriodMs / 4,
        Math.min(this.chipPeriodMs / 4, boundary - nearestBoundary));
      this.phaseErrorMs = phaseError;
      this.nextCenterAt += phaseError * 0.25;
      this.lastTransitionAt = boundary;
    }

    if (this.nextCenterAt !== null) {
      // Finalize chip centers once enough of the chip window has been observed (majority vote).
      const voteHalf = this.chipPeriodMs * 0.35;
      while (capturedAt >= this.nextCenterAt + voteHalf) {
        const center = this.nextCenterAt;
        const chipLevel = this.voteChipLevel(center, voteHalf);
        this.commitChip(chipLevel);
        this.nextCenterAt += this.chipPeriodMs;
      }
      this.decodeAvailablePairs();
    }

    this.previousLevel = level;
    this.previousAt = capturedAt;
    return this.traceObservation(capturedAt, previousState);
  }

  private voteChipLevel(center: number, halfWindow: number): number {
    let ones = 0;
    let n = 0;
    for (const sample of this.sampleVotes) {
      if (sample.at >= center - halfWindow && sample.at <= center + halfWindow) {
        n++;
        if (sample.level === 1) ones++;
      }
    }
    if (n === 0) return this.previousLevel ?? 0;
    return ones * 2 >= n ? 1 : 0;
  }

  private commitChip(level: number): void {
    this.chips.push(level);
    this.recoveredChips++;
  }

  private softReacquire(capturedAt: number): void {
    this.state = "REACQUIRING";
    this.softReacquisitions++;
    this.nextCenterAt = null;
    this.lastTransitionAt = null;
    this.previousLevel = null;
    this.previousAt = capturedAt;
    this.sampleVotes.length = 0;
    // Drop unaligned chip stream, but keep VlcOokReceiver bit/header buffers (partial progress).
    this.chips = [];
    this.pairsProcessed = [0, 0];
    opticalDiagnosticTrace.record("PhysicalVlcReceiver", "soft-reacquire", {
      softReacquisitions: this.softReacquisitions,
      gapMs: this.observationGapMs,
    }, capturedAt);
  }

  private decodeAvailablePairs(): void {
    let anyPhaseLocked = false;
    let anyPhaseReceived = false;
    let anyPhaseCrcFailed = false;
    let anyPhaseInvalid = false;

    for (let phase = 0; phase < 2; phase++) {
      while (phase + this.pairsProcessed[phase]! * 2 + 1 < this.chips.length) {
        const index = phase + this.pairsProcessed[phase]! * 2;
        const first = this.chips[index]!;
        const second = this.chips[index + 1]!;
        this.pairsProcessed[phase]!++;
        if (first === second) {
          this.invalidPairs++;
          anyPhaseInvalid = true;
          continue;
        }
        const bit = first === 1 && second === 0 ? 1 : 0;
        const diagnostics = this.decoders[phase]!.ingestLuminanceSample(bit ? 255 : 0);
        if (diagnostics.state === "LOCKED_RECEIVING" || diagnostics.state === "FRAME_DECODED") {
          anyPhaseLocked = true;
        }
        if (diagnostics.crcStatus === "invalid") anyPhaseCrcFailed = true;
        anyPhaseReceived = true;
      }
    }
    if (this.state !== "FRAME_DECODED" && this.state !== "REACQUIRING") {
      if (anyPhaseLocked) {
        this.state = "LOCKED_RECEIVING";
      } else if (anyPhaseCrcFailed) {
        this.state = "CRC_FAILED";
      } else if (anyPhaseReceived) {
        this.state = "SEARCHING_SYNC";
      } else if (anyPhaseInvalid && this.state !== "SEARCHING_SYNC" && this.state !== "LOCKED_RECEIVING") {
        this.state = "INVALID_MANCHESTER";
      }
    }
    if (this.chips.length > 16_384) {
      this.state = "CLOCK_LOST";
      this.chips = this.chips.slice(-2);
      this.pairsProcessed = [0, 0];
      this.nextCenterAt = null;
    }
  }

  private resetClock(state: PhysicalVlcState): void {
    this.state = state;
    this.previousLevel = null;
    this.nextCenterAt = null;
    this.lastTransitionAt = null;
    this.chips = [];
    this.pairsProcessed = [0, 0];
    this.sampleVotes.length = 0;
    this.clockResets++;
    for (const decoder of this.decoders) decoder.reset();
  }

  private traceObservation(capturedAt: number, previousState: PhysicalVlcState): PhysicalVlcDiagnostics {
    const diagnostics = this.getDiagnostics();
    opticalDiagnosticTrace.record("PhysicalVlcReceiver", "camera-observation", {
      luminance: diagnostics.sampledLuminance, low: diagnostics.lowEstimate, high: diagnostics.highEstimate,
      dynamicRange: diagnostics.dynamicRange, adaptiveThreshold: diagnostics.adaptiveThreshold,
      contrastPercent: diagnostics.contrastPercent, gapMs: diagnostics.observationGapMs,
      state: diagnostics.state, previousState, transitions: diagnostics.transitions,
      recoveredChips: diagnostics.recoveredChips, recoveredBits: diagnostics.recoveredBits,
      clockResets: diagnostics.clockResets, softReacquisitions: diagnostics.softReacquisitions,
      phaseErrorMs: diagnostics.phaseErrorMs, invalidManchesterPairs: diagnostics.invalidManchesterPairs,
      barkerCorrelation: diagnostics.barkerCorrelation, syncLocks: diagnostics.syncLocks,
      bufferedFrameBits: diagnostics.bufferedFrameBits, expectedFrameBits: diagnostics.expectedFrameBits,
      frameProgressPercent: diagnostics.frameProgressPercent, timingLocked: diagnostics.timingLocked,
    }, capturedAt);
    return diagnostics;
  }

  onFrame(listener: (event: VlcReceiverFrameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getDiagnostics(): PhysicalVlcDiagnostics {
    const decoderScore = (item: ReturnType<VlcOokReceiver["getDiagnostics"]>) => item.validFramesCount * 1_000_000_000
      + (item.expectedFrameBits !== null ? 1_000_000 : 0) + item.bufferedFrameBits * 100
      + item.syncLocksAcquired * 10 + item.bestBarkerCorrelation;
    const decoder = this.decoders.map((item) => item.getDiagnostics())
      .sort((a, b) => decoderScore(b) - decoderScore(a))[0]!;
    const dynamicRange = Math.max(0, this.high - this.low);
    const contrastPercent = dynamicRange <= 0 ? 0 : Math.min(100, (dynamicRange / 255) * 100);
    const expected = decoder.expectedFrameBits;
    const buffered = decoder.bufferedFrameBits;
    const frameProgressPercent = expected && expected > 0
      ? Math.min(99, Math.round((100 * Math.min(buffered, expected)) / expected))
      : 0;
    const timingLocked = this.nextCenterAt !== null
      && (this.state === "LOCKED_RECEIVING" || this.state === "SEARCHING_SYNC" || this.state === "FRAME_DECODED");
    const messages: Record<PhysicalVlcState, string> = {
      CALIBRATING: "Point the camera at the full VLC signal area.",
      SEARCHING_CLOCK: "Signal detected; waiting for a clear light transition.",
      SEARCHING_SYNC: "Timing locked; searching for Barker preamble.",
      LOCKED_RECEIVING: "Preamble locked; receiving VLC header/payload (CRC pending).",
      FRAME_DECODED: "VLC frame CRC passed.",
      SIGNAL_TOO_WEAK: "Signal too weak / low contrast. Brighten screen, reduce glare, fill the target box.",
      CLOCK_LOST: "Camera timing stall. Hold steady — receiver will reacquire.",
      REACQUIRING: "Camera gap — reacquiring chip timing without discarding search state.",
      INVALID_MANCHESTER: "Unstable Manchester pairs. Hold the camera steady and avoid reflections.",
      CRC_FAILED: "Header/payload seen but CRC failed. Sender will repeat; keep aiming.",
    };
    return {
      state: this.state,
      message: messages[this.state],
      dynamicRange,
      chipRate: 1000 / this.chipPeriodMs,
      invalidManchesterPairs: this.invalidPairs,
      validFramesCount: this.emittedFrames,
      corruptFramesCount: decoder.corruptFramesCount,
      crcStatus: decoder.crcStatus,
      sampledLuminance: this.sampledLuminance,
      lowEstimate: this.low,
      highEstimate: this.high,
      adaptiveThreshold: this.adaptiveThreshold,
      contrastPercent,
      observationGapMs: this.observationGapMs,
      observations: this.observations,
      transitions: this.transitions,
      recoveredChips: this.recoveredChips,
      recoveredBits: decoder.totalBitsRecovered,
      clockResets: this.clockResets,
      softReacquisitions: this.softReacquisitions,
      phaseErrorMs: this.phaseErrorMs,
      barkerCorrelation: decoder.bestBarkerCorrelation,
      syncLocks: decoder.syncLocksAcquired,
      bufferedFrameBits: buffered,
      expectedFrameBits: expected,
      frameProgressPercent: this.state === "FRAME_DECODED" ? 100 : frameProgressPercent,
      lastRejectedReason: decoder.lastRejectedReason,
      timingLocked,
    };
  }

  private normalize(source: OpticalSource) {
    if ("data" in source && typeof source.width === "number" && typeof source.height === "number") return source;
    if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
      const context = source.getContext("2d");
      return context ? context.getImageData(0, 0, source.width, source.height) : null;
    }
    return null;
  }
}
