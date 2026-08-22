import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import type { TestRun } from "../research/test-run";
import type {
  CheckpointRepository,
  ChunkRepository,
  PersistedChunk,
  PersistedSymbol,
  ResearchRepository,
  SessionRepository,
  SymbolRepository,
} from "./repositories";

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

export class MemorySessionRepository implements SessionRepository {
  private readonly values = new Map<string, TransferSession>();
  async put(session: TransferSession) { this.values.set(session.transferId, structuredClone(session)); }
  async get(id: string) { const value = this.values.get(id); return value ? structuredClone(value) : null; }
  async list() { return [...this.values.values()].map((value) => structuredClone(value)).sort((a, b) => b.updatedAt - a.updatedAt); }
  async delete(id: string) { this.values.delete(id); }
}

export class MemorySymbolRepository implements SymbolRepository {
  private readonly values = new Map<string, PersistedSymbol>();
  private key(symbol: Pick<PersistedSymbol, "transferId" | "symbolKey">) { return `${symbol.transferId}\u0000${symbol.symbolKey}`; }
  async put(symbol: PersistedSymbol) {
    const key = this.key(symbol);
    if (this.values.has(key)) return false;
    this.values.set(key, { ...symbol, payload: cloneBytes(symbol.payload) });
    return true;
  }
  async listForTransfer(id: string) { return [...this.values.values()].filter((value) => value.transferId === id).sort((a, b) => a.acceptedOrder - b.acceptedOrder).map((value) => ({ ...value, payload: cloneBytes(value.payload) })); }
  async deleteForTransfer(id: string) { for (const [key, value] of this.values) if (value.transferId === id) this.values.delete(key); }
}

export class MemoryChunkRepository implements ChunkRepository {
  private readonly values = new Map<string, PersistedChunk>();
  private key(id: string, index: number) { return `${id}\u0000${index}`; }
  async put(chunk: PersistedChunk) { this.values.set(this.key(chunk.transferId, chunk.chunkIndex), { ...chunk, bytes: cloneBytes(chunk.bytes) }); }
  async get(id: string, index: number) { const value = this.values.get(this.key(id, index)); return value ? { ...value, bytes: cloneBytes(value.bytes) } : null; }
  async listForTransfer(id: string) { return [...this.values.values()].filter((value) => value.transferId === id).sort((a, b) => a.chunkIndex - b.chunkIndex).map((value) => ({ ...value, bytes: cloneBytes(value.bytes) })); }
  async deleteForTransfer(id: string) { for (const [key, value] of this.values) if (value.transferId === id) this.values.delete(key); }
}

export class MemoryCheckpointRepository implements CheckpointRepository {
  private readonly values = new Map<string, SessionCheckpoint>();
  async put(value: SessionCheckpoint) { this.values.set(value.transferId, structuredClone(value)); }
  async get(id: string) { const value = this.values.get(id); return value ? structuredClone(value) : null; }
  async delete(id: string) { this.values.delete(id); }
}

export class MemoryResearchRepository implements ResearchRepository {
  private readonly values = new Map<string, TestRun>();
  async put(value: TestRun) { this.values.set(value.runId, structuredClone(value)); }
  async get(id: string) { const value = this.values.get(id); return value ? structuredClone(value) : null; }
  async list() { return [...this.values.values()].map((value) => structuredClone(value)).sort((a, b) => b.createdAt - a.createdAt); }
  async delete(id: string) { this.values.delete(id); }
}
