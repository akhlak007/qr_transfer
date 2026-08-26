/**
 * Physical Optical Experiment Campaign Engine (Milestone 7F)
 *
 * Implements:
 * - State machine for controlled multi-target physical optical campaigns
 * - Target-by-target tracking across the 14-target acquisition matrix (39 required experimental runs)
 * - Strict Physical-Only Qualification Rules
 * - Anti-fabrication guarantees: Zero synthetic contamination
 *
 * NOTE: For physical screen-to-camera campaign execution.
 */

import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import type { PhysicalVerificationStatus } from "./physical-evidence";
import {
  PHYSICAL_EXPERIMENT_TARGETS,
  type PhysicalConfigTarget,
} from "./physical-acquisition";

export const CampaignState = {
  IDLE: "IDLE",
  PREPARING: "PREPARING",
  DEVICE_CHECK: "DEVICE_CHECK",
  CALIBRATING: "CALIBRATING",
  READY: "READY",
  RUNNING: "RUNNING",
  CAPTURING: "CAPTURING",
  VALIDATING: "VALIDATING",
  RECORDING: "RECORDING",
  TARGET_COMPLETED: "TARGET_COMPLETED",
  TARGET_FAILED: "TARGET_FAILED",
  PAUSED: "PAUSED",
  CANCELLED: "CANCELLED",
  CAMPAIGN_COMPLETED: "CAMPAIGN_COMPLETED",
} as const;

export type CampaignState = (typeof CampaignState)[keyof typeof CampaignState];

export interface TargetCampaignProgress {
  targetId: string;
  target: PhysicalConfigTarget;
  protocol: TransportId;
  modulation: string;
  gridSize?: number;
  requiredRuns: number; // 3
  qualifyingRuns: number;
  failedRuns: number;
  remainingRuns: number;
  status: PhysicalVerificationStatus;
  isComplete: boolean;
}

export interface CampaignSnapshot {
  campaignId: string;
  state: CampaignState;
  currentTargetIndex: number;
  currentTarget: PhysicalConfigTarget | null;
  currentRunIndex: number; // 1-indexed within current target
  totalRequiredRuns: number; // 39 experimental
  totalCompletedQualifyingRuns: number;
  totalRecordedFailures: number;
  progressPercentage: number;
  targets: TargetCampaignProgress[];
  isCompleted: boolean;
  startedAt: number | null;
  updatedAt: number;
}

/**
 * Calculate per-target and campaign-wide progress from recorded physical runs.
 */
export function computeCampaignProgress(
  campaignId: string,
  state: CampaignState,
  currentTargetIndex: number,
  currentRunIndex: number,
  runs: TestRun[],
  startedAt: number | null = null
): CampaignSnapshot {
  // Strict filter: Exclude all synthetic benchmarks
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  const targetProgressList: TargetCampaignProgress[] = PHYSICAL_EXPERIMENT_TARGETS.map((target) => {
    const targetRuns = physicalRuns.filter((r) => {
      if (r.transport !== target.transport) return false;
      if (target.transport === TransportId.QR) return true;
      const matchMod = r.fileName.toLowerCase().includes(target.pattern);
      if (target.gridSize) {
        return matchMod && (r.fileName.includes(`${target.gridSize}x${target.gridSize}`) || !r.fileName.includes("x"));
      }
      return matchMod;
    });

    const qualifying = targetRuns.filter(
      (r) => r.status === "complete" && r.integrityStatus === "verified" && (r.metrics.errorRate ?? 0) === 0 && !!r.fileHashHex && r.fileHashHex.length === 64
    );
    const failed = targetRuns.length - qualifying.length;
    const qualifyingCount = qualifying.length;
    const remaining = Math.max(0, target.requiredQualifyingRuns - qualifyingCount);

    let status: PhysicalVerificationStatus = "EXPERIMENTAL_NOT_TESTED";
    if (targetRuns.length === 0) {
      status = "EXPERIMENTAL_NOT_TESTED";
    } else if (qualifyingCount >= target.requiredQualifyingRuns && failed === 0) {
      status = "PHYSICALLY_VERIFIED";
    } else if (failed > 0) {
      status = "PHYSICAL_FAILURE_RECORDED";
    } else {
      status = "INSUFFICIENT_PHYSICAL_EVIDENCE";
    }

    return {
      targetId: target.configId,
      target,
      protocol: target.transport,
      modulation: target.modulation,
      gridSize: target.gridSize,
      requiredRuns: target.requiredQualifyingRuns,
      qualifyingRuns: qualifyingCount,
      failedRuns: failed,
      remainingRuns: remaining,
      status,
      isComplete: qualifyingCount >= target.requiredQualifyingRuns && failed === 0,
    };
  });

  // Calculate experimental metrics (excluding QR baseline from the 39-run total)
  const experimentalTargets = targetProgressList.filter((t) => t.protocol !== TransportId.QR);
  const totalRequiredRuns = experimentalTargets.reduce((sum, t) => sum + t.requiredRuns, 0); // 39
  const totalCompletedQualifying = experimentalTargets.reduce(
    (sum, t) => sum + Math.min(t.qualifyingRuns, t.requiredRuns),
    0
  );
  const totalRecordedFailures = physicalRuns.filter(
    (r) => r.status !== "complete" || r.integrityStatus !== "verified" || (r.metrics.errorRate ?? 0) > 0
  ).length;

  const progressPercentage = totalRequiredRuns > 0
    ? Math.round((totalCompletedQualifying / totalRequiredRuns) * 100)
    : 0;

  const isCompleted = totalCompletedQualifying >= totalRequiredRuns;
  const currentTarget =
    currentTargetIndex >= 0 && currentTargetIndex < PHYSICAL_EXPERIMENT_TARGETS.length
      ? PHYSICAL_EXPERIMENT_TARGETS[currentTargetIndex]
      : null;

  return {
    campaignId,
    state: isCompleted && state !== CampaignState.CANCELLED ? CampaignState.CAMPAIGN_COMPLETED : state,
    currentTargetIndex,
    currentTarget,
    currentRunIndex,
    totalRequiredRuns,
    totalCompletedQualifyingRuns: totalCompletedQualifying,
    totalRecordedFailures,
    progressPercentage,
    targets: targetProgressList,
    isCompleted,
    startedAt,
    updatedAt: Date.now(),
  };
}
