export interface TransferCounters {
  cameraFramesCaptured: number;
  decodeAttempts: number;
  decodedFrames: number;
  invalidFrames: number;
  duplicateFrames: number;
  acceptedSymbols: number;
  resolvedBlocks: number;
  renderedFrames: number;
  recoveredBytes: number;
}

export interface TransferTiming {
  startedAt: number | null;
  completedAt: number | null;
  now: number;
  lastSampleAt: number | null;
  lastSampleBytes: number;
  lastSampleCapturedFrames: number;
}

export interface TransferMetricSnapshot extends TransferCounters {
  elapsedMs: number;
  cameraMisses: number;
  hitRate: number | null;
  missRate: number | null;
  averageThroughputBytesPerSecond: number;
  currentThroughputBytesPerSecond: number;
  cameraFps: number;
  achievedScreenFps: number;
  recoveryOverhead: number | null;
  estimatedRemainingMs: number | null;
}

export const EMPTY_TRANSFER_COUNTERS: TransferCounters = {
  cameraFramesCaptured: 0,
  decodeAttempts: 0,
  decodedFrames: 0,
  invalidFrames: 0,
  duplicateFrames: 0,
  acceptedSymbols: 0,
  resolvedBlocks: 0,
  renderedFrames: 0,
  recoveredBytes: 0,
};

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function calculateTransferMetrics(
  counters: TransferCounters,
  timing: TransferTiming,
  totalBytes: number,
  totalBlocks: number,
): TransferMetricSnapshot {
  const endAt = timing.completedAt ?? timing.now;
  const elapsedMs = timing.startedAt === null ? 0 : Math.max(0, endAt - timing.startedAt);
  const cameraMisses = Math.max(0, counters.decodeAttempts - counters.decodedFrames);
  const hitRate = counters.decodeAttempts > 0 ? counters.decodedFrames / counters.decodeAttempts : null;
  const missRate = hitRate === null ? null : 1 - hitRate;
  const averageThroughputBytesPerSecond = safeRate(counters.recoveredBytes * 1000, elapsedMs);

  const sampleElapsedMs = timing.lastSampleAt === null ? 0 : Math.max(0, timing.now - timing.lastSampleAt);
  const sampleBytes = Math.max(0, counters.recoveredBytes - timing.lastSampleBytes);
  const sampleCapturedFrames = Math.max(0, counters.cameraFramesCaptured - timing.lastSampleCapturedFrames);
  const currentThroughputBytesPerSecond = safeRate(sampleBytes * 1000, sampleElapsedMs);
  const cameraFps = safeRate(sampleCapturedFrames * 1000, sampleElapsedMs);
  const achievedScreenFps = safeRate(counters.renderedFrames * 1000, elapsedMs);

  const recoveryOverhead = totalBlocks > 0 && counters.acceptedSymbols > 0
    ? Math.max(0, (counters.acceptedSymbols - totalBlocks) / totalBlocks)
    : null;

  const remainingBytes = Math.max(0, totalBytes - counters.recoveredBytes);
  const estimatedRemainingMs = remainingBytes === 0
    ? 0
    : currentThroughputBytesPerSecond > 0
      ? (remainingBytes / currentThroughputBytesPerSecond) * 1000
      : averageThroughputBytesPerSecond > 0
        ? (remainingBytes / averageThroughputBytesPerSecond) * 1000
        : null;

  return {
    ...counters,
    elapsedMs,
    cameraMisses,
    hitRate,
    missRate,
    averageThroughputBytesPerSecond,
    currentThroughputBytesPerSecond,
    cameraFps,
    achievedScreenFps,
    recoveryOverhead,
    estimatedRemainingMs,
  };
}
