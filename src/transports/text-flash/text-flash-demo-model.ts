/**
 * TEXT_FLASH_PROTOCOL — pure demo/workbench UI model (TF6).
 * Keeps React thin; no physical-camera reliability claim.
 */

import type { TextFlashDiagnostics } from "./text-flash-types";
import type { TextFlashTxSnapshot, TextFlashTxStatus } from "./text-flash-transmitter";
import type { TextFlashPipelineStage } from "./text-flash-loopback";

export type TextFlashUiLabel =
  | "IDLE"
  | "SENDING"
  | "STOPPED"
  | "WAITING"
  | "DETECTING"
  | "RECEIVING"
  | "STABLE"
  | "REACQUIRING"
  | "WAITING_FOR_NEXT_FRAME"
  | "COMPLETE"
  | "FAILED";

export function deriveTransmitUiLabel(status: TextFlashTxStatus): TextFlashUiLabel {
  if (status === "SENDING") return "SENDING";
  if (status === "COMPLETE") return "COMPLETE";
  if (status === "STOPPED") return "STOPPED";
  return "IDLE";
}

/**
 * STABLE is only shown when a valid DATA byte has already been observed.
 * It never means successful completion by itself.
 */
export function deriveReceiveUiLabel(d: TextFlashDiagnostics): TextFlashUiLabel {
  if (d.syncState === "COMPLETE") return "COMPLETE";
  if (d.syncState === "FAILED") return "FAILED";
  if (d.reacquiring) return "REACQUIRING";
  if (d.syncState === "RECEIVING" && d.awaitingNextFrame) {
    return "WAITING_FOR_NEXT_FRAME";
  }
  if (d.syncState === "RECEIVING" && d.isStable && d.bytesReceived > 0) {
    return "STABLE";
  }
  if (d.syncState === "RECEIVING") return "RECEIVING";
  if (d.syncState === "DETECTING") return "DETECTING";
  return "WAITING";
}

export function formatProgressPercent(percent: number): string {
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

export interface TextFlashExpectedComparison {
  expected: string;
  received: string;
  bytesExpected: number;
  bytesReceived: number;
  match: boolean;
  mismatch: boolean;
  pending: boolean;
}

export function compareExpectedReceived(
  expected: string,
  diagnostics: Pick<
    TextFlashDiagnostics,
    "partialText" | "finalText" | "bytesReceived" | "syncState" | "success"
  >,
): TextFlashExpectedComparison {
  const bytesExpected = new TextEncoder().encode(expected).length;
  const received =
    diagnostics.finalText ??
    diagnostics.partialText ??
    "";
  const terminal =
    diagnostics.syncState === "COMPLETE" || diagnostics.syncState === "FAILED";
  const match =
    diagnostics.syncState === "COMPLETE" &&
    diagnostics.success &&
    received === expected;
  const mismatch = terminal && received !== expected;
  return {
    expected,
    received,
    bytesExpected,
    bytesReceived: diagnostics.bytesReceived,
    match,
    mismatch,
    pending: !terminal,
  };
}

export interface TextFlashDemoViewModel {
  txLabel: TextFlashUiLabel;
  rxLabel: TextFlashUiLabel;
  txProgress: string;
  rxProgress: string;
  partialText: string;
  finalText: string | null;
  comparison: TextFlashExpectedComparison;
  failureStage: TextFlashPipelineStage | null;
  failureDetail: string | null;
  diagnosticsSummary: {
    lastValidFrame: string;
    bytesReceived: number;
    declaredLength: number | null;
    progressPercent: number;
    reacquiring: boolean;
    completionReason: string | null;
    duplicateFrames: number;
    invalidFrames: number;
    missedFrames: number;
  };
}

export function buildTextFlashDemoViewModel(args: {
  tx: TextFlashTxSnapshot | null;
  rx: TextFlashDiagnostics;
  expectedText: string;
  failureStage?: TextFlashPipelineStage | null;
  failureDetail?: string | null;
}): TextFlashDemoViewModel {
  const tx = args.tx;
  const rx = args.rx;
  return {
    txLabel: deriveTransmitUiLabel(tx?.status ?? "IDLE"),
    rxLabel: deriveReceiveUiLabel(rx),
    txProgress: formatProgressPercent(tx?.progressPercent ?? 0),
    rxProgress: formatProgressPercent(rx.progressPercent),
    partialText: rx.partialText,
    finalText: rx.finalText,
    comparison: compareExpectedReceived(args.expectedText, rx),
    failureStage: args.failureStage ?? null,
    failureDetail: args.failureDetail ?? null,
    diagnosticsSummary: {
      lastValidFrame: rx.lastValidFrame ?? "—",
      bytesReceived: rx.bytesReceived,
      declaredLength: rx.declaredLength,
      progressPercent: rx.progressPercent,
      reacquiring: rx.reacquiring,
      completionReason: rx.completionReason,
      duplicateFrames: rx.duplicateFrames,
      invalidFrames: rx.invalidFrames,
      missedFrames: rx.missedFrames,
    },
  };
}

/** Whether the UI may show STABLE (requires observed DATA). */
export function mayShowStable(d: TextFlashDiagnostics): boolean {
  return d.isStable && d.bytesReceived > 0 && d.syncState === "RECEIVING";
}
