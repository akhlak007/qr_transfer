import assert from "node:assert/strict";
import test from "node:test";
import { calculateTransferMetrics, EMPTY_TRANSFER_COUNTERS } from "./transfer-metrics";

test("calculates explicitly defined receive metrics", () => {
  const result = calculateTransferMetrics(
    {
      ...EMPTY_TRANSFER_COUNTERS,
      cameraFramesCaptured: 120,
      decodeAttempts: 100,
      decodedFrames: 80,
      duplicateFrames: 10,
      acceptedSymbols: 70,
      resolvedBlocks: 60,
      renderedFrames: 50,
      recoveredBytes: 60_000,
    },
    {
      startedAt: 1_000,
      completedAt: null,
      now: 3_000,
      lastSampleAt: 2_000,
      lastSampleBytes: 40_000,
      lastSampleCapturedFrames: 80,
    },
    100_000,
    50,
  );

  assert.equal(result.elapsedMs, 2_000);
  assert.equal(result.cameraMisses, 20);
  assert.equal(result.hitRate, 0.8);
  assert.ok(result.missRate !== null && Math.abs(result.missRate - 0.2) < Number.EPSILON);
  assert.equal(result.averageThroughputBytesPerSecond, 30_000);
  assert.equal(result.currentThroughputBytesPerSecond, 20_000);
  assert.equal(result.cameraFps, 40);
  assert.equal(result.achievedScreenFps, 25);
  assert.equal(result.recoveryOverhead, 0.4);
  assert.equal(result.estimatedRemainingMs, 2_000);
});

test("does not invent rates before observations exist", () => {
  const result = calculateTransferMetrics(
    EMPTY_TRANSFER_COUNTERS,
    {
      startedAt: null,
      completedAt: null,
      now: 500,
      lastSampleAt: null,
      lastSampleBytes: 0,
      lastSampleCapturedFrames: 0,
    },
    1_000,
    2,
  );

  assert.equal(result.hitRate, null);
  assert.equal(result.missRate, null);
  assert.equal(result.recoveryOverhead, null);
  assert.equal(result.estimatedRemainingMs, null);
});
