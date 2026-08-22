import { isSha256Hex } from "../core/integrity";
import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import { canRecoverReceiver, canRestartSender } from "../core/resume-policy";
import { TransportId } from "../core/transport";
import { testRunValidationErrors, type TestRun } from "../research/test-run";
import type { PersistedChunk, PersistedSymbol } from "./repositories";

export function validateSymbolRecord(symbol: PersistedSymbol): void {
  if (symbol.schemaVersion !== 1) throw new Error("Unsupported symbol schema version");
  if (!symbol.transferId || !symbol.symbolKey) throw new Error("Symbol identity is required");
  if (!Number.isSafeInteger(symbol.seed) || symbol.seed < 0 || symbol.seed > 0xffffffff) throw new Error("Symbol seed is invalid");
  if (!Number.isSafeInteger(symbol.degree) || symbol.degree <= 0 || symbol.degree > 0xffff) throw new Error("Symbol degree is invalid");
  if (!(symbol.payload instanceof Uint8Array) || symbol.payload.byteLength === 0) throw new Error("Symbol payload is invalid");
  if (!Number.isSafeInteger(symbol.acceptedOrder) || symbol.acceptedOrder < 0) throw new Error("Symbol accepted order is invalid");
  if (!Number.isFinite(symbol.receivedAt) || symbol.receivedAt < 0) throw new Error("Symbol timestamp is invalid");
}

export function validateChunkRecord(chunk: PersistedChunk): void {
  if (chunk.schemaVersion !== 1) throw new Error("Unsupported chunk schema version");
  if (!chunk.transferId) throw new Error("Chunk transfer identity is required");
  if (!Number.isSafeInteger(chunk.chunkIndex) || chunk.chunkIndex < 0) throw new Error("Chunk index is invalid");
  if (!(chunk.bytes instanceof Uint8Array)) throw new Error("Chunk bytes are invalid");
  if (!Number.isSafeInteger(chunk.blockSize) || chunk.blockSize <= 0 || chunk.bytes.byteLength !== chunk.blockSize) throw new Error("Chunk block size is invalid");
  if (!Number.isSafeInteger(chunk.logicalLength) || chunk.logicalLength < 0 || chunk.logicalLength > chunk.blockSize) throw new Error("Chunk logical length is invalid");
  if (chunk.checksumHex !== null && !isSha256Hex(chunk.checksumHex)) throw new Error("Chunk checksum is invalid");
  if (!Number.isFinite(chunk.persistedAt) || chunk.persistedAt < 0) throw new Error("Chunk timestamp is invalid");
}

export function validateSessionRecord(session: TransferSession): void {
  if (session.schemaVersion !== 1) throw new Error("Unsupported session schema version");
  if (!session.transferId) throw new Error("Session identity is required");
  if (!Number.isSafeInteger(session.file.size) || session.file.size < 0) throw new Error("Session file size is invalid");
  if (session.fileHashHex !== session.file.sha256Hex) throw new Error("Session SHA-256 fields are inconsistent");
  if (session.file.sha256Hex && !isSha256Hex(session.file.sha256Hex)) throw new Error("Session SHA-256 is invalid");
  if (!Number.isSafeInteger(session.blockSize) || session.blockSize <= 0) throw new Error("Session block size is invalid");
  if (!Number.isSafeInteger(session.totalBlocks) || session.totalBlocks < 0) throw new Error("Session block count is invalid");
  if (!Number.isSafeInteger(session.acceptedSymbols) || session.acceptedSymbols < 0) throw new Error("Session accepted symbol count is invalid");
  if (!Number.isSafeInteger(session.resolvedBlocks) || session.resolvedBlocks < 0 || session.resolvedBlocks > session.totalBlocks) throw new Error("Session resolved block count is invalid");
  if (!Number.isSafeInteger(session.checkpointVersion) || session.checkpointVersion < 0) throw new Error("Session checkpoint version is invalid");

  const receiverFacts = {
    hasExactMetadata: isSha256Hex(session.fileHashHex),
    durableAcceptedSymbols: session.acceptedSymbols,
    storageAvailable: true,
  };
  if (session.resumeCapability === "replay-receiver" && (session.direction !== "receive" || !canRecoverReceiver(receiverFacts))) {
    throw new Error("Receiver session lacks durable replay state");
  }
  if (session.resumeCapability === "restart-sender" && !canRestartSender(session)) {
    throw new Error("Sender session is not eligible for restart");
  }
  if (session.resumeCapability === "complete" && session.status !== "complete") throw new Error("Incomplete session cannot have complete capability");
  if (session.status === "recoverable") {
    if (session.direction === "receive" && (session.resumeCapability !== "replay-receiver" || !canRecoverReceiver(receiverFacts))) {
      throw new Error("Recoverable receiver session is inconsistent");
    }
    if (session.direction === "send" && (session.resumeCapability !== "restart-sender" || !canRestartSender(session))) {
      throw new Error("Recoverable sender session is inconsistent");
    }
  }
}

export function validateCheckpointRecord(checkpoint: SessionCheckpoint): void {
  if (checkpoint.schemaVersion !== 1) throw new Error("Unsupported checkpoint schema version");
  if (!checkpoint.transferId) throw new Error("Checkpoint identity is required");
  if (!Number.isSafeInteger(checkpoint.acceptedSymbols) || checkpoint.acceptedSymbols < 0) throw new Error("Checkpoint symbol count is invalid");
  if (!Number.isSafeInteger(checkpoint.persistedChunks) || checkpoint.persistedChunks < 0) throw new Error("Checkpoint chunk count is invalid");
  if (checkpoint.resolvedBlockIndices.some((index) => !Number.isSafeInteger(index) || index < 0)) throw new Error("Checkpoint block indices are invalid");
}

export function validateResearchRecord(run: TestRun): void {
  if (run.schemaVersion !== 1) throw new Error("Unsupported research schema version");
  if (!run.runId) throw new Error("Research run identity is required");
  if (run.status !== "draft" && run.status !== "complete") throw new Error("Research run status is invalid");
  if (run.evidenceKind !== "simulated" && run.evidenceKind !== "physical") throw new Error("Research evidence kind is invalid");
  if (run.transport !== TransportId.QR && run.transport !== TransportId.VLC && run.transport !== TransportId.VisualOFDM) throw new Error("Research transport is invalid");
  if (!Number.isFinite(run.createdAt) || run.createdAt < 0) throw new Error("Research creation timestamp is invalid");
  if (run.status === "complete") {
    const errors = testRunValidationErrors(run);
    if (errors.length > 0) throw new Error(`Completed research record is invalid: ${errors.join("; ")}`);
  }
}
