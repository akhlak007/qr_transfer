import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generatePhysicalMarkdownReport,
  generatePhysicalJsonReport,
  generatePhysicalCsvReport,
} from "./physical-report-generator";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Optical Research Report Generator Unit Tests (Milestone 7A)", () => {
  const sampleRun: TestRun = {
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

  test("generates comprehensive Markdown report containing executive summary and modulation matrix", () => {
    const md = generatePhysicalMarkdownReport([sampleRun]);
    assert.ok(md.includes("# Physical Optical Performance & Characterization Report"));
    assert.ok(md.includes("**Total Physical Runs Evaluated:** 1"));
    assert.ok(md.includes("OOK"));
    assert.ok(md.includes("Failure Mode & Root-Cause Classification"));
    assert.ok(md.includes("Scientific Integrity Declaration"));
  });

  test("generates structured JSON analytics report", () => {
    const jsonStr = generatePhysicalJsonReport([sampleRun]);
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.totalPhysicalRuns, 1);
    assert.equal(parsed.totalSuccessfulRuns, 1);
    assert.ok(Array.isArray(parsed.modulations));
    assert.ok(Array.isArray(parsed.distanceBins));
  });

  test("generates valid CSV report with modulation columns", () => {
    const csv = generatePhysicalCsvReport([sampleRun]);
    const lines = csv.trim().split("\n");
    assert.ok(lines.length >= 2); // Header + at least 1 modulation row
    assert.ok(lines[0].startsWith("Transport,Modulation,TotalRuns"));
  });
});
