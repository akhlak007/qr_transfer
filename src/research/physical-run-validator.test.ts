import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validatePhysicalRun } from "./physical-run-validator";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Centralized Physical Run Validator Unit Tests (Milestone 7F)", () => {
  const createValidRun = (): TestRun => ({
    schemaVersion: 1,
    runId: "run-valid-01",
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.VLC,
    sender: { platform: "desktop", deviceName: "Mac", osVersion: "14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "17", browserName: "Safari", browserVersion: "17" },
    fileName: "vlc_ook_valid.bin",
    fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    integrityStatus: "verified",
    metrics: { fileSize: 51200, elapsedMs: 2000, averageThroughputBytesPerSecond: 25600, frameHitRate: 1.0, errorRate: 0.0, recoveryOverhead: null, cameraFps: 30.0, screenFps: 60.0, signalQuality: 0.95 },
    distanceCm: 20,
    environment: "normal",
    notes: "Controlled passed test",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  });

  test("accepts fully compliant physical test run with 100 evidence score", () => {
    const run = createValidRun();
    const result = validatePhysicalRun(run);

    assert.equal(result.valid, true);
    assert.equal(result.qualifying, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.evidenceScore, 100);
  });

  test("rejects simulated runs and fake/mismatched hashes", () => {
    const simRun: TestRun = {
      ...createValidRun(),
      evidenceKind: "simulated",
    };
    const simResult = validatePhysicalRun(simRun);
    assert.equal(simResult.valid, false);
    assert.equal(simResult.qualifying, false);
    assert.ok(simResult.errors.some((e) => e.includes("synthetic/simulated")));

    const mismatchRun: TestRun = {
      ...createValidRun(),
      integrityStatus: "mismatch",
    };
    const mismatchResult = validatePhysicalRun(mismatchRun);
    assert.equal(mismatchResult.qualifying, false);
  });

  test("rejects runs with CRC errors or non-positive distance/FPS/duration", () => {
    const badCrcRun: TestRun = {
      ...createValidRun(),
      metrics: { ...createValidRun().metrics, errorRate: 0.05 },
    };
    assert.equal(validatePhysicalRun(badCrcRun).qualifying, false);

    const zeroFpsRun: TestRun = {
      ...createValidRun(),
      metrics: { ...createValidRun().metrics, cameraFps: 0 },
    };
    assert.equal(validatePhysicalRun(zeroFpsRun).qualifying, false);

    const zeroDistRun: TestRun = {
      ...createValidRun(),
      distanceCm: 0,
    };
    assert.equal(validatePhysicalRun(zeroDistRun).qualifying, false);
  });
});
