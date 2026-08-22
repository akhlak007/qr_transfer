export interface StorageCapabilities {
  indexedDbAvailable: boolean;
  quotaBytes: number | null;
  usageBytes: number | null;
  persistent: boolean | null;
  error: string | null;
}

export async function detectStorageCapabilities(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  storageManager: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<StorageCapabilities> {
  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  let persistent: boolean | null = null;
  let error: string | null = null;

  if (storageManager) {
    try {
      const estimate = await storageManager.estimate();
      quotaBytes = Number.isFinite(estimate.quota) ? estimate.quota! : null;
      usageBytes = Number.isFinite(estimate.usage) ? estimate.usage! : null;
      persistent = typeof storageManager.persisted === "function" ? await storageManager.persisted() : null;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Storage capability detection failed";
    }
  }

  return { indexedDbAvailable: Boolean(factory), quotaBytes, usageBytes, persistent, error };
}
