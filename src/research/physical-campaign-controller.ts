/**
 * Physical Optical Campaign Orchestrator & Controller (Milestone 7F)
 *
 * Implements:
 * - Campaign lifecycle execution across 14 targets (39 experimental runs)
 * - Integration with PhysicalExperimentController, PhysicalCameraService, and persistence
 * - Strict verification gates: CRC pass + exact SHA-256 match + real camera capture
 * - Safe manual operator confirmation before each transmission
 *
 * NOTE: For physical optical research campaign automation.
 */

import type { PersistenceRepositories } from "../storage/persistence";
import type { TestRun } from "./test-run";
import {
  PHYSICAL_EXPERIMENT_TARGETS,
  type PhysicalConfigTarget,
} from "./physical-acquisition";
import {
  CampaignState,
  computeCampaignProgress,
  type CampaignSnapshot,
} from "./physical-campaign";
import { validatePhysicalRun, type PhysicalRunValidationResult } from "./physical-run-validator";

export interface CampaignControllerOptions {
  persistence: PersistenceRepositories | null;
  onSnapshotUpdated?: (snapshot: CampaignSnapshot) => void;
  onRunValidated?: (result: PhysicalRunValidationResult, run: TestRun) => void;
}

export class PhysicalCampaignController {
  private campaignId: string;
  private state: CampaignState = CampaignState.IDLE;
  private currentTargetIndex = 0;
  private currentRunIndex = 1;
  private startedAt: number | null = null;
  private persistence: PersistenceRepositories | null;
  private runs: TestRun[] = [];
  private onSnapshotUpdated?: (snapshot: CampaignSnapshot) => void;
  private onRunValidated?: (result: PhysicalRunValidationResult, run: TestRun) => void;

  constructor(options: CampaignControllerOptions) {
    this.campaignId = `campaign-${Date.now()}`;
    this.persistence = options.persistence;
    this.onSnapshotUpdated = options.onSnapshotUpdated;
    this.onRunValidated = options.onRunValidated;
  }

  /**
   * Initialize and synchronize controller with existing physical ledger.
   */
  public async initialize(): Promise<CampaignSnapshot> {
    if (this.persistence) {
      try {
        const stored = await this.persistence.research.list();
        this.runs = stored.filter((r) => r.evidenceKind === "physical");
      } catch (err) {
        console.error("Failed to load runs in campaign controller:", err);
      }
    }
    return this.getCampaignProgress();
  }

  /**
   * Set recorded runs directly (useful in test harnesses or reactive state).
   */
  public setRuns(runs: TestRun[]): CampaignSnapshot {
    this.runs = runs.filter((r) => r.evidenceKind === "physical");
    return this.getCampaignProgress();
  }

  public getCampaignProgress(): CampaignSnapshot {
    const snapshot = computeCampaignProgress(
      this.campaignId,
      this.state,
      this.currentTargetIndex,
      this.currentRunIndex,
      this.runs,
      this.startedAt
    );
    this.onSnapshotUpdated?.(snapshot);
    return snapshot;
  }

  public startCampaign(): CampaignSnapshot {
    if (this.state === CampaignState.RUNNING || this.state === CampaignState.CAMPAIGN_COMPLETED) {
      return this.getCampaignProgress();
    }
    this.startedAt = this.startedAt ?? Date.now();
    this.state = CampaignState.PREPARING;
    this.currentTargetIndex = 0;
    this.currentRunIndex = 1;
    return this.getCampaignProgress();
  }

  public pauseCampaign(): CampaignSnapshot {
    if (this.state === CampaignState.RUNNING || this.state === CampaignState.READY) {
      this.state = CampaignState.PAUSED;
    }
    return this.getCampaignProgress();
  }

  public resumeCampaign(): CampaignSnapshot {
    if (this.state === CampaignState.PAUSED) {
      this.state = CampaignState.READY;
    }
    return this.getCampaignProgress();
  }

  public cancelCampaign(): CampaignSnapshot {
    this.state = CampaignState.CANCELLED;
    return this.getCampaignProgress();
  }

  public selectTarget(index: number): CampaignSnapshot {
    if (index >= 0 && index < PHYSICAL_EXPERIMENT_TARGETS.length) {
      this.currentTargetIndex = index;
      this.currentRunIndex = 1;
      this.state = CampaignState.DEVICE_CHECK;
    }
    return this.getCampaignProgress();
  }

  public markDeviceReady(): CampaignSnapshot {
    if (this.state === CampaignState.DEVICE_CHECK || this.state === CampaignState.PREPARING) {
      this.state = CampaignState.READY;
    }
    return this.getCampaignProgress();
  }

  /**
   * Advance target index to the next incomplete target in the campaign.
   */
  public advanceToNextTarget(): CampaignSnapshot {
    const progress = this.getCampaignProgress();
    const nextTargetIdx = progress.targets.findIndex((t) => !t.isComplete);

    if (nextTargetIdx !== -1) {
      this.currentTargetIndex = nextTargetIdx;
      this.currentRunIndex = 1;
      this.state = CampaignState.DEVICE_CHECK;
    } else {
      this.state = CampaignState.CAMPAIGN_COMPLETED;
    }
    return this.getCampaignProgress();
  }

  /**
   * Finalize and record a physical run after validation.
   */
  public async finalizeRun(run: TestRun): Promise<{
    snapshot: CampaignSnapshot;
    validation: PhysicalRunValidationResult;
  }> {
    this.state = CampaignState.VALIDATING;

    // Validate physical evidence strictly
    const validation = validatePhysicalRun(run);
    this.onRunValidated?.(validation, run);

    if (run.evidenceKind === "physical") {
      this.runs = [run, ...this.runs];

      if (this.persistence) {
        try {
          await this.persistence.research.put(run);
        } catch (err) {
          console.error("Failed to persist physical run to ledger:", err);
        }
      }
    }

    if (validation.qualifying) {
      this.currentRunIndex++;
      this.state = CampaignState.RECORDING;

      // Check if target completed
      const snapshot = this.getCampaignProgress();
      const currentTargetProgress = snapshot.targets[this.currentTargetIndex];
      if (currentTargetProgress?.isComplete) {
        this.state = CampaignState.TARGET_COMPLETED;
      } else {
        this.state = CampaignState.READY;
      }
    } else {
      this.state = CampaignState.TARGET_FAILED;
    }

    const finalSnapshot = this.getCampaignProgress();
    return { snapshot: finalSnapshot, validation };
  }

  public getCurrentTarget(): PhysicalConfigTarget | null {
    if (this.currentTargetIndex >= 0 && this.currentTargetIndex < PHYSICAL_EXPERIMENT_TARGETS.length) {
      return PHYSICAL_EXPERIMENT_TARGETS[this.currentTargetIndex];
    }
    return null;
  }
}
