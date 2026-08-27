import { reassembleFile } from "../modules/chunker";
import { FountainDecoder } from "../modules/fountain";
import {
  FrameType,
  bytesToHex,
  decodeCompactMessageFrame,
  decodeFountainFrame,
  decodeMetadataFrame,
  decodeSequentialFrame,
  type FileMetadata,
} from "../modules/protocol";
import { equalBytes, sha256Hex } from "./integrity";
import { opticalDiagnosticTrace } from "../diagnostics/optical-trace";

export type ReconstructionFinalizationState = "idle" | "finalizing" | "complete" | "failed";

export interface ReconstructionResult {
  data: Uint8Array;
  metadata: FileMetadata;
  expectedSha256: string;
  actualSha256: string;
  sha256Matched: boolean;
}

export interface ReconstructionSnapshot {
  metadata: FileMetadata | null;
  mode: "none" | "sequential" | "fountain" | "compact-message";
  acceptedFrames: number;
  duplicateFrames: number;
  resolvedBlocks: number;
  totalBlocks: number;
  progress: number;
  finalizationState: ReconstructionFinalizationState;
  error: string | null;
  compactMessage: { messageId: number; bytes: Uint8Array; text: string } | null;
}

export interface ReconstructionObservation {
  accepted: boolean;
  duplicate: boolean;
  reset: boolean;
  frameType: number;
  snapshot: ReconstructionSnapshot;
  finalization: Promise<ReconstructionResult> | null;
  compactMessage: { messageId: number; bytes: Uint8Array; text: string } | null;
}

type HashFunction = (data: Uint8Array) => Promise<string>;

function cloneMetadata(metadata: FileMetadata): FileMetadata {
  return { ...metadata, fileHash: new Uint8Array(metadata.fileHash) };
}

function metadataIdentity(metadata: FileMetadata): string {
  return [metadata.dataType, metadata.fileSize, metadata.blockSize, metadata.totalBlocks, bytesToHex(metadata.fileHash), metadata.fileName].join(":");
}

function cloneResult(result: ReconstructionResult): ReconstructionResult {
  return Object.freeze({
    ...result,
    data: new Uint8Array(result.data),
    metadata: cloneMetadata(result.metadata),
  });
}

export class ApplicationReconstructionService {
  private readonly hash: HashFunction;
  private metadata: FileMetadata | null = null;
  private identity: string | null = null;
  private mode: ReconstructionSnapshot["mode"] = "none";
  private sequentialBlocks = new Map<number, Uint8Array>();
  private fountain: FountainDecoder | null = null;
  private acceptedFrames = 0;
  private duplicateFrames = 0;
  private finalizationState: ReconstructionFinalizationState = "idle";
  private finalizationPromise: Promise<ReconstructionResult> | null = null;
  private result: ReconstructionResult | null = null;
  private error: string | null = null;
  private generation = 0;
  private compactMessage: { messageId: number; bytes: Uint8Array; text: string } | null = null;
  private readonly deliveredCompactMessages = new Map<number, Uint8Array>();

  constructor(hash: HashFunction = sha256Hex) { this.hash = hash; }

  ingest(payload: Uint8Array): ReconstructionObservation {
    const frameType = payload[0] ?? -1;
    let accepted = false;
    let duplicate = false;
    let reset = false;
    let compactMessage: ReconstructionObservation["compactMessage"] = null;

    try {
      opticalDiagnosticTrace.record("ApplicationReconstructionService", "payload-received", {
        frameType, payloadLength: payload.length,
      });
      if (frameType === FrameType.Metadata) {
        const metadata = decodeMetadataFrame(payload);
        this.validateMetadata(metadata);
        const nextIdentity = metadataIdentity(metadata);
        if (this.compactMessage || (this.identity !== null && this.identity !== nextIdentity)) {
          this.resetPreservingCompactHistory();
          reset = true;
        }
        if (!this.metadata) {
          this.metadata = cloneMetadata(metadata);
          this.identity = nextIdentity;
          this.fountain = new FountainDecoder(metadata.totalBlocks, metadata.blockSize);
          accepted = true;
          this.acceptedFrames++;
        } else {
          duplicate = true;
          this.duplicateFrames++;
        }
      } else if (frameType === FrameType.Sequential) {
        const metadata = this.requireMetadata();
        const frame = decodeSequentialFrame(payload);
        if (frame.blockIndex >= metadata.totalBlocks) throw new Error("Sequential block index exceeds metadata");
        const expectedLength = frame.blockIndex === metadata.totalBlocks - 1
          ? (metadata.fileSize % metadata.blockSize) || metadata.blockSize
          : metadata.blockSize;
        if (frame.payload.length !== expectedLength && frame.payload.length !== metadata.blockSize) {
          throw new Error("Sequential block length disagrees with metadata");
        }
        this.mode = "sequential";
        if (this.sequentialBlocks.has(frame.blockIndex)) {
          duplicate = true;
          this.duplicateFrames++;
        } else {
          this.sequentialBlocks.set(frame.blockIndex, new Uint8Array(frame.payload));
          accepted = true;
          this.acceptedFrames++;
          if (this.sequentialBlocks.size === metadata.totalBlocks) this.startSequentialFinalization();
        }
      } else if (frameType === FrameType.Fountain) {
        const metadata = this.requireMetadata();
        const frame = decodeFountainFrame(payload);
        if (frame.totalBlocks !== metadata.totalBlocks || frame.payload.length !== metadata.blockSize) {
          throw new Error("Fountain symbol disagrees with metadata");
        }
        this.mode = "fountain";
        const wasDone = this.fountain!.isDone();
        const redundantBefore = this.fountain!.redundantSymbols;
        this.fountain!.processSymbol({ seed: frame.seed, degree: frame.degree, payload: frame.payload });
        duplicate = this.fountain!.redundantSymbols > redundantBefore;
        if (duplicate) this.duplicateFrames++;
        else {
          accepted = true;
          this.acceptedFrames++;
        }
        if (!wasDone && this.fountain!.isDone()) this.startFountainFinalization();
      } else if (frameType === FrameType.CompactMessage) {
        const decoded = decodeCompactMessageFrame(payload);
        const delivered = this.deliveredCompactMessages.get(decoded.messageId);
        if (delivered) {
          if (!equalBytes(delivered, decoded.bytes)) throw new Error("Compact message ID collision");
          duplicate = true;
          this.duplicateFrames++;
          compactMessage = this.cloneCompactMessage(decoded);
        } else {
          if (this.metadata || this.compactMessage) {
            this.resetPreservingCompactHistory();
            reset = true;
          }
          this.mode = "compact-message";
          this.compactMessage = this.cloneCompactMessage(decoded);
          compactMessage = this.cloneCompactMessage(decoded);
          this.acceptedFrames++;
          this.finalizationState = "complete";
          accepted = true;
          this.deliveredCompactMessages.set(decoded.messageId, new Uint8Array(decoded.bytes));
          // ponytail: Keep 256 IDs (~258 KiB at the physical message cap); persist IDs if cross-session replay suppression is required.
          if (this.deliveredCompactMessages.size > 256) {
            this.deliveredCompactMessages.delete(this.deliveredCompactMessages.keys().next().value!);
          }
        }
      } else {
        throw new Error(`Unknown application frame type: ${frameType}`);
      }
    } catch (reason) {
      this.error = reason instanceof Error ? reason.message : String(reason);
      opticalDiagnosticTrace.record("ApplicationReconstructionService", "payload-rejected", {
        frameType, payloadLength: payload.length, reason: this.error,
      });
    }
    const snapshot = this.getSnapshot();
    opticalDiagnosticTrace.record("ApplicationReconstructionService", "ingest-result", {
      frameType, accepted, duplicate, reset, resolvedBlocks: snapshot.resolvedBlocks,
      totalBlocks: snapshot.totalBlocks, finalizationState: snapshot.finalizationState,
      error: snapshot.error,
    });
    return { accepted, duplicate, reset, frameType, snapshot, finalization: this.finalizationPromise, compactMessage };
  }

  reset(): void {
    this.generation++;
    this.metadata = null;
    this.identity = null;
    this.mode = "none";
    this.sequentialBlocks.clear();
    this.fountain = null;
    this.acceptedFrames = 0;
    this.duplicateFrames = 0;
    this.finalizationState = "idle";
    this.finalizationPromise = null;
    this.result = null;
    this.error = null;
    this.compactMessage = null;
    this.deliveredCompactMessages.clear();
  }

  getSnapshot(): ReconstructionSnapshot {
    const totalBlocks = this.compactMessage ? 1 : this.metadata?.totalBlocks ?? 0;
    const resolvedBlocks = this.mode === "fountain"
      ? this.fountain?.getResolvedCount() ?? 0
      : this.mode === "compact-message" ? 1 : this.sequentialBlocks.size;
    return Object.freeze({
      metadata: this.metadata ? cloneMetadata(this.metadata) : null,
      mode: this.mode,
      acceptedFrames: this.acceptedFrames,
      duplicateFrames: this.duplicateFrames,
      resolvedBlocks,
      totalBlocks,
      progress: totalBlocks > 0 ? resolvedBlocks / totalBlocks : 0,
      finalizationState: this.finalizationState,
      error: this.error,
      compactMessage: this.compactMessage ? this.cloneCompactMessage(this.compactMessage) : null,
    });
  }

  getFinalizationPromise(): Promise<ReconstructionResult> | null { return this.finalizationPromise; }
  getResult(): ReconstructionResult | null { return this.result ? cloneResult(this.result) : null; }

  private requireMetadata(): FileMetadata {
    if (!this.metadata) throw new Error("Metadata required before application data");
    return this.metadata;
  }

  private validateMetadata(metadata: FileMetadata): void {
    if (metadata.fileSize <= 0 || metadata.blockSize <= 0 || metadata.totalBlocks <= 0) {
      throw new Error("Invalid reconstruction metadata dimensions");
    }
    if (metadata.totalBlocks !== Math.ceil(metadata.fileSize / metadata.blockSize)) {
      throw new Error("Metadata block dimensions are inconsistent");
    }
  }

  private cloneCompactMessage(message: { messageId: number; bytes: Uint8Array; text: string }) {
    return Object.freeze({ ...message, bytes: new Uint8Array(message.bytes) });
  }

  private resetPreservingCompactHistory(): void {
    const history = Array.from(this.deliveredCompactMessages, ([id, bytes]) => [id, new Uint8Array(bytes)] as const);
    this.reset();
    for (const [id, bytes] of history) this.deliveredCompactMessages.set(id, bytes);
  }

  private startSequentialFinalization(): void {
    const metadata = this.requireMetadata();
    const blocks = Array.from({ length: metadata.totalBlocks }, (_, index) => this.sequentialBlocks.get(index)!);
    this.startFinalization(reassembleFile(blocks, metadata.fileSize, metadata.blockSize));
  }

  private startFountainFinalization(): void {
    const metadata = this.requireMetadata();
    this.startFinalization(reassembleFile(this.fountain!.getResolvedBlocks(), metadata.fileSize, metadata.blockSize));
  }

  private startFinalization(data: Uint8Array): Promise<ReconstructionResult> {
    if (this.finalizationPromise) return this.finalizationPromise;
    const metadata = cloneMetadata(this.requireMetadata());
    const generation = this.generation;
    this.finalizationState = "finalizing";
    this.finalizationPromise = this.hash(data).then((actualSha256) => {
      const result: ReconstructionResult = Object.freeze({
        data: new Uint8Array(data),
        metadata,
        expectedSha256: bytesToHex(metadata.fileHash),
        actualSha256,
        sha256Matched: actualSha256 === bytesToHex(metadata.fileHash),
      });
      if (generation === this.generation) {
        this.result = result;
        this.finalizationState = result.sha256Matched ? "complete" : "failed";
        this.error = result.sha256Matched ? null : "SHA-256 reconstruction mismatch";
      }
      return cloneResult(result);
    }).catch((reason) => {
      if (generation === this.generation) {
        this.error = reason instanceof Error ? reason.message : String(reason);
        this.finalizationState = "failed";
      }
      throw reason;
    });
    return this.finalizationPromise;
  }
}
