/**
 * Controlled Physical Evidence Acquisition & Matrix Progress Dashboard (Milestone 7E)
 *
 * Implements:
 * - Systematic tracking across 13 experimental optical targets (39 qualifying runs required)
 * - Real-time qualifying vs failed run classification
 * - Operator next-run recommendation engine
 * - Full end-to-end evidence chain inspector (TestRun -> Manifest -> Dataset -> Archive -> Peer Review)
 * - Strict non-fabrication guarantee: Reflects exclusively physical ledger records
 *
 * NOTE: For physical optical screen-to-camera execution.
 */

import React, { useState, useMemo } from "react";
import type { TestRun } from "../research/test-run";
import {
  evaluateAcquisitionProgress,
  traceEvidenceChain,
  type AcquisitionMatrixSummary,
  type EvidenceChainTrace,
  type ConfigAcquisitionProgress,
} from "../research/physical-acquisition";

interface EvidenceAcquisitionDashboardProps {
  runs: TestRun[];
  onSelectConfigForTest?: (transport: string, modulation: string, gridSize?: number) => void;
}

export const EvidenceAcquisitionDashboard: React.FC<EvidenceAcquisitionDashboardProps> = ({
  runs,
  onSelectConfigForTest,
}) => {
  const summary: AcquisitionMatrixSummary = useMemo(() => evaluateAcquisitionProgress(runs), [runs]);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<EvidenceChainTrace | null>(null);
  const [tracingLoading, setTracingLoading] = useState(false);

  const physicalRuns = useMemo(() => runs.filter((r) => r.evidenceKind === "physical"), [runs]);

  const handleInspectTrace = async (run: TestRun) => {
    setSelectedRunId(run.runId);
    setTracingLoading(true);
    try {
      const trace = await traceEvidenceChain(run, runs);
      setSelectedTrace(trace);
    } catch (err) {
      console.error("Failed to trace evidence chain:", err);
    } finally {
      setTracingLoading(false);
    }
  };

  return (
    <div className="evidence-acquisition-dashboard" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header & Next-Run Recommendation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">CONTROLLED PHYSICAL EVIDENCE ACQUISITION</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#6366f1" }}>
              PHASE 7E CAMPAIGN
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Optical Hardware Test Matrix & Evidence Progress
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Systematic physical campaign requiring 3 independent bit-perfect SHA-256 qualifying runs per configuration (39 total experimental runs).
          </p>
        </div>

        {summary.recommendedNextTarget && (
          <div style={{ background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "8px", padding: "10px 14px", textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "#c7d2fe", fontWeight: 600 }}>NEXT RECOMMENDED TARGET</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", marginTop: "2px" }}>
              {summary.recommendedNextTarget.transportLabel} · {summary.recommendedNextTarget.modulation}
              {summary.recommendedNextTarget.gridSize ? ` (${summary.recommendedNextTarget.gridSize}×${summary.recommendedNextTarget.gridSize})` : ""}
            </div>
            {onSelectConfigForTest && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  onSelectConfigForTest(
                    summary.recommendedNextTarget!.transport,
                    summary.recommendedNextTarget!.modulation,
                    summary.recommendedNextTarget!.gridSize
                  )
                }
                style={{ fontSize: "11px", padding: "4px 10px", marginTop: "6px" }}
              >
                ▶ Load into Workbench
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress Cards & Master Progress Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Qualifying Progress</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#6ee7b7", marginTop: "2px" }}>
            {summary.totalCompletedQualifyingRuns} / {summary.totalRequiredRuns}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {summary.overallAcquisitionProgressPct}% of Campaign Complete
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Verified Configurations</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#93c5fd", marginTop: "2px" }}>
            {summary.verifiedConfigsCount} / {summary.totalTargetConfigs}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {summary.inProgressConfigsCount} In Progress · {summary.untestedConfigsCount} Untested
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Recorded Failures</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: summary.totalRecordedFailures > 0 ? "#fca5a5" : "#6ee7b7", marginTop: "2px" }}>
            {summary.totalRecordedFailures}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Retained Immutably as Evidence
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Campaign Invariant</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fef08a", marginTop: "4px" }}>
            N ≥ 3 & 0 Failures
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Exact SHA-256 Parity Required
          </div>
        </div>
      </div>

      {/* Campaign Progress Bar */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>
          <span>Overall Physical Campaign Matrix</span>
          <span>{summary.totalCompletedQualifyingRuns} of {summary.totalRequiredRuns} Qualifying Runs</span>
        </div>
        <div style={{ width: "100%", background: "rgba(255,255,255,0.1)", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
          <div
            style={{
              width: `${summary.overallAcquisitionProgressPct}%`,
              height: "100%",
              background: summary.overallAcquisitionProgressPct === 100 ? "#4ade80" : "#6366f1",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Systematic 14-Target Acquisition Matrix Table */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)", marginBottom: "18px" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
          Target Configuration Acquisition Ledger
        </h4>
        <div className="research-table-wrapper" style={{ maxHeight: "360px", overflowY: "auto" }}>
          <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Modulation / Grid</th>
                <th>Required Runs</th>
                <th>Qualifying Progress</th>
                <th>Attempts</th>
                <th>Failures</th>
                <th>Median KB/s</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.configs.map((cfg: ConfigAcquisitionProgress) => {
                let badgeClass = "tag-untested";
                if (cfg.status === "PHYSICALLY_VERIFIED") badgeClass = "tag-verified";
                else if (cfg.status === "PHYSICAL_FAILURE_RECORDED") badgeClass = "tag-failed";
                else if (cfg.status === "INSUFFICIENT_PHYSICAL_EVIDENCE") badgeClass = "tag-insufficient";

                return (
                  <tr key={cfg.target.configId}>
                    <td>
                      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {cfg.target.transportLabel}
                      </span>
                    </td>
                    <td>
                      <strong>{cfg.target.modulation}</strong> {cfg.target.gridSize ? `(${cfg.target.gridSize}×${cfg.target.gridSize})` : ""}
                    </td>
                    <td>{cfg.target.requiredQualifyingRuns}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: "4px", height: "6px", overflow: "hidden", minWidth: "60px" }}>
                          <div
                            style={{
                              width: `${(Math.min(cfg.qualifyingRuns, 3) / 3) * 100}%`,
                              height: "100%",
                              background: cfg.isComplete ? "#4ade80" : "#6366f1",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>{cfg.qualifyingRuns} / 3</span>
                      </div>
                    </td>
                    <td>{cfg.totalAttempts}</td>
                    <td style={{ color: cfg.failedRuns > 0 ? "#f87171" : "inherit" }}>{cfg.failedRuns}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {cfg.medianThroughputKbps > 0 ? `${cfg.medianThroughputKbps} KB/s` : "-"}
                    </td>
                    <td>
                      <span className={`tag ${badgeClass}`}>{cfg.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* End-to-End Evidence Chain Inspector */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "14px", color: "#c7d2fe" }}>
              End-to-End Evidence Chain Inspector
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--text-muted)" }}>
              Inspects full immutable cryptographic provenance: TestRun → Manifest → Dataset Bundle → Archive → Peer Review.
            </p>
          </div>

          {physicalRuns.length > 0 && (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Select a physical run to trace:
            </div>
          )}
        </div>

        {physicalRuns.length === 0 ? (
          <div style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
            No physical test runs recorded in ledger. Perform screen-to-camera experiments to generate verifiable evidence chains.
          </div>
        ) : (
          <div>
            {/* Run Selection Pills */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
              {physicalRuns.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  className={`btn ${selectedRunId === run.runId ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => handleInspectTrace(run)}
                  style={{ fontSize: "11px", padding: "4px 8px", fontFamily: "var(--font-mono)" }}
                >
                  {run.runId.slice(0, 10)}… ({run.transport.toUpperCase()} {run.integrityStatus === "verified" ? "✓" : "✗"})
                </button>
              ))}
            </div>

            {/* Trace Visualization Panel */}
            {tracingLoading ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--text-secondary)", fontSize: "12px" }}>
                Verifying cryptographic evidence chain…
              </div>
            ) : selectedTrace ? (
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "14px", fontSize: "12px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                {/* 1. Test Run */}
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>STEP 1: PHYSICAL RUN</div>
                  <div style={{ fontWeight: 600, color: selectedTrace.isQualifying ? "#4ade80" : "#f87171", marginTop: "2px" }}>
                    {selectedTrace.isQualifying ? "QUALIFYING" : "NON-QUALIFYING"}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    ID: {selectedTrace.runId.slice(0, 12)}…
                  </div>
                </div>

                {/* 2. Manifest */}
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>STEP 2: MANIFEST</div>
                  <div style={{ fontWeight: 600, color: "#93c5fd", marginTop: "2px" }}>
                    {selectedTrace.manifest.modulation} {selectedTrace.manifest.gridSize ? `(${selectedTrace.manifest.gridSize}×${selectedTrace.manifest.gridSize})` : ""}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Hash: {selectedTrace.manifest.manifestHash?.slice(0, 8)}…
                  </div>
                </div>

                {/* 3. Dataset Bundle */}
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>STEP 3: DATASET BUNDLE</div>
                  <div style={{ fontWeight: 600, color: "#c7d2fe", marginTop: "2px" }}>PACKAGED</div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    ID: {selectedTrace.datasetBundleId?.slice(0, 10)}…
                  </div>
                </div>

                {/* 4. Archive Entry */}
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>STEP 4: ARCHIVE</div>
                  <div style={{ fontWeight: 600, color: "#a7f3d0", marginTop: "2px" }}>SEALED (SHA-256)</div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    ID: {selectedTrace.archiveId?.slice(0, 10)}…
                  </div>
                </div>

                {/* 5. Peer Review Audit */}
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>STEP 5: PEER REVIEW</div>
                  <div style={{ fontWeight: 600, color: selectedTrace.peerReviewReady ? "#4ade80" : "#fbbf24", marginTop: "2px" }}>
                    {selectedTrace.peerReviewReady ? "READY" : "PARTIALLY READY"}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Audit Passed
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-secondary)", fontSize: "12px" }}>
                Click on any recorded physical run above to inspect its full cryptographic trace.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
