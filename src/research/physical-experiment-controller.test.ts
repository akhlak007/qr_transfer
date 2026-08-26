import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PhysicalExperimentController } from "./physical-experiment-controller";
import type { PhysicalExperimentSessionConfig } from "./physical-experiment-session";
import { TransportId } from "../core/transport";

describe("Unified Physical Experiment Controller Unit Tests (Milestone 6D)", () => {
  const sampleVlcConfig: PhysicalExperimentSessionConfig = {
    sessionId: "vlc-test-session",
    transport: TransportId.VLC,
    vlcModulation: "ook",
    distanceCm: 10,
    ambientLux: 300,
    exposureMode: "locked",
    payload: new TextEncoder().encode("VLC_PHYSICAL_BENCHMARK_TEST"),
    symbolRate: 30,
    transmitterDevice: "MacBook Pro",
    transmitterDisplay: "Liquid Retina XDR",
    displayResolution: "3024x1964",
    displayRefreshRate: 120,
    receiverDevice: "iPhone 15 Pro",
    receiverCamera: "48MP Main Camera",
    operatingSystem: "macOS 14.4",
    browser: "Node.js Test",
  };

  const sampleOfdmConfig: PhysicalExperimentSessionConfig = {
    sessionId: "ofdm-test-session",
    transport: TransportId.VisualOFDM,
    ofdmModulation: "bpsk",
    ofdmGridSize: 8,
    distanceCm: 15,
    ambientLux: 300,
    exposureMode: "locked",
    payload: new TextEncoder().encode("OFDM_PHYSICAL_BENCHMARK_TEST"),
    symbolRate: 15,
    transmitterDevice: "MacBook Pro",
    transmitterDisplay: "Liquid Retina XDR",
    displayResolution: "3024x1964",
    displayRefreshRate: 120,
    receiverDevice: "iPhone 15 Pro",
    receiverCamera: "48MP Main Camera",
    operatingSystem: "macOS 14.4",
    browser: "Node.js Test",
  };

  test("initializes session and computes expected SHA-256 digest accurately", async () => {
    const controller = new PhysicalExperimentController();
    await controller.initializeSession(sampleVlcConfig);

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.state, "IDLE");
    assert.equal(snapshot.transport, TransportId.VLC);
    assert.equal(snapshot.expectedSha256.length, 64);
  });

  test("evaluates device readiness correctly with missing canvas / active camera", async () => {
    const controller = new PhysicalExperimentController();
    await controller.initializeSession(sampleVlcConfig);

    const readinessWithoutCanvas = controller.checkDeviceReadiness(sampleVlcConfig, false);
    assert.equal(readinessWithoutCanvas.displayCanvasAvailable, false);
    assert.equal(readinessWithoutCanvas.isReadyForExperiment, false);

    const readinessWithCanvas = controller.checkDeviceReadiness(sampleVlcConfig, true);
    assert.equal(readinessWithCanvas.displayCanvasAvailable, true);
    assert.equal(readinessWithCanvas.opticalDistanceValid, true);
    assert.equal(readinessWithCanvas.ambientLuxValid, true);
  });

  test("dispatches VLC experiment and handles headless camera denial gracefully", async () => {
    const controller = new PhysicalExperimentController();
    await controller.initializeSession(sampleVlcConfig);

    const mockCanvas = {
      getContext: () => null,
      width: 320,
      height: 240,
    } as unknown as HTMLCanvasElement;

    const { physicalRun, ledgerRun } = await controller.runExperiment(mockCanvas);

    assert.equal(physicalRun.transport, TransportId.VLC);
    assert.equal(physicalRun.evidenceKind, "physical");
    assert.equal(physicalRun.outcome, "sync_failure");
    assert.equal(ledgerRun.evidenceKind, "physical");
    assert.equal(controller.getState(), "FAILED");
  });

  test("dispatches OFDM experiment and handles headless camera denial gracefully", async () => {
    const controller = new PhysicalExperimentController();
    await controller.initializeSession(sampleOfdmConfig);

    const mockCanvas = {
      getContext: () => null,
      width: 256,
      height: 256,
    } as unknown as HTMLCanvasElement;

    const { physicalRun, ledgerRun } = await controller.runExperiment(mockCanvas);

    assert.equal(physicalRun.transport, TransportId.VisualOFDM);
    assert.equal(physicalRun.evidenceKind, "physical");
    assert.equal(physicalRun.outcome, "sync_failure");
    assert.equal(ledgerRun.evidenceKind, "physical");
    assert.equal(controller.getState(), "FAILED");
  });

  test("cancellation properly transitions controller to CANCELLED state and cleans up", () => {
    const controller = new PhysicalExperimentController();
    controller.cancel();
    assert.equal(controller.getState(), "CANCELLED");
    const snap = controller.getSnapshot();
    assert.equal(snap.failureReason, "USER_CANCELLED");
  });
});
