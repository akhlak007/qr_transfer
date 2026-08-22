import { transactionComplete } from "./database";
import { deleteByIndex, getRecord, listByIndex, putRecord } from "./indexeddb-helpers";
import { validateChunkRecord } from "./record-validation";
import type { ChunkRepository, PersistedChunk } from "./repositories";
import { StoreName } from "./schema";

export class IndexedDbChunkRepository implements ChunkRepository {
  private readonly database: IDBDatabase;
  constructor(database: IDBDatabase) { this.database = database; }

  async put(chunk: PersistedChunk): Promise<void> {
    validateChunkRecord(chunk);
    await putRecord(this.database, StoreName.Chunks, chunk);
  }

  async get(transferId: string, chunkIndex: number): Promise<PersistedChunk | null> {
    const value = await getRecord<PersistedChunk>(this.database, StoreName.Chunks, [transferId, chunkIndex]);
    if (value) validateChunkRecord(value);
    return value;
  }

  async listForTransfer(transferId: string): Promise<PersistedChunk[]> {
    const values = await listByIndex<PersistedChunk>(this.database, StoreName.Chunks, "by-transfer", transferId);
    values.forEach(validateChunkRecord);
    return values.sort((left, right) => left.chunkIndex - right.chunkIndex);
  }

  async deleteForTransfer(transferId: string): Promise<void> {
    const transaction = this.database.transaction(StoreName.Chunks, "readwrite");
    const completion = transactionComplete(transaction);
    await deleteByIndex(transaction.objectStore(StoreName.Chunks).index("by-transfer"), transferId);
    await completion;
  }
}
