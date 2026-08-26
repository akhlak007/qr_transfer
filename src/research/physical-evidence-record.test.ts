import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createPhysicalEvidenceRecord,
  sealPhysicalEvidenceRecord,
  verifyPhysicalEvidenceRecordSeal,
  evaluateRunIndependence,
} from "./physical-evidence-record";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Evidence Record & Independence Engine Unit Tests (Milestone 7G)", () => {
  const sampleRun: TestRun = {
    schemaVersion: 1,
    runId: "run-record-01",
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
    notes: "Controlled passed test",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  };

  test("creates and seals physical evidence record with cryptographic SHA-256", async () => {
    const unsealed = createPhysicalEvidenceRecord(
      sampleRun,
      "session-01",
      "campaign-01",
      { deviceId: "cam-1", deviceLabel: "Sensor", width: 1280, height: 720, frameRate: 30, capturedFramesCount: 60, droppedFramesCount: 0, timestamp: 1700000000000 },
      { width: 1920, height: 1080 }
    );

    assert.equal(unsealed.isQualifying, true);
    assert.equal(unsealed.recordSealSha256, undefined);

    const sealed = await sealPhysicalEvidenceRecord(unsealed);
    assert.ok(sealed.recordSealSha256 !== undefined);
    assert.equal(sealed.recordSealSha256.length, 64);

    const isValid = await verifyPhysicalEvidenceRecordSeal(sealed);
    assert.equal(isValid, true);
  });

  test("evaluates run independence and detects duplicate evidence", async () => {
    const rec1 = await sealPhysicalEvidenceRecord(createPhysicalEvidenceRecord(
      { ...sampleRun, runId: "r1", createdAt: 1000 },
      "s1", "c1",
      { deviceId: "cam-1", deviceLabel: "Sensor", width: 1280, height: 720, frameRate: 30, capturedFramesCount: 60, droppedFramesCount: 0, timestamp: 1000 },
      { width: 1920, height: 1080 }
    ));

    const rec2 = await sealPhysicalEvidenceRecord(createPhysicalEvidenceRecord(
      { ...sampleRun, runId: "r2", createdAt: 2000 },
      "s2", "c1",
      { deviceId: "cam-1", deviceLabel: "Sensor", width: 1280, height: 720, frameRate: 30, capturedFramesCount: 60, droppedFramesCount: 0, timestamp: 2000 },
      { width: 1920, height: 1080 }
    ));

    const rec3 = await sealPhysicalEvidenceRecord(createPhysicalEvidenceRecord(
      { ...sampleRun, runId: "r3", createdAt: 3000 },
      "s3", "c1",
      { deviceId: "cam-1", deviceLabel: "Sensor", width: 1280, height: 720, frameRate: 30, capturedFramesCount: 60, droppedFramesCount: 0, timestamp: 3000 },
      { width: 1920, height: 1080 }
    ));

    const result = evaluateRunIndependence([rec1, rec2, rec3]);
    assert.equal(result.independentRunCount, 3);
    assert.equal(result.qualifyingRunCount, 3);
    assert.equal(result.duplicateRunCount, 0);
    assert.equal(result.isTargetVerified, true);

    // Duplicate test with rec1 added twice
    const dupResult = evaluateRunIndependence([rec1, rec2, rec1]);
    assert.equal(dupResult.duplicateRunCount, 1);
    assert.equal(dupResult.isTargetVerified, false);
  });
});
