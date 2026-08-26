import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createPhysicalAcquisitionSession,
  finalizePhysicalAcquisitionSession,
  EvidenceSource,
} from "./physical-acquisition-session";
import { PHYSICAL_EXPERIMENT_TARGETS } from "./physical-acquisition";

describe("Physical Acquisition Session Engine Unit Tests (Milestone 7G)", () => {
  const sampleTarget = PHYSICAL_EXPERIMENT_TARGETS[1]; // target_vlc_ook

  test("initializes physical acquisition session with PENDING state", () => {
    const session = createPhysicalAcquisitionSession({
      campaignId: "camp-001",
      target: sampleTarget,
      operatorConfirmation: true,
      opticalDistanceCm: 25,
      ambientLux: 220,
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      payloadSizeBytes: 51200,
      cameraProvenance: {
        deviceId: "cam-01",
        deviceLabel: "Logitech Brio 4K",
        width: 1280,
        height: 720,
        frameRate: 30,
        capturedFramesCount: 60,
        droppedFramesCount: 0,
        timestamp: 1700000000000,
      },
      displayProvenance: {
        width: 1920,
        height: 1080,
      },
    });

    assert.equal(session.evidenceKind, "physical");
    assert.equal(session.evidenceSource, EvidenceSource.PHYSICAL_CAMERA);
    assert.equal(session.synchronizationResult, "PENDING");
    assert.equal(session.isComplete, false);
  });

  test("finalizes session and produces verified TestRun on matching SHA-256 and CRC pass", () => {
    const session = createPhysicalAcquisitionSession({
      campaignId: "camp-001",
      target: sampleTarget,
      operatorConfirmation: true,
      opticalDistanceCm: 25,
      ambientLux: 220,
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      payloadSizeBytes: 51200,
      cameraProvenance: {
        deviceId: "cam-01",
        deviceLabel: "Logitech Brio 4K",
        width: 1280,
        height: 720,
        frameRate: 30,
        capturedFramesCount: 60,
        droppedFramesCount: 0,
        timestamp: 1700000000000,
      },
      displayProvenance: {
        width: 1920,
        height: 1080,
      },
    });

    const { session: finalized, testRun } = finalizePhysicalAcquisitionSession(session, {
      actualSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      crcPassed: true,
      errorRate: 0.0,
      measuredFps: 30.0,
      droppedFrames: 0,
      synchronizationSuccess: true,
      decodedPayloadValid: true,
    });

    assert.equal(finalized.isComplete, true);
    assert.equal(finalized.synchronizationResult, "SUCCESS");
    assert.equal(finalized.decodedPayloadStatus, "VALID");
    assert.equal(testRun.integrityStatus, "verified");
    assert.equal(testRun.status, "complete");
  });
});
