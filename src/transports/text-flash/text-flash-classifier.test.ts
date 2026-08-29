import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { classifyTextFlashFrame } from "./text-flash-classifier";
import {
  createTextFlashPixelBuffer,
  renderTextFlashFrame,
} from "./text-flash-renderer";
import { TEXT_FLASH_COLOR } from "./text-flash-renderer";

describe("TEXT_FLASH_PROTOCOL classifier (TF2)", () => {
  const W = 160;
  const H = 160;

  function render(kind: Parameters<typeof renderTextFlashFrame>[0]) {
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame(kind, buf);
    return buf;
  }

  test("classifies clean IDLE", () => {
    const r = classifyTextFlashFrame(render({ kind: "idle" }));
    assert.equal(r.classification.kind, "idle");
    assert.equal(r.diagnostics.detectedKind, "idle");
    assert.ok(r.diagnostics.confidence > 0.5);
  });

  test("classifies clean START (not LENGTH/DATA)", () => {
    const r = classifyTextFlashFrame(render({ kind: "start" }));
    assert.equal(r.classification.kind, "start");
    assert.equal(r.diagnostics.byte, null);
    assert.ok(r.diagnostics.quality === "GOOD" || r.diagnostics.quality === "FAIR");
  });

  test("classifies clean END", () => {
    const r = classifyTextFlashFrame(render({ kind: "end" }));
    assert.equal(r.classification.kind, "end");
  });

  test("classifies BITCARD bytes; LENGTH vs DATA left to receiver", () => {
    for (const byte of [0x00, 0x48, 0xa5, 0xff, 5]) {
      const asLength = classifyTextFlashFrame(
        render({ kind: "length", byte }),
      );
      const asData = classifyTextFlashFrame(
        render({ kind: "data", byte, index: 0 }),
      );
      assert.equal(asLength.classification.kind, "bitcard");
      assert.equal(asData.classification.kind, "bitcard");
      if (
        asLength.classification.kind === "bitcard" &&
        asData.classification.kind === "bitcard"
      ) {
        assert.equal(asLength.classification.byte, byte);
        assert.equal(asData.classification.byte, byte);
      }
      // Visual layer does not label length vs data
      assert.equal(asLength.diagnostics.detectedKind, "bitcard");
      assert.equal(asData.diagnostics.detectedKind, "bitcard");
    }
  });

  test("malformed mid-gray mush is UNKNOWN", () => {
    const buf = createTextFlashPixelBuffer(W, H);
    for (let i = 0; i < buf.data.length; i += 4) {
      const v = 100 + ((i / 4) % 40);
      buf.data[i] = v;
      buf.data[i + 1] = v;
      buf.data[i + 2] = v;
      buf.data[i + 3] = 255;
    }
    const r = classifyTextFlashFrame(buf);
    assert.equal(r.classification.kind, "unknown");
    assert.equal(r.diagnostics.detectedKind, "unknown");
  });

  test("diagnostics expose confidence, quality, and stream miss/reacquire flags", () => {
    const r = classifyTextFlashFrame(render({ kind: "start" }), {}, {
      missedSamples: 3,
      reacquiring: true,
    });
    assert.equal(r.diagnostics.missedSamples, 3);
    assert.equal(r.diagnostics.reacquiring, true);
    assert.ok(typeof r.diagnostics.confidence === "number");
    assert.ok(["GOOD", "FAIR", "POOR"].includes(r.diagnostics.quality));
    assert.ok(r.diagnostics.adaptiveThreshold > 0);
  });

  test("weak cell margins reject BITCARD as UNKNOWN or IDLE", () => {
    const buf = render({ kind: "data", byte: 0x0f, index: 0 });
    // Crush contrast toward mid-gray
    for (let i = 0; i < buf.data.length; i += 4) {
      const v = TEXT_FLASH_COLOR.gray + (buf.data[i]! - TEXT_FLASH_COLOR.gray) * 0.05;
      buf.data[i] = v;
      buf.data[i + 1] = v;
      buf.data[i + 2] = v;
    }
    const r = classifyTextFlashFrame(buf, { minBitMargin: 20 });
    assert.ok(
      r.classification.kind === "unknown" || r.classification.kind === "idle",
      `expected unknown|idle, got ${r.classification.kind}`,
    );
  });
});
