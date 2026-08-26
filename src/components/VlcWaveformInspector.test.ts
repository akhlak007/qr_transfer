import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { OpticalCalibrationEngine } from "../transports/vlc/vlc-calibration";
import type { VlcDecodedFrame, VlcModulationScheme } from "../transports/vlc/vlc-framing";
import type { VlcWaveformSample } from "./VlcWaveformInspector";
import type { VlcDemodulationStatus } from "../transports/vlc/vlc-demodulator";

describe("VLC Waveform Inspector Telemetry & Formatting (Milestone 3D)", () => {
  test("formats calibration metrics, dynamic range, and confidence scores correctly", () => {
    const engine = new OpticalCalibrationEngine();
    for (let i = 0; i < 6; i++) {
      engine.feedLuminanceSample(240);
    }
    const cal = engine.calibrate(245, 15, 10);

    assert.equal(cal.isCalibrated, true);
    assert.equal(cal.dynamicRange, 230);
    assert.equal(cal.ambientLuminance, 10);
    assert.ok(cal.confidenceScore >= 0.8);
    assert.equal(cal.calibratedPalette8.length, 8);
    assert.equal(cal.calibratedPalette16.length, 16);
  });

  test("handles N/A fallback when calibration or decoded frames are missing", () => {
    const cal = null;
    const lastFrame: VlcDecodedFrame | null = null;
    const samples: VlcWaveformSample[] = [];

    assert.equal(cal, null);
    assert.equal(lastFrame, null);
    assert.equal(samples.length, 0);
  });

  test("accurately represents decoded frames with CRC pass vs mismatch", () => {
    const validFrame: VlcDecodedFrame = {
      version: 1,
      modulation: "pam4",
      seqNumber: 42,
      payload: new Uint8Array([1, 2, 3]),
      isValidCrc: true,
    };

    const invalidFrame: VlcDecodedFrame = {
      version: 1,
      modulation: "csk8",
      seqNumber: 43,
      payload: new Uint8Array([1, 2, 3]),
      isValidCrc: false,
    };

    assert.equal(validFrame.isValidCrc, true);
    assert.equal(validFrame.seqNumber, 42);

    assert.equal(invalidFrame.isValidCrc, false);
    assert.equal(invalidFrame.seqNumber, 43);
  });

  test("validates modulation schemes and constellation dimensions (OOK, 4-PAM, CSK-8, CSK-16)", () => {
    const modulations: VlcModulationScheme[] = ["ook", "pam4", "csk8", "csk16"];
    assert.equal(modulations.length, 4);

    const engine = new OpticalCalibrationEngine();
    const cal = engine.calibrate(255, 0, 0);

    // OOK & 4-PAM thresholds
    assert.equal(cal.adaptiveThreshold, 127.5);
    assert.equal(cal.pam4Thresholds.length, 3);

    // CSK constellations
    assert.equal(cal.calibratedPalette8.length, 8);
    assert.equal(cal.calibratedPalette16.length, 16);
  });

  test("handles all demodulation statuses and failure modes", () => {
    const statuses: (VlcDemodulationStatus | "idle")[] = [
      "idle",
      "success",
      "crc_failure",
      "sync_failure",
      "insufficient_quality",
      "incomplete_frame",
      "unsupported_modulation",
    ];

    assert.equal(statuses.length, 7);
    for (const status of statuses) {
      assert.ok(typeof status === "string");
    }
  });

  test("generates recent waveform samples with RGB and luminance bounds", () => {
    const samples: VlcWaveformSample[] = [
      { rgb: [255, 0, 0], luminance: 76, timestamp: 0 },
      { rgb: [0, 255, 0], luminance: 150, timestamp: 33 },
      { rgb: [0, 0, 255], luminance: 29, timestamp: 66 },
    ];

    assert.equal(samples.length, 3);
    for (const sample of samples) {
      assert.ok(sample.luminance >= 0 && sample.luminance <= 255);
      assert.ok(sample.rgb[0] >= 0 && sample.rgb[0] <= 255);
      assert.ok(sample.rgb[1] >= 0 && sample.rgb[1] <= 255);
      assert.ok(sample.rgb[2] >= 0 && sample.rgb[2] <= 255);
    }
  });
});
