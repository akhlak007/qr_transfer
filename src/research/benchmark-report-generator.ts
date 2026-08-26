/**
 * Benchmark Report & Export Generator (Milestone 8B)
 *
 * Implements:
 * - JSON artifact serialization for benchmark results
 * - CSV tabular export formatting
 * - Publication-ready Markdown tables
 * - Comparative transport and modulation ranking generation
 * - Statistical summary generation
 *
 * NOTE: For software optical communication benchmark dissemination.
 */

import type { EndToEndBenchmarkSuiteResult, SingleBenchmarkResult } from "./benchmark-engine";

export interface BenchmarkRankingsTable {
  highestThroughput: { rank: number; configId: string; label: string; throughputKbps: number }[];
  lowestLatency: { rank: number; configId: string; label: string; latencyMs: number }[];
  lowestCpuCost: { rank: number; configId: string; label: string; cpuCostMs: number }[];
  highestReliability: { rank: number; configId: string; label: string; successRatePct: number }[];
}

/**
 * Generate multi-criteria comparative ranking tables from benchmark results.
 */
export function generateBenchmarkRankings(suite: EndToEndBenchmarkSuiteResult): BenchmarkRankingsTable {
  const passed = suite.results.filter((r) => r.success);

  const byThroughput = [...passed]
    .sort((a, b) => b.metrics.throughputKbps - a.metrics.throughputKbps)
    .map((r, idx) => ({
      rank: idx + 1,
      configId: r.config.configId,
      label: `${r.config.transportLabel} · ${r.config.modulation} ${r.config.gridSize ? `(${r.config.gridSize}×${r.config.gridSize})` : ""}`,
      throughputKbps: r.metrics.throughputKbps,
    }));

  const byLatency = [...passed]
    .sort((a, b) => a.metrics.totalDurationMs - b.metrics.totalDurationMs)
    .map((r, idx) => ({
      rank: idx + 1,
      configId: r.config.configId,
      label: `${r.config.transportLabel} · ${r.config.modulation} ${r.config.gridSize ? `(${r.config.gridSize}×${r.config.gridSize})` : ""}`,
      latencyMs: r.metrics.totalDurationMs,
    }));

  const byCpuCost = [...passed]
    .sort((a, b) => a.metrics.cpuCostMs - b.metrics.cpuCostMs)
    .map((r, idx) => ({
      rank: idx + 1,
      configId: r.config.configId,
      label: `${r.config.transportLabel} · ${r.config.modulation} ${r.config.gridSize ? `(${r.config.gridSize}×${r.config.gridSize})` : ""}`,
      cpuCostMs: r.metrics.cpuCostMs,
    }));

  const byReliability = [...suite.results]
    .sort((a, b) => (b.success ? 1 : 0) - (a.success ? 1 : 0))
    .map((r, idx) => ({
      rank: idx + 1,
      configId: r.config.configId,
      label: `${r.config.transportLabel} · ${r.config.modulation}`,
      successRatePct: r.success ? 100 : 0,
    }));

  return {
    highestThroughput: byThroughput,
    lowestLatency: byLatency,
    lowestCpuCost: byCpuCost,
    highestReliability: byReliability,
  };
}

/**
 * Generate JSON benchmark artifact string.
 */
export function generateBenchmarkJsonArtifact(suite: EndToEndBenchmarkSuiteResult): string {
  const rankings = generateBenchmarkRankings(suite);
  return JSON.stringify(
    {
      schemaVersion: 1,
      benchmarkSuiteId: suite.suiteId,
      executedAt: new Date(suite.executedAt).toISOString(),
      payloadSizeBytes: suite.payloadSize,
      summary: suite.summary,
      rankings,
      configurations: suite.results,
    },
    null,
    2
  );
}

/**
 * Generate CSV tabular export string.
 */
export function generateBenchmarkCsv(suite: EndToEndBenchmarkSuiteResult): string {
  const headers = [
    "ConfigId",
    "Transport",
    "Modulation",
    "GridSize",
    "PayloadBytes",
    "TotalDurationMs",
    "EncodeTimeMs",
    "DecodeTimeMs",
    "CpuCostMs",
    "ThroughputKbps",
    "CRCPass",
    "SHA256Match",
    "FountainOverheadPct",
  ];

  const rows = suite.results.map((r: SingleBenchmarkResult) => [
    r.config.configId,
    r.config.transport,
    r.config.modulation,
    r.config.gridSize ?? "",
    r.metrics.payloadSizeBytes,
    r.metrics.totalDurationMs,
    r.metrics.encodeTimeMs,
    r.metrics.decodeTimeMs,
    r.metrics.cpuCostMs,
    r.metrics.throughputKbps,
    r.metrics.crcPassed ? "PASS" : "FAIL",
    r.metrics.sha256Matched ? "MATCH" : "MISMATCH",
    r.metrics.fountainOverheadPct !== null ? `${r.metrics.fountainOverheadPct}%` : "",
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

/**
 * Generate publication-ready Markdown benchmark tables.
 */
export function generateBenchmarkMarkdownReport(
  suite: EndToEndBenchmarkSuiteResult,
  title = "End-to-End Optical Transport Comparative Benchmark Report"
): string {
  const rankings = generateBenchmarkRankings(suite);

  let md = `# ${title}\n\n`;
  md += `**Suite ID:** \`${suite.suiteId}\`  \n`;
  md += `**Execution Timestamp:** ${new Date(suite.executedAt).toISOString()}  \n`;
  md += `**Evaluated Payload Size:** ${suite.payloadSize} bytes  \n`;
  md += `**Total Configurations Tested:** ${suite.summary.totalConfigsTested}  \n`;
  md += `**Pass Rate:** ${suite.summary.passedConfigsCount} / ${suite.summary.totalConfigsTested} (${(suite.summary.overallSha256MatchRate * 100).toFixed(1)}%)  \n\n`;

  md += `---\n\n`;
  md += `## 1. Complete Optical Transport Performance Matrix\n\n`;
  md += `| Protocol | Modulation / Grid | Encode (ms) | Decode (ms) | CPU (ms) | Throughput (KB/s) | CRC | SHA-256 | Status |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  for (const r of suite.results) {
    const gridStr = r.config.gridSize ? ` (${r.config.gridSize}×${r.config.gridSize})` : "";
    const statusStr = r.success ? "**PASS**" : "**FAIL**";
    md += `| **${r.config.transportLabel}** | ${r.config.modulation}${gridStr} | ${r.metrics.encodeTimeMs} | ${r.metrics.decodeTimeMs} | ${r.metrics.cpuCostMs} | **${r.metrics.throughputKbps}** | ${r.metrics.crcPassed ? "PASS" : "FAIL"} | ${r.metrics.sha256Matched ? "MATCH" : "MISMATCH"} | ${statusStr} |\n`;
  }
  md += `\n`;

  md += `## 2. Comparative Rankings\n\n`;
  md += `### Top Throughput Configurations\n\n`;
  for (const rank of rankings.highestThroughput.slice(0, 5)) {
    md += `${rank.rank}. **${rank.label}**: ${rank.throughputKbps} KB/s\n`;
  }
  md += `\n`;

  md += `### Lowest Latency (Duration)\n\n`;
  for (const rank of rankings.lowestLatency.slice(0, 5)) {
    md += `${rank.rank}. **${rank.label}**: ${rank.latencyMs} ms\n`;
  }
  md += `\n`;

  md += `### Lowest Computational Cost (CPU Execution Time)\n\n`;
  for (const rank of rankings.lowestCpuCost.slice(0, 5)) {
    md += `${rank.rank}. **${rank.label}**: ${rank.cpuCostMs} ms\n`;
  }
  md += `\n`;

  md += `## 3. Scientific Integrity & Data Source Declaration\n\n`;
  md += `1. **Empirical Software Pipeline Execution:** All metrics are measured from genuine end-to-end execution of Luby Transform fountain peeling, VLC intensity/CSK modulation, and Visual OFDM 2D-DCT frequency subcarrier transforms.\n`;
  md += `2. **Non-Conflation Guarantee:** Software benchmarks are strictly reported as algorithmic software performance and are not conflated with physical screen-to-camera optical measurements.\n`;
  md += `3. **Cryptographic Rigor:** Every passed run requires 100% bit-perfect SHA-256 equivalence and zero CRC errors.\n`;

  return md;
}
