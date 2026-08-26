import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../core/transport";
import { sha256Hex, sha256 } from "../core/integrity";
import {
  evaluatePhysicalValidationStatus,
  isQualifyingPhysicalValidatedRecord,
  generatePhysicalValidationMarkdown,
  generatePhysicalValidationJson,
  generatePhysicalValidationCsv,
  type PhysicalValidationRecord,
  type ProtocolConfiguration,
} from "./physical-validation-evidence";
import {
  PhysicalValidationSession,
} from "./physical-validation-session";
import {
  PhysicalCameraService,
  PhysicalCameraException,
} from "./physical-camera-capture";
import {
  encodeMetadataFrame,
  encodeSequentialFrame,
  type FileMetadata,
} from "../modules/protocol";
import { encodeVlcFrame } from "../transports/vlc/vlc-framing";
import { modulateVlcFrame } from "../transports/vlc/vlc-modulator";

/**
 * Helper to construct a synthetic 2D optical frame buffer.
 */
function createMockCameraFrame(
  width: number,
  height: number,
  centerLuminance: number,
  borderLuminance = 20
): { data: Uint8Array; width: number; height: number } {
  const data = new Uint8Array(width * height * 4);
  const roiW = Math.floor(width * 0.5);
  const roiH = Math.floor(height * 0.5);
  const startX = Math.floor((width - roiW) / 2);
  const startY = Math.floor((height - roiH) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isCenter = x >= startX && x < startX + roiW && y >= startY && y < startY + roiH;
      const val = isCenter ? centerLuminance : borderLuminance;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  return { data, width, height };
}

/**
 * Helper to build an authoritative PhysicalValidationRecord for unit testing.
 */
function createTestPhysicalRecord(
  index: number,
  target: ProtocolConfiguration,
  overrides: Partial<PhysicalValidationRecord> = {}
): PhysicalValidationRecord {
  const payloadBytes = new TextEncoder().encode(`Test physical payload data block ${index}`);
  const hash = "a".repeat(60) + index.toString().padStart(4, "0");

  return {
    schemaVersion: 1,
    recordId: `rec-test-${index}`,
    sessionId: `session-test-${index}`,
    runId: `run-test-${index}`,
    evidenceKind: "physical",
    verificationType: "PHYSICAL",
    status: "PHYSICAL_VALIDATED",
    transport: target.transport,
    modulation: target.vlcModulation || target.ofdmModulation || "OOK",
    gridSize: target.ofdmGridSize,
    transmitterScreen: "Liquid Retina XDR",
    transmitterDevice: "MacBook Pro",
    receiverCamera: "48MP Main f/1.78",
    receiverDevice: "iPhone 15 Pro",
    cameraProvenance: {
      deviceId: `camera-device-${index}`,
      deviceLabel: "48MP Main Camera",
      width: 1280,
      height: 720,
      frameRate: 30,
      capturedFramesCount: 150,
      droppedFramesCount: 0,
      timestamp: 1700000000000 + index * 100000,
    },
    displayProvenance: {
      width: 1920,
      height: 1080,
    },
    opticalDistanceCm: 25,
    ambientLux: 250,
    exposureMode: "locked",
    payloadSizeBytes: payloadBytes.length,
    durationMs: 2500 + index * 10,
    measuredFps: 30.0,
    validFramesCount: 20,
    corruptFramesCount: 0,
    droppedFramesCount: 0,
    symbolLockAcquired: true,
    crcStatus: "valid",
    reconstructionCompleted: true,
    expectedSha256: hash,
    recoveredSha256: hash,
    sha256Matched: true,
    sourceLabel: "PhysicalCameraService:AuthoritativeLiveOpticalCapture",
    operatorNotes: "Controlled test fixture run",
    timestampStart: 1700000000000 + index * 100000,
    timestampEnd: 1700000000000 + index * 100000 + 2500,
    recordSealSha256: "b".repeat(60) + index.toString().padStart(4, "0"),
    sealedAt: 1700000000000 + index * 100000 + 2500,
    ...overrides,
  };
}

describe("Phase 11: Physical Optical Validation Architecture", () => {
  const vlcOokConfig: ProtocolConfiguration = {
    transport: TransportId.VLC,
    vlcModulation: "ook",
  };

  test("Strict evidence separation: software/simulation records are rejected and cannot promote physical status", () => {
    const softwareRecord = {
      recordId: "sim-001",
      evidenceKind: "software",
      verificationType: "SOFTWARE",
      transport: TransportId.VLC,
      modulation: "ook",
      sha256Matched: true,
      expectedSha256: "0".repeat(64),
      recoveredSha256: "0".repeat(64),
      reconstructionCompleted: true,
    };

    const evaluation = evaluatePhysicalValidationStatus([softwareRecord], vlcOokConfig);
    assert.equal(evaluation.status, "EXPERIMENTAL", "Software records must never promote status to validated");
    assert.equal(evaluation.rejectedSoftwareCount, 1, "Must track rejected software record count");
    assert.equal(evaluation.validatingRunCount, 0, "No validating runs allowed from software evidence");
  });

  test("Mixed software/physical evidence is strictly rejected", () => {
    const mixedRecord = {
      recordId: "mixed-001",
      evidenceKind: "physical",
      verificationType: "SOFTWARE", // Contradictory classification
      transport: TransportId.VLC,
      modulation: "ook",
      sha256Matched: true,
      expectedSha256: "0".repeat(64),
      recoveredSha256: "0".repeat(64),
      reconstructionCompleted: true,
      payloadSizeBytes: 100,
      durationMs: 500,
    };

    assert.equal(isQualifyingPhysicalValidatedRecord(mixedRecord), false);
    const evaluation = evaluatePhysicalValidationStatus([mixedRecord], vlcOokConfig);
    assert.equal(evaluation.status, "EXPERIMENTAL");
    assert.equal(evaluation.validatingRunCount, 0);
  });

  test("One successful physical run promotes to PHYSICAL_VALIDATED", () => {
    const run1 = createTestPhysicalRecord(1, vlcOokConfig);
    const evaluation = evaluatePhysicalValidationStatus([run1], vlcOokConfig);

    assert.equal(evaluation.status, "PHYSICAL_VALIDATED");
    assert.equal(evaluation.validatingRunCount, 1);
    assert.equal(evaluation.independentRunCount, 1);
    assert.equal(evaluation.failedRunCount, 0);
  });

  test("Three independent matching physical runs promote to PHYSICAL_VERIFIED", () => {
    const run1 = createTestPhysicalRecord(1, vlcOokConfig);
    const run2 = createTestPhysicalRecord(2, vlcOokConfig);
    const run3 = createTestPhysicalRecord(3, vlcOokConfig);

    const evaluation = evaluatePhysicalValidationStatus([run1, run2, run3], vlcOokConfig);

    assert.equal(evaluation.status, "PHYSICAL_VERIFIED");
    assert.equal(evaluation.independentRunCount, 3);
    assert.equal(evaluation.duplicateRunCount, 0);
    assert.equal(evaluation.issues.length, 0);
  });

  test("Duplicate or replayed runs do not count toward 3-run threshold", () => {
    const run1 = createTestPhysicalRecord(1, vlcOokConfig);
    const duplicateRun = createTestPhysicalRecord(1, vlcOokConfig); // Same IDs and timestamps

    const evaluation = evaluatePhysicalValidationStatus([run1, duplicateRun], vlcOokConfig);

    assert.equal(evaluation.status, "PHYSICAL_VALIDATED");
    assert.equal(evaluation.independentRunCount, 1);
    assert.equal(evaluation.duplicateRunCount, 1);
    assert.ok(evaluation.issues.length > 0, "Must record duplicate issue warning");
  });

  test("Mismatched configuration runs do not contribute to target promotion count", () => {
    const vlcRun1 = createTestPhysicalRecord(1, vlcOokConfig);
    const vlcRun2 = createTestPhysicalRecord(2, vlcOokConfig);
    // 3rd run has OFDM transport instead of VLC
    const ofdmConfig: ProtocolConfiguration = {
      transport: TransportId.VisualOFDM,
      ofdmModulation: "bpsk",
      ofdmGridSize: 16,
    };
    const ofdmRun = createTestPhysicalRecord(3, ofdmConfig);

    const evaluation = evaluatePhysicalValidationStatus([vlcRun1, vlcRun2, ofdmRun], vlcOokConfig);

    assert.equal(evaluation.status, "PHYSICAL_VALIDATED", "Status should be VALIDATED (2 runs), not VERIFIED");
    assert.equal(evaluation.independentRunCount, 2);
  });

  test("Failed runs transition status to FAILED and record failure issues", () => {
    const failedRecord = createTestPhysicalRecord(1, vlcOokConfig, {
      sha256Matched: false,
      crcStatus: "invalid",
      status: "FAILED",
    });

    const evaluation = evaluatePhysicalValidationStatus([failedRecord], vlcOokConfig);

    assert.equal(evaluation.status, "FAILED");
    assert.equal(evaluation.failedRunCount, 1);
    assert.equal(evaluation.independentRunCount, 0);
  });

  test("Camera hardware errors (Permission Denied, Unavailable) trigger clean session failure", async () => {
    // Mock camera throwing Permission Denied
    const mockCamera = new PhysicalCameraService();
    mockCamera.start = async () => {
      throw new PhysicalCameraException("CAMERA_PERMISSION_DENIED", "Camera access permission was denied by user or policy");
    };
    mockCamera.stop = () => {};

    const session = new PhysicalValidationSession({
      target: vlcOokConfig,
      payload: new Uint8Array([1, 2, 3]),
      cameraService: mockCamera,
    });

    await assert.rejects(async () => {
      await session.start();
    }, /Camera access permission was denied/);

    const telemetry = session.getTelemetry();
    assert.equal(telemetry.state, "failed");
    assert.equal(telemetry.status, "FAILED");
    assert.ok(telemetry.error?.includes("CAMERA_PERMISSION_DENIED"));
  });

  test("Full mocked-camera end-to-end optical session validates bit-perfect payload and seals record", async () => {
    const originalText = "Phase 11 Authoritative Optical Validation 2026";
    const originalBytes = new TextEncoder().encode(originalText);
    const expectedSha256 = await sha256Hex(originalBytes);
    const fileHash = await sha256(originalBytes);

    const mockCamera = new PhysicalCameraService();
    mockCamera.start = async () => { return null as any; };
    mockCamera.stop = () => { /* Clean teardown */ };

    const session = new PhysicalValidationSession({
      target: vlcOokConfig,
      payload: originalBytes,
      expectedSha256,
      cameraService: mockCamera,
      transmitterDevice: "MacBook Pro M3",
      receiverDevice: "iPhone 15 Pro",
      opticalDistanceCm: 20,
      ambientLux: 220,
    });

    await session.start();
    assert.equal(session.getTelemetry().state, "capturing");

    // Synthesize optical frames for Metadata + Sequential blocks
    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: originalBytes.length,
      blockSize: 16,
      totalBlocks: Math.ceil(originalBytes.length / 16),
      fileHash,
      fileName: "phase11_test.txt",
    };

    let seqCounter = 0;
    const transmitPayload = async (payload: Uint8Array) => {
      const vlcFrame = encodeVlcFrame({
        version: 1,
        modulation: "ook",
        seqNumber: seqCounter++,
        payload,
      });
      const stream = modulateVlcFrame(vlcFrame, "ook");
      for (let i = 0; i < stream.totalSymbols; i++) {
        const frame = createMockCameraFrame(32, 24, stream.levels[i], 20);
        await session.ingestFrame(frame as any);
      }
    };

    // 1. Transmit Metadata
    await transmitPayload(encodeMetadataFrame(metadata));

    // 2. Transmit Sequential Blocks
    for (let b = 0; b < metadata.totalBlocks; b++) {
      const start = b * metadata.blockSize;
      const end = Math.min(start + metadata.blockSize, originalBytes.length);
      const chunk = originalBytes.subarray(start, end);
      await transmitPayload(encodeSequentialFrame(b, chunk));
    }

    const telemetry = session.getTelemetry();
    assert.equal(telemetry.state, "validated");
    assert.equal(telemetry.status, "PHYSICAL_VALIDATED");
    assert.equal(telemetry.sha256Matched, true);
    assert.equal(telemetry.crcStatus, "valid");
    assert.equal(telemetry.reconstructionCompleted, true);

    const record = session.getCompletedRecord();
    assert.ok(record, "Completed record must be frozen and sealed");
    assert.equal(record.verificationType, "PHYSICAL");
    assert.equal(record.evidenceKind, "physical");
    assert.ok(record.recordSealSha256 && record.recordSealSha256.length === 64);
  });

  test("Session cancellation cleans up resources and flags cancelled state", async () => {
    const mockCamera = new PhysicalCameraService();
    mockCamera.start = async () => { return null as any; };
    let stopped = false;
    mockCamera.stop = () => { stopped = true; };

    const session = new PhysicalValidationSession({
      target: vlcOokConfig,
      payload: new Uint8Array([1, 2, 3]),
      cameraService: mockCamera,
    });

    await session.start();
    session.cancel();

    const telemetry = session.getTelemetry();
    assert.equal(telemetry.state, "cancelled");
    assert.equal(telemetry.status, "FAILED");
    assert.equal(stopped, true, "Camera stream must be deterministically stopped on cancellation");
  });

  test("Markdown, JSON, and CSV reports serialize authoritative physical provenance correctly", () => {
    const run1 = createTestPhysicalRecord(1, vlcOokConfig);
    const evaluation = evaluatePhysicalValidationStatus([run1], vlcOokConfig);

    const markdown = generatePhysicalValidationMarkdown([run1], evaluation);
    assert.ok(markdown.includes("Authoritative Physical Optical Validation Report"));
    assert.ok(markdown.includes("PHYSICAL_VALIDATED"));
    assert.ok(markdown.includes(run1.runId));

    const json = generatePhysicalValidationJson([run1], evaluation);
    const parsed = JSON.parse(json);
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.evaluation.status, "PHYSICAL_VALIDATED");

    const csv = generatePhysicalValidationCsv([run1]);
    assert.ok(csv.includes("runId,sessionId,evidenceKind,verificationType"));
    assert.ok(csv.includes(run1.runId));
  });
});
