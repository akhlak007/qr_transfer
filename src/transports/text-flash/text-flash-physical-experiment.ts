/**
 * TEXT_FLASH_PROTOCOL — isolated workbench experiment runner (TF7).
 * Demo/synthetic evidence only. Never uses TransportId or physical VLC/OFDM matrices.
 * Does not claim physical phone-camera validation.
 */

import { DemoTransportId, TEXT_FLASH_DEFAULT_FRAME_MS } from "./text-flash-types";
import {
  runTextFlashLoopback,
  type TextFlashLoopbackResult,
  type TextFlashPipelineStage,
} from "./text-flash-loopback";
import type { TextFlashDiagnostics } from "./text-flash-types";
import type { TextFlashSyntheticChannelConfig } from "./text-flash-synthetic-channel";

export const TEXT_FLASH_EVIDENCE_KIND = "text-flash-demo" as const;

export type TextFlashWorkbenchTargetId = "TEXT_FLASH_PROTOCOL";

export type TextFlashExperimentMode = "synthetic" | "camera-unverified";

export type TextFlashExperimentOutcome =
  | "success"
  | "text_mismatch"
  | "incomplete"
  | "failed";

export interface TextFlashWorkbenchTarget {
  id: TextFlashWorkbenchTargetId;
  label: string;
  transport: typeof DemoTransportId.TextFlash;
  evidenceKind: typeof TEXT_FLASH_EVIDENCE_KIND;
  /** Always false — synthetic/demo runs are not physical validation. */
  countsAsPhysicalValidation: false;
  defaultFrameMs: number;
}

export const TEXT_FLASH_WORKBENCH_TARGET: TextFlashWorkbenchTarget = {
  id: "TEXT_FLASH_PROTOCOL",
  label: "TEXT_FLASH_PROTOCOL (Demo / Synthetic)",
  transport: DemoTransportId.TextFlash,
  evidenceKind: TEXT_FLASH_EVIDENCE_KIND,
  countsAsPhysicalValidation: false,
  defaultFrameMs: TEXT_FLASH_DEFAULT_FRAME_MS,
};

export interface TextFlashExperimentRecord {
  schemaVersion: 1;
  runId: string;
  timestamp: number;
  evidenceKind: typeof TEXT_FLASH_EVIDENCE_KIND;
  transport: typeof DemoTransportId.TextFlash;
  targetId: TextFlashWorkbenchTargetId;
  mode: TextFlashExperimentMode;
  payloadText: string;
  recoveredText: string | null;
  frameMs: number;
  outcome: TextFlashExperimentOutcome;
  success: boolean;
  startDetected: boolean;
  lengthDetected: boolean;
  endDetected: boolean;
  bytesReceived: number;
  declaredLength: number | null;
  progressPercent: number;
  failureStage: TextFlashPipelineStage | null;
  failureDetail: string | null;
  completionReason: string | null;
  /** Explicit: must never be ingested as VLC/OFDM physical evidence. */
  physicalValidationEligible: false;
}

export interface TextFlashExperimentRunOptions {
  frameMs?: number;
  channel?: Partial<TextFlashSyntheticChannelConfig>;
  commitMs?: number;
  mode?: TextFlashExperimentMode;
}

function newRunId(): string {
  return `tf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function evaluateTextFlashWorkbenchSuccess(
  expected: string,
  diagnostics: TextFlashDiagnostics,
): { success: boolean; outcome: TextFlashExperimentOutcome } {
  const startOk = diagnostics.startDetected;
  const lengthOk = diagnostics.lengthDetected;
  const endOk = diagnostics.endDetected;
  const lengthMatch =
    diagnostics.declaredLength === new TextEncoder().encode(expected).length &&
    diagnostics.bytesReceived === diagnostics.declaredLength;
  const textMatch =
    diagnostics.finalText === expected && diagnostics.success === true;

  if (
    startOk &&
    lengthOk &&
    endOk &&
    lengthMatch &&
    textMatch &&
    diagnostics.syncState === "COMPLETE"
  ) {
    return { success: true, outcome: "success" };
  }
  if (endOk && diagnostics.completionReason === "text_mismatch") {
    return { success: false, outcome: "text_mismatch" };
  }
  if (!endOk || !lengthMatch) {
    return { success: false, outcome: "incomplete" };
  }
  return { success: false, outcome: "failed" };
}

export function recordFromLoopback(
  payloadText: string,
  loopback: TextFlashLoopbackResult,
  opts: {
    frameMs: number;
    mode: TextFlashExperimentMode;
    runId?: string;
    timestamp?: number;
  },
): TextFlashExperimentRecord {
  const { success, outcome } = evaluateTextFlashWorkbenchSuccess(
    payloadText,
    loopback.diagnostics,
  );
  return {
    schemaVersion: 1,
    runId: opts.runId ?? newRunId(),
    timestamp: opts.timestamp ?? Date.now(),
    evidenceKind: TEXT_FLASH_EVIDENCE_KIND,
    transport: DemoTransportId.TextFlash,
    targetId: "TEXT_FLASH_PROTOCOL",
    mode: opts.mode,
    payloadText,
    recoveredText: loopback.diagnostics.finalText,
    frameMs: opts.frameMs,
    outcome,
    success,
    startDetected: loopback.diagnostics.startDetected,
    lengthDetected: loopback.diagnostics.lengthDetected,
    endDetected: loopback.diagnostics.endDetected,
    bytesReceived: loopback.diagnostics.bytesReceived,
    declaredLength: loopback.diagnostics.declaredLength,
    progressPercent: loopback.diagnostics.progressPercent,
    failureStage:
      loopback.failureStage === "ok" ? null : loopback.failureStage,
    failureDetail: loopback.failureDetail,
    completionReason: loopback.diagnostics.completionReason,
    physicalValidationEligible: false,
  };
}

/** True only for Text Flash demo records — never PhysicalTestRun / TransportId peers. */
export function isTextFlashExperimentRecord(
  value: unknown,
): value is TextFlashExperimentRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as TextFlashExperimentRecord;
  return (
    r.schemaVersion === 1 &&
    r.evidenceKind === TEXT_FLASH_EVIDENCE_KIND &&
    r.transport === DemoTransportId.TextFlash &&
    r.physicalValidationEligible === false &&
    r.targetId === "TEXT_FLASH_PROTOCOL"
  );
}

/**
 * Evidence isolation: Text Flash demo records must not be treated as VLC/OFDM
 * physical transport ids.
 */
export function assertTextFlashEvidenceIsolated(
  record: TextFlashExperimentRecord,
): void {
  if (record.transport !== "text-flash") {
    throw new Error("TEXT_FLASH evidence transport must be text-flash");
  }
  if (record.evidenceKind !== TEXT_FLASH_EVIDENCE_KIND) {
    throw new Error("TEXT_FLASH evidence kind mismatch");
  }
  if (record.physicalValidationEligible !== false) {
    throw new Error("TEXT_FLASH evidence must not be physical-validation eligible");
  }
}

// Narrow helper for mistaken casts — used in tests
export function textFlashTransportIsNotMainTransportId(
  transport: string,
): boolean {
  return (
    transport !== "qr" &&
    transport !== "vlc" &&
    transport !== "visual-ofdm" &&
    transport === DemoTransportId.TextFlash
  );
}

export class TextFlashPhysicalExperimentService {
  private history: TextFlashExperimentRecord[] = [];
  private active = false;
  private lastResult: TextFlashExperimentRecord | null = null;
  private lastLoopback: TextFlashLoopbackResult | null = null;

  listTargets(): TextFlashWorkbenchTarget[] {
    return [{ ...TEXT_FLASH_WORKBENCH_TARGET }];
  }

  selectTarget(id: string): TextFlashWorkbenchTarget {
    if (id !== "TEXT_FLASH_PROTOCOL") {
      throw new Error(`Unknown Text Flash workbench target: ${id}`);
    }
    return { ...TEXT_FLASH_WORKBENCH_TARGET };
  }

  isActive(): boolean {
    return this.active;
  }

  getHistory(): readonly TextFlashExperimentRecord[] {
    return this.history;
  }

  getLastResult(): TextFlashExperimentRecord | null {
    return this.lastResult;
  }

  getLastLoopback(): TextFlashLoopbackResult | null {
    return this.lastLoopback;
  }

  /**
   * Run synthetic render→channel→receive experiment.
   * Result is demo evidence only — not physical validation.
   */
  runSynthetic(
    payloadText: string,
    options: TextFlashExperimentRunOptions = {},
  ): TextFlashExperimentRecord {
    if (this.active) {
      throw new Error("TEXT_FLASH experiment already active");
    }
    this.active = true;
    try {
      const frameMs = options.frameMs ?? TEXT_FLASH_DEFAULT_FRAME_MS;
      const mode: TextFlashExperimentMode = options.mode ?? "synthetic";
      if (mode !== "synthetic") {
        // Camera path reserved; TF7 keeps synthetic as the verified workbench runner.
        throw new Error(
          "TF7 workbench runner only executes synthetic mode; camera remains unverified",
        );
      }
      const loopback = runTextFlashLoopback(payloadText, {
        frameMs,
        channel: options.channel,
        commitMs: options.commitMs,
        expectedText: payloadText,
      });
      this.lastLoopback = loopback;
      const record = recordFromLoopback(payloadText, loopback, {
        frameMs,
        mode: "synthetic",
      });
      assertTextFlashEvidenceIsolated(record);
      this.lastResult = record;
      this.history = [...this.history, record];
      return record;
    } finally {
      this.active = false;
    }
  }

  /** Cancel bookkeeping / clear last run pointers (history retained unless clearHistory). */
  reset(): void {
    this.active = false;
    this.lastResult = null;
    this.lastLoopback = null;
  }

  clearHistory(): void {
    this.history = [];
    this.reset();
  }
}
