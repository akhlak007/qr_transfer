import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generateTransportBenchmarkProfile,
  comparePhysicalTransportBenchmarks,
} from "./benchmark-comparison";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import { ConfidenceLevel } from "./statistical-confidence";

describe("Comparative Optical Benchmark Engine Unit Tests (Milestone 7B)", () => {
  const createMockPhysicalRun = (
    id: string,
    transport: TransportId,
    verified: boolean,
    throughputBps: number,
    distCm: number
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
    fileName: `physical_${transport}_payload.bin`,
    fileHashHex: verified ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" : "0000000000000000000000000000000000000000000000000000000000000000",
    integrityStatus: verified ? "verified" : "mismatch",
    metrics: {
      fileSize: 51200,
      elapsedMs: 2000,
      averageThroughputBytesPerSecond: throughputBps / 8,
      frameHitRate: 1.0,
      errorRate: verified ? 0.0 : 0.5,
      recoveryOverhead: null,
      cameraFps: 30.0,
      screenFps: 60.0,
      signalQuality: verified ? 0.95 : 0.2,
    },
    distanceCm: distCm,
    environment: "normal",
    notes: "Controlled benchmark test",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  });

  test("generates empty profile for unperformed transport", () => {
    const profile = generateTransportBenchmarkProfile([], TransportId.VLC);
    assert.equal(profile.totalPhysicalRuns, 0);
    assert.equal(profile.successfulRuns, 0);
    assert.equal(profile.confidenceLevel, ConfidenceLevel.LOW);
    assert.equal(profile.verificationStatus, "EXPERIMENTAL_NOT_TESTED");
  });

  test("computes comparative profiles and ranks transports deterministically", () => {
    const runs: TestRun[] = [
      // 10 qualifying QR runs (High confidence, verified, 200 kbps, 50cm)
      ...Array.from({ length: 10 }, (_, i) =>
        createMockPhysicalRun(`qr-${i}`, TransportId.QR, true, 200000, 50)
      ),

      // 3 qualifying VLC runs (Moderate confidence, verified, 50 kbps, 25cm)
      ...Array.from({ length: 3 }, (_, i) =>
        createMockPhysicalRun(`vlc-${i}`, TransportId.VLC, true, 50000, 25)
      ),

      // 1 failed OFDM run (Low confidence, 0 kbps)
      createMockPhysicalRun("ofdm-0", TransportId.VisualOFDM, false, 0, 10),

      // 1 simulated run (MUST BE EXCLUDED)
      {
        ...createMockPhysicalRun("sim-1", TransportId.VisualOFDM, true, 999999, 100),
        evidenceKind: "simulated",
      },
    ];

    const report = comparePhysicalTransportBenchmarks(runs);

    assert.equal(report.evaluatedPhysicalRunsCount, 14);

    // Check QR profile
    const qr = report.profiles[TransportId.QR];
    assert.equal(qr.totalPhysicalRuns, 10);
    assert.equal(qr.confidenceLevel, ConfidenceLevel.HIGH);
    assert.equal(qr.verificationStatus, "PHYSICALLY_VERIFIED");
    assert.equal(qr.maxDistanceCm, 50);

    // Check VLC profile
    const vlc = report.profiles[TransportId.VLC];
    assert.equal(vlc.totalPhysicalRuns, 3);
    assert.equal(vlc.confidenceLevel, ConfidenceLevel.MODERATE);
    assert.equal(vlc.verificationStatus, "PHYSICALLY_VERIFIED");

    // Check OFDM profile
    const ofdm = report.profiles[TransportId.VisualOFDM];
    assert.equal(ofdm.totalPhysicalRuns, 1);
    assert.equal(ofdm.confidenceLevel, ConfidenceLevel.LOW);
    assert.equal(ofdm.verificationStatus, "PHYSICAL_FAILURE_RECORDED");

    // Check rankings
    assert.equal(report.rankings.highestThroughput[0], TransportId.QR);
    assert.equal(report.rankings.bestReliability[0], TransportId.QR);
    assert.equal(report.rankings.bestDistance[0], TransportId.QR);
  });
});
