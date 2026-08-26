/**
 * Physical Campaign Export Engine (Milestone 7F)
 *
 * Implements:
 * - Deterministic JSON, CSV, and Markdown export of physical optical campaign records
 * - Cryptographic campaign-wide SHA-256 checksum calculation
 * - Strict exclusion of synthetic/simulated channel benchmark runs
 *
 * NOTE: For physical optical research campaign dissemination.
 */

import { sha256Hex } from "../core/integrity";
import type { TestRun } from "./test-run";
import type { CampaignSnapshot } from "./physical-campaign";
import { computeGlobalCampaignStatistics, type GlobalCampaignStatistics } from "./campaign-statistics";

export interface CampaignExportPackage {
  schemaVersion: number;
  campaignId: string;
  exportedAt: string;
  campaignIntegrityChecksum: string;
  snapshot: CampaignSnapshot;
  statistics: GlobalCampaignStatistics;
  physicalRuns: TestRun[];
}

/**
 * Generate a complete, cryptographically verified JSON export package of the campaign.
 */
export async function exportCampaignToJson(
  snapshot: CampaignSnapshot,
  runs: TestRun[]
): Promise<string> {
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");
  const statistics = computeGlobalCampaignStatistics(physicalRuns);
  const exportedAt = new Date().toISOString();

  const rawToHash = JSON.stringify({
    campaignId: snapshot.campaignId,
    exportedAt,
    snapshot,
    statistics,
    physicalRuns,
  });

  const checksum = await sha256Hex(new TextEncoder().encode(rawToHash));

  const pkg: CampaignExportPackage = {
    schemaVersion: 1,
    campaignId: snapshot.campaignId,
    exportedAt,
    campaignIntegrityChecksum: checksum,
    snapshot,
    statistics,
    physicalRuns,
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * Generate a CSV summary table of all campaign targets and progress.
 */
export function exportCampaignToCsv(snapshot: CampaignSnapshot): string {
  const headers = [
    "TargetId",
    "Protocol",
    "Modulation",
    "GridSize",
    "RequiredRuns",
    "QualifyingRuns",
    "FailedRuns",
    "RemainingRuns",
    "Status",
    "IsComplete",
  ];

  const rows = snapshot.targets.map((t) =>
    [
      t.targetId,
      t.protocol,
      t.modulation,
      t.gridSize ?? "",
      t.requiredRuns,
      t.qualifyingRuns,
      t.failedRuns,
      t.remainingRuns,
      t.status,
      t.isComplete ? "YES" : "NO",
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Generate a comprehensive Markdown report of the campaign status and evidence.
 */
export async function exportCampaignToMarkdown(
  snapshot: CampaignSnapshot,
  runs: TestRun[],
  title = "Physical Optical Campaign Progress & Evidence Report"
): Promise<string> {
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");
  const stats = computeGlobalCampaignStatistics(physicalRuns);
  const jsonStr = await exportCampaignToJson(snapshot, physicalRuns);
  const parsed = JSON.parse(jsonStr);

  let md = `# ${title}\n\n`;
  md += `**Campaign ID:** \`${snapshot.campaignId}\`  \n`;
  md += `**State:** \`${snapshot.state}\`  \n`;
  md += `**Campaign Integrity SHA-256:** \`${parsed.campaignIntegrityChecksum}\`  \n`;
  md += `**Total Required Experimental Runs:** ${snapshot.totalRequiredRuns} runs  \n`;
  md += `**Completed Qualifying Runs:** ${snapshot.totalCompletedQualifyingRuns} / ${snapshot.totalRequiredRuns} (${snapshot.progressPercentage}%)  \n`;
  md += `**Recorded Failures (Retained):** ${snapshot.totalRecordedFailures}  \n\n`;

  md += `---\n\n`;
  md += `## 1. Target Acquisition Matrix Progress\n\n`;
  md += `| Protocol | Modulation / Grid | Required | Qualifying | Failed | Remaining | Policy Status |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :---: | :--- |\n`;

  for (const t of snapshot.targets) {
    const gridStr = t.gridSize ? ` (${t.gridSize}×${t.gridSize})` : "";
    md += `| **${t.protocol.toUpperCase()}** | ${t.modulation}${gridStr} | ${t.requiredRuns} | ${t.qualifyingRuns} | ${t.failedRuns} | ${t.remainingRuns} | **${t.status}** |\n`;
  }
  md += `\n`;

  md += `## 2. Global Empirical Campaign Statistics\n\n`;
  md += `- **Total Physical Runs Evaluated:** ${stats.totalPhysicalRuns}\n`;
  md += `- **Overall Success Rate:** ${(stats.successRate * 100).toFixed(1)}%\n`;
  md += `- **Median Optical Throughput:** ${stats.medianThroughputKbps} KB/s\n`;
  md += `- **Max Optical Throughput:** ${stats.maxThroughputKbps} KB/s\n`;
  md += `- **Median Throw Distance:** ${stats.medianDistanceCm !== null ? `${stats.medianDistanceCm} cm` : "N/A"}\n`;
  md += `- **Mean Camera Sensor Rate:** ${stats.meanCameraFps !== null ? `${stats.meanCameraFps} fps` : "N/A"}\n`;
  md += `- **Global Stability Score:** ${stats.stabilityScore} / 100\n\n`;

  md += `## 3. Scientific Integrity & Non-Fabrication Declaration\n\n`;
  md += `1. **Physical Exclusivity:** All reported data points reflect exclusively live screen-to-camera optical runs captured via \`PhysicalCameraService\`.\n`;
  md += `2. **Non-Promotion Invariant:** Synthetic channel tests and simulations are strictly segregated from this report.\n`;
  md += `3. **Cryptographic Validation:** Minimum evidence threshold requires $\\ge 3$ independent bit-perfect SHA-256 matches and 0 failures for verification.\n`;

  return md;
}

/**
 * Generate a standalone physical evidence manifest JSON.
 */
export async function exportPhysicalEvidenceManifest(
  snapshot: CampaignSnapshot,
  runs: TestRun[]
): Promise<string> {
  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");
  const stats = computeGlobalCampaignStatistics(physicalRuns);
  const jsonStr = await exportCampaignToJson(snapshot, physicalRuns);
  const parsed = JSON.parse(jsonStr);

  const manifest = {
    schemaVersion: 1,
    campaignId: snapshot.campaignId,
    exportedAt: parsed.exportedAt,
    campaignChecksumSha256: parsed.campaignIntegrityChecksum,
    totalPhysicalRecordCount: physicalRuns.length,
    qualifyingCount: snapshot.totalCompletedQualifyingRuns,
    failureCount: snapshot.totalRecordedFailures,
    targetCoverage: {
      totalTargets: snapshot.targets.length,
      verifiedTargets: snapshot.targets.filter((t) => t.status === "PHYSICALLY_VERIFIED").length,
      inProgressTargets: snapshot.targets.filter((t) => t.status === "INSUFFICIENT_PHYSICAL_EVIDENCE").length,
      untestedTargets: snapshot.targets.filter((t) => t.status === "EXPERIMENTAL_NOT_TESTED").length,
    },
    sha256IntegrityStatus: stats.sha256MatchRate === 1.0 ? "ALL_MATCHED" : "PARTIAL_OR_EMPTY",
  };

  return JSON.stringify(manifest, null, 2);
}
