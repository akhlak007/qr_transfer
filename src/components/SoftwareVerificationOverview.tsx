/**
 * Software Optical Verification Overview Dashboard (Milestone 8A)
 *
 * Implements:
 * - Comprehensive overview of software-verified optical communication protocols
 * - Confidence score evaluation across simulation and empirical benchmarks
 * - Multi-protocol benchmark coverage metrics (VLC 48-scenario & OFDM 48-scenario stress matrices)
 * - Strict non-fabrication guarantee: Clearly distinguishes software vs physical status
 *
 * NOTE: For software optical research verification.
 */

import React, { useMemo, useRef, useState } from "react";
import type { TestRun } from "../research/test-run";
import {
  evaluateSoftwareVerificationMatrix,
  SoftwareVerificationStatus,
  type SoftwareVerificationMatrixReport,
  type ProtocolSoftwareVerification,
} from "../research/software-verification";
import { EndToEndSoftwareVerification } from "./EndToEndSoftwareVerification";
import { runPhase8eVerificationMatrix, type SoftwareOpticalIntegrationResult } from "../research/software-optical-integration";
import { VerificationEvidenceController } from "../research/verification-evidence-controller";

interface SoftwareVerificationOverviewProps {
  runs: TestRun[];
}

export const SoftwareVerificationOverview: React.FC<SoftwareVerificationOverviewProps> = ({ runs }) => {
  const evidenceController = useRef(new VerificationEvidenceController());
  const [integrationResults, setIntegrationResults] = useState<readonly SoftwareOpticalIntegrationResult[]>([]);
  const [integrationRunning, setIntegrationRunning] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const matrixReport: SoftwareVerificationMatrixReport = useMemo(() => {
    return evaluateSoftwareVerificationMatrix(runs, 100, [...integrationResults]);
  }, [runs, integrationResults]);

  const executeIntegration = async () => {
    setIntegrationRunning(true);
    setIntegrationError(null);
    try {
      const results = await evidenceController.current.execute(runPhase8eVerificationMatrix);
      setIntegrationResults(results);
    } catch (reason) {
      setIntegrationError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIntegrationRunning(false);
    }
  };

  return (
    <div className="software-verification-overview" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">SOFTWARE VERIFICATION ARCHITECTURE</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#059669" }}>
              PHASE 8A FRAMEWORK
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Software-Validated Optical Communication Framework
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Evidence is derived from recorded software runs and remains distinct from physical validation.
          </p>
        </div>

        <div style={{ background: "rgba(5, 150, 105, 0.15)", border: "1px solid rgba(5, 150, 105, 0.3)", borderRadius: "8px", padding: "8px 14px", textAlign: "right" }}>
          <div style={{ fontSize: "10px", color: "#6ee7b7", fontWeight: 600 }}>OVERALL READINESS</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
            {matrixReport.overallSoftwareReadinessPct}% Validated
          </div>
        </div>
      </div>

      {/* 4 Overview Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Verified Protocols</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#6ee7b7", marginTop: "2px" }}>
            {matrixReport.verifiedProtocolsCount} / {matrixReport.totalProtocolsEvaluated}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Software Verified (N ≥ 3, 100% SHA)
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Recorded Benchmark Runs</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#93c5fd", marginTop: "2px" }}>
            {matrixReport.protocols.reduce((sum, protocol) => sum + protocol.totalBenchmarkRuns, 0)} Runs
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            From stored execution evidence
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>E2E Verified Configurations</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#c7d2fe", marginTop: "2px" }}>
            {matrixReport.endToEndVerifiedProtocolsCount}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Requires an actual complete pipeline run
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Evidence Segregation</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#fef08a", marginTop: "6px" }}>
            Software vs Hardware
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Zero False Hardware Claims
          </div>
        </div>
      </div>

      {/* Protocol Breakdown Table */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
          Protocol Software Verification & Confidence Breakdown
        </h4>
        <div className="research-table-wrapper" style={{ maxHeight: "320px", overflowY: "auto" }}>
          <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Modulation / Grid</th>
                <th>Benchmark Runs</th>
                <th>CRC Pass</th>
                <th>SHA-256 Match</th>
                <th>Confidence Level</th>
                <th>Confidence Reasoning</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {matrixReport.protocols.map((p: ProtocolSoftwareVerification) => (
                <tr key={`${p.protocol}_${p.modulation}_${p.gridSize || ""}`}>
                  <td>
                    <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                      {p.protocolLabel}
                    </span>
                  </td>
                  <td>
                    <strong>{p.modulation}</strong> {p.gridSize ? `(${p.gridSize}×${p.gridSize})` : ""}
                  </td>
                  <td>{p.totalBenchmarkRuns} ({p.successfulRunsCount} ✓)</td>
                  <td>{(p.crcPassRate * 100).toFixed(0)}%</td>
                  <td>{(p.sha256MatchRate * 100).toFixed(0)}%</td>
                  <td>
                    <span className="badge-active" style={{ fontSize: "9px", padding: "1px 6px" }}>
                      {p.confidence.level}
                    </span>
                  </td>
                  <td style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {p.confidence.reasoning}
                  </td>
                  <td>
                    <span
                      className="badge-active"
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        background:
                          p.status === SoftwareVerificationStatus.SOFTWARE_END_TO_END_VERIFIED
                            ? "#059669"
                            : p.status === SoftwareVerificationStatus.SOFTWARE_UNIT_VERIFIED
                            ? "#2563eb"
                            : "#6b7280",
                      }}
                    >
                      {p.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <EndToEndSoftwareVerification
        results={integrationResults.length > 0 ? integrationResults : null}
        running={integrationRunning}
        error={integrationError}
        onExecute={() => void executeIntegration()}
      />
    </div>
  );
};
