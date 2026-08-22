import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { TransportId } from "../core/transport";
import type { SessionCheckpoint, TransferSession } from "../core/transfer-session";
import type { TestRun } from "../research/test-run";
import { deleteLumenDatabase, openLumenDatabase, requestResult, transactionComplete } from "./database";
import { IndexedDbResearchRepository } from "./indexeddb-research-repository";
import { createPersistence } from "./persistence";
import { detectStorageCapabilities } from "./storage-capabilities";
import { LUMEN_DATABASE_VERSION, StoreName } from "./schema";

function databaseName(): string {
  return `lumen-test-${crypto.randomUUID()}`;
}

function session(transferId: string, updatedAt = 1): TransferSession {
  return {
    schemaVersion: 1,
    transferId,
    protocolVersion: 1,
    direction: "receive",
    transport: TransportId.QR,
    file: { name: "fixture.bin", size: 4, mimeType: "application/octet-stream", sha256Hex: "a".repeat(64), mediaKind: "other" },
    fileHashHex: "a".repeat(64),
    blockSize: 4,
    totalBlocks: 1,
    status: "recoverable",
    createdAt: 1,
    updatedAt,
    completedAt: null,
    resumeCapability: "replay-receiver",
    encodingMode: "fountain",
    acceptedSymbols: 1,
    resolvedBlocks: 0,
    checkpointVersion: 1,
    failureCode: null,
    transportConfig: {},
  };
}

function checkpoint(transferId: string): SessionCheckpoint {
  return { schemaVersion: 1, transferId, acceptedSymbols: 1, resolvedBlockIndices: [], persistedChunks: 1, metrics: {}, createdAt: 2 };
}

function simulatedRun(runId: string, status: "draft" | "complete" = "complete"): TestRun {
  const device = { platform: "desktop" as const, deviceName: "simulator", osVersion: "test", browserName: "test", browserVersion: "test" };
  return {
    schemaVersion: 1,
    runId,
    status,
    evidenceKind: "simulated",
    transport: TransportId.QR,
    sender: device,
    receiver: device,
    fileName: "fixture.bin",
    fileHashHex: "a".repeat(64),
    integrityStatus: "verified",
    metrics: { fileSize: 4, elapsedMs: 10, averageThroughputBytesPerSecond: 400, frameHitRate: 1, errorRate: 0, recoveryOverhead: 0, cameraFps: null, screenFps: null, signalQuality: null },
    distanceCm: null,
    environment: "unspecified",
    notes: "",
    createdAt: 1,
    completedAt: status === "complete" ? 2 : null,
  };
}

test("creates the version-one schema with documented stores and indexes", async () => {
  const factory = new IDBFactory();
  const name = databaseName();
  const database = await openLumenDatabase({ factory, name });
  assert.equal(database.version, LUMEN_DATABASE_VERSION);
  assert.deepEqual([...database.objectStoreNames], ["checkpoints", "chunks", "sessions", "symbols", "testRuns"]);

  const transaction = database.transaction([StoreName.Sessions, StoreName.Symbols, StoreName.Chunks, StoreName.TestRuns], "readonly");
  assert.deepEqual([...transaction.objectStore(StoreName.Sessions).indexNames], ["by-direction", "by-file-hash", "by-status", "by-transport", "by-updated-at"]);
  assert.equal(transaction.objectStore(StoreName.Sessions).index("by-file-hash").keyPath, "fileHashHex");
  assert.deepEqual([...transaction.objectStore(StoreName.Symbols).indexNames], ["by-transfer", "by-transfer-order"]);
  assert.deepEqual([...transaction.objectStore(StoreName.Chunks).indexNames], ["by-transfer"]);
  assert.deepEqual([...transaction.objectStore(StoreName.TestRuns).indexNames], ["by-completed-at", "by-device-direction", "by-evidence-kind", "by-integrity-status", "by-transport"]);
  database.close();
  await deleteLumenDatabase(factory, name);
});

test("rejects inconsistent recoverable sessions", async () => {
  const factory = new IDBFactory();
  const name = databaseName();
  const persistence = await createPersistence({ factory, name });
  const inconsistent = { ...session("broken"), acceptedSymbols: 0 };
  await assert.rejects(persistence.sessions.put(inconsistent), /durable replay|inconsistent/);
  persistence.close();
  await deleteLumenDatabase(factory, name);
});

test("rejects unsupported research schemas on write and read", async () => {
  const factory = new IDBFactory();
  const name = databaseName();
  const database = await openLumenDatabase({ factory, name });
  const repository = new IndexedDbResearchRepository(database);
  const unsupported = { ...simulatedRun("unsupported"), schemaVersion: 2 } as unknown as TestRun;
  await assert.rejects(repository.put(unsupported), /Unsupported research schema/);

  const transaction = database.transaction(StoreName.TestRuns, "readwrite");
  const completion = transactionComplete(transaction);
  await requestResult(transaction.objectStore(StoreName.TestRuns).put(unsupported));
  await completion;
  await assert.rejects(repository.get("unsupported"), /Unsupported research schema/);
  await assert.rejects(repository.list(), /Unsupported research schema/);
  database.close();
  await deleteLumenDatabase(factory, name);
});

test("persists sessions, symbols, chunks, checkpoints, and research across reopen", async () => {
  const factory = new IDBFactory();
  const name = databaseName();
  const first = await createPersistence({ factory, name });
  assert.equal(first.kind, "indexeddb");
  await first.sessions.put(session("transfer-a"));
  await first.symbols.put({ schemaVersion: 1, transferId: "transfer-a", symbolKey: "symbol-2", seed: 2, degree: 1, payload: new Uint8Array([2, 0]), acceptedOrder: 2, receivedAt: 2 });
  await first.symbols.put({ schemaVersion: 1, transferId: "transfer-a", symbolKey: "symbol-1", seed: 1, degree: 1, payload: new Uint8Array([1, 0]), acceptedOrder: 1, receivedAt: 1 });
  assert.equal(await first.symbols.put({ schemaVersion: 1, transferId: "transfer-a", symbolKey: "symbol-1", seed: 1, degree: 1, payload: new Uint8Array([1, 0]), acceptedOrder: 1, receivedAt: 1 }), false);
  await first.chunks.put({ schemaVersion: 1, transferId: "transfer-a", chunkIndex: 0, bytes: new Uint8Array([1, 2, 3, 4]), logicalLength: 4, blockSize: 4, checksumHex: null, persistedAt: 2 });
  await first.checkpoints.put(checkpoint("transfer-a"));
  await first.research.put(simulatedRun("run-a"));
  first.close();

  const reopened = await createPersistence({ factory, name });
  assert.equal((await reopened.sessions.get("transfer-a"))?.transferId, "transfer-a");
  assert.deepEqual((await reopened.symbols.listForTransfer("transfer-a")).map((value) => value.seed), [1, 2]);
  assert.deepEqual([...(await reopened.chunks.get("transfer-a", 0))!.bytes], [1, 2, 3, 4]);
  assert.equal((await reopened.checkpoints.get("transfer-a"))?.acceptedSymbols, 1);
  assert.equal((await reopened.research.get("run-a"))?.status, "complete");
  reopened.close();
  await deleteLumenDatabase(factory, name);
});

test("isolates transfers and deletes one session graph transactionally", async () => {
  const factory = new IDBFactory();
  const name = databaseName();
  const persistence = await createPersistence({ factory, name });
  for (const id of ["a", "b"]) {
    await persistence.sessions.put(session(id));
    await persistence.symbols.put({ schemaVersion: 1, transferId: id, symbolKey: "s", seed: 1, degree: 1, payload: new Uint8Array([1]), acceptedOrder: 1, receivedAt: 1 });
    await persistence.chunks.put({ schemaVersion: 1, transferId: id, chunkIndex: 0, bytes: new Uint8Array([1]), logicalLength: 1, blockSize: 1, checksumHex: null, persistedAt: 1 });
    await persistence.checkpoints.put(checkpoint(id));
  }
  await persistence.deleteTransfer("a");
  assert.equal(await persistence.sessions.get("a"), null);
  assert.equal((await persistence.symbols.listForTransfer("a")).length, 0);
  assert.equal((await persistence.chunks.listForTransfer("a")).length, 0);
  assert.equal(await persistence.checkpoints.get("a"), null);
  assert.equal((await persistence.symbols.listForTransfer("b")).length, 1);
  persistence.close();
  await deleteLumenDatabase(factory, name);
});

test("allows draft research updates but makes completed evidence immutable", async () => {
  const factory = new IDBFactory();
  const name = databaseName();
  const persistence = await createPersistence({ factory, name });
  await persistence.research.put(simulatedRun("run", "draft"));
  await persistence.research.put(simulatedRun("run", "complete"));
  await assert.rejects(persistence.research.put({ ...simulatedRun("run", "complete"), notes: "rewrite" }), /immutable/);
  persistence.close();
  await deleteLumenDatabase(factory, name);
});

test("falls back to memory when IndexedDB is unavailable or schema is newer", async () => {
  const unavailable = await createPersistence({ factory: undefined, name: databaseName() });
  assert.equal(unavailable.kind, "memory");
  assert.match(unavailable.fallbackReason ?? "", /unavailable/);

  const factory = new IDBFactory();
  const name = databaseName();
  const newerRequest = factory.open(name, LUMEN_DATABASE_VERSION + 1);
  const newerDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
    newerRequest.onsuccess = () => resolve(newerRequest.result);
    newerRequest.onerror = () => reject(newerRequest.error);
  });
  newerDatabase.close();
  const incompatible = await createPersistence({ factory, name });
  assert.equal(incompatible.kind, "memory");
  assert.ok(incompatible.fallbackReason);
  await deleteLumenDatabase(factory, name);
});

test("reports capability and quota estimates without requesting persistence", async () => {
  const factory = new IDBFactory();
  let persistedChecks = 0;
  const storageManager = {
    async estimate() { return { quota: 1_000, usage: 250 }; },
    async persisted() { persistedChecks++; return false; },
  } as StorageManager;
  const capabilities = await detectStorageCapabilities(factory, storageManager);
  assert.deepEqual(capabilities, { indexedDbAvailable: true, quotaBytes: 1_000, usageBytes: 250, persistent: false, error: null });
  assert.equal(persistedChecks, 1);
});
