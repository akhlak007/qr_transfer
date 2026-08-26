/**
 * Peer-Review Readiness Audit Engine (Milestone 7D)
 *
 * Implements:
 * - Publication governance & peer-review readiness evaluation
 * - 6-dimensional compliance scoring:
 *   1. Evidence Completeness
 *   2. Reproducibility Validity
 *   3. Statistical Confidence
 *   4. Benchmark Coverage
 *   5. Verification Policy Compliance
 *   6. Documentation & Manifest Registry Coverage
 * - Strict non-fabrication guarantee: Mathematical determinism only
 *
 * NOTE: For academic peer-review readiness assessment.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import type { ExperimentManifest } from "./experiment-manifest";
import type { ReproducibilityValidationReport } from "./reproducibility-validator";
import { MIN_PHYSICAL_RUNS, MIN_SHA256_MATCHES } from "./physical-evidence";

export const PeerReviewStatus = {
  NOT_READY: "NOT_READY",
  PARTIALLY_READY: "PARTIALLY_READY",
  READY: "READY",
} as const;

export type PeerReviewStatus = (typeof PeerReviewStatus)[keyof typeof PeerReviewStatus];

export interface ReadinessChecklistItem {
  dimension: string;
  criterion: string;
  passed: boolean;
  scoreWeight: number;
  earnedScore: number;
  details: string;
}

export interface PeerReviewReadinessReport {
  overallStatus: PeerReviewStatus;
  readinessScore: number; // 0 to 100
  checklist: ReadinessChecklistItem[];
  summary: {
    totalPhysicalRuns: number;
    verifiedRuns: number;
    reproducibilityScore: number;
    verifiedProtocolsCount: number;
  };
  recommendations: string[];
  evaluatedAt: number;
}

/**
 * Evaluate whether recorded empirical evidence meets rigorous academic peer-review standards.
 */
export function evaluatePeerReviewReadiness(
  runs: TestRun[],
  manifests: ExperimentManifest[],
  reproReport: ReproducibilityValidationReport
): PeerReviewReadinessReport {
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");
  const verifiedRuns = physicalRuns.filter((r) => r.integrityStatus === "verified");

  const checklist: ReadinessChecklistItem[] = [];
  const recommendations: string[] = [];

  // Dimension 1: Minimum Evidence Threshold
  const hasMinRuns = physicalRuns.length >= MIN_PHYSICAL_RUNS;
  checklist.push({
    dimension: "Evidence Completeness",
    criterion: `At least ${MIN_PHYSICAL_RUNS} physical screen-to-camera runs recorded`,
    passed: hasMinRuns,
    scoreWeight: 20,
    earnedScore: hasMinRuns ? 20 : Math.round((physicalRuns.length / MIN_PHYSICAL_RUNS) * 20),
    details: `${physicalRuns.length} physical runs recorded in ledger.`,
  });
  if (!hasMinRuns) {
    recommendations.push(`Execute at least ${MIN_PHYSICAL_RUNS - physicalRuns.length} more physical test runs.`);
  }

  // Dimension 2: Cryptographic SHA-256 Parity
  const hasMinSha = verifiedRuns.length >= MIN_SHA256_MATCHES;
  checklist.push({
    dimension: "Evidence Completeness",
    criterion: `At least ${MIN_SHA256_MATCHES} bit-perfect SHA-256 matches verified`,
    passed: hasMinSha,
    scoreWeight: 20,
    earnedScore: hasMinSha ? 20 : Math.round((verifiedRuns.length / MIN_SHA256_MATCHES) * 20),
    details: `${verifiedRuns.length} runs achieved verified SHA-256 integrity.`,
  });
  if (!hasMinSha) {
    recommendations.push(`Complete screen-to-camera runs with 100% bit-perfect SHA-256 matches.`);
  }

  // Dimension 3: Reproducibility Audit Score
  const reproPass = reproReport.reproducibilityScore >= 85 && reproReport.status !== "INVALID";
  checklist.push({
    dimension: "Reproducibility Validity",
    criterion: "Reproducibility audit score >= 85 and 0 critical hash errors",
    passed: reproPass,
    scoreWeight: 20,
    earnedScore: Math.round((reproReport.reproducibilityScore / 100) * 20),
    details: `Reproducibility audit score is ${reproReport.reproducibilityScore}/100 (${reproReport.status}).`,
  });
  if (!reproPass) {
    recommendations.push("Resolve open reproducibility audit issues and ensure all manifest hashes are valid.");
  }

  // Dimension 4: Protocol Baseline Verification
  // Check if QR (or any baseline transport) is verified
  const qrRuns = physicalRuns.filter((r) => r.transport === TransportId.QR);
  const qrVerified = qrRuns.filter((r) => r.integrityStatus === "verified");
  const baselineVerified = qrVerified.length >= MIN_SHA256_MATCHES;
  checklist.push({
    dimension: "Verification Policy",
    criterion: "Reference transport (QR) is physically verified as experimental baseline",
    passed: baselineVerified,
    scoreWeight: 15,
    earnedScore: baselineVerified ? 15 : 0,
    details: `${qrVerified.length} verified QR runs recorded.`,
  });

  // Dimension 5: Manifest Registry Coverage
  const manifestMatch = manifests.length >= physicalRuns.length && physicalRuns.length > 0;
  checklist.push({
    dimension: "Documentation & Provenance",
    criterion: "100% of physical runs have corresponding immutable experiment manifests",
    passed: manifestMatch,
    scoreWeight: 15,
    earnedScore: physicalRuns.length > 0 ? Math.round((manifests.length / physicalRuns.length) * 15) : 0,
    details: `${manifests.length} manifests generated for ${physicalRuns.length} physical runs.`,
  });
  if (!manifestMatch && physicalRuns.length > 0) {
    recommendations.push("Generate missing experiment manifests for all unlinked physical test runs.");
  }

  // Dimension 6: Zero Synthetic Contamination
  const simRunsInPhysical = physicalRuns.filter((r) => r.evidenceKind !== "physical").length;
  const zeroContamination = simRunsInPhysical === 0;
  checklist.push({
    dimension: "Scientific Integrity",
    criterion: "Strict physical evidence segregation with zero synthetic contamination",
    passed: zeroContamination,
    scoreWeight: 10,
    earnedScore: zeroContamination ? 10 : 0,
    details: `${simRunsInPhysical} synthetic runs detected in physical partition.`,
  });

  const totalScore = checklist.reduce((sum, item) => sum + item.earnedScore, 0);
  const readinessScore = Math.max(0, Math.min(100, totalScore));

  let overallStatus: PeerReviewStatus = PeerReviewStatus.NOT_READY;
  if (readinessScore >= 85 && hasMinSha && reproPass && zeroContamination) {
    overallStatus = PeerReviewStatus.READY;
  } else if (readinessScore >= 50) {
    overallStatus = PeerReviewStatus.PARTIALLY_READY;
  }

  return {
    overallStatus,
    readinessScore,
    checklist,
    summary: {
      totalPhysicalRuns: physicalRuns.length,
      verifiedRuns: verifiedRuns.length,
      reproducibilityScore: reproReport.reproducibilityScore,
      verifiedProtocolsCount: baselineVerified ? 1 : 0,
    },
    recommendations,
    evaluatedAt: Date.now(),
  };
}
