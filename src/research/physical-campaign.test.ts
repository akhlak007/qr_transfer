import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CampaignState,
  computeCampaignProgress,
} from "./physical-campaign";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Optical Experiment Campaign Unit Tests (Milestone 7F)", () => {
  const createMockPhysicalRun = (
    id: string,
    transport: TransportId,
    modKey: string,
    verified: boolean
  ): TestRun => ({
    schemaVersion: 1,
    runId: id,
    status: "complete",
    evidenceKind: "physical",
    transport,
    sender: { platform: "desktop", deviceName: "Mac", osVersion: "14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "17", browserName: "Safari", browserVersion: "17" },
    fileName: `physical_${transport}_${modKey}_51200B.bin`,
    fileHashHex: verified ? "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" : "0000000000000000000000000000000000000000000000000000000000000000",
    integrityStatus: verified ? "verified" : "mismatch",
    metrics: { fileSize: 51200, elapsedMs: 2000, averageThroughputBytesPerSecond: 25600, frameHitRate: 1.0, errorRate: verified ? 0.0 : 0.5, recoveryOverhead: null, cameraFps: 30.0, screenFps: 60.0, signalQuality: 0.95 },
    distanceCm: 20,
    environment: "normal",
    notes: verified ? "Passed bench run" : "Optical sync failure",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  });

  test("computes empty campaign progress accurately (0/39 runs, 0% progress)", () => {
    const snapshot = computeCampaignProgress("camp-1", CampaignState.IDLE, 0, 1, []);
    assert.equal(snapshot.totalRequiredRuns, 39);
    assert.equal(snapshot.totalCompletedQualifyingRuns, 0);
    assert.equal(snapshot.totalRecordedFailures, 0);
    assert.equal(snapshot.progressPercentage, 0);
    assert.equal(snapshot.isCompleted, false);
    assert.equal(snapshot.targets.length, 14);
  });

  test("updates target and campaign progress when qualifying runs are added", () => {
    const runs = [
      createMockPhysicalRun("r1", TransportId.VLC, "ook", true),
      createMockPhysicalRun("r2", TransportId.VLC, "ook", true),
      createMockPhysicalRun("r3", TransportId.VLC, "ook", true),
      createMockPhysicalRun("r4", TransportId.VLC, "pam4", false),
    ];

    const snapshot = computeCampaignProgress("camp-1", CampaignState.RUNNING, 1, 4, runs);
    assert.equal(snapshot.totalCompletedQualifyingRuns, 3);
    assert.equal(snapshot.totalRecordedFailures, 1);
    assert.ok(snapshot.progressPercentage > 0);

    const ookTarget = snapshot.targets.find((t) => t.targetId === "target_vlc_ook");
    assert.ok(ookTarget !== undefined);
    assert.equal(ookTarget.qualifyingRuns, 3);
    assert.equal(ookTarget.isComplete, true);
    assert.equal(ookTarget.status, "PHYSICALLY_VERIFIED");

    const pam4Target = snapshot.targets.find((t) => t.targetId === "target_vlc_pam4");
    assert.ok(pam4Target !== undefined);
    assert.equal(pam4Target.failedRuns, 1);
    assert.equal(pam4Target.status, "PHYSICAL_FAILURE_RECORDED");
    assert.equal(pam4Target.isComplete, false);
  });

  test("strictly ignores simulated runs from campaign totals", () => {
    const simRun: TestRun = {
      ...createMockPhysicalRun("sim-1", TransportId.VLC, "ook", true),
      evidenceKind: "simulated",
    };

    const snapshot = computeCampaignProgress("camp-1", CampaignState.RUNNING, 0, 1, [simRun]);
    assert.equal(snapshot.totalCompletedQualifyingRuns, 0);
    assert.equal(snapshot.progressPercentage, 0);
  });
});
