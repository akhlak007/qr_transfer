import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  encodeVlcFrame,
  decodeVlcFrame,
  findBarkerSyncIndex,
  BARKER_11_BITS,
  type VlcFrame,
} from "./vlc-framing";
import {
  modulateOok,
  modulatePam4,
  PAM4_INTENSITY_LEVELS,
} from "./vlc-modulator";
import { VlcTransport } from "./vlc-transport";

describe("VLC Framing, Sync & Intensity Modulation (Milestone 3A)", () => {
  test("encodes and decodes VLC frames with valid CRC-16 (OOK and 4-PAM)", () => {
    const payload = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);

    // 1. OOK Frame
    const ookFrame: VlcFrame = {
      version: 1,
      modulation: "ook",
      seqNumber: 42,
      payload,
    };
    const ookBytes = encodeVlcFrame(ookFrame);
    assert.equal(ookBytes.length, 8 + payload.length + 2); // 8 header + 8 payload + 2 CRC

    const ookDecoded = decodeVlcFrame(ookBytes);
    assert.ok(ookDecoded !== null);
    assert.equal(ookDecoded.version, 1);
    assert.equal(ookDecoded.modulation, "ook");
    assert.equal(ookDecoded.seqNumber, 42);
    assert.deepEqual(ookDecoded.payload, payload);
    assert.equal(ookDecoded.isValidCrc, true);

    // 2. 4-PAM Frame
    const pamFrame: VlcFrame = {
      version: 1,
      modulation: "pam4",
      seqNumber: 108,
      payload,
    };
    const pamBytes = encodeVlcFrame(pamFrame);
    const pamDecoded = decodeVlcFrame(pamBytes);
    assert.ok(pamDecoded !== null);
    assert.equal(pamDecoded.modulation, "pam4");
    assert.equal(pamDecoded.seqNumber, 108);
    assert.deepEqual(pamDecoded.payload, payload);
    assert.equal(pamDecoded.isValidCrc, true);
  });

  test("detects Barker-11 synchronization pattern with cross-correlation", () => {
    // Construct bitstream with leading noise, Barker code, and trailing bits
    const noise = [0, 1, 0, 0, 1, 0];
    const trailing = [1, 0, 1, 1, 0];
    const stream = [...noise, ...Array.from(BARKER_11_BITS), ...trailing];

    const syncIndex = findBarkerSyncIndex(stream, 0.9);
    assert.equal(syncIndex, noise.length); // Exact match at noise offset

    // With 1 bit flipped in Barker sequence (91% correlation)
    const imperfectStream = [...noise, ...Array.from(BARKER_11_BITS), ...trailing];
    imperfectStream[noise.length + 2] = imperfectStream[noise.length + 2] === 1 ? 0 : 1;

    const imperfectSync = findBarkerSyncIndex(imperfectStream, 0.8);
    assert.equal(imperfectSync, noise.length);
  });

  test("rejects corrupted payload, bad CRC, and truncated frames", () => {
    const payload = new Uint8Array([10, 20, 30, 40, 50]);
    const frame: VlcFrame = {
      version: 1,
      modulation: "ook",
      seqNumber: 1,
      payload,
    };
    const bytes = encodeVlcFrame(frame);

    // 1. Single-bit corruption in payload
    const corruptedPayload = new Uint8Array(bytes);
    corruptedPayload[10] ^= 0x01;
    const corruptedDecoded = decodeVlcFrame(corruptedPayload);
    assert.ok(corruptedDecoded !== null);
    assert.equal(corruptedDecoded.isValidCrc, false);

    // 2. Truncated frame
    const truncated = bytes.slice(0, 7);
    assert.equal(decodeVlcFrame(truncated), null);

    // 3. Corrupted magic header
    const badMagic = new Uint8Array(bytes);
    badMagic[0] = 0x00;
    assert.equal(decodeVlcFrame(badMagic), null);
  });

  test("OOK modulator generates 1 bit/symbol and prepends Barker preamble", () => {
    const data = new Uint8Array([0b10100000]); // 1 byte -> 8 symbols
    const stream = modulateOok(data);

    assert.equal(stream.modulation, "ook");
    assert.equal(stream.preambleLength, 11);
    assert.equal(stream.totalSymbols, 11 + 8);

    // Check preamble levels
    for (let i = 0; i < 11; i++) {
      assert.equal(stream.levels[i], BARKER_11_BITS[i] === 1 ? 255 : 0);
    }

    // Check payload bits (0b10100000 -> 255, 0, 255, 0, 0, 0, 0, 0)
    assert.equal(stream.levels[11], 255); // bit 7
    assert.equal(stream.levels[12], 0);   // bit 6
    assert.equal(stream.levels[13], 255); // bit 5
    assert.equal(stream.levels[14], 0);   // bit 4
    assert.equal(stream.levels[15], 0);   // bit 3
    assert.equal(stream.levels[16], 0);   // bit 2
    assert.equal(stream.levels[17], 0);   // bit 1
    assert.equal(stream.levels[18], 0);   // bit 0
  });

  test("4-PAM modulator maps 2-bit symbols to 4 discrete intensity levels", () => {
    // Byte: 0b11100100 -> pairs: 11 (3), 10 (2), 01 (1), 00 (0)
    const data = new Uint8Array([0b11100100]);
    const stream = modulatePam4(data);

    assert.equal(stream.modulation, "pam4");
    assert.equal(stream.preambleLength, 11);
    assert.equal(stream.totalSymbols, 11 + 4);

    // Check 4-PAM intensity levels
    assert.equal(stream.levels[11], PAM4_INTENSITY_LEVELS[2]); // Gray 11 -> level 2
    assert.equal(stream.levels[12], PAM4_INTENSITY_LEVELS[3]); // Gray 10 -> level 3
    assert.equal(stream.levels[13], PAM4_INTENSITY_LEVELS[1]); // 85
    assert.equal(stream.levels[14], PAM4_INTENSITY_LEVELS[0]); // 0
  });

  test("VlcTransport manages frame lifecycle, sequence numbers, and isolation", () => {
    const transport = new VlcTransport({ defaultModulation: "pam4" });
    assert.equal(VlcTransport.id, "vlc");
    assert.equal(VlcTransport.maturity, "experimental");

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const frame1 = transport.packageFrame(payload);
    const decoded1 = transport.unpackageFrame(frame1);
    assert.ok(decoded1 !== null);
    assert.equal(decoded1.seqNumber, 0);
    assert.equal(decoded1.modulation, "pam4");

    const frame2 = transport.packageFrame(payload);
    const decoded2 = transport.unpackageFrame(frame2);
    assert.ok(decoded2 !== null);
    assert.equal(decoded2.seqNumber, 1);

    const stream = transport.modulate(frame1);
    assert.equal(stream.modulation, "pam4");
    assert.equal(stream.totalSymbols, 11 + frame1.length * 4);
  });
});
