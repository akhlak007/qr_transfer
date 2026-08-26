import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  rgbToYuv,
  yuvToRgb,
  euclideanDistanceRgb,
  euclideanDistanceYuv,
  classifyNearestCskColor,
  OpticalCalibrationEngine,
} from "./vlc-calibration";
import {
  CSK8_CONSTELLATION,
  CSK16_CONSTELLATION,
  modulateOok,
  modulatePam4,
  modulateCsk8,
  modulateCsk16,
  type RGBColor,
} from "./vlc-modulator";
import {
  encodeVlcFrame,
  type VlcFrame,
} from "./vlc-framing";
import {
  extractCenterRoiAverage,
  VlcDemodulator,
} from "./vlc-demodulator";

describe("Optical Calibration Engine & CSK Demodulator (Milestone 3B)", () => {
  test("converts RGB to YUV and back with sub-unit rounding accuracy", () => {
    const testColors: RGBColor[] = [
      [255, 0, 0],     // Red
      [0, 255, 0],     // Green
      [0, 0, 255],     // Blue
      [255, 255, 255], // White
      [0, 0, 0],       // Black
      [128, 64, 192],  // Mixed
    ];

    for (const rgb of testColors) {
      const yuv = rgbToYuv(rgb);
      const reconstructed = yuvToRgb(yuv);
      assert.ok(Math.abs(rgb[0] - reconstructed[0]) <= 2, `Red mismatch for ${rgb}`);
      assert.ok(Math.abs(rgb[1] - reconstructed[1]) <= 2, `Green mismatch for ${rgb}`);
      assert.ok(Math.abs(rgb[2] - reconstructed[2]) <= 2, `Blue mismatch for ${rgb}`);
    }
  });

  test("calculates Euclidean distances and classifies nearest CSK constellation colors", () => {
    // Exact match
    const exactBlue: RGBColor = [0, 0, 255];
    const classification1 = classifyNearestCskColor(exactBlue, CSK8_CONSTELLATION);
    assert.equal(classification1.index, 1); // Blue is index 1 in CSK8
    assert.equal(classification1.valid, true);
    assert.ok(classification1.distance < 1.0);

    // Perturbed color with ambient noise: Red with slight green/blue tint
    const noisyRed: RGBColor = [240, 15, 20];
    const classification2 = classifyNearestCskColor(noisyRed, CSK8_CONSTELLATION);
    assert.equal(classification2.index, 4); // Red is index 4 in CSK8
    assert.equal(classification2.valid, true);

    // CSK16 classification
    const exactNavy: RGBColor = [0, 0, 128];
    const classification3 = classifyNearestCskColor(exactNavy, CSK16_CONSTELLATION);
    assert.equal(classification3.index, 1); // Navy is index 1 in CSK16
    assert.equal(classification3.valid, true);

    // Distances
    const dRgb = euclideanDistanceRgb([0, 0, 0], [10, 10, 10]);
    assert.ok(dRgb > 0);
    const dYuv = euclideanDistanceYuv(rgbToYuv([0, 0, 0]), rgbToYuv([10, 10, 10]));
    assert.ok(dYuv > 0);
  });

  test("computes adaptive thresholds and exposure stability in calibration engine", () => {
    const engine = new OpticalCalibrationEngine();

    // 1. Exposure stabilization tracking
    for (let i = 0; i < 10; i++) {
      engine.feedLuminanceSample(120 + Math.sin(i) * 1.5); // small noise
    }
    assert.equal(engine.isExposureStable(), true);

    // 2. Perform calibration with White=240, Black=20, Ambient=15
    const cal = engine.calibrate([240, 240, 240], [20, 20, 20], 15);

    assert.equal(cal.whiteLevel, 240);
    assert.equal(cal.blackLevel, 20);
    assert.equal(cal.dynamicRange, 220);
    assert.equal(cal.adaptiveThreshold, 130); // 20 + 220*0.5
    assert.equal(cal.isExposureStable, true);
    assert.ok(cal.confidenceScore >= 0.8);

    // Verify 4-PAM decision boundaries
    assert.ok(cal.pam4Thresholds[0] < cal.pam4Thresholds[1]);
    assert.ok(cal.pam4Thresholds[1] < cal.pam4Thresholds[2]);

    // Verify calibrated CSK palettes have 8 and 16 entries
    assert.equal(cal.calibratedPalette8.length, 8);
    assert.equal(cal.calibratedPalette16.length, 16);
  });

  test("extracts center Region-of-Interest (ROI) from synthetic image buffer", () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill all pixels with RGB(100, 150, 200, 255)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 100;
      data[i * 4 + 1] = 150;
      data[i * 4 + 2] = 200;
      data[i * 4 + 3] = 255;
    }

    const roi = extractCenterRoiAverage({ data, width, height }, 0.5);
    assert.equal(roi.rgb[0], 100);
    assert.equal(roi.rgb[1], 150);
    assert.equal(roi.rgb[2], 200);
    assert.ok(roi.luminance > 0);
  });

  test("demodulates OOK and 4-PAM modulated streams with bit-perfect CRC verification", () => {
    const payload = new Uint8Array([0xaa, 0x55, 0x12, 0x34, 0xfe, 0xdc]);
    const engine = new OpticalCalibrationEngine();
    const calibration = engine.calibrate(255, 0, 0);
    const demodulator = new VlcDemodulator(calibration);

    // 1. OOK Roundtrip
    const ookFrame: VlcFrame = { version: 1, modulation: "ook", seqNumber: 7, payload };
    const ookBytes = encodeVlcFrame(ookFrame);
    const ookStream = modulateOok(ookBytes);

    const ookSamples = Array.from(ookStream.levels).map((luma, i) => ({
      rgb: [luma, luma, luma] as RGBColor,
      luminance: luma,
      timestamp: i * 33,
    }));

    const decodedOok = demodulator.demodulate(ookSamples, "ook");
    assert.ok(decodedOok !== null);
    assert.equal(decodedOok.seqNumber, 7);
    assert.equal(decodedOok.modulation, "ook");
    assert.deepEqual(decodedOok.payload, payload);
    assert.equal(decodedOok.isValidCrc, true);

    // 2. 4-PAM Roundtrip
    const pamFrame: VlcFrame = { version: 1, modulation: "pam4", seqNumber: 8, payload };
    const pamBytes = encodeVlcFrame(pamFrame);
    const pamStream = modulatePam4(pamBytes);

    const pamSamples = Array.from(pamStream.levels).map((luma, i) => ({
      rgb: [luma, luma, luma] as RGBColor,
      luminance: luma,
      timestamp: i * 33,
    }));

    const decodedPam = demodulator.demodulate(pamSamples, "pam4");
    assert.ok(decodedPam !== null);
    assert.equal(decodedPam.seqNumber, 8);
    assert.equal(decodedPam.modulation, "pam4");
    assert.deepEqual(decodedPam.payload, payload);
    assert.equal(decodedPam.isValidCrc, true);
  });

  test("demodulates CSK-8 and CSK-16 color-modulated streams with bit-perfect CRC verification", () => {
    const payload = new Uint8Array([0x4c, 0x75, 0x6d, 0x65, 0x6e, 0x21]); // "Lumen!"
    const engine = new OpticalCalibrationEngine();
    const calibration = engine.calibrate(255, 0, 0);
    const demodulator = new VlcDemodulator(calibration);

    // 1. CSK-8 Roundtrip
    const csk8Frame: VlcFrame = { version: 1, modulation: "csk8", seqNumber: 99, payload };
    const csk8Bytes = encodeVlcFrame(csk8Frame);
    const csk8Stream = modulateCsk8(csk8Bytes);

    const csk8Samples = csk8Stream.colors.map((color, i) => ({
      rgb: color,
      luminance: csk8Stream.levels[i],
      timestamp: i * 33,
    }));

    const decodedCsk8 = demodulator.demodulate(csk8Samples, "csk8");
    assert.ok(decodedCsk8 !== null);
    assert.equal(decodedCsk8.seqNumber, 99);
    assert.equal(decodedCsk8.modulation, "csk8");
    assert.deepEqual(decodedCsk8.payload, payload);
    assert.equal(decodedCsk8.isValidCrc, true);

    // 2. CSK-16 Roundtrip
    const csk16Frame: VlcFrame = { version: 1, modulation: "csk16", seqNumber: 100, payload };
    const csk16Bytes = encodeVlcFrame(csk16Frame);
    const csk16Stream = modulateCsk16(csk16Bytes);

    const csk16Samples = csk16Stream.colors.map((color, i) => ({
      rgb: color,
      luminance: csk16Stream.levels[i],
      timestamp: i * 33,
    }));

    const decodedCsk16 = demodulator.demodulate(csk16Samples, "csk16");
    assert.ok(decodedCsk16 !== null);
    assert.equal(decodedCsk16.seqNumber, 100);
    assert.equal(decodedCsk16.modulation, "csk16");
    assert.deepEqual(decodedCsk16.payload, payload);
    assert.equal(decodedCsk16.isValidCrc, true);
  });
});
