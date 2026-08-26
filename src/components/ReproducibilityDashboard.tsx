/**
 * Reproducibility & Research Artifact Dashboard (Milestone 7C)
 *
 * Implements:
 * - Real-time Reproducibility Audit & Score (0 - 100) computation
 * - Experiment manifest inspection with SHA-256 checksums
 * - Multi-format research artifact package export (Markdown, JSON Bundle, CSV)
 * - Strict non-fabrication guarantees: Only evaluates recorded physical evidence
 *
 * NOTE: For physical optical research reproducibility.
 */

import React, { useState, useEffect, useCallback } from "react";
import type { TestRun } from "../research/test-run";
import {
  packageResearchDataset,
  type ResearchDatasetBundle,
} from "../research/dataset-packager";
import {
  validateReproducibility,
  type ReproducibilityValidationReport,
  ReproducibilityStatus,
} from "../research/reproducibility-validator";
import {
  generateMarkdownArtifactPackage,
  generateJsonArtifactPackage,
  generateCsvArtifactPackage,
} from "../research/artifact-generator";

interface ReproducibilityDashboardProps {
  runs: TestRun[];
}

export const ReproducibilityDashboard: React.FC<ReproducibilityDashboardProps> = ({ runs }) => {
  const [bundle, setBundle] = useState<ResearchDatasetBundle | null>(null);
  const [validationReport, setValidationReport] = useState<ReproducibilityValidationReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const packaged = await packageResearchDataset(runs);
      const report = await validateReproducibility(packaged.manifests, runs);
      setBundle(packaged);
      setValidationReport(report);
    } catch (err) {
      console.error("Failed to run reproducibility audit:", err);
    } finally {
      setLoading(false);
    }
  }, [runs]);

  useEffect(() => {
    void runAudit();
  }, [runAudit]);

  const handleDownloadMarkdown = () => {
    if (!bundle || !validationReport) return;
    const md = generateMarkdownArtifactPackage(bundle, validationReport);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reproducibility_artifact_package_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!bundle || !validationReport) return;
    const jsonStr = generateJsonArtifactPackage(bundle, validationReport);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reproducibility_dataset_bundle_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (!bundle) return;
    const csv = generateCsvArtifactPackage(bundle);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `experiment_manifests_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !bundle || !validationReport) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
        Generating reproducibility audit and assembling dataset bundle…
      </div>
    );
  }

  const score = validationReport.reproducibilityScore;
  const isScoreHigh = score >= 85;
  const isScoreModerate = score >= 50 && score < 85;

  return (
    <div className="reproducibility-dashboard-container" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header & Export Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">REPRODUCIBILITY & ARTIFACT PACKAGING</span>
            <span
              className="badge-active"
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                background:
                  validationReport.status === ReproducibilityStatus.VALID
                    ? "#059669"
                    : validationReport.status === ReproducibilityStatus.WARNING
                    ? "#d97706"
                    : "#dc2626",
              }}
            >
              STATUS: {validationReport.status}
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Research Dataset & Reproducibility Audit
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Immutable provenance verification and exportable dataset packaging for peer-reviewed dissemination.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadMarkdown}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            📄 Export Artifact Package (.md)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadJson}
            style={{ fontSize: "12px", padding: "6px 10px" }}
          >
            📦 JSON Bundle
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadCsv}
            style={{ fontSize: "12px", padding: "6px 10px" }}
          >
            📊 CSV Manifest
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Reproducibility Score</div>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: isScoreHigh ? "#4ade80" : isScoreModerate ? "#fbbf24" : "#f87171",
              marginTop: "2px",
            }}
          >
            {score} / 100
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Audit Status: {validationReport.status}
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Metadata Completeness</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#93c5fd", marginTop: "2px" }}>
            {validationReport.metrics.metadataCompletenessPct}%
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Hardware & Environment
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Cryptographic Integrity</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#c7d2fe", marginTop: "2px" }}>
            {validationReport.metrics.cryptographicIntegrityPct}%
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            SHA-256 Manifest Hash
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Physical Runs</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#6ee7b7", marginTop: "2px" }}>
            {bundle.totalPhysicalRuns}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {bundle.totalVerifiedRuns} Verified · {bundle.manifests.length} Manifests
          </div>
        </div>
      </div>

      {/* Checksum & Bundle Provenance Banner */}
      <div style={{ background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#c7d2fe", fontWeight: 600 }}>IMMUTABLE BUNDLE CHECKSUM (SHA-256)</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#e0e7ff", wordBreak: "break-all" }}>
            {bundle.bundleIntegrityChecksum}
          </div>
        </div>
        <div style={{ fontSize: "11px", color: "#a5b4fc", whiteSpace: "nowrap", marginLeft: "12px" }}>
          Bundle ID: {bundle.bundleId}
        </div>
      </div>

      {/* Manifests Registry Table */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
          Physical Experiment Manifests ({bundle.manifests.length})
        </h4>
        {bundle.manifests.length === 0 ? (
          <div style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
            No physical experiment manifests recorded in the current session.
          </div>
        ) : (
          <div className="research-table-wrapper" style={{ maxHeight: "260px", overflowY: "auto" }}>
            <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>Experiment ID</th>
                  <th>Protocol</th>
                  <th>Modulation</th>
                  <th>Distance</th>
                  <th>Ambient Lux</th>
                  <th>Target FPS</th>
                  <th>Manifest SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {bundle.manifests.map((m) => (
                  <tr key={m.experimentId}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{m.experimentId}</td>
                    <td>
                      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {m.transport.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <strong>{m.modulation}</strong> {m.gridSize ? `(${m.gridSize}×${m.gridSize})` : ""}
                    </td>
                    <td>{m.environment.distanceCm} cm</td>
                    <td>{m.environment.ambientLux} lux</td>
                    <td>{m.targetFps} fps</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#a5b4fc" }}>
                      {m.manifestHash ? `${m.manifestHash.slice(0, 16)}…` : "MISSING"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Validation Audit Issues / Findings */}
      {validationReport.issues.length > 0 && (
        <div style={{ background: "rgba(220, 38, 38, 0.08)", border: "1px solid rgba(220, 38, 38, 0.25)", borderRadius: "8px", padding: "12px 16px" }}>
          <h4 style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#fca5a5" }}>
            Reproducibility Audit Findings ({validationReport.issues.length})
          </h4>
          <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {validationReport.issues.map((issue, idx) => (
              <div key={idx} style={{ color: issue.severity === "error" ? "#f87171" : "#fcd34d" }}>
                {issue.severity === "error" ? "❌" : "⚠️"} <strong>[{issue.code}]</strong> {issue.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
