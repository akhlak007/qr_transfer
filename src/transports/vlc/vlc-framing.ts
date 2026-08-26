/**
 * VLC (Visible Light Communication) Framing Specification (Milestone 3A)
 *
 * Implements optical frame structure, 11-bit Barker synchronization code,
 * header encoding/decoding, and CRC-16 checksum integrity validation.
 *
 * NOTE: This is part of the Experimental VLC Research Prototype.
 */

export const VLC_MAGIC = new Uint8Array([0x56, 0x4c]); // "VL" in ASCII
export const VLC_VERSION = 1;

export type VlcModulationScheme = "ook" | "pam4" | "csk8" | "csk16";

export const VLC_MODULATION_CODES: Record<VlcModulationScheme, number> = {
  ook: 1,
  pam4: 2,
  csk8: 3,
  csk16: 4,
};

export const VLC_MODULATION_NAMES: Record<number, VlcModulationScheme> = {
  1: "ook",
  2: "pam4",
  3: "csk8",
  4: "csk16",
};

/**
 * 11-bit Barker Code: [1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0]
 * Optimal autocorrelation properties for frame synchronization.
 */
export const BARKER_11_BITS = new Uint8Array([1, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0]);

export interface VlcFrame {
  version: number;
  modulation: VlcModulationScheme;
  seqNumber: number;
  payload: Uint8Array;
}

export interface VlcDecodedFrame extends VlcFrame {
  isValidCrc: boolean;
}

/**
 * Standard CRC-16-CCITT (polynomial 0x1021, init 0xFFFF)
 */
export function calculateVlcCrc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Encode a VLC frame into a serialized byte buffer:
 * [0..1]: Magic 0x56, 0x4C
 * [2]: Version (1)
 * [3]: Modulation Code (1=OOK, 2=PAM4)
 * [4..5]: Sequence Number (uint16 Big-Endian)
 * [6..7]: Payload Length (uint16 Big-Endian)
 * [8..8+N-1]: Payload Bytes
 * [8+N..9+N]: CRC-16 Checksum (uint16 Big-Endian over bytes 0..8+N-1)
 */
export function encodeVlcFrame(frame: VlcFrame): Uint8Array {
  const payloadLen = frame.payload.length;
  if (payloadLen > 65535) {
    throw new Error(`VLC payload exceeds max length 65535 bytes: ${payloadLen}`);
  }

  const headerLen = 8;
  const crcLen = 2;
  const totalLen = headerLen + payloadLen + crcLen;
  const buffer = new Uint8Array(totalLen);

  // Magic
  buffer[0] = VLC_MAGIC[0];
  buffer[1] = VLC_MAGIC[1];
  // Version
  buffer[2] = frame.version;
  // Modulation
  buffer[3] = VLC_MODULATION_CODES[frame.modulation] ?? 1;
  // Sequence Number
  buffer[4] = (frame.seqNumber >> 8) & 0xff;
  buffer[5] = frame.seqNumber & 0xff;
  // Payload Length
  buffer[6] = (payloadLen >> 8) & 0xff;
  buffer[7] = payloadLen & 0xff;
  // Payload
  buffer.set(frame.payload, headerLen);

  // Compute CRC over header + payload
  const bodyForCrc = buffer.subarray(0, headerLen + payloadLen);
  const crc = calculateVlcCrc16(bodyForCrc);

  // Append CRC
  buffer[headerLen + payloadLen] = (crc >> 8) & 0xff;
  buffer[headerLen + payloadLen + 1] = crc & 0xff;

  return buffer;
}

/**
 * Decode and validate a serialized VLC frame buffer.
 */
export function decodeVlcFrame(buffer: Uint8Array): VlcDecodedFrame | null {
  const headerLen = 8;
  const crcLen = 2;

  if (buffer.length < headerLen + crcLen) {
    return null; // Incomplete header
  }

  // Verify Magic
  if (buffer[0] !== VLC_MAGIC[0] || buffer[1] !== VLC_MAGIC[1]) {
    return null; // Invalid magic
  }

  const version = buffer[2];
  const modCode = buffer[3];
  const modulation = VLC_MODULATION_NAMES[modCode];
  if (!modulation) {
    return null; // Unknown modulation
  }

  const seqNumber = (buffer[4] << 8) | buffer[5];
  const payloadLen = (buffer[6] << 8) | buffer[7];

  if (buffer.length < headerLen + payloadLen + crcLen) {
    return null; // Truncated frame
  }

  const payload = buffer.slice(headerLen, headerLen + payloadLen);
  const receivedCrc = (buffer[headerLen + payloadLen] << 8) | buffer[headerLen + payloadLen + 1];

  const bodyForCrc = buffer.subarray(0, headerLen + payloadLen);
  const computedCrc = calculateVlcCrc16(bodyForCrc);
  const isValidCrc = receivedCrc === computedCrc;

  return {
    version,
    modulation,
    seqNumber,
    payload,
    isValidCrc,
  };
}

/**
 * Search for Barker-11 synchronization sequence within an array of binary bits.
 * Computes normalized cross-correlation and returns the starting index of peak match.
 */
export function findBarkerSyncIndex(bits: Uint8Array | number[], minCorrelation = 0.8): number {
  if (bits.length < BARKER_11_BITS.length) return -1;

  let bestIndex = -1;
  let maxScore = -1;

  for (let i = 0; i <= bits.length - BARKER_11_BITS.length; i++) {
    let matchCount = 0;
    for (let j = 0; j < BARKER_11_BITS.length; j++) {
      if (bits[i + j] === BARKER_11_BITS[j]) {
        matchCount++;
      }
    }

    const score = matchCount / BARKER_11_BITS.length;
    if (score >= minCorrelation && score > maxScore) {
      maxScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}
