import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeTargetStatistics,
  computeGlobalCampaignStatistics,
} from "./campaign-statistics";
import { PHYSICAL_EXPERIMENT_TARGETS } from "./physical-acquisition";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import { ConfidenceLevel } from "./statistical-confidence";

describe("Physical Campaign Statistics Engine Unit Tests (Milestone 7F)", () => {
  const sampleRun: TestRun = {
    schemaVersion: 1,
    runId: "stat-run-1",
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.VLC,
    sender: { platform: "desktop", deviceName: "Mac", osVersion: "14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "17", browserName: "Safari", browserVersion: "17" },
    fileName: "physical_vlc_ook_51200B.bin",
    fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    integrityStatus: "verified",
    metrics: { fileSize: 51200, elapsedMs: 2000, averageThroughputBytesPerSecond: 25600, frameHitRate: 1.0, errorRate: 0.0, recoveryOverhead: null, cameraFps: 30.0, screenFps: 60.0, signalQuality: 0.95 },
    distanceCm: 25,
    environment: "normal",
    notes: "Controlled test run",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  };

  test("handles empty dataset safely with zero counts and null distance/FPS", () => {
    const globalStats = computeGlobalCampaignStatistics([]);
    assert.equal(globalStats.totalPhysicalRuns, 0);
    assert.equal(globalStats.qualifyingRuns, 0);
    assert.equal(globalStats.successRate, 0);
    assert.equal(globalStats.medianDistanceCm, null);
    assert.equal(globalStats.meanCameraFps, null);
    assert.equal(globalStats.perTargetStats.length, 14);
  });

  test("computes per-target statistics accurately for recorded runs", () => {
    const ookTarget = PHYSICAL_EXPERIMENT_TARGETS.find((t) => t.configId === "target_vlc_ook")!;
    const stats = computeTargetStatistics(ookTarget, [sampleRun]);

    assert.equal(stats.totalAttempts, 1);
    assert.equal(stats.qualifyingRuns, 1);
    assert.equal(stats.successRate, 1.0);
    assert.equal(stats.crcPassRate, 1.0);
    assert.equal(stats.sha256MatchRate, 1.0);
    assert.equal(stats.medianThroughputKbps, 204.8);
    assert.equal(stats.medianDistanceCm, 25);
    assert.equal(stats.meanCameraFps, 30.0);
    assert.equal(stats.confidenceLevel, ConfidenceLevel.LOW);
  });
});
