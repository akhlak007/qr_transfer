import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  simulateIntensityChannel,
  simulateColorChannel,
  type SyntheticChannelConfig,
  DEFAULT_SYNTHETIC_CHANNEL_CONFIG,
} from "./vlc-synthetic-channel";
import {
  encodeVlcFrame,
  type VlcFrame,
  type VlcModulationScheme,
} from "./vlc-framing";
import {
  modulateVlcFrame,
} from "./vlc-modulator";
import {
  OpticalCalibrationEngine,
} from "./vlc-calibration";
import {
  VlcDemodulator,
} from "./vlc-demodulator";
import { sha256Hex } from "../../core/integrity";

describe("VLC Synthetic Optical Channel & Stress Matrix (Milestone 3C)", () => {
  const modulations: VlcModulationScheme[] = ["ook", "pam4", "csk8", "csk16"];

  const profiles: { name: string; config: Partial<SyntheticChannelConfig>; calWhite: number; calBlack: number; ambient: number }[] = [
    {
      name: "1_Clean",
      config: { ...DEFAULT_SYNTHETIC_CHANNEL_CONFIG, seed: 101 },
      calWhite: 255,
      calBlack: 0,
      ambient: 0,
    },
    {
      name: "2_LightNoise",
      config: { noiseStdDev: 3.5, exposureGain: 0.96, seed: 202 },
      calWhite: 245,
      calBlack: 0,
      ambient: 0,
    },
    {
      name: "3_AmbientDrift",
      config: { ambientOffset: 15, ambientDriftRate: 0.015, noiseStdDev: 2.0, seed: 303 },
      calWhite: 255,
      calBlack: 15,
      ambient: 15,
    },
    {
      name: "4_ColorCastAndNoise",
      config: {
        rgbImbalance: [1.03, 0.97, 1.02],
        ambientColorCast: [6, 2, 4],
        noiseStdDev: 3.0,
        seed: 404,
      },
      calWhite: 255,
      calBlack: 5,
      ambient: 5,
    },
    {
      name: "5_CombinedDegradation",
      config: {
        flickerAmplitude: 3.5,
        noiseStdDev: 3.5,
        temporalSmoothing: 0.05,
        ambientOffset: 12,
        seed: 505,
      },
      calWhite: 255,
      calBlack: 12,
      ambient: 12,
    },
  ];

  // 3 distinct payload patterns
  const payloads: { name: string; bytes: Uint8Array }[] = [
    {
      name: "Utf8Text",
      bytes: new TextEncoder().encode("Lumen Optical VLC research prototype packet 2026."),
    },
    {
      name: "StructuredBinary",
      bytes: new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00,
        0x08, 0x00, 0x5b, 0x7e, 0x6a, 0x58, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1c, 0x00,
        0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0xaa, 0x55,
      ]),
    },
    {
      name: "HighEntropyRandom",
      bytes: new Uint8Array([
        0x9f, 0x83, 0x1b, 0x7c, 0x4a, 0xe2, 0x0d, 0x6e,
        0x3b, 0x5f, 0x81, 0xc4, 0x27, 0xe9, 0x10, 0xa5,
        0x78, 0xd3, 0x4c, 0x9b, 0x62, 0x15, 0xf8, 0x3e,
        0x07, 0xba, 0x4f, 0xc1, 0x86, 0x2d, 0x54, 0xeb,
        0x33, 0x71, 0x98, 0x2a, 0x6b, 0xef, 0x04, 0x5c,
      ]),
    },
  ];

  // Execute 4 x 5 x 3 = 60 deterministic synthetic scenarios
  for (const mod of modulations) {
    for (const profile of profiles) {
      for (const payload of payloads) {
        test(`[StressMatrix] ${mod.toUpperCase()} | Profile: ${profile.name} | Payload: ${payload.name}`, async () => {
          const originalHash = await sha256Hex(payload.bytes);

          // 1. Encode frame with sequence number 101
          const frame: VlcFrame = {
            version: 1,
            modulation: mod,
            seqNumber: 101,
            payload: payload.bytes,
          };
          const frameBytes = encodeVlcFrame(frame);

          // 2. Modulate frame into optical stream
          const stream = modulateVlcFrame(frameBytes, mod);

          // 3. Simulate transmission through degraded synthetic optical channel
          let channelSamples;
          if (mod === "csk8" || mod === "csk16") {
            const result = simulateColorChannel(stream.colors, profile.config);
            channelSamples = result.samples;
          } else {
            const result = simulateIntensityChannel(stream.levels, profile.config);
            channelSamples = result.samples;
          }

          // 4. Optical Calibration
          const calEngine = new OpticalCalibrationEngine();
          // Feed 8 stable samples to settle exposure tracking
          for (let s = 0; s < 8; s++) {
            calEngine.feedLuminanceSample(profile.calWhite);
          }
          const calibration = calEngine.calibrate(profile.calWhite, profile.calBlack, profile.ambient);
          assert.equal(calibration.isCalibrated, true, `Calibration failed: ${calibration.reason}`);

          // 5. Demodulate received optical stream
          const demodulator = new VlcDemodulator(calibration);
          const report = demodulator.demodulateWithReport(channelSamples, mod);

          // 6. Assertions for bit-perfect reconstruction
          assert.equal(report.status, "success", `Demodulation failed with status ${report.status}: ${report.error}`);
          assert.ok(report.frame !== null, "Decoded frame is null");
          assert.equal(report.frame.modulation, mod);
          assert.equal(report.frame.seqNumber, 101);
          assert.equal(report.frame.isValidCrc, true, "CRC-16 checksum mismatch");

          // Exact payload match and SHA-256 match
          assert.deepEqual(report.frame.payload, payload.bytes);
          const reconstructedHash = await sha256Hex(report.frame.payload);
          assert.equal(reconstructedHash, originalHash);
        });
      }
    }
  }

  test("rejects demodulation when dynamic range is insufficient", () => {
    const calEngine = new OpticalCalibrationEngine({ minDynamicRange: 40 });
    const calibration = calEngine.calibrate(25, 20, 10); // dynamicRange = 5 (< 40)
    assert.equal(calibration.isCalibrated, false);

    const demodulator = new VlcDemodulator(calibration);
    const mockSamples = new Array(30).fill({ rgb: [20, 20, 20], luminance: 20 });
    const report = demodulator.demodulateWithReport(mockSamples, "ook");

    assert.equal(report.status, "insufficient_quality");
    assert.equal(report.frame, null);
  });

  test("rejects demodulation on CRC mismatch and corrupted frame body", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const frame: VlcFrame = { version: 1, modulation: "ook", seqNumber: 5, payload };
    const frameBytes = encodeVlcFrame(frame);

    // Modulate and corrupt 1 bit in payload (payload starts after 11 Barker bits + 64 header bits = index 75)
    const stream = modulateVlcFrame(frameBytes, "ook");
    const corruptedSamples = Array.from(stream.levels).map((l, i) => {
      let luma = l;
      if (i === 75) {
        luma = luma === 255 ? 0 : 255;
      }
      return { rgb: [luma, luma, luma] as [number, number, number], luminance: luma, timestamp: i * 33 };
    });

    const calEngine = new OpticalCalibrationEngine();
    const calibration = calEngine.calibrate(255, 0, 0);
    const demodulator = new VlcDemodulator(calibration);

    const report = demodulator.demodulateWithReport(corruptedSamples, "ook");
    assert.equal(report.status, "crc_failure");
    assert.ok(report.frame !== null);
    assert.equal(report.frame.isValidCrc, false);
  });

  test("rejects demodulation on synchronization failure (missing Barker preamble)", () => {
    const mockSamples = new Array(40).fill({ rgb: [100, 100, 100], luminance: 100 });
    const calEngine = new OpticalCalibrationEngine();
    const calibration = calEngine.calibrate(255, 0, 0);
    const demodulator = new VlcDemodulator(calibration);

    const report = demodulator.demodulateWithReport(mockSamples, "ook");
    assert.equal(report.status, "sync_failure");
    assert.equal(report.frame, null);
  });
});
