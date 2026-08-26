/**
 * Software-Only Optical Verification Policy & Engine (Milestone 8A)
 *
 * Implements:
 * - Decoupled software verification policy removing mandatory hardware-only dependency
 * - Verification Statuses:
 *   - SOFTWARE_UNIT_VERIFIED: unit/benchmark evidence only
 *   - SOFTWARE_END_TO_END_VERIFIED: complete recorded TX-to-SHA pipeline
 *   - EXPERIMENTAL: Untested or insufficient sample size (< 3 runs)
 *   - FAILED: Recorded failures or CRC/SHA-256 corruption
 * - Multi-evidence support: Evaluates synthetic benchmarks with optional physical verification
 * - Strict non-fabrication guarantee: Clearly distinguishes software vs hardware evidence
 *
 * NOTE: For optical transport software verification.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import {
  evaluateSoftwareConfidence,
  SoftwareConfidenceLevel,
  type SoftwareConfidenceProfile,
} from "./software-confidence";
import type { SoftwareOpticalIntegrationResult } from "./software-optical-integration";

export const SoftwareVerificationStatus = {
  SOFTWARE_UNIT_VERIFIED: "SOFTWARE_UNIT_VERIFIED",
  SOFTWARE_END_TO_END_VERIFIED: "SOFTWARE_END_TO_END_VERIFIED",
  EXPERIMENTAL: "EXPERIMENTAL",
  FAILED: "FAILED",
} as const;

export type SoftwareVerificationStatus =
  (typeof SoftwareVerificationStatus)[keyof typeof SoftwareVerificationStatus];

export interface ProtocolSoftwareVerification {
  protocol: TransportId;
  protocolLabel: string;
  modulation: string;
  gridSize?: number;
  totalBenchmarkRuns: number;
  syntheticRunsCount: number;
  physicalRunsCount: number;
  successfulRunsCount: number;
  failedRunsCount: number;
  crcPassRate: number; // 0.0 to 1.0
  sha256MatchRate: number; // 0.0 to 1.0
  meanThroughputKbps: number;
  medianThroughputKbps: number;
  confidence: SoftwareConfidenceProfile;
  status: SoftwareVerificationStatus;
  isSoftwareVerified: boolean;
  hasPhysicalEvidence: boolean;
}

export interface SoftwareVerificationMatrixReport {
  totalProtocolsEvaluated: number;
  verifiedProtocolsCount: number;
  validatedProtocolsCount: number;
  experimentalProtocolsCount: number;
  failedProtocolsCount: number;
  endToEndVerifiedProtocolsCount: number;
  unitVerifiedProtocolsCount: number;
  overallSoftwareReadinessPct: number;
  protocols: ProtocolSoftwareVerification[];
  evaluatedAt: number;
}

/**
 * Evaluate software verification status for a specific optical protocol and modulation.
 */
export function evaluateProtocolSoftwareVerification(
  protocol: TransportId,
  modulation: string,
  gridSize: number | undefined,
  runs: TestRun[],
  reproducibilityScore = 100,
  integrationRuns: SoftwareOpticalIntegrationResult[] = [],
): ProtocolSoftwareVerification {
  const protocolRuns = runs.filter((r) => {
    if (r.transport !== protocol) return false;
    if (protocol === TransportId.QR) return true;
    const matchMod = r.fileName.toLowerCase().includes(modulation.toLowerCase());
    if (gridSize) {
      return matchMod && (r.fileName.includes(`${gridSize}x${gridSize}`) || !r.fileName.includes("x"));
    }
    return matchMod;
  });

  const total = protocolRuns.length;
  const syntheticRuns = protocolRuns.filter((r) => r.evidenceKind === "simulated");
  const physicalRuns = protocolRuns.filter((r) => r.evidenceKind === "physical");

  const successfulRuns = protocolRuns.filter(
    (r) =>
      r.status === "complete" &&
      r.integrityStatus === "verified" &&
      (r.metrics.errorRate ?? 0) === 0 &&
      !!r.fileHashHex &&
      r.fileHashHex.length === 64
  );

  const crcPasses = protocolRuns.filter((r) => (r.metrics.errorRate ?? 0) === 0);
  const failedCount = total - successfulRuns.length;

  const throughputs = successfulRuns.map(
    (r) => (r.metrics.averageThroughputBytesPerSecond * 8) / 1000.0
  );

  const meanThroughput =
    throughputs.length > 0
      ? throughputs.reduce((a, b) => a + b, 0) / throughputs.length
      : 0;

  const sortedThroughputs = [...throughputs].sort((a, b) => a - b);
  const medianThroughput =
    sortedThroughputs.length > 0
      ? sortedThroughputs[Math.floor(sortedThroughputs.length / 2)]
      : 0;

  const crcPassRate = total > 0 ? crcPasses.length / total : 0;
  const sha256MatchRate = total > 0 ? successfulRuns.length / total : 0;

  const confidence = evaluateSoftwareConfidence(
    total,
    successfulRuns.length,
    throughputs,
    reproducibilityScore
  );

  let status: SoftwareVerificationStatus = SoftwareVerificationStatus.EXPERIMENTAL;
  const matchingIntegrationRuns = integrationRuns.filter((result) => {
    if (result.protocol !== protocol) return false;
    if (protocol === TransportId.QR) return true;
    if (!result.configuration.toLowerCase().includes(modulation.toLowerCase().replace("-", ""))) {
      const normalizedConfig = result.configuration.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedModulation = modulation.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normalizedConfig.includes(normalizedModulation)) return false;
    }
    return gridSize === undefined || result.configuration.includes(`${gridSize}x${gridSize}`);
  });
  const endToEndPass = matchingIntegrationRuns.some((result) => {
    const crcEligible = result.protocol === TransportId.QR
      ? result.crcStatus === "not-applicable"
      : result.crcStatus === "valid";
    return result.verificationType === "SOFTWARE"
    && result.channelLabel === "SOFTWARE OPTICAL CHANNEL / SIMULATION"
    && result.txSuccess && result.channelSuccess && result.rxSuccess
    && crcEligible
    && result.reconstructionSuccess && result.sha256Success
    && result.status === "SOFTWARE_END_TO_END_VERIFIED";
  });

  if (endToEndPass) {
    status = SoftwareVerificationStatus.SOFTWARE_END_TO_END_VERIFIED;
  } else if (matchingIntegrationRuns.length > 0) {
    status = SoftwareVerificationStatus.FAILED;
  } else if (total === 0) {
    status = SoftwareVerificationStatus.EXPERIMENTAL;
  } else if (failedCount > 0 && successfulRuns.length === 0) {
    status = SoftwareVerificationStatus.FAILED;
  } else if (
    successfulRuns.length >= 3 &&
    sha256MatchRate === 1.0 &&
    crcPassRate === 1.0 &&
    (confidence.level === SoftwareConfidenceLevel.HIGH ||
      confidence.level === SoftwareConfidenceLevel.VERY_HIGH)
  ) {
    status = SoftwareVerificationStatus.SOFTWARE_UNIT_VERIFIED;
  } else {
    status = SoftwareVerificationStatus.EXPERIMENTAL;
  }

  let protocolLabel = "QR Streaming";
  if (protocol === TransportId.VLC) protocolLabel = "VLC";
  else if (protocol === TransportId.VisualOFDM) protocolLabel = "Visual OFDM";

  return {
    protocol,
    protocolLabel,
    modulation,
    gridSize,
    totalBenchmarkRuns: total,
    syntheticRunsCount: syntheticRuns.length,
    physicalRunsCount: physicalRuns.length,
    successfulRunsCount: successfulRuns.length,
    failedRunsCount: failedCount,
    crcPassRate,
    sha256MatchRate,
    meanThroughputKbps: Math.round(meanThroughput * 10) / 10,
    medianThroughputKbps: Math.round(medianThroughput * 10) / 10,
    confidence,
    status,
    isSoftwareVerified: status === SoftwareVerificationStatus.SOFTWARE_UNIT_VERIFIED
      || status === SoftwareVerificationStatus.SOFTWARE_END_TO_END_VERIFIED,
    hasPhysicalEvidence: physicalRuns.length > 0,
  };
}

/**
 * Generate full software verification matrix across all optical protocols.
 */
export function evaluateSoftwareVerificationMatrix(
  runs: TestRun[],
  reproducibilityScore = 100,
  integrationRuns: SoftwareOpticalIntegrationResult[] = [],
): SoftwareVerificationMatrixReport {
  const configs: { protocol: TransportId; modulation: string; gridSize?: number }[] = [
    // QR Baseline
    { protocol: TransportId.QR, modulation: "QR Matrix" },

    // VLC Modulations
    { protocol: TransportId.VLC, modulation: "OOK" },
    { protocol: TransportId.VLC, modulation: "4-PAM" },
    { protocol: TransportId.VLC, modulation: "CSK-8" },
    { protocol: TransportId.VLC, modulation: "CSK-16" },

    // Visual OFDM Grid & Modulations
    { protocol: TransportId.VisualOFDM, modulation: "BPSK", gridSize: 8 },
    { protocol: TransportId.VisualOFDM, modulation: "BPSK", gridSize: 16 },
    { protocol: TransportId.VisualOFDM, modulation: "BPSK", gridSize: 32 },
    { protocol: TransportId.VisualOFDM, modulation: "QPSK", gridSize: 8 },
    { protocol: TransportId.VisualOFDM, modulation: "QPSK", gridSize: 16 },
    { protocol: TransportId.VisualOFDM, modulation: "QPSK", gridSize: 32 },
    { protocol: TransportId.VisualOFDM, modulation: "16-QAM", gridSize: 8 },
    { protocol: TransportId.VisualOFDM, modulation: "16-QAM", gridSize: 16 },
    { protocol: TransportId.VisualOFDM, modulation: "16-QAM", gridSize: 32 },
  ];

  const protocols = configs.map((c) =>
    evaluateProtocolSoftwareVerification(
      c.protocol,
      c.modulation,
      c.gridSize,
      runs,
      reproducibilityScore,
      integrationRuns,
    )
  );

  const verified = protocols.filter((p) => p.status === SoftwareVerificationStatus.SOFTWARE_END_TO_END_VERIFIED).length;
  const validated = protocols.filter((p) => p.status === SoftwareVerificationStatus.SOFTWARE_UNIT_VERIFIED).length;
  const experimental = protocols.filter((p) => p.status === SoftwareVerificationStatus.EXPERIMENTAL).length;
  const failed = protocols.filter((p) => p.status === SoftwareVerificationStatus.FAILED).length;

  const readinessPct =
    protocols.length > 0 ? Math.round(((verified + validated * 0.5) / protocols.length) * 100) : 0;

  return {
    totalProtocolsEvaluated: protocols.length,
    verifiedProtocolsCount: verified,
    validatedProtocolsCount: validated,
    experimentalProtocolsCount: experimental,
    failedProtocolsCount: failed,
    endToEndVerifiedProtocolsCount: verified,
    unitVerifiedProtocolsCount: validated,
    overallSoftwareReadinessPct: readinessPct,
    protocols,
    evaluatedAt: Date.now(),
  };
}
