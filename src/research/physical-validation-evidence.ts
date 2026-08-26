/**
 * Phase 11: Physical Optical Validation Evidence & Promotion Policy
 *
 * Implements:
 * - Strict evidence separation: PHYSICAL (hardware camera) vs SOFTWARE (simulated)
 * - Authoritative physical validation statuses: EXPERIMENTAL, FAILED, PHYSICAL_VALIDATED, PHYSICAL_VERIFIED
 * - Monotonic promotion rules: 1 qualifying run -> PHYSICAL_VALIDATED, >=3 independent matching runs -> PHYSICAL_VERIFIED
 * - Exact protocol configuration matching (transport, modulation, grid size)
 * - Zero-synthetic / zero-software contamination enforcement
 * - Physical evidence export (Markdown, JSON, CSV)
 *
 * NOTE: Strictly adheres to 2026-08-26-phase-11-physical-optical-validation-design.md.
 */

import { TransportId } from "../core/transport";
import type {
  CameraSensorProvenance,
  TransmitterDisplayProvenance,
} from "./physical-acquisition-session";
import type { OfdmReceiverGridSize } from "../transports/ofdm/ofdm-receiver";
import type { VlcModulationScheme } from "../transports/vlc/vlc-framing";
import type { OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";

export type PhysicalValidationStatus =
  | "EXPERIMENTAL"
  | "FAILED"
  | "PHYSICAL_VALIDATED"
  | "PHYSICAL_VERIFIED";

export type VerificationType = "PHYSICAL" | "SOFTWARE";

export interface ProtocolConfiguration {
  transport: TransportId;
  vlcModulation?: VlcModulationScheme;
  ofdmModulation?: OfdmModulationScheme;
  ofdmGridSize?: OfdmReceiverGridSize;
}

export interface PhysicalValidationRecord {
  schemaVersion: number;
  recordId: string;
  sessionId: string;
  runId: string;
  evidenceKind: "physical";
  verificationType: "PHYSICAL";
  status: PhysicalValidationStatus;
  transport: TransportId;
  modulation: string;
  gridSize?: number;
  
  // Hardware Provenance
  transmitterScreen?: string;
  transmitterDevice?: string;
  receiverCamera?: string;
  receiverDevice?: string;
  cameraProvenance: CameraSensorProvenance;
  displayProvenance: TransmitterDisplayProvenance;
  opticalDistanceCm: number | null;
  ambientLux: number | null;
  exposureMode: string | null;

  // Transmission & Optical Metrics
  payloadSizeBytes: number;
  durationMs: number;
  measuredFps: number;
  validFramesCount: number;
  corruptFramesCount: number;
  droppedFramesCount: number;
  symbolLockAcquired: boolean;
  crcStatus: "valid" | "invalid" | "not-applicable";
  reconstructionCompleted: boolean;
  
  // Cryptographic Verification
  expectedSha256: string;
  recoveredSha256: string | null;
  sha256Matched: boolean;

  // Provenance & Sealing
  sourceLabel: string;
  operatorNotes?: string;
  timestampStart: number;
  timestampEnd: number;
  recordSealSha256?: string;
  sealedAt?: number;
}

export interface PhysicalValidationEvaluation {
  targetConfig: ProtocolConfiguration;
  status: PhysicalValidationStatus;
  totalRecordsEvaluated: number;
  validatingRunCount: number;
  independentRunCount: number;
  duplicateRunCount: number;
  failedRunCount: number;
  rejectedSoftwareCount: number;
  issues: string[];
}

/**
 * Validate whether a single record strictly qualifies as PHYSICAL_VALIDATED.
 */
export function isQualifyingPhysicalValidatedRecord(
  record: any,
  expectedConfig?: ProtocolConfiguration
): boolean {
  if (!record || typeof record !== "object") return false;
  if (record.evidenceKind !== "physical") return false;
  if (record.verificationType !== "PHYSICAL") return false;
  if (!record.sha256Matched) return false;
  if (!record.expectedSha256 || record.expectedSha256.length !== 64) return false;
  if (record.expectedSha256 !== record.recoveredSha256) return false;
  if (!record.reconstructionCompleted) return false;
  if (record.payloadSizeBytes <= 0) return false;
  if (record.durationMs <= 0) return false;
  if (record.crcStatus === "invalid") return false;

  // Verify transport configuration matches if provided
  if (expectedConfig) {
    if (record.transport !== expectedConfig.transport) return false;
    if (expectedConfig.transport === TransportId.VLC && expectedConfig.vlcModulation) {
      if (record.modulation?.toLowerCase() !== expectedConfig.vlcModulation.toLowerCase()) return false;
    }
    if (expectedConfig.transport === TransportId.VisualOFDM) {
      if (expectedConfig.ofdmModulation && record.modulation?.toLowerCase() !== expectedConfig.ofdmModulation.toLowerCase()) {
        return false;
      }
      if (expectedConfig.ofdmGridSize && record.gridSize !== expectedConfig.ofdmGridSize) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Evaluates the authoritative physical validation status across a collection of records.
 * Rules:
 * - Rejects all software records, mixed records, and synthetic frames.
 * - Requires exact protocol configuration match (transport, modulation, grid).
 * - 1 successful qualifying run -> PHYSICAL_VALIDATED.
 * - >=3 independent qualifying runs -> PHYSICAL_VERIFIED.
 * - Incomplete or failed attempts -> FAILED or EXPERIMENTAL.
 */
export function evaluatePhysicalValidationStatus(
  records: any[],
  targetConfig: ProtocolConfiguration
): PhysicalValidationEvaluation {
  const issues: string[] = [];
  let rejectedSoftwareCount = 0;
  let failedRunCount = 0;
  const qualifyingMatchingRecords: PhysicalValidationRecord[] = [];

  const seenRunIds = new Set<string>();
  const seenSessionIds = new Set<string>();
  const seenSeals = new Set<string>();
  const seenTimestamps = new Set<number>();
  let duplicateRunCount = 0;

  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;

    // Strict boundary: reject software evidence
    if (raw.evidenceKind === "software" || raw.verificationType === "SOFTWARE" || raw.evidenceSource === "SYNTHETIC_SIMULATION") {
      rejectedSoftwareCount++;
      continue;
    }

    if (raw.evidenceKind !== "physical" || raw.verificationType !== "PHYSICAL") {
      rejectedSoftwareCount++;
      issues.push(`Record ${raw.recordId || raw.runId || "unknown"} rejected: non-physical evidenceKind or verificationType`);
      continue;
    }

    // Check if configuration matches target
    if (raw.transport !== targetConfig.transport) {
      continue; // Mismatched transport does not count toward this target
    }

    if (targetConfig.transport === TransportId.VLC && targetConfig.vlcModulation) {
      if (raw.modulation?.toLowerCase() !== targetConfig.vlcModulation.toLowerCase()) {
        continue;
      }
    }

    if (targetConfig.transport === TransportId.VisualOFDM) {
      if (targetConfig.ofdmModulation && raw.modulation?.toLowerCase() !== targetConfig.ofdmModulation.toLowerCase()) {
        continue;
      }
      if (targetConfig.ofdmGridSize && raw.gridSize !== targetConfig.ofdmGridSize) {
        continue;
      }
    }

    // Check for failure conditions
    if (!raw.sha256Matched || raw.crcStatus === "invalid" || !raw.reconstructionCompleted || raw.status === "FAILED") {
      failedRunCount++;
    }

    // Check qualifying status
    if (isQualifyingPhysicalValidatedRecord(raw, targetConfig)) {
      let isDuplicate = false;
      const runId = raw.runId || raw.recordId;
      const sessionId = raw.sessionId;
      const seal = raw.recordSealSha256;
      const ts = raw.timestampStart;

      if (runId && seenRunIds.has(runId)) {
        issues.push(`Duplicate run ID detected: ${runId}`);
        isDuplicate = true;
      } else if (runId) {
        seenRunIds.add(runId);
      }

      if (sessionId && seenSessionIds.has(sessionId)) {
        issues.push(`Duplicate session ID detected: ${sessionId}`);
        isDuplicate = true;
      } else if (sessionId) {
        seenSessionIds.add(sessionId);
      }

      if (seal && seenSeals.has(seal)) {
        issues.push(`Duplicate cryptographic seal digest: ${seal}`);
        isDuplicate = true;
      } else if (seal) {
        seenSeals.add(seal);
      }

      if (ts && seenTimestamps.has(ts)) {
        issues.push(`Impossible identical start timestamp: ${ts}`);
        isDuplicate = true;
      } else if (ts) {
        seenTimestamps.add(ts);
      }

      if (isDuplicate) {
        duplicateRunCount++;
      } else {
        qualifyingMatchingRecords.push(raw as PhysicalValidationRecord);
      }
    }
  }

  const independentRunCount = qualifyingMatchingRecords.length;
  const validatingRunCount = qualifyingMatchingRecords.length;

  let status: PhysicalValidationStatus = "EXPERIMENTAL";
  if (independentRunCount >= 3) {
    status = "PHYSICAL_VERIFIED";
  } else if (independentRunCount >= 1) {
    status = "PHYSICAL_VALIDATED";
  } else if (failedRunCount > 0) {
    status = "FAILED";
  } else {
    status = "EXPERIMENTAL";
  }

  return {
    targetConfig,
    status,
    totalRecordsEvaluated: records.length,
    validatingRunCount,
    independentRunCount,
    duplicateRunCount,
    failedRunCount,
    rejectedSoftwareCount,
    issues,
  };
}

/**
 * Generate a Markdown report from a collection of PhysicalValidationRecords.
 */
export function generatePhysicalValidationMarkdown(
  records: PhysicalValidationRecord[],
  evaluation?: PhysicalValidationEvaluation
): string {
  const lines: string[] = [
    "# Authoritative Physical Optical Validation Report",
    `Generated: ${new Date().toISOString()}`,
    `Total Physical Records: ${records.length}`,
    "",
  ];

  if (evaluation) {
    lines.push("## Target Status Evaluation");
    lines.push(`- **Transport**: ${evaluation.targetConfig.transport}`);
    lines.push(`- **Modulation**: ${evaluation.targetConfig.vlcModulation || evaluation.targetConfig.ofdmModulation || "N/A"}`);
    if (evaluation.targetConfig.ofdmGridSize) {
      lines.push(`- **Grid Size**: ${evaluation.targetConfig.ofdmGridSize}x${evaluation.targetConfig.ofdmGridSize}`);
    }
    lines.push(`- **Authoritative Status**: **\`${evaluation.status}\`**`);
    lines.push(`- **Independent Qualifying Runs**: ${evaluation.independentRunCount} / 3`);
    lines.push(`- **Failed Runs**: ${evaluation.failedRunCount}`);
    lines.push(`- **Rejected Non-Physical/Software Records**: ${evaluation.rejectedSoftwareCount}`);
    if (evaluation.issues.length > 0) {
      lines.push("### Audit Issues & Duplication Warnings");
      for (const issue of evaluation.issues) {
        lines.push(`- ⚠️ ${issue}`);
      }
    }
    lines.push("");
  }

  lines.push("## Physical Evidence Ledger");
  lines.push("| Run ID | Transport | Modulation | FPS | Duration | CRC | SHA-256 Match | Status | Sealed |");
  lines.push("|---|---|---|---|---|---|---|---|---|");

  for (const r of records) {
    const sealed = r.recordSealSha256 ? `✅ \`${r.recordSealSha256.slice(0, 8)}...\`` : "❌ Unsealed";
    const shaMatch = r.sha256Matched ? "✅ Matched" : "❌ Mismatch";
    lines.push(
      `| \`${r.runId}\` | ${r.transport} | ${r.modulation} | ${r.measuredFps.toFixed(1)} | ${r.durationMs}ms | ${r.crcStatus} | ${shaMatch} | \`${r.status}\` | ${sealed} |`
    );
  }

  return lines.join("\n");
}

/**
 * Export records as CSV string.
 */
export function generatePhysicalValidationCsv(records: PhysicalValidationRecord[]): string {
  const headers = [
    "runId",
    "sessionId",
    "evidenceKind",
    "verificationType",
    "status",
    "transport",
    "modulation",
    "gridSize",
    "measuredFps",
    "payloadSizeBytes",
    "durationMs",
    "validFramesCount",
    "corruptFramesCount",
    "droppedFramesCount",
    "crcStatus",
    "expectedSha256",
    "recoveredSha256",
    "sha256Matched",
    "recordSealSha256",
    "timestampStart",
    "timestampEnd",
  ];

  const rows = records.map((r) => [
    r.runId,
    r.sessionId,
    r.evidenceKind,
    r.verificationType,
    r.status,
    r.transport,
    r.modulation,
    r.gridSize ?? "",
    r.measuredFps,
    r.payloadSizeBytes,
    r.durationMs,
    r.validFramesCount,
    r.corruptFramesCount,
    r.droppedFramesCount,
    r.crcStatus,
    r.expectedSha256,
    r.recoveredSha256 ?? "",
    r.sha256Matched,
    r.recordSealSha256 ?? "",
    r.timestampStart,
    r.timestampEnd,
  ]);

  return [headers.join(","), ...rows.map((row) => row.map((val) => `"${String(val)}"`).join(","))].join("\n");
}

/**
 * Export records as JSON string.
 */
export function generatePhysicalValidationJson(
  records: PhysicalValidationRecord[],
  evaluation?: PhysicalValidationEvaluation
): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      evaluation,
      records,
    },
    null,
    2
  );
}
