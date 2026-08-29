/**
 * TEXT_FLASH_PROTOCOL — receiver state machine (TF3).
 * START → LENGTH → DATA×N → END with phone-camera-oriented commit/dup/gap handling.
 * Synthetic tests are not a physical phone-camera success claim.
 */

import {
  TEXT_FLASH_DEFAULT_RX_CONFIG,
  TEXT_FLASH_MAX_BYTES,
  clampTextFlashFrameMs,
  emptyTextFlashDiagnostics,
  textFlashCommitMs,
  textFlashTimeoutMs,
  type TextFlashDiagnostics,
  type TextFlashOpticalClass,
  type TextFlashRxConfig,
  type TextFlashSignalQuality,
  type TextFlashStatus,
} from "./text-flash-types";
import {
  classifyTextFlashFrame,
  sameOpticalClass,
} from "./text-flash-classifier";
import type { TextFlashPixelBuffer } from "./text-flash-renderer";

type RxPhase = "need_start" | "need_length" | "need_data" | "need_end";

type CommittedLabel = "start" | "length" | "data" | "end";

export function safeUtf8Prefix(bytes: Uint8Array): string {
  const dec = new TextDecoder("utf-8", { fatal: true });
  for (let len = bytes.length; len >= 0; len--) {
    try {
      return dec.decode(bytes.subarray(0, len));
    } catch {
      /* truncated multi-byte sequence — try shorter */
    }
  }
  return "";
}

export function textFlashProgressPercent(
  bytesReceived: number,
  declaredLength: number | null,
  complete: boolean,
): number {
  if (complete) return 100;
  if (declaredLength === null) return 0;
  if (declaredLength === 0) return 0;
  return Math.min(99, Math.round((100 * bytesReceived) / declaredLength));
}

export class TextFlashReceiver {
  private readonly config: Required<
    Pick<TextFlashRxConfig, "frameMs" | "maxBytes" | "commitMs" | "timeoutMs" | "stableSampleCount">
  > & { expectedText?: string };

  private status: TextFlashStatus = "WAITING_FOR_START";
  private phase: RxPhase = "need_start";
  private bytes = new Uint8Array(0);
  private declaredLength: number | null = null;
  private startDetected = false;
  private lengthDetected = false;
  private endDetected = false;
  private duplicateFrames = 0;
  private invalidFrames = 0;
  private missedFrames = 0;
  private detectedSymbols = 0;
  private lastError: string | undefined;
  private completionReason: string | null = null;
  private lastValidFrame: CommittedLabel | null = null;
  private lastValidByte: number | null = null;
  private signalQuality: TextFlashSignalQuality = "POOR";
  private reacquiring = false;
  private isStable = false;
  private awaitingNextFrame = false;
  private success = false;
  private finalText: string | null = null;

  private lastSampleTs: number | null = null;
  private lastAcceptTs: number | null = null;
  private sampleIntervals: number[] = [];

  /** Candidate awaiting commitMs persistence. */
  private candidate: TextFlashOpticalClass | null = null;
  private candidateSince: number | null = null;
  /** Last committed class — duplicates ignored until change or re-arm. */
  private lastCommitted: TextFlashOpticalClass | null = null;
  private holdForChange = false;
  /** After commit, identical symbols ignored until this time (same-byte DATA frames). */
  private rearmAfterTs = 0;

  constructor(config: TextFlashRxConfig = TEXT_FLASH_DEFAULT_RX_CONFIG) {
    const frameMs = clampTextFlashFrameMs(config.frameMs);
    this.config = {
      frameMs,
      maxBytes: config.maxBytes ?? TEXT_FLASH_MAX_BYTES,
      commitMs: config.commitMs ?? textFlashCommitMs(frameMs),
      timeoutMs: config.timeoutMs ?? textFlashTimeoutMs(frameMs),
      stableSampleCount: config.stableSampleCount ?? 3,
      expectedText: config.expectedText,
    };
  }

  reset(): void {
    this.status = "WAITING_FOR_START";
    this.phase = "need_start";
    this.bytes = new Uint8Array(0);
    this.declaredLength = null;
    this.startDetected = false;
    this.lengthDetected = false;
    this.endDetected = false;
    this.duplicateFrames = 0;
    this.invalidFrames = 0;
    this.missedFrames = 0;
    this.detectedSymbols = 0;
    this.lastError = undefined;
    this.completionReason = null;
    this.lastValidFrame = null;
    this.lastValidByte = null;
    this.signalQuality = "POOR";
    this.reacquiring = false;
    this.isStable = false;
    this.awaitingNextFrame = false;
    this.success = false;
    this.finalText = null;
    this.lastSampleTs = null;
    this.lastAcceptTs = null;
    this.sampleIntervals = [];
    this.candidate = null;
    this.candidateSince = null;
    this.lastCommitted = null;
    this.holdForChange = false;
    this.rearmAfterTs = 0;
  }

  getDiagnostics(): TextFlashDiagnostics {
    const complete = this.status === "COMPLETE";
    const base = emptyTextFlashDiagnostics(this.status);
    return {
      ...base,
      cameraFps: this.estimateFps(),
      startDetected: this.startDetected,
      lengthDetected: this.lengthDetected,
      endDetected: this.endDetected,
      dataByteIndex:
        this.declaredLength === null
          ? null
          : Math.min(this.bytes.length, this.declaredLength),
      bytesReceived: this.bytes.length,
      declaredLength: this.declaredLength,
      progressPercent: textFlashProgressPercent(
        this.bytes.length,
        this.declaredLength,
        complete,
      ),
      duplicateFrames: this.duplicateFrames,
      invalidFrames: this.invalidFrames,
      missedFrames: this.missedFrames,
      detectedSymbols: this.detectedSymbols,
      syncState: this.status,
      isStable: this.isStable,
      awaitingNextFrame: this.awaitingNextFrame,
      reacquiring: this.reacquiring,
      signalQuality: this.signalQuality,
      partialText: safeUtf8Prefix(this.bytes),
      finalText: this.finalText,
      finalStatus: this.status,
      lastValidFrame: this.lastValidFrame,
      lastValidByte: this.lastValidByte,
      completionReason: this.completionReason,
      success: this.success,
      lastError: this.lastError,
    };
  }

  /** Ingest a camera RGBA buffer. */
  ingestBuffer(buf: TextFlashPixelBuffer, timestampMs: number): TextFlashDiagnostics {
    const classified = classifyTextFlashFrame(buf);
    return this.ingestClassification(
      classified.classification,
      timestampMs,
      classified.diagnostics.quality,
    );
  }

  /**
   * Ingest a precomputed optical class (tests / synthetic pipeline).
   * Missed camera samples: pass `missedSincePrevious: true` or a large timestamp gap.
   */
  ingestClassification(
    optical: TextFlashOpticalClass,
    timestampMs: number,
    quality: TextFlashSignalQuality = "FAIR",
    opts: { missedSincePrevious?: boolean; missGapMs?: number } = {},
  ): TextFlashDiagnostics {
    if (this.status === "COMPLETE" || this.status === "FAILED") {
      return this.getDiagnostics();
    }

    this.signalQuality = quality;
    this.noteTiming(timestampMs, opts);

    if (this.phase !== "need_start" && this.lastAcceptTs !== null) {
      if (timestampMs - this.lastAcceptTs > this.config.timeoutMs) {
        this.fail("timeout", "Reception stalled waiting for next frame");
        return this.getDiagnostics();
      }
    }

    this.updateUiStability(optical, timestampMs);

    if (optical.kind === "unknown") {
      this.invalidFrames++;
      if (this.status === "WAITING_FOR_START") this.status = "DETECTING";
      return this.getDiagnostics();
    }

    if (optical.kind === "idle") {
      if (this.status === "DETECTING") this.status = "WAITING_FOR_START";
      this.candidate = null;
      this.candidateSince = null;
      this.isStable = false;
      return this.getDiagnostics();
    }

    // Duplicate tolerance: after a commit, ignore same class until change or re-arm
    if (this.holdForChange && this.lastCommitted && sameOpticalClass(optical, this.lastCommitted)) {
      // ponytail: time re-arm allows consecutive identical DATA bytes (e.g. "LL" in HELLO)
      // without IDLE separators; ceiling: very short dwell + late commit could double-count —
      // upgrade: brief gray separator between frames.
      if (timestampMs >= this.rearmAfterTs) {
        this.holdForChange = false;
        this.candidate = optical;
        this.candidateSince = timestampMs;
        this.isStable = true;
        this.awaitingNextFrame = false;
        return this.getDiagnostics();
      }
      this.duplicateFrames++;
      this.isStable = false;
      this.awaitingNextFrame = this.status === "RECEIVING";
      return this.getDiagnostics();
    }

    if (this.holdForChange && this.lastCommitted && !sameOpticalClass(optical, this.lastCommitted)) {
      this.holdForChange = false;
      this.candidate = optical;
      this.candidateSince = timestampMs;
      this.isStable = true;
      this.awaitingNextFrame = false;
      return this.getDiagnostics();
    }

    if (!this.candidate || !sameOpticalClass(optical, this.candidate)) {
      this.candidate = optical;
      this.candidateSince = timestampMs;
      this.isStable = true;
      this.awaitingNextFrame = false;
      if (this.status === "WAITING_FOR_START" && optical.kind !== "start") {
        this.status = "DETECTING";
      }
      return this.getDiagnostics();
    }

    // Same candidate — check commit window
    const since = this.candidateSince ?? timestampMs;
    if (timestampMs - since < this.config.commitMs) {
      this.isStable = true;
      this.awaitingNextFrame = false;
      return this.getDiagnostics();
    }

    this.commit(optical, timestampMs);
    return this.getDiagnostics();
  }

  private noteTiming(
    timestampMs: number,
    opts: { missedSincePrevious?: boolean; missGapMs?: number },
  ): void {
    // Default gap uses frameMs so sparse commit-test feeds are not false misses;
    // real camera drops still set missedSincePrevious from the capture loop.
    const missGap = opts.missGapMs ?? this.config.frameMs;
    this.reacquiring = false;
    if (this.lastSampleTs !== null) {
      const dt = timestampMs - this.lastSampleTs;
      if (dt > 0) {
        this.sampleIntervals.push(dt);
        if (this.sampleIntervals.length > 30) this.sampleIntervals.shift();
      }
      if (opts.missedSincePrevious || dt > missGap) {
        this.missedFrames++;
        this.reacquiring = true;
      }
    }
    this.lastSampleTs = timestampMs;
  }

  private updateUiStability(optical: TextFlashOpticalClass, _t: number): void {
    if (this.status === "RECEIVING" && this.holdForChange) {
      this.awaitingNextFrame = true;
      this.isStable = false;
    }
    void optical;
  }

  private commit(optical: TextFlashOpticalClass, timestampMs: number): void {
    this.lastCommitted = optical;
    this.holdForChange = true;
    // Re-arm near the end of a dwell so the same on-screen frame is not
    // accepted twice, while the next dwell with an identical BITCARD can be.
    this.rearmAfterTs =
      timestampMs + Math.max(this.config.frameMs * 0.5, this.config.frameMs - this.config.commitMs);
    this.candidate = null;
    this.candidateSince = null;
    this.isStable = false;
    this.awaitingNextFrame = this.status === "RECEIVING" || this.phase !== "need_start";
    this.lastAcceptTs = timestampMs;
    this.detectedSymbols++;
    this.reacquiring = false;

    if (optical.kind === "start") {
      this.onStart();
      return;
    }
    if (optical.kind === "end") {
      this.onEnd();
      return;
    }
    if (optical.kind === "bitcard") {
      this.onBitcard(optical.byte);
      return;
    }
  }

  private onStart(): void {
    if (this.phase === "need_start" || this.phase === "need_length") {
      // Fresh START (or START again before LENGTH) — reset payload, keep counters
      this.bytes = new Uint8Array(0);
      this.declaredLength = null;
      this.lengthDetected = false;
      this.endDetected = false;
      this.finalText = null;
      this.success = false;
      this.startDetected = true;
      this.phase = "need_length";
      this.status = "RECEIVING";
      this.lastValidFrame = "start";
      this.lastValidByte = null;
      this.awaitingNextFrame = true;
      return;
    }
    // Unexpected START after LENGTH/DATA — reject, keep accumulated bytes
    this.invalidFrames++;
    this.lastError = "unexpected_start";
  }

  private onBitcard(byte: number): void {
    if (this.phase === "need_start") {
      this.invalidFrames++;
      this.status = "DETECTING";
      return;
    }
    if (this.phase === "need_length") {
      if (byte > this.config.maxBytes) {
        this.fail("invalid_length", `LENGTH ${byte} exceeds max ${this.config.maxBytes}`);
        return;
      }
      this.declaredLength = byte;
      this.lengthDetected = true;
      this.lastValidFrame = "length";
      this.lastValidByte = byte;
      this.phase = byte === 0 ? "need_end" : "need_data";
      this.status = "RECEIVING";
      this.awaitingNextFrame = true;
      return;
    }
    if (this.phase === "need_data") {
      if (this.bytes.length >= (this.declaredLength ?? 0)) {
        this.invalidFrames++;
        this.lastError = "overflow";
        return;
      }
      const next = new Uint8Array(this.bytes.length + 1);
      next.set(this.bytes);
      next[this.bytes.length] = byte & 0xff;
      this.bytes = next;
      this.lastValidFrame = "data";
      this.lastValidByte = byte;
      if (this.bytes.length >= (this.declaredLength ?? 0)) {
        this.phase = "need_end";
      }
      this.status = "RECEIVING";
      this.awaitingNextFrame = true;
      return;
    }
    // need_end but got bitcard
    this.invalidFrames++;
    this.lastError = "unexpected_data";
  }

  private onEnd(): void {
    if (this.phase === "need_start") {
      this.invalidFrames++;
      return;
    }
    if (this.phase !== "need_end") {
      this.fail("unexpected_end", "END before all DATA bytes received");
      return;
    }
    if (this.declaredLength === null || this.bytes.length !== this.declaredLength) {
      this.fail("length_mismatch", "Byte count does not match LENGTH");
      return;
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(this.bytes);
    } catch {
      this.fail("invalid_utf8", "Payload is not valid UTF-8");
      return;
    }

    this.endDetected = true;
    this.lastValidFrame = "end";
    this.lastValidByte = null;
    this.finalText = text;
    this.awaitingNextFrame = false;
    this.isStable = false;

    if (
      this.config.expectedText !== undefined &&
      text !== this.config.expectedText
    ) {
      this.fail("text_mismatch", "Recovered text does not match expected payload");
      return;
    }

    this.status = "COMPLETE";
    this.completionReason = "end_ok";
    this.success = true;
    this.lastError = undefined;
  }

  private fail(reason: string, message: string): void {
    this.status = "FAILED";
    this.completionReason = reason;
    this.lastError = message;
    this.success = false;
    this.isStable = false;
    this.awaitingNextFrame = false;
    if (this.finalText === null && this.bytes.length > 0) {
      this.finalText = safeUtf8Prefix(this.bytes);
    }
  }

  private estimateFps(): number {
    if (this.sampleIntervals.length === 0) return 0;
    const avg =
      this.sampleIntervals.reduce((a, b) => a + b, 0) /
      this.sampleIntervals.length;
    return avg > 0 ? 1000 / avg : 0;
  }
}
