import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generatePhysicalEvidenceJson,
  generatePhysicalEvidenceCsv,
  type PhysicalEvidenceExportBundle,
} from "./physical-evidence-export";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Optical Evidence Export & Serialization Unit Tests (Milestone 6F)", () => {
  const samplePhysicalRun: TestRun = {
    schemaVersion: 1,
    runId: "phys-vlc-run-001",
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
    distanceCm: 25,
    environment: "normal",
    notes: "Controlled laboratory optical bench test",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  };

  const sampleSimulatedRun: TestRun = {
    schemaVersion: 1,
    runId: "sim-vlc-run-002",
    status: "complete",
    evidenceKind: "simulated",
    transport: TransportId.VLC,
    sender: {
      platform: "desktop",
      deviceName: "Simulator",
      osVersion: "N/A",
      browserName: "Node",
      browserVersion: "20",
    },
    receiver: {
      platform: "desktop",
      deviceName: "Simulator",
      osVersion: "N/A",
      browserName: "Node",
      browserVersion: "20",
    },
    fileName: "simulated_benchmark.bin",
    fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    integrityStatus: "verified",
    metrics: {
      fileSize: 51200,
      elapsedMs: 100,
      averageThroughputBytesPerSecond: 512000,
      frameHitRate: 1.0,
      errorRate: 0.0,
      recoveryOverhead: null,
      cameraFps: null,
      screenFps: null,
      signalQuality: 1.0,
    },
    distanceCm: null,
    environment: "normal",
    notes: "Synthetic channel benchmark",
    createdAt: 1700000000000,
    completedAt: 1700000000100,
  };

  test("generates JSON export containing physical evidence records exclusively", () => {
    const rawJson = generatePhysicalEvidenceJson([samplePhysicalRun, sampleSimulatedRun], "1.0.0");
    const parsed = JSON.parse(rawJson) as PhysicalEvidenceExportBundle;

    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.records[0].runId, "phys-vlc-run-001");
    assert.equal(parsed.records[0].evidenceKind, "physical");
    assert.equal(parsed.policy.minPhysicalRuns, 3);
    assert.ok(parsed.summaries.vlc !== undefined);
    assert.ok(parsed.summaries.ofdm !== undefined);
  });

  test("generates CSV export formatting headers and records accurately", () => {
    const csv = generatePhysicalEvidenceCsv([samplePhysicalRun, sampleSimulatedRun]);
    const lines = csv.trim().split("\n");

    assert.equal(lines.length, 2); // 1 header line + 1 physical record line
    assert.ok(lines[0].startsWith("RunID,Timestamp,Transport"));
    assert.ok(lines[1].includes("phys-vlc-run-001"));
    assert.ok(!csv.includes("sim-vlc-run-002"));
  });

  test("handles empty run list gracefully without crashing", () => {
    const json = generatePhysicalEvidenceJson([]);
    const parsed = JSON.parse(json) as PhysicalEvidenceExportBundle;
    assert.equal(parsed.records.length, 0);

    const csv = generatePhysicalEvidenceCsv([]);
    assert.equal(csv.trim().split("\n").length, 1); // Header only
  });
});
