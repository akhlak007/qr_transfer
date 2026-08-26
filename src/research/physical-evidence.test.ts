import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  aggregatePhysicalEvidence,
  summarizePhysicalRunsFromLedger,
} from "./physical-evidence";
import { TransportId } from "../core/transport";
import type { PhysicalTestRun } from "./physical-test-run";
import type { TestRun } from "./test-run";

describe("Physical Optical Evidence Aggregation & Policy (Milestone 5C)", () => {
  const createSampleRun = (id: string, outcome: "success" | "sha256_mismatch", distanceCm = 25): PhysicalTestRun => ({
    schemaVersion: 1,
    runId: id,
    timestamp: Date.now(),
    evidenceKind: "physical",
    transport: TransportId.VLC,
    modulation: "ook",
    transmitterDevice: "MacBook Pro",
    transmitterDisplay: "Liquid Retina XDR",
    displayResolution: "3024x1964",
    displayRefreshRate: 120,
    receiverDevice: "iPhone 15 Pro",
    receiverCamera: "Front TrueDepth",
    cameraResolution: "1080p",
    operatingSystem: "iOS 17.4",
    browser: "Safari",
    distanceCm,
    ambientLightLux: 200,
    exposureMode: "locked",
    gain: 1.0,
    frameRate: 60,
    payloadSizeBytes: 1024,
    blockSize: 64,
    symbolRate: 30,
    durationMs: 2000,
    reconstructedBytes: outcome === "success" ? 1024 : 512,
    sha256Original: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sha256Recovered: outcome === "success"
      ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      : "1111111111111111111111111111111111111111111111111111111111111111",
    sha256Matched: outcome === "success",
    crcPassed: outcome === "success",
    droppedFrames: 0,
    synchronizationStatus: outcome === "success" ? "locked" : "failed",
    outcome,
    notes: "VLC test run",
  });

  test("evaluates zero runs as EXPERIMENTAL_NOT_TESTED", () => {
    const summary = aggregatePhysicalEvidence([], TransportId.VLC, "ook");
    assert.equal(summary.totalPhysicalRuns, 0);
    assert.equal(summary.verificationStatus, "EXPERIMENTAL_NOT_TESTED");
    assert.equal(summary.policyDetails.satisfied, false);
  });

  test("evaluates < 3 runs as INSUFFICIENT_PHYSICAL_EVIDENCE", () => {
    const runs = [createSampleRun("run-1", "success"), createSampleRun("run-2", "success")];
    const summary = aggregatePhysicalEvidence(runs, TransportId.VLC, "ook");

    assert.equal(summary.totalPhysicalRuns, 2);
    assert.equal(summary.sha256VerifiedMatches, 2);
    assert.equal(summary.verificationStatus, "INSUFFICIENT_PHYSICAL_EVIDENCE");
    assert.equal(summary.policyDetails.satisfied, false);
  });

  test("evaluates >= 3 successful runs as PHYSICALLY_VERIFIED", () => {
    const runs = [
      createSampleRun("run-1", "success", 10),
      createSampleRun("run-2", "success", 25),
      createSampleRun("run-3", "success", 50),
    ];
    const summary = aggregatePhysicalEvidence(runs, TransportId.VLC, "ook");

    assert.equal(summary.totalPhysicalRuns, 3);
    assert.equal(summary.sha256VerifiedMatches, 3);
    assert.equal(summary.verificationStatus, "PHYSICALLY_VERIFIED");
    assert.equal(summary.policyDetails.satisfied, true);
    assert.equal(summary.maximumVerifiedDistanceCm, 50);
  });

  test("evaluates any failed physical run as PHYSICAL_FAILURE_RECORDED", () => {
    const runs = [
      createSampleRun("run-1", "success"),
      createSampleRun("run-2", "success"),
      createSampleRun("run-3", "sha256_mismatch"),
    ];
    const summary = aggregatePhysicalEvidence(runs, TransportId.VLC, "ook");

    assert.equal(summary.totalPhysicalRuns, 3);
    assert.equal(summary.successfulRuns, 2);
    assert.equal(summary.failedRuns, 1);
    assert.equal(summary.verificationStatus, "PHYSICAL_FAILURE_RECORDED");
    assert.equal(summary.policyDetails.satisfied, false);
  });

  test("strictly separates physical evidence from simulated evidence in generic ledger", () => {
    const legacyLedger: TestRun[] = [
      {
        schemaVersion: 1,
        runId: "sim-1",
        status: "complete",
        evidenceKind: "simulated",
        transport: TransportId.VLC,
        sender: { platform: "desktop", deviceName: "SimHost", osVersion: "1.0", browserName: "Node", browserVersion: "1.0" },
        receiver: { platform: "desktop", deviceName: "SimHost", osVersion: "1.0", browserName: "Node", browserVersion: "1.0" },
        fileName: "sim.bin",
        fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        integrityStatus: "verified",
        metrics: {
          fileSize: 1000,
          elapsedMs: 100,
          averageThroughputBytesPerSecond: 10000,
          frameHitRate: 1.0,
          errorRate: 0,
          recoveryOverhead: null,
          cameraFps: null,
          screenFps: null,
          signalQuality: 1.0,
        },
        distanceCm: null,
        environment: "unspecified",
        notes: "Synthetic channel",
        createdAt: Date.now(),
        completedAt: Date.now(),
      },
    ];

    const summary = summarizePhysicalRunsFromLedger(legacyLedger, TransportId.VLC);
    // Simulated run must not enter physical summary
    assert.equal(summary.totalPhysicalRuns, 0);
    assert.equal(summary.verificationStatus, "EXPERIMENTAL_NOT_TESTED");
  });
});
