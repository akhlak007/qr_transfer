/**
 * Physical Optical Evidence Aggregation & Minimum Evidence Policy (Milestone 5C)
 *
 * Implements:
 * - Strict separation between Physical and Simulated test evidence
 * - Minimum physical evidence policy: MIN_PHYSICAL_RUNS = 3, MIN_SHA256_MATCHES = 3
 * - Deterministic physical evidence aggregation (mean/median throughput, max verified distance & payload)
 * - Research status determination (PHYSICALLY_VERIFIED vs INSUFFICIENT_EVIDENCE vs EXPERIMENTAL)
 *
 * NOTE: Mathematical determinism only. Synthetic results are strictly excluded from physical aggregates.
 */

import { TransportId } from "../core/transport";
import {
  isVerifiedPhysicalRun,
  type PhysicalModulation,
  type PhysicalTestRun,
  type PhysicalTransportId,
} from "./physical-test-run";
import type { TestRun } from "./test-run";

export const MIN_PHYSICAL_RUNS = 3;
export const MIN_SHA256_MATCHES = 3;

export type PhysicalVerificationStatus =
  | "PHYSICALLY_VERIFIED"
  | "INSUFFICIENT_PHYSICAL_EVIDENCE"
  | "PHYSICAL_FAILURE_RECORDED"
  | "EXPERIMENTAL_NOT_TESTED";

export interface PhysicalEvidenceSummary {
  transport: PhysicalTransportId;
  modulation?: PhysicalModulation;
  totalPhysicalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  sha256VerifiedMatches: number;
  successRate: number; // 0.0 to 1.0
  averageThroughputBps: number | null;
  medianThroughputBps: number | null;
  maximumVerifiedDistanceCm: number | null;
  maximumVerifiedPayloadBytes: number | null;
  verificationStatus: PhysicalVerificationStatus;
  policyDetails: {
    minRunsRequired: number;
    minSha256MatchesRequired: number;
    satisfied: boolean;
  };
}

function calculateMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function calculateAverage(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return sum / numbers.length;
}

/**
 * Aggregate physical evidence for a specific optical transport and optional modulation scheme.
 */
export function aggregatePhysicalEvidence(
  runs: PhysicalTestRun[],
  transport: PhysicalTransportId,
  modulation?: PhysicalModulation
): PhysicalEvidenceSummary {
  // 1. Filter physical runs for specified transport (and modulation if provided)
  const filteredRuns = runs.filter((r) => {
    if (r.evidenceKind !== "physical") return false;
    if (r.transport !== transport) return false;
    if (modulation && r.modulation !== modulation) return false;
    return true;
  });

  const totalPhysicalRuns = filteredRuns.length;
  const successfulRuns = filteredRuns.filter((r) => r.outcome === "success" && r.sha256Matched).length;
  const failedRuns = totalPhysicalRuns - successfulRuns;
  const sha256VerifiedMatches = filteredRuns.filter((r) => r.sha256Matched).length;

  const successRate = totalPhysicalRuns > 0 ? successfulRuns / totalPhysicalRuns : 0;

  // Throughputs of successful runs
  const verifiedRuns = filteredRuns.filter(isVerifiedPhysicalRun);
  const throughputs = verifiedRuns.map((r) => (r.payloadSizeBytes / (r.durationMs / 1000.0)));
  const distances = verifiedRuns.map((r) => r.distanceCm);
  const payloads = verifiedRuns.map((r) => r.payloadSizeBytes);

  const averageThroughputBps = calculateAverage(throughputs);
  const medianThroughputBps = calculateMedian(throughputs);
  const maximumVerifiedDistanceCm = distances.length > 0 ? Math.max(...distances) : null;
  const maximumVerifiedPayloadBytes = payloads.length > 0 ? Math.max(...payloads) : null;

  // 2. Minimum Evidence Policy Evaluation
  const meetsMinRuns = totalPhysicalRuns >= MIN_PHYSICAL_RUNS;
  const meetsMinSha256 = sha256VerifiedMatches >= MIN_SHA256_MATCHES;
  const allVerifiedSuccess = successfulRuns === totalPhysicalRuns;
  const policySatisfied = meetsMinRuns && meetsMinSha256 && allVerifiedSuccess;

  let verificationStatus: PhysicalVerificationStatus;
  if (totalPhysicalRuns === 0) {
    verificationStatus = "EXPERIMENTAL_NOT_TESTED";
  } else if (policySatisfied) {
    verificationStatus = "PHYSICALLY_VERIFIED";
  } else if (failedRuns > 0) {
    verificationStatus = "PHYSICAL_FAILURE_RECORDED";
  } else {
    verificationStatus = "INSUFFICIENT_PHYSICAL_EVIDENCE";
  }

  return {
    transport,
    modulation,
    totalPhysicalRuns,
    successfulRuns,
    failedRuns,
    sha256VerifiedMatches,
    successRate,
    averageThroughputBps,
    medianThroughputBps,
    maximumVerifiedDistanceCm,
    maximumVerifiedPayloadBytes,
    verificationStatus,
    policyDetails: {
      minRunsRequired: MIN_PHYSICAL_RUNS,
      minSha256MatchesRequired: MIN_SHA256_MATCHES,
      satisfied: policySatisfied,
    },
  };
}

/**
 * Extract physical evidence from the generic TestRun ledger (adapting legacy TestRun records).
 */
export function summarizePhysicalRunsFromLedger(
  testRuns: TestRun[],
  transport: TransportId
): PhysicalEvidenceSummary {
  const physicalRuns = testRuns.filter((r) => r.evidenceKind === "physical" && r.transport === transport);
  const verifiedRuns = physicalRuns.filter((r) => r.status === "complete" && r.integrityStatus === "verified" && r.fileHashHex !== null);

  const totalRuns = physicalRuns.length;
  const successfulRuns = verifiedRuns.length;
  const failedRuns = totalRuns - successfulRuns;
  const sha256Matches = verifiedRuns.length;

  const throughputs = verifiedRuns.map((r) => r.metrics.averageThroughputBytesPerSecond);
  const distances = verifiedRuns.flatMap((r) => r.distanceCm !== null ? [r.distanceCm] : []);
  const fileSizes = verifiedRuns.map((r) => r.metrics.fileSize);

  const policySatisfied = totalRuns >= MIN_PHYSICAL_RUNS && sha256Matches >= MIN_SHA256_MATCHES && failedRuns === 0;

  let verificationStatus: PhysicalVerificationStatus;
  if (totalRuns === 0) {
    verificationStatus = "EXPERIMENTAL_NOT_TESTED";
  } else if (policySatisfied) {
    verificationStatus = "PHYSICALLY_VERIFIED";
  } else if (failedRuns > 0) {
    verificationStatus = "PHYSICAL_FAILURE_RECORDED";
  } else {
    verificationStatus = "INSUFFICIENT_PHYSICAL_EVIDENCE";
  }

  return {
    transport: transport as PhysicalTransportId,
    totalPhysicalRuns: totalRuns,
    successfulRuns,
    failedRuns,
    sha256VerifiedMatches: sha256Matches,
    successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    averageThroughputBps: calculateAverage(throughputs),
    medianThroughputBps: calculateMedian(throughputs),
    maximumVerifiedDistanceCm: distances.length > 0 ? Math.max(...distances) : null,
    maximumVerifiedPayloadBytes: fileSizes.length > 0 ? Math.max(...fileSizes) : null,
    verificationStatus,
    policyDetails: {
      minRunsRequired: MIN_PHYSICAL_RUNS,
      minSha256MatchesRequired: MIN_SHA256_MATCHES,
      satisfied: policySatisfied,
    },
  };
}
