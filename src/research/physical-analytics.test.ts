import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzePhysicalEvidence,
  calculateStabilityScore,
} from "./physical-analytics";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Optical Performance Analytics Unit Tests (Milestone 7A)", () => {
  const createMockRun = (
    id: string,
    transport: TransportId,
    modKey: string,
    verified: boolean,
    throughputBps: number,
    distCm: number,
    fps = 30,
    hitRate = 1.0,
    env: "dark" | "normal" | "bright" = "normal"
  ): TestRun => ({
    schemaVersion: 1,
    runId: id,
    status: "complete",
    evidenceKind: "physical",
    transport,
    sender: {
      platform: "desktop",
      deviceName: "MacBook Pro M3",
      osVersion: "macOS 14.4",
      browserName: "Chrome",
      browserVersion: "124",
    },
    receiver: {
      platform: "iphone",
      deviceName: "iPhone 15 Pro",
      osVersion: "iOS 17.4",
      browserName: "Safari",
      browserVersion: "17",
    },
    fileName: `physical_${transport}_${modKey}_51200B.bin`,
    fileHashHex: verified ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" : "0000000000000000000000000000000000000000000000000000000000000000",
    integrityStatus: verified ? "verified" : "mismatch",
    metrics: {
      fileSize: 51200,
      elapsedMs: throughputBps > 0 ? (51200 * 8) / (throughputBps / 1000.0) : 1000,
      averageThroughputBytesPerSecond: throughputBps / 8,
      frameHitRate: hitRate,
      errorRate: verified ? 0.0 : 0.5,
      recoveryOverhead: null,
      cameraFps: fps,
      screenFps: 60.0,
      signalQuality: verified ? 0.95 : 0.2,
    },
    distanceCm: distCm,
    environment: env,
    notes: verified ? "Passed bench run" : "Sync timeout optical failure",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  });

  test("evaluates empty physical ledger gracefully with 0 totals and null max distance", () => {
    const report = analyzePhysicalEvidence([]);
    assert.equal(report.totalPhysicalRuns, 0);
    assert.equal(report.totalSuccessfulRuns, 0);
    assert.equal(report.overallSuccessRate, 0);
    assert.equal(report.maxVerifiedDistanceCm, null);
    assert.equal(report.failureBreakdown.totalFailures, 0);
  });

  test("calculates stability score correctly", () => {
    // 100% success, 100% CRC, 0 drops -> 100
    const perfectScore = calculateStabilityScore(5, 5, 5, 0);
    assert.equal(perfectScore, 100);

    // 0% success -> 0
    const zeroScore = calculateStabilityScore(5, 0, 0, 10);
    assert.equal(zeroScore, 0);
  });

  test("computes correct throughput, distance bins, and failure breakdown across mixed runs", () => {
    const runs: TestRun[] = [
      // 3 successful VLC OOK runs at 15cm (qualifying for verified)
      createMockRun("run-1", TransportId.VLC, "ook", true, 20000, 15, 30, 1.0, "normal"),
      createMockRun("run-2", TransportId.VLC, "ook", true, 24000, 15, 30, 1.0, "normal"),
      createMockRun("run-3", TransportId.VLC, "ook", true, 22000, 15, 30, 1.0, "normal"),

      // 1 failed VLC 4-PAM run at 30cm
      createMockRun("run-4", TransportId.VLC, "pam4", false, 0, 30, 30, 0.4, "dark"),

      // 1 simulated run (MUST BE EXCLUDED)
      {
        ...createMockRun("run-sim", TransportId.VLC, "ook", true, 100000, 10),
        evidenceKind: "simulated",
      },
    ];

    const report = analyzePhysicalEvidence(runs);

    assert.equal(report.totalPhysicalRuns, 4);
    assert.equal(report.totalSuccessfulRuns, 3);
    assert.equal(report.totalFailedRuns, 1);
    assert.equal(report.overallSuccessRate, 0.75);
    assert.equal(report.maxVerifiedDistanceCm, 15);

    // Check OOK status (3/3 -> PHYSICALLY_VERIFIED)
    const ookStats = report.modulations.find((m) => m.modulation === "OOK");
    assert.ok(ookStats !== undefined);
    assert.equal(ookStats.totalRuns, 3);
    assert.equal(ookStats.successfulRuns, 3);
    assert.equal(ookStats.verificationStatus, "PHYSICALLY_VERIFIED");

    // Check 4-PAM status (1 failed -> PHYSICAL_FAILURE_RECORDED)
    const pam4Stats = report.modulations.find((m) => m.modulation === "4-PAM");
    assert.ok(pam4Stats !== undefined);
    assert.equal(pam4Stats.failedRuns, 1);
    assert.equal(pam4Stats.verificationStatus, "PHYSICAL_FAILURE_RECORDED");

    // Check failure breakdown
    assert.equal(report.failureBreakdown.totalFailures, 1);
    assert.ok(report.failureBreakdown.syncFailures >= 1);
  });
});
