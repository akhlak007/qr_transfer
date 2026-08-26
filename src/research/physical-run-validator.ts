/**
 * Centralized Physical Run Validation Engine (Milestone 7F)
 *
 * Implements:
 * - Rigorous compliance verification for physical screen-to-camera test runs
 * - Automatic rejection of synthetic/simulated data, fake hashes, and invalid telemetry
 * - Computation of an objective evidence score (0 - 100)
 *
 * NOTE: For physical optical research integrity.
 */

import type { TestRun } from "./test-run";
import type { ExperimentManifest } from "./experiment-manifest";

export interface PhysicalRunValidationResult {
  valid: boolean;
  qualifying: boolean;
  errors: string[];
  warnings: string[];
  evidenceScore: number;
  validationTimestamp: string;
}

/**
 * Validate a recorded test run against all physical qualification invariants.
 */
export function validatePhysicalRun(
  run: TestRun,
  manifest?: ExperimentManifest
): PhysicalRunValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Physical partition invariant
  if (run.evidenceKind !== "physical") {
    errors.push("CRITICAL: Run is classified as synthetic/simulated, not physical screen-to-camera capture.");
  }

  // 2. Lifecycle status check
  if (run.status !== "complete") {
    errors.push(`Lifecycle status is '${run.status}', expected 'complete'.`);
  }

  // 3. Cryptographic integrity check
  if (run.integrityStatus !== "verified") {
    errors.push(`Integrity status is '${run.integrityStatus}', expected 'verified'.`);
  }

  if (!run.fileHashHex || run.fileHashHex.length !== 64) {
    errors.push("Missing or invalid 64-character SHA-256 payload digest.");
  }

  // 4. Check for recorded failure notes
  const notesLower = (run.notes ?? "").toLowerCase();
  const failureKeywords = ["fail", "timeout", "error", "mismatch", "corrupt", "denied", "abort", "cancel"];
  if (failureKeywords.some((k) => notesLower.includes(k) && !notesLower.includes("passed") && !notesLower.includes("0 error"))) {
    errors.push(`Run records a failure condition in notes: '${run.notes}'.`);
  }

  // 5. CRC-16 Checksum check
  if ((run.metrics.errorRate ?? 0) > 0) {
    errors.push(`CRC-16 error rate is ${run.metrics.errorRate}, expected 0.0 for bit-perfect transmission.`);
  }

  // 6. Transmission duration check
  if (run.metrics.elapsedMs <= 0) {
    errors.push(`Invalid transmission duration: ${run.metrics.elapsedMs} ms (must be > 0).`);
  }

  // 7. Camera telemetry check
  if (run.metrics.cameraFps === null || run.metrics.cameraFps <= 0) {
    errors.push("Missing or invalid real camera FPS telemetry.");
  }

  // 8. Distance check
  if (run.distanceCm === null || run.distanceCm <= 0) {
    errors.push("Missing or non-positive physical optical throw distance (distanceCm).");
  }

  // 9. Hardware & environmental metadata
  if (!run.sender?.deviceName || !run.receiver?.deviceName) {
    warnings.push("Incomplete sender/receiver device metadata.");
  }

  if (!run.environment) {
    warnings.push("Missing ambient lighting environment classification.");
  }

  // 10. Manifest correlation check
  if (manifest) {
    if (manifest.expectedPayloadSha256 !== run.fileHashHex) {
      errors.push("Cryptographic mismatch between Experiment Manifest SHA-256 and TestRun digest.");
    }
  }

  const qualifying = errors.length === 0;
  const valid = errors.length === 0 && run.evidenceKind === "physical";

  let evidenceScore = 100;
  evidenceScore -= errors.length * 30;
  evidenceScore -= warnings.length * 10;
  evidenceScore = Math.max(0, Math.min(100, evidenceScore));

  return {
    valid,
    qualifying,
    errors,
    warnings,
    evidenceScore,
    validationTimestamp: new Date().toISOString(),
  };
}
