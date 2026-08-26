import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { VisualOfdmReceiver, type OfdmReceiverGridSize } from "./ofdm-receiver";
import { encodeOfdmFrame, type OfdmModulationScheme } from "./ofdm-framing";
import { modulateOfdmBytes, type OfdmSymbolGrid } from "./ofdm-modulator";
import { idct2D } from "./ofdm-fft";
import { renderOfdmGridToPixels } from "./ofdm-renderer";
import {
  encodeFountainFrame,
  encodeMetadataFrame,
  encodeSequentialFrame,
  type FileMetadata,
} from "../../modules/protocol";
import { FountainEncoder, mulberry32 } from "../../modules/fountain";
import { chunkFile } from "../../modules/chunker";
import { sha256Hex } from "../../core/integrity";

function spatialFromGrid(grid: OfdmSymbolGrid): Float64Array {
  return idct2D(Float64Array.from(grid.carriers, (carrier) => carrier.real), grid.gridSize);
}

function encodedFrame(
  modulation: OfdmModulationScheme,
  gridSize: OfdmReceiverGridSize,
  sequence: number,
  payload: Uint8Array,
): Uint8Array {
  return encodeOfdmFrame({
    version: 1,
    modulation,
    gridSize,
    pilotConfig: 1,
    seqNumber: sequence,
    payload,
  });
}

function ingestBytes(
  receiver: VisualOfdmReceiver,
  bytes: Uint8Array,
  modulation: OfdmModulationScheme,
  gridSize: OfdmReceiverGridSize,
): number {
  const grids = modulateOfdmBytes(bytes, modulation, gridSize);
  for (const grid of grids) receiver.ingestSpatialGrid(spatialFromGrid(grid));
  return grids.length;
}

function transmit(
  receiver: VisualOfdmReceiver,
  modulation: OfdmModulationScheme,
  gridSize: OfdmReceiverGridSize,
  sequence: number,
  payload: Uint8Array,
): number {
  return ingestBytes(receiver, encodedFrame(modulation, gridSize, sequence, payload), modulation, gridSize);
}

describe("Phase 8D end-to-end Visual OFDM receiver", () => {
  for (const modulation of ["bpsk", "qpsk", "16qam"] as const) {
    for (const gridSize of [8, 16, 32] as const) {
      test(`recovers ${modulation} symbols on ${gridSize}x${gridSize} grids`, () => {
        const receiver = new VisualOfdmReceiver({ modulation, gridSize });
        const payload = new Uint8Array([0xa5, 0x5a, 0x31, gridSize]);
        let recovered: Uint8Array | null = null;
        receiver.onFrame((event) => { recovered = event.rawPayload; });
        const gridCount = transmit(receiver, modulation, gridSize, 100 + gridSize, payload);

        assert.deepEqual(recovered, payload);
        const diagnostics = receiver.getDiagnostics();
        assert.equal(diagnostics.activeModulation, modulation);
        assert.equal(diagnostics.gridSize, gridSize);
        assert.equal(diagnostics.frameSequence, 100 + gridSize);
        assert.equal(diagnostics.crcStatus, "valid");
        assert.equal(diagnostics.validFramesCount, 1);
        assert.equal(diagnostics.totalGridsProcessed, gridCount);
        assert.equal(diagnostics.synchronizedGridCount, gridCount);
        assert.ok(diagnostics.recoveredSymbols.length > 0);
        assert.ok(diagnostics.snrEstimateDb > 0);
      });
    }
  }

  test("samples the configured grid from the largest centered square ROI", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "bpsk", gridSize: 8 });
    const width = 12;
    const height = 8;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const value = x >= 2 && x < 10 ? y * 8 + (x - 2) : 250;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
    assert.deepEqual(
      Array.from(receiver.sampleConfiguredGrid({ data, width, height }), Math.round),
      Array.from({ length: 64 }, (_, index) => index),
    );
  });

  test("decodes a rendered camera pixel buffer through ROI cell sampling", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "qpsk", gridSize: 16 });
    const payload = new Uint8Array([4, 8, 15, 16, 23, 42]);
    const grids = modulateOfdmBytes(encodedFrame("qpsk", 16, 200, payload), "qpsk", 16);
    let recovered: Uint8Array | null = null;
    receiver.onFrame((event) => { recovered = event.rawPayload; });
    for (const grid of grids) {
      const rendered = renderOfdmGridToPixels(grid, 96);
      receiver.ingestFrame({ data: rendered.pixelBuffer, width: rendered.width, height: rendered.height });
    }
    assert.deepEqual(recovered, payload);
  });

  test("parses the header while accumulating a multi-grid frame", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "bpsk", gridSize: 8 });
    const payload = new Uint8Array(32).fill(0x6d);
    const bytes = encodedFrame("bpsk", 8, 201, payload);
    const grids = modulateOfdmBytes(bytes, "bpsk", 8);
    assert.ok(grids.length > 3);
    receiver.ingestSpatialGrid(spatialFromGrid(grids[0]));
    receiver.ingestSpatialGrid(spatialFromGrid(grids[1]));
    receiver.ingestSpatialGrid(spatialFromGrid(grids[2]));
    const partial = receiver.getDiagnostics();
    assert.equal(partial.frameSequence, 201);
    assert.equal(partial.expectedFrameBits, bytes.length * 8);
    assert.equal(partial.crcStatus, "pending");
    for (let index = 3; index < grids.length; index++) receiver.ingestSpatialGrid(spatialFromGrid(grids[index]));
    assert.equal(receiver.getDiagnostics().crcStatus, "valid");
  });

  test("rejects a CRC-invalid frame and recovers a trailing valid frame", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "qpsk", gridSize: 8 });
    const corrupt = encodedFrame("qpsk", 8, 202, new Uint8Array([1, 2, 3]));
    corrupt[10] ^= 0x80;
    ingestBytes(receiver, corrupt, "qpsk", 8);
    assert.equal(receiver.getDiagnostics().crcStatus, "invalid");
    transmit(receiver, "qpsk", 8, 203, new Uint8Array([7, 8, 9]));
    assert.equal(receiver.getDiagnostics().crcStatus, "valid");
    assert.equal(receiver.getDiagnostics().validFramesCount, 1);
    assert.equal(receiver.getDiagnostics().corruptFramesCount, 1);
  });

  test("rejects serialized modulation and grid configurations that do not match", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "16qam", gridSize: 16 });
    const wrongModulation = encodedFrame("bpsk", 16, 204, new Uint8Array([1]));
    ingestBytes(receiver, wrongModulation, "16qam", 16);
    const wrongGrid = encodedFrame("16qam", 8, 205, new Uint8Array([2]));
    ingestBytes(receiver, wrongGrid, "16qam", 16);
    assert.equal(receiver.getDiagnostics().validFramesCount, 0);
    assert.equal(receiver.getDiagnostics().corruptFramesCount, 2);
  });

  test("preserves a valid candidate when the final grid exceeds the buffer cap", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "bpsk", gridSize: 8, maxBitBufferSize: 104 });
    transmit(receiver, "bpsk", 8, 206, new Uint8Array([0x5c]));
    assert.equal(receiver.getDiagnostics().crcStatus, "valid");
    assert.equal(receiver.getDiagnostics().frameSequence, 206);
  });

  test("ignores invalid grids and pre-metadata data without contaminating reconstruction", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "16qam", gridSize: 16 });
    receiver.ingestSpatialGrid(new Float64Array(10));
    receiver.ingestSpatialGrid(new Float64Array(257));
    const nonFinite = new Float64Array(256);
    nonFinite[4] = Number.NaN;
    receiver.ingestSpatialGrid(nonFinite);
    assert.equal(receiver.getDiagnostics().totalGridsProcessed, 0);

    const encoder = new FountainEncoder(chunkFile(new Uint8Array(16), 8), 8, mulberry32(4));
    transmit(receiver, "16qam", 16, 207, encodeFountainFrame(encoder.generateSymbol(), 2));
    assert.equal(receiver.getDiagnostics().fountainSymbolsAccepted, 0);
  });

  test("atomically replaces same-shape transfer state and guards asynchronous hashes", async () => {
    const receiver = new VisualOfdmReceiver({ modulation: "16qam", gridSize: 16 });
    const firstData = new Uint8Array(8).fill(0x11);
    const secondData = new Uint8Array(8).fill(0xee);
    const makeMetadata = (fileName: string, marker: number): FileMetadata => ({
      dataType: "file",
      fileSize: 8,
      blockSize: 8,
      totalBlocks: 1,
      fileHash: new Uint8Array(32).fill(marker),
      fileName,
    });
    let sequence = 208;
    transmit(receiver, "16qam", 16, sequence++, encodeMetadataFrame(makeMetadata("same.bin", 1)));
    transmit(receiver, "16qam", 16, sequence++, encodeSequentialFrame(0, firstData));
    const pendingFirstResult = receiver.getReconstructedFileWithHash();
    transmit(receiver, "16qam", 16, sequence++, encodeMetadataFrame(makeMetadata("same.bin", 2)));
    assert.equal(receiver.isReconstructionComplete(), false);
    transmit(receiver, "16qam", 16, sequence++, encodeSequentialFrame(0, secondData));
    const firstResult = await pendingFirstResult;
    assert.ok(firstResult);
    assert.deepEqual(firstResult.data, firstData);
    assert.equal(firstResult.sha256Hex, await sha256Hex(firstData));
    const reconstructed = await receiver.getReconstructedFileWithHash();
    assert.ok(reconstructed);
    assert.deepEqual(reconstructed.data, secondData);
    assert.equal(reconstructed.sha256Hex, await sha256Hex(secondData));
  });

  test("rejects sequential blocks whose dimensions disagree with metadata", () => {
    const receiver = new VisualOfdmReceiver({ modulation: "16qam", gridSize: 16 });
    const metadata: FileMetadata = {
      dataType: "file", fileSize: 8, blockSize: 8, totalBlocks: 1,
      fileHash: new Uint8Array(32), fileName: "short.bin",
    };
    transmit(receiver, "16qam", 16, 212, encodeMetadataFrame(metadata));
    transmit(receiver, "16qam", 16, 213, encodeSequentialFrame(0, new Uint8Array(7)));
    assert.equal(receiver.isReconstructionComplete(), false);
  });

  test("reconstructs sequential frames with bit-perfect SHA-256", async () => {
    const receiver = new VisualOfdmReceiver({ modulation: "qpsk", gridSize: 16 });
    const original = new TextEncoder().encode("Phase 8D deterministic sequential Visual OFDM transfer.");
    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: original.length,
      blockSize: 12,
      totalBlocks: Math.ceil(original.length / 12),
      fileHash: new Uint8Array(32),
      fileName: "phase-8d.txt",
    };
    let sequence = 0;
    transmit(receiver, "qpsk", 16, sequence++, encodeMetadataFrame(metadata));
    for (let index = 0; index < metadata.totalBlocks; index++) {
      transmit(
        receiver,
        "qpsk",
        16,
        sequence++,
        encodeSequentialFrame(index, original.subarray(index * 12, Math.min(original.length, (index + 1) * 12))),
      );
    }
    const reconstructed = await receiver.getReconstructedFileWithHash();
    assert.ok(reconstructed);
    assert.deepEqual(reconstructed.data, original);
    assert.equal(reconstructed.sha256Hex, await sha256Hex(original));
  });

  test("reconstructs fountain frames with bit-perfect SHA-256", async () => {
    const receiver = new VisualOfdmReceiver({ modulation: "16qam", gridSize: 32 });
    const original = new Uint8Array(128);
    for (let index = 0; index < original.length; index++) original[index] = (index * 41 + 19) & 0xff;
    const blockSize = 16;
    const blocks = chunkFile(original, blockSize);
    const encoder = new FountainEncoder(blocks, blockSize, mulberry32(0x8d0fda));
    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: original.length,
      blockSize,
      totalBlocks: blocks.length,
      fileHash: new Uint8Array(32),
      fileName: "phase-8d-fountain.bin",
    };
    let sequence = 0;
    transmit(receiver, "16qam", 32, sequence++, encodeMetadataFrame(metadata));
    for (let sent = 0; !receiver.isReconstructionComplete() && sent < blocks.length * 5; sent++) {
      transmit(receiver, "16qam", 32, sequence++, encodeFountainFrame(encoder.generateSymbol(), blocks.length));
    }
    const reconstructed = await receiver.getReconstructedFileWithHash();
    assert.ok(reconstructed);
    assert.deepEqual(reconstructed.data, original);
    assert.equal(reconstructed.sha256Hex, await sha256Hex(original));
    assert.ok(receiver.getDiagnostics().fountainSymbolsAccepted >= blocks.length);
    assert.equal(receiver.getDiagnostics().reconstructionComplete, true);
  });
});
