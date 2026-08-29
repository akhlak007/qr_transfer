import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DemoTransportId,
  TEXT_FLASH_DEFAULT_FRAME_MS,
  TEXT_FLASH_MAX_BYTES,
  clampTextFlashFrameMs,
  emptyTextFlashDiagnostics,
  textFlashCommitMs,
  textFlashTimeoutMs,
} from "./text-flash-types";
import {
  TextFlashPayloadTooLongError,
  activeRegionRect,
  bitCardCellCenters,
  bitCardToByte,
  buildTextFlashFrames,
  byteToBitCard,
  controlBarRect,
  encodeTextFlashPayload,
  getTextFlashGeometry,
  textFlashFrameByte,
  textFlashFrameKind,
} from "./text-flash-framing";

describe("TEXT_FLASH_PROTOCOL framing (TF0)", () => {
  test("demo transport id is text-flash and not a main TransportId value", () => {
    assert.equal(DemoTransportId.TextFlash, "text-flash");
  });

  test("default timing constants match the locked design", () => {
    assert.equal(TEXT_FLASH_DEFAULT_FRAME_MS, 750);
    assert.equal(TEXT_FLASH_MAX_BYTES, 64);
    assert.equal(clampTextFlashFrameMs(100), 500);
    assert.equal(clampTextFlashFrameMs(3000), 2000);
    assert.equal(clampTextFlashFrameMs(750), 750);
    assert.equal(textFlashCommitMs(750), Math.max(200, 750 * 0.35));
    assert.equal(textFlashTimeoutMs(750), 6000);
  });

  test("bit card round-trips 0x00, 0xFF, and 0xA5 (MSB-first 4×2)", () => {
    for (const value of [0x00, 0xff, 0xa5, 0x48]) {
      const bits = byteToBitCard(value);
      assert.equal(bits.length, 8);
      assert.equal(bitCardToByte(bits), value);
    }
    // 0xA5 = 10100101 → [1,0,1,0, 0,1,0,1]
    assert.deepEqual(byteToBitCard(0xa5), [
      true,
      false,
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
  });

  test("empty string yields START → LENGTH(0) → END", () => {
    const frames = buildTextFlashFrames("");
    assert.equal(frames.length, 3);
    assert.equal(textFlashFrameKind(frames[0]!), "start");
    assert.equal(textFlashFrameKind(frames[1]!), "length");
    assert.equal(textFlashFrameByte(frames[1]!), 0);
    assert.equal(textFlashFrameKind(frames[2]!), "end");
  });

  test("single character A yields START → LENGTH(1) → DATA → END", () => {
    const frames = buildTextFlashFrames("A");
    assert.equal(frames.length, 4);
    assert.equal(textFlashFrameByte(frames[1]!), 1);
    assert.equal(frames[2]!.kind, "data");
    if (frames[2]!.kind === "data") {
      assert.equal(frames[2].byte, 0x41);
      assert.equal(frames[2].index, 0);
    }
  });

  test("HELLO builds five DATA frames with correct bytes", () => {
    const frames = buildTextFlashFrames("HELLO");
    assert.equal(frames.length, 2 + 5 + 1);
    assert.equal(textFlashFrameKind(frames[0]!), "start");
    assert.equal(textFlashFrameByte(frames[1]!), 5);
    const expected = new TextEncoder().encode("HELLO");
    for (let i = 0; i < 5; i++) {
      const frame = frames[2 + i]!;
      assert.equal(frame.kind, "data");
      if (frame.kind === "data") {
        assert.equal(frame.byte, expected[i]);
        assert.equal(frame.index, i);
      }
    }
    assert.equal(textFlashFrameKind(frames[7]!), "end");
  });

  test("STATUS OK preserves the space byte", () => {
    const frames = buildTextFlashFrames("STATUS OK");
    const bytes = encodeTextFlashPayload("STATUS OK");
    assert.equal(bytes.length, 9);
    assert.equal(bytes[6], 0x20);
    assert.equal(textFlashFrameByte(frames[1]!), 9);
    assert.equal(frames.length, 2 + 9 + 1);
  });

  test("UTF-8 multi-byte payload uses byte length not codepoint count", () => {
    const text = "✓"; // U+2713 → E2 9C 93
    const bytes = encodeTextFlashPayload(text);
    assert.equal(bytes.length, 3);
    const frames = buildTextFlashFrames(text);
    assert.equal(textFlashFrameByte(frames[1]!), 3);
    assert.equal(frames.length, 2 + 3 + 1);
    assert.deepEqual(
      frames.filter((f) => f.kind === "data").map((f) => (f.kind === "data" ? f.byte : -1)),
      [...bytes],
    );
  });

  test("rejects payloads longer than 64 UTF-8 bytes", () => {
    const tooLong = "a".repeat(65);
    assert.throws(
      () => buildTextFlashFrames(tooLong),
      (err: unknown) => {
        assert.ok(err instanceof TextFlashPayloadTooLongError);
        assert.equal(err.byteLength, 65);
        assert.equal(err.maxBytes, 64);
        return true;
      },
    );
    // 64 ASCII bytes is accepted
    assert.equal(buildTextFlashFrames("b".repeat(64)).length, 2 + 64 + 1);
  });

  test("geometry descriptors match locked ratios", () => {
    const g = getTextFlashGeometry();
    assert.equal(g.activeRegionRatio, 0.8);
    assert.equal(g.barHeightRatio, 0.12);
    assert.equal(g.cellGapRatio, 0.04);
    assert.equal(g.columns, 4);
    assert.equal(g.rows, 2);

    const region = activeRegionRect(1000, 1000);
    assert.equal(region.w, 800);
    assert.equal(region.h, 800);
    assert.equal(region.x, 100);
    assert.equal(region.y, 100);

    const bar = controlBarRect(region);
    assert.equal(bar.w, region.w);
    assert.ok(Math.abs(bar.h - region.h * 0.12) < 1e-9);
    assert.ok(Math.abs(bar.y - (region.y + (region.h - bar.h) / 2)) < 1e-9);

    const cells = bitCardCellCenters(region);
    assert.equal(cells.length, 8);
  });

  test("empty diagnostics start in WAITING_FOR_START", () => {
    const d = emptyTextFlashDiagnostics();
    assert.equal(d.syncState, "WAITING_FOR_START");
    assert.equal(d.progressPercent, 0);
    assert.equal(d.startDetected, false);
    assert.equal(d.finalText, null);
  });
});
