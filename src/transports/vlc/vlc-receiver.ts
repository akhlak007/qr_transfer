/** Unified, explicitly configured VLC optical receiver (Phase 8C.2). */

import { BARKER_11_BITS, decodeVlcFrame, type VlcDecodedFrame, type VlcModulationScheme } from "./vlc-framing";
import { extractCenterRoiAverage } from "./vlc-demodulator";
import {
  FrameType,
  decodeMetadataFrame,
  decodeSequentialFrame,
  decodeFountainFrame,
  type FileMetadata,
  type SequentialFrame,
  type FountainFrame,
} from "../../modules/protocol";
import { FountainDecoder } from "../../modules/fountain";
import { sha256Hex } from "../../core/integrity";
import type { RGBColor } from "./vlc-modulator";
import {
  createVlcSymbolDecoder,
  type VlcReceiverModulation,
  type VlcSymbolDecoder,
} from "./vlc-symbol-decoders";

export type { VlcReceiverModulation } from "./vlc-symbol-decoders";

export type CrcStatus = "valid" | "invalid" | "pending" | "none";
export type ReceiverState = "IDLE" | "SEARCHING_SYNC" | "LOCKED_RECEIVING" | "FRAME_DECODED";

export interface VlcReceiverConfig {
  modulation: VlcReceiverModulation;
  roiFraction: number;
  barkerSyncThreshold: number;
  minDynamicRange: number;
  adaptiveSmoothingAlpha: number;
  initialThreshold: number;
  maxBitBufferSize: number;
}

export const DEFAULT_VLC_RECEIVER_CONFIG: VlcReceiverConfig = {
  modulation: "ook",
  roiFraction: 0.5,
  barkerSyncThreshold: 0.8,
  minDynamicRange: 10,
  adaptiveSmoothingAlpha: 0.15,
  initialThreshold: 128,
  maxBitBufferSize: 8192,
};

export interface VlcReceiverDiagnostics {
  state: ReceiverState;
  activeModulation: VlcReceiverModulation;
  sampledLuminance: number;
  sampledRgb: RGBColor;
  adaptiveThreshold: number;
  adaptiveThresholds: number[];
  symbolTimingLock: boolean;
  decodedSymbols: number[];
  symbolErrorEstimate: number;
  colorClassificationConfidence: number;
  colorDistance: number;
  recoveredBits: number[];
  crcStatus: CrcStatus;
  frameSequence: number | null;
  snrEstimateDb: number;
  totalSamplesIngested: number;
  totalBitsRecovered: number;
  totalFramesDecoded: number;
  validFramesCount: number;
  corruptFramesCount: number;
  syncLocksAcquired: number;
  fountainSymbolsAccepted: number;
  fountainBlocksResolved: number;
  isFountainComplete: boolean;
}

export interface VlcReceiverFrameEvent {
  frame: VlcDecodedFrame;
  metadataFrame: FileMetadata | null;
  sequentialFrame: SequentialFrame | null;
  fountainFrame: FountainFrame | null;
  rawPayload: Uint8Array;
  diagnostics: VlcReceiverDiagnostics;
}

export type VlcFrameCallback = (event: VlcReceiverFrameEvent) => void;

export type OpticalSource =
  | ImageData
  | HTMLCanvasElement
  | HTMLVideoElement
  | { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

function framingModulation(modulation: VlcReceiverModulation): VlcModulationScheme {
  return modulation === "4pam" ? "pam4" : modulation;
}

export class VlcReceiver {
  private readonly config: VlcReceiverConfig;
  private readonly symbolDecoder: VlcSymbolDecoder;
  private state: ReceiverState = "IDLE";
  private currentLuminance = 0;
  private currentRgb: RGBColor = [0, 0, 0];
  private bitBuffer: number[] = [];
  private syncSearchBits: number[] = [];
  private recentBitsWindow: number[] = [];
  private recentSymbols: number[] = [];
  private symbolTimingLock = false;
  private receivingFrame = false;
  private crcStatus: CrcStatus = "none";
  private lastFrameSequence: number | null = null;
  private symbolErrorEstimate = 0;
  private colorClassificationConfidence = 0;
  private colorDistance = 0;
  private totalSamples = 0;
  private totalBits = 0;
  private totalFramesDecoded = 0;
  private validFramesCount = 0;
  private corruptFramesCount = 0;
  private syncLocksAcquired = 0;
  private metadata: FileMetadata | null = null;
  private fountainDecoder: FountainDecoder | null = null;
  private fountainBlockSize = 0;
  private sequentialBlocks = new Map<number, Uint8Array>();
  private reconstructedPayload: Uint8Array | null = null;
  private cachedSha256: string | null = null;
  private frameListeners = new Set<VlcFrameCallback>();

  constructor(config: Partial<VlcReceiverConfig> & Pick<VlcReceiverConfig, "modulation">) {
    this.config = { ...DEFAULT_VLC_RECEIVER_CONFIG, ...config };
    this.validateConfig();
    this.symbolDecoder = createVlcSymbolDecoder(this.config.modulation, this.config);
  }

  ingestFrame(source: OpticalSource): VlcReceiverDiagnostics {
    const rawData = this.normalizeSourceToBuffer(source);
    if (!rawData) return this.getDiagnostics();
    const { rgb, luminance } = extractCenterRoiAverage(rawData, this.config.roiFraction);
    return this.ingestLuminanceSample(luminance, rgb);
  }

  ingestLuminanceSample(luminance: number, rgb?: RGBColor): VlcReceiverDiagnostics {
    if (!Number.isFinite(luminance) || rgb?.some((channel) => !Number.isFinite(channel))) {
      return this.getDiagnostics();
    }
    this.totalSamples++;
    this.currentLuminance = luminance;
    this.currentRgb = rgb ? [...rgb] : [luminance, luminance, luminance];
    const sample = { luminance, rgb: this.currentRgb };
    this.symbolDecoder.update(sample);

    if (!this.receivingFrame) {
      this.processSyncSample(this.symbolDecoder.preambleBit(sample));
    } else {
      const decision = this.symbolDecoder.decode(sample);
      this.symbolErrorEstimate = decision.errorEstimate;
      this.colorClassificationConfidence = decision.colorConfidence;
      this.colorDistance = decision.colorDistance;
      this.recentSymbols.push(decision.symbol);
      if (this.recentSymbols.length > 32) this.recentSymbols.shift();
      this.appendRecoveredBits(decision.bits);
      this.processFrameBits();
    }
    return this.getDiagnostics();
  }

  private processSyncSample(bit: number): void {
    this.state = "SEARCHING_SYNC";
    this.symbolTimingLock = false;
    this.syncSearchBits.push(bit);
    if (this.syncSearchBits.length > BARKER_11_BITS.length * 4) this.syncSearchBits.shift();
    const syncIndex = this.findSyncIndex(this.syncSearchBits, this.config.barkerSyncThreshold);
    if (syncIndex < 0) return;
    this.symbolTimingLock = true;
    this.receivingFrame = true;
    this.syncLocksAcquired++;
    this.state = "LOCKED_RECEIVING";
    this.crcStatus = "pending";
    this.syncSearchBits = [];
    this.bitBuffer = [];
  }

  private appendRecoveredBits(bits: number[]): void {
    this.bitBuffer.push(...bits);
    this.totalBits += bits.length;
    this.recentBitsWindow.push(...bits);
    if (this.recentBitsWindow.length > 32) {
      this.recentBitsWindow.splice(0, this.recentBitsWindow.length - 32);
    }
    if (this.bitBuffer.length > this.config.maxBitBufferSize) {
      this.bitBuffer.splice(0, this.bitBuffer.length - this.config.maxBitBufferSize);
    }
  }

  private processFrameBits(): void {
    if (this.bitBuffer.length < 64) return;
    const header = this.extractBytesFromBits(this.bitBuffer, 0, 8);
    if (header[0] !== 0x56 || header[1] !== 0x4c || header[2] !== 1) {
      this.loseLock(false);
      return;
    }

    const payloadLength = (header[6] << 8) | header[7];
    const totalFrameBytes = 8 + payloadLength + 2;
    const totalFrameBits = totalFrameBytes * 8;
    this.lastFrameSequence = (header[4] << 8) | header[5];
    if (totalFrameBits > this.config.maxBitBufferSize) {
      this.totalFramesDecoded++;
      this.crcStatus = "invalid";
      this.corruptFramesCount++;
      this.loseLock(true);
      return;
    }
    if (this.bitBuffer.length < totalFrameBits) return;

    const decodedFrame = decodeVlcFrame(this.extractBytesFromBits(this.bitBuffer, 0, totalFrameBytes));
    this.totalFramesDecoded++;
    const matchesConfiguredModulation = decodedFrame?.modulation === framingModulation(this.config.modulation);
    if (decodedFrame?.isValidCrc && matchesConfiguredModulation) {
      this.crcStatus = "valid";
      this.validFramesCount++;
      this.lastFrameSequence = decodedFrame.seqNumber;
      this.state = "FRAME_DECODED";
      this.handleDecodedFrame(decodedFrame);
      this.loseLock(true);
      this.symbolTimingLock = true;
    } else {
      this.crcStatus = "invalid";
      this.corruptFramesCount++;
      this.loseLock(true);
    }
  }

  private loseLock(preserveCrc: boolean): void {
    this.receivingFrame = false;
    this.symbolTimingLock = false;
    this.bitBuffer = [];
    this.syncSearchBits = [];
    if (!preserveCrc) this.crcStatus = "pending";
  }

  private handleDecodedFrame(decodedFrame: VlcDecodedFrame): void {
    const rawPayload = decodedFrame.payload;
    let metadataFrame: FileMetadata | null = null;
    let sequentialFrame: SequentialFrame | null = null;
    let fountainFrame: FountainFrame | null = null;
    if (rawPayload.length > 0) {
      const type = rawPayload[0] as FrameType;
      if (type === FrameType.Metadata) {
        try {
          metadataFrame = decodeMetadataFrame(rawPayload);
          const incompatibleTransfer = this.metadata !== null && (
            this.metadata.fileSize !== metadataFrame.fileSize
            || this.metadata.blockSize !== metadataFrame.blockSize
            || this.metadata.totalBlocks !== metadataFrame.totalBlocks
            || this.metadata.fileName !== metadataFrame.fileName
          );
          if (incompatibleTransfer) {
            this.fountainDecoder = null;
            this.sequentialBlocks.clear();
            this.reconstructedPayload = null;
            this.cachedSha256 = null;
          }
          this.metadata = metadataFrame;
          this.fountainBlockSize = metadataFrame.blockSize;
          this.fountainDecoder ??= new FountainDecoder(metadataFrame.totalBlocks, metadataFrame.blockSize);
        } catch { /* malformed protocol payload */ }
      } else if (type === FrameType.Sequential) {
        try {
          sequentialFrame = decodeSequentialFrame(rawPayload);
          this.sequentialBlocks.set(sequentialFrame.blockIndex, sequentialFrame.payload);
          this.checkSequentialCompletion();
        } catch { /* malformed protocol payload */ }
      } else if (type === FrameType.Fountain) {
        try {
          fountainFrame = decodeFountainFrame(rawPayload);
          this.fountainBlockSize = fountainFrame.payload.length;
          this.fountainDecoder ??= new FountainDecoder(fountainFrame.totalBlocks, fountainFrame.payload.length);
          if (this.fountainDecoder.processSymbol({
            seed: fountainFrame.seed,
            degree: fountainFrame.degree,
            payload: fountainFrame.payload,
          })) this.finalizeFountainReconstruction();
        } catch { /* malformed protocol payload */ }
      }
    }
    const event: VlcReceiverFrameEvent = {
      frame: decodedFrame,
      metadataFrame,
      sequentialFrame,
      fountainFrame,
      rawPayload,
      diagnostics: this.getDiagnostics(),
    };
    for (const listener of this.frameListeners) {
      try { listener(event); } catch (error) { console.error("VLC frame listener error:", error); }
    }
  }

  private checkSequentialCompletion(): void {
    if (!this.metadata || this.sequentialBlocks.size < this.metadata.totalBlocks) return;
    const fullBuffer = new Uint8Array(this.metadata.fileSize);
    let offset = 0;
    for (let index = 0; index < this.metadata.totalBlocks; index++) {
      const block = this.sequentialBlocks.get(index);
      if (!block) return;
      const length = Math.min(block.length, this.metadata.fileSize - offset);
      fullBuffer.set(block.subarray(0, length), offset);
      offset += length;
    }
    this.finishReconstruction(fullBuffer);
  }

  private finalizeFountainReconstruction(): void {
    if (!this.fountainDecoder?.isDone()) return;
    const blocks = this.fountainDecoder.getResolvedBlocks();
    const blockSize = this.fountainBlockSize || blocks[0]?.length || 0;
    const targetSize = this.metadata?.fileSize ?? blocks.length * blockSize;
    const fullBuffer = new Uint8Array(targetSize);
    let offset = 0;
    for (const block of blocks) {
      if (!block) return;
      const length = Math.min(block.length, targetSize - offset);
      fullBuffer.set(block.subarray(0, length), offset);
      offset += length;
    }
    this.finishReconstruction(fullBuffer);
  }

  private finishReconstruction(data: Uint8Array): void {
    this.reconstructedPayload = data;
    void sha256Hex(data).then((hash) => { this.cachedSha256 = hash; });
  }

  private extractBytesFromBits(bits: number[], startBit: number, numBytes: number): Uint8Array {
    const bytes = new Uint8Array(numBytes);
    for (let byte = 0; byte < numBytes; byte++) {
      for (let bit = 0; bit < 8; bit++) {
        bytes[byte] = (bytes[byte] << 1) | (bits[startBit + byte * 8 + bit] & 1);
      }
    }
    return bytes;
  }

  private findSyncIndex(bits: number[], minimumCorrelation: number): number {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index <= bits.length - BARKER_11_BITS.length; index++) {
      let matches = 0;
      for (let offset = 0; offset < BARKER_11_BITS.length; offset++) {
        if (bits[index + offset] === BARKER_11_BITS[offset]) matches++;
      }
      const score = matches / BARKER_11_BITS.length;
      if (score >= minimumCorrelation && score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    return bestIndex;
  }

  private normalizeSourceToBuffer(
    source: OpticalSource,
  ): { data: Uint8ClampedArray | Uint8Array; width: number; height: number } | null {
    if ("data" in source && typeof source.width === "number" && typeof source.height === "number") {
      const { width, height, data } = source;
      return Number.isInteger(width) && width > 0
        && Number.isInteger(height) && height > 0
        && data.length >= width * height * 4
        ? source
        : null;
    }
    if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
      const context = source.getContext("2d");
      return context && source.width > 0 && source.height > 0
        ? context.getImageData(0, 0, source.width, source.height)
        : null;
    }
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
      if (source.readyState < 2 || source.videoWidth === 0 || source.videoHeight === 0) return null;
      const canvas = document.createElement("canvas");
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(source, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    }
    return null;
  }

  onFrame(callback: VlcFrameCallback): () => void {
    this.frameListeners.add(callback);
    return () => { this.frameListeners.delete(callback); };
  }

  getDiagnostics(): VlcReceiverDiagnostics {
    return {
      state: this.state,
      activeModulation: this.config.modulation,
      sampledLuminance: this.currentLuminance,
      sampledRgb: [...this.currentRgb],
      adaptiveThreshold: this.symbolDecoder.getLegacyThreshold(),
      adaptiveThresholds: this.symbolDecoder.getAdaptiveThresholds(),
      symbolTimingLock: this.symbolTimingLock,
      decodedSymbols: [...this.recentSymbols],
      symbolErrorEstimate: this.symbolErrorEstimate,
      colorClassificationConfidence: this.colorClassificationConfidence,
      colorDistance: this.colorDistance,
      recoveredBits: [...this.recentBitsWindow],
      crcStatus: this.crcStatus,
      frameSequence: this.lastFrameSequence,
      snrEstimateDb: this.symbolDecoder.getSnrEstimateDb(),
      totalSamplesIngested: this.totalSamples,
      totalBitsRecovered: this.totalBits,
      totalFramesDecoded: this.totalFramesDecoded,
      validFramesCount: this.validFramesCount,
      corruptFramesCount: this.corruptFramesCount,
      syncLocksAcquired: this.syncLocksAcquired,
      fountainSymbolsAccepted: this.fountainDecoder?.totalProcessedSymbols ?? 0,
      fountainBlocksResolved: this.fountainDecoder?.getResolvedCount() ?? this.sequentialBlocks.size,
      isFountainComplete: this.isReconstructionComplete(),
    };
  }

  isReconstructionComplete(): boolean {
    return this.reconstructedPayload !== null
      || this.fountainDecoder?.isDone() === true
      || this.hasAllSequentialBlocks();
  }

  getReconstructedFile(): { data: Uint8Array; metadata: FileMetadata | null; cachedSha256: string | null } | null {
    return this.reconstructedPayload
      ? { data: this.reconstructedPayload, metadata: this.metadata, cachedSha256: this.cachedSha256 }
      : null;
  }

  async getReconstructedFileWithHash(): Promise<{ data: Uint8Array; sha256Hex: string; metadata: FileMetadata | null } | null> {
    if (!this.reconstructedPayload) return null;
    const hash = this.cachedSha256 ?? await sha256Hex(this.reconstructedPayload);
    return { data: this.reconstructedPayload, sha256Hex: hash, metadata: this.metadata };
  }

  getFountainDecoder(): FountainDecoder | null { return this.fountainDecoder; }
  getMetadata(): FileMetadata | null { return this.metadata; }

  reset(): void {
    this.state = "IDLE";
    this.currentLuminance = 0;
    this.currentRgb = [0, 0, 0];
    this.bitBuffer = [];
    this.syncSearchBits = [];
    this.recentBitsWindow = [];
    this.recentSymbols = [];
    this.symbolTimingLock = false;
    this.receivingFrame = false;
    this.crcStatus = "none";
    this.lastFrameSequence = null;
    this.symbolErrorEstimate = 0;
    this.colorClassificationConfidence = 0;
    this.colorDistance = 0;
    this.totalSamples = 0;
    this.totalBits = 0;
    this.totalFramesDecoded = 0;
    this.validFramesCount = 0;
    this.corruptFramesCount = 0;
    this.syncLocksAcquired = 0;
    this.metadata = null;
    this.fountainDecoder = null;
    this.fountainBlockSize = 0;
    this.sequentialBlocks.clear();
    this.reconstructedPayload = null;
    this.cachedSha256 = null;
    this.symbolDecoder.reset();
  }

  private hasAllSequentialBlocks(): boolean {
    if (!this.metadata) return false;
    for (let index = 0; index < this.metadata.totalBlocks; index++) {
      if (!this.sequentialBlocks.has(index)) return false;
    }
    return true;
  }

  private validateConfig(): void {
    if (!(this.config.roiFraction > 0 && this.config.roiFraction <= 1)) {
      throw new RangeError("VLC receiver roiFraction must be in (0, 1]");
    }
    if (!(this.config.barkerSyncThreshold > 0 && this.config.barkerSyncThreshold <= 1)) {
      throw new RangeError("VLC receiver barkerSyncThreshold must be in (0, 1]");
    }
    if (!(this.config.adaptiveSmoothingAlpha > 0 && this.config.adaptiveSmoothingAlpha <= 1)) {
      throw new RangeError("VLC receiver adaptiveSmoothingAlpha must be in (0, 1]");
    }
    if (!Number.isFinite(this.config.initialThreshold) || !Number.isFinite(this.config.minDynamicRange)) {
      throw new RangeError("VLC receiver luminance configuration must be finite");
    }
    if (!Number.isInteger(this.config.maxBitBufferSize) || this.config.maxBitBufferSize < 80) {
      throw new RangeError("VLC receiver maxBitBufferSize must be an integer of at least 80 bits");
    }
  }
}

/** Backward-compatible OOK receiver entry point. */
export class VlcOokReceiver extends VlcReceiver {
  constructor(config: Partial<Omit<VlcReceiverConfig, "modulation">> = {}) {
    super({ ...config, modulation: "ook" });
  }
}
