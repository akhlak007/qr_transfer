import type { IntegrityStatus } from "../core/integrity";
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
  return value !== null && /^[0-9a-f]{64}$/.test(value);
}

function hasDeviceEvidence(device: TestDevice): boolean {
  return Boolean(device.deviceName && device.osVersion && device.browserName && device.browserVersion);
}

export function testRunValidationErrors(run: TestRun): string[] {
  const errors: string[] = [];
  if (run.status !== "complete") errors.push("Test run is still a draft");
  if (run.completedAt === null) errors.push("Completion time is required");
  if (run.metrics.fileSize < 0) errors.push("File size cannot be negative");
  if (run.metrics.elapsedMs <= 0) errors.push("Elapsed time must be measured");
  if (run.metrics.averageThroughputBytesPerSecond < 0) errors.push("Throughput cannot be negative");

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
