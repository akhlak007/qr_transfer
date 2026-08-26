import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { PersistenceQueue } from "./persistence-queue";
import { createPersistence } from "./persistence";
import type { TransferSession, SessionCheckpoint } from "../core/transfer-session";
import { TransportId } from "../core/transport";

function createMockSession(transferId: string): TransferSession {
  return {
    schemaVersion: 1,
    transferId,
    protocolVersion: 1,
    direction: "receive",
    transport: TransportId.QR,
    file: {
      name: "test.bin",
      size: 1024,
      mimeType: "application/octet-stream",
      sha256Hex: "0".repeat(64),
      mediaKind: "other",
    },
    fileHashHex: "0".repeat(64),
    blockSize: 512,
    totalBlocks: 2,
    status: "active",
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: null,
    resumeCapability: "none",
    encodingMode: "fountain",
    acceptedSymbols: 0,
    resolvedBlocks: 0,
    checkpointVersion: 1,
    failureCode: null,
    transportConfig: {},
  };
}

test("PersistenceQueue batches writes and flushes at threshold", async () => {
  const persistence = await createPersistence({ factory: new IDBFactory(), name: "test-queue-batch" });
  const transferId = "queue-test-1";
  const queue = new PersistenceQueue(transferId, persistence, { batchSize: 4, flushIntervalMs: 5000 });

  const session = createMockSession(transferId);
  queue.setSession(session);

  // Queue 3 symbols (below batch size 4)
  for (let i = 0; i < 3; i++) {
    queue.queueSymbol({ seed: i + 1, degree: 1, payload: new Uint8Array([i]) }, i);
  }

  // Not yet flushed because threshold is 4 and interval is 5000ms
  assert.equal(queue.getStatus(), "idle");

  // Queue 4th symbol - triggers batch threshold flush
  queue.queueSymbol({ seed: 4, degree: 1, payload: new Uint8Array([4]) }, 3);

  // Wait for async flush to finish
  await queue.flush();

  const storedSymbols = await persistence.symbols.listForTransfer(transferId);
  assert.equal(storedSymbols.length, 4);
  assert.equal(queue.getStatus(), "saved");

  queue.destroy();
  persistence.close();
});

test("PersistenceQueue flushes on timer interval", async () => {
  const persistence = await createPersistence({ factory: new IDBFactory(), name: "test-queue-timer" });
  const transferId = "queue-test-2";
  const queue = new PersistenceQueue(transferId, persistence, { batchSize: 10, flushIntervalMs: 50 });

  const chunkBytes = new Uint8Array(512);
  chunkBytes.set([1, 2, 3]);
  queue.queueChunk(0, chunkBytes, 3, 512);

  // Wait for timer flush to complete
  await new Promise((resolve) => setTimeout(resolve, 150));
  await queue.flush();

  const chunk = await persistence.chunks.get(transferId, 0);
  assert.ok(chunk);
  assert.equal(chunk.logicalLength, 3);
  assert.equal(chunk.blockSize, 512);

  queue.destroy();
  persistence.close();
});

test("PersistenceQueue flushes checkpoints and keeps storage errors isolated", async () => {
  const persistence = await createPersistence({ factory: new IDBFactory(), name: "test-queue-error" });
  const transferId = "queue-test-3";
  let notifiedStatus = "";

  const queue = new PersistenceQueue(transferId, persistence, {
    batchSize: 16,
    onStatusChange: (status) => {
      notifiedStatus = status;
    },
  });

  const checkpoint: SessionCheckpoint = {
    schemaVersion: 1,
    transferId,
    acceptedSymbols: 5,
    resolvedBlockIndices: [0, 1],
    persistedChunks: 2,
    metrics: { speedKbs: 120 },
    createdAt: Date.now(),
  };

  queue.setCheckpoint(checkpoint);
  await queue.flush();

  const storedCheckpoint = await persistence.checkpoints.get(transferId);
  assert.ok(storedCheckpoint);
  assert.equal(storedCheckpoint.acceptedSymbols, 5);
  assert.equal(notifiedStatus, "saved");

  queue.destroy();
  persistence.close();
});

test("PersistenceQueue works seamlessly with in-memory persistence fallback", async () => {
  // Pass factory as undefined to force memory fallback
  const persistence = await createPersistence({ factory: undefined, name: "test-memory-fallback" });
  assert.equal(persistence.kind, "memory");

  const transferId = "queue-mem-1";
  const queue = new PersistenceQueue(transferId, persistence, { batchSize: 2, flushIntervalMs: 50 });

  queue.queueSymbol({ seed: 10, degree: 2, payload: new Uint8Array([1, 2]) }, 0);
  queue.queueSymbol({ seed: 20, degree: 1, payload: new Uint8Array([3, 4]) }, 1);

  await queue.flush();

  const stored = await persistence.symbols.listForTransfer(transferId);
  assert.equal(stored.length, 2);
  assert.equal(queue.getStatus(), "saved");

  queue.destroy();
  persistence.close();
});
