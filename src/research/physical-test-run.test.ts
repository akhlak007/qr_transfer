import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validatePhysicalTestRun,
  isVerifiedPhysicalRun,
  type PhysicalTestRun,
} from "./physical-test-run";
import { TransportId } from "../core/transport";

describe("Physical Optical Test Run Model & Validation (Milestone 5A)", () => {
  const sampleValidRun: PhysicalTestRun = {
    schemaVersion: 1,
    runId: "phys-run-001",
    timestamp: Date.now(),
    evidenceKind: "physical",
    transport: TransportId.QR,
    modulation: "qr",
    transmitterDevice: "Pixel 7 Pro",
    transmitterDisplay: "OLED 120Hz",
    displayResolution: "3120x1440",
    displayRefreshRate: 120,
    receiverDevice: "iPhone 15 Pro",
    receiverCamera: "48MP Main Camera",
    cameraResolution: "1920x1080",
    operatingSystem: "iOS 17.4",
    browser: "Safari 17.4",
    distanceCm: 30,
    ambientLightLux: 350,
    exposureMode: "locked",
    gain: 1.0,
    frameRate: 30,
    payloadSizeBytes: 51200,
    blockSize: 512,
    symbolRate: 24,
    durationMs: 4200,
    reconstructedBytes: 51200,
    sha256Original: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sha256Recovered: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    sha256Matched: true,
    crcPassed: true,
    droppedFrames: 1,
    synchronizationStatus: "locked",
    outcome: "success",
    notes: "Controlled laboratory bench run.",
  };

  test("validates a compliant physical test run with zero errors", () => {
    const errors = validatePhysicalTestRun(sampleValidRun);
    assert.equal(errors.length, 0);
    assert.equal(isVerifiedPhysicalRun(sampleValidRun), true);
  });

  test("rejects run when SHA-256 digests do not match but sha256Matched is true", () => {
    const invalidRun: PhysicalTestRun = {
      ...sampleValidRun,
      sha256Recovered: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      sha256Matched: true,
    };

    const errors = validatePhysicalTestRun(invalidRun);
    assert.ok(errors.some((e) => e.includes("contradicts hash comparison")));
    assert.equal(isVerifiedPhysicalRun(invalidRun), false);
  });

  test("rejects run with missing hardware transmitter/receiver evidence", () => {
    const incompleteRun: PhysicalTestRun = {
      ...sampleValidRun,
      transmitterDevice: "",
      receiverCamera: "",
    };

    const errors = validatePhysicalTestRun(incompleteRun);
    assert.ok(errors.includes("transmitterDevice is required"));
    assert.ok(errors.includes("receiverCamera is required"));
    assert.equal(isVerifiedPhysicalRun(incompleteRun), false);
  });

  test("properly records failed physical runs without discarding evidence", () => {
    const failedRun: PhysicalTestRun = {
      ...sampleValidRun,
      reconstructedBytes: 25600,
      sha256Recovered: "1111111111111111111111111111111111111111111111111111111111111111",
      sha256Matched: false,
      crcPassed: false,
      synchronizationStatus: "intermittent",
      outcome: "sha256_mismatch",
    };

    const errors = validatePhysicalTestRun(failedRun);
    assert.equal(errors.length, 0); // valid physical failure record
    assert.equal(isVerifiedPhysicalRun(failedRun), false);
  });
});
