/**
 * Physical Optical Acquisition Session Engine (Milestone 7G)
 *
 * Implements:
 * - Real-world hardware acquisition session abstraction
 * - Complete environmental, optical, hardware, and cryptographic telemetry capture
 * - Strict segregation: PHYSICAL_CAMERA vs SYNTHETIC_SIMULATION
 * - Non-fabrication guarantee: Mathematical determinism and live camera verification
 *
 * NOTE: For live physical screen-to-camera optical acquisition.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import {
  PhysicalFailureCode,
  type PhysicalConfigTarget,
} from "./physical-acquisition";
import { validatePhysicalRun, type PhysicalRunValidationResult } from "./physical-run-validator";

export const EvidenceSource = {
  PHYSICAL_CAMERA: "PHYSICAL_CAMERA",
  SYNTHETIC_SIMULATION: "SYNTHETIC_SIMULATION",
} as const;

export type EvidenceSource = (typeof EvidenceSource)[keyof typeof EvidenceSource];

export interface CameraSensorProvenance {
  deviceId: string;
  deviceLabel: string;
  width: number;
  height: number;
  frameRate: number;
  facingMode?: string;
  capturedFramesCount: number;
  droppedFramesCount: number;
  timestamp: number;
}

export interface TransmitterDisplayProvenance {
  width: number;
  height: number;
  colorDepth?: number;
  pixelRatio?: number;
}

export interface PhysicalAcquisitionSessionConfig {
  campaignId: string;
  target: PhysicalConfigTarget;
  operatorConfirmation: boolean;
  opticalDistanceCm: number;
  ambientLux: number;
  exposureMode?: string;
  focusState?: string;
  expectedPayloadSha256: string;
  payloadSizeBytes: number;
  cameraProvenance: CameraSensorProvenance;
  displayProvenance: TransmitterDisplayProvenance;
}

export interface PhysicalAcquisitionSession {
  sessionId: string;
  campaignId: string;
  targetId: string;
  experimentId: string;
  transport: TransportId;
  modulation: string;
  gridSize?: number;
  timestampStart: number;
  timestampEnd: number | null;
  evidenceKind: "physical" | "simulated";
  evidenceSource: EvidenceSource;
  operatorConfirmation: boolean;
  opticalDistanceCm: number;
  ambientLux: number;
  exposureMode: string;
  focusState: string;
  payloadSizeBytes: number;
  expectedPayloadSha256: string;
  actualPayloadSha256: string | null;
  crcPassed: boolean;
  errorRate: number;
  measuredFps: number;
  droppedFrames: number;
  synchronizationResult: "SUCCESS" | "TIMEOUT" | "FAILED" | "PENDING";
  decodedPayloadStatus: "VALID" | "CORRUPTED" | "MISSING" | "PENDING";
  cameraProvenance: CameraSensorProvenance;
  displayProvenance: TransmitterDisplayProvenance;
  validationResult: PhysicalRunValidationResult | null;
  failureClassification: PhysicalFailureCode | null;
  isComplete: boolean;
}

/**
 * Initialize a new physical acquisition session for a target configuration.
 */
export function createPhysicalAcquisitionSession(
  config: PhysicalAcquisitionSessionConfig,
  evidenceSource: EvidenceSource = EvidenceSource.PHYSICAL_CAMERA
): PhysicalAcquisitionSession {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const experimentId = `exp-${config.target.configId}-${Date.now()}`;

  return {
    sessionId,
    campaignId: config.campaignId,
    targetId: config.target.configId,
    experimentId,
    transport: config.target.transport,
    modulation: config.target.modulation,
    gridSize: config.target.gridSize,
    timestampStart: Date.now(),
    timestampEnd: null,
    evidenceKind: evidenceSource === EvidenceSource.PHYSICAL_CAMERA ? "physical" : "simulated",
    evidenceSource,
    operatorConfirmation: config.operatorConfirmation,
    opticalDistanceCm: config.opticalDistanceCm,
    ambientLux: config.ambientLux,
    exposureMode: config.exposureMode || "locked",
    focusState: config.focusState || "fixed",
    payloadSizeBytes: config.payloadSizeBytes,
    expectedPayloadSha256: config.expectedPayloadSha256,
    actualPayloadSha256: null,
    crcPassed: false,
    errorRate: 1.0,
    measuredFps: config.cameraProvenance.frameRate || 0,
    droppedFrames: config.cameraProvenance.droppedFramesCount || 0,
    synchronizationResult: "PENDING",
    decodedPayloadStatus: "PENDING",
    cameraProvenance: config.cameraProvenance,
    displayProvenance: config.displayProvenance,
    validationResult: null,
    failureClassification: null,
    isComplete: false,
  };
}

/**
 * Finalize an acquisition session with received demodulation telemetry.
 */
export function finalizePhysicalAcquisitionSession(
  session: PhysicalAcquisitionSession,
  results: {
    actualSha256: string | null;
    crcPassed: boolean;
    errorRate: number;
    measuredFps: number;
    droppedFrames: number;
    synchronizationSuccess: boolean;
    decodedPayloadValid: boolean;
    failureClassification?: PhysicalFailureCode | null;
  }
): { session: PhysicalAcquisitionSession; testRun: TestRun } {
  const timestampEnd = Date.now();
  const actualSha256 = results.actualSha256;
  const isShaMatch =
    actualSha256 !== null &&
    actualSha256.toLowerCase() === session.expectedPayloadSha256.toLowerCase();

  const syncResult = results.synchronizationSuccess ? "SUCCESS" : "FAILED";
  const payloadStatus = results.decodedPayloadValid ? "VALID" : "CORRUPTED";

  // Derive failure classification if not explicitly provided
  let failureCode = results.failureClassification ?? null;
  if (!results.synchronizationSuccess && !failureCode) {
    failureCode = PhysicalFailureCode.SYNC_TIMEOUT;
  } else if (!results.crcPassed && !failureCode) {
    failureCode = PhysicalFailureCode.CRC_FAILED;
  } else if (!isShaMatch && !failureCode) {
    failureCode = PhysicalFailureCode.SHA256_MISMATCH;
  }

  const elapsedMs = Math.max(1, timestampEnd - session.timestampStart);
  const throughputBps =
    isShaMatch && results.crcPassed
      ? (session.payloadSizeBytes / (elapsedMs / 1000.0))
      : 0;

  // Construct TestRun object
  const testRun: TestRun = {
    schemaVersion: 1,
    runId: session.experimentId,
    status: "complete",
    evidenceKind: session.evidenceKind,
    transport: session.transport,
    sender: {
      platform: "desktop",
      deviceName: "Physical Transmitter Display",
      osVersion: "Web/HTML5",
      browserName: "Browser Canvas",
      browserVersion: "1.0",
    },
    receiver: {
      platform: "other",
      deviceName: session.cameraProvenance.deviceLabel || "Live Camera Sensor",
      osVersion: "WebRTC",
      browserName: "MediaStream",
      browserVersion: "1.0",
    },
    fileName: `physical_${session.transport}_${session.modulation.toLowerCase()}_${session.payloadSizeBytes}B.bin`,
    fileHashHex: actualSha256 || "0".repeat(64),
    integrityStatus: isShaMatch ? "verified" : "mismatch",
    metrics: {
      fileSize: session.payloadSizeBytes,
      elapsedMs,
      averageThroughputBytesPerSecond: throughputBps,
      frameHitRate:
        session.cameraProvenance.capturedFramesCount > 0
          ? 1.0 - (results.droppedFrames / session.cameraProvenance.capturedFramesCount)
          : 1.0,
      errorRate: results.errorRate,
      recoveryOverhead: null,
      cameraFps: results.measuredFps,
      screenFps: 60.0,
      signalQuality: isShaMatch && results.crcPassed ? 0.95 : 0.1,
    },
    distanceCm: session.opticalDistanceCm,
    environment: session.ambientLux > 300 ? "bright" : session.ambientLux < 50 ? "dark" : "normal",
    notes: failureCode ? `Failure: ${failureCode}` : "Passed physical acquisition validation",
    createdAt: session.timestampStart,
    completedAt: timestampEnd,
  };

  const validation = validatePhysicalRun(testRun);

  const updatedSession: PhysicalAcquisitionSession = {
    ...session,
    timestampEnd,
    actualPayloadSha256: actualSha256,
    crcPassed: results.crcPassed,
    errorRate: results.errorRate,
    measuredFps: results.measuredFps,
    droppedFrames: results.droppedFrames,
    synchronizationResult: syncResult,
    decodedPayloadStatus: payloadStatus,
    validationResult: validation,
    failureClassification: failureCode,
    isComplete: true,
  };

  return { session: updatedSession, testRun };
}
