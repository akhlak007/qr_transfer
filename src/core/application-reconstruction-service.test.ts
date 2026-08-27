import assert from "node:assert/strict";
import test from "node:test";
import { chunkFile } from "../modules/chunker";
import { FountainEncoder, mulberry32 } from "../modules/fountain";
import { encodeCompactMessageFrame, encodeFountainFrame, encodeMetadataFrame, encodeSequentialFrame } from "../modules/protocol";
import { sha256, sha256Hex } from "./integrity";
import { ApplicationReconstructionService } from "./application-reconstruction-service";
import { opticalDiagnosticTrace } from "../diagnostics/optical-trace";

async function fixture(payload: Uint8Array, blockSize = 8) {
  const blocks = chunkFile(payload, blockSize);
  const metadata = encodeMetadataFrame({
    dataType: "file", fileSize: payload.length, blockSize, totalBlocks: blocks.length,
    fileHash: await sha256(payload), fileName: "hardening.bin",
  });
  return { blocks, metadata };
}

test("shared reconstruction service completes sequential data with SHA-256", async () => {
  const payload = Uint8Array.from({ length: 19 }, (_, index) => index * 7 + 1);
  const { blocks, metadata } = await fixture(payload);
  const service = new ApplicationReconstructionService();
  service.ingest(metadata);
  for (let index = 0; index < blocks.length; index++) {
    const length = Math.min(8, payload.length - index * 8);
    service.ingest(encodeSequentialFrame(index, blocks[index].subarray(0, length)));
  }
  const result = await service.getFinalizationPromise();
  assert.ok(result);
  assert.equal(result.actualSha256, await sha256Hex(payload));
  assert.equal(result.sha256Matched, true);
  assert.equal(service.getSnapshot().finalizationState, "complete");
});

test("reconstruction diagnostics are observational", async () => {
  const payload = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
  const { blocks, metadata } = await fixture(payload, 8);
  const run = async (enabled: boolean) => {
    opticalDiagnosticTrace.clear();
    opticalDiagnosticTrace.setEnabled(enabled);
    const service = new ApplicationReconstructionService();
    service.ingest(metadata);
    service.ingest(encodeSequentialFrame(0, blocks[0]));
    service.ingest(encodeSequentialFrame(1, blocks[1].subarray(0, 4)));
    const result = await service.getFinalizationPromise();
    return { result, snapshot: service.getSnapshot(), trace: opticalDiagnosticTrace.snapshot() };
  };
  const disabled = await run(false);
  const enabled = await run(true);
  opticalDiagnosticTrace.setEnabled(false);
  assert.deepEqual(enabled.result, disabled.result);
  assert.deepEqual(enabled.snapshot, disabled.snapshot);
  assert.equal(disabled.trace.events.length, 0);
  assert.ok(enabled.trace.events.some((event) => event.stage === "ApplicationReconstructionService" && event.event === "ingest-result"));
});

test("shared reconstruction service completes fountain data", async () => {
  const payload = Uint8Array.from({ length: 17 }, (_, index) => 255 - index * 5);
  const { blocks, metadata } = await fixture(payload);
  const service = new ApplicationReconstructionService();
  service.ingest(metadata);
  const encoder = new FountainEncoder(blocks, 8, mulberry32(920));
  for (let count = 0; count < 100 && !service.getFinalizationPromise(); count++) {
    service.ingest(encodeFountainFrame(encoder.generateSymbol(), blocks.length));
  }
  const result = await service.getFinalizationPromise();
  assert.ok(result);
  assert.equal(result.actualSha256, await sha256Hex(payload));
});

test("duplicate terminal frames share one SHA-256 finalization", async () => {
  const payload = new Uint8Array([1, 2, 3, 4]);
  const { blocks, metadata } = await fixture(payload, 4);
  let hashCalls = 0;
  let releaseHash!: () => void;
  const gate = new Promise<void>((resolve) => { releaseHash = resolve; });
  const service = new ApplicationReconstructionService(async (data) => {
    hashCalls++;
    await gate;
    return sha256Hex(data);
  });
  service.ingest(metadata);
  const terminal = encodeSequentialFrame(0, blocks[0]);
  const first = service.ingest(terminal).finalization;
  const duplicate = service.ingest(terminal).finalization;
  assert.equal(first, duplicate);
  assert.equal(hashCalls, 1);
  assert.equal(service.getSnapshot().finalizationState, "finalizing");
  releaseHash();
  await first;
  assert.equal(hashCalls, 1);
});

test("new transfer metadata resets incompatible reconstruction atomically", async () => {
  const first = await fixture(new Uint8Array(16).fill(1));
  const second = await fixture(new Uint8Array(8).fill(2));
  const service = new ApplicationReconstructionService();
  service.ingest(first.metadata);
  service.ingest(encodeSequentialFrame(0, first.blocks[0]));
  const observation = service.ingest(second.metadata);
  assert.equal(observation.reset, true);
  assert.equal(observation.snapshot.resolvedBlocks, 0);
  assert.equal(observation.snapshot.totalBlocks, 1);
});

test("data type participates in transfer identity", async () => {
  const payload = new Uint8Array(8).fill(3);
  const { metadata } = await fixture(payload);
  const decodedHash = await sha256(payload);
  const messageMetadata = encodeMetadataFrame({
    dataType: "message", fileSize: payload.length, blockSize: 8, totalBlocks: 1,
    fileHash: decodedHash, fileName: "hardening.bin",
  });
  const service = new ApplicationReconstructionService();
  service.ingest(metadata);
  assert.equal(service.ingest(messageMetadata).reset, true);
  assert.equal(service.getSnapshot().metadata?.dataType, "message");
});

test("SHA-256 mismatch fails finalization and result access is copy-isolated", async () => {
  const payload = new Uint8Array([4, 5, 6, 7]);
  const { blocks, metadata } = await fixture(payload, 4);
  const service = new ApplicationReconstructionService(async () => "00".repeat(32));
  service.ingest(metadata);
  const result = await service.ingest(encodeSequentialFrame(0, blocks[0])).finalization;
  assert.ok(result);
  assert.equal(result.sha256Matched, false);
  assert.equal(service.getSnapshot().finalizationState, "failed");
  result.data[0] = 255;
  const retained = service.getResult();
  assert.ok(retained);
  assert.equal(retained.data[0], payload[0]);
});

test("compact messages complete without metadata and suppress exact repetitions", () => {
  const service = new ApplicationReconstructionService();
  const payload = encodeCompactMessageFrame(42, new TextEncoder().encode("hey"));
  const first = service.ingest(payload);
  const duplicate = service.ingest(payload);
  assert.equal(first.accepted, true);
  assert.equal(first.compactMessage?.text, "hey");
  assert.equal(first.snapshot.progress, 1);
  assert.equal(first.snapshot.finalizationState, "complete");
  assert.equal(duplicate.duplicate, true);
  assert.equal(service.getSnapshot().duplicateFrames, 1);
});

test("compact message ID collisions are rejected without replacing delivered bytes", () => {
  const service = new ApplicationReconstructionService();
  service.ingest(encodeCompactMessageFrame(7, new TextEncoder().encode("one")));
  const collision = service.ingest(encodeCompactMessageFrame(7, new TextEncoder().encode("two")));
  assert.equal(collision.accepted, false);
  assert.match(collision.snapshot.error ?? "", /collision/);
  assert.equal(service.getSnapshot().compactMessage?.text, "one");
});

test("legacy metadata replaces compact-message state without mixing transfer modes", async () => {
  const service = new ApplicationReconstructionService();
  service.ingest(encodeCompactMessageFrame(8, new TextEncoder().encode("done")));
  const { metadata } = await fixture(new Uint8Array(8).fill(4));
  const observation = service.ingest(metadata);
  assert.equal(observation.reset, true);
  assert.equal(observation.snapshot.mode, "none");
  assert.equal(observation.snapshot.compactMessage, null);
  assert.equal(observation.snapshot.metadata?.fileName, "hardening.bin");
});

test("compact duplicate and collision detection survives intervening messages", () => {
  const service = new ApplicationReconstructionService();
  const first = encodeCompactMessageFrame(1, new TextEncoder().encode("one"));
  service.ingest(first);
  service.ingest(encodeCompactMessageFrame(2, new TextEncoder().encode("two")));
  assert.equal(service.ingest(first).duplicate, true);
  const collision = service.ingest(encodeCompactMessageFrame(1, new TextEncoder().encode("changed")));
  assert.match(collision.snapshot.error ?? "", /collision/);
});
