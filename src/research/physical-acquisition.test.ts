import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PHYSICAL_EXPERIMENT_TARGETS,
  isQualifyingPhysicalRun,
  evaluateAcquisitionProgress,
  traceEvidenceChain,
} from "./physical-acquisition";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Controlled Physical Evidence Acquisition Unit Tests (Milestone 7E)", () => {
  const createMockPhysicalRun = (
    id: string,
    transport: TransportId,
    modKey: string,
    verified: boolean,
    throughputBps: number
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
      elapsedMs: 2000,
      averageThroughputBytesPerSecond: throughputBps / 8,
      frameHitRate: 1.0,
      errorRate: verified ? 0.0 : 0.5,
      recoveryOverhead: null,
      cameraFps: 30.0,
      screenFps: 60.0,
      signalQuality: verified ? 0.95 : 0.2,
    },
    distanceCm: 20,
    environment: "normal",
    notes: verified ? "Passed bench run" : "Sync timeout failure",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  });

  test("defines exactly 14 targets (1 QR baseline + 4 VLC + 9 OFDM)", () => {
    assert.equal(PHYSICAL_EXPERIMENT_TARGETS.length, 14);
    const vlcTargets = PHYSICAL_EXPERIMENT_TARGETS.filter((t) => t.transport === TransportId.VLC);
    assert.equal(vlcTargets.length, 4);

    const ofdmTargets = PHYSICAL_EXPERIMENT_TARGETS.filter((t) => t.transport === TransportId.VisualOFDM);
    assert.equal(ofdmTargets.length, 9);
  });

  test("evaluates qualifying physical run criteria strictly", () => {
    const validRun = createMockPhysicalRun("run-1", TransportId.VLC, "ook", true, 20000);
    assert.equal(isQualifyingPhysicalRun(validRun), true);

    const failedRun = createMockPhysicalRun("run-2", TransportId.VLC, "ook", false, 0);
    assert.equal(isQualifyingPhysicalRun(failedRun), false);

    const simRun: TestRun = { ...validRun, evidenceKind: "simulated" };
    assert.equal(isQualifyingPhysicalRun(simRun), false);
  });

  test("evaluates acquisition progress across empty and populated ledgers", () => {
    // Empty ledger
    const emptyProgress = evaluateAcquisitionProgress([]);
    assert.equal(emptyProgress.totalCompletedQualifyingRuns, 0);
    assert.equal(emptyProgress.overallAcquisitionProgressPct, 0);
    assert.equal(emptyProgress.untestedConfigsCount, 14);
    assert.equal(emptyProgress.recommendedNextTarget?.configId, "target_qr");

    // 3 verified OOK runs + 1 failed 4-PAM run
    const runs: TestRun[] = [
      createMockPhysicalRun("r-1", TransportId.VLC, "ook", true, 20000),
      createMockPhysicalRun("r-2", TransportId.VLC, "ook", true, 22000),
      createMockPhysicalRun("r-3", TransportId.VLC, "ook", true, 24000),
      createMockPhysicalRun("r-4", TransportId.VLC, "pam4", false, 0),
    ];

    const progress = evaluateAcquisitionProgress(runs);
    assert.equal(progress.totalCompletedQualifyingRuns, 3);
    assert.equal(progress.totalRecordedFailures, 1);

    const ookConfig = progress.configs.find((c) => c.target.configId === "target_vlc_ook");
    assert.ok(ookConfig !== undefined);
    assert.equal(ookConfig.qualifyingRuns, 3);
    assert.equal(ookConfig.status, "PHYSICALLY_VERIFIED");
    assert.equal(ookConfig.isComplete, true);

    const pam4Config = progress.configs.find((c) => c.target.configId === "target_vlc_pam4");
    assert.ok(pam4Config !== undefined);
    assert.equal(pam4Config.failedRuns, 1);
    assert.equal(pam4Config.status, "PHYSICAL_FAILURE_RECORDED");
    assert.equal(pam4Config.isComplete, false);
  });

  test("traces end-to-end evidence chain for a physical test run", async () => {
    const validRun = createMockPhysicalRun("run-trace-1", TransportId.VLC, "ook", true, 20000);
    const trace = await traceEvidenceChain(validRun, [validRun]);

    assert.equal(trace.runId, "run-trace-1");
    assert.equal(trace.isQualifying, true);
    assert.ok(trace.manifest.manifestHash !== undefined);
    assert.ok(trace.datasetBundleId !== undefined);
    assert.ok(trace.archiveId !== undefined);
    assert.equal(trace.tamperVerified, true);
  });
});
