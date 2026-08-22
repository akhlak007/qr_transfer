import { requestResult, transactionComplete } from "./database";
import { listByIndex, deleteByIndex } from "./indexeddb-helpers";
import { validateSymbolRecord } from "./record-validation";
import type { PersistedSymbol, SymbolRepository } from "./repositories";
import { StoreName } from "./schema";

export class IndexedDbSymbolRepository implements SymbolRepository {
  private readonly database: IDBDatabase;
  constructor(database: IDBDatabase) { this.database = database; }

  async put(symbol: PersistedSymbol): Promise<boolean> {
    validateSymbolRecord(symbol);
    const transaction = this.database.transaction(StoreName.Symbols, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(StoreName.Symbols);
    const key: IDBValidKey = [symbol.transferId, symbol.symbolKey];
    const existing = await requestResult(store.getKey(key));
    if (existing !== undefined) {
      await completion;
      return false;
    }
    await requestResult(store.add(symbol));
    await completion;
    return true;
  }

  async listForTransfer(transferId: string): Promise<PersistedSymbol[]> {
    const values = await listByIndex<PersistedSymbol>(this.database, StoreName.Symbols, "by-transfer", transferId);
    values.forEach(validateSymbolRecord);
    return values.sort((left, right) => left.acceptedOrder - right.acceptedOrder);
  }

  async deleteForTransfer(transferId: string): Promise<void> {
    const transaction = this.database.transaction(StoreName.Symbols, "readwrite");
    const completion = transactionComplete(transaction);
    await deleteByIndex(transaction.objectStore(StoreName.Symbols).index("by-transfer"), transferId);
    await completion;
  }
}
