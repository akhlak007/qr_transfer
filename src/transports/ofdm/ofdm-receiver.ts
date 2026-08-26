/** Stateful end-to-end Visual OFDM receiver (Phase 8D). */

import {
  OFDM_MODULATION_CODES,
  decodeOfdmFrame,
  type OfdmDecodedFrame,
  type OfdmModulationScheme,
} from "./ofdm-framing";
import { recoverOfdmGrid } from "./ofdm-grid-recovery";
import {
  FrameType,
  decodeFountainFrame,
  decodeMetadataFrame,
  decodeSequentialFrame,
  type FileMetadata,
  type FountainFrame,
  type SequentialFrame,
} from "../../modules/protocol";
import { FountainDecoder } from "../../modules/fountain";
import { sha256Hex } from "../../core/integrity";

export type OfdmReceiverGridSize = 8 | 16 | 32;
export type OfdmReceiverCrcStatus = "none" | "pending" | "valid" | "invalid";

export interface VisualOfdmReceiverConfig {
  modulation: OfdmModulationScheme;
  gridSize: OfdmReceiverGridSize;
  maxBitBufferSize: number;
  roiFraction: number;
}

const DEFAULT_RECEIVER_LIMITS = {
  maxBitBufferSize: (10 + 65535 + 2) * 8 + 4096,
  roiFraction: 1,
};

export interface VisualOfdmReceiverDiagnostics {
  activeModulation: OfdmModulationScheme;
  gridSize: OfdmReceiverGridSize;
  synchronized: boolean;
  synchronizationConfidence: number;
  recoveredSymbols: number[];
  recoveredBits: number[];
  frameSequence: number | null;
  crcStatus: OfdmReceiverCrcStatus;
  snrEstimateDb: number;
  totalGridsProcessed: number;
  synchronizedGridCount: number;
  totalBitsRecovered: number;
  bufferedBits: number;
  expectedFrameBits: number | null;
  validFramesCount: number;
  corruptFramesCount: number;
  fountainSymbolsAccepted: number;
  fountainBlocksResolved: number;
  reconstructionComplete: boolean;
}

export interface VisualOfdmReceiverFrameEvent {
  frame: OfdmDecodedFrame;
  rawPayload: Uint8Array;
  metadataFrame: FileMetadata | null;
  sequentialFrame: SequentialFrame | null;
  fountainFrame: FountainFrame | null;
  diagnostics: VisualOfdmReceiverDiagnostics;
}

export type OfdmOpticalSource =
  | ImageData
  | HTMLCanvasElement
  | HTMLVideoElement
  | { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

export class VisualOfdmReceiver {
  private readonly config: VisualOfdmReceiverConfig;
  private bitBuffer: number[] = [];
  private recentBits: number[] = [];
  private recentSymbols: number[] = [];
  private synchronized = false;
  private synchronizationConfidence = 0;
  private snrEstimateDb = 0;
  private crcStatus: OfdmReceiverCrcStatus = "none";
  private frameSequence: number | null = null;
  private expectedFrameBits: number | null = null;
  private totalGridsProcessed = 0;
  private synchronizedGridCount = 0;
  private totalBitsRecovered = 0;
  private validFramesCount = 0;
  private corruptFramesCount = 0;
  private metadata: FileMetadata | null = null;
  private fountainDecoder: FountainDecoder | null = null;
  private fountainBlockSize = 0;
  private sequentialBlocks = new Map<number, Uint8Array>();
  private reconstructedPayload: Uint8Array | null = null;
  private cachedSha256: string | null = null;
  private reconstructionGeneration = 0;
  private frameListeners = new Set<(event: VisualOfdmReceiverFrameEvent) => void>();

  constructor(config: Pick<VisualOfdmReceiverConfig, "modulation" | "gridSize">
    & Partial<Omit<VisualOfdmReceiverConfig, "modulation" | "gridSize">>) {
    this.config = { ...DEFAULT_RECEIVER_LIMITS, ...config };
    this.validateConfig();
  }

  ingestFrame(source: OfdmOpticalSource): VisualOfdmReceiverDiagnostics {
    const buffer = this.normalizeSourceToBuffer(source);
    if (!buffer) return this.getDiagnostics();
    return this.ingestSpatialGrid(this.sampleConfiguredGrid(buffer));
  }

  ingestSpatialGrid(spatialLuminance: Float64Array | number[]): VisualOfdmReceiverDiagnostics {
    const required = this.config.gridSize * this.config.gridSize;
    if (spatialLuminance.length !== required) return this.getDiagnostics();
    for (let index = 0; index < required; index++) {
      if (!Number.isFinite(spatialLuminance[index])) return this.getDiagnostics();
    }

    this.totalGridsProcessed++;
    const recovered = recoverOfdmGrid(
      spatialLuminance,
      this.config.modulation,
      this.config.gridSize,
    );
    this.synchronized = recovered.synchronized;
    this.synchronizationConfidence = recovered.sync.confidence;
    this.snrEstimateDb = recovered.estimatedSnrDb;
    if (!recovered.synchronized) return this.getDiagnostics();

    this.synchronizedGridCount++;
    this.totalBitsRecovered += recovered.bits.length;
    this.bitBuffer.push(...recovered.bits);
    this.recentBits.push(...recovered.bits);
    this.recentSymbols.push(...recovered.symbols);
    if (this.recentBits.length > 64) this.recentBits.splice(0, this.recentBits.length - 64);
    if (this.recentSymbols.length > 32) this.recentSymbols.splice(0, this.recentSymbols.length - 32);
    this.processBitBuffer();
    if (this.expectedFrameBits === null && this.bitBuffer.length > this.config.maxBitBufferSize) {
      this.bitBuffer.splice(0, this.bitBuffer.length - this.config.maxBitBufferSize);
    }
    return this.getDiagnostics();
  }

  sampleConfiguredGrid(source: {
    data: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
  }): Float64Array {
    const { data, width, height } = source;
    const size = Math.floor(Math.min(width, height) * this.config.roiFraction);
    const startX = Math.floor((width - size) / 2);
    const startY = Math.floor((height - size) / 2);
    const samples = new Float64Array(this.config.gridSize * this.config.gridSize);

    for (let row = 0; row < this.config.gridSize; row++) {
      const y0 = startY + Math.floor(row * size / this.config.gridSize);
      const y1 = startY + Math.floor((row + 1) * size / this.config.gridSize);
      for (let column = 0; column < this.config.gridSize; column++) {
        const x0 = startX + Math.floor(column * size / this.config.gridSize);
        const x1 = startX + Math.floor((column + 1) * size / this.config.gridSize);
        let luminanceSum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const offset = (y * width + x) * 4;
            luminanceSum += 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
            count++;
          }
        }
        samples[row * this.config.gridSize + column] = count > 0 ? luminanceSum / count : 0;
      }
    }
    return samples;
  }

  private processBitBuffer(): void {
    while (this.bitBuffer.length >= 24) {
      const headerStart = this.findHeaderStart();
      if (headerStart < 0) {
        if (this.bitBuffer.length > 23) this.bitBuffer.splice(0, this.bitBuffer.length - 23);
        this.expectedFrameBits = null;
        return;
      }
      if (headerStart > 0) this.bitBuffer.splice(0, headerStart);
      if (this.bitBuffer.length < 80) return;

      const header = this.extractBytes(0, 10);
      const configuredHeader = header[3] === OFDM_MODULATION_CODES[this.config.modulation]
        && header[4] === this.config.gridSize
        && header[5] === 1;
      if (!configuredHeader) {
        this.rejectCandidate();
        continue;
      }
      const payloadLength = (header[8] << 8) | header[9];
      const frameBits = (10 + payloadLength + 2) * 8;
      this.expectedFrameBits = frameBits;
      this.frameSequence = (header[6] << 8) | header[7];
      this.crcStatus = "pending";
      if (frameBits > this.config.maxBitBufferSize) {
        this.rejectCandidate();
        continue;
      }
      if (this.bitBuffer.length < frameBits) return;

      const frameBytes = this.extractBytes(0, frameBits / 8);
      const decoded = decodeOfdmFrame(frameBytes);
      const matchesConfiguration = decoded?.modulation === this.config.modulation
        && decoded.gridSize === this.config.gridSize;
      this.bitBuffer.splice(0, frameBits);
      this.expectedFrameBits = null;
      if (decoded?.isValidCrc && matchesConfiguration) {
        this.crcStatus = "valid";
        this.validFramesCount++;
        this.frameSequence = decoded.seqNumber;
        this.handleDecodedFrame(decoded);
      } else {
        this.crcStatus = "invalid";
        this.corruptFramesCount++;
      }
    }
  }

  private findHeaderStart(): number {
    for (let start = 0; start <= this.bitBuffer.length - 24; start++) {
      if (this.readBits(start, 8) === 0x56
        && this.readBits(start + 8, 8) === 0x4f
        && this.readBits(start + 16, 8) === 1) return start;
    }
    return -1;
  }

  private rejectCandidate(): void {
    this.crcStatus = "invalid";
    this.corruptFramesCount++;
    this.expectedFrameBits = null;
    this.bitBuffer.splice(0, 1);
  }

  private readBits(start: number, count: number): number {
    let value = 0;
    for (let offset = 0; offset < count; offset++) value = (value << 1) | this.bitBuffer[start + offset];
    return value;
  }

  private extractBytes(startBit: number, byteCount: number): Uint8Array {
    const bytes = new Uint8Array(byteCount);
    for (let byte = 0; byte < byteCount; byte++) {
      bytes[byte] = this.readBits(startBit + byte * 8, 8);
    }
    return bytes;
  }

  private handleDecodedFrame(frame: OfdmDecodedFrame): void {
    const rawPayload = frame.payload;
    let metadataFrame: FileMetadata | null = null;
    let sequentialFrame: SequentialFrame | null = null;
    let fountainFrame: FountainFrame | null = null;

    if (rawPayload.length > 0) {
      const type = rawPayload[0] as FrameType;
      if (type === FrameType.Metadata) {
        try {
          metadataFrame = decodeMetadataFrame(rawPayload);
          if (!this.isValidMetadata(metadataFrame)) throw new Error("Invalid OFDM transfer metadata");
          this.clearReconstructionState();
          this.metadata = metadataFrame;
          this.fountainBlockSize = metadataFrame.blockSize;
          this.fountainDecoder = new FountainDecoder(metadataFrame.totalBlocks, metadataFrame.blockSize);
        } catch { /* malformed protocol payload */ }
      } else if (type === FrameType.Sequential) {
        try {
          if (!this.metadata) throw new Error("Metadata required before sequential data");
          sequentialFrame = decodeSequentialFrame(rawPayload);
          const expectedLength = sequentialFrame.blockIndex === this.metadata.totalBlocks - 1
            ? this.metadata.fileSize - sequentialFrame.blockIndex * this.metadata.blockSize
            : this.metadata.blockSize;
          if (sequentialFrame.blockIndex < 0
            || sequentialFrame.blockIndex >= this.metadata.totalBlocks
            || sequentialFrame.payload.length !== expectedLength) {
            throw new Error("Sequential block does not match transfer metadata");
          }
          this.sequentialBlocks.set(sequentialFrame.blockIndex, sequentialFrame.payload);
          this.checkSequentialCompletion();
        } catch { /* malformed protocol payload */ }
      } else if (type === FrameType.Fountain) {
        try {
          if (!this.metadata) throw new Error("Metadata required before fountain data");
          fountainFrame = decodeFountainFrame(rawPayload);
          if (fountainFrame.totalBlocks !== this.metadata.totalBlocks
            || fountainFrame.payload.length !== this.metadata.blockSize) {
            throw new Error("Fountain symbol does not match transfer metadata");
          }
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

    const event: VisualOfdmReceiverFrameEvent = {
      frame,
      rawPayload,
      metadataFrame,
      sequentialFrame,
      fountainFrame,
      diagnostics: this.getDiagnostics(),
    };
    for (const listener of this.frameListeners) {
      try { listener(event); } catch (error) { console.error("OFDM frame listener error:", error); }
    }
  }

  private checkSequentialCompletion(): void {
    if (!this.metadata) return;
    const result = new Uint8Array(this.metadata.fileSize);
    let offset = 0;
    for (let index = 0; index < this.metadata.totalBlocks; index++) {
      const block = this.sequentialBlocks.get(index);
      if (!block) return;
      const length = Math.min(block.length, result.length - offset);
      result.set(block.subarray(0, length), offset);
      offset += length;
    }
    if (offset !== this.metadata.fileSize) return;
    this.finishReconstruction(result);
  }

  private finalizeFountainReconstruction(): void {
    if (!this.fountainDecoder?.isDone()) return;
    const blocks = this.fountainDecoder.getResolvedBlocks();
    const blockSize = this.fountainBlockSize || blocks[0]?.length || 0;
    const size = this.metadata?.fileSize ?? blocks.length * blockSize;
    const result = new Uint8Array(size);
    let offset = 0;
    for (const block of blocks) {
      if (!block) return;
      const length = Math.min(block.length, size - offset);
      result.set(block.subarray(0, length), offset);
      offset += length;
    }
    this.finishReconstruction(result);
  }

  private finishReconstruction(data: Uint8Array): void {
    this.reconstructedPayload = data;
    this.cachedSha256 = null;
    const generation = this.reconstructionGeneration;
    void sha256Hex(data).then((hash) => {
      if (generation === this.reconstructionGeneration && this.reconstructedPayload === data) {
        this.cachedSha256 = hash;
      }
    });
  }

  private clearReconstructionState(): void {
    this.reconstructionGeneration++;
    this.fountainDecoder = null;
    this.fountainBlockSize = 0;
    this.sequentialBlocks.clear();
    this.reconstructedPayload = null;
    this.cachedSha256 = null;
  }

  private isValidMetadata(metadata: FileMetadata): boolean {
    return Number.isInteger(metadata.fileSize) && metadata.fileSize >= 0
      && Number.isInteger(metadata.blockSize) && metadata.blockSize > 0
      && Number.isInteger(metadata.totalBlocks)
      && metadata.totalBlocks === Math.ceil(metadata.fileSize / metadata.blockSize)
      && metadata.fileHash.length === 32;
  }

  private normalizeSourceToBuffer(source: OfdmOpticalSource): {
    data: Uint8ClampedArray | Uint8Array;
    width: number;
    height: number;
  } | null {
    if ("data" in source && typeof source.width === "number" && typeof source.height === "number") {
      return Number.isInteger(source.width) && source.width >= this.config.gridSize
        && Number.isInteger(source.height) && source.height >= this.config.gridSize
        && source.data.length >= source.width * source.height * 4
        ? source
        : null;
    }
    if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
      const context = source.getContext("2d");
      return context && source.width >= this.config.gridSize && source.height >= this.config.gridSize
        ? context.getImageData(0, 0, source.width, source.height)
        : null;
    }
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
      if (source.readyState < 2 || source.videoWidth < this.config.gridSize || source.videoHeight < this.config.gridSize) return null;
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

  private validateConfig(): void {
    if (!([8, 16, 32] as number[]).includes(this.config.gridSize)) {
      throw new RangeError("Visual OFDM receiver gridSize must be 8, 16, or 32");
    }
    if (!(this.config.modulation in OFDM_MODULATION_CODES)) {
      throw new RangeError("Unsupported Visual OFDM receiver modulation");
    }
    if (!(this.config.roiFraction > 0 && this.config.roiFraction <= 1)) {
      throw new RangeError("Visual OFDM receiver roiFraction must be in (0, 1]");
    }
    if (!Number.isInteger(this.config.maxBitBufferSize) || this.config.maxBitBufferSize < 96) {
      throw new RangeError("Visual OFDM maxBitBufferSize must be an integer of at least 96 bits");
    }
  }

  onFrame(callback: (event: VisualOfdmReceiverFrameEvent) => void): () => void {
    this.frameListeners.add(callback);
    return () => { this.frameListeners.delete(callback); };
  }

  getDiagnostics(): VisualOfdmReceiverDiagnostics {
    return {
      activeModulation: this.config.modulation,
      gridSize: this.config.gridSize,
      synchronized: this.synchronized,
      synchronizationConfidence: this.synchronizationConfidence,
      recoveredSymbols: [...this.recentSymbols],
      recoveredBits: [...this.recentBits],
      frameSequence: this.frameSequence,
      crcStatus: this.crcStatus,
      snrEstimateDb: this.snrEstimateDb,
      totalGridsProcessed: this.totalGridsProcessed,
      synchronizedGridCount: this.synchronizedGridCount,
      totalBitsRecovered: this.totalBitsRecovered,
      bufferedBits: this.bitBuffer.length,
      expectedFrameBits: this.expectedFrameBits,
      validFramesCount: this.validFramesCount,
      corruptFramesCount: this.corruptFramesCount,
      fountainSymbolsAccepted: this.fountainDecoder?.totalProcessedSymbols ?? 0,
      fountainBlocksResolved: this.fountainDecoder?.getResolvedCount() ?? this.sequentialBlocks.size,
      reconstructionComplete: this.reconstructedPayload !== null,
    };
  }

  getMetadata(): FileMetadata | null { return this.metadata; }
  getFountainDecoder(): FountainDecoder | null { return this.fountainDecoder; }
  isReconstructionComplete(): boolean { return this.reconstructedPayload !== null; }

  getReconstructedFile(): { data: Uint8Array; metadata: FileMetadata | null; cachedSha256: string | null } | null {
    return this.reconstructedPayload
      ? { data: this.reconstructedPayload, metadata: this.metadata, cachedSha256: this.cachedSha256 }
      : null;
  }

  async getReconstructedFileWithHash(): Promise<{
    data: Uint8Array;
    metadata: FileMetadata | null;
    sha256Hex: string;
  } | null> {
    if (!this.reconstructedPayload) return null;
    const payload = this.reconstructedPayload;
    const metadata = this.metadata;
    const generation = this.reconstructionGeneration;
    const hash = this.cachedSha256 ?? await sha256Hex(payload);
    if (generation === this.reconstructionGeneration && payload === this.reconstructedPayload) {
      this.cachedSha256 = hash;
    }
    return { data: payload.slice(), metadata, sha256Hex: hash };
  }

  reset(): void {
    this.bitBuffer = [];
    this.recentBits = [];
    this.recentSymbols = [];
    this.synchronized = false;
    this.synchronizationConfidence = 0;
    this.snrEstimateDb = 0;
    this.crcStatus = "none";
    this.frameSequence = null;
    this.expectedFrameBits = null;
    this.totalGridsProcessed = 0;
    this.synchronizedGridCount = 0;
    this.totalBitsRecovered = 0;
    this.validFramesCount = 0;
    this.corruptFramesCount = 0;
    this.metadata = null;
    this.clearReconstructionState();
  }
}
