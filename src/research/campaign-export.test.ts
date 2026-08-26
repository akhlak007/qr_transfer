import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  exportCampaignToJson,
  exportCampaignToCsv,
  exportCampaignToMarkdown,
} from "./campaign-export";
import { computeCampaignProgress, CampaignState } from "./physical-campaign";
import { TransportId } from "../core/transport";
import type { TestRun } from "./test-run";

describe("Physical Campaign Export Engine Unit Tests (Milestone 7F)", () => {
  const sampleRun: TestRun = {
    schemaVersion: 1,
    runId: "run-export-1",
    status: "complete",
    evidenceKind: "physical",
    transport: TransportId.VLC,
    sender: { platform: "desktop", deviceName: "Mac", osVersion: "14", browserName: "Chrome", browserVersion: "124" },
    receiver: { platform: "iphone", deviceName: "iPhone", osVersion: "17", browserName: "Safari", browserVersion: "17" },
    fileName: "physical_vlc_ook_51200B.bin",
    fileHashHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    integrityStatus: "verified",
    metrics: { fileSize: 51200, elapsedMs: 2000, averageThroughputBytesPerSecond: 25600, frameHitRate: 1.0, errorRate: 0.0, recoveryOverhead: null, cameraFps: 30.0, screenFps: 60.0, signalQuality: 0.95 },
    distanceCm: 25,
    environment: "normal",
    notes: "Controlled passed test",
    createdAt: 1700000000000,
    completedAt: 1700000002000,
  };

  test("exports JSON package with deterministic campaign integrity checksum", async () => {
    const snapshot = computeCampaignProgress("camp-1", CampaignState.RUNNING, 1, 1, [sampleRun]);
    const jsonStr = await exportCampaignToJson(snapshot, [sampleRun]);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.campaignId, "camp-1");
    assert.equal(parsed.campaignIntegrityChecksum.length, 64);
    assert.equal(parsed.physicalRuns.length, 1);
    assert.ok(parsed.statistics !== undefined);
  });

  test("exports CSV summary with all 14 target rows", () => {
    const snapshot = computeCampaignProgress("camp-1", CampaignState.IDLE, 0, 1, []);
    const csv = exportCampaignToCsv(snapshot);
    const lines = csv.trim().split("\n");

    assert.equal(lines.length, 15); // Header + 14 targets
    assert.ok(lines[0].startsWith("TargetId,Protocol"));
  });

  test("exports comprehensive Markdown report containing summary and integrity declaration", async () => {
    const snapshot = computeCampaignProgress("camp-1", CampaignState.RUNNING, 1, 1, [sampleRun]);
    const md = await exportCampaignToMarkdown(snapshot, [sampleRun]);

    assert.ok(md.includes("# Physical Optical Campaign Progress & Evidence Report"));
    assert.ok(md.includes("Campaign Integrity SHA-256:"));
    assert.ok(md.includes("Target Acquisition Matrix Progress"));
    assert.ok(md.includes("Scientific Integrity & Non-Fabrication Declaration"));
  });
});
