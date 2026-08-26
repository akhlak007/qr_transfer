import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  simulateOfdmSpatialChannel,
  type OfdmChannelConfig,
  DEFAULT_OFDM_CHANNEL_CONFIG,
} from "./ofdm-synthetic-channel";
import {
  encodeOfdmFrame,
  createSubcarrierMap,
  type OfdmFrame,
  type OfdmModulationScheme,
} from "./ofdm-framing";
import {
  modulateOfdmBytes,
} from "./ofdm-modulator";
import { idct2D } from "./ofdm-fft";
import { VisualOfdmDemodulator } from "./ofdm-demodulator";
import { sha256Hex } from "../../core/integrity";

describe("Visual OFDM Synthetic Optical Channel & 48-Scenario Stress Matrix (Milestone 4C)", () => {
  const modulations: OfdmModulationScheme[] = ["bpsk", "qpsk"];

  const profiles: { name: string; config: Partial<OfdmChannelConfig> }[] = [
    {
      name: "1_Clean",
      config: { ...DEFAULT_OFDM_CHANNEL_CONFIG, seed: 1001 },
    },
    {
      name: "2_LightNoise",
      config: { noiseStdDev: 0.06, exposureGain: 0.99, seed: 2002 },
    },
    {
      name: "3_ExposureVariation",
      config: { exposureGain: 0.96, ambientOffset: 2, seed: 3003 },
    },
    {
      name: "4_AmbientDrift",
      config: { ambientOffset: 2, ambientDrift: 0.0005, seed: 4004 },
    },
    {
      name: "5_Blur",
      config: { spatialBlurRadius: 0.15, noiseStdDev: 0.04, seed: 5005 },
    },
    {
      name: "6_PerspectiveDistortion",
      config: { perspectiveTiltX: 0.0002, perspectiveTiltY: 0.0002, noiseStdDev: 0.04, seed: 6006 },
    },
    {
      name: "7_SensorQuantization",
      config: { quantizationBits: 8, exposureGain: 0.99, seed: 7007 },
    },
    {
      name: "8_CombinedDegradation",
      config: {
        exposureGain: 0.98,
        ambientOffset: 2,
        noiseStdDev: 0.05,
        perspectiveTiltX: 0.0001,
        perspectiveTiltY: 0.0001,
        seed: 8008,
      },
    },
  ];

  const payloads: { name: string; bytes: Uint8Array }[] = [
    {
      name: "Binary",
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00, 0xaa, 0x55]),
    },
    {
      name: "Utf8Text",
      bytes: new TextEncoder().encode("Visual OFDM Spatial Frequency Optical Transmission 2026."),
    },
    {
      name: "HighEntropyRandom",
      bytes: new Uint8Array([
        0x8a, 0x3f, 0x91, 0x7c, 0x4b, 0x2e, 0x0d, 0x6f,
        0x1c, 0x5a, 0x82, 0xc3, 0x38, 0xe7, 0x19, 0xa4,
        0x77, 0xd2, 0x4b, 0x9a, 0x61, 0x14, 0xf7, 0x3d,
      ]),
    },
  ];

  // 2 modulations x 8 profiles x 3 payloads = 48 scenarios
  for (const mod of modulations) {
    for (const profile of profiles) {
      for (const payload of payloads) {
        test(`[OFDM StressMatrix] ${mod.toUpperCase()} | Profile: ${profile.name} | Payload: ${payload.name}`, async () => {
          const originalHash = await sha256Hex(payload.bytes);
          const gridSize = 32;

          // 1. Encode binary frame
          const frame: OfdmFrame = {
            version: 1,
            modulation: mod,
            gridSize,
            pilotConfig: 1,
            seqNumber: 77,
            payload: payload.bytes,
          };
          const frameBytes = encodeOfdmFrame(frame);

          // 2. Modulate into spatial-frequency grid
          const grids = modulateOfdmBytes(frameBytes, mod, gridSize);
          assert.ok(grids.length >= 1);

          // 3. Inverse 2D-IDCT Transform to spatial luminance
          const freqMatrix = new Float64Array(gridSize * gridSize);
          for (let i = 0; i < freqMatrix.length; i++) {
            freqMatrix[i] = grids[0].carriers[i].real;
          }
          const spatial = idct2D(freqMatrix, gridSize);

          // 4. Pass through degraded synthetic optical channel
          const degradedSpatial = simulateOfdmSpatialChannel(spatial, gridSize, profile.config);

          // 5. Demodulate received spatial pattern
          const demodulator = new VisualOfdmDemodulator(gridSize);
          const report = demodulator.demodulateSpatialPattern(degradedSpatial, mod);

          // 6. Assertions for bit-perfect reconstruction
          assert.equal(report.status, "success", `Demodulation failed: ${report.error}`);
          assert.ok(report.frame !== null);
          assert.equal(report.frame.modulation, mod);
          assert.equal(report.frame.seqNumber, 77);
          assert.equal(report.frame.isValidCrc, true, "CRC-16 mismatch on OFDM frame");
          assert.deepEqual(report.frame.payload, payload.bytes);

          const reconstructedHash = await sha256Hex(report.frame.payload);
          assert.equal(reconstructedHash, originalHash);
        });
      }
    }
  }

  test("rejects demodulation on pilot synchronization failure", () => {
    const noiseSpatial = new Float64Array(16 * 16).fill(50);
    const demodulator = new VisualOfdmDemodulator(16);
    const report = demodulator.demodulateSpatialPattern(noiseSpatial, "bpsk");

    assert.equal(report.status, "sync_failure");
    assert.equal(report.frame, null);
  });

  test("rejects demodulation on CRC mismatch from corrupted payload", () => {
    const payload = new Uint8Array([1, 2, 3, 4]); // 4 bytes fits in 16x16
    const frame: OfdmFrame = {
      version: 1,
      modulation: "bpsk",
      gridSize: 16,
      pilotConfig: 1,
      seqNumber: 9,
      payload,
    };
    const frameBytes = encodeOfdmFrame(frame);
    const grids = modulateOfdmBytes(frameBytes, "bpsk", 16);

    const freqMatrix = new Float64Array(16 * 16);
    for (let i = 0; i < freqMatrix.length; i++) {
      freqMatrix[i] = grids[0].carriers[i].real;
    }
    // Flip data subcarrier 90 (located inside the 4-byte payload region)
    const map16 = createSubcarrierMap(16);
    const targetIdx = map16.dataIndices[90];
    freqMatrix[targetIdx] = -freqMatrix[targetIdx];

    const spatial = idct2D(freqMatrix, 16);
    const demodulator = new VisualOfdmDemodulator(16);
    const report = demodulator.demodulateSpatialPattern(spatial, "bpsk");

    assert.equal(report.status, "crc_failure");
    assert.ok(report.frame !== null);
    assert.equal(report.frame.isValidCrc, false);
  });

  test("rejects demodulation on incomplete spatial pattern", () => {
    const truncatedSpatial = new Float64Array(10);
    const demodulator = new VisualOfdmDemodulator(16);
    const report = demodulator.demodulateSpatialPattern(truncatedSpatial, "bpsk");

    assert.equal(report.status, "incomplete_frame");
    assert.equal(report.frame, null);
  });
});
