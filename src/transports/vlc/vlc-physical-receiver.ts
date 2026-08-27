import { VlcOokReceiver, type OpticalSource, type VlcReceiverFrameEvent } from "./vlc-receiver";
import { extractCenterRoiAverage } from "./vlc-demodulator";

export type PhysicalVlcState = "CALIBRATING" | "SEARCHING_CLOCK" | "SEARCHING_SYNC"
  | "LOCKED_RECEIVING" | "FRAME_DECODED" | "SIGNAL_TOO_WEAK" | "CLOCK_LOST"
  | "INVALID_MANCHESTER" | "CRC_FAILED";

export interface PhysicalVlcDiagnostics {
  state: PhysicalVlcState;
  message: string;
  dynamicRange: number;
  chipRate: number;
  invalidManchesterPairs: number;
  validFramesCount: number;
  corruptFramesCount: number;
  crcStatus: string;
}

export class PhysicalVlcReceiver {
  private chipPeriodMs: number;
  private readonly decoders = [new VlcOokReceiver(), new VlcOokReceiver()];
  private readonly listeners = new Set<(event: VlcReceiverFrameEvent) => void>();
  private low = 255;
  private high = 0;
  private previousLevel: number | null = null;
  private previousAt = 0;
  private lastTransitionAt: number | null = null;
  private nextCenterAt: number | null = null;
  private chips: number[] = [];
  private pairsProcessed = [0, 0];
  private invalidPairs = 0;
  private state: PhysicalVlcState = "CALIBRATING";
  private emittedFrames = 0;

  constructor(chipRate = 10) {
    if (!Number.isFinite(chipRate) || chipRate <= 0) throw new RangeError("VLC chip rate must be positive");
    this.chipPeriodMs = 1000 / chipRate;
    for (const decoder of this.decoders) decoder.onFrame((event) => {
      this.emittedFrames++;
      this.state = "FRAME_DECODED";
      for (const listener of this.listeners) listener(event);
    });
  }

  ingestFrame(source: OpticalSource, capturedAt = performance.now()): PhysicalVlcDiagnostics {
    const normalized = this.normalize(source);
    if (!normalized || !Number.isFinite(capturedAt)) return this.getDiagnostics();
    const { luminance } = extractCenterRoiAverage(normalized, 0.5);
    return this.ingestSample(luminance, capturedAt);
  }

  ingestSample(luminance: number, capturedAt: number): PhysicalVlcDiagnostics {
    if (!Number.isFinite(luminance) || !Number.isFinite(capturedAt)) return this.getDiagnostics();
    this.low = Math.min(this.low, luminance);
    this.high = Math.max(this.high, luminance);
    const range = this.high - this.low;
    if (range < 20) {
      this.state = "SIGNAL_TOO_WEAK";
      return this.getDiagnostics();
    }
    const level = luminance >= (this.low + this.high) / 2 ? 1 : 0;
    if (this.previousLevel === null) {
      this.previousLevel = level;
      this.previousAt = capturedAt;
      this.state = "SEARCHING_CLOCK";
      return this.getDiagnostics();
    }
    if (this.nextCenterAt === null && level !== this.previousLevel) {
      const boundary = (this.previousAt + capturedAt) / 2;
      this.chips.push(this.previousLevel);
      this.nextCenterAt = boundary + this.chipPeriodMs / 2;
      this.lastTransitionAt = boundary;
      this.state = "SEARCHING_SYNC";
    } else if (this.nextCenterAt !== null && level !== this.previousLevel) {
      const boundary = (this.previousAt + capturedAt) / 2;
      if (this.lastTransitionAt !== null) {
        const elapsed = boundary - this.lastTransitionAt;
        const elapsedChips = Math.max(1, Math.round(elapsed / this.chipPeriodMs));
        const measuredPeriod = elapsed / elapsedChips;
        if (measuredPeriod >= this.chipPeriodMs * 0.8 && measuredPeriod <= this.chipPeriodMs * 1.2) {
          this.chipPeriodMs = this.chipPeriodMs * 0.9 + measuredPeriod * 0.1;
        }
      }
      const precedingBoundary = this.nextCenterAt - this.chipPeriodMs / 2;
      const nearestBoundary = precedingBoundary
        + Math.round((boundary - precedingBoundary) / this.chipPeriodMs) * this.chipPeriodMs;
      const phaseError = Math.max(-this.chipPeriodMs / 4,
        Math.min(this.chipPeriodMs / 4, boundary - nearestBoundary));
      this.nextCenterAt += phaseError * 0.25;
      this.lastTransitionAt = boundary;
    }
    if (this.nextCenterAt !== null) {
      while (capturedAt >= this.nextCenterAt) {
        this.chips.push(level);
        this.nextCenterAt += this.chipPeriodMs;
      }
      this.decodeAvailablePairs();
    }
    this.previousLevel = level;
    this.previousAt = capturedAt;
    return this.getDiagnostics();
  }

  private decodeAvailablePairs(): void {
    for (let phase = 0; phase < 2; phase++) {
      while (phase + this.pairsProcessed[phase] * 2 + 1 < this.chips.length) {
        const index = phase + this.pairsProcessed[phase] * 2;
        const first = this.chips[index];
        const second = this.chips[index + 1];
        this.pairsProcessed[phase]++;
        if (first === second) {
          this.invalidPairs++;
          this.state = "INVALID_MANCHESTER";
          continue;
        }
        const bit = first === 1 && second === 0 ? 1 : 0;
        const diagnostics = this.decoders[phase].ingestLuminanceSample(bit ? 255 : 0);
        if (diagnostics.state === "LOCKED_RECEIVING") this.state = "LOCKED_RECEIVING";
        if (diagnostics.crcStatus === "invalid") this.state = "CRC_FAILED";
      }
    }
    if (this.chips.length > 16_384) {
      this.state = "CLOCK_LOST";
      this.chips = this.chips.slice(-2);
      this.pairsProcessed = [0, 0];
      this.nextCenterAt = null;
    }
  }

  onFrame(listener: (event: VlcReceiverFrameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getDiagnostics(): PhysicalVlcDiagnostics {
    const decoder = this.decoders.map((item) => item.getDiagnostics())
      .sort((a, b) => b.validFramesCount - a.validFramesCount)[0];
    const dynamicRange = Math.max(0, this.high - this.low);
    const messages: Record<PhysicalVlcState, string> = {
      CALIBRATING: "Point the camera at the full VLC signal area.",
      SEARCHING_CLOCK: "Light detected; waiting for a clear transition.",
      SEARCHING_SYNC: "Clock detected; searching for the VLC preamble.",
      LOCKED_RECEIVING: "VLC synchronized; receiving frame data.",
      FRAME_DECODED: "VLC frame received successfully.",
      SIGNAL_TOO_WEAK: "Camera cannot distinguish light levels. Increase screen brightness, reduce glare, and fill the target box.",
      CLOCK_LOST: "VLC timing was lost. Hold both devices steady and verify the chip rate.",
      INVALID_MANCHESTER: "Unstable VLC signal. Hold the camera steady and avoid display reflections.",
      CRC_FAILED: "A VLC frame was seen but corrupted. Hold steady; the sender will repeat it.",
    };
    return { state: this.state, message: messages[this.state], dynamicRange,
      chipRate: 1000 / this.chipPeriodMs, invalidManchesterPairs: this.invalidPairs,
      validFramesCount: this.emittedFrames, corruptFramesCount: decoder.corruptFramesCount,
      crcStatus: decoder.crcStatus };
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
