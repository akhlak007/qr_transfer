import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateProtocolSoftwareVerification,
  evaluateSoftwareVerificationMatrix,
  SoftwareVerificationStatus,
} from "./software-verification";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Software-Only Optical Verification Policy Unit Tests (Milestone 8A)", () => {
  const createMockSyntheticRun = (
    id: string,
    transport: TransportId,
    modKey: string,
    verified: boolean
  ): TestRun => ({
    schemaVersion: 1,
    runId: id,
    status: "complete",
    evidenceKind: "simulated",
    transport,
    sender: { platform: "desktop", deviceName: "MacBook Pro", osVersion: "macOS 14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "desktop", deviceName: "MacBook Pro", osVersion: "macOS 14", browserName: "Chrome", browserVersion: "124" },
    fileName: `simulated_${transport}_${modKey}_51200B.bin`,
    fileHashHex: verified ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" : "0000000000000000000000000000000000000000000000000000000000000000",
    integrityStatus: verified ? "verified" : "mismatch",
    metrics: { fileSize: 51200, elapsedMs: 1000, averageThroughputBytesPerSecond: 51200, frameHitRate: 1.0, errorRate: verified ? 0.0 : 0.5, recoveryOverhead: null, cameraFps: null, screenFps: 60.0, signalQuality: 1.0 },
    distanceCm: null,
    environment: "normal",
    notes: verified ? "Synthetic benchmark passed" : "Simulated noise corruption",
    createdAt: 1700000000000,
    completedAt: 1700000001000,
  });

  test("evaluates protocol with 0 runs as EXPERIMENTAL", () => {
    const result = evaluateProtocolSoftwareVerification(TransportId.VLC, "OOK", undefined, []);
    assert.equal(result.status, SoftwareVerificationStatus.EXPERIMENTAL);
    assert.equal(result.isSoftwareVerified, false);
    assert.equal(result.totalBenchmarkRuns, 0);
  });

  test("unit evidence promotes only to SOFTWARE_UNIT_VERIFIED", () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      createMockSyntheticRun(`sim-ook-${i}`, TransportId.VLC, "ook", true)
    );

    const result = evaluateProtocolSoftwareVerification(TransportId.VLC, "OOK", undefined, runs);
    assert.equal(result.status, SoftwareVerificationStatus.SOFTWARE_UNIT_VERIFIED);
    assert.equal(result.isSoftwareVerified, true);
    assert.equal(result.crcPassRate, 1.0);
    assert.equal(result.sha256MatchRate, 1.0);
  });

  test("promotes only a complete recorded integration run to SOFTWARE_END_TO_END_VERIFIED", () => {
    const integration = {
      runId: "verification-test",
      timestamp: "2026-08-26T00:00:00.000Z",
      completedAt: "2026-08-26T00:00:00.010Z",
      durationMs: 10,
      protocolConfiguration: Object.freeze({ transport: TransportId.VLC, modulation: "ook", gridSize: null, transferMode: "sequential" as const }),
      softwareChannelSeed: 1,
      verificationSource: "PHASE_8E_SOFTWARE_HARNESS" as const,
      verificationType: "SOFTWARE" as const,
      channelLabel: "SOFTWARE OPTICAL CHANNEL / SIMULATION" as const,
      protocol: TransportId.VLC,
      configuration: "OOK",
      transferMode: "sequential" as const,
      txSuccess: true,
      channelSuccess: true,
      rxSuccess: true,
      crcStatus: "valid" as const,
      reconstructionSuccess: true,
      sha256Success: true,
      expectedSha256: "a".repeat(64),
      actualSha256: "a".repeat(64),
      recoveredFrames: 2,
      fountainSymbolsAccepted: 0,
      multiUnitFrames: 2,
      channelDiagnostics: {
        channelLabel: "SOFTWARE OPTICAL CHANNEL / SIMULATION" as const,
        unitsProcessed: 2,
        unitsDelivered: 2,
        unitsDropped: 0,
        unitsCorrupted: 0,
      },
      status: "SOFTWARE_END_TO_END_VERIFIED" as const,
      failureReason: null,
    };
    const result = evaluateProtocolSoftwareVerification(
      TransportId.VLC, "OOK", undefined, [], 100, [integration],
    );
    assert.equal(result.status, SoftwareVerificationStatus.SOFTWARE_END_TO_END_VERIFIED);

    const vlcWithoutCrc = { ...integration, crcStatus: "not-applicable" as const };
    assert.equal(evaluateProtocolSoftwareVerification(
      TransportId.VLC, "OOK", undefined, [], 100, [vlcWithoutCrc],
    ).status, SoftwareVerificationStatus.FAILED);

    const qrWithInventedCrc = {
      ...integration,
      protocol: TransportId.QR,
      configuration: "QR Matrix",
      crcStatus: "valid" as const,
    };
    assert.equal(evaluateProtocolSoftwareVerification(
      TransportId.QR, "QR", undefined, [], 100, [qrWithInventedCrc],
    ).status, SoftwareVerificationStatus.FAILED);
  });

  test("evaluates full 14-configuration software verification matrix", () => {
    const matrix = evaluateSoftwareVerificationMatrix([]);
    assert.equal(matrix.totalProtocolsEvaluated, 14);
    assert.equal(matrix.verifiedProtocolsCount, 0);
    assert.equal(matrix.experimentalProtocolsCount, 14);
  });
});
