import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encodeOfdmFrame, type OfdmFrame } from "./ofdm-framing";
import { modulateOfdmBytes } from "./ofdm-modulator";
import { idct2D } from "./ofdm-fft";
import { VisualOfdmDemodulator } from "./ofdm-demodulator";
import { OfdmCalibrationEngine } from "./ofdm-calibration";

describe("Visual OFDM Demodulator & Calibration Unit Tests (Milestone 4C)", () => {
  test("end-to-end clean demodulation produces valid frame and payload", () => {
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const frame: OfdmFrame = {
      version: 1,
      modulation: "bpsk",
      gridSize: 16,
      pilotConfig: 1,
      seqNumber: 42,
      payload,
    };

    const frameBytes = encodeOfdmFrame(frame);
    const grids = modulateOfdmBytes(frameBytes, "bpsk", 16);

    const freqMatrix = new Float64Array(16 * 16);
    for (let i = 0; i < freqMatrix.length; i++) {
      freqMatrix[i] = grids[0].carriers[i].real;
    }
    const spatial = idct2D(freqMatrix, 16);

    const demodulator = new VisualOfdmDemodulator(16);
    const report = demodulator.demodulateSpatialPattern(spatial, "bpsk");

    assert.equal(report.status, "success");
    assert.ok(report.frame !== null);
    assert.equal(report.frame.isValidCrc, true);
    assert.equal(report.frame.seqNumber, 42);
    assert.deepEqual(report.frame.payload, payload);
  });

  test("calibration engine computes baseline luminance and confidence metrics", () => {
    const engine = new OfdmCalibrationEngine();
    const spatial = new Float64Array(16 * 16).fill(128);

    // Set some variation
    spatial[0] = 50;
    spatial[10] = 200;

    const cal = engine.calibrateSpatialGrid(spatial, 16);
    assert.ok(cal.baselineLuminance > 120 && cal.baselineLuminance < 135);
    assert.ok(cal.confidence > 0.0);
    assert.equal(cal.totalCarriers, 256);
  });

  test("returns structured error status on truncated or empty spatial pattern", () => {
    const demodulator = new VisualOfdmDemodulator(16);
    const emptySpatial = new Float64Array(10);
    const report = demodulator.demodulateSpatialPattern(emptySpatial, "bpsk");

    assert.equal(report.status, "incomplete_frame");
    assert.equal(report.frame, null);
    assert.ok(report.error !== undefined);
  });
});
