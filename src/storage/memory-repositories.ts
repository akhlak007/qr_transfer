import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import type { TestRun } from "../research/test-run";
import { validateCompletedRun } from "../research/test-protocol";
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

function isCanonicalSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function validateSymbol(symbol: PersistedSymbol): void {
  if (symbol.schemaVersion !== 1) throw new Error("Unsupported symbol schema version");
  if (!symbol.transferId || !symbol.symbolKey) throw new Error("Symbol identity is required");
  if (!Number.isSafeInteger(symbol.seed) || symbol.seed < 0 || symbol.seed > 0xffffffff) throw new Error("Symbol seed is invalid");
  if (!Number.isSafeInteger(symbol.degree) || symbol.degree <= 0 || symbol.degree > 0xffff) throw new Error("Symbol degree is invalid");
  if (symbol.payload.byteLength === 0) throw new Error("Symbol payload is empty");
  if (!Number.isSafeInteger(symbol.acceptedOrder) || symbol.acceptedOrder < 0) throw new Error("Symbol accepted order is invalid");
}

function validateChunk(chunk: PersistedChunk): void {
  if (chunk.schemaVersion !== 1) throw new Error("Unsupported chunk schema version");
  if (!chunk.transferId) throw new Error("Chunk transfer identity is required");
  if (!Number.isSafeInteger(chunk.chunkIndex) || chunk.chunkIndex < 0) throw new Error("Chunk index is invalid");
  if (!Number.isSafeInteger(chunk.blockSize) || chunk.blockSize <= 0 || chunk.bytes.byteLength !== chunk.blockSize) throw new Error("Chunk block size is invalid");
  if (!Number.isSafeInteger(chunk.logicalLength) || chunk.logicalLength < 0 || chunk.logicalLength > chunk.blockSize) throw new Error("Chunk logical length is invalid");
  if (chunk.checksumHex !== null && !isCanonicalSha256(chunk.checksumHex)) throw new Error("Chunk checksum is invalid");
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
    validateSymbol(symbol);
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
  async put(chunk: PersistedChunk) {
    validateChunk(chunk);
    this.values.set(this.key(chunk.transferId, chunk.chunkIndex), { ...chunk, bytes: cloneBytes(chunk.bytes) });
  }
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
  async put(value: TestRun) {
    const existing = this.values.get(value.runId);
    if (existing?.status === "complete") throw new Error("Completed research records are immutable");
    if (value.status === "complete") {
      const errors = validateCompletedRun(value);
      if (errors.length > 0) throw new Error(`Completed research record is invalid: ${errors.join("; ")}`);
    }
    this.values.set(value.runId, structuredClone(value));
  }
  async get(id: string) { const value = this.values.get(id); return value ? structuredClone(value) : null; }
  async list() { return [...this.values.values()].map((value) => structuredClone(value)).sort((a, b) => b.createdAt - a.createdAt); }
  async delete(id: string) { this.values.delete(id); }
}
