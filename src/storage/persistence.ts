import { openLumenDatabase, transactionComplete, type OpenDatabaseOptions } from "./database";
import { deleteByIndex } from "./indexeddb-helpers";
import { IndexedDbCheckpointRepository } from "./indexeddb-checkpoint-repository";
import { IndexedDbChunkRepository } from "./indexeddb-chunk-repository";
import { IndexedDbResearchRepository } from "./indexeddb-research-repository";
import { IndexedDbSessionRepository } from "./indexeddb-session-repository";
import { IndexedDbSymbolRepository } from "./indexeddb-symbol-repository";
import {
  MemoryCheckpointRepository,
  MemoryChunkRepository,
  MemoryResearchRepository,
  MemorySessionRepository,
  MemorySymbolRepository,
} from "./memory-repositories";
import type { CheckpointRepository, ChunkRepository, ResearchRepository, SessionRepository, SymbolRepository } from "./repositories";
import { StoreName } from "./schema";

export interface PersistenceRepositories {
  kind: "indexeddb" | "memory";
  sessions: SessionRepository;
  symbols: SymbolRepository;
  chunks: ChunkRepository;
  checkpoints: CheckpointRepository;
  research: ResearchRepository;
  fallbackReason: string | null;
  deleteTransfer(transferId: string): Promise<void>;
  close(): void;
}

function createMemoryPersistence(fallbackReason: string | null): PersistenceRepositories {
  const sessions = new MemorySessionRepository();
  const symbols = new MemorySymbolRepository();
  const chunks = new MemoryChunkRepository();
  const checkpoints = new MemoryCheckpointRepository();
  const research = new MemoryResearchRepository();
  return {
    kind: "memory",
    sessions,
    symbols,
    chunks,
    checkpoints,
    research,
    fallbackReason,
    async deleteTransfer(transferId) {
      await Promise.all([
        sessions.delete(transferId),
        symbols.deleteForTransfer(transferId),
        chunks.deleteForTransfer(transferId),
        checkpoints.delete(transferId),
      ]);
    },
    close() {},
  };
}

function createIndexedDbPersistence(database: IDBDatabase): PersistenceRepositories {
  return {
    kind: "indexeddb",
    sessions: new IndexedDbSessionRepository(database),
    symbols: new IndexedDbSymbolRepository(database),
    chunks: new IndexedDbChunkRepository(database),
    checkpoints: new IndexedDbCheckpointRepository(database),
    research: new IndexedDbResearchRepository(database),
    fallbackReason: null,
    async deleteTransfer(transferId) {
      const transaction = database.transaction(
        [StoreName.Sessions, StoreName.Symbols, StoreName.Chunks, StoreName.Checkpoints],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const operations = [
        new Promise<void>((resolve, reject) => {
          const request = transaction.objectStore(StoreName.Sessions).delete(transferId);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
        deleteByIndex(transaction.objectStore(StoreName.Symbols).index("by-transfer"), transferId),
        deleteByIndex(transaction.objectStore(StoreName.Chunks).index("by-transfer"), transferId),
        new Promise<void>((resolve, reject) => {
          const request = transaction.objectStore(StoreName.Checkpoints).delete(transferId);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
      ];
      await Promise.all(operations);
      await completion;
    },
    close() { database.close(); },
  };
}

export async function createPersistence(options: OpenDatabaseOptions = {}): Promise<PersistenceRepositories> {
  try {
    return createIndexedDbPersistence(await openLumenDatabase(options));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "IndexedDB initialization failed";
    return createMemoryPersistence(message);
  }
}
