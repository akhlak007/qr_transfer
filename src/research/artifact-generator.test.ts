import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generateMarkdownArtifactPackage,
  generateJsonArtifactPackage,
  generateCsvArtifactPackage,
} from "./artifact-generator";
import { packageResearchDataset } from "./dataset-packager";
import { validateReproducibility } from "./reproducibility-validator";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Research Artifact Generator Unit Tests (Milestone 7C)", () => {
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

  test("generates Markdown artifact package containing all required sections", async () => {
    const bundle = await packageResearchDataset([sampleRun]);
    const validationReport = await validateReproducibility(bundle.manifests, [sampleRun]);

    const md = generateMarkdownArtifactPackage(bundle, validationReport, {
      title: "Optical Communication Research Artifact Package",
    });

    assert.ok(md.includes("# Optical Communication Research Artifact Package"));
    assert.ok(md.includes("## 1. Executive Summary & Provenance"));
    assert.ok(md.includes("## 2. Reproducibility Validation Audit"));
    assert.ok(md.includes("## 3. Physical Benchmark Comparative Summary"));
    assert.ok(md.includes("## 4. Experiment Manifest Registry"));
    assert.ok(md.includes("## 5. Scientific Integrity & Non-Fabrication Declaration"));
    assert.ok(md.includes(bundle.bundleIntegrityChecksum));
  });

  test("generates JSON artifact bundle", async () => {
    const bundle = await packageResearchDataset([sampleRun]);
    const validationReport = await validateReproducibility(bundle.manifests, [sampleRun]);

    const jsonStr = generateJsonArtifactPackage(bundle, validationReport);
    const parsed = JSON.parse(jsonStr);

    assert.ok(parsed.datasetBundle !== undefined);
    assert.ok(parsed.reproducibilityReport !== undefined);
  });

  test("generates CSV artifact manifest list", async () => {
    const bundle = await packageResearchDataset([sampleRun]);
    const csv = generateCsvArtifactPackage(bundle);
    const lines = csv.trim().split("\n");

    assert.equal(lines.length, 2); // Header + 1 record
    assert.ok(lines[0].startsWith("ExperimentId,Transport"));
  });
});
