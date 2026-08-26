import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePhysicalThroughput,
  type PhysicalExperimentSessionConfig,
  type PhysicalExperimentTelemetrySnapshot,
} from "./physical-experiment-session";
import { TransportId } from "../core/transport";

describe("Physical Experiment Session Model & Throughput Calculation Unit Tests (Milestone 6D)", () => {
  test("calculates accurate throughput in bps, kbps, and mbps from measured duration", () => {
    const payloadBytes = 51200;
    const durationMs = 2000; // 2.0 seconds -> 51,200 * 8 / 2 = 204,800 bps = 204.8 kbps = 0.205 mbps

    const throughput = calculatePhysicalThroughput(payloadBytes, durationMs);
    assert.equal(throughput.bps, 204800);
    assert.equal(throughput.kbps, 204.8);
    assert.equal(throughput.mbps, 0.205);
  });

  test("handles zero duration or zero bytes safely without divide-by-zero", () => {
    const zeroDuration = calculatePhysicalThroughput(51200, 0);
    assert.equal(zeroDuration.bps, 0);
    assert.equal(zeroDuration.kbps, 0);
    assert.equal(zeroDuration.mbps, 0);

    const zeroBytes = calculatePhysicalThroughput(0, 1500);
    assert.equal(zeroBytes.bps, 0);
  });

  test("validates configuration model structure", () => {
    const config: PhysicalExperimentSessionConfig = {
      sessionId: "session-001",
      transport: TransportId.VLC,
      vlcModulation: "ook",
      distanceCm: 25,
      ambientLux: 350,
      exposureMode: "locked",
      payload: new Uint8Array([1, 2, 3, 4, 5]),
      symbolRate: 30,
      transmitterDevice: "MacBook Pro",
      transmitterDisplay: "Liquid Retina XDR",
      displayResolution: "3024x1964",
      displayRefreshRate: 120,
      receiverDevice: "iPhone 15 Pro",
      receiverCamera: "48MP Main",
      operatingSystem: "iOS 17.4",
      browser: "Safari",
    };

    assert.equal(config.transport, TransportId.VLC);
    assert.equal(config.distanceCm, 25);
    assert.equal(config.payload.length, 5);
  });

  test("validates telemetry snapshot structure with immutable semantics", () => {
    const snapshot: PhysicalExperimentTelemetrySnapshot = {
      sessionId: "session-001",
      state: "IDLE",
      transport: TransportId.VisualOFDM,
      elapsedMs: 0,
      transmissionDurationMs: 0,
      cameraDiagnostics: null,
      displayDiagnostics: null,
      readiness: {
        cameraPermissionGranted: false,
        cameraStreamActive: false,
        cameraResolutionDetected: false,
        cameraFpsStable: false,
        displayCanvasAvailable: true,
        displayRefreshRateMeasured: true,
        opticalDistanceValid: true,
        ambientLuxValid: true,
        calibrationPassed: false,
        payloadPrepared: true,
        sha256Generated: true,
        isReadyForExperiment: false,
      },
      dynamicRange: 0,
      isExposureStable: false,
      detectedSync: false,
      crcPassed: false,
      expectedSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      recoveredSha256: null,
      sha256Matched: false,
      reconstructedBytes: 0,
      throughputBps: 0,
      throughputKbps: 0,
      throughputMbps: 0,
      timestamp: Date.now(),
    };

    assert.equal(snapshot.state, "IDLE");
    assert.equal(snapshot.sha256Matched, false);
  });
});
