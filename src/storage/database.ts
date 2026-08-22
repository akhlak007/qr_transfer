import { LUMEN_DATABASE_NAME, LUMEN_DATABASE_VERSION, upgradeLumenSchema } from "./schema";

export interface OpenDatabaseOptions {
  name?: string;
  factory?: IDBFactory;
  version?: number;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

export function openLumenDatabase(options: OpenDatabaseOptions = {}): Promise<IDBDatabase> {
  const factory = options.factory ?? globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error("IndexedDB is unavailable"));
  const request = factory.open(options.name ?? LUMEN_DATABASE_NAME, options.version ?? LUMEN_DATABASE_VERSION);

  return new Promise((resolve, reject) => {
    request.addEventListener("upgradeneeded", (event) => {
      try {
        upgradeLumenSchema(request.result, event.oldVersion);
      } catch (error) {
        request.transaction?.abort();
        reject(error);
      }
    });
    request.addEventListener("success", () => {
      const database = request.result;
      database.addEventListener("versionchange", () => database.close());
      resolve(database);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Unable to open IndexedDB")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade is blocked by another open tab")), { once: true });
  });
}

export function deleteLumenDatabase(factory: IDBFactory, name = LUMEN_DATABASE_NAME): Promise<void> {
  const request = factory.deleteDatabase(name);
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Unable to delete IndexedDB database")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("IndexedDB deletion is blocked by an open connection")), { once: true });
  });
}
