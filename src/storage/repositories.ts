import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import type { TestRun } from "../research/test-run";

export interface PersistedSymbol {
  transferId: string;
  symbolKey: string;
  seed: number;
  degree: number;
  payload: Uint8Array;
  acceptedOrder: number;
  receivedAt: number;
}

export interface PersistedChunk {
  transferId: string;
  chunkIndex: number;
  bytes: Uint8Array;
  logicalLength: number;
  persistedAt: number;
}

export interface SessionRepository {
  put(session: TransferSession): Promise<void>;
  get(transferId: string): Promise<TransferSession | null>;
  list(): Promise<TransferSession[]>;
  delete(transferId: string): Promise<void>;
}

export interface SymbolRepository {
  put(symbol: PersistedSymbol): Promise<boolean>;
  listForTransfer(transferId: string): Promise<PersistedSymbol[]>;
  deleteForTransfer(transferId: string): Promise<void>;
}

export interface ChunkRepository {
  put(chunk: PersistedChunk): Promise<void>;
  get(transferId: string, chunkIndex: number): Promise<PersistedChunk | null>;
  listForTransfer(transferId: string): Promise<PersistedChunk[]>;
  deleteForTransfer(transferId: string): Promise<void>;
}

export interface CheckpointRepository {
  put(checkpoint: SessionCheckpoint): Promise<void>;
  get(transferId: string): Promise<SessionCheckpoint | null>;
  delete(transferId: string): Promise<void>;
}

export interface ResearchRepository {
  put(run: TestRun): Promise<void>;
  get(runId: string): Promise<TestRun | null>;
  list(): Promise<TestRun[]>;
  delete(runId: string): Promise<void>;
}
