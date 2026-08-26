import type { FountainSymbol } from "./fountain";

export const FrameType = {
  Metadata: 0x00,
  Sequential: 0x01,
  Fountain: 0x02,
} as const;
export type FrameType = typeof FrameType[keyof typeof FrameType];

export interface FileMetadata {
  dataType: "file" | "message";
  fileSize: number;
  blockSize: number;
  totalBlocks: number;
  fileHash: Uint8Array;
  fileName: string;
}

export interface SequentialFrame {
  blockIndex: number;
  payload: Uint8Array;
}

export interface FountainFrame extends FountainSymbol {
  totalBlocks: number;
}

/**
 * Encodes file metadata into a binary frame.
 */
export function encodeMetadataFrame(metadata: FileMetadata): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(metadata.fileName);
  const frame = new Uint8Array(1 + 1 + 4 + 4 + 4 + 32 + 2 + nameBytes.length);

  const view = new DataView(frame.buffer);
  
  view.setUint8(0, FrameType.Metadata);
  view.setUint8(1, metadata.dataType === "message" ? 1 : 0);
  view.setUint32(2, metadata.fileSize);
  view.setUint32(6, metadata.blockSize);
  view.setUint32(10, metadata.totalBlocks);
  
  frame.set(metadata.fileHash, 14);
  view.setUint16(46, nameBytes.length);
  frame.set(nameBytes, 48);

  return frame;
}

/**
 * Decodes a binary frame into file metadata.
 */
export function decodeMetadataFrame(frame: Uint8Array): FileMetadata {
  const fixedHeaderLength = 48;
  if (frame.length < fixedHeaderLength || frame[0] !== FrameType.Metadata) {
    throw new Error("Invalid frame type for metadata");
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const dataTypeFlag = view.getUint8(1);
  if (dataTypeFlag !== 0 && dataTypeFlag !== 1) {
    throw new Error("Invalid metadata data type");
  }
  const dataType: "file" | "message" = dataTypeFlag === 1 ? "message" : "file";
  const fileSize = view.getUint32(2);
  const blockSize = view.getUint32(6);
  const totalBlocks = view.getUint32(10);
  
  const fileHash = frame.slice(14, 46);
  const nameLength = view.getUint16(46);
  if (frame.length < fixedHeaderLength + nameLength) {
    throw new Error("Metadata frame is truncated");
  }
  
  const decoder = new TextDecoder();
  const fileName = decoder.decode(frame.subarray(48, 48 + nameLength));

  return { dataType, fileSize, blockSize, totalBlocks, fileHash, fileName };
}

/**
 * Encodes a sequential block into a binary frame.
 */
export function encodeSequentialFrame(blockIndex: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(1 + 4 + payload.length);
  const view = new DataView(frame.buffer);
  
  view.setUint8(0, FrameType.Sequential);
  view.setUint32(1, blockIndex);
  frame.set(payload, 5);

  return frame;
}

/**
 * Decodes a binary frame into a sequential block.
 */
export function decodeSequentialFrame(frame: Uint8Array): SequentialFrame {
  if (frame[0] !== FrameType.Sequential) {
    throw new Error("Invalid frame type for sequential block");
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const blockIndex = view.getUint32(1);
  const payload = frame.slice(5);

  return { blockIndex, payload };
}

/**
 * Encodes a fountain symbol into a binary frame.
 */
export function encodeFountainFrame(symbol: FountainSymbol, totalBlocks: number): Uint8Array {
  const frame = new Uint8Array(1 + 4 + 2 + 4 + symbol.payload.length);
  const view = new DataView(frame.buffer);

  view.setUint8(0, FrameType.Fountain);
  view.setUint32(1, symbol.seed);
  view.setUint16(5, symbol.degree);
  view.setUint32(7, totalBlocks);
  frame.set(symbol.payload, 11);

  return frame;
}

/**
 * Decodes a binary frame into a fountain symbol.
 */
export function decodeFountainFrame(frame: Uint8Array): FountainFrame {
  if (frame[0] !== FrameType.Fountain) {
    throw new Error("Invalid frame type for fountain symbol");
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const seed = view.getUint32(1);
  const degree = view.getUint16(5);
  const totalBlocks = view.getUint32(7);
  const payload = frame.slice(11);

  return { seed, degree, totalBlocks, payload };
}

/**
 * Helper to convert a Uint8Array into a hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives a stable legacy session identifier from received QR metadata.
 * SHA-256("legacy-qr" || fileHash || fileSize || blockSize || totalBlocks || fileName)
 */
export async function deriveLegacySessionId(metadata: FileMetadata): Promise<string> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode("legacy-qr");
  const nameBytes = encoder.encode(metadata.fileName);
  const sizeBytes = new Uint8Array(12);
  const view = new DataView(sizeBytes.buffer);
  view.setUint32(0, metadata.fileSize);
  view.setUint32(4, metadata.blockSize);
  view.setUint32(8, metadata.totalBlocks);

  const combined = new Uint8Array(prefix.length + metadata.fileHash.length + sizeBytes.length + nameBytes.length);
  let offset = 0;
  combined.set(prefix, offset);
  offset += prefix.length;
  combined.set(metadata.fileHash, offset);
  offset += metadata.fileHash.length;
  combined.set(sizeBytes, offset);
  offset += sizeBytes.length;
  combined.set(nameBytes, offset);

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}
