import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createSubcarrierMap,
  encodeOfdmFrame,
  decodeOfdmFrame,
  type OfdmFrame,
} from "./ofdm-framing";
import {
  modulateBpskBit,
  modulateQpskBits,
  demodulateBpskSymbol,
  demodulateQpskSymbol,
  modulateOfdmBytes,
} from "./ofdm-modulator";
import { VisualOfdmTransport } from "./ofdm-transport";

describe("Visual OFDM Framing, Subcarrier Grid & Constellations (Milestone 4A)", () => {
  test("allocates subcarrier grids deterministically for 8x8, 16x16, and 32x32", () => {
    for (const size of [8, 16, 32]) {
      const map = createSubcarrierMap(size);
      assert.equal(map.gridSize, size);
      assert.equal(map.totalCarriers, size * size);
      assert.equal(map.dcIndex, 0);

      // Verify non-overlapping disjoint sets of subcarriers
      const totalCount =
        1 + // DC
        map.pilotIndices.length +
        map.guardIndices.length +
        map.dataIndices.length;

      assert.equal(totalCount, size * size);
      assert.ok(map.dataIndices.length > 0);
      assert.ok(map.pilotIndices.length > 0);
      assert.ok(map.guardIndices.length > 0);
    }
  });

  test("modulates and demodulates BPSK and QPSK constellation points with energy normalization", () => {
    // 1. BPSK: 0 -> -1, 1 -> +1
    const s0 = modulateBpskBit(0);
    const s1 = modulateBpskBit(1);
    assert.equal(s0.real, -1.0);
    assert.equal(s1.real, 1.0);
    assert.equal(demodulateBpskSymbol(s0), 0);
    assert.equal(demodulateBpskSymbol(s1), 1);

    // 2. QPSK: 00, 01, 10, 11
    const q00 = modulateQpskBits(0, 0);
    const q01 = modulateQpskBits(0, 1);
    const q10 = modulateQpskBits(1, 0);
    const q11 = modulateQpskBits(1, 1);

    // Verify average unit constellation energy: sum(|s|^2)/4 = 1.0
    const avgEnergy = (q00.real * q00.real + q01.real * q01.real + q10.real * q10.real + q11.real * q11.real) / 4;
    assert.ok(Math.abs(avgEnergy - 1.0) < 1e-6);

    assert.deepEqual(demodulateQpskSymbol(q00), [0, 0]);
    assert.deepEqual(demodulateQpskSymbol(q01), [0, 1]);
    assert.deepEqual(demodulateQpskSymbol(q10), [1, 0]);
    assert.deepEqual(demodulateQpskSymbol(q11), [1, 1]);
  });

  test("encodes and decodes binary OFDM frames with valid CRC-16", () => {
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const frame: OfdmFrame = {
      version: 1,
      modulation: "qpsk",
      gridSize: 16,
      pilotConfig: 1,
      seqNumber: 42,
      payload,
    };

    const bytes = encodeOfdmFrame(frame);
    assert.equal(bytes.length, 10 + payload.length + 2); // 10 header + 8 payload + 2 CRC

    const decoded = decodeOfdmFrame(bytes);
    assert.ok(decoded !== null);
    assert.equal(decoded.version, 1);
    assert.equal(decoded.modulation, "qpsk");
    assert.equal(decoded.gridSize, 16);
    assert.equal(decoded.seqNumber, 42);
    assert.deepEqual(decoded.payload, payload);
    assert.equal(decoded.isValidCrc, true);
  });

  test("detects corrupted frame payload, invalid CRC, and truncated frames", () => {
    const payload = new Uint8Array([10, 20, 30, 40]);
    const frame: OfdmFrame = {
      version: 1,
      modulation: "bpsk",
      gridSize: 8,
      pilotConfig: 1,
      seqNumber: 1,
      payload,
    };
    const bytes = encodeOfdmFrame(frame);

    // Corrupt bit in payload (byte 12)
    const corrupted = new Uint8Array(bytes);
    corrupted[11] ^= 0x01;
    const decodedCorrupt = decodeOfdmFrame(corrupted);
    assert.ok(decodedCorrupt !== null);
    assert.equal(decodedCorrupt.isValidCrc, false);

    // Truncated
    assert.equal(decodeOfdmFrame(bytes.slice(0, 9)), null);

    // Corrupt Magic
    const badMagic = new Uint8Array(bytes);
    badMagic[0] = 0x00;
    assert.equal(decodeOfdmFrame(badMagic), null);
  });

  test("VisualOfdmTransport packages frames and populates subcarrier grids", () => {
    const transport = new VisualOfdmTransport({ defaultModulation: "qpsk", defaultGridSize: 16 });
    assert.equal(VisualOfdmTransport.id, "visual-ofdm");
    assert.equal(VisualOfdmTransport.maturity, "research-prototype");

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const frameBytes = transport.packageFrame(payload);
    const decoded = transport.unpackageFrame(frameBytes);
    assert.ok(decoded !== null);
    assert.equal(decoded.seqNumber, 0);

    const grids = transport.modulate(frameBytes);
    assert.ok(grids.length >= 1);
    assert.equal(grids[0].gridSize, 16);
    assert.equal(grids[0].carriers.length, 256);

    const directGrids = modulateOfdmBytes(payload, "bpsk", 8);
    assert.ok(directGrids.length >= 1);
    assert.equal(directGrids[0].gridSize, 8);
  });
});
