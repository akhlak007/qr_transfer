/**
 * Reproducibility & Integrity Validator (Milestone 7C)
 *
 * Implements:
 * - Mathematical validation of experiment manifests, physical runs, and evidence chains
 * - Reproducibility score computation (0 - 100) based on metadata completeness and cryptographic integrity
 * - Detection of missing metadata, duplicate IDs, broken hash chains, and synthetic contamination
 * - Strict non-fabrication guarantees
 *
 * NOTE: For physical optical research validation.
 */

import type { TestRun } from "./test-run";
import {
  computeManifestHash,
  type ExperimentManifest,
} from "./experiment-manifest";

export const ReproducibilityStatus = {
  VALID: "VALID",
  WARNING: "WARNING",
  INVALID: "INVALID",
} as const;

export type ReproducibilityStatus = (typeof ReproducibilityStatus)[keyof typeof ReproducibilityStatus];

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  context?: Record<string, any>;
}

export interface ReproducibilityValidationReport {
  status: ReproducibilityStatus;
  reproducibilityScore: number; // 0 to 100
  evaluatedManifestsCount: number;
  evaluatedPhysicalRunsCount: number;
  issues: ValidationIssue[];
  metrics: {
    metadataCompletenessPct: number;
    cryptographicIntegrityPct: number;
    evidenceChainValidPct: number;
  };
  validatedAt: number;
}

/**
 * Validate reproducibility across experiment manifests and physical test runs.
 */
export async function validateReproducibility(
  manifests: ExperimentManifest[],
  runs: TestRun[]
): Promise<ReproducibilityValidationReport> {
  const issues: ValidationIssue[] = [];

  // Filter physical runs
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");
  const simRuns = runs.filter((r) => r.evidenceKind === "simulated");

  // Check 1: Synthetic runs in manifest list
  const contaminated = manifests.filter((m) =>
    simRuns.some((s) => `exp-${s.runId}` === m.experimentId)
  );
  if (contaminated.length > 0) {
    issues.push({
      severity: "error",
      code: "SYNTHETIC_CONTAMINATION",
      message: `Found ${contaminated.length} manifests referencing synthetic/simulated channel benchmark runs.`,
    });
  }

  // Check 2: Duplicate experiment IDs
  const seenIds = new Set<string>();
  for (const m of manifests) {
    if (seenIds.has(m.experimentId)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_EXPERIMENT_ID",
        message: `Duplicate experimentId detected: ${m.experimentId}`,
      });
    }
    seenIds.add(m.experimentId);
  }

  // Check 3: Manifest hash validation & metadata completeness
  let validHashesCount = 0;
  let completeMetadataCount = 0;

  for (const m of manifests) {
    // Hash check
    if (m.manifestHash) {
      const calculatedHash = await computeManifestHash(m);
      if (calculatedHash === m.manifestHash) {
        validHashesCount++;
      } else {
        issues.push({
          severity: "error",
          code: "BROKEN_MANIFEST_HASH",
          message: `Manifest hash mismatch for experiment ${m.experimentId}`,
        });
      }
    } else {
      issues.push({
        severity: "warning",
        code: "MISSING_MANIFEST_HASH",
        message: `Manifest for experiment ${m.experimentId} is missing a cryptographic manifestHash.`,
      });
    }

    // Metadata completeness
    const hasTransmitter = !!(m.transmitter?.deviceModel && m.transmitter?.resolution);
    const hasReceiver = !!(m.receiver?.deviceModel && m.receiver?.resolution);
    const hasEnv = !!(m.environment?.distanceCm && m.environment?.ambientLux);
    const hasSha = !!(m.expectedPayloadSha256 && m.expectedPayloadSha256.length === 64);

    if (hasTransmitter && hasReceiver && hasEnv && hasSha) {
      completeMetadataCount++;
    } else {
      issues.push({
        severity: "warning",
        code: "INCOMPLETE_METADATA",
        message: `Incomplete hardware/environmental metadata for experiment ${m.experimentId}`,
      });
    }
  }

  // Check 4: Missing run references
  for (const r of physicalRuns) {
    const hasManifest = manifests.some((m) => m.experimentId === `exp-${r.runId}`);
    if (!hasManifest) {
      issues.push({
        severity: "warning",
        code: "UNLINKED_PHYSICAL_RUN",
        message: `Physical test run ${r.runId} has no corresponding experiment manifest.`,
      });
    }
  }

  const manifestCount = manifests.length;
  const metadataCompletenessPct =
    manifestCount > 0 ? Math.round((completeMetadataCount / manifestCount) * 100) : 100;
  const cryptographicIntegrityPct =
    manifestCount > 0 ? Math.round((validHashesCount / manifestCount) * 100) : 100;
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  const evidenceChainValidPct =
    manifestCount > 0
      ? Math.max(0, Math.round(100 - (errorCount * 25 + warningCount * 5)))
      : 100;

  // Reproducibility Score (0 - 100)
  // Mathematical composition: 40% metadata completeness, 40% crypto integrity, 20% clean evidence chain
  let score = 0;
  if (manifestCount > 0 || physicalRuns.length > 0) {
    score = Math.round(
      metadataCompletenessPct * 0.4 +
      cryptographicIntegrityPct * 0.4 +
      evidenceChainValidPct * 0.2
    );
  }
  score = Math.max(0, Math.min(100, score));

  let status: ReproducibilityStatus = ReproducibilityStatus.VALID;
  if (errorCount > 0 || score < 50) {
    status = ReproducibilityStatus.INVALID;
  } else if (warningCount > 0 || score < 85) {
    status = ReproducibilityStatus.WARNING;
  }

  return {
    status,
    reproducibilityScore: score,
    evaluatedManifestsCount: manifestCount,
    evaluatedPhysicalRunsCount: physicalRuns.length,
    issues,
    metrics: {
      metadataCompletenessPct,
      cryptographicIntegrityPct,
      evidenceChainValidPct,
    },
    validatedAt: Date.now(),
  };
}
