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

export function isMeasuredRun(run: TestRun): boolean {
  return run.status === "complete";
}

export function isPhysicallyVerifiedRun(run: TestRun): boolean {
  return run.status === "complete"
    && run.evidenceKind === "physical"
    && run.integrityStatus === "verified"
    && run.fileHashHex !== null;
}
