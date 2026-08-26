/**
 * Physical Optical Evidence Export Engine (Milestone 6F)
 *
 * Implements:
 * - Deterministic JSON and CSV export of physical optical evidence records
 * - Strict segregation: Excludes synthetic channel benchmark runs
 * - Full hardware provenance, timing, cryptographic SHA-256 digests, and CRC telemetry
 *
 * NOTE: For physical optical research records only.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import {
  summarizePhysicalRunsFromLedger,
  type PhysicalEvidenceSummary,
} from "./physical-evidence";

export interface PhysicalEvidenceExportBundle {
  schemaVersion: number;
  exportedAt: string;
  environment: {
    appVersion: string;
    userAgent: string;
  };
  policy: {
    minPhysicalRuns: number;
    minSha256Matches: number;
    zeroFailureRequired: boolean;
  };
  summaries: {
    vlc: PhysicalEvidenceSummary;
    ofdm: PhysicalEvidenceSummary;
  };
  perModulation: Record<string, PhysicalEvidenceSummary>;
  records: TestRun[];
}

/**
 * Generate a complete JSON export bundle containing physical test evidence only.
 */
export function generatePhysicalEvidenceJson(
  runs: TestRun[],
  appVersion = "1.0.0"
): string {
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  const vlcSummary = summarizePhysicalRunsFromLedger(physicalRuns, TransportId.VLC);
  const ofdmSummary = summarizePhysicalRunsFromLedger(physicalRuns, TransportId.VisualOFDM);

  const perModulation: Record<string, PhysicalEvidenceSummary> = {};

  const vlcMods = ["ook", "pam4", "csk8", "csk16"];
  for (const m of vlcMods) {
    const modRuns = physicalRuns.filter(
      (r) => r.transport === TransportId.VLC && r.fileName.toLowerCase().includes(m)
    );
    perModulation[`vlc_${m}`] = summarizePhysicalRunsFromLedger(modRuns, TransportId.VLC);
  }

  const ofdmMods = ["bpsk", "qpsk", "16qam"];
  for (const m of ofdmMods) {
    const modRuns = physicalRuns.filter(
      (r) => r.transport === TransportId.VisualOFDM && r.fileName.toLowerCase().includes(m)
    );
    perModulation[`ofdm_${m}`] = summarizePhysicalRunsFromLedger(modRuns, TransportId.VisualOFDM);
  }

  const bundle: PhysicalEvidenceExportBundle = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    environment: {
      appVersion,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node.js Environment",
    },
    policy: {
      minPhysicalRuns: 3,
      minSha256Matches: 3,
      zeroFailureRequired: true,
    },
    summaries: {
      vlc: vlcSummary,
      ofdm: ofdmSummary,
    },
    perModulation,
    records: physicalRuns,
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Generate a CSV export containing all physical optical test run records.
 */
export function generatePhysicalEvidenceCsv(runs: TestRun[]): string {
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  const headers = [
    "RunID",
    "Timestamp",
    "Transport",
    "TransmitterDevice",
    "TransmitterDisplay",
    "ReceiverDevice",
    "DistanceCm",
    "AmbientLux",
    "CameraFps",
    "PayloadBytes",
    "DurationMs",
    "ThroughputBps",
    "ThroughputKbps",
    "CRCResult",
    "SHA256Hash",
    "IntegrityStatus",
    "Notes",
  ];

  const rows = physicalRuns.map((r) => {
    const throughput = r.metrics.elapsedMs > 0
      ? (r.metrics.fileSize * 8) / (r.metrics.elapsedMs / 1000.0)
      : 0;

    return [
      `"${r.runId}"`,
      `"${new Date(r.createdAt).toISOString()}"`,
      `"${r.transport}"`,
      `"${r.sender.deviceName}"`,
      `"${r.sender.osVersion}"`,
      `"${r.receiver.deviceName}"`,
      r.distanceCm ?? "",
      r.environment,
      r.metrics.cameraFps?.toFixed(1) ?? "",
      r.metrics.fileSize,
      r.metrics.elapsedMs,
      throughput.toFixed(1),
      (throughput / 1000.0).toFixed(2),
      r.metrics.errorRate === 0 ? "PASS" : "FAIL",
      `"${r.fileHashHex}"`,
      `"${r.integrityStatus}"`,
      `"${(r.notes ?? "").replace(/"/g, '""')}"`,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
