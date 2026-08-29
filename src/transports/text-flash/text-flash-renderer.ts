/**
 * TEXT_FLASH_PROTOCOL — deterministic visual transmitter (TF1).
 * Paints IDLE/START/LENGTH/DATA/END into RGBA buffers. No CRC, no VLC/OFDM.
 * Does not claim physical phone-camera reliability.
 */

import {
  TEXT_FLASH_ACTIVE_REGION_RATIO,
  TEXT_FLASH_DEFAULT_FRAME_MS,
  TEXT_FLASH_DEFAULT_TX_CONFIG,
  clampTextFlashFrameMs,
  type TextFlashFrameKind,
} from "./text-flash-types";
import {
  activeRegionRect,
  bitCardCellCenters,
  bitCardToByte,
  buildTextFlashFrames,
  byteToBitCard,
  controlBarRect,
  type TextFlashLogicalFrame,
} from "./text-flash-framing";

export const TEXT_FLASH_COLOR = {
  black: 0,
  white: 255,
  gray: 128,
} as const;

export type TextFlashPhase = "start" | "length" | "data" | "end";

/** Immutable metadata for one optical dwell in a message sequence. */
export interface TextFlashRenderStep {
  index: number;
  frameCount: number;
  kind: TextFlashFrameKind;
  phase: TextFlashPhase;
  /** DATA byte index, or null for START/LENGTH/END. */
  dataIndex: number | null;
  /** LENGTH/DATA byte value, or null for START/END. */
  byte: number | null;
  dwellMs: number;
  frame: TextFlashLogicalFrame;
}

/** Immutable render plan: frame sequence + dwell timing. */
export interface TextFlashRenderPlan {
  text: string;
  payload: Uint8Array;
  frameMs: number;
  steps: readonly TextFlashRenderStep[];
}

export interface TextFlashPixelBuffer {
  width: number;
  height: number;
  /** RGBA, length width*height*4 */
  data: Uint8ClampedArray;
}

function phaseOf(frame: TextFlashLogicalFrame): TextFlashPhase {
  if (frame.kind === "start") return "start";
  if (frame.kind === "length") return "length";
  if (frame.kind === "data") return "data";
  return "end";
}

/**
 * Build an immutable render plan. Does not mutate `text` encoding beyond a fresh encode.
 * Default dwell is 750 ms (clamped 500–2000).
 */
export function createTextFlashRenderPlan(
  text: string,
  frameMs: number = TEXT_FLASH_DEFAULT_FRAME_MS,
  maxBytes?: number,
): TextFlashRenderPlan {
  const dwell = clampTextFlashFrameMs(frameMs);
  const frames = buildTextFlashFrames(text, maxBytes);
  const payload = new TextEncoder().encode(text);
  const steps: TextFlashRenderStep[] = frames.map((frame, index) => ({
    index,
    frameCount: frames.length,
    kind: frame.kind,
    phase: phaseOf(frame),
    dataIndex: frame.kind === "data" ? frame.index : null,
    byte: frame.kind === "length" || frame.kind === "data" ? frame.byte : null,
    dwellMs: dwell,
    frame,
  }));
  return {
    text,
    payload: payload.slice(),
    frameMs: dwell,
    steps: Object.freeze(steps.slice()),
  };
}

export function createTextFlashPixelBuffer(
  width: number,
  height: number,
): TextFlashPixelBuffer {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

function setPixel(
  buf: TextFlashPixelBuffer,
  x: number,
  y: number,
  lum: number,
): void {
  const ix = (Math.floor(y) * buf.width + Math.floor(x)) * 4;
  const v = lum & 0xff;
  buf.data[ix] = v;
  buf.data[ix + 1] = v;
  buf.data[ix + 2] = v;
  buf.data[ix + 3] = 255;
}

function fillRect(
  buf: TextFlashPixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  lum: number,
): void {
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(buf.width, Math.ceil(x0 + w));
  const yEnd = Math.min(buf.height, Math.ceil(y0 + h));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      setPixel(buf, x, y, lum);
    }
  }
}

function fillAll(buf: TextFlashPixelBuffer, lum: number): void {
  fillRect(buf, 0, 0, buf.width, buf.height, lum);
}

/**
 * Paint one logical frame into an RGBA buffer (deterministic).
 * Uses only black / white / mid-gray. No HUD text.
 */
export function renderTextFlashFrame(
  frame: TextFlashLogicalFrame,
  buf: TextFlashPixelBuffer,
  activeRegionRatio: number = TEXT_FLASH_ACTIVE_REGION_RATIO,
): TextFlashPixelBuffer {
  const { black, white, gray } = TEXT_FLASH_COLOR;
  fillAll(buf, gray);

  if (frame.kind === "idle") {
    return buf;
  }

  const region = activeRegionRect(buf.width, buf.height, activeRegionRatio);

  if (frame.kind === "start") {
    fillRect(buf, region.x, region.y, region.w, region.h, white);
    const bar = controlBarRect(region);
    fillRect(buf, bar.x, bar.y, bar.w, bar.h, black);
    return buf;
  }

  if (frame.kind === "end") {
    fillRect(buf, region.x, region.y, region.w, region.h, black);
    const bar = controlBarRect(region);
    fillRect(buf, bar.x, bar.y, bar.w, bar.h, white);
    return buf;
  }

  // LENGTH / DATA — 4×2 bit card; gaps stay black
  fillRect(buf, region.x, region.y, region.w, region.h, black);
  const bits = byteToBitCard(frame.byte);
  const cells = bitCardCellCenters(region);
  for (let i = 0; i < 8; i++) {
    const cell = cells[i]!;
    const lum = bits[i]! ? white : black;
    fillRect(
      buf,
      cell.x - cell.w / 2,
      cell.y - cell.h / 2,
      cell.w,
      cell.h,
      lum,
    );
  }
  return buf;
}

/** Render a plan step by index without mutating the plan or payload. */
export function renderTextFlashPlanStep(
  plan: TextFlashRenderPlan,
  stepIndex: number,
  buf: TextFlashPixelBuffer,
  activeRegionRatio: number = TEXT_FLASH_ACTIVE_REGION_RATIO,
): TextFlashRenderStep {
  const step = plan.steps[stepIndex];
  if (!step) {
    throw new Error(
      `TEXT_FLASH render step ${stepIndex} out of range (0..${plan.steps.length - 1})`,
    );
  }
  renderTextFlashFrame(step.frame, buf, activeRegionRatio);
  return step;
}

/** Optional canvas paint for browser demo UI (TF6). */
export function paintTextFlashFrameOnCanvas(
  canvas: HTMLCanvasElement,
  frame: TextFlashLogicalFrame,
  config: { activeRegionRatio: number } = {
    activeRegionRatio: TEXT_FLASH_DEFAULT_TX_CONFIG.activeRegionRatio,
  },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("TEXT_FLASH renderer requires 2d canvas context");
  const img = ctx.createImageData(canvas.width, canvas.height);
  const buf: TextFlashPixelBuffer = {
    width: canvas.width,
    height: canvas.height,
    data: img.data,
  };
  renderTextFlashFrame(frame, buf, config.activeRegionRatio);
  ctx.putImageData(img, 0, 0);
}

export function sampleLuminance(
  buf: TextFlashPixelBuffer,
  x: number,
  y: number,
): number {
  const ix = (Math.floor(y) * buf.width + Math.floor(x)) * 4;
  return buf.data[ix]!;
}

/** Mean luminance over a filled rectangle (inclusive of floor bounds). */
export function sampleRectMeanLuminance(
  buf: TextFlashPixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(buf.width, Math.ceil(x0 + w));
  const yEnd = Math.min(buf.height, Math.ceil(y0 + h));
  let sum = 0;
  let n = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      sum += sampleLuminance(buf, x, y);
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/** Read 8 bit-card cell center luminances → recovered byte (threshold mid-gray). */
export function sampleBitCardByte(
  buf: TextFlashPixelBuffer,
  activeRegionRatio: number = TEXT_FLASH_ACTIVE_REGION_RATIO,
  threshold: number = TEXT_FLASH_COLOR.gray,
): number {
  const region = activeRegionRect(buf.width, buf.height, activeRegionRatio);
  const cells = bitCardCellCenters(region);
  const bits = cells.map((c) => sampleLuminance(buf, c.x, c.y) > threshold);
  return bitCardToByte(bits);
}

export function assertPlanMatchesPayload(plan: TextFlashRenderPlan): void {
  const fresh = new TextEncoder().encode(plan.text);
  assertBytesEqual(plan.payload, fresh);
  const lengthStep = plan.steps.find((s) => s.kind === "length");
  if (!lengthStep || lengthStep.byte !== fresh.length) {
    throw new Error("TEXT_FLASH plan LENGTH does not match payload");
  }
  const dataSteps = plan.steps.filter((s) => s.kind === "data");
  if (dataSteps.length !== fresh.length) {
    throw new Error("TEXT_FLASH plan DATA count does not match payload");
  }
  for (let i = 0; i < fresh.length; i++) {
    if (dataSteps[i]!.byte !== fresh[i] || dataSteps[i]!.dataIndex !== i) {
      throw new Error(`TEXT_FLASH plan DATA mismatch at index ${i}`);
    }
  }
}

function assertBytesEqual(a: Uint8Array, b: Uint8Array): void {
  if (a.length !== b.length) {
    throw new Error("TEXT_FLASH payload length changed");
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`TEXT_FLASH payload mutated at ${i}`);
  }
}
