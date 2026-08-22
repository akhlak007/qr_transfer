import type { TransferSession } from "../core/transfer-session";
import { deleteRecord, getRecord, listRecords, putRecord } from "./indexeddb-helpers";
import { validateSessionRecord } from "./record-validation";
import type { SessionRepository } from "./repositories";
import { StoreName } from "./schema";

export class IndexedDbSessionRepository implements SessionRepository {
  private readonly database: IDBDatabase;
  constructor(database: IDBDatabase) { this.database = database; }

  async put(session: TransferSession): Promise<void> {
    validateSessionRecord(session);
    await putRecord(this.database, StoreName.Sessions, session);
  }

  async get(transferId: string): Promise<TransferSession | null> {
    const value = await getRecord<TransferSession>(this.database, StoreName.Sessions, transferId);
    if (value) validateSessionRecord(value);
    return value;
  }

  async list(): Promise<TransferSession[]> {
    const values = await listRecords<TransferSession>(this.database, StoreName.Sessions);
    values.forEach(validateSessionRecord);
    return values.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async delete(transferId: string): Promise<void> {
    await deleteRecord(this.database, StoreName.Sessions, transferId);
  }
}
