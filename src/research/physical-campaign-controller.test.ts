import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PhysicalCampaignController } from "./physical-campaign-controller";
import { CampaignState } from "./physical-campaign";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Campaign Controller Unit Tests (Milestone 7F)", () => {
  const createMockPhysicalRun = (id: string, transport: TransportId, modKey: string, verified: boolean): TestRun => ({
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
    notes: verified ? "Passed bench run" : "Sync failure",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  });

  test("initializes in IDLE state with 0 runs and transitions through lifecycle", async () => {
    const controller = new PhysicalCampaignController({ persistence: null });
    const initialSnapshot = await controller.initialize();

    assert.equal(initialSnapshot.state, CampaignState.IDLE);
    assert.equal(initialSnapshot.totalCompletedQualifyingRuns, 0);

    const prep = controller.startCampaign();
    assert.equal(prep.state, CampaignState.PREPARING);

    controller.selectTarget(1);
    assert.equal(controller.getCampaignProgress().currentTarget?.configId, "target_vlc_ook");

    controller.markDeviceReady();
    assert.equal(controller.getCampaignProgress().state, CampaignState.READY);

    controller.pauseCampaign();
    assert.equal(controller.getCampaignProgress().state, CampaignState.PAUSED);

    controller.resumeCampaign();
    assert.equal(controller.getCampaignProgress().state, CampaignState.READY);

    controller.cancelCampaign();
    assert.equal(controller.getCampaignProgress().state, CampaignState.CANCELLED);
  });

  test("finalizes and validates a physical run accurately", async () => {
    const controller = new PhysicalCampaignController({ persistence: null });
    controller.startCampaign();
    controller.selectTarget(1); // target_vlc_ook

    const validRun = createMockPhysicalRun("run-1", TransportId.VLC, "ook", true);
    const { snapshot, validation } = await controller.finalizeRun(validRun);

    assert.equal(validation.valid, true);
    assert.equal(validation.qualifying, true);
    assert.equal(snapshot.totalCompletedQualifyingRuns, 1);
  });
});
