import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { FountainEncoder } from "../modules/fountain";
import { chunkFile, reassembleFile } from "../modules/chunker";
import { sha256 } from "../core/integrity";
import { TransportId } from "../core/transport";
import { createPersistence } from "./persistence";
import { RecoveryManager } from "./recovery-manager";
import type { TransferSession } from "../core/transfer-session";

describe("RecoveryManager & Replay Foundation (Milestone 2D)", () => {
  test("replays accepted symbols into fresh decoder and completes reconstruction", async () => {
    const factory = new IDBFactory();
    const persistence = await createPersistence({
      factory,
      name: "lumen_recovery_test_1",
    });

    // 1. Prepare 8KB payload
    const originalBytes = new Uint8Array(8192);
    for (let i = 0; i < originalBytes.length; i++) {
      originalBytes[i] = (i * 37 + 13) % 256;
    }
    const hashBytes = await sha256(originalBytes);
    const hexHash = Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const blockSize = 512;
    const chunks = chunkFile(originalBytes, blockSize);
    const encoder = new FountainEncoder(chunks, blockSize);

    const transferId = "rx-recovery-test-01";
    const session: TransferSession = {
      schemaVersion: 1,
      transferId,
      protocolVersion: 1,
      direction: "receive",
      transport: TransportId.QR,
      file: {
        name: "recovery_sample.bin",
        size: originalBytes.byteLength,
        mimeType: "application/octet-stream",
        sha256Hex: hexHash,
        mediaKind: "other",
      },
      fileHashHex: hexHash,
      blockSize,
      totalBlocks: chunks.length,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "none",
      encodingMode: "fountain",
      acceptedSymbols: 0,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: {},
    };

    await persistence.sessions.put(session);

    // 2. Generate symbols and ingest first 18 symbols (partial transfer)
    const allSymbols = [];
    for (let i = 0; i < 50; i++) {
      allSymbols.push(encoder.generateSymbol());
    }

    const partialSymbols = allSymbols.slice(0, 18);
    for (let i = 0; i < partialSymbols.length; i++) {
      const sym = partialSymbols[i];
      await persistence.symbols.put({
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

    // 3. Simulate browser teardown & replay recovery
    let progressCalls = 0;
    const replayResult = await RecoveryManager.replayReceiverSession(
      transferId,
      persistence,
      (p) => {
        progressCalls++;
        assert.ok(p.symbolsReplayed <= p.totalSymbols);
      }
    );

    assert.equal(replayResult.replayedSymbols, 18);
    assert.ok(progressCalls > 0);
    assert.equal(replayResult.isComplete, false);

    // 4. Continue feeding live symbols into replayed decoder until complete
    const recoveredDecoder = replayResult.decoder;
    let liveSymbolsFed = 0;
    while (!recoveredDecoder.isDone() && liveSymbolsFed < 500) {
      recoveredDecoder.processSymbol(encoder.generateSymbol());
      liveSymbolsFed++;
    }

    assert.equal(recoveredDecoder.isDone(), true);
    const resolvedBlocks = recoveredDecoder.getResolvedBlocks();
    const reconstructed = reassembleFile(resolvedBlocks, originalBytes.byteLength, blockSize);

    assert.deepEqual(reconstructed, originalBytes);
    const reconstructedHash = await sha256(reconstructed);
    assert.deepEqual(reconstructedHash, hashBytes);
  });

  test("validates sender source file with exact identity and rejects mismatched files", async () => {
    const fileBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const fileHash = await sha256(fileBytes);
    const hexHash = Array.from(fileHash)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const session: TransferSession = {
      schemaVersion: 1,
      transferId: "tx-session-1",
      protocolVersion: 1,
      direction: "send",
      transport: TransportId.QR,
      file: {
        name: "test.dat",
        size: 5,
        mimeType: "application/octet-stream",
        sha256Hex: hexHash,
        mediaKind: "other",
      },
      fileHashHex: hexHash,
      blockSize: 256,
      totalBlocks: 1,
      status: "paused",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "restart-sender",
      encodingMode: "fountain",
      acceptedSymbols: 0,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: {},
    };

    // Case 1: Exact matching file
    const validFile = {
      name: "test.dat",
      size: 5,
      arrayBuffer: async () => fileBytes.buffer,
    };
    const validResult = await RecoveryManager.validateSenderFile(session, validFile as File);
    assert.equal(validResult.valid, true);

    // Case 2: Size mismatch
    const wrongSizeFile = {
      name: "test.dat",
      size: 6,
      arrayBuffer: async () => new Uint8Array([10, 20, 30, 40, 50, 60]).buffer,
    };
    const wrongSizeResult = await RecoveryManager.validateSenderFile(session, wrongSizeFile as File);
    assert.equal(wrongSizeResult.valid, false);
    assert.match(wrongSizeResult.error!, /size mismatch/i);

    // Case 3: Altered content (hash mismatch)
    const alteredFile = {
      name: "test.dat",
      size: 5,
      arrayBuffer: async () => new Uint8Array([10, 20, 30, 40, 99]).buffer,
    };
    const alteredResult = await RecoveryManager.validateSenderFile(session, alteredFile as File);
    assert.equal(alteredResult.valid, false);
    assert.match(alteredResult.error!, /hash mismatch/i);
  });

  test("classifies sessions into exact recovery states", async () => {
    const factory = new IDBFactory();
    const persistence = await createPersistence({
      factory,
      name: "lumen_recovery_classify",
    });

    const validHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // 1. Recoverable sender session
    const senderSession: TransferSession = {
      schemaVersion: 1,
      transferId: "tx-paused",
      protocolVersion: 1,
      direction: "send",
      transport: TransportId.QR,
      file: { name: "a.txt", size: 100, mimeType: "text/plain", sha256Hex: validHash, mediaKind: "other" },
      fileHashHex: validHash,
      blockSize: 64,
      totalBlocks: 2,
      status: "paused",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "restart-sender",
      encodingMode: "fountain",
      acceptedSymbols: 0,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: {},
    };
    await persistence.sessions.put(senderSession);

    // 2. Completed session
    const completedSession: TransferSession = {
      ...senderSession,
      transferId: "tx-completed",
      status: "complete",
      completedAt: Date.now(),
      resumeCapability: "complete",
    };
    await persistence.sessions.put(completedSession);

    // 3. Corrupted session (invalid hash)
    const corruptSession: TransferSession = {
      ...senderSession,
      transferId: "tx-corrupt",
      file: { ...senderSession.file, sha256Hex: "invalid-short-hash" },
      fileHashHex: "invalid-short-hash",
    };
    const corruptSummary = await RecoveryManager.classifySession(corruptSession, persistence);
    assert.equal(corruptSummary.recoveryState, "corrupted");

    // 4. Empty receiver session (no symbols or chunks)
    const emptyRxSession: TransferSession = {
      ...senderSession,
      transferId: "rx-empty",
      direction: "receive",
      status: "active",
      resumeCapability: "none",
    };
    await persistence.sessions.put(emptyRxSession);

    const summaries = await RecoveryManager.listSessions(persistence);
    const summaryMap = new Map(summaries.map((s) => [s.session.transferId, s.recoveryState]));

    assert.equal(summaryMap.get("tx-paused"), "recoverable");
    assert.equal(summaryMap.get("tx-completed"), "completed");
    assert.equal(summaryMap.get("rx-empty"), "non-recoverable");
  });

  test("transactionally deletes session graph", async () => {
    const factory = new IDBFactory();
    const persistence = await createPersistence({
      factory,
      name: "lumen_recovery_delete",
    });

    const transferId = "graph-to-delete";
    const validHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    await persistence.sessions.put({
      schemaVersion: 1,
      transferId,
      protocolVersion: 1,
      direction: "receive",
      transport: TransportId.QR,
      file: { name: "del.txt", size: 10, mimeType: "text/plain", sha256Hex: validHash, mediaKind: "other" },
      fileHashHex: validHash,
      blockSize: 10,
      totalBlocks: 1,
      status: "paused",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "none",
      encodingMode: "fountain",
      acceptedSymbols: 0,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: {},
    });

    await persistence.symbols.put({
      schemaVersion: 1,
      transferId,
      symbolKey: "123-1",
      acceptedOrder: 1,
      seed: 123,
      degree: 1,
      payload: new Uint8Array([1, 2, 3]),
      receivedAt: Date.now(),
    });

    await RecoveryManager.deleteSessionGraph(transferId, persistence);

    assert.equal(await persistence.sessions.get(transferId), null);
    assert.equal((await persistence.symbols.listForTransfer(transferId)).length, 0);
  });
});
