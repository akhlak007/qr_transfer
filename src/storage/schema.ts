export const LUMEN_DATABASE_NAME = "lumen-optical-platform";
export const LUMEN_DATABASE_VERSION = 1;

export const StoreName = {
  Sessions: "sessions",
  Symbols: "symbols",
  Chunks: "chunks",
  Checkpoints: "checkpoints",
  TestRuns: "testRuns",
} as const;

export type StoreName = (typeof StoreName)[keyof typeof StoreName];

export function upgradeLumenSchema(database: IDBDatabase, oldVersion: number): void {
  if (oldVersion >= 1) return;

  const sessions = database.createObjectStore(StoreName.Sessions, { keyPath: "transferId" });
  sessions.createIndex("by-status", "status");
  sessions.createIndex("by-direction", "direction");
  sessions.createIndex("by-updated-at", "updatedAt");
  sessions.createIndex("by-transport", "transport");
  sessions.createIndex("by-file-hash", "fileHashHex");

  const symbols = database.createObjectStore(StoreName.Symbols, { keyPath: ["transferId", "symbolKey"] });
  symbols.createIndex("by-transfer", "transferId");
  symbols.createIndex("by-transfer-order", ["transferId", "acceptedOrder"]);

  const chunks = database.createObjectStore(StoreName.Chunks, { keyPath: ["transferId", "chunkIndex"] });
  chunks.createIndex("by-transfer", "transferId");

  database.createObjectStore(StoreName.Checkpoints, { keyPath: "transferId" });

  const testRuns = database.createObjectStore(StoreName.TestRuns, { keyPath: "runId" });
  testRuns.createIndex("by-completed-at", "completedAt");
  testRuns.createIndex("by-transport", "transport");
  testRuns.createIndex("by-evidence-kind", "evidenceKind");
  testRuns.createIndex("by-device-direction", ["sender.platform", "receiver.platform"]);
  testRuns.createIndex("by-integrity-status", "integrityStatus");
}
