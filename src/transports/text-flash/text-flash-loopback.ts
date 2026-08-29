/**
 * TEXT_FLASH_PROTOCOL — synthetic end-to-end loopback helper (TF5).
 * Wires transmitter plan → render → synthetic camera → classifier → receiver.
 * Stage diagnostics locate failures. Not a physical phone-camera success claim.
 */

import {
  TEXT_FLASH_DEFAULT_FRAME_MS,
  type TextFlashDiagnostics,
} from "./text-flash-types";
import { createTextFlashRenderPlan } from "./text-flash-renderer";
import { assertNoCoalescedRepeatedData, isRepeatedDataByte } from "./text-flash-transmitter";
import {
  TEXT_FLASH_CLEAN_CHANNEL,
  simulateTextFlashCamera,
  type TextFlashSyntheticChannelConfig,
  type TextFlashSyntheticChannelResult,
} from "./text-flash-synthetic-channel";
import { TextFlashReceiver } from "./text-flash-receiver";

export type TextFlashPipelineStage =
  | "render"
  | "sampling"
  | "classification"
  | "sequencing"
  | "byte_commit"
  | "utf8_decode"
  | "end_detection"
  | "ok";

export interface TextFlashLoopbackProgressSample {
  timestampMs: number;
  bytesReceived: number;
  progressPercent: number;
  partialText: string;
  isStable: boolean;
  awaitingNextFrame: boolean;
  lastValidFrame: TextFlashDiagnostics["lastValidFrame"];
}

export interface TextFlashLoopbackResult {
  text: string;
  channel: TextFlashSyntheticChannelResult;
  diagnostics: TextFlashDiagnostics;
  progressTrace: TextFlashLoopbackProgressSample[];
  /** First stage that looks broken, or "ok". */
  failureStage: TextFlashPipelineStage;
  failureDetail: string | null;
  repeatedDataSteps: number[];
}

export interface TextFlashLoopbackOptions {
  frameMs?: number;
  channel?: Partial<TextFlashSyntheticChannelConfig>;
  /** Receiver commit window; default short for dense synthetic sampling. */
  commitMs?: number;
  expectedText?: string;
  /** Inject UNKNOWN classifications at these sample indices (malformed stress). */
  injectUnknownAtSampleIndexes?: number[];
}

function diagnoseFailure(
  text: string,
  channel: TextFlashSyntheticChannelResult,
  diag: TextFlashDiagnostics,
): { stage: TextFlashPipelineStage; detail: string | null } {
  const expected = [...new TextEncoder().encode(text)];

  if (channel.plan.steps.length < 3) {
    return { stage: "render", detail: "plan too short" };
  }
  try {
    assertNoCoalescedRepeatedData(channel.plan);
  } catch (e) {
    return {
      stage: "render",
      detail: e instanceof Error ? e.message : "coalesced DATA",
    };
  }

  if (channel.samples.length === 0) {
    return { stage: "sampling", detail: "no camera samples" };
  }

  const kinds = new Set(
    channel.samples.map((s) => s.classify.classification.kind),
  );
  if (!kinds.has("start")) {
    return { stage: "classification", detail: "START never classified" };
  }
  if (!kinds.has("end") && diag.syncState !== "COMPLETE") {
    // may still fail later; only flag if END also missing from plan recovery
  }
  if (![...kinds].some((k) => k === "bitcard" || k === "start" || k === "end")) {
    return { stage: "classification", detail: "no usable classifications" };
  }

  if (!diag.startDetected) {
    return { stage: "sequencing", detail: "START not committed" };
  }
  if (!diag.lengthDetected) {
    return { stage: "sequencing", detail: "LENGTH not committed" };
  }
  if (diag.declaredLength !== expected.length) {
    return {
      stage: "sequencing",
      detail: `LENGTH ${diag.declaredLength} != ${expected.length}`,
    };
  }
  if (diag.bytesReceived < expected.length) {
    return {
      stage: "byte_commit",
      detail: `only ${diag.bytesReceived}/${expected.length} bytes`,
    };
  }
  if (diag.syncState === "COMPLETE" || diag.success) {
    if (diag.finalText !== text) {
      return {
        stage: "utf8_decode",
        detail: `finalText ${JSON.stringify(diag.finalText)} != ${JSON.stringify(text)}`,
      };
    }
    if (!diag.endDetected) {
      return { stage: "end_detection", detail: "COMPLETE without endDetected" };
    }
    return { stage: "ok", detail: null };
  }

  if (!diag.endDetected) {
    return {
      stage: "end_detection",
      detail: diag.completionReason ?? diag.lastError ?? "END not accepted",
    };
  }
  if (diag.completionReason === "text_mismatch") {
    return {
      stage: "utf8_decode",
      detail: "expectedText mismatch",
    };
  }
  if (diag.completionReason === "invalid_utf8") {
    return { stage: "utf8_decode", detail: "invalid UTF-8" };
  }
  return {
    stage: "end_detection",
    detail: diag.completionReason ?? diag.lastError ?? "not COMPLETE",
  };
}

/**
 * Full synthetic loopback: plan/render → camera channel → receiver.
 */
export function runTextFlashLoopback(
  text: string,
  options: TextFlashLoopbackOptions = {},
): TextFlashLoopbackResult {
  const frameMs = options.frameMs ?? TEXT_FLASH_DEFAULT_FRAME_MS;
  const planProbe = createTextFlashRenderPlan(text, frameMs);
  assertNoCoalescedRepeatedData(planProbe);

  const repeatedDataSteps: number[] = [];
  for (let i = 0; i < planProbe.steps.length; i++) {
    if (isRepeatedDataByte(planProbe, i)) repeatedDataSteps.push(i);
  }

  const channel = simulateTextFlashCamera(
    text,
    { ...TEXT_FLASH_CLEAN_CHANNEL, ...options.channel },
    frameMs,
  );

  const inject = new Set(options.injectUnknownAtSampleIndexes ?? []);
  const rx = new TextFlashReceiver({
    frameMs,
    maxBytes: 64,
    commitMs: options.commitMs ?? 40,
    expectedText: options.expectedText ?? text,
  });

  const progressTrace: TextFlashLoopbackProgressSample[] = [];
  let lastBytes = -1;

  for (let i = 0; i < channel.samples.length; i++) {
    const s = channel.samples[i]!;
    const optical = inject.has(i)
      ? ({ kind: "unknown" } as const)
      : s.classify.classification;

    const diag = rx.ingestClassification(
      optical,
      s.timestampMs,
      s.classify.diagnostics.quality,
      { missedSincePrevious: s.missedSincePrevious },
    );

    if (
      diag.bytesReceived !== lastBytes ||
      diag.syncState === "COMPLETE" ||
      diag.awaitingNextFrame ||
      diag.isStable
    ) {
      progressTrace.push({
        timestampMs: s.timestampMs,
        bytesReceived: diag.bytesReceived,
        progressPercent: diag.progressPercent,
        partialText: diag.partialText,
        isStable: diag.isStable,
        awaitingNextFrame: diag.awaitingNextFrame,
        lastValidFrame: diag.lastValidFrame,
      });
      lastBytes = diag.bytesReceived;
    }
  }

  const diagnostics = rx.getDiagnostics();
  const { stage, detail } = diagnoseFailure(text, channel, diagnostics);

  return {
    text,
    channel,
    diagnostics,
    progressTrace,
    failureStage: stage,
    failureDetail: detail,
    repeatedDataSteps,
  };
}
