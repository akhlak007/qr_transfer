import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXT_FLASH_CLEAN_CHANNEL,
  TEXT_FLASH_NOISY_CHANNEL,
  bitcardBytesFromPlanSteps,
  buffersRgbaEqual,
  expectedBitcardBytesFromPlan,
  impairTextFlashBuffer,
  simulateTextFlashCamera,
  TextFlashSeededPRNG,
} from "./text-flash-synthetic-channel";
import {
  createTextFlashPixelBuffer,
  createTextFlashRenderPlan,
  renderTextFlashPlanStep,
} from "./text-flash-renderer";
import { classifyTextFlashFrame } from "./text-flash-classifier";

describe("TEXT_FLASH_PROTOCOL synthetic channel (TF2)", () => {
  test("clean channel does not alter encoded RGBA bytes", () => {
    const plan = createTextFlashRenderPlan("HELLO");
    const clean = createTextFlashPixelBuffer(120, 120);
    renderTextFlashPlanStep(plan, 2, clean); // first DATA 'H'
    const prng = new TextFlashSeededPRNG(7);
    const out = impairTextFlashBuffer(clean, 0, 0, prng);
    assert.ok(buffersRgbaEqual(clean, out));
    assert.equal(
      classifyTextFlashFrame(out).classification.kind,
      "bitcard",
    );
  });

  test("clean camera simulation recovers exact LENGTH and DATA bytes", () => {
    const result = simulateTextFlashCamera("HELLO", TEXT_FLASH_CLEAN_CHANNEL, 750);
    assert.equal(result.plan.frameMs, 750);
    const expected = expectedBitcardBytesFromPlan(result.plan);
    const recovered = bitcardBytesFromPlanSteps(
      result.plan,
      result.recoveredBitcardBytesByStep,
    );
    assert.equal(recovered.length, expected.length);
    assert.deepEqual(recovered.data, expected.data);
    assert.deepEqual(recovered.data, [...new TextEncoder().encode("HELLO")]);

    // START and END appear among classifications
    const kinds = new Set(
      result.samples.map((s) => s.classify.classification.kind),
    );
    assert.ok(kinds.has("start"));
    assert.ok(kinds.has("end"));
    assert.ok(kinds.has("bitcard"));
  });

  test("noisy channel with exposure bias still recovers HELLO bytes", () => {
    const result = simulateTextFlashCamera("HELLO", {
      ...TEXT_FLASH_NOISY_CHANNEL,
      // Keep noise moderate so large cells remain classifiable
      exposureBias: 35,
      noiseStdDev: 8,
      missProbability: 0.15,
      seed: 99,
    }, 750);
    const expected = expectedBitcardBytesFromPlan(result.plan);
    const recovered = bitcardBytesFromPlanSteps(
      result.plan,
      result.recoveredBitcardBytesByStep,
    );
    assert.equal(recovered.length, expected.length);
    assert.deepEqual(recovered.data, expected.data);
    assert.ok(result.missedSampleCount > 0);
  });

  test("missed camera samples trigger reacquisition without changing encoding", () => {
    const result = simulateTextFlashCamera("TEST", {
      ...TEXT_FLASH_CLEAN_CHANNEL,
      cameraFps: 30,
      missProbability: 0.4,
      missGapMs: 50,
      timingJitterFraction: 0.2,
      seed: 123,
    }, 750);

    assert.ok(result.missedSampleCount > 0);
    assert.ok(result.reacquisitionCount > 0);
    assert.ok(result.samples.some((s) => s.reacquiring));
    assert.ok(result.samples.some((s) => s.classify.diagnostics.reacquiring));

    // Protocol/encoding unchanged: plan still START→LENGTH→DATA×N→END
    assert.deepEqual(
      result.plan.steps.map((s) => s.kind),
      ["start", "length", "data", "data", "data", "data", "end"],
    );

    const expected = expectedBitcardBytesFromPlan(result.plan);
    const recovered = bitcardBytesFromPlanSteps(
      result.plan,
      result.recoveredBitcardBytesByStep,
    );
    assert.deepEqual(recovered.data, expected.data);
  });

  test("partial/missed samples still allow START and END detection on remaining frames", () => {
    const result = simulateTextFlashCamera("A", {
      seed: 5,
      width: 160,
      height: 160,
      exposureBias: 0,
      noiseStdDev: 0,
      cameraFps: 20,
      timingJitterFraction: 0.4,
      missProbability: 0.35,
      missGapMs: 60,
    }, 750);

    const startHits = result.samples.filter(
      (s) => s.classify.classification.kind === "start",
    );
    const endHits = result.samples.filter(
      (s) => s.classify.classification.kind === "end",
    );
    assert.ok(startHits.length >= 1, "START detected despite misses");
    assert.ok(endHits.length >= 1, "END detected despite misses");
  });

  test("STATUS OK and UTF-8 payloads survive clean synthetic capture", () => {
    for (const text of ["STATUS OK", "✓"]) {
      const result = simulateTextFlashCamera(text, TEXT_FLASH_CLEAN_CHANNEL, 750);
      const expected = expectedBitcardBytesFromPlan(result.plan);
      const recovered = bitcardBytesFromPlanSteps(
        result.plan,
        result.recoveredBitcardBytesByStep,
      );
      assert.deepEqual(recovered.data, expected.data);
      assert.deepEqual(
        recovered.data,
        [...new TextEncoder().encode(text)],
      );
    }
  });

  test("impairments do not mutate the clean source buffer", () => {
    const plan = createTextFlashRenderPlan("X");
    const clean = createTextFlashPixelBuffer(100, 100);
    renderTextFlashPlanStep(plan, 0, clean);
    const before = Uint8Array.from(clean.data);
    impairTextFlashBuffer(clean, 50, 10, new TextFlashSeededPRNG(1));
    assert.deepEqual([...clean.data], [...before]);
  });
});
