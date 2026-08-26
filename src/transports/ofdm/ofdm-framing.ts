/**
 * Visual OFDM (Orthogonal Frequency-Division Multiplexing) Framing Specification (Milestone 4A & 4C)
 *
 * Implements:
 * - 2D Spatial-frequency subcarrier grid model (8x8, 16x16, 32x32)
 * - Deterministic subcarrier allocation (DC, Pilot, Guard, Data)
 * - Binary OFDM frame header, payload serialization, and CRC-16-CCITT integrity validation
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

export const OFDM_MAGIC = new Uint8Array([0x56, 0x4f]); // "VO" in ASCII
export const OFDM_VERSION = 1;

export type OfdmModulationScheme = "bpsk" | "qpsk" | "16qam";

export const OFDM_MODULATION_CODES: Record<OfdmModulationScheme, number> = {
  bpsk: 1,
  qpsk: 2,
  "16qam": 3,
};

export const OFDM_MODULATION_NAMES: Record<number, OfdmModulationScheme> = {
  1: "bpsk",
  2: "qpsk",
  3: "16qam",
};

export type SubcarrierType = "dc" | "pilot" | "guard" | "data";

export interface SubcarrierIndex {
  row: number;
  col: number;
  linearIndex: number;
  type: SubcarrierType;
  pilotSign?: number; // +1 or -1 for pilot carriers
}

export interface SubcarrierGridMap {
  gridSize: number; // e.g. 8, 16, 32
  totalCarriers: number; // gridSize * gridSize
  dataIndices: number[]; // linear indices for data carriers
  pilotIndices: number[]; // linear indices for pilot carriers
  guardIndices: number[]; // linear indices for guard carriers
  dcIndex: number; // linear index of DC carrier
  carriers: SubcarrierIndex[];
}

export interface OfdmFrame {
  version: number;
  modulation: OfdmModulationScheme;
  gridSize: number;
  pilotConfig: number;
  seqNumber: number;
  payload: Uint8Array;
}

export interface OfdmDecodedFrame extends OfdmFrame {
  isValidCrc: boolean;
}

/**
 * Standard CRC-16-CCITT (polynomial 0x1021, initial 0xFFFF)
 */
export function calculateOfdmCrc16(data: Uint8Array): number {
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
 * Build a deterministic subcarrier grid allocation map.
 * - DC carrier placed at (0, 0).
 * - Guard carriers placed at high-frequency outer perimeter.
 * - Pilot carriers placed at regular deterministic intervals with alternating BPSK signs.
 * - Data carriers allocated on all remaining available spatial frequencies.
 */
export function createSubcarrierMap(gridSize = 16, pilotInterval = 4): SubcarrierGridMap {
  const totalCarriers = gridSize * gridSize;
  const carriers: SubcarrierIndex[] = [];
  const dataIndices: number[] = [];
  const pilotIndices: number[] = [];
  const guardIndices: number[] = [];
  const dcIndex = 0;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const linearIndex = row * gridSize + col;

      // 1. DC component
      if (row === 0 && col === 0) {
        carriers.push({ row, col, linearIndex, type: "dc" });
        continue;
      }

      // 2. Guard carriers at high spatial frequencies (outer edge boundary)
      const isGuard = row === gridSize - 1 || col === gridSize - 1;
      if (isGuard) {
        carriers.push({ row, col, linearIndex, type: "guard" });
        guardIndices.push(linearIndex);
        continue;
      }

      // 3. Pilot carriers at deterministic intervals
      const isPilot = row % pilotInterval === 0 && col % pilotInterval === 0;
      if (isPilot) {
        const pilotSign = (row * 3 + col * 7) % 2 === 0 ? 1 : -1;
        carriers.push({ row, col, linearIndex, type: "pilot", pilotSign });
        pilotIndices.push(linearIndex);
        continue;
      }

      // 4. Data carriers
      carriers.push({ row, col, linearIndex, type: "data" });
      dataIndices.push(linearIndex);
    }
  }

  return {
    gridSize,
    totalCarriers,
    dataIndices,
    pilotIndices,
    guardIndices,
    dcIndex,
    carriers,
  };
}

/**
 * Encode an OFDM frame into a binary buffer:
 * [0..1]: Magic 0x56, 0x4F ("VO")
 * [2]: Version (1)
 * [3]: Modulation Code (1=BPSK, 2=QPSK, 3=16QAM)
 * [4]: Grid Size (8, 16, 32)
 * [5]: Pilot Config (1)
 * [6..7]: Sequence Number (uint16 BE)
 * [8..9]: Payload Length (uint16 BE)
 * [10..10+N-1]: Payload Bytes
 * [10+N..11+N]: CRC-16 Checksum (uint16 BE over bytes 0..10+N-1)
 */
export function encodeOfdmFrame(frame: OfdmFrame): Uint8Array {
  const payloadLen = frame.payload.length;
  if (payloadLen > 65535) {
    throw new Error(`OFDM payload exceeds max length 65535 bytes: ${payloadLen}`);
  }

  const headerLen = 10;
  const crcLen = 2;
  const totalLen = headerLen + payloadLen + crcLen;
  const buffer = new Uint8Array(totalLen);

  buffer[0] = OFDM_MAGIC[0];
  buffer[1] = OFDM_MAGIC[1];
  buffer[2] = frame.version;
  buffer[3] = OFDM_MODULATION_CODES[frame.modulation] ?? 1;
  buffer[4] = frame.gridSize;
  buffer[5] = frame.pilotConfig;
  buffer[6] = (frame.seqNumber >> 8) & 0xff;
  buffer[7] = frame.seqNumber & 0xff;
  buffer[8] = (payloadLen >> 8) & 0xff;
  buffer[9] = payloadLen & 0xff;

  buffer.set(frame.payload, headerLen);

  const bodyForCrc = buffer.subarray(0, headerLen + payloadLen);
  const crc = calculateOfdmCrc16(bodyForCrc);

  buffer[headerLen + payloadLen] = (crc >> 8) & 0xff;
  buffer[headerLen + payloadLen + 1] = crc & 0xff;

  return buffer;
}

/**
 * Decode and validate an OFDM binary frame.
 */
export function decodeOfdmFrame(buffer: Uint8Array): OfdmDecodedFrame | null {
  const headerLen = 10;
  const crcLen = 2;

  if (buffer.length < headerLen + crcLen) {
    return null;
  }

  if (buffer[0] !== OFDM_MAGIC[0] || buffer[1] !== OFDM_MAGIC[1]) {
    return null;
  }

  const version = buffer[2];
  const modCode = buffer[3];
  const modulation = OFDM_MODULATION_NAMES[modCode];
  if (!modulation) return null;

  const gridSize = buffer[4];
  const pilotConfig = buffer[5];
  const seqNumber = (buffer[6] << 8) | buffer[7];
  const payloadLen = (buffer[8] << 8) | buffer[9];

  if (buffer.length < headerLen + payloadLen + crcLen) {
    return null;
  }

  const payload = buffer.slice(headerLen, headerLen + payloadLen);
  const receivedCrc = (buffer[headerLen + payloadLen] << 8) | buffer[headerLen + payloadLen + 1];

  const bodyForCrc = buffer.subarray(0, headerLen + payloadLen);
  const computedCrc = calculateOfdmCrc16(bodyForCrc);

  return {
    version,
    modulation,
    gridSize,
    pilotConfig,
    seqNumber,
    payload,
    isValidCrc: receivedCrc === computedCrc,
  };
}
