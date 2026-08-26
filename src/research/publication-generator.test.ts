import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generatePublicationMarkdownPaper,
  generatePublicationJson,
  generatePublicationCsv,
} from "./publication-generator";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Academic Publication Generator Unit Tests (Milestone 7B)", () => {
  const samplePhysicalRun: TestRun = {
    schemaVersion: 1,
    runId: "phys-qr-001",
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.QR,
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
    fileName: "physical_qr_benchmark.bin",
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
    distanceCm: 45,
    environment: "normal",
    notes: "Controlled QR test",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  };

  test("generates academic Markdown paper containing all mandatory IEEE/ACM sections", () => {
    const paper = generatePublicationMarkdownPaper([samplePhysicalRun], {
      title: "Screen-to-Camera Empirical Benchmark",
      authors: ["Dr. Jane Doe", "Dr. John Smith"],
    });

    assert.ok(paper.includes("# Screen-to-Camera Empirical Benchmark"));
    assert.ok(paper.includes("Dr. Jane Doe, Dr. John Smith"));
    assert.ok(paper.includes("## Abstract"));
    assert.ok(paper.includes("## 1. Introduction"));
    assert.ok(paper.includes("## 2. Methodology & Formal Evidence Policy"));
    assert.ok(paper.includes("## 3. Experimental Hardware & Optical Bench Setup"));
    assert.ok(paper.includes("## 4. Experimental Procedure"));
    assert.ok(paper.includes("## 5. Empirical Results & Performance Characterization"));
    assert.ok(paper.includes("Table 1: Physical Optical Transport Benchmark Comparison"));
    assert.ok(paper.includes("## 6. Comparative Transport Rankings"));
    assert.ok(paper.includes("## 7. Limitations"));
    assert.ok(paper.includes("## 8. Scientific Integrity & Anti-Fabrication Declaration"));
    assert.ok(paper.includes("## 9. Future Work & Recommendations"));
  });

  test("generates structured JSON publication package", () => {
    const jsonStr = generatePublicationJson([samplePhysicalRun]);
    const parsed = JSON.parse(jsonStr);
    assert.ok(parsed.metadata !== undefined);
    assert.ok(parsed.summary !== undefined);
    assert.equal(parsed.rawPhysicalEvidence.length, 1);
  });

  test("generates CSV summary with all three transport rows", () => {
    const csv = generatePublicationCsv([samplePhysicalRun]);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 4); // Header + QR + VLC + VisualOFDM
    assert.ok(lines[0].startsWith("Transport,TotalPhysicalRuns"));
    assert.ok(lines[1].startsWith("QR"));
    assert.ok(lines[2].startsWith("VLC"));
    assert.ok(lines[3].startsWith("VISUAL-OFDM"));
  });
});
