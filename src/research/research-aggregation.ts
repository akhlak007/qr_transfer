import type { TransportId } from "../core/transport";
import { isMeasuredRun, isPhysicallyVerifiedRun, type EvidenceKind, type TestRun } from "./test-run";

export interface ResearchSummary {
  transport: TransportId;
  evidenceKind: EvidenceKind;
  sampleCount: number;
  averageThroughputBytesPerSecond: number | null;
  averageHitRate: number | null;
  maximumPhysicallyVerifiedFileSize: number | null;
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function summarizeRuns(runs: TestRun[], transport: TransportId, evidenceKind: EvidenceKind): ResearchSummary {
  const matching = runs.filter((run) => isMeasuredRun(run) && run.transport === transport && run.evidenceKind === evidenceKind);
  const hitRates = matching.flatMap((run) => run.metrics.frameHitRate === null ? [] : [run.metrics.frameHitRate]);
  const physicalSizes = matching.filter(isPhysicallyVerifiedRun).map((run) => run.metrics.fileSize);
  return {
    transport,
    evidenceKind,
    sampleCount: matching.length,
    averageThroughputBytesPerSecond: average(matching.map((run) => run.metrics.averageThroughputBytesPerSecond)),
    averageHitRate: average(hitRates),
    maximumPhysicallyVerifiedFileSize: physicalSizes.length > 0 ? Math.max(...physicalSizes) : null,
  };
}
