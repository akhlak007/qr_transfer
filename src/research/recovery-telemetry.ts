/**
 * Recovery Telemetry & Audit Logging (Milestone 2E)
 *
 * Captures structured recovery events (replay timing, symbol counts,
 * progression deltas, verification outcomes) for audit and research reporting.
 */

export interface RecoveryTelemetryRecord {
  id: string;
  transferId: string;
  direction: "send" | "receive";
  startedAt: number;
  completedAt: number;
  durationMs: number;
  symbolsReplayed: number;
  initialResolvedBlocks: number;
  finalResolvedBlocks: number;
  totalBlocks: number;
  outcome: "success" | "failure" | "aborted";
  sha256Matched: boolean | null;
  errorMessage?: string;
}

export class RecoveryTelemetryLogger {
  private static inMemoryLog: RecoveryTelemetryRecord[] = [];

  /**
   * Record a completed recovery replay or restart event.
   */
  static log(record: Omit<RecoveryTelemetryRecord, "id" | "durationMs">): RecoveryTelemetryRecord {
    const fullRecord: RecoveryTelemetryRecord = {
      ...record,
      id: `rec-tel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      durationMs: Math.max(0, record.completedAt - record.startedAt),
    };

    this.inMemoryLog.push(fullRecord);
    return fullRecord;
  }

  /**
   * Query all recorded recovery telemetry events, optionally filtered by transfer ID.
   */
  static getHistory(transferId?: string): RecoveryTelemetryRecord[] {
    if (transferId) {
      return this.inMemoryLog.filter((r) => r.transferId === transferId);
    }
    return [...this.inMemoryLog].sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Clear in-memory telemetry log (for testing purposes).
   */
  static clear(): void {
    this.inMemoryLog = [];
  }
}
