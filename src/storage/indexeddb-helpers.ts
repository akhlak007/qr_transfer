import { requestResult, transactionComplete } from "./database";

export async function putRecord<T>(database: IDBDatabase, storeName: string, value: T): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  const completion = transactionComplete(transaction);
  await requestResult(transaction.objectStore(storeName).put(value));
  await completion;
}

export async function getRecord<T>(database: IDBDatabase, storeName: string, key: IDBValidKey | IDBKeyRange): Promise<T | null> {
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionComplete(transaction);
  const value = await requestResult(transaction.objectStore(storeName).get(key)) as T | undefined;
  await completion;
  return value ?? null;
}

export async function listRecords<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionComplete(transaction);
  const values = await requestResult(transaction.objectStore(storeName).getAll()) as T[];
  await completion;
  return values;
}

export async function deleteRecord(database: IDBDatabase, storeName: string, key: IDBValidKey | IDBKeyRange): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  const completion = transactionComplete(transaction);
  await requestResult(transaction.objectStore(storeName).delete(key));
  await completion;
}

export async function listByIndex<T>(database: IDBDatabase, storeName: string, indexName: string, query: IDBValidKey | IDBKeyRange): Promise<T[]> {
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionComplete(transaction);
  const values = await requestResult(transaction.objectStore(storeName).index(indexName).getAll(query)) as T[];
  await completion;
  return values;
}

export function deleteByIndex(index: IDBIndex, query: IDBValidKey | IDBKeyRange): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = index.openCursor(query);
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB cursor deletion failed")), { once: true });
    request.addEventListener("success", () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const deleteRequest = cursor.delete();
      deleteRequest.addEventListener("error", () => reject(deleteRequest.error ?? new Error("IndexedDB cursor record deletion failed")), { once: true });
      cursor.continue();
    });
  });
}
