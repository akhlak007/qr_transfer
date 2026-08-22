import type { TransportId } from "./transport";

export type TransferDirection = "send" | "receive";
export type TransferStatus =
  | "preparing"
  | "ready"
  | "active"
  | "paused"
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
  transferId: string;
  protocolVersion: number;
  direction: TransferDirection;
  transport: TransportId;
  file: FileIdentity;
  blockSize: number;
  totalBlocks: number;
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
}

export function createTransferId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
