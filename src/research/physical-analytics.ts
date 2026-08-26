/**
 * Physical Optical Performance Analytics Engine (Milestone 7A)
 *
 * Implements:
 * - Mathematical aggregation and statistical characterization of physical optical test runs
 * - Modulation-specific performance breakdown (VLC: OOK, 4-PAM, CSK-8, CSK-16; OFDM: BPSK, QPSK, 16-QAM)
 * - Distance-performance curves and binning (5cm .. 50cm)
 * - Environmental correlation analysis (ambient lux, camera FPS, exposure mode)
 * - Structured failure categorization and stability scoring
 * - Strict exclusion of synthetic channel benchmarks
 *
 * NOTE: Mathematical determinism only. Zero synthetic contamination.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import type { PhysicalVerificationStatus } from "./physical-evidence";
import { MIN_PHYSICAL_RUNS, MIN_SHA256_MATCHES } from "./physical-evidence";

export interface ModulationPerformanceStats {
  transport: TransportId;
  modulation: string;
  gridSize?: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number; // 0.0 to 1.0
  crcPassRate: number; // 0.0 to 1.0
  sha256MatchRate: number; // 0.0 to 1.0
  avgThroughputKbps: number;
  medianThroughputKbps: number;
  maxThroughputKbps: number;
  maxVerifiedDistanceCm: number | null;
  avgCameraFps: number | null;
  avgDroppedFrames: number;
  stabilityScore: number; // 0 to 100
  verificationStatus: PhysicalVerificationStatus;
}

export interface DistanceBinStats {
  distanceRangeLabel: string;
  minDistanceCm: number;
  maxDistanceCm: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  avgThroughputKbps: number;
}

export interface FailureBreakdown {
  syncFailures: number;
  crcFailures: number;
  sha256Mismatches: number;
  cameraFailures: number;
  exposureFailures: number;
  contrastFailures: number;
  userCancellations: number;
  otherFailures: number;
  totalFailures: number;
}

export interface EnvironmentalCorrelationStats {
  ambientLuxBins: {
    darkCount: number; // < 50 lux
    darkSuccessRate: number;
    normalCount: number; // 50 .. 400 lux
    normalSuccessRate: number;
    brightCount: number; // > 400 lux
    brightSuccessRate: number;
  };
  fpsCorrelation: {
    highFpsCount: number; // >= 30 fps
    highFpsSuccessRate: number;
    lowFpsCount: number; // < 30 fps
    lowFpsSuccessRate: number;
  };
  exposureLockCorrelation: {
    lockedCount: number;
    lockedSuccessRate: number;
    autoCount: number;
    autoSuccessRate: number;
  };
}

export interface PhysicalAnalyticsReport {
  totalPhysicalRuns: number;
  totalSuccessfulRuns: number;
  totalFailedRuns: number;
  overallSuccessRate: number;
  overallCrcPassRate: number;
  overallSha256MatchRate: number;
  avgThroughputKbps: number;
  medianThroughputKbps: number;
  bestThroughputKbps: number;
  maxVerifiedDistanceCm: number | null;
  avgCameraFps: number | null;
  totalDroppedFrames: number;
  modulations: ModulationPerformanceStats[];
  distanceBins: DistanceBinStats[];
  failureBreakdown: FailureBreakdown;
  environmental: EnvironmentalCorrelationStats;
  generatedAt: number;
}

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, v) => acc + v, 0);
  return sum / numbers.length;
}

/**
 * Compute the stability score (0..100) based on success rate, CRC rate, and frame drop rate.
 */
export function calculateStabilityScore(
  totalRuns: number,
  successfulRuns: number,
  crcPassedRuns: number,
  avgDroppedFrames: number
): number {
  if (totalRuns === 0) return 0;
  const successRatio = successfulRuns / totalRuns;
  const crcRatio = crcPassedRuns / totalRuns;
  const dropPenalty = Math.min(0.3, (avgDroppedFrames / 30.0) * 0.3);

  const rawScore = (successRatio * 0.6 + crcRatio * 0.4 - dropPenalty) * 100;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

/**
 * Extract and analyze physical optical evidence from the test run ledger.
 */
export function analyzePhysicalEvidence(runs: TestRun[]): PhysicalAnalyticsReport {
  // 1. Strict filter: Exclude all synthetic/simulated channel benchmarks
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  const totalRuns = physicalRuns.length;
  const verifiedRuns = physicalRuns.filter(
    (r) => r.status === "complete" && r.integrityStatus === "verified"
  );
  const crcPassedRuns = physicalRuns.filter((r) => r.metrics.errorRate === 0);

  const successfulRuns = verifiedRuns.length;
  const failedRuns = totalRuns - successfulRuns;

  const throughputsKbps = verifiedRuns.map(
    (r) => (r.metrics.averageThroughputBytesPerSecond * 8) / 1000.0
  );
  const distances = verifiedRuns.flatMap((r) => (r.distanceCm !== null ? [r.distanceCm] : []));
  const fpsList = physicalRuns.flatMap((r) =>
    r.metrics.cameraFps !== null && r.metrics.cameraFps > 0 ? [r.metrics.cameraFps] : []
  );
  const droppedList = physicalRuns.map((r) => r.metrics.frameHitRate !== null ? Math.round((1 - r.metrics.frameHitRate) * 30) : 0);

  // 2. Modulation performance breakdown
  const modulationsToInspect: Array<{ transport: TransportId; key: string; label: string; grid?: number }> = [
    { transport: TransportId.VLC, key: "ook", label: "OOK" },
    { transport: TransportId.VLC, key: "pam4", label: "4-PAM" },
    { transport: TransportId.VLC, key: "csk8", label: "CSK-8" },
    { transport: TransportId.VLC, key: "csk16", label: "CSK-16" },
    { transport: TransportId.VisualOFDM, key: "bpsk", label: "BPSK", grid: 8 },
    { transport: TransportId.VisualOFDM, key: "qpsk", label: "QPSK", grid: 8 },
    { transport: TransportId.VisualOFDM, key: "16qam", label: "16-QAM", grid: 8 },
  ];

  const modStats: ModulationPerformanceStats[] = modulationsToInspect.map((m) => {
    const modRuns = physicalRuns.filter(
      (r) => r.transport === m.transport && r.fileName.toLowerCase().includes(m.key)
    );
    const modVerified = modRuns.filter((r) => r.integrityStatus === "verified");
    const modCrc = modRuns.filter((r) => r.metrics.errorRate === 0);
    const modThroughputs = modVerified.map(
      (r) => (r.metrics.averageThroughputBytesPerSecond * 8) / 1000.0
    );
    const modDistances = modVerified.flatMap((r) => (r.distanceCm !== null ? [r.distanceCm] : []));
    const modFps = modRuns.flatMap((r) =>
      r.metrics.cameraFps !== null && r.metrics.cameraFps > 0 ? [r.metrics.cameraFps] : []
    );
    const modDropped = modRuns.map((r) => (1 - (r.metrics.frameHitRate ?? 1.0)) * 30);
    const avgDrops = calculateAverage(modDropped);

    const mTotal = modRuns.length;
    const mSuccess = modVerified.length;
    const mFail = mTotal - mSuccess;

    let status: PhysicalVerificationStatus = "EXPERIMENTAL_NOT_TESTED";
    if (mTotal === 0) {
      status = "EXPERIMENTAL_NOT_TESTED";
    } else if (mTotal >= MIN_PHYSICAL_RUNS && mSuccess >= MIN_SHA256_MATCHES && mFail === 0) {
      status = "PHYSICALLY_VERIFIED";
    } else if (mFail > 0) {
      status = "PHYSICAL_FAILURE_RECORDED";
    } else {
      status = "INSUFFICIENT_PHYSICAL_EVIDENCE";
    }

    return {
      transport: m.transport,
      modulation: m.label,
      gridSize: m.grid,
      totalRuns: mTotal,
      successfulRuns: mSuccess,
      failedRuns: mFail,
      successRate: mTotal > 0 ? mSuccess / mTotal : 0,
      crcPassRate: mTotal > 0 ? modCrc.length / mTotal : 0,
      sha256MatchRate: mTotal > 0 ? mSuccess / mTotal : 0,
      avgThroughputKbps: Math.round(calculateAverage(modThroughputs) * 10) / 10,
      medianThroughputKbps: Math.round(calculateMedian(modThroughputs) * 10) / 10,
      maxThroughputKbps: modThroughputs.length > 0 ? Math.round(Math.max(...modThroughputs) * 10) / 10 : 0,
      maxVerifiedDistanceCm: modDistances.length > 0 ? Math.max(...modDistances) : null,
      avgCameraFps: modFps.length > 0 ? Math.round(calculateAverage(modFps) * 10) / 10 : null,
      avgDroppedFrames: Math.round(avgDrops * 10) / 10,
      stabilityScore: calculateStabilityScore(mTotal, mSuccess, modCrc.length, avgDrops),
      verificationStatus: status,
    };
  });

  // 3. Distance binning characterization
  const distanceBinsDef = [
    { label: "Close (5 - 15 cm)", min: 5, max: 15 },
    { label: "Mid-Range (16 - 30 cm)", min: 16, max: 30 },
    { label: "Far-Range (31 - 50 cm)", min: 31, max: 50 },
    { label: "Extended (> 50 cm)", min: 51, max: 500 },
  ];

  const distanceBins: DistanceBinStats[] = distanceBinsDef.map((bin) => {
    const binRuns = physicalRuns.filter(
      (r) => r.distanceCm !== null && r.distanceCm >= bin.min && r.distanceCm <= bin.max
    );
    const binSuccess = binRuns.filter((r) => r.integrityStatus === "verified");
    const binThroughputs = binSuccess.map(
      (r) => (r.metrics.averageThroughputBytesPerSecond * 8) / 1000.0
    );

    return {
      distanceRangeLabel: bin.label,
      minDistanceCm: bin.min,
      maxDistanceCm: bin.max,
      totalRuns: binRuns.length,
      successfulRuns: binSuccess.length,
      failedRuns: binRuns.length - binSuccess.length,
      successRate: binRuns.length > 0 ? binSuccess.length / binRuns.length : 0,
      avgThroughputKbps: Math.round(calculateAverage(binThroughputs) * 10) / 10,
    };
  });

  // 4. Failure breakdown
  const failures = physicalRuns.filter((r) => r.integrityStatus !== "verified");
  const failureBreakdown: FailureBreakdown = {
    syncFailures: failures.filter((r) => (r.notes ?? "").toLowerCase().includes("sync")).length,
    crcFailures: failures.filter((r) => (r.metrics.errorRate ?? 0) > 0 || (r.notes ?? "").toLowerCase().includes("crc")).length,
    sha256Mismatches: failures.filter((r) => (r.notes ?? "").toLowerCase().includes("sha256") || (r.notes ?? "").toLowerCase().includes("mismatch")).length,
    cameraFailures: failures.filter((r) => (r.notes ?? "").toLowerCase().includes("camera")).length,
    exposureFailures: failures.filter((r) => (r.notes ?? "").toLowerCase().includes("exposure")).length,
    contrastFailures: failures.filter((r) => (r.notes ?? "").toLowerCase().includes("contrast") || (r.notes ?? "").toLowerCase().includes("dynamic range")).length,
    userCancellations: failures.filter((r) => (r.notes ?? "").toLowerCase().includes("cancel")).length,
    otherFailures: 0,
    totalFailures: failures.length,
  };
  const categorizedSum =
    failureBreakdown.syncFailures +
    failureBreakdown.crcFailures +
    failureBreakdown.sha256Mismatches +
    failureBreakdown.cameraFailures +
    failureBreakdown.exposureFailures +
    failureBreakdown.contrastFailures +
    failureBreakdown.userCancellations;
  failureBreakdown.otherFailures = Math.max(0, failureBreakdown.totalFailures - categorizedSum);

  // 5. Environmental correlation
  const darkRuns = physicalRuns.filter((r) => r.environment === "dark");
  const normalRuns = physicalRuns.filter((r) => r.environment === "normal");
  const brightRuns = physicalRuns.filter((r) => r.environment === "bright");

  const highFpsRuns = physicalRuns.filter((r) => (r.metrics.cameraFps ?? 0) >= 30);
  const lowFpsRuns = physicalRuns.filter((r) => (r.metrics.cameraFps ?? 0) > 0 && (r.metrics.cameraFps ?? 0) < 30);

  const lockedRuns = physicalRuns.filter((r) => (r.notes ?? "").toLowerCase().includes("locked"));
  const autoRuns = physicalRuns.filter((r) => !(r.notes ?? "").toLowerCase().includes("locked"));

  const environmental: EnvironmentalCorrelationStats = {
    ambientLuxBins: {
      darkCount: darkRuns.length,
      darkSuccessRate: darkRuns.length > 0 ? darkRuns.filter((r) => r.integrityStatus === "verified").length / darkRuns.length : 0,
      normalCount: normalRuns.length,
      normalSuccessRate: normalRuns.length > 0 ? normalRuns.filter((r) => r.integrityStatus === "verified").length / normalRuns.length : 0,
      brightCount: brightRuns.length,
      brightSuccessRate: brightRuns.length > 0 ? brightRuns.filter((r) => r.integrityStatus === "verified").length / brightRuns.length : 0,
    },
    fpsCorrelation: {
      highFpsCount: highFpsRuns.length,
      highFpsSuccessRate: highFpsRuns.length > 0 ? highFpsRuns.filter((r) => r.integrityStatus === "verified").length / highFpsRuns.length : 0,
      lowFpsCount: lowFpsRuns.length,
      lowFpsSuccessRate: lowFpsRuns.length > 0 ? lowFpsRuns.filter((r) => r.integrityStatus === "verified").length / lowFpsRuns.length : 0,
    },
    exposureLockCorrelation: {
      lockedCount: lockedRuns.length,
      lockedSuccessRate: lockedRuns.length > 0 ? lockedRuns.filter((r) => r.integrityStatus === "verified").length / lockedRuns.length : 0,
      autoCount: autoRuns.length,
      autoSuccessRate: autoRuns.length > 0 ? autoRuns.filter((r) => r.integrityStatus === "verified").length / autoRuns.length : 0,
    },
  };

  return {
    totalPhysicalRuns: totalRuns,
    totalSuccessfulRuns: successfulRuns,
    totalFailedRuns: failedRuns,
    overallSuccessRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    overallCrcPassRate: totalRuns > 0 ? crcPassedRuns.length / totalRuns : 0,
    overallSha256MatchRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    avgThroughputKbps: Math.round(calculateAverage(throughputsKbps) * 10) / 10,
    medianThroughputKbps: Math.round(calculateMedian(throughputsKbps) * 10) / 10,
    bestThroughputKbps: throughputsKbps.length > 0 ? Math.round(Math.max(...throughputsKbps) * 10) / 10 : 0,
    maxVerifiedDistanceCm: distances.length > 0 ? Math.max(...distances) : null,
    avgCameraFps: fpsList.length > 0 ? Math.round(calculateAverage(fpsList) * 10) / 10 : null,
    totalDroppedFrames: droppedList.reduce((a, b) => a + b, 0),
    modulations: modStats,
    distanceBins,
    failureBreakdown,
    environmental,
    generatedAt: Date.now(),
  };
}
