/**
 * Physical Campaign Statistics Engine (Milestone 7F)
 *
 * Implements:
 * - Mathematical computation of physical optical performance exclusively from real hardware test runs
 * - Per-target and campaign-wide aggregations (throughput, distance, FPS, drops, stability, confidence)
 * - Safe handling of empty datasets: returns 0, null, or INSUFFICIENT_DATA without placeholder fabrication
 *
 * NOTE: For physical optical research analytics only.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import {
  PHYSICAL_EXPERIMENT_TARGETS,
  type PhysicalConfigTarget,
} from "./physical-acquisition";
import {
  calculateMean,
  calculateMedian,
  getConfidenceLevel,
  type ConfidenceLevel,
} from "./statistical-confidence";
import { calculateStabilityScore } from "./physical-analytics";

export interface TargetStatistics {
  targetId: string;
  target: PhysicalConfigTarget;
  protocol: TransportId;
  modulation: string;
  gridSize?: number;
  totalAttempts: number;
  qualifyingRuns: number;
  failedRuns: number;
  successRate: number; // 0.0 to 1.0
  crcPassRate: number; // 0.0 to 1.0
  sha256MatchRate: number; // 0.0 to 1.0
  meanThroughputKbps: number;
  medianThroughputKbps: number;
  maxThroughputKbps: number;
  meanDistanceCm: number | null;
  medianDistanceCm: number | null;
  meanCameraFps: number | null;
  meanDroppedFrames: number;
  stabilityScore: number; // 0 to 100
  confidenceLevel: ConfidenceLevel;
}

export interface GlobalCampaignStatistics {
  totalPhysicalRuns: number;
  qualifyingRuns: number;
  failedRuns: number;
  successRate: number;
  crcPassRate: number;
  sha256MatchRate: number;
  meanThroughputKbps: number;
  medianThroughputKbps: number;
  maxThroughputKbps: number;
  medianDistanceCm: number | null;
  meanCameraFps: number | null;
  totalDroppedFrames: number;
  stabilityScore: number;
  perTargetStats: TargetStatistics[];
  computedAt: number;
}

/**
 * Compute detailed statistics for a specific target configuration from physical runs.
 */
export function computeTargetStatistics(
  target: PhysicalConfigTarget,
  runs: TestRun[]
): TargetStatistics {
  const physicalRuns = runs.filter((r) => {
    if (r.evidenceKind !== "physical") return false;
    if (r.transport !== target.transport) return false;
    if (target.transport === TransportId.QR) return true;
    const matchMod = r.fileName.toLowerCase().includes(target.pattern);
    if (target.gridSize) {
      return matchMod && (r.fileName.includes(`${target.gridSize}x${target.gridSize}`) || !r.fileName.includes("x"));
    }
    return matchMod;
  });

  const total = physicalRuns.length;
  const qualifying = physicalRuns.filter(
    (r) =>
      r.status === "complete" &&
      r.integrityStatus === "verified" &&
      (r.metrics.errorRate ?? 0) === 0 &&
      !!r.fileHashHex &&
      r.fileHashHex.length === 64
  );
  const crcPassed = physicalRuns.filter((r) => (r.metrics.errorRate ?? 0) === 0);
  const failed = total - qualifying.length;

  const throughputs = qualifying.map(
    (r) => (r.metrics.averageThroughputBytesPerSecond * 8) / 1000.0
  );
  const distances = qualifying.flatMap((r) => (r.distanceCm !== null ? [r.distanceCm] : []));
  const fpsList = physicalRuns.flatMap((r) =>
    r.metrics.cameraFps !== null && r.metrics.cameraFps > 0 ? [r.metrics.cameraFps] : []
  );
  const droppedList = physicalRuns.map(
    (r) => (1.0 - (r.metrics.frameHitRate ?? 1.0)) * 30.0
  );

  const meanDrops = calculateMean(droppedList);
  const stability = calculateStabilityScore(total, qualifying.length, crcPassed.length, meanDrops);

  return {
    targetId: target.configId,
    target,
    protocol: target.transport,
    modulation: target.modulation,
    gridSize: target.gridSize,
    totalAttempts: total,
    qualifyingRuns: qualifying.length,
    failedRuns: failed,
    successRate: total > 0 ? qualifying.length / total : 0,
    crcPassRate: total > 0 ? crcPassed.length / total : 0,
    sha256MatchRate: total > 0 ? qualifying.length / total : 0,
    meanThroughputKbps: Math.round(calculateMean(throughputs) * 10) / 10,
    medianThroughputKbps: Math.round(calculateMedian(throughputs) * 10) / 10,
    maxThroughputKbps: throughputs.length > 0 ? Math.round(Math.max(...throughputs) * 10) / 10 : 0,
    meanDistanceCm: distances.length > 0 ? Math.round(calculateMean(distances) * 10) / 10 : null,
    medianDistanceCm: distances.length > 0 ? Math.round(calculateMedian(distances) * 10) / 10 : null,
    meanCameraFps: fpsList.length > 0 ? Math.round(calculateMean(fpsList) * 10) / 10 : null,
    meanDroppedFrames: Math.round(meanDrops * 10) / 10,
    stabilityScore: stability,
    confidenceLevel: getConfidenceLevel(total),
  };
}

/**
 * Compute global physical campaign statistics across all target configurations.
 */
export function computeGlobalCampaignStatistics(runs: TestRun[]): GlobalCampaignStatistics {
  // Strict filter: Exclude all synthetic data
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  const perTargetStats = PHYSICAL_EXPERIMENT_TARGETS.map((target) =>
    computeTargetStatistics(target, physicalRuns)
  );

  const total = physicalRuns.length;
  const qualifying = physicalRuns.filter(
    (r) =>
      r.status === "complete" &&
      r.integrityStatus === "verified" &&
      (r.metrics.errorRate ?? 0) === 0 &&
      !!r.fileHashHex &&
      r.fileHashHex.length === 64
  );
  const crcPassed = physicalRuns.filter((r) => (r.metrics.errorRate ?? 0) === 0);
  const failed = total - qualifying.length;

  const throughputs = qualifying.map(
    (r) => (r.metrics.averageThroughputBytesPerSecond * 8) / 1000.0
  );
  const distances = qualifying.flatMap((r) => (r.distanceCm !== null ? [r.distanceCm] : []));
  const fpsList = physicalRuns.flatMap((r) =>
    r.metrics.cameraFps !== null && r.metrics.cameraFps > 0 ? [r.metrics.cameraFps] : []
  );
  const droppedList = physicalRuns.map(
    (r) => (1.0 - (r.metrics.frameHitRate ?? 1.0)) * 30.0
  );

  const meanDrops = calculateMean(droppedList);
  const totalDropped = Math.round(droppedList.reduce((acc, v) => acc + v, 0));
  const stability = calculateStabilityScore(total, qualifying.length, crcPassed.length, meanDrops);

  return {
    totalPhysicalRuns: total,
    qualifyingRuns: qualifying.length,
    failedRuns: failed,
    successRate: total > 0 ? qualifying.length / total : 0,
    crcPassRate: total > 0 ? crcPassed.length / total : 0,
    sha256MatchRate: total > 0 ? qualifying.length / total : 0,
    meanThroughputKbps: Math.round(calculateMean(throughputs) * 10) / 10,
    medianThroughputKbps: Math.round(calculateMedian(throughputs) * 10) / 10,
    maxThroughputKbps: throughputs.length > 0 ? Math.round(Math.max(...throughputs) * 10) / 10 : 0,
    medianDistanceCm: distances.length > 0 ? Math.round(calculateMedian(distances) * 10) / 10 : null,
    meanCameraFps: fpsList.length > 0 ? Math.round(calculateMean(fpsList) * 10) / 10 : null,
    totalDroppedFrames: totalDropped,
    stabilityScore: stability,
    perTargetStats,
    computedAt: Date.now(),
  };
}
