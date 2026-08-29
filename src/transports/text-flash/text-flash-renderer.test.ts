import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXT_FLASH_DEFAULT_FRAME_MS,
  TEXT_FLASH_ACTIVE_REGION_RATIO,
} from "./text-flash-types";
import {
  activeRegionRect,
  bitCardCellCenters,
  buildTextFlashFrames,
  controlBarRect,
} from "./text-flash-framing";
import {
  TEXT_FLASH_COLOR,
  assertPlanMatchesPayload,
  createTextFlashPixelBuffer,
  createTextFlashRenderPlan,
  renderTextFlashFrame,
  renderTextFlashPlanStep,
  sampleBitCardByte,
  sampleLuminance,
  sampleRectMeanLuminance,
} from "./text-flash-renderer";

describe("TEXT_FLASH_PROTOCOL renderer (TF1)", () => {
  const W = 200;
  const H = 200;

  test("render plan sequence is START → LENGTH → DATA×N → END with 750 ms dwell", () => {
    const plan = createTextFlashRenderPlan("HELLO");
    assert.equal(plan.frameMs, TEXT_FLASH_DEFAULT_FRAME_MS);
    assert.equal(plan.frameMs, 750);
    assert.deepEqual(
      plan.steps.map((s) => s.kind),
      ["start", "length", "data", "data", "data", "data", "data", "end"],
    );
    assert.ok(plan.steps.every((s) => s.dwellMs === 750));
    assert.equal(plan.steps[0]!.phase, "start");
    assert.equal(plan.steps[1]!.phase, "length");
    assert.equal(plan.steps[1]!.byte, 5);
    assert.equal(plan.steps[2]!.dataIndex, 0);
    assert.equal(plan.steps[2]!.byte, 0x48); // 'H'
    assert.equal(plan.steps[7]!.phase, "end");
    assert.equal(plan.steps[7]!.index, 7);
    assert.equal(plan.steps[7]!.frameCount, 8);
  });

  test("custom frameMs is clamped and applied to every step", () => {
    const plan = createTextFlashRenderPlan("A", 100);
    assert.equal(plan.frameMs, 500);
    assert.ok(plan.steps.every((s) => s.dwellMs === 500));
  });

  test("START pattern: bright active region with dark mid bar", () => {
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame({ kind: "start" }, buf);
    const region = activeRegionRect(W, H);
    const bar = controlBarRect(region);

    // Margin stays mid-gray
    assert.equal(sampleLuminance(buf, 1, 1), TEXT_FLASH_COLOR.gray);

    // Active field above the bar is white
    const aboveY = region.y + region.h * 0.2;
    assert.equal(
      sampleLuminance(buf, region.x + region.w / 2, aboveY),
      TEXT_FLASH_COLOR.white,
    );

    // Bar is black
    const barMean = sampleRectMeanLuminance(buf, bar.x, bar.y, bar.w, bar.h);
    assert.ok(barMean < 20, `expected dark bar, got mean ${barMean}`);
  });

  test("END pattern: dark active region with bright mid bar (inverse of START)", () => {
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame({ kind: "end" }, buf);
    const region = activeRegionRect(W, H);
    const bar = controlBarRect(region);

    const fieldY = region.y + region.h * 0.2;
    assert.equal(
      sampleLuminance(buf, region.x + region.w / 2, fieldY),
      TEXT_FLASH_COLOR.black,
    );
    const barMean = sampleRectMeanLuminance(buf, bar.x, bar.y, bar.w, bar.h);
    assert.ok(barMean > 235, `expected bright bar, got mean ${barMean}`);
  });

  test("LENGTH bit-card encodes the UTF-8 byte length", () => {
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame({ kind: "length", byte: 5 }, buf);
    assert.equal(sampleBitCardByte(buf), 5);
  });

  test("DATA 0x48 ('H') matches MSB-first 4×2 bit layout", () => {
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame({ kind: "data", byte: 0x48, index: 0 }, buf);
    assert.equal(sampleBitCardByte(buf), 0x48);

    // 0x48 = 01001000 → bits [0,1,0,0, 1,0,0,0]
    const region = activeRegionRect(W, H, TEXT_FLASH_ACTIVE_REGION_RATIO);
    const cells = bitCardCellCenters(region);
    const expected = [false, true, false, false, true, false, false, false];
    for (let i = 0; i < 8; i++) {
      const lum = sampleLuminance(buf, cells[i]!.x, cells[i]!.y);
      const white = lum > TEXT_FLASH_COLOR.gray;
      assert.equal(white, expected[i], `bit ${i}`);
    }
  });

  test("IDLE is solid mid-gray", () => {
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame({ kind: "idle" }, buf);
    assert.equal(sampleLuminance(buf, W / 2, H / 2), TEXT_FLASH_COLOR.gray);
    assert.equal(sampleLuminance(buf, 0, 0), TEXT_FLASH_COLOR.gray);
  });

  test("geometry uses large active region (80%) for phone-camera capture", () => {
    const region = activeRegionRect(W, H);
    assert.equal(region.w / W, 0.8);
    assert.equal(region.h / H, 0.8);
    const buf = createTextFlashPixelBuffer(W, H);
    renderTextFlashFrame({ kind: "data", byte: 0xff, index: 0 }, buf);
    // All-white cells still leave black gaps — recovered byte is 0xFF
    assert.equal(sampleBitCardByte(buf), 0xff);
  });

  test("deterministic output: same frame yields identical RGBA", () => {
    const a = createTextFlashPixelBuffer(W, H);
    const b = createTextFlashPixelBuffer(W, H);
    const frame = { kind: "data" as const, byte: 0xa5, index: 3 };
    renderTextFlashFrame(frame, a);
    renderTextFlashFrame(frame, b);
    assert.deepEqual([...a.data], [...b.data]);
  });

  test("plan progression exposes every frame without mutating payload or sequence", () => {
    const text = "STATUS OK";
    const plan = createTextFlashRenderPlan(text);
    const payloadBefore = Uint8Array.from(plan.payload);
    const kindsBefore = plan.steps.map((s) => s.kind);
    const framesBefore = buildTextFlashFrames(text);

    const buf = createTextFlashPixelBuffer(W, H);
    for (let i = 0; i < plan.steps.length; i++) {
      const step = renderTextFlashPlanStep(plan, i, buf);
      assert.equal(step.index, i);
      assert.equal(step.kind, framesBefore[i]!.kind);
      if (step.kind === "length" || step.kind === "data") {
        assert.equal(sampleBitCardByte(buf), step.byte);
      }
    }

    assert.deepEqual([...plan.payload], [...payloadBefore]);
    assert.deepEqual(
      plan.steps.map((s) => s.kind),
      kindsBefore,
    );
    assertPlanMatchesPayload(plan);

    // Original framing list still matches
    assert.equal(framesBefore.length, plan.steps.length);
  });

  test("empty message plan is START → LENGTH(0) → END only", () => {
    const plan = createTextFlashRenderPlan("");
    assert.deepEqual(
      plan.steps.map((s) => s.kind),
      ["start", "length", "end"],
    );
    assert.equal(plan.steps[1]!.byte, 0);
    assert.equal(plan.payload.length, 0);
  });
});
