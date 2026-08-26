import type { FountainSymbol } from "../modules/fountain";
import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import type { PersistenceRepositories } from "./persistence";

export type PersistenceQueueStatus = "idle" | "saving" | "saved" | "error";

export interface PersistenceQueueOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  checkpointSymbolInterval?: number;
  onStatusChange?: (status: PersistenceQueueStatus, error?: string | null) => void;
}

interface QueuedSymbol {
  symbol: FountainSymbol;
  acceptedOrder: number;
  receivedAt: number;
}

interface QueuedChunk {
  index: number;
  bytes: Uint8Array;
  logicalLength: number;
  blockSize: number;
}

export class PersistenceQueue {
  private transferId: string;
  private repositories: PersistenceRepositories;
  private batchSize: number;
  private flushIntervalMs: number;
  private checkpointSymbolInterval: number;
  private onStatusChange?: (status: PersistenceQueueStatus, error?: string | null) => void;

  private pendingSymbols: QueuedSymbol[] = [];
  private pendingChunks: QueuedChunk[] = [];
  private pendingSession: TransferSession | null = null;
  private pendingCheckpoint: SessionCheckpoint | null = null;

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private lastFlushError: string | null = null;
  private status: PersistenceQueueStatus = "idle";
  private symbolsSinceLastCheckpoint = 0;
  private isDestroyed = false;

  constructor(
    transferId: string,
    repositories: PersistenceRepositories,
    options: PersistenceQueueOptions = {},
  ) {
    this.transferId = transferId;
    this.repositories = repositories;
    this.batchSize = options.batchSize ?? 16;
    this.flushIntervalMs = options.flushIntervalMs ?? 250;
    this.checkpointSymbolInterval = options.checkpointSymbolInterval ?? 16;
    this.onStatusChange = options.onStatusChange;
  }

  public getStatus(): PersistenceQueueStatus {
    return this.status;
  }

  public getLastError(): string | null {
    return this.lastFlushError;
  }

  public setSession(session: TransferSession): void {
    if (this.isDestroyed) return;
    this.pendingSession = session;
    this.scheduleFlushIfNeeded();
  }

  public queueSymbol(symbol: FountainSymbol, acceptedOrder: number, receivedAt = Date.now()): void {
    if (this.isDestroyed) return;
    this.pendingSymbols.push({ symbol, acceptedOrder, receivedAt });
    this.symbolsSinceLastCheckpoint++;
    this.checkBatchThreshold();
  }

  public queueChunk(index: number, bytes: Uint8Array, logicalLength: number, blockSize: number): void {
    if (this.isDestroyed) return;
    this.pendingChunks.push({ index, bytes: new Uint8Array(bytes), logicalLength, blockSize });
    this.checkBatchThreshold();
  }

  public setCheckpoint(checkpoint: SessionCheckpoint): void {
    if (this.isDestroyed) return;
    this.pendingCheckpoint = checkpoint;
    if (this.symbolsSinceLastCheckpoint >= this.checkpointSymbolInterval) {
      this.symbolsSinceLastCheckpoint = 0;
      this.triggerAsyncFlush();
    } else {
      this.scheduleFlushIfNeeded();
    }
  }

  private checkBatchThreshold(): void {
    const totalPending = this.pendingSymbols.length + this.pendingChunks.length;
    if (totalPending >= this.batchSize) {
      this.triggerAsyncFlush();
    } else {
      this.scheduleFlushIfNeeded();
    }
  }

  private scheduleFlushIfNeeded(): void {
    if (this.flushTimer !== null || this.isFlushing || this.isDestroyed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.triggerAsyncFlush();
    }, this.flushIntervalMs);
  }

  private triggerAsyncFlush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }

  private setQueueStatus(newStatus: PersistenceQueueStatus, error: string | null = null): void {
    this.status = newStatus;
    this.lastFlushError = error;
    if (this.onStatusChange) {
      try {
        this.onStatusChange(newStatus, error);
      } catch (err) {
        console.warn("PersistenceQueue onStatusChange listener failed:", err);
      }
    }
  }

  public async flush(): Promise<void> {
    if (this.isFlushing) {
      while (this.isFlushing) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (this.hasPendingItems()) {
        return this.flush();
      }
      return;
    }

    if (!this.hasPendingItems()) {
      if (this.status === "saving") {
        this.setQueueStatus("saved");
      }
      return;
    }

    this.isFlushing = true;
    this.setQueueStatus("saving");

    const symbolsToFlush = this.pendingSymbols.slice();
    this.pendingSymbols = [];

    const chunksToFlush = this.pendingChunks.slice();
    this.pendingChunks = [];

    const sessionToFlush = this.pendingSession;
    this.pendingSession = null;

    const checkpointToFlush = this.pendingCheckpoint;
    this.pendingCheckpoint = null;

    try {
      // 1. Flush session metadata
      if (sessionToFlush) {
        await this.repositories.sessions.put(sessionToFlush);
      }

      // 2. Flush fountain symbols
      for (const item of symbolsToFlush) {
        await this.repositories.symbols.put({
          schemaVersion: 1,
          transferId: this.transferId,
          symbolKey: `${item.symbol.seed}-${item.symbol.degree}`,
          seed: item.symbol.seed,
          degree: item.symbol.degree,
          payload: item.symbol.payload,
          acceptedOrder: item.acceptedOrder,
          receivedAt: item.receivedAt,
        });
      }

      // 3. Flush resolved chunks
      for (const item of chunksToFlush) {
        await this.repositories.chunks.put({
          schemaVersion: 1,
          transferId: this.transferId,
          chunkIndex: item.index,
          bytes: item.bytes,
          logicalLength: item.logicalLength,
          blockSize: item.blockSize,
          checksumHex: null,
          persistedAt: Date.now(),
        });
      }

      // 4. Flush checkpoint
      if (checkpointToFlush) {
        await this.repositories.checkpoints.put(checkpointToFlush);
      }

      this.setQueueStatus("saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Persistence flush failed";
      this.setQueueStatus("error", message);
    } finally {
      this.isFlushing = false;
      if (this.hasPendingItems() && !this.isDestroyed) {
        this.scheduleFlushIfNeeded();
      }
    }
  }

  private hasPendingItems(): boolean {
    return (
      this.pendingSymbols.length > 0 ||
      this.pendingChunks.length > 0 ||
      this.pendingSession !== null ||
      this.pendingCheckpoint !== null
    );
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
