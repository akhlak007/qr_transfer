import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { VlcOokReceiver, VlcReceiver, type VlcReceiverModulation } from "./vlc-receiver";
import { encodeVlcFrame, type VlcModulationScheme } from "./vlc-framing";
import { modulateVlcFrame, type VlcModulatedStream } from "./vlc-modulator";
import { encodeFountainFrame, encodeMetadataFrame, type FileMetadata } from "../../modules/protocol";
import { chunkFile } from "../../modules/chunker";
import { FountainEncoder, mulberry32 } from "../../modules/fountain";
import { sha256Hex } from "../../core/integrity";

const framingByReceiver: Record<VlcReceiverModulation, VlcModulationScheme> = {
  ook: "ook",
  "4pam": "pam4",
  csk8: "csk8",
  csk16: "csk16",
};

function ingestStream(receiver: VlcReceiver, stream: VlcModulatedStream, perturbation = 0): void {
  for (let index = 0; index < stream.totalSymbols; index++) {
    const color = stream.colors[index];
    const adjusted = color.map((value, channel) => {
      const signedNoise = ((index + channel * 2) % 3) - 1;
      return Math.max(0, Math.min(255, value + signedNoise * perturbation));
    }) as [number, number, number];
    const luminance = Math.round(0.299 * adjusted[0] + 0.587 * adjusted[1] + 0.114 * adjusted[2]);
    receiver.ingestLuminanceSample(luminance, adjusted);
  }
}

function transmit(
  receiver: VlcReceiver,
  modulation: VlcReceiverModulation,
  sequence: number,
  payload: Uint8Array,
  perturbation = 0,
): void {
  const framing = framingByReceiver[modulation];
  const bytes = encodeVlcFrame({ version: 1, modulation: framing, seqNumber: sequence, payload });
  ingestStream(receiver, modulateVlcFrame(bytes, framing), perturbation);
}

describe("Phase 8C.2 unified VLC receiver", () => {
  for (const modulation of ["ook", "4pam", "csk8", "csk16"] as const) {
    test(`decodes deterministic ${modulation} frames`, () => {
      const receiver = new VlcReceiver({ modulation });
      const payload = new Uint8Array([0xa5, 0x5a, 0x00, 0xff, 0x31]);
      let decodedPayload: Uint8Array | null = null;
      receiver.onFrame((event) => { decodedPayload = event.rawPayload; });

      transmit(receiver, modulation, 70, payload, modulation === "ook" ? 0 : 2);

      assert.deepEqual(decodedPayload, payload);
      const diagnostics = receiver.getDiagnostics();
      assert.equal(diagnostics.activeModulation, modulation);
      assert.equal(diagnostics.frameSequence, 70);
      assert.equal(diagnostics.crcStatus, "valid");
      assert.equal(diagnostics.validFramesCount, 1);
      assert.equal(diagnostics.corruptFramesCount, 0);
      assert.ok(diagnostics.decodedSymbols.length > 0);
      assert.ok(Number.isFinite(diagnostics.symbolErrorEstimate));
    });
  }

  test("retains the VlcOokReceiver constructor and OOK diagnostics", () => {
    const receiver = new VlcOokReceiver({ initialThreshold: 128 });
    transmit(receiver, "ook", 9, new Uint8Array([1, 2, 3]));
    assert.ok(receiver instanceof VlcReceiver);
    assert.equal(receiver.getDiagnostics().activeModulation, "ook");
    assert.equal(receiver.getDiagnostics().crcStatus, "valid");
  });

  test("reports ordered adaptive 4-PAM thresholds and noise tolerance", () => {
    const receiver = new VlcReceiver({ modulation: "4pam", adaptiveSmoothingAlpha: 0.1 });
    transmit(receiver, "4pam", 10, new Uint8Array([0x1b, 0xe4]), 3);
    const diagnostics = receiver.getDiagnostics();
    assert.equal(diagnostics.adaptiveThresholds.length, 3);
    assert.ok(diagnostics.adaptiveThresholds[0] < diagnostics.adaptiveThresholds[1]);
    assert.ok(diagnostics.adaptiveThresholds[1] < diagnostics.adaptiveThresholds[2]);
    assert.ok(diagnostics.symbolErrorEstimate >= 0 && diagnostics.symbolErrorEstimate <= 1);
  });

  for (const modulation of ["csk8", "csk16"] as const) {
    test(`reports ${modulation} color distance and confidence`, () => {
      const receiver = new VlcReceiver({ modulation });
      transmit(receiver, modulation, 11, new Uint8Array([0x12, 0xab, 0xf0]), 1);
      const diagnostics = receiver.getDiagnostics();
      assert.ok(diagnostics.colorClassificationConfidence > 0.5);
      assert.ok(diagnostics.colorClassificationConfidence <= 1);
      assert.ok(diagnostics.colorDistance >= 0);
      assert.deepEqual(diagnostics.adaptiveThresholds, []);
    });
  }

  test("rejects CRC-corrupted frames", () => {
    const receiver = new VlcReceiver({ modulation: "csk16" });
    const bytes = encodeVlcFrame({
      version: 1,
      modulation: "csk16",
      seqNumber: 12,
      payload: new Uint8Array([1, 2, 3, 4]),
    });
    bytes[9] ^= 0x40;
    ingestStream(receiver, modulateVlcFrame(bytes, "csk16"));
    assert.equal(receiver.getDiagnostics().crcStatus, "invalid");
    assert.equal(receiver.getDiagnostics().corruptFramesCount, 1);
  });

  test("isolates explicitly configured modulation modes", () => {
    const receiver = new VlcReceiver({ modulation: "csk8" });
    const bytes = encodeVlcFrame({
      version: 1,
      modulation: "csk16",
      seqNumber: 13,
      payload: new Uint8Array([9, 8, 7]),
    });
    // Use the configured optical encoding but a conflicting serialized header.
    // The receiver must not switch modes based on that header.
    ingestStream(receiver, modulateVlcFrame(bytes, "csk8"));
    assert.equal(receiver.getDiagnostics().validFramesCount, 0);
    assert.equal(receiver.getDiagnostics().crcStatus, "invalid");
    assert.equal(receiver.getDiagnostics().corruptFramesCount, 1);
  });

  test("rejects impossible frame sizes and resumes Barker synchronization", () => {
    const receiver = new VlcReceiver({ modulation: "ook", maxBitBufferSize: 80 });
    transmit(receiver, "ook", 14, new Uint8Array([1]));
    assert.equal(receiver.getDiagnostics().crcStatus, "invalid");
    transmit(receiver, "ook", 15, new Uint8Array());
    assert.equal(receiver.getDiagnostics().crcStatus, "valid");
    assert.equal(receiver.getDiagnostics().frameSequence, 15);
  });

  test("does not mutate state for invalid optical samples", () => {
    const receiver = new VlcReceiver({ modulation: "ook" });
    const before = receiver.getDiagnostics();
    receiver.ingestLuminanceSample(Number.NaN, [0, 0, 0]);
    receiver.ingestFrame({ data: new Uint8Array(3), width: 2, height: 2 });
    const after = receiver.getDiagnostics();
    assert.equal(after.totalSamplesIngested, before.totalSamplesIngested);
    assert.equal(after.adaptiveThreshold, before.adaptiveThreshold);
    assert.throws(() => new VlcReceiver({ modulation: "ook", roiFraction: 0 }), RangeError);
  });

  test("normalizes asymmetric CSK channel attenuation", () => {
    const receiver = new VlcReceiver({ modulation: "csk16", adaptiveSmoothingAlpha: 0.35 });
    const payload = new Uint8Array([0x87, 0x21, 0xde, 0x4b]);
    const bytes = encodeVlcFrame({ version: 1, modulation: "csk16", seqNumber: 16, payload });
    const stream = modulateVlcFrame(bytes, "csk16");
    let recovered: Uint8Array | null = null;
    receiver.onFrame((event) => { recovered = event.rawPayload; });
    for (const color of stream.colors) {
      const attenuated: [number, number, number] = [
        Math.round(color[0] * 0.7),
        Math.round(color[1] * 0.85),
        color[2],
      ];
      const luminance = Math.round(0.299 * attenuated[0] + 0.587 * attenuated[1] + 0.114 * attenuated[2]);
      receiver.ingestLuminanceSample(luminance, attenuated);
    }
    assert.deepEqual(recovered, payload);
  });

  test("clears incompatible reconstruction state on new metadata", () => {
    const receiver = new VlcReceiver({ modulation: "csk16" });
    const first: FileMetadata = {
      dataType: "file", fileSize: 16, blockSize: 8, totalBlocks: 2,
      fileHash: new Uint8Array(32), fileName: "first.bin",
    };
    const second: FileMetadata = {
      dataType: "file", fileSize: 24, blockSize: 8, totalBlocks: 3,
      fileHash: new Uint8Array(32), fileName: "second.bin",
    };
    transmit(receiver, "csk16", 17, encodeMetadataFrame(first));
    const firstEncoder = new FountainEncoder(chunkFile(new Uint8Array(16), 8), 8, mulberry32(1));
    transmit(receiver, "csk16", 18, encodeFountainFrame(firstEncoder.generateSymbol(), 2));
    assert.ok(receiver.getDiagnostics().fountainSymbolsAccepted > 0);
    transmit(receiver, "csk16", 19, encodeMetadataFrame(second));
    assert.equal(receiver.getMetadata()?.fileName, "second.bin");
    assert.equal(receiver.getDiagnostics().fountainSymbolsAccepted, 0);
  });

  test("reconstructs fountain data and verifies SHA-256 over CSK-16", async () => {
    const receiver = new VlcReceiver({ modulation: "csk16" });
    const original = new Uint8Array(96);
    for (let index = 0; index < original.length; index++) original[index] = (index * 29 + 7) & 0xff;
    const blockSize = 16;
    const blocks = chunkFile(original, blockSize);
    const encoder = new FountainEncoder(blocks, blockSize, mulberry32(0x8c2c5c16));
    const metadata: FileMetadata = {
      dataType: "file",
      fileSize: original.length,
      blockSize,
      totalBlocks: blocks.length,
      fileHash: new Uint8Array(32),
      fileName: "phase-8c2.bin",
    };
    let sequence = 0;
    transmit(receiver, "csk16", sequence++, encodeMetadataFrame(metadata));
    for (let sent = 0; !receiver.isReconstructionComplete() && sent < blocks.length * 5; sent++) {
      transmit(receiver, "csk16", sequence++, encodeFountainFrame(encoder.generateSymbol(), blocks.length));
    }

    assert.equal(receiver.isReconstructionComplete(), true);
    const reconstructed = await receiver.getReconstructedFileWithHash();
    assert.ok(reconstructed);
    assert.deepEqual(reconstructed.data, original);
    assert.equal(reconstructed.sha256Hex, await sha256Hex(original));
    assert.ok(receiver.getDiagnostics().fountainSymbolsAccepted >= blocks.length);
  });
});
