import assert from "node:assert/strict";
import test from "node:test";
import { MemoryChunkRepository, MemoryResearchRepository, MemorySessionRepository, MemorySymbolRepository } from "./memory-repositories";
import type { TransferSession } from "../core/transfer-session";
import { TransportId } from "../core/transport";

test("symbol writes are idempotent and replay order is stable", async () => {
  const repository = new MemorySymbolRepository();
  const later = { schemaVersion: 1 as const, transferId: "t", symbolKey: "b", seed: 2, degree: 1, payload: new Uint8Array([2]), acceptedOrder: 2, receivedAt: 2 };
  const earlier = { schemaVersion: 1 as const, transferId: "t", symbolKey: "a", seed: 1, degree: 1, payload: new Uint8Array([1]), acceptedOrder: 1, receivedAt: 1 };
  assert.equal(await repository.put(later), true);
  assert.equal(await repository.put(earlier), true);
  assert.equal(await repository.put(earlier), false);
  assert.deepEqual((await repository.listForTransfer("t")).map((value) => value.seed), [1, 2]);
});

test("chunk repositories isolate transfers and preserve logical length", async () => {
  const repository = new MemoryChunkRepository();
  await repository.put({ schemaVersion: 1, transferId: "a", chunkIndex: 0, bytes: new Uint8Array([1, 0]), logicalLength: 1, blockSize: 2, checksumHex: null, persistedAt: 1 });
  await repository.put({ schemaVersion: 1, transferId: "b", chunkIndex: 0, bytes: new Uint8Array([2, 0]), logicalLength: 1, blockSize: 2, checksumHex: null, persistedAt: 1 });
  assert.equal((await repository.listForTransfer("a")).length, 1);
  assert.equal((await repository.get("a", 0))!.logicalLength, 1);
});

test("rejects corrupt versioned symbol and chunk records", async () => {
  const symbols = new MemorySymbolRepository();
  await assert.rejects(symbols.put({ schemaVersion: 1, transferId: "t", symbolKey: "x", seed: 1, degree: 0, payload: new Uint8Array([1]), acceptedOrder: 0, receivedAt: 1 }), /degree/);
  const chunks = new MemoryChunkRepository();
  await assert.rejects(chunks.put({ schemaVersion: 1, transferId: "t", chunkIndex: 0, bytes: new Uint8Array([1]), logicalLength: 2, blockSize: 1, checksumHex: null, persistedAt: 1 }), /logical length/);
});

test("completed research evidence is immutable", async () => {
  const repository = new MemoryResearchRepository();
  const device = { platform: "desktop" as const, deviceName: "test", osVersion: "test", browserName: "test", browserVersion: "test" };
  const completed = {
    schemaVersion: 1 as const, runId: "run", status: "complete" as const, evidenceKind: "simulated" as const, transport: TransportId.QR,
    sender: device, receiver: device, fileName: "x", fileHashHex: "a".repeat(64), integrityStatus: "verified" as const,
    metrics: { fileSize: 1, elapsedMs: 1, averageThroughputBytesPerSecond: 1, frameHitRate: 1, errorRate: 0, recoveryOverhead: 0, cameraFps: null, screenFps: null, signalQuality: null },
    distanceCm: null, environment: "unspecified" as const, notes: "", createdAt: 1, completedAt: 2,
  };
  await repository.put(completed);
  await assert.rejects(repository.put({ ...completed, notes: "rewritten" }), /immutable/);
});

test("session repository returns defensive copies", async () => {
  const repository = new MemorySessionRepository();
  const value: TransferSession = {
    schemaVersion: 1, transferId: "t", protocolVersion: 1, direction: "receive", transport: TransportId.QR,
    file: { name: "x", size: 1, mimeType: "application/octet-stream", sha256Hex: "a".repeat(64), mediaKind: "other" },
    fileHashHex: "a".repeat(64),
    blockSize: 1, totalBlocks: 1, status: "recoverable", createdAt: 1, updatedAt: 2, completedAt: null,
    resumeCapability: "replay-receiver", encodingMode: "fountain", acceptedSymbols: 1, resolvedBlocks: 0,
    checkpointVersion: 1, failureCode: null, transportConfig: {},
  };
  await repository.put(value);
  const restored = (await repository.get("t"))!;
  restored.file.name = "mutated";
  assert.equal((await repository.get("t"))!.file.name, "x");
});

test("memory sessions reject inconsistent flat hashes and recovery state", async () => {
  const repository = new MemorySessionRepository();
  const value: TransferSession = {
    schemaVersion: 1, transferId: "bad", protocolVersion: 1, direction: "receive", transport: TransportId.QR,
    file: { name: "x", size: 1, mimeType: "application/octet-stream", sha256Hex: "a".repeat(64), mediaKind: "other" },
    fileHashHex: "b".repeat(64), blockSize: 1, totalBlocks: 1, status: "recoverable", createdAt: 1, updatedAt: 2, completedAt: null,
    resumeCapability: "replay-receiver", encodingMode: "fountain", acceptedSymbols: 0, resolvedBlocks: 0,
    checkpointVersion: 1, failureCode: null, transportConfig: {},
  };
  await assert.rejects(repository.put(value), /inconsistent/);
});
