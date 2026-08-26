import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createExperimentManifest,
  deriveManifestFromTestRun,
  serializeManifestForHashing,
  computeManifestHash,
} from "./experiment-manifest";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Experiment Manifest System Unit Tests (Milestone 7C)", () => {
  test("creates a complete manifest and computes deterministic SHA-256 manifestHash", async () => {
    const manifest = await createExperimentManifest({
      experimentId: "exp-vlc-test-01",
      createdAt: 1700000000000,
      transport: TransportId.VLC,
      modulation: "OOK",
      transmitter: {
        deviceModel: "MacBook Pro",
        resolution: "3024x1964",
        refreshRateHz: 120,
        operatingSystem: "macOS 14.4",
        browser: "Chrome",
      },
      receiver: {
        deviceModel: "iPhone 15 Pro",
        resolution: "1920x1080",
        operatingSystem: "iOS 17.4",
        browser: "Safari",
      },
      environment: {
        distanceCm: 25,
        ambientLux: 300,
        exposureMode: "locked",
      },
      targetFps: 30,
      softwareVersion: "1.0.0",
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      notes: "Baseline physical test",
    });

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.experimentId, "exp-vlc-test-01");
    assert.ok(manifest.manifestHash !== undefined);
    assert.equal(manifest.manifestHash.length, 64);

    // Verify hash stability
    const recalculatedHash = await computeManifestHash(manifest);
    assert.equal(manifest.manifestHash, recalculatedHash);
  });

  test("derives an experiment manifest accurately from a TestRun record", async () => {
    const sampleRun: TestRun = {
      schemaVersion: 1,
      runId: "phys-run-99",
      status: "complete",
      evidenceKind: "physical",
      transport: TransportId.VisualOFDM,
      sender: {
        platform: "desktop",
        deviceName: "MacBook Air",
        osVersion: "macOS",
        browserName: "Chrome",
        browserVersion: "124",
      },
      receiver: {
        platform: "iphone",
        deviceName: "iPhone 14",
        osVersion: "iOS",
        browserName: "Safari",
        browserVersion: "17",
      },
      fileName: "physical_ofdm_bpsk_8x8_51200B.bin",
      fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      integrityStatus: "verified",
      metrics: {
        fileSize: 51200,
        elapsedMs: 2000,
        averageThroughputBytesPerSecond: 25600,
        frameHitRate: 1.0,
        errorRate: 0.0,
        recoveryOverhead: null,
        cameraFps: 30.0,
        screenFps: 60.0,
        signalQuality: 0.95,
      },
      distanceCm: 15,
      environment: "normal",
      notes: "Locked exposure bench run",
      createdAt: 1700000000000,
      completedAt: 1700000002000,
    };

    const manifest = await deriveManifestFromTestRun(sampleRun);
    assert.equal(manifest.transport, TransportId.VisualOFDM);
    assert.equal(manifest.modulation, "BPSK");
    assert.equal(manifest.gridSize, 8);
    assert.equal(manifest.environment.distanceCm, 15);
    assert.equal(manifest.environment.exposureMode, "locked");
    assert.ok(manifest.manifestHash !== undefined);
  });

  test("serializes deterministically across identical objects", () => {
    const obj1 = {
      schemaVersion: 1,
      experimentId: "test-id",
      createdAt: 1000,
      transport: TransportId.QR,
      modulation: "QR",
      transmitter: { deviceModel: "A", resolution: "1080p", operatingSystem: "OS", browser: "B" },
      receiver: { deviceModel: "C", resolution: "720p", operatingSystem: "OS", browser: "B" },
      environment: { distanceCm: 10, ambientLux: 200, exposureMode: "auto" as const },
      targetFps: 30,
      softwareVersion: "1.0",
      expectedPayloadSha256: "hash",
    };

    const s1 = serializeManifestForHashing(obj1);
    const s2 = serializeManifestForHashing({ ...obj1 });
    assert.equal(s1, s2);
  });
});
