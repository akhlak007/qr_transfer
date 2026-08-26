/**
 * Comparative Optical Benchmark Engine (Milestone 7B)
 *
 * Implements:
 * - Side-by-side performance characterization across QR, VLC, and Visual OFDM
 * - Throughput, reliability, optical throw distance, and frame stability comparisons
 * - Multi-criteria ranking algorithms (Throughput, Reliability, Distance, Robustness)
 * - Strict exclusion of synthetic channel data from physical benchmark profiles
 *
 * NOTE: Mathematical determinism only. Zero synthetic contamination.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import type { PhysicalVerificationStatus } from "./physical-evidence";
import { MIN_PHYSICAL_RUNS, MIN_SHA256_MATCHES } from "./physical-evidence";
import {
  computeStatisticalSummary,
  getConfidenceLevel,
  type ConfidenceLevel,
  type StatisticalMetricSummary,
} from "./statistical-confidence";
import { calculateStabilityScore } from "./physical-analytics";

export interface TransportBenchmarkProfile {
  transport: TransportId;
  totalPhysicalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number; // 0.0 to 1.0
  crcPassRate: number; // 0.0 to 1.0
  sha256VerificationRate: number; // 0.0 to 1.0
  avgCompletionTimeMs: number;
  avgDistanceCm: number | null;
  maxDistanceCm: number | null;
  avgCameraFps: number | null;
  droppedFramePercentage: number;
  stabilityScore: number; // 0 to 100
  throughputBps: StatisticalMetricSummary;
  throughputKbps: StatisticalMetricSummary;
  confidenceLevel: ConfidenceLevel;
  verificationStatus: PhysicalVerificationStatus;
}

export interface BenchmarkRankings {
  highestThroughput: TransportId[];
  bestReliability: TransportId[];
  bestDistance: TransportId[];
  bestOpticalRobustness: TransportId[];
}

export interface ComparativeBenchmarkReport {
  profiles: Record<TransportId, TransportBenchmarkProfile>;
  rankings: BenchmarkRankings;
  evaluatedPhysicalRunsCount: number;
  generatedAt: number;
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((acc, v) => acc + v, 0) / numbers.length;
}

/**
 * Generate a single transport benchmark profile from physical test runs.
 */
export function generateTransportBenchmarkProfile(
  physicalRuns: TestRun[],
  transport: TransportId
): TransportBenchmarkProfile {
  const transRuns = physicalRuns.filter((r) => r.transport === transport && r.evidenceKind === "physical");

  const totalRuns = transRuns.length;
  const verifiedRuns = transRuns.filter((r) => r.status === "complete" && r.integrityStatus === "verified");
  const crcPassedRuns = transRuns.filter((r) => r.metrics.errorRate === 0);

  const successfulRuns = verifiedRuns.length;
  const failedRuns = totalRuns - successfulRuns;

  const throughputsBps = verifiedRuns.map(
    (r) => (r.metrics.averageThroughputBytesPerSecond * 8)
  );
  const throughputsKbps = throughputsBps.map((bps) => bps / 1000.0);

  const durations = verifiedRuns.map((r) => r.metrics.elapsedMs);
  const distances = verifiedRuns.flatMap((r) => (r.distanceCm !== null ? [r.distanceCm] : []));
  const fpsList = transRuns.flatMap((r) =>
    r.metrics.cameraFps !== null && r.metrics.cameraFps > 0 ? [r.metrics.cameraFps] : []
  );

  const hitRates = transRuns.flatMap((r) =>
    r.metrics.frameHitRate !== null ? [r.metrics.frameHitRate] : []
  );
  const avgHitRate = hitRates.length > 0 ? calculateAverage(hitRates) : 1.0;
  const droppedFramePct = Math.max(0, Math.min(100, Math.round((1.0 - avgHitRate) * 1000) / 10));

  const avgDroppedCount = (1.0 - avgHitRate) * 30.0;
  const stability = calculateStabilityScore(totalRuns, successfulRuns, crcPassedRuns.length, avgDroppedCount);

  let status: PhysicalVerificationStatus = "EXPERIMENTAL_NOT_TESTED";
  if (totalRuns === 0) {
    status = "EXPERIMENTAL_NOT_TESTED";
  } else if (totalRuns >= MIN_PHYSICAL_RUNS && successfulRuns >= MIN_SHA256_MATCHES && failedRuns === 0) {
    status = "PHYSICALLY_VERIFIED";
  } else if (failedRuns > 0) {
    status = "PHYSICAL_FAILURE_RECORDED";
  } else {
    status = "INSUFFICIENT_PHYSICAL_EVIDENCE";
  }

  return {
    transport,
    totalPhysicalRuns: totalRuns,
    successfulRuns,
    failedRuns,
    successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    crcPassRate: totalRuns > 0 ? crcPassedRuns.length / totalRuns : 0,
    sha256VerificationRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    avgCompletionTimeMs: Math.round(calculateAverage(durations)),
    avgDistanceCm: distances.length > 0 ? Math.round(calculateAverage(distances) * 10) / 10 : null,
    maxDistanceCm: distances.length > 0 ? Math.max(...distances) : null,
    avgCameraFps: fpsList.length > 0 ? Math.round(calculateAverage(fpsList) * 10) / 10 : null,
    droppedFramePercentage: droppedFramePct,
    stabilityScore: stability,
    throughputBps: computeStatisticalSummary(throughputsBps),
    throughputKbps: computeStatisticalSummary(throughputsKbps),
    confidenceLevel: getConfidenceLevel(totalRuns),
    verificationStatus: status,
  };
}

/**
 * Compare all physical optical transports side-by-side with statistical rigor.
 */
export function comparePhysicalTransportBenchmarks(runs: TestRun[]): ComparativeBenchmarkReport {
  // Strict filter: Physical runs only
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  const qrProfile = generateTransportBenchmarkProfile(physicalRuns, TransportId.QR);
  const vlcProfile = generateTransportBenchmarkProfile(physicalRuns, TransportId.VLC);
  const ofdmProfile = generateTransportBenchmarkProfile(physicalRuns, TransportId.VisualOFDM);

  const profiles: Record<TransportId, TransportBenchmarkProfile> = {
    [TransportId.QR]: qrProfile,
    [TransportId.VLC]: vlcProfile,
    [TransportId.VisualOFDM]: ofdmProfile,
  };

  const transportList: TransportId[] = [TransportId.QR, TransportId.VLC, TransportId.VisualOFDM];

  // 1. Throughput Ranking (Median Throughput Kbps)
  const highestThroughput = [...transportList].sort(
    (a, b) => profiles[b].throughputKbps.median - profiles[a].throughputKbps.median
  );

  // 2. Reliability Ranking (Success Rate * SHA Match Rate)
  const bestReliability = [...transportList].sort(
    (a, b) =>
      profiles[b].successRate * profiles[b].sha256VerificationRate -
      profiles[a].successRate * profiles[a].sha256VerificationRate
  );

  // 3. Distance Ranking (Max Verified Distance Cm)
  const bestDistance = [...transportList].sort(
    (a, b) => (profiles[b].maxDistanceCm ?? 0) - (profiles[a].maxDistanceCm ?? 0)
  );

  // 4. Optical Robustness Ranking (Stability Score)
  const bestOpticalRobustness = [...transportList].sort(
    (a, b) => profiles[b].stabilityScore - profiles[a].stabilityScore
  );

  return {
    profiles,
    rankings: {
      highestThroughput,
      bestReliability,
      bestDistance,
      bestOpticalRobustness,
    },
    evaluatedPhysicalRunsCount: physicalRuns.length,
    generatedAt: Date.now(),
  };
}
