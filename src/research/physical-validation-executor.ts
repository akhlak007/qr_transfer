/**
 * Phase 12: Authoritative Physical Validation Executor & Matrix Engine
 *
 * Implements:
 * - Operator execution workflow for:
 *   1. QR baseline
 *   2. VLC OOK
 *   3. Visual OFDM (BPSK, QPSK, 16-QAM across 8x8, 16x16, 32x32 = 9 configs)
 *   Total: 11 supported matrix configurations
 * - Gated execution by evaluatePreflightChecklist
 * - Immutable physical evidence recording and promotion logic
 * - Zero software-to-physical contamination enforcement
 * - Physical Validation Execution Report generation separating:
 *   1. Actually executed physical runs
 *   2. Software / simulation runs (isolated)
 *   3. Failed / incomplete physical runs
 *   4. Configurations not yet tested
 *
 * NOTE: Strictly adheres to Phase 12 Physical Optical Validation Architecture.
 */

import { TransportId } from "../core/transport";
import {
  type ProtocolConfiguration,
  type PhysicalValidationRecord,
  type PhysicalValidationStatus,
  evaluatePhysicalValidationStatus,
} from "./physical-validation-evidence";
import {
  PhysicalValidationSession,
  type PhysicalValidationSessionConfig,
} from "./physical-validation-session";
import {
  evaluatePreflightChecklist,
  SUPPORTED_PHYSICAL_MATRIX_TARGETS,
  type PreflightChecklistResult,
} from "./physical-validation-preflight";


export interface TargetExecutionSummary {
  target: ProtocolConfiguration;
  label: string;
  status: PhysicalValidationStatus;
  executedPhysicalRunsCount: number;
  qualifyingPhysicalRunsCount: number;
  failedPhysicalRunsCount: number;
  latestRunId: string | null;
  latestRunTimestamp: number | null;
  sha256Verified: boolean;
}

export interface PhysicalValidationExecutionReport {
  generatedAt: string;
  schemaVersion: number;
  totalMatrixTargetsCount: number;
  testedTargetsCount: number;
  verifiedTargetsCount: number;
  validatedTargetsCount: number;
  failedTargetsCount: number;
  untestedTargetsCount: number;
  
  // Explicit Disjoint Partitions
  executedPhysicalRuns: PhysicalValidationRecord[];
  softwareSimulationRuns: any[];
  failedPhysicalRuns: PhysicalValidationRecord[];
  untestedConfigurations: ProtocolConfiguration[];
  
  targetSummaries: TargetExecutionSummary[];
  overallLedgerStatus: PhysicalValidationStatus;
}

export class PhysicalValidationExecutor {
  private physicalLedger: PhysicalValidationRecord[] = [];
  private softwareLedger: any[] = [];
  private activeSession: PhysicalValidationSession | null = null;

  constructor(initialPhysicalRecords: PhysicalValidationRecord[] = [], initialSoftwareRecords: any[] = []) {
    this.physicalLedger = [...initialPhysicalRecords];
    this.softwareLedger = [...initialSoftwareRecords];
  }

  /**
   * Run preflight checklist before initiating a physical run.
   */
  async runPreflight(
    target: ProtocolConfiguration,
    payload: Uint8Array,
    options: {
      cameraPermission?: "granted" | "denied" | "prompt" | "unavailable";
      ambientLux?: number;
      exposureMode?: string;
      opticalDistanceCm?: number;
    } = {}
  ): Promise<PreflightChecklistResult> {
    return evaluatePreflightChecklist({
      protocolConfig: target,
      payload,
      cameraPermission: options.cameraPermission,
      ambientLux: options.ambientLux,
      exposureMode: options.exposureMode,
      opticalDistanceCm: options.opticalDistanceCm,
    });
  }

  /**
   * Create and prepare an authoritative physical validation session.
   */
  createSession(config: PhysicalValidationSessionConfig): PhysicalValidationSession {
    if (this.activeSession) {
      this.activeSession.stop();
    }
    const session = new PhysicalValidationSession(config);
    this.activeSession = session;
    return session;
  }

  /**
   * Record a completed physical validation run into the authoritative physical ledger.
   * Rejects non-physical or software records.
   */
  recordPhysicalRun(record: PhysicalValidationRecord): void {
    if (record.evidenceKind !== "physical" || record.verificationType !== "PHYSICAL") {
      throw new Error("Cannot record non-physical evidence into physical ledger.");
    }
    this.physicalLedger.push(record);
  }

  /**
   * Record software benchmark/simulation run into the isolated software ledger.
   */
  recordSoftwareRun(record: any): void {
    this.softwareLedger.push(record);
  }

  /**
   * Get all physical records in ledger.
   */
  getPhysicalRecords(): PhysicalValidationRecord[] {
    return [...this.physicalLedger];
  }

  /**
   * Generate authoritative Physical Validation Execution Report across the full 11-target matrix.
   */
  generateExecutionReport(): PhysicalValidationExecutionReport {
    const executedPhysicalRuns = this.physicalLedger.filter(
      (r) => r.evidenceKind === "physical" && r.verificationType === "PHYSICAL"
    );
    const failedPhysicalRuns = executedPhysicalRuns.filter(
      (r) => r.status === "FAILED" || !r.sha256Matched || r.crcStatus === "invalid"
    );
    const softwareSimulationRuns = [...this.softwareLedger];

    const targetSummaries: TargetExecutionSummary[] = [];
    const untestedConfigurations: ProtocolConfiguration[] = [];

    let verifiedCount = 0;
    let validatedCount = 0;
    let failedTargetCount = 0;
    let testedTargetsCount = 0;

    for (const target of SUPPORTED_PHYSICAL_MATRIX_TARGETS) {
      const evaluation = evaluatePhysicalValidationStatus(executedPhysicalRuns, target);
      const targetRuns = executedPhysicalRuns.filter((r) => {
        if (r.transport !== target.transport) return false;
        if (target.transport === TransportId.VLC && target.vlcModulation) {
          if (r.modulation?.toLowerCase() !== target.vlcModulation.toLowerCase()) return false;
        }
        if (target.transport === TransportId.VisualOFDM) {
          if (target.ofdmModulation && r.modulation?.toLowerCase() !== target.ofdmModulation.toLowerCase()) return false;
          if (target.ofdmGridSize && r.gridSize !== target.ofdmGridSize) return false;
        }
        return true;
      });

      const label = this.getTargetLabel(target);
      const isTested = targetRuns.length > 0;
      if (isTested) testedTargetsCount++;
      else untestedConfigurations.push(target);

      if (evaluation.status === "PHYSICAL_VERIFIED") verifiedCount++;
      else if (evaluation.status === "PHYSICAL_VALIDATED") validatedCount++;
      else if (evaluation.status === "FAILED") failedTargetCount++;

      const latestRun = targetRuns.length > 0 ? targetRuns[targetRuns.length - 1] : null;

      targetSummaries.push({
        target,
        label,
        status: evaluation.status,
        executedPhysicalRunsCount: targetRuns.length,
        qualifyingPhysicalRunsCount: evaluation.independentRunCount,
        failedPhysicalRunsCount: evaluation.failedRunCount,
        latestRunId: latestRun?.runId ?? null,
        latestRunTimestamp: latestRun?.timestampStart ?? null,
        sha256Verified: evaluation.independentRunCount > 0,
      });
    }

    const untestedTargetsCount = SUPPORTED_PHYSICAL_MATRIX_TARGETS.length - testedTargetsCount;

    let overallLedgerStatus: PhysicalValidationStatus = "EXPERIMENTAL";
    if (verifiedCount === SUPPORTED_PHYSICAL_MATRIX_TARGETS.length) {
      overallLedgerStatus = "PHYSICAL_VERIFIED";
    } else if (validatedCount > 0 || verifiedCount > 0) {
      overallLedgerStatus = "PHYSICAL_VALIDATED";
    } else if (failedTargetCount > 0) {
      overallLedgerStatus = "FAILED";
    }

    return {
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      totalMatrixTargetsCount: SUPPORTED_PHYSICAL_MATRIX_TARGETS.length,
      testedTargetsCount,
      verifiedTargetsCount: verifiedCount,
      validatedTargetsCount: validatedCount,
      failedTargetsCount: failedTargetCount,
      untestedTargetsCount,
      executedPhysicalRuns,
      softwareSimulationRuns,
      failedPhysicalRuns,
      untestedConfigurations,
      targetSummaries,
      overallLedgerStatus,
    };
  }

  /**
   * Generate human-readable formatted Markdown report.
   */
  generateMarkdownExecutionReport(): string {
    const report = this.generateExecutionReport();
    const lines: string[] = [
      "# Physical Optical Validation Execution Report (Phase 12)",
      `Generated: ${report.generatedAt}`,
      `Authoritative Status: **\`${report.overallLedgerStatus}\`**`,
      "",
      "## Matrix Execution Summary",
      `- **Total Supported Configurations**: ${report.totalMatrixTargetsCount}`,
      `- **Physically Tested Targets**: ${report.testedTargetsCount} / ${report.totalMatrixTargetsCount}`,
      `- **PHYSICAL_VERIFIED Targets (>=3 independent runs)**: ${report.verifiedTargetsCount}`,
      `- **PHYSICAL_VALIDATED Targets (>=1 qualifying run)**: ${report.validatedTargetsCount}`,
      `- **Failed Physical Targets**: ${report.failedTargetsCount}`,
      `- **Untested Targets**: ${report.untestedTargetsCount}`,
      "",
      "## Configuration Matrix Breakdown",
      "| Target Protocol | Modulation / Grid | Status | Qualifying Runs | Executed Runs | Latest Run |",
      "|---|---|---|---|---|---|",
    ];

    for (const s of report.targetSummaries) {
      const runText = s.latestRunId ? `\`${s.latestRunId}\`` : "N/A";
      lines.push(
        `| ${s.target.transport} | ${s.label} | **\`${s.status}\`** | ${s.qualifyingPhysicalRunsCount} / 3 | ${s.executedPhysicalRunsCount} | ${runText} |`
      );
    }

    lines.push("");
    lines.push("## 1. Actually Executed Physical Runs");
    if (report.executedPhysicalRuns.length === 0) {
      lines.push("*No physical camera runs have been executed yet.*");
    } else {
      lines.push("| Run ID | Transport | Modulation | FPS | Duration | CRC | SHA-256 Match | Status | Cryptographic Seal |");
      lines.push("|---|---|---|---|---|---|---|---|---|");
      for (const r of report.executedPhysicalRuns) {
        const seal = r.recordSealSha256 ? `\`${r.recordSealSha256.slice(0, 8)}...\`` : "Unsealed";
        lines.push(
          `| \`${r.runId}\` | ${r.transport} | ${r.modulation} | ${r.measuredFps.toFixed(1)} | ${r.durationMs}ms | ${r.crcStatus} | ${r.sha256Matched ? "✅" : "❌"} | \`${r.status}\` | ${seal} |`
        );
      }
    }

    lines.push("");
    lines.push("## 2. Software / Simulation Runs (Strictly Segregated)");
    if (report.softwareSimulationRuns.length === 0) {
      lines.push("*No software simulation records in secondary partition.*");
    } else {
      lines.push(`*${report.softwareSimulationRuns.length} software simulation record(s) isolated from physical validation.*`);
    }

    lines.push("");
    lines.push("## 3. Failed / Incomplete Physical Runs");
    if (report.failedPhysicalRuns.length === 0) {
      lines.push("*Zero failed physical runs recorded.*");
    } else {
      for (const f of report.failedPhysicalRuns) {
        lines.push(`- ❌ \`${f.runId}\` (${f.transport} ${f.modulation}): CRC=${f.crcStatus}, SHA-256 Matched=${f.sha256Matched}`);
      }
    }

    lines.push("");
    lines.push("## 4. Configurations Not Yet Tested");
    if (report.untestedConfigurations.length === 0) {
      lines.push("*All 11 matrix targets have been physically tested.*");
    } else {
      for (const u of report.untestedConfigurations) {
        lines.push(`- ⏳ ${this.getTargetLabel(u)} (\`${u.transport}\`)`);
      }
    }

    return lines.join("\n");
  }

  private getTargetLabel(target: ProtocolConfiguration): string {
    if (target.transport === TransportId.QR) return "QR Baseline (2D Matrix)";
    if (target.transport === TransportId.VLC) return `VLC ${target.vlcModulation?.toUpperCase() || "OOK"}`;
    if (target.transport === TransportId.VisualOFDM) {
      return `Visual OFDM ${target.ofdmModulation?.toUpperCase() || "BPSK"} (${target.ofdmGridSize || 16}x${target.ofdmGridSize || 16})`;
    }
    return String(target.transport);
  }
}
