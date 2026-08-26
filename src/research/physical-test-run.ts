/**
 * Physical Optical Experiment Record & Type System (Milestone 5A)
 *
 * Implements:
 * - Strongly typed physical screen-to-camera experiment record
 * - Strict enums for transport, modulation, outcome, sync status, and exposure mode
 * - Validation rules enforcing physical hardware evidence and SHA-256 cryptographic verification
 *
 * NOTE: Real optical hardware validation rules only. Synthetic channel results are prohibited from this model.
 */

import { isSha256Hex } from "../core/integrity";
import type { TransportId } from "../core/transport";

export type PhysicalTransportId = TransportId;

export type PhysicalModulation =
  | "qr"
  | "ook"
  | "pam4"
  | "csk8"
  | "csk16"
  | "bpsk"
  | "qpsk"
  | "16qam";

export type PhysicalOutcome =
  | "success"
  | "sha256_mismatch"
  | "crc_failure"
  | "sync_failure"
  | "frame_loss_failure"
  | "incomplete_payload";

export type PhysicalSyncStatus =
  | "locked"
  | "intermittent"
  | "failed"
  | "uncalibrated";

export type PhysicalExposureMode =
  | "auto"
  | "manual"
  | "locked"
  | "continuous";

export interface PhysicalTestRun {
  schemaVersion: 1;
  runId: string;
  timestamp: number;
  evidenceKind: "physical";
  transport: PhysicalTransportId;
  modulation: PhysicalModulation;

  // Transmitter Hardware
  transmitterDevice: string;
  transmitterDisplay: string;
  displayResolution: string; // e.g. "1920x1080"
  displayRefreshRate: number; // Hz, e.g. 60, 120

  // Receiver Hardware
  receiverDevice: string;
  receiverCamera: string;
  cameraResolution: string; // e.g. "1280x720"
  operatingSystem: string; // e.g. "Android 14", "iOS 17.4", "Windows 11"
  browser: string; // e.g. "Chrome 124", "Safari 17.4"

  // Physical Environment
  distanceCm: number; // Distance in cm
  ambientLightLux: number; // Ambient light in lux
  exposureMode: PhysicalExposureMode;
  gain: number; // ISO or sensor gain multiplier
  frameRate: number; // Observed camera FPS

  // Transmission Configuration
  payloadSizeBytes: number;
  blockSize: number;
  gridSize?: number; // Visual OFDM grid dimension (8, 16, 32)
  symbolRate: number; // Symbols per second

  // Verification & Telemetry
  durationMs: number;
  reconstructedBytes: number;
  sha256Original: string; // 64 hex characters
  sha256Recovered: string; // 64 hex characters
  sha256Matched: boolean;
  crcPassed: boolean;
  droppedFrames: number;
  synchronizationStatus: PhysicalSyncStatus;
  outcome: PhysicalOutcome;
  notes: string;
}

/**
 * Validate a PhysicalTestRun against strict physical evidence requirements.
 * Returns array of validation error strings (empty if valid).
 */
export function validatePhysicalTestRun(run: PhysicalTestRun): string[] {
  const errors: string[] = [];

  if (!run.runId || run.runId.trim().length === 0) {
    errors.push("runId is required");
  }
  if (!Number.isSafeInteger(run.timestamp) || run.timestamp <= 0) {
    errors.push("Valid timestamp is required");
  }
  if (run.evidenceKind !== "physical") {
    errors.push("evidenceKind must be 'physical'");
  }
  if (!run.transmitterDevice || run.transmitterDevice.trim().length === 0) {
    errors.push("transmitterDevice is required");
  }
  if (!run.transmitterDisplay || run.transmitterDisplay.trim().length === 0) {
    errors.push("transmitterDisplay is required");
  }
  if (!run.receiverDevice || run.receiverDevice.trim().length === 0) {
    errors.push("receiverDevice is required");
  }
  if (!run.receiverCamera || run.receiverCamera.trim().length === 0) {
    errors.push("receiverCamera is required");
  }
  if (!run.operatingSystem || run.operatingSystem.trim().length === 0) {
    errors.push("operatingSystem is required");
  }
  if (!run.browser || run.browser.trim().length === 0) {
    errors.push("browser is required");
  }

  if (!Number.isFinite(run.distanceCm) || run.distanceCm < 0) {
    errors.push("distanceCm must be a non-negative number");
  }
  if (!Number.isFinite(run.ambientLightLux) || run.ambientLightLux < 0) {
    errors.push("ambientLightLux must be a non-negative number");
  }
  if (!Number.isFinite(run.frameRate) || run.frameRate <= 0) {
    errors.push("frameRate must be a positive number");
  }

  if (!Number.isSafeInteger(run.payloadSizeBytes) || run.payloadSizeBytes < 0) {
    errors.push("payloadSizeBytes must be a non-negative integer");
  }
  if (!Number.isSafeInteger(run.reconstructedBytes) || run.reconstructedBytes < 0) {
    errors.push("reconstructedBytes must be a non-negative integer");
  }
  if (!Number.isFinite(run.durationMs) || run.durationMs <= 0) {
    errors.push("durationMs must be a positive number");
  }

  if (!isSha256Hex(run.sha256Original)) {
    errors.push("sha256Original must be a 64-character lowercase hex SHA-256 digest");
  }
  if (!isSha256Hex(run.sha256Recovered)) {
    errors.push("sha256Recovered must be a 64-character lowercase hex SHA-256 digest");
  }

  // Cryptographic integrity consistency check
  const actualMatch = run.sha256Original.toLowerCase() === run.sha256Recovered.toLowerCase();
  if (run.sha256Matched !== actualMatch) {
    errors.push(`sha256Matched flag (${run.sha256Matched}) contradicts hash comparison (${actualMatch})`);
  }

  if (run.outcome === "success") {
    if (!run.sha256Matched) {
      errors.push("Outcome 'success' requires sha256Matched to be true");
    }
    if (!run.crcPassed) {
      errors.push("Outcome 'success' requires crcPassed to be true");
    }
    if (run.synchronizationStatus !== "locked") {
      errors.push("Outcome 'success' requires synchronizationStatus to be 'locked'");
    }
    if (run.reconstructedBytes !== run.payloadSizeBytes) {
      errors.push("Outcome 'success' requires reconstructedBytes === payloadSizeBytes");
    }
  }

  return errors;
}

/**
 * Predicate to test whether a physical run is strictly valid and verified.
 */
export function isVerifiedPhysicalRun(run: PhysicalTestRun): boolean {
  return validatePhysicalTestRun(run).length === 0 && run.outcome === "success" && run.sha256Matched;
}
