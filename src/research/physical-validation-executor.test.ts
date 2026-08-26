import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../core/transport";
import { sha256Hex, sha256 } from "../core/integrity";
import {
  evaluatePreflightChecklist,
  SUPPORTED_PHYSICAL_MATRIX_TARGETS,
} from "./physical-validation-preflight";
import {
  PhysicalValidationExecutor,
} from "./physical-validation-executor";
import {
  PhysicalCameraService,
} from "./physical-camera-capture";

import type {
  PhysicalValidationRecord,
  ProtocolConfiguration,
} from "./physical-validation-evidence";
import {
  encodeMetadataFrame,
  encodeSequentialFrame,
  type FileMetadata,
} from "../modules/protocol";
import { encodeVlcFrame } from "../transports/vlc/vlc-framing";
import { modulateVlcFrame } from "../transports/vlc/vlc-modulator";

function createMockOpticalFrame(
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

function createMockPhysicalRecord(
  index: number,
  target: ProtocolConfiguration,
  overrides: Partial<PhysicalValidationRecord> = {}
): PhysicalValidationRecord {
  const payloadBytes = new TextEncoder().encode(`Physical Matrix Run Payload ${index}`);
  const hash = "c".repeat(60) + index.toString().padStart(4, "0");

  return {
    schemaVersion: 1,
    recordId: `rec-matrix-${index}`,
    sessionId: `session-matrix-${index}`,
    runId: `run-matrix-${index}`,
    evidenceKind: "physical",
    verificationType: "PHYSICAL",
    status: "PHYSICAL_VALIDATED",
    transport: target.transport,
    modulation: target.vlcModulation || target.ofdmModulation || "QR",
    gridSize: target.ofdmGridSize,
    transmitterScreen: "Liquid Retina XDR",
    transmitterDevice: "MacBook Pro",
    receiverCamera: "48MP Main Camera",
    receiverDevice: "iPhone 15 Pro",
    cameraProvenance: {
      deviceId: `camera-device-${index}`,
      deviceLabel: "48MP Main Camera",
      width: 1280,
      height: 720,
      frameRate: 30,
      capturedFramesCount: 120,
      droppedFramesCount: 0,
      timestamp: 1700000000000 + index * 100000,
    },
    displayProvenance: {
      width: 1920,
      height: 1080,
    },
    opticalDistanceCm: 25,
    ambientLux: 220,
    exposureMode: "locked",
    payloadSizeBytes: payloadBytes.length,
    durationMs: 2200 + index * 15,
    measuredFps: 30.0,
    validFramesCount: 15,
    corruptFramesCount: 0,
    droppedFramesCount: 0,
    symbolLockAcquired: true,
    crcStatus: "valid",
    reconstructionCompleted: true,
    expectedSha256: hash,
    recoveredSha256: hash,
    sha256Matched: true,
    sourceLabel: "PhysicalCameraService:AuthoritativeLiveOpticalCapture",
    operatorNotes: "Operator controlled matrix test",
    timestampStart: 1700000000000 + index * 100000,
    timestampEnd: 1700000000000 + index * 100000 + 2200,
    recordSealSha256: "d".repeat(60) + index.toString().padStart(4, "0"),
    sealedAt: 1700000000000 + index * 100000 + 2200,
    ...overrides,
  };
}

describe("Phase 12: Physical Optical Validation Execution", () => {
  const qrTarget = SUPPORTED_PHYSICAL_MATRIX_TARGETS[0]; // QR
  const vlcTarget = SUPPORTED_PHYSICAL_MATRIX_TARGETS[1]; // VLC OOK
  const ofdmBpsk16Target = SUPPORTED_PHYSICAL_MATRIX_TARGETS[3]; // Visual OFDM BPSK 16x16

  test("Supported matrix covers all 11 distinct protocol targets", () => {
    assert.equal(SUPPORTED_PHYSICAL_MATRIX_TARGETS.length, 11);
    
    // QR baseline
    assert.equal(SUPPORTED_PHYSICAL_MATRIX_TARGETS[0].transport, TransportId.QR);
    
    // VLC OOK
    assert.equal(SUPPORTED_PHYSICAL_MATRIX_TARGETS[1].transport, TransportId.VLC);
    assert.equal(SUPPORTED_PHYSICAL_MATRIX_TARGETS[1].vlcModulation, "ook");

    // 9 Visual OFDM targets: BPSK, QPSK, 16-QAM across 8, 16, 32
    const ofdmTargets = SUPPORTED_PHYSICAL_MATRIX_TARGETS.filter((t) => t.transport === TransportId.VisualOFDM);
    assert.equal(ofdmTargets.length, 9);
    
    const bpsk8 = ofdmTargets.find((t) => t.ofdmModulation === "bpsk" && t.ofdmGridSize === 8);
    const qpsk16 = ofdmTargets.find((t) => t.ofdmModulation === "qpsk" && t.ofdmGridSize === 16);
    const qam32 = ofdmTargets.find((t) => t.ofdmModulation === "16qam" && t.ofdmGridSize === 32);
    assert.ok(bpsk8);
    assert.ok(qpsk16);
    assert.ok(qam32);
  });

  test("Preflight checklist passes with all 10 checks verified on valid configuration", async () => {
    const payload = new TextEncoder().encode("Preflight test payload");
    const preflight = await evaluatePreflightChecklist({
      protocolConfig: vlcTarget,
      payload,
      cameraPermission: "granted",
      ambientLux: 250,
      exposureMode: "locked",
      opticalDistanceCm: 25,
      sessionId: "session-test-01",
      runId: "run-test-01",
    });

    assert.equal(preflight.ready, true);
    assert.equal(preflight.blockingIssues.length, 0);
    assert.equal(preflight.items.length, 10);
    
    const permItem = preflight.items.find((i) => i.key === "camera_permission");
    assert.equal(permItem?.status, "pass");
    
    const shaItem = preflight.items.find((i) => i.key === "expected_sha256");
    assert.equal(shaItem?.status, "pass");
  });

  test("Preflight checklist blocks execution on camera permission denied or empty payload", async () => {
    // 1. Camera permission denied
    const deniedPreflight = await evaluatePreflightChecklist({
      protocolConfig: vlcTarget,
      payload: new TextEncoder().encode("test"),
      cameraPermission: "denied",
    });
    assert.equal(deniedPreflight.ready, false);
    assert.ok(deniedPreflight.blockingIssues.some((b) => b.includes("Camera permission denied")));

    // 2. Empty payload
    const emptyPayloadPreflight = await evaluatePreflightChecklist({
      protocolConfig: vlcTarget,
      payload: new Uint8Array(0),
      cameraPermission: "granted",
    });
    assert.equal(emptyPayloadPreflight.ready, false);
    assert.ok(emptyPayloadPreflight.blockingIssues.some((b) => b.includes("Payload is empty")));
  });

  test("Preflight checklist reports warnings for low ambient lighting without blocking execution", async () => {
    const lowLightPreflight = await evaluatePreflightChecklist({
      protocolConfig: vlcTarget,
      payload: new TextEncoder().encode("test"),
      cameraPermission: "granted",
      ambientLux: 10, // Very low light
    });

    assert.equal(lowLightPreflight.ready, true); // Non-blocking
    assert.ok(lowLightPreflight.warnings.length > 0);
    const lightItem = lowLightPreflight.items.find((i) => i.key === "lighting_exposure");
    assert.equal(lightItem?.status, "warn");
  });

  test("Single real physical run promotes target to PHYSICAL_VALIDATED", () => {
    const executor = new PhysicalValidationExecutor();
    const run1 = createMockPhysicalRecord(1, vlcTarget);
    
    executor.recordPhysicalRun(run1);
    const report = executor.generateExecutionReport();

    assert.equal(report.testedTargetsCount, 1);
    assert.equal(report.validatedTargetsCount, 1);
    assert.equal(report.verifiedTargetsCount, 0);
    assert.equal(report.untestedTargetsCount, 10);

    const vlcSummary = report.targetSummaries.find((s) => s.target.transport === TransportId.VLC);
    assert.equal(vlcSummary?.status, "PHYSICAL_VALIDATED");
    assert.equal(vlcSummary?.qualifyingPhysicalRunsCount, 1);
    assert.equal(vlcSummary?.sha256Verified, true);
  });

  test("Three independent matching physical runs promote target to PHYSICAL_VERIFIED", () => {
    const executor = new PhysicalValidationExecutor();
    const run1 = createMockPhysicalRecord(1, ofdmBpsk16Target);
    const run2 = createMockPhysicalRecord(2, ofdmBpsk16Target);
    const run3 = createMockPhysicalRecord(3, ofdmBpsk16Target);

    executor.recordPhysicalRun(run1);
    executor.recordPhysicalRun(run2);
    executor.recordPhysicalRun(run3);

    const report = executor.generateExecutionReport();
    assert.equal(report.verifiedTargetsCount, 1);

    const ofdmSummary = report.targetSummaries.find(
      (s) => s.target.transport === TransportId.VisualOFDM && s.target.ofdmModulation === "bpsk" && s.target.ofdmGridSize === 16
    );
    assert.equal(ofdmSummary?.status, "PHYSICAL_VERIFIED");
    assert.equal(ofdmSummary?.qualifyingPhysicalRunsCount, 3);
  });

  test("Software simulation runs are strictly segregated and never promote physical status", () => {
    const executor = new PhysicalValidationExecutor();
    const softwareRun = {
      recordId: "sim-ofdm-01",
      evidenceKind: "software",
      verificationType: "SOFTWARE",
      transport: TransportId.VisualOFDM,
      modulation: "bpsk",
      gridSize: 16,
      sha256Matched: true,
      expectedSha256: "0".repeat(64),
      recoveredSha256: "0".repeat(64),
      reconstructionCompleted: true,
    };

    executor.recordSoftwareRun(softwareRun);
    const report = executor.generateExecutionReport();

    assert.equal(report.testedTargetsCount, 0, "Software run must not increment testedTargetsCount");
    assert.equal(report.validatedTargetsCount, 0);
    assert.equal(report.softwareSimulationRuns.length, 1);
    assert.equal(report.executedPhysicalRuns.length, 0);
    assert.equal(report.overallLedgerStatus, "EXPERIMENTAL");
  });

  test("Full mocked-camera end-to-end execution of VLC OOK records sealed physical evidence", async () => {
    const executor = new PhysicalValidationExecutor();
    const testText = "Phase 12 End-to-End Mocked Optical Run";
    const testBytes = new TextEncoder().encode(testText);
    const expectedHash = await sha256Hex(testBytes);
    const fileHash = await sha256(testBytes);

    const mockCamera = new PhysicalCameraService();
    mockCamera.start = async () => null as any;
    mockCamera.stop = () => {};

    const session = executor.createSession({
      target: vlcTarget,
      payload: testBytes,
      expectedSha256: expectedHash,
      cameraService: mockCamera,
    });

    await session.start();

    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: testBytes.length,
      blockSize: 16,
      totalBlocks: Math.ceil(testBytes.length / 16),
      fileHash,
      fileName: "phase12_test.bin",
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
        const frame = createMockOpticalFrame(32, 24, stream.levels[i], 20);
        await session.ingestFrame(frame as any);
      }
    };

    // 1. Transmit Metadata
    await transmitPayload(encodeMetadataFrame(metadata));

    // 2. Transmit Sequential Blocks
    for (let b = 0; b < metadata.totalBlocks; b++) {
      const start = b * metadata.blockSize;
      const end = Math.min(start + metadata.blockSize, testBytes.length);
      const chunk = testBytes.subarray(start, end);
      await transmitPayload(encodeSequentialFrame(b, chunk));
    }

    const rec = session.getCompletedRecord();
    assert.ok(rec);
    assert.equal(rec.status, "PHYSICAL_VALIDATED");
    assert.equal(rec.sha256Matched, true);
    assert.ok(rec.recordSealSha256);

    executor.recordPhysicalRun(rec);
    const report = executor.generateExecutionReport();
    assert.equal(report.validatedTargetsCount, 1);
    assert.equal(report.executedPhysicalRuns.length, 1);
  });

  test("Execution report markdown generates 4 distinct partitions accurately", () => {
    const executor = new PhysicalValidationExecutor();
    const run1 = createMockPhysicalRecord(1, vlcTarget);
    const failedRun = createMockPhysicalRecord(2, qrTarget, {
      status: "FAILED",
      sha256Matched: false,
      crcStatus: "invalid",
    });

    executor.recordPhysicalRun(run1);
    executor.recordPhysicalRun(failedRun);
    executor.recordSoftwareRun({ id: "sim-1", evidenceKind: "software" });

    const md = executor.generateMarkdownExecutionReport();
    
    // Check 4 mandatory sections
    assert.ok(md.includes("## 1. Actually Executed Physical Runs"));
    assert.ok(md.includes("## 2. Software / Simulation Runs (Strictly Segregated)"));
    assert.ok(md.includes("## 3. Failed / Incomplete Physical Runs"));
    assert.ok(md.includes("## 4. Configurations Not Yet Tested"));

    assert.ok(md.includes(run1.runId));
    assert.ok(md.includes(failedRun.runId));
    assert.ok(md.includes("1 software simulation record(s)"));
  });
});
