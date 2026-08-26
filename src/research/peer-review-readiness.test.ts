import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePeerReviewReadiness,
  PeerReviewStatus,
} from "./peer-review-readiness";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";
import type { ExperimentManifest } from "./experiment-manifest";
import type { ReproducibilityValidationReport } from "./reproducibility-validator";

describe("Peer-Review Readiness Audit Engine Unit Tests (Milestone 7D)", () => {
  const createMockQrRun = (id: string): TestRun => ({
    schemaVersion: 1,
    runId: id,
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.QR,
    sender: { platform: "desktop", deviceName: "Mac", osVersion: "14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "17", browserName: "Safari", browserVersion: "17" },
    fileName: "qr.bin",
    fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    integrityStatus: "verified",
    metrics: { fileSize: 1000, elapsedMs: 100, averageThroughputBytesPerSecond: 10000, frameHitRate: 1.0, errorRate: 0, recoveryOverhead: null, cameraFps: 30, screenFps: 60, signalQuality: 1.0 },
    distanceCm: 25,
    environment: "normal",
    notes: "Controlled QR baseline",
    createdAt: 1000,
    completedAt: 1100,
  });

  const validReproReport: ReproducibilityValidationReport = {
    status: "VALID",
    reproducibilityScore: 100,
    evaluatedManifestsCount: 3,
    evaluatedPhysicalRunsCount: 3,
    issues: [],
    metrics: {
      metadataCompletenessPct: 100,
      cryptographicIntegrityPct: 100,
      evidenceChainValidPct: 100,
    },
    validatedAt: 1000,
  };

  test("evaluates empty physical dataset as NOT_READY", () => {
    const report = evaluatePeerReviewReadiness([], [], {
      ...validReproReport,
      reproducibilityScore: 0,
      evaluatedManifestsCount: 0,
      evaluatedPhysicalRunsCount: 0,
    });

    assert.equal(report.overallStatus, PeerReviewStatus.NOT_READY);
    assert.equal(report.readinessScore < 50, true);
    assert.ok(report.recommendations.length > 0);
  });

  test("evaluates 3 verified QR runs with complete manifests as READY", () => {
    const runs = [createMockQrRun("qr-1"), createMockQrRun("qr-2"), createMockQrRun("qr-3")];
    const manifests: ExperimentManifest[] = runs.map((r) => ({
      schemaVersion: 1,
      experimentId: `exp-${r.runId}`,
      createdAt: 1000,
      transport: TransportId.QR,
      modulation: "QR",
      transmitter: { deviceModel: "Mac", resolution: "1080p", operatingSystem: "macOS", browser: "Chrome" },
      receiver: { deviceModel: "iPhone", resolution: "720p", operatingSystem: "iOS", browser: "Safari" },
      environment: { distanceCm: 25, ambientLux: 250, exposureMode: "locked" },
      targetFps: 30,
      softwareVersion: "1.0.0",
      expectedPayloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      manifestHash: "hash",
    }));

    const report = evaluatePeerReviewReadiness(runs, manifests, validReproReport);

    assert.equal(report.overallStatus, PeerReviewStatus.READY);
    assert.ok(report.readinessScore >= 85);
    assert.equal(report.checklist.every((c) => c.passed), true);
  });
});
