import { bytesToHex } from "../modules/protocol";

export type IntegrityStatus = "waiting" | "verifying" | "verified" | "mismatch" | "unavailable";

export interface IntegrityResult {
  status: IntegrityStatus;
  expectedHashHex?: string;
  actualHashHex?: string;
  expectedSize?: number;
  actualSize?: number;
  bitPerfect: boolean;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", source));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(await sha256(bytes));
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function createIntegrityResult(
  expectedHash: Uint8Array | null,
  actualHash: Uint8Array,
  expectedSize: number,
  actualSize: number,
): IntegrityResult {
  if (!expectedHash) {
    return {
      status: "unavailable",
      actualHashHex: bytesToHex(actualHash),
      expectedSize,
      actualSize,
      bitPerfect: false,
    };
  }

  const matches = equalBytes(expectedHash, actualHash);
  const sameSize = expectedSize === actualSize;
  return {
    status: matches && sameSize ? "verified" : "mismatch",
    expectedHashHex: bytesToHex(expectedHash),
    actualHashHex: bytesToHex(actualHash),
    expectedSize,
    actualSize,
    bitPerfect: matches && sameSize,
  };
}
