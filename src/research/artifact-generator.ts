/**
 * Research Artifact Package Generator (Milestone 7C)
 *
 * Implements:
 * - Publication and Archival Artifact Package generator in Markdown, JSON, and CSV
 * - Comprehensive compilation of manifests, physical evidence, reproducibility audit, and verification matrices
 * - Anti-fabrication guarantees: Derived deterministically from recorded physical records
 *
 * NOTE: For archival optical research dissemination.
 */

import { TransportId } from "../core/transport";
import type { ResearchDatasetBundle } from "./dataset-packager";
import type { ReproducibilityValidationReport } from "./reproducibility-validator";

export interface ArtifactGeneratorOptions {
  title?: string;
  institution?: string;
  leadResearcher?: string;
}

/**
 * Generate a comprehensive Markdown research artifact package.
 */
export function generateMarkdownArtifactPackage(
  bundle: ResearchDatasetBundle,
  validationReport: ReproducibilityValidationReport,
  options: ArtifactGeneratorOptions = {}
): string {
  const title = options.title ?? "Optical Communication Research Artifact & Dataset Package";
  const institution = options.institution ?? "Laboratory for Advanced Optical & Fountain Protocols";
  const leadResearcher = options.leadResearcher ?? "Principal Optical Investigator";

  let md = `# ${title}\n\n`;
  md += `**Institution:** ${institution}  \n`;
  md += `**Lead Investigator:** ${leadResearcher}  \n`;
  md += `**Bundle ID:** \`${bundle.bundleId}\`  \n`;
  md += `**Exported At:** ${bundle.exportedAt}  \n`;
  md += `**Bundle Integrity Checksum (SHA-256):** \`${bundle.bundleIntegrityChecksum}\`  \n`;
  md += `**Software Version:** \`${bundle.softwareVersion}\`  \n\n`;

  md += `---\n\n`;
  md += `## 1. Executive Summary & Provenance\n\n`;
  md += `- **Total Physical Screen-to-Camera Runs:** ${bundle.totalPhysicalRuns}\n`;
  md += `- **Verified Bit-Perfect SHA-256 Runs:** ${bundle.totalVerifiedRuns}\n`;
  md += `- **Generated Experiment Manifests:** ${bundle.manifests.length}\n`;
  md += `- **Reproducibility Audit Score:** **${validationReport.reproducibilityScore} / 100** (\`${validationReport.status}\`)\n\n`;

  md += `## 2. Reproducibility Validation Audit\n\n`;
  md += `| Audit Dimension | Compliance Metric | Status |\n`;
  md += `| :--- | :---: | :---: |\n`;
  md += `| Hardware & Environment Metadata | ${validationReport.metrics.metadataCompletenessPct}% | ${validationReport.metrics.metadataCompletenessPct === 100 ? "PASS" : "WARN"} |\n`;
  md += `| Cryptographic Hash Integrity | ${validationReport.metrics.cryptographicIntegrityPct}% | ${validationReport.metrics.cryptographicIntegrityPct === 100 ? "PASS" : "WARN"} |\n`;
  md += `| Evidence Chain Completeness | ${validationReport.metrics.evidenceChainValidPct}% | ${validationReport.metrics.evidenceChainValidPct === 100 ? "PASS" : "WARN"} |\n\n`;

  if (validationReport.issues.length > 0) {
    md += `### Audit Findings (${validationReport.issues.length})\n\n`;
    for (const issue of validationReport.issues) {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      md += `- ${icon} **[${issue.code}]** ${issue.message}\n`;
    }
    md += `\n`;
  }

  md += `## 3. Physical Benchmark Comparative Summary\n\n`;
  md += `| Protocol | Total Physical Runs | Success Rate | Median Throughput | 95% Confidence Interval | Max Distance | Status |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

  const transports = [TransportId.QR, TransportId.VLC, TransportId.VisualOFDM];
  for (const t of transports) {
    const prof = bundle.benchmarkComparison.profiles[t];
    const sPct = (prof.successRate * 100).toFixed(0);
    const medKbps = prof.throughputKbps.median > 0 ? `${prof.throughputKbps.median} Kbps` : "N/A";
    const ciStr = prof.throughputKbps.confidenceInterval95
      ? `[${prof.throughputKbps.confidenceInterval95.lower}, ${prof.throughputKbps.confidenceInterval95.upper}]`
      : "N/A";
    const maxDist = prof.maxDistanceCm !== null ? `${prof.maxDistanceCm} cm` : "N/A";

    md += `| **${t.toUpperCase()}** | ${prof.totalPhysicalRuns} | ${sPct}% | ${medKbps} | ${ciStr} | ${maxDist} | **${prof.verificationStatus}** |\n`;
  }
  md += `\n`;

  md += `## 4. Experiment Manifest Registry\n\n`;
  if (bundle.manifests.length === 0) {
    md += `*No physical experiment manifests recorded in this dataset bundle.*\n\n`;
  } else {
    md += `| Experiment ID | Protocol | Modulation | Distance | Ambient Lux | Target FPS | Manifest SHA-256 |\n`;
    md += `| :--- | :--- | :--- | :---: | :---: | :---: | :--- |\n`;
    for (const m of bundle.manifests) {
      const hashSnippet = m.manifestHash ? `${m.manifestHash.slice(0, 10)}…` : "N/A";
      md += `| \`${m.experimentId}\` | ${m.transport.toUpperCase()} | ${m.modulation} | ${m.environment.distanceCm} cm | ${m.environment.ambientLux} lux | ${m.targetFps} | \`${hashSnippet}\` |\n`;
    }
    md += `\n`;
  }

  md += `## 5. Scientific Integrity & Non-Fabrication Declaration\n\n`;
  md += `1. **Zero Synthetic Promotion:** All benchmarks, tables, manifests, and metrics in this bundle are derived solely from real screen-to-camera optical transmissions.\n`;
  md += `2. **Cryptographic Validation:** Verification status transitions strictly require $\\ge 3$ physical runs with matching SHA-256 digests and 0 failures.\n`;
  md += `3. **Immutable Provenance:** Bundle integrity is guaranteed by the top-level SHA-256 checksum \`${bundle.bundleIntegrityChecksum}\`.\n`;

  return md;
}

/**
 * Generate structured JSON package containing dataset bundle and validation report.
 */
export function generateJsonArtifactPackage(
  bundle: ResearchDatasetBundle,
  validationReport: ReproducibilityValidationReport
): string {
  return JSON.stringify(
    {
      datasetBundle: bundle,
      reproducibilityReport: validationReport,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Generate CSV manifest summary for research spreadsheets.
 */
export function generateCsvArtifactPackage(bundle: ResearchDatasetBundle): string {
  const headers = [
    "ExperimentId",
    "Transport",
    "Modulation",
    "GridSize",
    "TransmitterModel",
    "ReceiverModel",
    "DistanceCm",
    "AmbientLux",
    "ExposureMode",
    "TargetFps",
    "ExpectedPayloadSha256",
    "ManifestHash",
  ];

  const rows = bundle.manifests.map((m) =>
    [
      m.experimentId,
      m.transport,
      m.modulation,
      m.gridSize ?? "",
      `"${m.transmitter.deviceModel}"`,
      `"${m.receiver.deviceModel}"`,
      m.environment.distanceCm,
      m.environment.ambientLux,
      m.environment.exposureMode,
      m.targetFps,
      m.expectedPayloadSha256,
      m.manifestHash ?? "",
    ].join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
