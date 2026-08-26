/**
 * Physical Optical Research Report Generator (Milestone 7A)
 *
 * Implements:
 * - Deterministic Markdown research report generation from physical evidence analytics
 * - Structured JSON and CSV analytics summaries
 * - Strict segregation of synthetic benchmarks
 * - Detailed failure classification and modulation comparison
 *
 * NOTE: For physical optical research records only.
 */

import type { TestRun } from "./test-run";
import {
  analyzePhysicalEvidence,
  type PhysicalAnalyticsReport,
} from "./physical-analytics";

export function generatePhysicalMarkdownReport(
  runs: TestRun[],
  title = "Physical Optical Performance & Characterization Report"
): string {
  const analytics: PhysicalAnalyticsReport = analyzePhysicalEvidence(runs);
  const dateStr = new Date(analytics.generatedAt).toISOString();

  let md = `# ${title}\n\n`;
  md += `**Date:** ${dateStr}  \n`;
  md += `**Total Physical Runs Evaluated:** ${analytics.totalPhysicalRuns}  \n`;
  md += `**Verified Bit-Perfect SHA-256 Matches:** ${analytics.totalSuccessfulRuns}  \n`;
  md += `**Overall Success Rate:** ${(analytics.overallSuccessRate * 100).toFixed(1)}%  \n`;
  md += `**Best Verified Distance:** ${analytics.maxVerifiedDistanceCm !== null ? `${analytics.maxVerifiedDistanceCm} cm` : "None"}  \n`;
  md += `**Best Recorded Throughput:** ${analytics.bestThroughputKbps} KB/s  \n\n`;

  md += `---\n\n`;
  md += `## 1. Executive Summary & Verification Policy Compliance\n\n`;
  md += `> [!IMPORTANT]\n`;
  md += `> **Physical verification requires at least 3 independent qualifying runs ($N \\ge 3$) with exact SHA-256 cryptographic match and 0 failures.**\n`;
  md += `> Synthetic channel simulations are strictly prohibited from contributing to physical verification tallies.\n\n`;

  md += `## 2. Modulation Performance Comparison\n\n`;
  md += `| Transport | Modulation | Runs | Success % | CRC % | Median (KB/s) | Max Dist | Stability | Verification Status |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  for (const m of analytics.modulations) {
    const successPct = (m.successRate * 100).toFixed(0);
    const crcPct = (m.crcPassRate * 100).toFixed(0);
    const distStr = m.maxVerifiedDistanceCm !== null ? `${m.maxVerifiedDistanceCm} cm` : "N/A";
    const statusBadge = `**${m.verificationStatus}**`;

    md += `| ${m.transport.toUpperCase()} | ${m.modulation} | ${m.totalRuns} | ${successPct}% | ${crcPct}% | ${m.medianThroughputKbps} | ${distStr} | ${m.stabilityScore}/100 | ${statusBadge} |\n`;
  }
  md += `\n`;

  md += `## 3. Optical Throw Distance Characterization\n\n`;
  md += `| Distance Range | Total Runs | Success % | Avg Throughput (KB/s) |\n`;
  md += `| :--- | :---: | :---: | :---: |\n`;
  for (const d of analytics.distanceBins) {
    const sPct = (d.successRate * 100).toFixed(0);
    md += `| ${d.distanceRangeLabel} | ${d.totalRuns} | ${sPct}% | ${d.avgThroughputKbps} |\n`;
  }
  md += `\n`;

  md += `## 4. Failure Mode & Root-Cause Classification\n\n`;
  md += `| Failure Category | Count | Percentage |\n`;
  md += `| :--- | :---: | :---: |\n`;
  const totFail = Math.max(1, analytics.failureBreakdown.totalFailures);
  const fb = analytics.failureBreakdown;
  md += `| Barker / Pilot Synchronization Timeout | ${fb.syncFailures} | ${((fb.syncFailures / totFail) * 100).toFixed(1)}% |\n`;
  md += `| CRC-16 Checksum Corruption | ${fb.crcFailures} | ${((fb.crcFailures / totFail) * 100).toFixed(1)}% |\n`;
  md += `| SHA-256 Cryptographic Mismatch | ${fb.sha256Mismatches} | ${((fb.sha256Mismatches / totFail) * 100).toFixed(1)}% |\n`;
  md += `| Camera Permission / Stream Unavailable | ${fb.cameraFailures} | ${((fb.cameraFailures / totFail) * 100).toFixed(1)}% |\n`;
  md += `| Exposure Instability / AGC Drift | ${fb.exposureFailures} | ${((fb.exposureFailures / totFail) * 100).toFixed(1)}% |\n`;
  md += `| Low Contrast / Dynamic Range Clipping | ${fb.contrastFailures} | ${((fb.contrastFailures / totFail) * 100).toFixed(1)}% |\n`;
  md += `| Operator Manual Cancellation | ${fb.userCancellations} | ${((fb.userCancellations / totFail) * 100).toFixed(1)}% |\n`;
  md += `| Other / Unclassified | ${fb.otherFailures} | ${((fb.otherFailures / totFail) * 100).toFixed(1)}% |\n`;
  md += `| **Total Failures Recorded** | **${fb.totalFailures}** | **100%** |\n\n`;

  md += `## 5. Environmental Correlation Analysis\n\n`;
  const env = analytics.environmental;
  md += `- **Ambient Lighting:**\n`;
  md += `  - Dark (<50 lux): ${env.ambientLuxBins.darkCount} runs, ${(env.ambientLuxBins.darkSuccessRate * 100).toFixed(0)}% success\n`;
  md += `  - Normal (50 - 400 lux): ${env.ambientLuxBins.normalCount} runs, ${(env.ambientLuxBins.normalSuccessRate * 100).toFixed(0)}% success\n`;
  md += `  - Bright (>400 lux): ${env.ambientLuxBins.brightCount} runs, ${(env.ambientLuxBins.brightSuccessRate * 100).toFixed(0)}% success\n`;
  md += `- **Camera Frame Rate:**\n`;
  md += `  - High (>= 30 FPS): ${env.fpsCorrelation.highFpsCount} runs, ${(env.fpsCorrelation.highFpsSuccessRate * 100).toFixed(0)}% success\n`;
  md += `  - Low (< 30 FPS): ${env.fpsCorrelation.lowFpsCount} runs, ${(env.fpsCorrelation.lowFpsSuccessRate * 100).toFixed(0)}% success\n`;
  md += `- **Exposure Control:**\n`;
  md += `  - Locked Exposure: ${env.exposureLockCorrelation.lockedCount} runs, ${(env.exposureLockCorrelation.lockedSuccessRate * 100).toFixed(0)}% success\n`;
  md += `  - Auto Exposure: ${env.exposureLockCorrelation.autoCount} runs, ${(env.exposureLockCorrelation.autoSuccessRate * 100).toFixed(0)}% success\n\n`;

  md += `## 6. Scientific Integrity Declaration\n\n`;
  md += `- [x] **No Synthetic Data:** All statistics reflect exclusively physical screen-to-camera test runs.\n`;
  md += `- [x] **No Fabricated Evidence:** Unperformed test configurations are explicitly designated as \`EXPERIMENTAL_NOT_TESTED\`.\n`;
  md += `- [x] **Strict Invariants:** Minimum Evidence Policy ($N \\ge 3$) is automatically enforced for all verification status transitions.\n`;

  return md;
}

export function generatePhysicalJsonReport(runs: TestRun[]): string {
  const analytics = analyzePhysicalEvidence(runs);
  return JSON.stringify(analytics, null, 2);
}

export function generatePhysicalCsvReport(runs: TestRun[]): string {
  const analytics = analyzePhysicalEvidence(runs);

  const headers = [
    "Transport",
    "Modulation",
    "TotalRuns",
    "SuccessfulRuns",
    "FailedRuns",
    "SuccessRatePct",
    "CRCPassRatePct",
    "MedianThroughputKbps",
    "MaxThroughputKbps",
    "MaxVerifiedDistanceCm",
    "StabilityScore",
    "VerificationStatus",
  ];

  const rows = analytics.modulations.map((m) =>
    [
      m.transport,
      m.modulation,
      m.totalRuns,
      m.successfulRuns,
      m.failedRuns,
      (m.successRate * 100).toFixed(1),
      (m.crcPassRate * 100).toFixed(1),
      m.medianThroughputKbps,
      m.maxThroughputKbps,
      m.maxVerifiedDistanceCm ?? "",
      m.stabilityScore,
      m.verificationStatus,
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
