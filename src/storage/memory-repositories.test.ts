import assert from "node:assert/strict";
import test from "node:test";
import { MemoryChunkRepository, MemorySessionRepository, MemorySymbolRepository } from "./memory-repositories";
import type { TransferSession } from "../core/transfer-session";
import { TransportId } from "../core/transport";

test("symbol writes are idempotent and replay order is stable", async () => {
  const repository = new MemorySymbolRepository();
  const later = { transferId: "t", symbolKey: "b", seed: 2, degree: 1, payload: new Uint8Array([2]), acceptedOrder: 2, receivedAt: 2 };
  const earlier = { transferId: "t", symbolKey: "a", seed: 1, degree: 1, payload: new Uint8Array([1]), acceptedOrder: 1, receivedAt: 1 };
  assert.equal(await repository.put(later), true);
  assert.equal(await repository.put(earlier), true);
  assert.equal(await repository.put(earlier), false);
  assert.deepEqual((await repository.listForTransfer("t")).map((value) => value.seed), [1, 2]);
});

test("chunk repositories isolate transfers and preserve logical length", async () => {
  const repository = new MemoryChunkRepository();
  await repository.put({ transferId: "a", chunkIndex: 0, bytes: new Uint8Array([1, 0]), logicalLength: 1, persistedAt: 1 });
  await repository.put({ transferId: "b", chunkIndex: 0, bytes: new Uint8Array([2, 0]), logicalLength: 1, persistedAt: 1 });
  assert.equal((await repository.listForTransfer("a")).length, 1);
  assert.equal((await repository.get("a", 0))!.logicalLength, 1);
});

test("session repository returns defensive copies", async () => {
  const repository = new MemorySessionRepository();
  const value: TransferSession = {
    schemaVersion: 1, transferId: "t", protocolVersion: 1, direction: "receive", transport: TransportId.QR,
    file: { name: "x", size: 1, mimeType: "application/octet-stream", sha256Hex: "a".repeat(64), mediaKind: "other" },
    blockSize: 1, totalBlocks: 1, status: "recoverable", createdAt: 1, updatedAt: 2, completedAt: null,
    resumeCapability: "replay-receiver", encodingMode: "fountain", acceptedSymbols: 1, resolvedBlocks: 0,
    checkpointVersion: 1, failureCode: null, transportConfig: {},
  };
  await repository.put(value);
  const restored = (await repository.get("t"))!;
  restored.file.name = "mutated";
  assert.equal((await repository.get("t"))!.file.name, "x");
});
