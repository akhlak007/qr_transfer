import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  determineTrendDirection,
  calculateRollingAverage,
  analyzeLongitudinalTrends,
  TrendDirection,
} from "./longitudinal-analytics";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Longitudinal Analytics Engine Unit Tests (Milestone 7D)", () => {
  test("classifies trend directions accurately", () => {
    assert.equal(determineTrendDirection([10, 20]), TrendDirection.INSUFFICIENT_DATA);

    // Improving: early [10, 10], recent [20, 25] -> >5% gain
    assert.equal(determineTrendDirection([10, 10, 20, 25]), TrendDirection.IMPROVING);

    // Degrading: early [50, 50], recent [20, 15] -> >5% loss
    assert.equal(determineTrendDirection([50, 50, 20, 15]), TrendDirection.DEGRADING);

    // Stable: early [100, 100], recent [101, 99] -> within 5%
    assert.equal(determineTrendDirection([100, 100, 101, 99]), TrendDirection.STABLE);
  });

  test("calculates rolling moving average correctly", () => {
    const raw = [10, 20, 30, 40, 50];
    const rolling = calculateRollingAverage(raw, 3);
    assert.equal(rolling[0], 10);
    assert.equal(rolling[1], 15); // (10+20)/2
    assert.equal(rolling[2], 20); // (10+20+30)/3
    assert.equal(rolling[3], 30); // (20+30+40)/3
    assert.equal(rolling[4], 40); // (30+40+50)/3
  });

  test("analyzes longitudinal physical dataset with time aggregation and trend calculation", () => {
    const runs: TestRun[] = [
      {
        schemaVersion: 1,
        runId: "run-day-1",
        status: "complete",
        evidenceKind: "physical",
        transport: TransportId.VLC,
        sender: { platform: "desktop", deviceName: "Mac", osVersion: "", browserName: "", browserVersion: "" },
        receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "", browserName: "", browserVersion: "" },
        fileName: "vlc_ook_1.bin",
        fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        integrityStatus: "verified",
        metrics: { fileSize: 1000, elapsedMs: 1000, averageThroughputBytesPerSecond: 1000, frameHitRate: 1, errorRate: 0, recoveryOverhead: null, cameraFps: 30, screenFps: 60, signalQuality: 1 },
        distanceCm: 15,
        environment: "normal",
        notes: "day 1",
        createdAt: 1700000000000,
        completedAt: 1700000001000,
      },
      {
        schemaVersion: 1,
        runId: "run-day-2",
        status: "complete",
        evidenceKind: "physical",
        transport: TransportId.VLC,
        sender: { platform: "desktop", deviceName: "Mac", osVersion: "", browserName: "", browserVersion: "" },
        receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "", browserName: "", browserVersion: "" },
        fileName: "vlc_ook_2.bin",
        fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        integrityStatus: "verified",
        metrics: { fileSize: 1000, elapsedMs: 500, averageThroughputBytesPerSecond: 2000, frameHitRate: 1, errorRate: 0, recoveryOverhead: null, cameraFps: 30, screenFps: 60, signalQuality: 1 },
        distanceCm: 15,
        environment: "normal",
        notes: "day 2",
        createdAt: 1700100000000,
        completedAt: 1700100001000,
      },
      {
        schemaVersion: 1,
        runId: "run-day-3",
        status: "complete",
        evidenceKind: "physical",
        transport: TransportId.VLC,
        sender: { platform: "desktop", deviceName: "Mac", osVersion: "", browserName: "", browserVersion: "" },
        receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "", browserName: "", browserVersion: "" },
        fileName: "vlc_ook_3.bin",
        fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        integrityStatus: "verified",
        metrics: { fileSize: 1000, elapsedMs: 333, averageThroughputBytesPerSecond: 3000, frameHitRate: 1, errorRate: 0, recoveryOverhead: null, cameraFps: 30, screenFps: 60, signalQuality: 1 },
        distanceCm: 15,
        environment: "normal",
        notes: "day 3",
        createdAt: 1700200000000,
        completedAt: 1700200001000,
      },
    ];

    const result = analyzeLongitudinalTrends(runs, { transport: TransportId.VLC });
    assert.equal(result.totalRuns, 3);
    assert.equal(result.timePoints.length, 3);
    assert.equal(result.overallSuccessRate, 1.0);
    assert.equal(result.throughputTrend, TrendDirection.IMPROVING);
    assert.equal(result.rollingThroughputsKbps.length, 3);
  });
});
