/**
 * Software Verification Confidence Engine (Milestone 8A)
 *
 * Implements:
 * - Statistical confidence evaluation for software simulation and benchmark trials
 * - Multi-factor confidence scoring:
 *   1. Sample Size (N >= 10 for HIGH, N >= 30 for VERY_HIGH)
 *   2. Success Rate (Bit-perfect SHA-256 + CRC pass rate)
 *   3. Throughput Dispersion (Coefficient of Variation)
 *   4. Reproducibility Audit Score (Manifest & checksum validity)
 *
 * NOTE: For software-only optical verification assessment.
 */

import { calculateMean, calculateStandardDeviation } from "./statistical-confidence";

export const SoftwareConfidenceLevel = {
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  VERY_HIGH: "VERY_HIGH",
} as const;

export type SoftwareConfidenceLevel =
  (typeof SoftwareConfidenceLevel)[keyof typeof SoftwareConfidenceLevel];

export interface SoftwareConfidenceProfile {
  sampleSize: number;
  successRate: number; // 0.0 to 1.0
  throughputStabilityPct: number; // 0 to 100
  reproducibilityScore: number; // 0 to 100
  coefficientOfVariation: number;
  level: SoftwareConfidenceLevel;
  confidenceScore: number; // 0 to 100
  reasoning: string;
}

/**
 * Compute multi-dimensional software verification confidence profile.
 */
export function evaluateSoftwareConfidence(
  sampleSize: number,
  successfulRuns: number,
  throughputsKbps: number[],
  reproducibilityScore = 100
): SoftwareConfidenceProfile {
  if (sampleSize === 0) {
    return {
      sampleSize: 0,
      successRate: 0,
      throughputStabilityPct: 0,
      reproducibilityScore: 0,
      coefficientOfVariation: 0,
      level: SoftwareConfidenceLevel.LOW,
      confidenceScore: 0,
      reasoning: "No benchmark or simulation runs recorded.",
    };
  }

  const successRate = successfulRuns / sampleSize;

  // Dispersion calculation
  let cv = 0;
  let stabilityPct = 100;
  if (throughputsKbps.length >= 2) {
    const mean = calculateMean(throughputsKbps);
    const stdDev = calculateStandardDeviation(throughputsKbps);
    if (mean > 0) {
      cv = stdDev / mean;
      stabilityPct = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, cv)) * 100)));
    }
  }

  // Weightings: Sample Size (30%), Success Rate (40%), Stability (15%), Reproducibility (15%)
  let sampleScore = 0;
  if (sampleSize >= 30) sampleScore = 100;
  else if (sampleSize >= 10) sampleScore = 80;
  else if (sampleSize >= 3) sampleScore = 50;
  else sampleScore = 20;

  const totalScore = Math.round(
    sampleScore * 0.3 +
      successRate * 100 * 0.4 +
      stabilityPct * 0.15 +
      reproducibilityScore * 0.15
  );

  const confidenceScore = Math.max(0, Math.min(100, totalScore));

  let level: SoftwareConfidenceLevel = SoftwareConfidenceLevel.LOW;
  let reasoning = "";

  if (sampleSize >= 30 && successRate === 1.0 && reproducibilityScore >= 90) {
    level = SoftwareConfidenceLevel.VERY_HIGH;
    reasoning = `Very high confidence: Robust sample size (N=${sampleSize}), 100% success rate, and valid reproducibility audit (${reproducibilityScore}/100).`;
  } else if (sampleSize >= 10 && successRate >= 0.95 && reproducibilityScore >= 80) {
    level = SoftwareConfidenceLevel.HIGH;
    reasoning = `High confidence: Significant benchmark sample (N=${sampleSize}) with ${(successRate * 100).toFixed(1)}% success rate.`;
  } else if (sampleSize >= 3 && successRate >= 0.8) {
    level = SoftwareConfidenceLevel.MODERATE;
    reasoning = `Moderate confidence: Minimum sample size achieved (N=${sampleSize}) with consistent success.`;
  } else {
    level = SoftwareConfidenceLevel.LOW;
    reasoning = `Low confidence: Insufficient sample size (N=${sampleSize}) or degraded success rate.`;
  }

  return {
    sampleSize,
    successRate,
    throughputStabilityPct: stabilityPct,
    reproducibilityScore,
    coefficientOfVariation: Math.round(cv * 1000) / 1000,
    level,
    confidenceScore,
    reasoning,
  };
}
