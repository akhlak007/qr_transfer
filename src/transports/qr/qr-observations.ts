import type { DecodeOutcome } from "../../core/transport";

export interface QRObservationCounters {
  cameraFramesCaptured: number;
  decodeAttempts: number;
  decodedFrames: number;
  noSignalFrames: number;
  invalidFrames: number;
  totalDecodeTimeMs: number;
}

export const EMPTY_QR_OBSERVATIONS: QRObservationCounters = {
  cameraFramesCaptured: 0,
  decodeAttempts: 0,
  decodedFrames: 0,
  noSignalFrames: 0,
  invalidFrames: 0,
  totalDecodeTimeMs: 0,
};

export function addDecodeObservation(
  counters: QRObservationCounters,
  outcome: DecodeOutcome,
  durationMs: number,
): QRObservationCounters {
  return {
    ...counters,
    decodeAttempts: counters.decodeAttempts + 1,
    decodedFrames: counters.decodedFrames + (outcome === "decoded" ? 1 : 0),
    noSignalFrames: counters.noSignalFrames + (outcome === "no-signal" ? 1 : 0),
    invalidFrames: counters.invalidFrames + (outcome === "invalid" ? 1 : 0),
    totalDecodeTimeMs: counters.totalDecodeTimeMs + durationMs,
  };
}
