import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PhysicalCameraService,
  PhysicalCameraException,
  DEFAULT_CAMERA_CONFIG,
} from "./physical-camera-capture";

describe("Physical Camera Capture Service Unit Tests (Milestone 6A)", () => {
  test("initializes with default configuration and inactive state", () => {
    const service = new PhysicalCameraService();
    assert.equal(service.isActive(), false);

    const config = service.getConfig();
    assert.equal(config.resolution, DEFAULT_CAMERA_CONFIG.resolution);
    assert.equal(config.requestedFps, DEFAULT_CAMERA_CONFIG.requestedFps);
    assert.equal(config.facingMode, DEFAULT_CAMERA_CONFIG.facingMode);
  });

  test("handles missing mediaDevices API in non-browser runtime cleanly", async () => {
    const service = new PhysicalCameraService();
    // In Node.js environment, navigator.mediaDevices.getUserMedia is unavailable
    await assert.rejects(
      async () => {
        await service.start({ resolution: "1280x720" });
      },
      (err: unknown) => {
        assert.ok(err instanceof PhysicalCameraException);
        assert.equal((err as PhysicalCameraException).code, "CAMERA_UNAVAILABLE");
        return true;
      }
    );
  });

  test("returns structured diagnostics snapshot even when idle", () => {
    const service = new PhysicalCameraService();
    const diag = service.getDiagnostics();

    assert.equal(typeof diag.width, "number");
    assert.equal(typeof diag.height, "number");
    assert.equal(typeof diag.actualFps, "number");
    assert.equal(typeof diag.droppedFrames, "number");
    assert.equal(typeof diag.luminanceMean, "number");
    assert.equal(typeof diag.exposureStable, "boolean");
    assert.ok(diag.rgbMean !== undefined);
  });

  test("properly cleans up resources on stop() call", () => {
    const service = new PhysicalCameraService();
    service.stop();
    assert.equal(service.isActive(), false);
    assert.equal(service.getTrackCapabilities(), null);
    assert.equal(service.getTrackSettings(), null);
  });
});
