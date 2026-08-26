/**
 * Physical Optical Experiment Session Model & Types (Milestone 6D)
 *
 * Implements:
 * - Strongly typed session states and lifecycle transitions
 * - Fine-grained physical failure reasons and classification
 * - Device and optical environment readiness verification
 * - Immutable telemetry snapshots for researcher observation
 *
 * NOTE: For physical optical screen-to-camera validation only.
 */

import { TransportId } from "../core/transport";
import type { VlcModulationScheme } from "../transports/vlc/vlc-framing";
import type { OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";
import type { PhysicalExposureMode } from "./physical-test-run";
import type { PhysicalCameraDiagnostics } from "./physical-camera-capture";
import type { DisplayDiagnosticsSnapshot } from "./display-diagnostics";

export type PhysicalExperimentState =
  | "IDLE"
  | "DEVICE_CHECK"
  | "CAMERA_STARTING"
  | "CAMERA_READY"
  | "DISPLAY_READY"
  | "CALIBRATING"
  | "READY"
  | "TRANSMITTING"
  | "CAPTURING"
  | "DECODING"
  | "VALIDATING"
  | "RECORDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type PhysicalFailureReason =
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "DISPLAY_UNAVAILABLE"
  | "LOW_CONTRAST"
  | "EXPOSURE_UNSTABLE"
  | "INSUFFICIENT_DYNAMIC_RANGE"
  | "SYNC_TIMEOUT"
  | "GRID_DETECTION_FAILED"
  | "PILOT_SYNC_FAILED"
  | "DECODE_FAILED"
  | "CRC_FAILED"
  | "SHA256_MISMATCH"
  | "USER_CANCELLED"
  | "UNKNOWN_ERROR";

export interface DeviceReadinessReport {
  cameraPermissionGranted: boolean;
  cameraStreamActive: boolean;
  cameraResolutionDetected: boolean;
  cameraFpsStable: boolean;
  displayCanvasAvailable: boolean;
  displayRefreshRateMeasured: boolean;
  opticalDistanceValid: boolean;
  ambientLuxValid: boolean;
  calibrationPassed: boolean;
  payloadPrepared: boolean;
  sha256Generated: boolean;
  isReadyForExperiment: boolean;
}

export interface PhysicalExperimentSessionConfig {
  sessionId: string;
  transport: TransportId;
  vlcModulation?: VlcModulationScheme;
  ofdmModulation?: OfdmModulationScheme;
  ofdmGridSize?: number; // 8, 16, 32
  distanceCm: number;
  ambientLux: number;
  exposureMode: PhysicalExposureMode;
  payload: Uint8Array;
  symbolRate: number;
  transmitterDevice: string;
  transmitterDisplay: string;
  displayResolution: string;
  displayRefreshRate: number;
  receiverDevice: string;
  receiverCamera: string;
  operatingSystem: string;
  browser: string;
  notes?: string;
}

export interface PhysicalExperimentTelemetrySnapshot {
  sessionId: string;
  state: PhysicalExperimentState;
  transport: TransportId;
  elapsedMs: number;
  transmissionDurationMs: number;
  cameraDiagnostics: PhysicalCameraDiagnostics | null;
  displayDiagnostics: DisplayDiagnosticsSnapshot | null;
  readiness: DeviceReadinessReport;
  dynamicRange: number;
  isExposureStable: boolean;
  detectedSync: boolean;
  pilotCount?: number;
  detectedPilots?: number;
  estimatedSnrDb?: number;
  crcPassed: boolean;
  expectedSha256: string;
  recoveredSha256: string | null;
  sha256Matched: boolean;
  reconstructedBytes: number;
  throughputBps: number;
  throughputKbps: number;
  throughputMbps: number;
  failureReason?: PhysicalFailureReason;
  errorMessage?: string;
  timestamp: number;
}

/**
 * Calculate multi-unit throughput metrics from raw payload bytes and measured duration.
 */
export function calculatePhysicalThroughput(
  payloadBytes: number,
  durationMs: number
): { bps: number; kbps: number; mbps: number } {
  if (durationMs <= 0 || payloadBytes <= 0) {
    return { bps: 0, kbps: 0, mbps: 0 };
  }
  const durationSec = durationMs / 1000.0;
  const bits = payloadBytes * 8;
  const bps = bits / durationSec;
  const kbps = bps / 1000.0;
  const mbps = kbps / 1000.0;

  return {
    bps: Math.round(bps * 10) / 10,
    kbps: Math.round(kbps * 100) / 100,
    mbps: Math.round(mbps * 1000) / 1000,
  };
}
