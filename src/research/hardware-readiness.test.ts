import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateHardwareReadiness,
  type HardwareReadinessCriteria,
} from "./hardware-readiness";

describe("Hardware Readiness Gate Unit Tests (Milestone 7G)", () => {
  const validCriteria: HardwareReadinessCriteria = {
    cameraPermission: true,
    cameraStreamAvailable: true,
    cameraResolution: { width: 1280, height: 720 },
    measuredFps: 30,
    transmitterCanvasAvailable: true,
    displayResolution: { width: 1920, height: 1080 },
    opticalDistanceCm: 25,
    ambientLux: 220,
    selectedModulation: "OOK",
    payloadLoaded: true,
    expectedSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    physicalEvidenceMode: true,
  };

  test("passes evaluation when all physical criteria are met", () => {
    const result = evaluateHardwareReadiness(validCriteria);
    assert.equal(result.ready, true);
    assert.equal(result.status, "READY");
    assert.equal(result.errors.length, 0);
    assert.equal(result.passedChecksCount, 10);
  });

  test("fails readiness when camera is disconnected or FPS is zero", () => {
    const disconnected = evaluateHardwareReadiness({
      ...validCriteria,
      cameraStreamAvailable: false,
    });
    assert.equal(disconnected.ready, false);
    assert.equal(disconnected.status, "NOT_READY");
    assert.ok(disconnected.errors.some((e) => e.includes("MediaStream")));

    const zeroFps = evaluateHardwareReadiness({
      ...validCriteria,
      measuredFps: 0,
    });
    assert.equal(zeroFps.ready, false);
    assert.ok(zeroFps.errors.some((e) => e.includes("FPS")));
  });

  test("fails readiness when distance is zero or simulation mode is active", () => {
    const zeroDist = evaluateHardwareReadiness({
      ...validCriteria,
      opticalDistanceCm: 0,
    });
    assert.equal(zeroDist.ready, false);

    const simMode = evaluateHardwareReadiness({
      ...validCriteria,
      physicalEvidenceMode: false,
    });
    assert.equal(simMode.ready, false);
    assert.ok(simMode.errors.some((e) => e.includes("Physical Evidence Mode")));
  });
});
