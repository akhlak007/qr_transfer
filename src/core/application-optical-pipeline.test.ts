import assert from "node:assert/strict";
import test from "node:test";
import { isVlcDecodeAttemptDue, LiveReceiverRouter, OpticalFrameScheduler } from "./application-optical-pipeline";
import { TransportId } from "./transport";
import { decodeVlcFrame, VLC_MAGIC } from "../transports/vlc/vlc-framing";
import { createVlcRenderRepresentation } from "../transports/vlc/vlc-transmitter-renderer";
import { decodeOfdmFrame, OFDM_MAGIC, type OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";
import { createVisualOfdmRenderRepresentation } from "../transports/ofdm/visual-ofdm-transmitter-renderer";
import { chunkFile, reassembleFile } from "../modules/chunker";
import { FountainDecoder, FountainEncoder, mulberry32 } from "../modules/fountain";
import {
  decodeFountainFrame,
  decodeMetadataFrame,
  encodeFountainFrame,
  encodeMetadataFrame,
  FrameType,
} from "../modules/protocol";
import { sha256, sha256Hex } from "./integrity";

test("VLC scheduler does not advance application frames until every symbol renders", () => {
  const scheduler = new OpticalFrameScheduler({
    transport: TransportId.VLC, vlcModulation: "ook", ofdmModulation: "bpsk", ofdmGridSize: 8,
  });
  scheduler.beginFrame(new Uint8Array([1, 2, 3]));
  const total = scheduler.getSnapshot().totalOpticalSymbols;
  assert.ok(total > 1);
  assert.throws(() => scheduler.beginFrame(new Uint8Array([4])));
  for (let index = 0; index < total - 1; index++) assert.equal(scheduler.markRendered(), false);
  assert.equal(scheduler.getSnapshot().applicationFrameSequence, 0);
  assert.equal(scheduler.markRendered(), true);
  assert.equal(scheduler.getSnapshot().applicationFrameSequence, 1);
});

test("OFDM scheduler keeps one payload active across all generated grids", () => {
  const scheduler = new OpticalFrameScheduler({
    transport: TransportId.VisualOFDM, vlcModulation: "ook", ofdmModulation: "bpsk", ofdmGridSize: 8,
  });
  scheduler.beginFrame(new Uint8Array(200).fill(0x5a));
  const total = scheduler.getSnapshot().totalOpticalGrids;
  assert.ok(total > 1);
  for (let index = 0; index < total - 1; index++) assert.equal(scheduler.markRendered(), false);
  assert.equal(scheduler.markRendered(), true);
  assert.equal(scheduler.getSnapshot().applicationFrameSequence, 1);
});

test("live receiver routing is explicit and never invokes QR for VLC or OFDM", async () => {
  let qrCalls = 0;
  const qrDecoder = async () => {
    qrCalls++;
    return { outcome: "no-signal" as const, durationMs: 0, capturedAt: 0 };
  };
  const sample = { data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 };
  await new LiveReceiverRouter({ transport: TransportId.VLC, ofdmModulation: "bpsk", ofdmGridSize: 8 }, qrDecoder).ingest(sample);
  await new LiveReceiverRouter({ transport: TransportId.VisualOFDM, ofdmModulation: "bpsk", ofdmGridSize: 8 }, qrDecoder).ingest(sample);
  assert.equal(qrCalls, 0);
  const qrResult = await new LiveReceiverRouter({ transport: TransportId.QR, ofdmModulation: "bpsk", ofdmGridSize: 8 }, qrDecoder).ingest(sample);
  assert.equal(qrCalls, 1);
  assert.equal(qrResult.crcStatus, "not-applicable");
});

test("unknown live receiver transport fails explicitly", () => {
  assert.throws(() => new LiveReceiverRouter({
    transport: "unknown" as typeof TransportId.QR,
    ofdmModulation: "bpsk",
    ofdmGridSize: 8,
  }), /Unsupported live receiver transport/);
});

test("VLC camera frames are sampled at the configured symbol rate", () => {
  assert.equal(isVlcDecodeAttemptDue(1_000, 1_099, 10), false);
  assert.equal(isVlcDecodeAttemptDue(1_000, 1_100, 10), true);
  assert.equal(isVlcDecodeAttemptDue(1_000, 1_016, 60), false);
  assert.equal(isVlcDecodeAttemptDue(1_000, 1_017, 60), true);
  assert.equal(isVlcDecodeAttemptDue(1_000, 2_000, 0), false);
});

test("live VLC router uses the selected modulation", async () => {
  const payload = new Uint8Array([FrameType.Sequential, 0, 0, 0, 0]);
  const scheduler = new OpticalFrameScheduler({
    transport: TransportId.VLC, vlcModulation: "csk8", ofdmModulation: "bpsk", ofdmGridSize: 8,
  });
  const router = new LiveReceiverRouter({
    transport: TransportId.VLC, vlcModulation: "csk8", ofdmModulation: "bpsk", ofdmGridSize: 8,
  });
  scheduler.beginFrame(payload);
  const recovered: Uint8Array[] = [];
  for (let index = 0; index < scheduler.getSnapshot().totalOpticalSymbols; index++) {
    const representation = createVlcRenderRepresentation(scheduler.getActiveBytes(), {
      transport: TransportId.VLC, vlcModulation: "csk8", opticalUnitIndex: index,
      symbolRate: 10, frameSequence: 0,
    });
    const result = await router.ingest(solidVlcSample(
      representation.stream.levels[index], representation.color,
    ));
    recovered.push(...result.payloads);
  }
  assert.deepEqual(recovered, [payload]);
});

function solidVlcSample(level: number, color: readonly number[]) {
  const data = new Uint8ClampedArray(2 * 2 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
  }
  // Preserve the renderer's luminance representation for OOK.
  if (color[0] === color[1] && color[1] === color[2]) {
    for (let offset = 0; offset < data.length; offset += 4) data[offset] = data[offset + 1] = data[offset + 2] = level;
  }
  return { data, width: 2, height: 2 };
}

async function applicationFountainFrames(payload: Uint8Array): Promise<Uint8Array[]> {
  const blockSize = 16;
  const blocks = chunkFile(payload, blockSize);
  const metadata = encodeMetadataFrame({
    dataType: "file", fileSize: payload.length, blockSize, totalBlocks: blocks.length,
    fileHash: await sha256(payload), fileName: "phase-9.1.bin",
  });
  const encoder = new FountainEncoder(blocks, blockSize, mulberry32(0x901));
  return [metadata, encodeFountainFrame(encoder.generateSymbol(), blocks.length)];
}

async function verifyRecoveredFountainPayload(frames: Uint8Array[], expected: Uint8Array) {
  const metadataFrame = frames.find((frame) => frame[0] === FrameType.Metadata);
  assert.ok(metadataFrame);
  const metadata = decodeMetadataFrame(metadataFrame);
  const decoder = new FountainDecoder(metadata.totalBlocks, metadata.blockSize);
  for (const frame of frames) {
    if (frame[0] !== FrameType.Fountain) continue;
    const symbol = decodeFountainFrame(frame);
    decoder.processSymbol({ seed: symbol.seed, degree: symbol.degree, payload: symbol.payload });
  }
  assert.equal(decoder.isDone(), true);
  const reconstructed = reassembleFile(decoder.getResolvedBlocks(), metadata.fileSize, metadata.blockSize);
  assert.equal(await sha256Hex(reconstructed), await sha256Hex(expected));
}

test("composed live VLC path frames once, validates CRC, and reconstructs fountain payload", async () => {
  const expected = Uint8Array.from({ length: 12 }, (_, index) => index * 13 + 3);
  const scheduler = new OpticalFrameScheduler({
    transport: TransportId.VLC, vlcModulation: "ook", ofdmModulation: "bpsk", ofdmGridSize: 8,
  });
  const router = new LiveReceiverRouter({ transport: TransportId.VLC, ofdmModulation: "bpsk", ofdmGridSize: 8 });
  const recovered: Uint8Array[] = [];
  for (const applicationFrame of await applicationFountainFrames(expected)) {
    scheduler.beginFrame(applicationFrame);
    const framed = scheduler.getActiveBytes();
    assert.deepEqual(Array.from(framed.subarray(0, 2)), Array.from(VLC_MAGIC));
    const decoded = decodeVlcFrame(framed);
    assert.ok(decoded);
    assert.deepEqual(decoded.payload, applicationFrame);
    const totalSymbols = scheduler.getSnapshot().totalOpticalSymbols;
    for (let index = 0; index < totalSymbols; index++) {
      const representation = createVlcRenderRepresentation(framed, {
        transport: TransportId.VLC, vlcModulation: "ook", opticalUnitIndex: index,
        symbolRate: 1, frameSequence: scheduler.getSnapshot().applicationFrameSequence,
      });
      const result = await router.ingest(solidVlcSample(
        representation.stream.levels[representation.index], representation.color,
      ));
      recovered.push(...result.payloads);
      assert.equal(scheduler.getOpticalUnitIndex(), index);
      scheduler.markRendered();
    }
  }
  assert.equal(recovered.length, 2);
  await verifyRecoveredFountainPayload(recovered, expected);
});

for (const modulation of ["bpsk", "qpsk", "16qam"] as const) {
  for (const gridSize of [8, 16, 32] as const) {
    test(`composed live OFDM ${modulation} ${gridSize}x${gridSize} frames once, validates CRC, and reconstructs`, async () => {
      const expected = Uint8Array.from({ length: 12 }, (_, index) => index * 17 + 5);
      const scheduler = new OpticalFrameScheduler({
        transport: TransportId.VisualOFDM, vlcModulation: "ook", ofdmModulation: modulation, ofdmGridSize: gridSize,
      });
      const router = new LiveReceiverRouter({ transport: TransportId.VisualOFDM, ofdmModulation: modulation, ofdmGridSize: gridSize });
      const recovered: Uint8Array[] = [];
      for (const applicationFrame of await applicationFountainFrames(expected)) {
        scheduler.beginFrame(applicationFrame);
        const framed = scheduler.getActiveBytes();
        assert.deepEqual(Array.from(framed.subarray(0, 2)), Array.from(OFDM_MAGIC));
        const decoded = decodeOfdmFrame(framed);
        assert.ok(decoded);
        assert.deepEqual(decoded.payload, applicationFrame);
        const totalGrids = scheduler.getSnapshot().totalOpticalGrids;
        for (let index = 0; index < totalGrids; index++) {
          const { grids, rendered } = createVisualOfdmRenderRepresentation(framed, {
            transport: TransportId.VisualOFDM,
            ofdmModulation: modulation as OfdmModulationScheme,
            ofdmGridSize: gridSize,
            opticalUnitIndex: index,
            symbolRate: 1,
            frameSequence: scheduler.getSnapshot().applicationFrameSequence,
          }, 96);
          assert.equal(grids.length, totalGrids);
          const result = await router.ingest({ data: rendered.pixelBuffer, width: rendered.width, height: rendered.height });
          recovered.push(...result.payloads);
          assert.equal(scheduler.getOpticalUnitIndex(), index);
          scheduler.markRendered();
        }
      }
      assert.equal(recovered.length, 2);
      await verifyRecoveredFountainPayload(recovered, expected);
    });
  }
}
