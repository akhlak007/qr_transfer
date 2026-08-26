import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { VlcOokReceiver } from "./vlc-receiver";
import { encodeVlcFrame, type VlcFrame } from "./vlc-framing";
import { modulateVlcFrame } from "./vlc-modulator";
import {
  encodeMetadataFrame,
  encodeFountainFrame,
  encodeSequentialFrame,
  type FileMetadata,
} from "../../modules/protocol";
import { chunkFile } from "../../modules/chunker";
import { FountainEncoder, mulberry32 } from "../../modules/fountain";
import { sha256Hex } from "../../core/integrity";

/**
 * Helper to synthesize a 2D camera frame (ImageData buffer)
 * with a uniform or patterned optical center.
 */
function createSyntheticCameraFrame(
  width: number,
  height: number,
  centerLuminance: number,
  borderLuminance = 20
): { data: Uint8Array; width: number; height: number } {
  const data = new Uint8Array(width * height * 4);
  const roiW = Math.floor(width * 0.5);
  const roiH = Math.floor(height * 0.5);
  const startX = Math.floor((width - roiW) / 2);
  const startY = Math.floor((height - roiH) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isCenter = x >= startX && x < startX + roiW && y >= startY && y < startY + roiH;
      const val = isCenter ? centerLuminance : borderLuminance;
      data[idx] = val;     // R
      data[idx + 1] = val; // G
      data[idx + 2] = val; // B
      data[idx + 3] = 255; // A
    }
  }

  return { data, width, height };
}

describe("End-to-End VLC OOK Optical Receiver (Phase 8C.1)", () => {
  test("Optical Center Region-of-Interest (ROI) luminance sampling from camera frames", () => {
    const receiver = new VlcOokReceiver({ roiFraction: 0.5 });

    // Frame with center=230 and border=10 (640x480 high resolution)
    const highFrame = createSyntheticCameraFrame(640, 480, 230, 10);
    const diagHigh = receiver.ingestFrame(highFrame);

    assert.equal(diagHigh.sampledLuminance, 230);
    assert.deepEqual(diagHigh.sampledRgb, [230, 230, 230]);
    assert.equal(diagHigh.totalSamplesIngested, 1);

    // Frame with center=35 and border=240
    const lowFrame = createSyntheticCameraFrame(640, 480, 35, 240);
    const diagLow = receiver.ingestFrame(lowFrame);

    assert.equal(diagLow.sampledLuminance, 35);
    assert.deepEqual(diagLow.sampledRgb, [35, 35, 35]);
    assert.equal(diagLow.totalSamplesIngested, 2);
  });

  test("Dynamic adaptive thresholding and SNR estimation under ambient baseline drift", () => {
    const receiver = new VlcOokReceiver({
      initialThreshold: 128,
      adaptiveSmoothingAlpha: 0.25,
      minDynamicRange: 20,
    });

    // Ingest simulated optical waveform with ambient baseline at 40 and ON pulse at 210
    for (let i = 0; i < 20; i++) {
      receiver.ingestLuminanceSample(i % 2 === 0 ? 210 : 40);
    }

    const diag = receiver.getDiagnostics();
    // Midpoint threshold should adapt near (210 + 40) / 2 = 125
    assert.ok(diag.adaptiveThreshold >= 110 && diag.adaptiveThreshold <= 140);
    assert.ok(diag.snrEstimateDb > 10, `SNR should be healthy (>10 dB), got ${diag.snrEstimateDb} dB`);
  });

  test("Symbol timing lock acquisition using Barker-11 synchronization sequence", () => {
    const receiver = new VlcOokReceiver({ initialThreshold: 128 });

    // 1. Ingest asynchronous noise (should not lock)
    for (const noise of [0, 0, 1, 0, 1, 1, 0, 0]) {
      receiver.ingestLuminanceSample(noise === 1 ? 240 : 15);
    }
    assert.equal(receiver.getDiagnostics().symbolTimingLock, false);

    // 2. Modulate a single VLC test frame
    const payload = new TextEncoder().encode("VLC_PREAMBLE_LOCK_TEST");
    const frame: VlcFrame = {
      version: 1,
      modulation: "ook",
      seqNumber: 42,
      payload,
    };
    const encodedFrame = encodeVlcFrame(frame);
    const stream = modulateVlcFrame(encodedFrame, "ook");

    // Ingest optical stream symbols
    for (let i = 0; i < stream.totalSymbols; i++) {
      receiver.ingestLuminanceSample(stream.levels[i]);
    }

    const diag = receiver.getDiagnostics();
    assert.equal(diag.symbolTimingLock, true, "Symbol timing lock should be acquired");
    assert.equal(diag.crcStatus, "valid", "CRC status should be valid");
    assert.equal(diag.frameSequence, 42, "Sequence number should match");
    assert.equal(diag.validFramesCount, 1, "Valid frames count should be 1");
    assert.equal(diag.corruptFramesCount, 0, "Corrupt frames count should be 0");
  });

  test("Rejection of corrupted frames and CRC-16 failure detection", () => {
    const receiver = new VlcOokReceiver({ initialThreshold: 128 });

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const frame: VlcFrame = {
      version: 1,
      modulation: "ook",
      seqNumber: 101,
      payload,
    };
    const encodedFrame = encodeVlcFrame(frame);
    // Corrupt one payload byte
    encodedFrame[10] ^= 0xff;

    const stream = modulateVlcFrame(encodedFrame, "ook");
    for (let i = 0; i < stream.totalSymbols; i++) {
      receiver.ingestLuminanceSample(stream.levels[i]);
    }

    const diag = receiver.getDiagnostics();
    assert.equal(diag.crcStatus, "invalid", "Corrupted frame should trigger CRC failure");
    assert.equal(diag.validFramesCount, 0, "Valid frames count should be 0");
    assert.ok(diag.corruptFramesCount >= 1, "Corrupt frames count should increment");
  });

  test("End-to-End file reconstruction via sequential VLC frames", async () => {
    const receiver = new VlcOokReceiver();

    const originalText = "Deterministic VLC sequential file transfer test 2026.";
    const originalBytes = new TextEncoder().encode(originalText);
    const expectedSha256 = await sha256Hex(originalBytes);

    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: originalBytes.length,
      blockSize: 16,
      totalBlocks: Math.ceil(originalBytes.length / 16),
      fileHash: new Uint8Array(32),
      fileName: "seq_test.txt",
    };

    // 1. Transmit Metadata frame
    const metaPayload = encodeMetadataFrame(metadata);
    const metaFrame = encodeVlcFrame({
      version: 1,
      modulation: "ook",
      seqNumber: 0,
      payload: metaPayload,
    });
    const metaStream = modulateVlcFrame(metaFrame, "ook");
    for (let i = 0; i < metaStream.totalSymbols; i++) {
      receiver.ingestLuminanceSample(metaStream.levels[i]);
    }

    // 2. Transmit Sequential data frames
    for (let blockIdx = 0; blockIdx < metadata.totalBlocks; blockIdx++) {
      const start = blockIdx * metadata.blockSize;
      const end = Math.min(start + metadata.blockSize, originalBytes.length);
      const blockBytes = originalBytes.subarray(start, end);
      const seqPayload = encodeSequentialFrame(blockIdx, blockBytes);

      const seqVlcFrame = encodeVlcFrame({
        version: 1,
        modulation: "ook",
        seqNumber: blockIdx + 1,
        payload: seqPayload,
      });

      const stream = modulateVlcFrame(seqVlcFrame, "ook");
      for (let i = 0; i < stream.totalSymbols; i++) {
        receiver.ingestLuminanceSample(stream.levels[i]);
      }
    }

    assert.equal(receiver.isReconstructionComplete(), true, "Sequential reconstruction should be complete");
    const reconstructed = await receiver.getReconstructedFileWithHash();
    assert.ok(reconstructed, "Reconstructed file object must not be null");
    assert.equal(reconstructed.sha256Hex, expectedSha256, "Bit-perfect SHA-256 match required");
    assert.deepEqual(reconstructed.data, originalBytes, "Reconstructed bytes must match original exactly");
  });

  test("End-to-End Fountain code file reconstruction over synthetic camera frames (Bit-Perfect SHA-256)", async () => {
    const receiver = new VlcOokReceiver({ roiFraction: 0.5 });

    // Generate high-entropy structured file payload (256 bytes)
    const fileBytes = new Uint8Array(256);
    for (let i = 0; i < fileBytes.length; i++) {
      fileBytes[i] = (i * 37 + 13) & 0xff;
    }
    const expectedSha256 = await sha256Hex(fileBytes);

    const blockSize = 32;
    const blocks = chunkFile(fileBytes, blockSize);
    const totalBlocks = blocks.length; // 8 blocks
    const encoder = new FountainEncoder(blocks, blockSize, mulberry32(0x564c4331));

    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: fileBytes.length,
      blockSize,
      totalBlocks,
      fileHash: new Uint8Array(32),
      fileName: "optical_fountain_transfer.bin",
    };

    let frameSequenceCounter = 0;

    // Helper to send a VLC frame by rendering synthetic camera frames (32x24)
    const transmitVlcPayloadOverCameraFrames = (payload: Uint8Array) => {
      const vlcFrame = encodeVlcFrame({
        version: 1,
        modulation: "ook",
        seqNumber: frameSequenceCounter++,
        payload,
      });

      const stream = modulateVlcFrame(vlcFrame, "ook");

      for (let s = 0; s < stream.totalSymbols; s++) {
        const symbolLuma = stream.levels[s];
        // Render 32x24 camera frame with center ROI displaying the optical symbol
        const cameraFrame = createSyntheticCameraFrame(32, 24, symbolLuma, 25);
        receiver.ingestFrame(cameraFrame);
      }
    };

    // 1. Transmit Metadata frame over optical channel
    transmitVlcPayloadOverCameraFrames(encodeMetadataFrame(metadata));

    // 2. Transmit Fountain symbols over optical channel until decoding converges
    let symbolsSent = 0;
    while (!receiver.isReconstructionComplete() && symbolsSent < totalBlocks * 4) {
      const symbol = encoder.generateSymbol();
      const fountainPayload = encodeFountainFrame(symbol, totalBlocks);
      transmitVlcPayloadOverCameraFrames(fountainPayload);
      symbolsSent++;
    }

    assert.equal(receiver.isReconstructionComplete(), true, "Fountain code reconstruction must complete");
    const reconstructed = await receiver.getReconstructedFileWithHash();
    assert.ok(reconstructed, "Reconstructed file must not be null");
    assert.equal(reconstructed.sha256Hex, expectedSha256, "Bit-perfect SHA-256 match required");
    assert.deepEqual(reconstructed.data, fileBytes, "Reconstructed bytes must match original byte-for-byte");

    const diag = receiver.getDiagnostics();
    assert.equal(diag.crcStatus, "valid");
    assert.ok(diag.validFramesCount > totalBlocks, `Decoded frames (${diag.validFramesCount}) should exceed total blocks`);
    assert.equal(diag.corruptFramesCount, 0, "No corrupt frames should occur in clean synthetic channel");
  });
});
