import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateReproducibility,
  ReproducibilityStatus,
} from "./reproducibility-validator";
import { createExperimentManifest, type ExperimentManifest } from "./experiment-manifest";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Reproducibility & Integrity Validator Unit Tests (Milestone 7C)", () => {
  const sampleValidRun: TestRun = {
    schemaVersion: 1,
    runId: "run-001",
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.VLC,
    sender: { platform: "desktop", deviceName: "Mac", osVersion: "14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "17", browserName: "Safari", browserVersion: "17" },
    fileName: "vlc.bin",
    fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    integrityStatus: "verified",
    metrics: {
      fileSize: 1000,
      elapsedMs: 100,
      averageThroughputBytesPerSecond: 10000,
      frameHitRate: 1.0,
      errorRate: 0,
      recoveryOverhead: null,
      cameraFps: 30,
      screenFps: 60,
      signalQuality: 0.9,
    },
    distanceCm: 15,
    environment: "normal",
    notes: "Controlled valid run",
    createdAt: 1000,
    completedAt: 1100,
  };

  test("validates valid manifests with 100% score and VALID status", async () => {
    const manifest: ExperimentManifest = await createExperimentManifest({
      experimentId: "exp-run-001",
      createdAt: 1000,
      transport: TransportId.VLC,
      modulation: "OOK",
      transmitter: { deviceModel: "Mac", resolution: "1080p", operatingSystem: "macOS", browser: "Chrome" },
      receiver: { deviceModel: "iPhone", resolution: "720p", operatingSystem: "iOS", browser: "Safari" },
      environment: { distanceCm: 15, ambientLux: 250, exposureMode: "locked" },
      targetFps: 30,
      softwareVersion: "1.0.0",
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });

    const report = await validateReproducibility([manifest], [sampleValidRun]);

    assert.equal(report.status, ReproducibilityStatus.VALID);
    assert.equal(report.reproducibilityScore, 100);
    assert.equal(report.issues.length, 0);
  });

  test("detects duplicate experiment IDs and flags as INVALID", async () => {
    const manifest1 = await createExperimentManifest({
      experimentId: "dup-id",
      createdAt: 1000,
      transport: TransportId.VLC,
      modulation: "OOK",
      transmitter: { deviceModel: "Mac", resolution: "1080p", operatingSystem: "macOS", browser: "Chrome" },
      receiver: { deviceModel: "iPhone", resolution: "720p", operatingSystem: "iOS", browser: "Safari" },
      environment: { distanceCm: 15, ambientLux: 250, exposureMode: "locked" },
      targetFps: 30,
      softwareVersion: "1.0.0",
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    const manifest2 = { ...manifest1 };

    const report = await validateReproducibility([manifest1, manifest2], []);

    assert.equal(report.status, ReproducibilityStatus.INVALID);
    assert.ok(report.issues.some((i) => i.code === "DUPLICATE_EXPERIMENT_ID"));
  });

  test("detects broken manifest hash tampering", async () => {
    const manifest = await createExperimentManifest({
      experimentId: "tampered-id",
      createdAt: 1000,
      transport: TransportId.VLC,
      modulation: "OOK",
      transmitter: { deviceModel: "Mac", resolution: "1080p", operatingSystem: "macOS", browser: "Chrome" },
      receiver: { deviceModel: "iPhone", resolution: "720p", operatingSystem: "iOS", browser: "Safari" },
      environment: { distanceCm: 15, ambientLux: 250, exposureMode: "locked" },
      targetFps: 30,
      softwareVersion: "1.0.0",
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });

    manifest.manifestHash = "0000000000000000000000000000000000000000000000000000000000000000";

    const report = await validateReproducibility([manifest], []);

    assert.equal(report.status, ReproducibilityStatus.INVALID);
    assert.ok(report.issues.some((i) => i.code === "BROKEN_MANIFEST_HASH"));
  });
});
