import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  OfdmPhysicalExperimentService,
  extractSpatialGridFromImageData,
  type OfdmExperimentConfig,
} from "./ofdm-physical-experiment";
import { validatePhysicalTestRun, isVerifiedPhysicalRun } from "./physical-test-run";
import { aggregatePhysicalEvidence } from "./physical-evidence";
import { TransportId } from "../core/transport";

describe("Visual OFDM Physical Experiment Service Unit Tests (Milestone 6C)", () => {
  const sampleConfig: OfdmExperimentConfig = {
    modulation: "bpsk",
    gridSize: 8,
    distanceCm: 15,
    ambientLux: 300,
    exposureMode: "locked",
    payload: new TextEncoder().encode("OFDM_PHYSICAL_TEST_DATA"),
    symbolRate: 15,
    transmitterDevice: "MacBook Pro M3",
    transmitterDisplay: "Liquid Retina XDR",
    displayResolution: "3024x1964",
    displayRefreshRate: 120,
    receiverDevice: "iPhone 15 Pro",
    receiverCamera: "48MP Main Camera",
    operatingSystem: "macOS 14.4",
    browser: "Node.js Test",
    notes: "Unit test run",
  };

  test("initializes in IDLE state with running = false", () => {
    const service = new OfdmPhysicalExperimentService();
    assert.equal(service.getState(), "IDLE");
    assert.equal(service.isRunning(), false);
  });

  test("extractSpatialGridFromImageData correctly computes grid of dimension N*N", () => {
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill with known luminance values
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 120; // R
      data[i + 1] = 120; // G
      data[i + 2] = 120; // B
      data[i + 3] = 255; // A
    }

    const imgData = { data, width, height } as unknown as ImageData;
    const spatial8 = extractSpatialGridFromImageData(imgData, 8);
    assert.equal(spatial8.length, 64);
    assert.ok(Math.abs(spatial8[0] - 120) < 1.0);

    const spatial16 = extractSpatialGridFromImageData(imgData, 16);
    assert.equal(spatial16.length, 256);
  });

  test("handles missing camera stream in headless runtime and generates compliant failure PhysicalTestRun", async () => {
    const service = new OfdmPhysicalExperimentService();
    let stateNotificationCount = 0;

    service.setStateChangeCallback((telemetry) => {
      stateNotificationCount++;
      assert.ok(telemetry.state !== undefined);
      assert.equal(typeof telemetry.elapsedMs, "number");
    });

    const mockCanvas = {
      getContext: () => null,
      width: 256,
      height: 256,
    } as unknown as HTMLCanvasElement;

    const result = await service.runExperiment(sampleConfig, mockCanvas);

    assert.equal(result.transport, TransportId.VisualOFDM);
    assert.equal(result.evidenceKind, "physical");
    assert.equal(result.outcome, "sync_failure");
    assert.equal(result.sha256Matched, false);
    assert.equal(result.crcPassed, false);
    assert.equal(isVerifiedPhysicalRun(result), false);

    const errors = validatePhysicalTestRun(result);
    assert.equal(errors.length, 0);
    assert.ok(stateNotificationCount > 0);
  });

  test("cancellation properly transitions to USER_CANCELLED and cleans up", () => {
    const service = new OfdmPhysicalExperimentService();
    service.cancel();
    assert.equal(service.getState(), "USER_CANCELLED");
    assert.equal(service.isRunning(), false);
  });

  test("evaluates physical evidence as INSUFFICIENT when fewer than 3 runs exist", () => {
    const summary = aggregatePhysicalEvidence([], TransportId.VisualOFDM, "bpsk");
    assert.equal(summary.verificationStatus, "EXPERIMENTAL_NOT_TESTED");
    assert.equal(summary.policyDetails.satisfied, false);
  });
});
