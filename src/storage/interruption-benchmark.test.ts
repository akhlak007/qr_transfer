import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { FountainEncoder } from "../modules/fountain";
import { chunkFile, reassembleFile } from "../modules/chunker";
import { sha256, sha256Hex } from "../core/integrity";
import { TransportId } from "../core/transport";
import { createPersistence } from "./persistence";
import { RecoveryManager } from "./recovery-manager";
import type { TransferSession } from "../core/transfer-session";

describe("Multi-Point Interruption & Replay Benchmark (Milestone 2F)", () => {
  const interruptionPercentages = [0.1, 0.25, 0.5, 0.75, 0.9];
  const blockSizes = [128, 256, 512, 1024];

  for (const blockSize of blockSizes) {
    for (const ratio of interruptionPercentages) {
      test(`interrupts at ${(ratio * 100).toFixed(0)}% with ${blockSize}B blocks, replays, and completes bit-perfect reconstruction`, async () => {
        const factory = new IDBFactory();
        const dbName = `lumen_interruption_${blockSize}_${(ratio * 100).toFixed(0)}`;

        // 1. Generate 32KB test file with high entropy pattern
        const originalBytes = new Uint8Array(32768);
        for (let i = 0; i < originalBytes.length; i++) {
          originalBytes[i] = (i * 59 + 31) % 256;
        }
        const hexHash = await sha256Hex(originalBytes);
        const hashBytes = await sha256(originalBytes);

        const chunks = chunkFile(originalBytes, blockSize);
        const totalBlocks = chunks.length;
        const encoder = new FountainEncoder(chunks, blockSize);

        // Required symbols for ~1.5x overhead
        const estimatedTotalSymbols = Math.ceil(totalBlocks * 1.5);
        const interruptSymbolCount = Math.max(1, Math.floor(estimatedTotalSymbols * ratio));

        const transferId = `tx-bench-${blockSize}-${(ratio * 100).toFixed(0)}`;
        const session: TransferSession = {
          schemaVersion: 1,
          transferId,
          protocolVersion: 1,
          direction: "receive",
          transport: TransportId.QR,
          file: {
            name: `test_${blockSize}.bin`,
            size: originalBytes.byteLength,
            mimeType: "application/octet-stream",
            sha256Hex: hexHash,
            mediaKind: "other",
          },
          fileHashHex: hexHash,
          blockSize,
          totalBlocks,
          status: "paused",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          resumeCapability: "replay-receiver",
          encodingMode: "fountain",
          acceptedSymbols: interruptSymbolCount,
          resolvedBlocks: 0,
          checkpointVersion: 1,
          failureCode: null,
          transportConfig: {},
        };

        // 2. Open persistence connection #1 and write session + symbols up to interruption point
        const persistence1 = await createPersistence({ factory, name: dbName });
        await persistence1.sessions.put(session);

        const preInterruptionSymbols = [];
        for (let i = 0; i < interruptSymbolCount; i++) {
          const sym = encoder.generateSymbol();
          preInterruptionSymbols.push(sym);
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

        // 3. Abrupt interruption / browser reload simulation: close connection #1
        persistence1.close();

        // 4. Open fresh connection #2 from the same IDB store
        const persistence2 = await createPersistence({ factory, name: dbName });

        const replayStart = performance.now();
        const replayResult = await RecoveryManager.replayReceiverSession(transferId, persistence2);
        const replayDurationMs = performance.now() - replayStart;

        assert.ok(replayDurationMs >= 0);
        assert.equal(replayResult.replayedSymbols, interruptSymbolCount);

        // 5. Continue live stream with replayed decoder until reconstruction completes
        const recoveredDecoder = replayResult.decoder;
        let additionalSymbols = 0;
        const maxAdditionalSymbols = Math.max(totalBlocks * 6, 250);

        while (!recoveredDecoder.isDone() && additionalSymbols < maxAdditionalSymbols) {
          const sym = encoder.generateSymbol();
          recoveredDecoder.processSymbol(sym);
          additionalSymbols++;
        }

        assert.equal(recoveredDecoder.isDone(), true, "Decoder failed to complete after resuming stream");

        // 6. Reassemble file and verify bit-perfect SHA-256 match
        const resolvedBlocks = recoveredDecoder.getResolvedBlocks();
        const reconstructed = reassembleFile(resolvedBlocks, originalBytes.byteLength, blockSize);

        assert.equal(reconstructed.byteLength, originalBytes.byteLength);
        assert.deepEqual(reconstructed, originalBytes);

        const reconstructedHash = await sha256(reconstructed);
        assert.deepEqual(reconstructedHash, hashBytes);

        persistence2.close();
      });
    }
  }
});
