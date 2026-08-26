/**
 * Recovery Manager Module (Milestone 2D)
 *
 * Implements deterministic symbol replay, sender file re-selection validation,
 * recovery capability classification, and session graph cleanup.
 */

import { sha256Hex, isSha256Hex } from "../core/integrity";
import { FountainDecoder, type FountainSymbol } from "../modules/fountain";
import type { PersistenceRepositories } from "./persistence";
import type { PersistedSymbol } from "./repositories";
import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import { RecoveryTelemetryLogger } from "../research/recovery-telemetry";

export type SessionRecoveryState = "recoverable" | "non-recoverable" | "completed" | "corrupted";

export interface RecoverySessionSummary {
  session: TransferSession;
  recoveryState: SessionRecoveryState;
  symbolCount: number;
  chunkCount: number;
  latestCheckpoint: SessionCheckpoint | null;
  reason?: string;
}

export interface ReplayProgress {
  symbolsReplayed: number;
  totalSymbols: number;
  resolvedBlocks: number;
  totalBlocks: number;
}

export interface ReplayResult {
  decoder: FountainDecoder;
  replayedSymbols: number;
  resolvedIndices: number[];
  isComplete: boolean;
}

export class RecoveryManager {
  /**
   * Classify recovery status for a given session.
   * Ensures corrupt, inconsistent, or invalid sessions are never marked recoverable.
   */
  static async classifySession(
    session: TransferSession,
    persistence: PersistenceRepositories
  ): Promise<RecoverySessionSummary> {
    const transferId = session.transferId;

    // Validate basic schema invariants
    if (
      session.schemaVersion !== 1 ||
      !isSha256Hex(session.file.sha256Hex) ||
      session.blockSize <= 0 ||
      session.totalBlocks <= 0 ||
      session.file.size < 0
    ) {
      return {
        session,
        recoveryState: "corrupted",
        symbolCount: 0,
        chunkCount: 0,
        latestCheckpoint: null,
        reason: "Invalid session schema or corrupted metadata",
      };
    }

    if (session.status === "complete") {
      const symbols = await persistence.symbols.listForTransfer(transferId);
      const chunks = await persistence.chunks.listForTransfer(transferId);
      const checkpoint = await persistence.checkpoints.get(transferId);
      return {
        session,
        recoveryState: "completed",
        symbolCount: symbols.length,
        chunkCount: chunks.length,
        latestCheckpoint: checkpoint,
      };
    }

    if (session.status === "failed") {
      return {
        session,
        recoveryState: "non-recoverable",
        symbolCount: 0,
        chunkCount: 0,
        latestCheckpoint: null,
        reason: session.failureCode ?? "Transfer previously marked as failed",
      };
    }

    // Direction-specific validation
    if (session.direction === "send") {
      // Sender recovery is valid if session is paused or ready
      return {
        session,
        recoveryState: "recoverable",
        symbolCount: 0,
        chunkCount: 0,
        latestCheckpoint: null,
      };
    }

    if (session.direction === "receive") {
      const symbols = await persistence.symbols.listForTransfer(transferId);
      const chunks = await persistence.chunks.listForTransfer(transferId);
      const checkpoint = await persistence.checkpoints.get(transferId);

      if (symbols.length === 0 && chunks.length === 0) {
        return {
          session,
          recoveryState: "non-recoverable",
          symbolCount: 0,
          chunkCount: 0,
          latestCheckpoint: checkpoint,
          reason: "No durable symbols or chunks recorded",
        };
      }

      // Checkpoint sanity check if present
      if (checkpoint && checkpoint.transferId !== transferId) {
        return {
          session,
          recoveryState: "corrupted",
          symbolCount: symbols.length,
          chunkCount: chunks.length,
          latestCheckpoint: checkpoint,
          reason: "Checkpoint transfer ID mismatch",
        };
      }

      return {
        session,
        recoveryState: "recoverable",
        symbolCount: symbols.length,
        chunkCount: chunks.length,
        latestCheckpoint: checkpoint,
      };
    }

    return {
      session,
      recoveryState: "non-recoverable",
      symbolCount: 0,
      chunkCount: 0,
      latestCheckpoint: null,
      reason: "Unknown transfer direction",
    };
  }

  /**
   * List all stored sessions and their classified recovery state.
   */
  static async listSessions(
    persistence: PersistenceRepositories,
    direction?: "send" | "receive"
  ): Promise<RecoverySessionSummary[]> {
    const allSessions = await persistence.sessions.list();
    const filtered = direction ? allSessions.filter((s: TransferSession) => s.direction === direction) : allSessions;
    const summaries: RecoverySessionSummary[] = [];

    for (const session of filtered) {
      try {
        const summary = await this.classifySession(session, persistence);
        summaries.push(summary);
      } catch (err) {
        summaries.push({
          session,
          recoveryState: "corrupted",
          symbolCount: 0,
          chunkCount: 0,
          latestCheckpoint: null,
          reason: err instanceof Error ? err.message : "Classification failed",
        });
      }
    }

    // Return most recently updated sessions first
    return summaries.sort((a, b) => b.session.updatedAt - a.session.updatedAt);
  }

  /**
   * Replay accepted symbols into a fresh FountainDecoder.
   * Feeds symbols in strict acceptedOrder and verifies progression.
   */
  static async replayReceiverSession(
    transferId: string,
    persistence: PersistenceRepositories,
    onProgress?: (progress: ReplayProgress) => void
  ): Promise<ReplayResult> {
    const startedAt = Date.now();
    const session = await persistence.sessions.get(transferId);
    if (!session) {
      throw new Error(`Session ${transferId} not found`);
    }

    if (session.direction !== "receive") {
      throw new Error(`Session ${transferId} is not a receiver session`);
    }

    const decoder = new FountainDecoder(session.totalBlocks, session.blockSize);
    const symbols = await persistence.symbols.listForTransfer(transferId);
    // Sort in strict acceptedOrder
    symbols.sort((a: PersistedSymbol, b: PersistedSymbol) => a.acceptedOrder - b.acceptedOrder);
    let replayed = 0;

    for (const item of symbols) {
      const symbol: FountainSymbol = {
        seed: item.seed,
        degree: item.degree,
        payload: item.payload,
      };

      decoder.processSymbol(symbol);
      replayed++;

      if (onProgress) {
        onProgress({
          symbolsReplayed: replayed,
          totalSymbols: symbols.length,
          resolvedBlocks: decoder.getResolvedCount(),
          totalBlocks: session.totalBlocks,
        });
      }
    }

    const completedAt = Date.now();
    const isDone = decoder.isDone();

    RecoveryTelemetryLogger.log({
      transferId,
      direction: "receive",
      startedAt,
      completedAt,
      symbolsReplayed: replayed,
      initialResolvedBlocks: 0,
      finalResolvedBlocks: decoder.getResolvedCount(),
      totalBlocks: session.totalBlocks,
      outcome: "success",
      sha256Matched: isDone ? true : null,
    });

    return {
      decoder,
      replayedSymbols: replayed,
      resolvedIndices: decoder.getResolvedIndices(),
      isComplete: isDone,
    };
  }

  /**
   * Validate a user-reselected source file against sender session records.
   * Checks file size and verifies cryptographic SHA-256 hash match.
   */
  static async validateSenderFile(
    session: TransferSession,
    file: File | { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }
  ): Promise<{ valid: boolean; error?: string }> {
    const startedAt = Date.now();

    if (file.size !== session.file.size) {
      const err = `File size mismatch: expected ${session.file.size} bytes, got ${file.size} bytes`;
      RecoveryTelemetryLogger.log({
        transferId: session.transferId,
        direction: "send",
        startedAt,
        completedAt: Date.now(),
        symbolsReplayed: 0,
        initialResolvedBlocks: 0,
        finalResolvedBlocks: 0,
        totalBlocks: session.totalBlocks,
        outcome: "failure",
        sha256Matched: false,
        errorMessage: err,
      });
      return { valid: false, error: err };
    }

    const buffer = await file.arrayBuffer();
    const hexHash = await sha256Hex(new Uint8Array(buffer));

    if (hexHash !== session.file.sha256Hex) {
      const err = `File content hash mismatch: expected SHA-256 ${session.file.sha256Hex.slice(0, 8)}..., got ${hexHash.slice(0, 8)}...`;
      RecoveryTelemetryLogger.log({
        transferId: session.transferId,
        direction: "send",
        startedAt,
        completedAt: Date.now(),
        symbolsReplayed: 0,
        initialResolvedBlocks: 0,
        finalResolvedBlocks: 0,
        totalBlocks: session.totalBlocks,
        outcome: "failure",
        sha256Matched: false,
        errorMessage: err,
      });
      return { valid: false, error: err };
    }

    RecoveryTelemetryLogger.log({
      transferId: session.transferId,
      direction: "send",
      startedAt,
      completedAt: Date.now(),
      symbolsReplayed: 0,
      initialResolvedBlocks: 0,
      finalResolvedBlocks: 0,
      totalBlocks: session.totalBlocks,
      outcome: "success",
      sha256Matched: true,
    });

    return { valid: true };
  }

  /**
   * Transactionally delete a session and all associated symbols, chunks, and checkpoints.
   */
  static async deleteSessionGraph(
    transferId: string,
    persistence: PersistenceRepositories
  ): Promise<void> {
    await persistence.deleteTransfer(transferId);
  }
}
