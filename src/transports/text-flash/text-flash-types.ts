/**
 * TEXT_FLASH_PROTOCOL — shared types (demo/workbench only).
 * Not part of TransportId / main file-transfer selector.
 */

export const DemoTransportId = {
  TextFlash: "text-flash",
} as const;

export type DemoTransportId = (typeof DemoTransportId)[keyof typeof DemoTransportId];

export const TEXT_FLASH_MAX_BYTES = 64;
export const TEXT_FLASH_DEFAULT_FRAME_MS = 750;
export const TEXT_FLASH_MIN_FRAME_MS = 500;
export const TEXT_FLASH_MAX_FRAME_MS = 2000;

/** Active pattern fills this fraction of the canvas (margin for phone framing). */
export const TEXT_FLASH_ACTIVE_REGION_RATIO = 0.8;
/** START/END horizontal bar height as a fraction of the active region height. */
export const TEXT_FLASH_BAR_HEIGHT_RATIO = 0.12;
/** Gap between bit-card cells as a fraction of the active region (black). */
export const TEXT_FLASH_CELL_GAP_RATIO = 0.04;

export type TextFlashStatus =
  | "WAITING_FOR_START"
  | "DETECTING"
  | "RECEIVING"
  | "COMPLETE"
  | "FAILED";

export type TextFlashSignalQuality = "GOOD" | "FAIR" | "POOR";

export type TextFlashFrameKind = "idle" | "start" | "length" | "data" | "end";

export type TextFlashOpticalClass =
  | { kind: "idle" }
  | { kind: "start" }
  | { kind: "end" }
  | { kind: "bitcard"; byte: number }
  | { kind: "unknown" };

export interface TextFlashTxConfig {
  frameMs: number;
  maxBytes: number;
  activeRegionRatio: number;
}

export interface TextFlashRxConfig {
  frameMs: number;
  maxBytes: number;
  commitMs?: number;
  timeoutMs?: number;
  stableSampleCount?: number;
  /** When set (workbench), COMPLETE requires exact UTF-8 match. */
  expectedText?: string;
}

export const TEXT_FLASH_DEFAULT_TX_CONFIG: TextFlashTxConfig = {
  frameMs: TEXT_FLASH_DEFAULT_FRAME_MS,
  maxBytes: TEXT_FLASH_MAX_BYTES,
  activeRegionRatio: TEXT_FLASH_ACTIVE_REGION_RATIO,
};

export const TEXT_FLASH_DEFAULT_RX_CONFIG: TextFlashRxConfig = {
  frameMs: TEXT_FLASH_DEFAULT_FRAME_MS,
  maxBytes: TEXT_FLASH_MAX_BYTES,
};

export interface TextFlashDiagnostics {
  cameraFps: number;
  startDetected: boolean;
  lengthDetected: boolean;
  endDetected: boolean;
  dataByteIndex: number | null;
  bytesReceived: number;
  declaredLength: number | null;
  progressPercent: number;
  duplicateFrames: number;
  invalidFrames: number;
  missedFrames: number;
  detectedSymbols: number;
  syncState: TextFlashStatus;
  isStable: boolean;
  awaitingNextFrame: boolean;
  reacquiring: boolean;
  signalQuality: TextFlashSignalQuality;
  partialText: string;
  finalText: string | null;
  finalStatus: TextFlashStatus;
  /** Last successfully committed optical kind (receiver-phase mapped). */
  lastValidFrame: "start" | "length" | "data" | "end" | null;
  lastValidByte: number | null;
  /** Why reception ended or null while in progress. */
  completionReason: string | null;
  /** Workbench: true only when COMPLETE and expectedText matched (or no expectedText). */
  success: boolean;
  lastError?: string;
}

export interface TextFlashGeometry {
  activeRegionRatio: number;
  barHeightRatio: number;
  cellGapRatio: number;
  /** Bit-card grid: 4 columns × 2 rows. */
  columns: 4;
  rows: 2;
}

export const TEXT_FLASH_GEOMETRY: TextFlashGeometry = {
  activeRegionRatio: TEXT_FLASH_ACTIVE_REGION_RATIO,
  barHeightRatio: TEXT_FLASH_BAR_HEIGHT_RATIO,
  cellGapRatio: TEXT_FLASH_CELL_GAP_RATIO,
  columns: 4,
  rows: 2,
};

export function clampTextFlashFrameMs(frameMs: number): number {
  if (!Number.isFinite(frameMs)) return TEXT_FLASH_DEFAULT_FRAME_MS;
  return Math.min(
    TEXT_FLASH_MAX_FRAME_MS,
    Math.max(TEXT_FLASH_MIN_FRAME_MS, Math.round(frameMs)),
  );
}

export function textFlashCommitMs(frameMs: number): number {
  return Math.max(200, clampTextFlashFrameMs(frameMs) * 0.35);
}

export function textFlashTimeoutMs(frameMs: number): number {
  return clampTextFlashFrameMs(frameMs) * 8;
}

export function emptyTextFlashDiagnostics(
  status: TextFlashStatus = "WAITING_FOR_START",
): TextFlashDiagnostics {
  return {
    cameraFps: 0,
    startDetected: false,
    lengthDetected: false,
    endDetected: false,
    dataByteIndex: null,
    bytesReceived: 0,
    declaredLength: null,
    progressPercent: 0,
    duplicateFrames: 0,
    invalidFrames: 0,
    missedFrames: 0,
    detectedSymbols: 0,
    syncState: status,
    isStable: false,
    awaitingNextFrame: false,
    reacquiring: false,
    signalQuality: "POOR",
    partialText: "",
    finalText: null,
    finalStatus: status,
    lastValidFrame: null,
    lastValidByte: null,
    completionReason: null,
    success: false,
  };
}
