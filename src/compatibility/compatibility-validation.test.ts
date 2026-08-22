import assert from "node:assert/strict";
import test from "node:test";
import { TransportId } from "../core/transport";
import type { TestDevice, TestRun } from "../research/test-run";
import { compatibilityStatus } from "./compatibility-validation";

const android: TestDevice = { platform: "android", deviceName: "Android", osVersion: "x", browserName: "Chrome", browserVersion: "x" };
const iphone: TestDevice = { platform: "iphone", deviceName: "iPhone", osVersion: "x", browserName: "Safari", browserVersion: "x" };

function physicalRun(sender: TestDevice, receiver: TestDevice, integrityStatus: "verified" | "mismatch" = "verified"): TestRun {
  return {
    schemaVersion: 1, runId: `${sender.platform}-${receiver.platform}`, status: "complete", evidenceKind: "physical", transport: TransportId.QR,
    sender, receiver, fileName: "test.bin", fileHashHex: "a".repeat(64), integrityStatus,
    metrics: { fileSize: 1, elapsedMs: 1, averageThroughputBytesPerSecond: 1, frameHitRate: 1, errorRate: 0, recoveryOverhead: 0, cameraFps: 1, screenFps: 1, signalQuality: null },
    distanceCm: 10, environment: "normal", notes: "", createdAt: 1, completedAt: 2,
  };
}

test("does not infer reverse mobile direction", () => {
  const runs = [physicalRun(android, iphone)];
  assert.equal(compatibilityStatus(runs, "android-to-iphone", TransportId.QR), "verified");
  assert.equal(compatibilityStatus(runs, "iphone-to-android", TransportId.QR), "not-tested");
});

test("retains measured physical failures without calling them verified", () => {
  assert.equal(compatibilityStatus([physicalRun(iphone, iphone, "mismatch")], "iphone-to-iphone", TransportId.QR), "failed");
});
