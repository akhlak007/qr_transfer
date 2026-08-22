import type { TransportId } from "./transport";

export type TransferDirection = "send" | "receive";
export type TransferStatus =
  | "preparing"
  | "ready"
  | "active"
  | "paused"
  | "recoverable"
  | "complete"
  | "failed"
  | "cancelled";

export type MediaKind = "image" | "audio" | "video" | "other";

export interface FileIdentity {
  name: string;
  size: number;
  mimeType: string;
  sha256Hex: string;
  mediaKind: MediaKind;
}

export interface TransferSession {
  schemaVersion: 1;
  transferId: string;
  protocolVersion: number;
  direction: TransferDirection;
  transport: TransportId;
  file: FileIdentity;
  fileHashHex: string;
  blockSize: number;
  totalBlocks: number;
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  resumeCapability: ResumeCapability;
  encodingMode: "fountain" | "sequential";
  acceptedSymbols: number;
  resolvedBlocks: number;
  checkpointVersion: number;
  failureCode: string | null;
  transportConfig: Record<string, unknown>;
}

export type ResumeCapability = "none" | "restart-sender" | "replay-receiver" | "complete";

export interface SessionCheckpoint {
  schemaVersion: 1;
  transferId: string;
  acceptedSymbols: number;
  resolvedBlockIndices: number[];
  persistedChunks: number;
  metrics: Record<string, number | null>;
  createdAt: number;
}

export function createTransferId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
