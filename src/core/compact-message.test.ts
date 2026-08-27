import assert from "node:assert/strict";
import test from "node:test";
import { decodeCompactMessageFrame, encodeCompactMessageFrame, encodeMetadataFrame, FrameType, MAX_COMPACT_MESSAGE_BYTES } from "../modules/protocol";
import { decodeVlcFrame, encodeVlcFrame } from "../transports/vlc/vlc-framing";
import { modulateManchesterOok } from "../transports/vlc/vlc-modulator";

test("compact messages round-trip exact UTF-8 bytes", () => {
  const bytes = new TextEncoder().encode("VLC বাংলা ✓");
  const encoded = encodeCompactMessageFrame(0x12345678, bytes);
  const decoded = decodeCompactMessageFrame(encoded);
  assert.equal(encoded[0], FrameType.CompactMessage);
  assert.equal(decoded.messageId, 0x12345678);
  assert.deepEqual(decoded.bytes, bytes);
  assert.equal(decoded.text, "VLC বাংলা ✓");
});

test("compact messages reject invalid IDs, malformed UTF-8, truncation, and length mismatches", () => {
  assert.throws(() => encodeCompactMessageFrame(-1, new Uint8Array()), /unsigned 32-bit/);
  assert.throws(() => encodeCompactMessageFrame(1, new Uint8Array([0xc3, 0x28])), /encoded data/);
  assert.throws(() => encodeCompactMessageFrame(1, new Uint8Array(MAX_COMPACT_MESSAGE_BYTES + 1)), /exceeds 65528/);
  assert.throws(() => decodeCompactMessageFrame(new Uint8Array([FrameType.CompactMessage])), /Invalid compact/);
  const encoded = encodeCompactMessageFrame(1, new TextEncoder().encode("abc"));
  encoded[6] = 4;
  assert.throws(() => decodeCompactMessageFrame(encoded), /length mismatch/);
});

test("three-letter compact VLC message has the specified physical duration improvement", () => {
  const message = new TextEncoder().encode("hey");
  const compact = encodeCompactMessageFrame(1, message);
  const compactChips = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 0, payload: compact })).totalSymbols;
  const metadata = encodeMetadataFrame({ dataType: "message", fileSize: 3, blockSize: 512, totalBlocks: 1,
    fileHash: new Uint8Array(32), fileName: "message" });
  const legacyMetadataChips = modulateManchesterOok(encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 0, payload: metadata })).totalSymbols;
  assert.equal(compactChips, 358);
  assert.equal((compactChips / 15).toFixed(1), "23.9");
  assert.equal((compactChips / 10).toFixed(1), "35.8");
  assert.ok(compactChips < legacyMetadataChips / 3);
});

test("compact messages are emitted only with a valid unchanged VLC CRC envelope", () => {
  const compact = encodeCompactMessageFrame(9, new TextEncoder().encode("hey"));
  const outer = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 2, payload: compact });
  assert.equal(decodeVlcFrame(outer)?.isValidCrc, true);
  outer[10] ^= 0x01;
  assert.equal(decodeVlcFrame(outer)?.isValidCrc, false);
});
