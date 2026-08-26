import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { simulateOfdmSpatialChannel } from "./ofdm-channel";

describe("Visual OFDM Synthetic Optical Channel Unit Tests (Milestone 4C)", () => {
  test("generates deterministic reproducible output from identical seeds", () => {
    const input = new Float64Array(16 * 16).fill(100);
    const out1 = simulateOfdmSpatialChannel(input, 16, { seed: 12345, noiseStdDev: 2.0 });
    const out2 = simulateOfdmSpatialChannel(input, 16, { seed: 12345, noiseStdDev: 2.0 });

    assert.deepEqual(Array.from(out1), Array.from(out2));
  });

  test("applies exposure gain and ambient offset accurately", () => {
    const input = new Float64Array(8 * 8).fill(100);
    const out = simulateOfdmSpatialChannel(input, 8, {
      noiseStdDev: 0,
      exposureGain: 1.1,
      ambientOffset: 10,
      seed: 999,
    });

    // 100 * 1.1 + 10 = 120
    for (let i = 0; i < out.length; i++) {
      assert.ok(Math.abs(out[i] - 120) < 1.0);
    }
  });

  test("quantizes output to 8-bit resolution (0..255)", () => {
    const input = new Float64Array(8 * 8);
    for (let i = 0; i < 64; i++) {
      input[i] = i * 4;
    }

    const out = simulateOfdmSpatialChannel(input, 8, {
      quantizationBits: 8,
      noiseStdDev: 0,
      exposureGain: 1.0,
      ambientOffset: 0,
    });

    for (let i = 0; i < out.length; i++) {
      assert.ok(out[i] >= 0 && out[i] <= 255);
      assert.equal(Math.round(out[i]), out[i]);
    }
  });
});
