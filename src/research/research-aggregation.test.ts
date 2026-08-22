import assert from "node:assert/strict";
import test from "node:test";
import { TransportId } from "../core/transport";
import { evidenceStatus } from "./evidence-status";
import { summarizeRuns } from "./research-aggregation";
import type { TestDevice, TestRun } from "./test-run";

const android: TestDevice = { platform: "android", deviceName: "Test Android", osVersion: "test", browserName: "Chrome", browserVersion: "test" };

function run(overrides: Partial<TestRun> = {}): TestRun {
  return {
    schemaVersion: 1,
    runId: "run-1",
    status: "complete",
    evidenceKind: "simulated",
    transport: TransportId.QR,
    sender: android,
    receiver: android,
    fileName: "fixture.bin",
    fileHashHex: "a".repeat(64),
    integrityStatus: "verified",
    metrics: { fileSize: 100, elapsedMs: 1000, averageThroughputBytesPerSecond: 100, frameHitRate: 0.8, errorRate: 0.2, recoveryOverhead: 0.1, cameraFps: null, screenFps: null, signalQuality: null },
    distanceCm: null,
    environment: "unspecified",
    notes: "",
    createdAt: 1,
    completedAt: 2,
    ...overrides,
  };
}

test("excludes drafts and keeps simulated results out of physical maximums", () => {
  const summary = summarizeRuns([run(), run({ runId: "draft", status: "draft", completedAt: null })], TransportId.QR, "simulated");
  assert.equal(summary.sampleCount, 1);
  assert.equal(summary.averageThroughputBytesPerSecond, 100);
  assert.equal(summary.maximumPhysicallyVerifiedFileSize, null);
  assert.equal(evidenceStatus([run()]), "simulated");
});

test("reports a maximum only for physically verified transfers", () => {
  const physical = run({ evidenceKind: "physical", metrics: { ...run().metrics, fileSize: 500 } });
  const mismatch = run({ runId: "failed", evidenceKind: "physical", integrityStatus: "mismatch", metrics: { ...run().metrics, fileSize: 900 } });
  const summary = summarizeRuns([physical, mismatch], TransportId.QR, "physical");
  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.maximumPhysicallyVerifiedFileSize, 500);
});
