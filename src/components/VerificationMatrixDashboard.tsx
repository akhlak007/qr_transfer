/**
 * Software Optical Verification Matrix Dashboard (Milestone 8A)
 *
 * Implements:
 * - Transport × Modulation × Spatial Grid Comprehensive Software Verification Matrix
 * - Real-time tracking against Software Verification Policy:
 *   - SOFTWARE_VERIFIED: 100% pass rate, bit-perfect SHA-256, CRC success, Confidence >= HIGH
 *   - SOFTWARE_VALIDATED: Simulation benchmarks pass with confidence >= MODERATE
 *   - EXPERIMENTAL: Untested or sample size < 3
 *   - FAILED: Corrupted transmission or unhandled errors
 * - Statistical confidence classification (LOW, MODERATE, HIGH, VERY_HIGH)
 *
 * NOTE: For software optical research analytics.
 */

import React, { useMemo, useState } from "react";
import { TransportId } from "../core/transport";
import type { TestRun } from "../research/test-run";
import {
  evaluateSoftwareVerificationMatrix,
  SoftwareVerificationStatus,
  type SoftwareVerificationMatrixReport,
  type ProtocolSoftwareVerification,
} from "../research/software-verification";

interface VerificationMatrixDashboardProps {
  runs: TestRun[];
}

export const VerificationMatrixDashboard: React.FC<VerificationMatrixDashboardProps> = ({ runs }) => {
  const [filterTransport, setFilterTransport] = useState<"all" | TransportId>("all");

  const matrixReport: SoftwareVerificationMatrixReport = useMemo(() => {
    return evaluateSoftwareVerificationMatrix(runs);
  }, [runs]);

  const filteredProtocols = useMemo(() => {
    if (filterTransport === "all") return matrixReport.protocols;
    return matrixReport.protocols.filter((p) => p.protocol === filterTransport);
  }, [matrixReport.protocols, filterTransport]);

  const getStatusBadge = (status: SoftwareVerificationStatus) => {
    let bg = "#6b7280";
    if (status === SoftwareVerificationStatus.SOFTWARE_END_TO_END_VERIFIED) bg = "#059669";
    else if (status === SoftwareVerificationStatus.SOFTWARE_UNIT_VERIFIED) bg = "#2563eb";
    else if (status === SoftwareVerificationStatus.FAILED) bg = "#dc2626";

    return (
      <span
        className="badge-active"
        style={{
          fontSize: "10px",
          padding: "2px 8px",
          background: bg,
          fontWeight: 700,
        }}
      >
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  const getConfidenceBadge = (level: string) => {
    let bg = "#6b7280";
    if (level === "VERY_HIGH") bg = "#059669";
    else if (level === "HIGH") bg = "#10b981";
    else if (level === "MODERATE") bg = "#d97706";

    return (
      <span
        className="badge-active"
        style={{
          fontSize: "9px",
          padding: "1px 6px",
          background: bg,
        }}
      >
        {level}
      </span>
    );
  };

  return (
    <div className="verification-matrix-container" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header & Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">SOFTWARE OPTICAL VERIFICATION</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6" }}>
              PHASE 8A FRAMEWORK
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Transport & Modulation Software Verification Matrix
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Empirical software simulation benchmarks with bit-perfect SHA-256 integrity, CRC validation, and statistical confidence scoring.
          </p>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { id: "all", label: "All Protocols" },
            { id: TransportId.QR, label: "QR" },
            { id: TransportId.VLC, label: "VLC" },
            { id: TransportId.VisualOFDM, label: "Visual OFDM" },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={`btn ${filterTransport === btn.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterTransport(btn.id as any)}
              style={{ fontSize: "11px", padding: "4px 8px" }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Software Verified</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#6ee7b7", marginTop: "2px" }}>
            {matrixReport.verifiedProtocolsCount} / {matrixReport.totalProtocolsEvaluated}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {matrixReport.overallSoftwareReadinessPct}% Verification Readiness
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Software Validated</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#93c5fd", marginTop: "2px" }}>
            {matrixReport.validatedProtocolsCount}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Moderate Statistical Confidence
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Experimental / Untested</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#fef08a", marginTop: "2px" }}>
            {matrixReport.experimentalProtocolsCount}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Sample Size &lt; 3 Runs
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Verification Criteria</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#cbd5e1", marginTop: "4px" }}>
            100% SHA & CRC Pass
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Statistical Confidence ≥ HIGH
          </div>
        </div>
      </div>

      {/* 14-Configuration Software Verification Table */}
      <div className="research-table-wrapper" style={{ maxHeight: "380px", overflowY: "auto" }}>
        <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Modulation / Grid</th>
              <th>Benchmark Runs</th>
              <th>CRC Pass</th>
              <th>SHA-256 Match</th>
              <th>Median KB/s</th>
              <th>Confidence</th>
              <th>Verification Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredProtocols.map((p: ProtocolSoftwareVerification) => (
              <tr key={`${p.protocol}_${p.modulation}_${p.gridSize || ""}`}>
                <td>
                  <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                    {p.protocolLabel}
                  </span>
                </td>
                <td>
                  <strong>{p.modulation}</strong> {p.gridSize ? `(${p.gridSize}×${p.gridSize})` : ""}
                </td>
                <td>
                  {p.totalBenchmarkRuns} ({p.successfulRunsCount} ✓)
                  {p.hasPhysicalEvidence && (
                    <span style={{ marginLeft: "4px", fontSize: "10px", color: "#6ee7b7" }}>[HW]</span>
                  )}
                </td>
                <td>{(p.crcPassRate * 100).toFixed(0)}%</td>
                <td>{(p.sha256MatchRate * 100).toFixed(0)}%</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>
                  {p.medianThroughputKbps > 0 ? `${p.medianThroughputKbps} KB/s` : "-"}
                </td>
                <td>{getConfidenceBadge(p.confidence.level)}</td>
                <td>{getStatusBadge(p.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
