import type { SessionCheckpoint } from "../core/transfer-session";
import { deleteRecord, getRecord, putRecord } from "./indexeddb-helpers";
import { validateCheckpointRecord } from "./record-validation";
import type { CheckpointRepository } from "./repositories";
import { StoreName } from "./schema";

export class IndexedDbCheckpointRepository implements CheckpointRepository {
  private readonly database: IDBDatabase;
  constructor(database: IDBDatabase) { this.database = database; }

  async put(checkpoint: SessionCheckpoint): Promise<void> {
    validateCheckpointRecord(checkpoint);
    await putRecord(this.database, StoreName.Checkpoints, checkpoint);
  }

  async get(transferId: string): Promise<SessionCheckpoint | null> {
    const value = await getRecord<SessionCheckpoint>(this.database, StoreName.Checkpoints, transferId);
    if (value) validateCheckpointRecord(value);
    return value;
  }

  async delete(transferId: string): Promise<void> {
    await deleteRecord(this.database, StoreName.Checkpoints, transferId);
  }
}
