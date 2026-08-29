/**
 * TEXT_FLASH_PROTOCOL — dwell scheduler / transmitter (TF4).
 * Deterministic START → LENGTH → DATA×N → END with full per-frame dwell.
 * Consecutive identical DATA bytes each get a full dwell (never coalesced).
 * Not a physical phone-camera reliability claim.
 */

import {
  TEXT_FLASH_DEFAULT_FRAME_MS,
  TEXT_FLASH_DEFAULT_TX_CONFIG,
  clampTextFlashFrameMs,
  type TextFlashFrameKind,
} from "./text-flash-types";
import type { TextFlashLogicalFrame } from "./text-flash-framing";
import {
  createTextFlashPixelBuffer,
  createTextFlashRenderPlan,
  paintTextFlashFrameOnCanvas,
  renderTextFlashFrame,
  renderTextFlashPlanStep,
  type TextFlashPixelBuffer,
  type TextFlashPhase,
  type TextFlashRenderPlan,
} from "./text-flash-renderer";

export type TextFlashTxStatus = "IDLE" | "SENDING" | "COMPLETE" | "STOPPED";

export interface TextFlashTxClock {
  now(): number;
  /** Resolve after `ms` (tests inject a fake; production uses real timers). */
  sleep(ms: number): Promise<void>;
}

export const defaultTextFlashTxClock: TextFlashTxClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

export interface TextFlashTxSnapshot {
  status: TextFlashTxStatus;
  text: string;
  frameIndex: number;
  frameCount: number;
  phase: TextFlashPhase | "idle";
  kind: TextFlashFrameKind;
  byte: number | null;
  dataIndex: number | null;
  dwellMs: number;
  /** Display-only sender progress 0..100 (not remote delivery). */
  progressPercent: number;
  elapsedMs: number;
  /** True when this DATA frame repeats the previous DATA byte (re-arm critical). */
  repeatedByteFrame: boolean;
  /** Wall time when the current frame dwell started (for RX re-arm alignment). */
  frameStartedAtMs: number | null;
}

export interface TextFlashTransmitterOptions {
  frameMs?: number;
  maxBytes?: number;
  activeRegionRatio?: number;
  width?: number;
  height?: number;
  clock?: TextFlashTxClock;
  /** Called whenever the painted buffer changes. */
  onFrame?: (buf: TextFlashPixelBuffer, snapshot: TextFlashTxSnapshot) => void;
  onStatus?: (snapshot: TextFlashTxSnapshot) => void;
}

function emptySnapshot(status: TextFlashTxStatus = "IDLE"): TextFlashTxSnapshot {
  return {
    status,
    text: "",
    frameIndex: -1,
    frameCount: 0,
    phase: "idle",
    kind: "idle",
    byte: null,
    dataIndex: null,
    dwellMs: TEXT_FLASH_DEFAULT_FRAME_MS,
    progressPercent: 0,
    elapsedMs: 0,
    repeatedByteFrame: false,
    frameStartedAtMs: null,
  };
}

/**
 * Schedules optical frames with exact dwell timing.
 * Does not coalesce consecutive identical DATA bytes — each step is painted
 * and held for the full `frameMs` so the receiver re-arm window can fire.
 */
export class TextFlashTransmitter {
  private readonly clock: TextFlashTxClock;
  private readonly width: number;
  private readonly height: number;
  private readonly activeRegionRatio: number;
  private readonly maxBytes: number;
  private frameMs: number;
  private onFrame?: TextFlashTransmitterOptions["onFrame"];
  private onStatus?: TextFlashTransmitterOptions["onStatus"];

  private status: TextFlashTxStatus = "IDLE";
  private plan: TextFlashRenderPlan | null = null;
  private buffer: TextFlashPixelBuffer;
  private runId = 0;
  private startedAt = 0;
  private snapshot: TextFlashTxSnapshot = emptySnapshot();

  constructor(options: TextFlashTransmitterOptions = {}) {
    this.clock = options.clock ?? defaultTextFlashTxClock;
    this.width = options.width ?? 320;
    this.height = options.height ?? 320;
    this.activeRegionRatio =
      options.activeRegionRatio ?? TEXT_FLASH_DEFAULT_TX_CONFIG.activeRegionRatio;
    this.maxBytes = options.maxBytes ?? TEXT_FLASH_DEFAULT_TX_CONFIG.maxBytes;
    this.frameMs = clampTextFlashFrameMs(
      options.frameMs ?? TEXT_FLASH_DEFAULT_FRAME_MS,
    );
    this.onFrame = options.onFrame;
    this.onStatus = options.onStatus;
    this.buffer = createTextFlashPixelBuffer(this.width, this.height);
    this.paintIdle();
  }

  getStatus(): TextFlashTxStatus {
    return this.status;
  }

  getSnapshot(): TextFlashTxSnapshot {
    return { ...this.snapshot };
  }

  getBuffer(): TextFlashPixelBuffer {
    return this.buffer;
  }

  getPlan(): TextFlashRenderPlan | null {
    return this.plan;
  }

  setFrameMs(frameMs: number): void {
    if (this.status === "SENDING") {
      throw new Error("Cannot change frameMs while SENDING");
    }
    this.frameMs = clampTextFlashFrameMs(frameMs);
  }

  /** Paint solid IDLE gray and return to IDLE (clears plan). */
  reset(): void {
    this.runId++;
    this.status = "IDLE";
    this.plan = null;
    this.paintIdle();
    this.snapshot = emptySnapshot("IDLE");
    this.snapshot.dwellMs = this.frameMs;
    this.emitStatus();
  }

  /** Stop an active send; leaves last frame until reset/start. */
  stop(): void {
    if (this.status !== "SENDING") return;
    this.runId++;
    this.status = "STOPPED";
    this.snapshot = {
      ...this.snapshot,
      status: "STOPPED",
      elapsedMs: this.clock.now() - this.startedAt,
    };
    this.emitStatus();
  }

  /**
   * Start transmitting `text`. Rejects if already SENDING.
   * Resolves when COMPLETE or STOPPED (cancellation).
   */
  async start(text: string): Promise<TextFlashTxSnapshot> {
    if (this.status === "SENDING") {
      throw new Error("TEXT_FLASH transmitter already SENDING");
    }

    const plan = createTextFlashRenderPlan(text, this.frameMs, this.maxBytes);
    this.plan = plan;
    const myRun = ++this.runId;
    this.status = "SENDING";
    this.startedAt = this.clock.now();

    // Verify consecutive identical DATA steps are preserved as separate dwells
    assertNoCoalescedRepeatedData(plan);

    for (let i = 0; i < plan.steps.length; i++) {
      if (myRun !== this.runId) {
        return this.getSnapshot();
      }

      const step = plan.steps[i]!;
      const frameStartedAtMs = this.clock.now();
      renderTextFlashPlanStep(plan, i, this.buffer, this.activeRegionRatio);

      const repeatedByteFrame = isRepeatedDataByte(plan, i);
      this.snapshot = {
        status: "SENDING",
        text: plan.text,
        frameIndex: i,
        frameCount: plan.steps.length,
        phase: step.phase,
        kind: step.kind,
        byte: step.byte,
        dataIndex: step.dataIndex,
        dwellMs: plan.frameMs,
        progressPercent: Math.round((100 * (i + 1)) / plan.steps.length),
        elapsedMs: frameStartedAtMs - this.startedAt,
        repeatedByteFrame,
        frameStartedAtMs,
      };
      this.onFrame?.(this.buffer, this.getSnapshot());
      this.emitStatus();

      await this.clock.sleep(plan.frameMs);

      if (myRun !== this.runId) {
        return this.getSnapshot();
      }
    }

    if (myRun !== this.runId) {
      return this.getSnapshot();
    }

    this.status = "COMPLETE";
    this.paintIdle();
    this.snapshot = {
      ...this.snapshot,
      status: "COMPLETE",
      phase: "idle",
      kind: "idle",
      byte: null,
      dataIndex: null,
      progressPercent: 100,
      elapsedMs: this.clock.now() - this.startedAt,
      repeatedByteFrame: false,
      frameStartedAtMs: null,
    };
    this.emitStatus();
    return this.getSnapshot();
  }

  /** Paint current logical frame onto a browser canvas (demo UI). */
  paintOnCanvas(canvas: HTMLCanvasElement): void {
    const frame: TextFlashLogicalFrame =
      this.snapshot.kind === "idle"
        ? { kind: "idle" }
        : this.plan?.steps[this.snapshot.frameIndex]?.frame ?? { kind: "idle" };
    paintTextFlashFrameOnCanvas(canvas, frame, {
      activeRegionRatio: this.activeRegionRatio,
    });
  }

  private paintIdle(): void {
    renderTextFlashFrame({ kind: "idle" }, this.buffer, this.activeRegionRatio);
    this.onFrame?.(this.buffer, this.getSnapshot());
  }

  private emitStatus(): void {
    this.onStatus?.(this.getSnapshot());
  }
}

/** Each DATA step is a separate dwell even when bytes repeat. */
export function assertNoCoalescedRepeatedData(plan: TextFlashRenderPlan): void {
  const dataSteps = plan.steps.filter((s) => s.kind === "data");
  for (let i = 1; i < dataSteps.length; i++) {
    if (dataSteps[i]!.dataIndex !== dataSteps[i - 1]!.dataIndex! + 1) {
      throw new Error("TEXT_FLASH plan DATA indices are not sequential");
    }
  }
  // HELLO-style repeats must appear as two steps, not one
  for (let i = 1; i < plan.steps.length; i++) {
    const a = plan.steps[i - 1]!;
    const b = plan.steps[i]!;
    if (a.kind === "data" && b.kind === "data" && a.byte === b.byte) {
      if (a.index === b.index) {
        throw new Error("TEXT_FLASH coalesced repeated DATA frame");
      }
    }
  }
}

export function isRepeatedDataByte(
  plan: TextFlashRenderPlan,
  stepIndex: number,
): boolean {
  const step = plan.steps[stepIndex];
  if (!step || step.kind !== "data" || stepIndex === 0) return false;
  const prev = plan.steps[stepIndex - 1]!;
  return prev.kind === "data" && prev.byte === step.byte;
}

/** Fake clock for deterministic tests. */
export class TextFlashFakeClock implements TextFlashTxClock {
  private t: number;
  private readonly waits: Array<{ due: number; resolve: () => void }> = [];

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.waits.push({ due: this.t + ms, resolve });
    });
  }

  pendingSleeps(): number {
    return this.waits.length;
  }

  /** Advance time and resolve sleeps that are due. */
  async advance(ms: number): Promise<void> {
    this.t += ms;
    const due = this.waits.filter((w) => w.due <= this.t);
    this.waits.splice(0, this.waits.length, ...this.waits.filter((w) => w.due > this.t));
    for (const w of due) w.resolve();
    // Flush microtasks so async start() can reach the next sleep.
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
}

async function waitForSleep(clock: TextFlashFakeClock): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (clock.pendingSleeps() > 0) return;
    await Promise.resolve();
  }
  throw new Error("TEXT_FLASH fake clock: timed out waiting for sleep");
}

/**
 * Drive a fake-clock send to completion by advancing exactly one dwell per frame.
 * Returns ordered kinds painted while SENDING.
 */
export async function runTransmitterWithFakeClock(
  tx: TextFlashTransmitter,
  clock: TextFlashFakeClock,
  text: string,
  frameMs: number = TEXT_FLASH_DEFAULT_FRAME_MS,
): Promise<{ kinds: TextFlashFrameKind[]; snapshots: TextFlashTxSnapshot[] }> {
  const kinds: TextFlashFrameKind[] = [];
  const snapshots: TextFlashTxSnapshot[] = [];
  const done = tx.start(text);
  await waitForSleep(clock);
  const plan = tx.getPlan();
  if (!plan) throw new Error("expected plan after start");

  for (let i = 0; i < plan.steps.length; i++) {
    await waitForSleep(clock);
    const snap = tx.getSnapshot();
    kinds.push(snap.kind);
    snapshots.push(snap);
    await clock.advance(frameMs);
  }
  const final = await done;
  snapshots.push(final);
  return { kinds, snapshots };
}
