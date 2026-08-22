import { isSha256Hex, type IntegrityStatus } from "../core/integrity";
import type { TransportId } from "../core/transport";

export type EvidenceKind = "simulated" | "physical";
export type TestRunStatus = "draft" | "complete";

export type DevicePlatform = "android" | "iphone" | "desktop" | "other";

export interface TestDevice {
  platform: DevicePlatform;
  deviceName: string;
  osVersion: string;
  browserName: string;
  browserVersion: string;
}

export interface TestRunMetrics {
  fileSize: number;
  elapsedMs: number;
  averageThroughputBytesPerSecond: number;
  frameHitRate: number | null;
  errorRate: number | null;
  recoveryOverhead: number | null;
  cameraFps: number | null;
  screenFps: number | null;
  signalQuality: number | null;
}

export interface TestRun {
  schemaVersion: 1;
  runId: string;
  status: TestRunStatus;
  evidenceKind: EvidenceKind;
  transport: TransportId;
  sender: TestDevice;
  receiver: TestDevice;
  fileName: string;
  fileHashHex: string | null;
  integrityStatus: IntegrityStatus;
  metrics: TestRunMetrics;
  distanceCm: number | null;
  environment: "bright" | "normal" | "dark" | "unspecified";
  notes: string;
  createdAt: number;
  completedAt: number | null;
}

export function isCanonicalSha256(value: string | null): value is string {
  return isSha256Hex(value);
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isRatio(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 1);
}

function hasDeviceEvidence(device: TestDevice): boolean {
  return Boolean(device.deviceName && device.osVersion && device.browserName && device.browserVersion);
}

export function testRunValidationErrors(run: TestRun): string[] {
  const errors: string[] = [];
  if (run.status !== "complete") errors.push("Test run is still a draft");
  if (run.completedAt === null) errors.push("Completion time is required");
  if (!Number.isSafeInteger(run.metrics.fileSize) || run.metrics.fileSize < 0) errors.push("File size must be a non-negative safe integer");
  if (!Number.isFinite(run.metrics.elapsedMs) || run.metrics.elapsedMs <= 0) errors.push("Elapsed time must be a positive finite measurement");
  if (!isFiniteNonNegative(run.metrics.averageThroughputBytesPerSecond)) errors.push("Throughput must be finite and non-negative");
  if (!isRatio(run.metrics.frameHitRate)) errors.push("Frame hit rate must be between zero and one");
  if (!isRatio(run.metrics.errorRate)) errors.push("Error rate must be between zero and one");
  if (run.metrics.recoveryOverhead !== null && !isFiniteNonNegative(run.metrics.recoveryOverhead)) errors.push("Recovery overhead must be finite and non-negative");
  if (run.metrics.cameraFps !== null && (!Number.isFinite(run.metrics.cameraFps) || run.metrics.cameraFps <= 0)) errors.push("Camera FPS must be positive and finite");
  if (run.metrics.screenFps !== null && (!Number.isFinite(run.metrics.screenFps) || run.metrics.screenFps <= 0)) errors.push("Screen FPS must be positive and finite");
  if (!isRatio(run.metrics.signalQuality)) errors.push("Signal quality must be between zero and one");
  if (run.distanceCm !== null && !isFiniteNonNegative(run.distanceCm)) errors.push("Distance must be finite and non-negative");

  if (run.evidenceKind === "physical") {
    if (!hasDeviceEvidence(run.sender) || !hasDeviceEvidence(run.receiver)) errors.push("Physical runs require complete sender and receiver device evidence");
    if (run.environment === "unspecified") errors.push("Physical runs require an environment");
    if (run.distanceCm === null || run.distanceCm < 0) errors.push("Physical runs require a measured distance");
    if (run.metrics.cameraFps === null || run.metrics.screenFps === null) errors.push("Physical runs require camera and screen FPS");
    if (run.metrics.frameHitRate === null || run.metrics.errorRate === null) errors.push("Physical runs require frame hit and error rates");
    if (run.integrityStatus !== "verified" && run.integrityStatus !== "mismatch") errors.push("Physical runs require a final SHA-256 result");
    if (!isCanonicalSha256(run.fileHashHex)) errors.push("Physical runs require a canonical SHA-256 digest");
  }
  return errors;
}

export function isMeasuredRun(run: TestRun): boolean {
  return testRunValidationErrors(run).length === 0;
}

export function isPhysicallyVerifiedRun(run: TestRun): boolean {
  return isMeasuredRun(run)
    && run.evidenceKind === "physical"
    && run.integrityStatus === "verified"
    && isCanonicalSha256(run.fileHashHex);
}
