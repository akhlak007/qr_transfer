import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  packageResearchDataset,
  exportDatasetBundleJson,
} from "./dataset-packager";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Dataset Packaging Engine Unit Tests (Milestone 7C)", () => {
  const samplePhysicalRun: TestRun = {
    schemaVersion: 1,
    runId: "phys-test-run-001",
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.VLC,
    sender: {
      platform: "desktop",
      deviceName: "MacBook Pro M3",
      osVersion: "macOS 14.4",
      browserName: "Chrome",
      browserVersion: "124",
    },
    receiver: {
      platform: "iphone",
      deviceName: "iPhone 15 Pro",
      osVersion: "iOS 17.4",
      browserName: "Safari",
      browserVersion: "17",
    },
    fileName: "physical_vlc_ook_51200B.bin",
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
    distanceCm: 20,
    environment: "normal",
    notes: "Controlled test run",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  };

  const sampleSimulatedRun: TestRun = {
    schemaVersion: 1,
    runId: "sim-run-002",
    status: "complete",
    evidenceKind: "simulated",
    transport: TransportId.VLC,
    sender: { platform: "desktop", deviceName: "Sim", osVersion: "", browserName: "", browserVersion: "" },
    receiver: { platform: "desktop", deviceName: "Sim", osVersion: "", browserName: "", browserVersion: "" },
    fileName: "sim.bin",
    fileHashHex: "hash",
    integrityStatus: "verified",
    metrics: {
      fileSize: 1000,
      elapsedMs: 10,
      averageThroughputBytesPerSecond: 100000,
      frameHitRate: 1.0,
      errorRate: 0,
      recoveryOverhead: null,
      cameraFps: null,
      screenFps: null,
      signalQuality: 1.0,
    },
    distanceCm: null,
    environment: "normal",
    notes: "sim notes",
    createdAt: 1700000000000,
    completedAt: 1700000000010,
  };

  test("packages physical runs into an immutable bundle with valid integrity checksum", async () => {
    const bundle = await packageResearchDataset([samplePhysicalRun, sampleSimulatedRun]);

    assert.equal(bundle.schemaVersion, 1);
    assert.equal(bundle.totalPhysicalRuns, 1);
    assert.equal(bundle.totalVerifiedRuns, 1);
    assert.equal(bundle.physicalEvidence.length, 1);
    assert.equal(bundle.manifests.length, 1);
    assert.ok(bundle.bundleIntegrityChecksum.length === 64);
    assert.ok(bundle.benchmarkComparison !== undefined);
    assert.ok(bundle.analyticsSummary !== undefined);
  });

  test("exports bundle formatted JSON deterministically", async () => {
    const bundle = await packageResearchDataset([samplePhysicalRun]);
    const jsonStr = exportDatasetBundleJson(bundle);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.bundleIntegrityChecksum, bundle.bundleIntegrityChecksum);
    assert.equal(parsed.totalPhysicalRuns, 1);
  });
});
