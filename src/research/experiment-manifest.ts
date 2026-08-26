/**
 * Experiment Manifest Specification & Generator (Milestone 7C)
 *
 * Implements:
 * - Immutable experiment manifests with deterministic serialization
 * - Hardware, environmental, transport, and session provenance metadata
 * - Cryptographic manifest hashing for tamper-evident research records
 *
 * NOTE: For physical optical research reproducibility.
 */

import { TransportId } from "../core/transport";
import { sha256Hex } from "../core/integrity";
import type { TestRun } from "./test-run";

export interface HardwareMetadata {
  deviceModel: string;
  panelModel?: string;
  sensorModel?: string;
  resolution: string;
  refreshRateHz?: number;
  operatingSystem: string;
  browser: string;
}

export interface EnvironmentalMetadata {
  distanceCm: number;
  ambientLux: number;
  exposureMode: "auto" | "locked" | "manual";
}

export interface ExperimentManifest {
  schemaVersion: number;
  experimentId: string;
  createdAt: number;
  transport: TransportId;
  modulation: string;
  gridSize?: number;
  transmitter: HardwareMetadata;
  receiver: HardwareMetadata;
  environment: EnvironmentalMetadata;
  targetFps: number;
  softwareVersion: string;
  expectedPayloadSha256: string;
  notes?: string;
  manifestHash?: string;
}

/**
 * Generate a deterministic JSON string from a manifest object (excluding dynamic manifestHash).
 */
export function serializeManifestForHashing(manifest: Omit<ExperimentManifest, "manifestHash">): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    experimentId: manifest.experimentId,
    createdAt: manifest.createdAt,
    transport: manifest.transport,
    modulation: manifest.modulation,
    gridSize: manifest.gridSize ?? null,
    transmitter: {
      deviceModel: manifest.transmitter.deviceModel,
      panelModel: manifest.transmitter.panelModel ?? null,
      resolution: manifest.transmitter.resolution,
      refreshRateHz: manifest.transmitter.refreshRateHz ?? null,
      operatingSystem: manifest.transmitter.operatingSystem,
      browser: manifest.transmitter.browser,
    },
    receiver: {
      deviceModel: manifest.receiver.deviceModel,
      sensorModel: manifest.receiver.sensorModel ?? null,
      resolution: manifest.receiver.resolution,
      operatingSystem: manifest.receiver.operatingSystem,
      browser: manifest.receiver.browser,
    },
    environment: {
      distanceCm: manifest.environment.distanceCm,
      ambientLux: manifest.environment.ambientLux,
      exposureMode: manifest.environment.exposureMode,
    },
    targetFps: manifest.targetFps,
    softwareVersion: manifest.softwareVersion,
    expectedPayloadSha256: manifest.expectedPayloadSha256,
    notes: manifest.notes ?? "",
  });
}

/**
 * Compute SHA-256 hash of a manifest object for immutable reproducibility verification.
 */
export async function computeManifestHash(manifest: Omit<ExperimentManifest, "manifestHash">): Promise<string> {
  const serialized = serializeManifestForHashing(manifest);
  const buffer = new TextEncoder().encode(serialized);
  return sha256Hex(buffer);
}

/**
 * Create a complete, hashed experiment manifest from physical parameters.
 */
export async function createExperimentManifest(
  params: Omit<ExperimentManifest, "schemaVersion" | "manifestHash">
): Promise<ExperimentManifest> {
  const base: Omit<ExperimentManifest, "manifestHash"> = {
    schemaVersion: 1,
    ...params,
  };

  const hash = await computeManifestHash(base);

  return {
    ...base,
    manifestHash: hash,
  };
}

/**
 * Derive an experiment manifest from an existing recorded physical TestRun.
 */
export async function deriveManifestFromTestRun(
  run: TestRun,
  softwareVersion = "1.0.0"
): Promise<ExperimentManifest> {
  const modulation = run.fileName.includes("ook")
    ? "OOK"
    : run.fileName.includes("pam4")
    ? "4-PAM"
    : run.fileName.includes("csk8")
    ? "CSK-8"
    : run.fileName.includes("csk16")
    ? "CSK-16"
    : run.fileName.includes("bpsk")
    ? "BPSK"
    : run.fileName.includes("qpsk")
    ? "QPSK"
    : run.fileName.includes("16qam")
    ? "16-QAM"
    : "QR";

  const gridSize = run.fileName.includes("8x8")
    ? 8
    : run.fileName.includes("16x16")
    ? 16
    : run.fileName.includes("32x32")
    ? 32
    : undefined;

  return createExperimentManifest({
    experimentId: `exp-${run.runId}`,
    createdAt: run.createdAt,
    transport: run.transport,
    modulation,
    gridSize,
    transmitter: {
      deviceModel: run.sender.deviceName,
      resolution: "1920x1080",
      refreshRateHz: run.metrics.screenFps ?? 60,
      operatingSystem: run.sender.osVersion,
      browser: run.sender.browserName,
    },
    receiver: {
      deviceModel: run.receiver.deviceName,
      resolution: "1280x720",
      operatingSystem: run.receiver.osVersion,
      browser: run.receiver.browserName,
    },
    environment: {
      distanceCm: run.distanceCm ?? 15,
      ambientLux: run.environment === "bright" ? 450 : run.environment === "dark" ? 30 : 250,
      exposureMode: (run.notes ?? "").toLowerCase().includes("locked") ? "locked" : "auto",
    },
    targetFps: run.metrics.cameraFps ?? 30,
    softwareVersion,
    expectedPayloadSha256: run.fileHashHex ?? "",
    notes: run.notes ?? undefined,
  });
}
