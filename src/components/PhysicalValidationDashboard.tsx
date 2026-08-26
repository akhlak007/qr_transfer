/**
 * Physical Validation & Performance Characterization Dashboard (Milestone 7A)
 *
 * Interactive Researcher Analytics Interface:
 * - Mathematical characterization of real physical optical test runs
 * - Modulation performance comparison with stability scores
 * - Distance-throughput curves and environmental correlation
 * - Failure root-cause classification breakdown
 * - One-click export of research-grade Markdown, JSON, and CSV reports
 *
 * NOTE: For physical optical research records only. Excludes synthetic benchmarks.
 */

import React, { useMemo, useCallback } from "react";
import type { TestRun } from "../research/test-run";
import {
  analyzePhysicalEvidence,
  type PhysicalAnalyticsReport,
} from "../research/physical-analytics";
import {
  generatePhysicalMarkdownReport,
  generatePhysicalJsonReport,
  generatePhysicalCsvReport,
} from "../research/physical-report-generator";
import { AuthoritativePhysicalValidationPanel } from "./AuthoritativePhysicalValidationPanel";

interface PhysicalValidationDashboardProps {
  runs: TestRun[];
}

export const PhysicalValidationDashboard: React.FC<PhysicalValidationDashboardProps> = ({ runs }) => {
  const analytics: PhysicalAnalyticsReport = useMemo(() => analyzePhysicalEvidence(runs), [runs]);

  const handleDownloadMarkdown = useCallback(() => {
    const md = generatePhysicalMarkdownReport(runs);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_optical_characterization_report_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runs]);

  const handleDownloadJson = useCallback(() => {
    const json = generatePhysicalJsonReport(runs);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_optical_analytics_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runs]);

  const handleDownloadCsv = useCallback(() => {
    const csv = generatePhysicalCsvReport(runs);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_optical_modulations_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runs]);

  return (
    <div className="physical-validation-dashboard" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Authoritative Phase 11 Physical Optical Validation HUD */}
      <AuthoritativePhysicalValidationPanel />

      {/* Header & Export Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">EMPIRICAL PERFORMANCE CHARACTERIZATION</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#059669" }}>
              PHASE 7A ANALYTICS
            </span>
          </div>

          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Physical Optical Performance Analytics
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Mathematical evaluation of recorded screen-to-camera experiments. Strictly separates physical hardware evidence from simulations.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadMarkdown}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            📄 Export Markdown Report
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadJson}
            style={{ fontSize: "12px", padding: "6px 10px" }}
          >
            JSON
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadCsv}
            style={{ fontSize: "12px", padding: "6px 10px" }}
          >
            CSV
          </button>
        </div>
      </div>

      {/* Global Summary Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        <div className="research-metric-card" style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Physical Runs</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#93c5fd", marginTop: "2px" }}>
            {analytics.totalPhysicalRuns}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {analytics.totalSuccessfulRuns} Verified · {analytics.totalFailedRuns} Failed
          </div>
        </div>

        <div className="research-metric-card" style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>SHA-256 Match Rate</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: analytics.overallSha256MatchRate > 0.8 ? "#4ade80" : "#fbbf24", marginTop: "2px" }}>
            {(analytics.overallSha256MatchRate * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            CRC Pass: {(analytics.overallCrcPassRate * 100).toFixed(1)}%
          </div>
        </div>

        <div className="research-metric-card" style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Median Throughput</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#c7d2fe", marginTop: "2px" }}>
            {analytics.medianThroughputKbps} KB/s
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Best: {analytics.bestThroughputKbps} KB/s
          </div>
        </div>

        <div className="research-metric-card" style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Max Verified Distance</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#6ee7b7", marginTop: "2px" }}>
            {analytics.maxVerifiedDistanceCm !== null ? `${analytics.maxVerifiedDistanceCm} cm` : "N/A"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Camera FPS: {analytics.avgCameraFps !== null ? `${analytics.avgCameraFps} fps` : "N/A"}
          </div>
        </div>
      </div>

      {/* Modulation Performance Comparison Table */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
          Modulation Performance & Stability Comparison
        </h4>
        <div className="research-table-wrapper">
          <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Transport</th>
                <th>Modulation</th>
                <th>Runs</th>
                <th>Success %</th>
                <th>CRC %</th>
                <th>Median Throughput</th>
                <th>Max Distance</th>
                <th>Stability Score</th>
                <th>Evidence Policy Status</th>
              </tr>
            </thead>
            <tbody>
              {analytics.modulations.map((m) => {
                let badgeClass = "tag-untested";
                if (m.verificationStatus === "PHYSICALLY_VERIFIED") badgeClass = "tag-verified";
                else if (m.verificationStatus === "PHYSICAL_FAILURE_RECORDED") badgeClass = "tag-failed";
                else if (m.verificationStatus === "INSUFFICIENT_PHYSICAL_EVIDENCE") badgeClass = "tag-insufficient";

                return (
                  <tr key={`${m.transport}_${m.modulation}`}>
                    <td>
                      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {m.transport.toUpperCase()}
                      </span>
                    </td>
                    <td><strong>{m.modulation}</strong></td>
                    <td>{m.totalRuns} ({m.successfulRuns} ✓)</td>
                    <td>{(m.successRate * 100).toFixed(0)}%</td>
                    <td>{(m.crcPassRate * 100).toFixed(0)}%</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {m.medianThroughputKbps > 0 ? `${m.medianThroughputKbps} KB/s` : "-"}
                    </td>
                    <td>{m.maxVerifiedDistanceCm !== null ? `${m.maxVerifiedDistanceCm} cm` : "-"}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                          <div style={{ width: `${m.stabilityScore}%`, height: "100%", background: m.stabilityScore > 75 ? "#4ade80" : m.stabilityScore > 40 ? "#fbbf24" : "#f87171" }} />
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>{m.stabilityScore}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`tag ${badgeClass}`}>{m.verificationStatus}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: Distance Characterization & Failure Root-Cause Analysis */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Left: Distance Characterization */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#93c5fd" }}>
            Optical Throw Distance Characterization
          </h4>
          <table style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                <th>Distance Range</th>
                <th>Runs</th>
                <th>Success Rate</th>
                <th>Avg Throughput</th>
              </tr>
            </thead>
            <tbody>
              {analytics.distanceBins.map((bin) => (
                <tr key={bin.distanceRangeLabel} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "6px 0" }}>{bin.distanceRangeLabel}</td>
                  <td>{bin.totalRuns}</td>
                  <td>{(bin.successRate * 100).toFixed(0)}%</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>
                    {bin.avgThroughputKbps > 0 ? `${bin.avgThroughputKbps} KB/s` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Failure Root-Cause Analysis */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#fca5a5" }}>
            Failure Mode & Root-Cause Classification ({analytics.failureBreakdown.totalFailures})
          </h4>
          {analytics.failureBreakdown.totalFailures === 0 ? (
            <div style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
              Zero physical transmission failures recorded in the research ledger.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
              <div>Barker/Pilot Sync: <strong>{analytics.failureBreakdown.syncFailures}</strong></div>
              <div>CRC Checksum: <strong>{analytics.failureBreakdown.crcFailures}</strong></div>
              <div>SHA-256 Discrepancy: <strong>{analytics.failureBreakdown.sha256Mismatches}</strong></div>
              <div>Camera / Permission: <strong>{analytics.failureBreakdown.cameraFailures}</strong></div>
              <div>Exposure Instability: <strong>{analytics.failureBreakdown.exposureFailures}</strong></div>
              <div>Low Contrast: <strong>{analytics.failureBreakdown.contrastFailures}</strong></div>
              <div>Operator Abort: <strong>{analytics.failureBreakdown.userCancellations}</strong></div>
              <div>Other / Unclassified: <strong>{analytics.failureBreakdown.otherFailures}</strong></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
