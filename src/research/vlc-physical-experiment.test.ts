import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  VlcPhysicalExperimentService,
  type VlcExperimentConfig,
} from "./vlc-physical-experiment";
import { validatePhysicalTestRun, isVerifiedPhysicalRun } from "./physical-test-run";
import { aggregatePhysicalEvidence } from "./physical-evidence";
import { TransportId } from "../core/transport";

describe("VLC Physical Experiment Service Unit Tests (Milestone 6B)", () => {
  const sampleConfig: VlcExperimentConfig = {
    modulation: "ook",
    distanceCm: 10,
    ambientLux: 250,
    exposureMode: "locked",
    payload: new TextEncoder().encode("Hello Real VLC Physical World"),
    symbolRate: 30,
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
    const service = new VlcPhysicalExperimentService();
    assert.equal(service.getState(), "IDLE");
    assert.equal(service.isRunning(), false);
  });

  test("handles missing camera stream in headless runtime and generates compliant failure PhysicalTestRun", async () => {
    const service = new VlcPhysicalExperimentService();
    let stateNotificationCount = 0;

    service.setStateChangeCallback((telemetry) => {
      stateNotificationCount++;
      assert.ok(telemetry.state !== undefined);
      assert.equal(typeof telemetry.elapsedMs, "number");
    });

    // Mock minimal canvas object
    const mockCanvas = {
      getContext: () => null,
      width: 640,
      height: 480,
    } as unknown as HTMLCanvasElement;

    const result = await service.runExperiment(sampleConfig, mockCanvas);

    assert.equal(result.transport, TransportId.VLC);
    assert.equal(result.evidenceKind, "physical");
    assert.equal(result.outcome, "sync_failure");
    assert.equal(result.sha256Matched, false);
    assert.equal(result.crcPassed, false);
    assert.equal(isVerifiedPhysicalRun(result), false);

    // Ensure validation passes on the generated failure record
    const errors = validatePhysicalTestRun(result);
    assert.equal(errors.length, 0);
    assert.ok(stateNotificationCount > 0);
  });

  test("cancellation properly transitions to USER_CANCELLED and cleans up", () => {
    const service = new VlcPhysicalExperimentService();
    service.cancel();
    assert.equal(service.getState(), "USER_CANCELLED");
    assert.equal(service.isRunning(), false);
  });

  test("evaluates physical evidence as INSUFFICIENT when fewer than 3 runs exist", () => {
    const summary = aggregatePhysicalEvidence([], TransportId.VLC, "ook");
    assert.equal(summary.verificationStatus, "EXPERIMENTAL_NOT_TESTED");
    assert.equal(summary.policyDetails.satisfied, false);
  });
});
