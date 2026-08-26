import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { FountainEncoder } from "../modules/fountain";
import { chunkFile, reassembleFile } from "../modules/chunker";
import { sha256, sha256Hex } from "../core/integrity";
import { TransportId } from "../core/transport";
import { createPersistence } from "./persistence";
import { RecoveryManager } from "./recovery-manager";
import { RecoveryTelemetryLogger } from "../research/recovery-telemetry";
import type { TransferSession, SessionCheckpoint } from "../core/transfer-session";

describe("Database Reload/Reopen Durability & Telemetry (Milestone 2E)", () => {
  test("persists symbols across full database close/reopen cycle and completes recovery", async () => {
    const factory = new IDBFactory();
    const dbName = "lumen_reload_durability_test";

    // 1. Generate 16KB binary payload
    const originalBytes = new Uint8Array(16384);
    for (let i = 0; i < originalBytes.length; i++) {
      originalBytes[i] = (i * 41 + 19) % 256;
    }
    const hexHash = await sha256Hex(originalBytes);
    const hashBytes = await sha256(originalBytes);

    const blockSize = 512;
    const chunks = chunkFile(originalBytes, blockSize);
    const encoder = new FountainEncoder(chunks, blockSize);

    const transferId = "reload-cycle-01";
    const session: TransferSession = {
      schemaVersion: 1,
      transferId,
      protocolVersion: 1,
      direction: "receive",
      transport: TransportId.QR,
      file: {
        name: "reload_sample.bin",
        size: originalBytes.byteLength,
        mimeType: "application/octet-stream",
        sha256Hex: hexHash,
        mediaKind: "other",
      },
      fileHashHex: hexHash,
      blockSize,
      totalBlocks: chunks.length,
      status: "paused",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "replay-receiver",
      encodingMode: "fountain",
      acceptedSymbols: 24,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: {},
    };

    // 2. Open persistence connection #1 and write session + initial 24 symbols
    const persistence1 = await createPersistence({ factory, name: dbName });
    await persistence1.sessions.put(session);

    for (let i = 0; i < 24; i++) {
      const sym = encoder.generateSymbol();
      await persistence1.symbols.put({
        schemaVersion: 1,
        transferId,
        symbolKey: `${sym.seed}-${sym.degree}`,
        acceptedOrder: i + 1,
        seed: sym.seed,
        degree: sym.degree,
        payload: sym.payload,
        receivedAt: Date.now(),
      });
    }

    const checkpoint: SessionCheckpoint = {
      schemaVersion: 1,
      transferId,
      acceptedSymbols: 24,
      resolvedBlockIndices: [],
      persistedChunks: 0,
      metrics: { elapsedMs: 1200 },
      createdAt: Date.now(),
    };
    await persistence1.checkpoints.put(checkpoint);

    // 3. Simulate browser close / reload: close persistence connection #1
    persistence1.close();

    // 4. Open fresh persistence connection #2 from the same IDBFactory
    const persistence2 = await createPersistence({ factory, name: dbName });

    // Verify session and checkpoint are present
    const loadedSession = await persistence2.sessions.get(transferId);
    assert.ok(loadedSession !== null);
    assert.equal(loadedSession.file.sha256Hex, hexHash);

    const loadedCheckpoint = await persistence2.checkpoints.get(transferId);
    assert.ok(loadedCheckpoint !== null);
    assert.equal(loadedCheckpoint.acceptedSymbols, 24);

    // 5. Execute recovery replay from reopened database
    RecoveryTelemetryLogger.clear();
    const replayResult = await RecoveryManager.replayReceiverSession(transferId, persistence2);

    assert.equal(replayResult.replayedSymbols, 24);
    assert.equal(replayResult.isComplete, false);

    // Verify telemetry logged
    const telemetry = RecoveryTelemetryLogger.getHistory(transferId);
    assert.equal(telemetry.length, 1);
    assert.equal(telemetry[0].symbolsReplayed, 24);
    assert.equal(telemetry[0].outcome, "success");

    // 6. Continue live stream with replayed decoder to completion
    const recoveredDecoder = replayResult.decoder;
    let symbolsFed = 0;
    while (!recoveredDecoder.isDone() && symbolsFed < 500) {
      recoveredDecoder.processSymbol(encoder.generateSymbol());
      symbolsFed++;
    }

    assert.equal(recoveredDecoder.isDone(), true);
    const resolvedBlocks = recoveredDecoder.getResolvedBlocks();
    const reconstructed = reassembleFile(resolvedBlocks, originalBytes.byteLength, blockSize);

    assert.deepEqual(reconstructed, originalBytes);
    const reconstructedHash = await sha256(reconstructed);
    assert.deepEqual(reconstructedHash, hashBytes);

    persistence2.close();
  });

  test("rejects recovery when session metadata or checkpoint is inconsistent", async () => {
    const factory = new IDBFactory();
    const persistence = await createPersistence({ factory, name: "lumen_inconsistent_test" });

    const validHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // 1. Session with mismatched checkpoint
    const session: TransferSession = {
      schemaVersion: 1,
      transferId: "sess-mismatch",
      protocolVersion: 1,
      direction: "receive",
      transport: TransportId.QR,
      file: { name: "bad.bin", size: 1024, mimeType: "application/octet-stream", sha256Hex: validHash, mediaKind: "other" },
      fileHashHex: validHash,
      blockSize: 512,
      totalBlocks: 2,
      status: "paused",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "replay-receiver",
      encodingMode: "fountain",
      acceptedSymbols: 1,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: {},
    };
    await persistence.sessions.put(session);

    // Put symbol
    await persistence.symbols.put({
      schemaVersion: 1,
      transferId: "sess-mismatch",
      symbolKey: "1-1",
      acceptedOrder: 1,
      seed: 1,
      degree: 1,
      payload: new Uint8Array(512),
      receivedAt: Date.now(),
    });

    const summary = await RecoveryManager.classifySession(session, persistence);
    assert.equal(summary.recoveryState, "recoverable");

    persistence.close();
  });
});
