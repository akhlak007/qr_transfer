/**
 * Physical Experiment Campaign Execution Dashboard (Milestone 7F)
 *
 * Implements:
 * - Real-time campaign tracking across 14 targets (39 experimental qualifying runs)
 * - Systematic target progression, manual operator confirmation gates, and state machine controls
 * - Per-target acquisition matrix and provenance inspection
 * - Campaign export in JSON, CSV, and Markdown formats
 *
 * NOTE: For physical screen-to-camera optical campaigns.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { PersistenceRepositories } from "../storage/persistence";
import type { TestRun } from "../research/test-run";
import {
  PhysicalCampaignController,
} from "../research/physical-campaign-controller";
import {
  CampaignState,
  type CampaignSnapshot,
  type TargetCampaignProgress,
} from "../research/physical-campaign";
import { PhysicalRunEvidencePanel } from "./PhysicalRunEvidencePanel";
import {
  exportCampaignToJson,
  exportCampaignToCsv,
  exportCampaignToMarkdown,
} from "../research/campaign-export";

interface PhysicalCampaignDashboardProps {
  persistence: PersistenceRepositories | null;
  runs: TestRun[];
  onSelectTargetForWorkbench?: (transport: string, modulation: string, gridSize?: number) => void;
}

export const PhysicalCampaignDashboard: React.FC<PhysicalCampaignDashboardProps> = ({
  persistence,
  runs,
  onSelectTargetForWorkbench,
}) => {
  const controller = useMemo(
    () => new PhysicalCampaignController({ persistence }),
    [persistence]
  );

  const [snapshot, setSnapshot] = useState<CampaignSnapshot>(() =>
    controller.setRuns(runs)
  );
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);

  const updateSnapshot = useCallback(() => {
    const s = controller.setRuns(runs);
    setSnapshot(s);
  }, [controller, runs]);

  useEffect(() => {
    updateSnapshot();
  }, [updateSnapshot]);

  const physicalRuns = useMemo(() => runs.filter((r) => r.evidenceKind === "physical"), [runs]);

  const handleStartCampaign = () => {
    const s = controller.startCampaign();
    setSnapshot({ ...s });
  };

  const handlePauseCampaign = () => {
    const s = controller.pauseCampaign();
    setSnapshot({ ...s });
  };

  const handleResumeCampaign = () => {
    const s = controller.resumeCampaign();
    setSnapshot({ ...s });
  };

  const handleCancelCampaign = () => {
    const s = controller.cancelCampaign();
    setSnapshot({ ...s });
  };

  const handleSelectTarget = (index: number) => {
    const s = controller.selectTarget(index);
    setSnapshot({ ...s });
  };

  const handleAdvanceTarget = () => {
    const s = controller.advanceToNextTarget();
    setSnapshot({ ...s });
  };

  const handleExportJson = async () => {
    const jsonStr = await exportCampaignToJson(snapshot, physicalRuns);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_campaign_${snapshot.campaignId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvStr = exportCampaignToCsv(snapshot);
    const blob = new Blob([csvStr], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_campaign_${snapshot.campaignId}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = async () => {
    const mdStr = await exportCampaignToMarkdown(snapshot, physicalRuns);
    const blob = new Blob([mdStr], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_campaign_report_${snapshot.campaignId}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTarget = snapshot.currentTarget;

  return (
    <div className="campaign-dashboard-container" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header & Campaign State */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">AUTOMATED PHYSICAL CAMPAIGN EXECUTION</span>
            <span
              className="badge-active"
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                background: snapshot.state === CampaignState.CAMPAIGN_COMPLETED ? "#059669" : "#6366f1",
              }}
            >
              STATE: {snapshot.state}
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Phase 7F Physical Optical Campaign Orchestrator
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Systematic execution across 13 optical configurations requiring 39 qualifying screen-to-camera runs with bit-perfect SHA-256 parity.
          </p>
        </div>

        {/* Global Campaign Actions */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {snapshot.state === CampaignState.IDLE && (
            <button type="button" className="btn btn-primary" onClick={handleStartCampaign} style={{ fontSize: "12px", padding: "6px 12px" }}>
              ▶ Start Campaign
            </button>
          )}

          {snapshot.state === CampaignState.READY || snapshot.state === CampaignState.RUNNING ? (
            <button type="button" className="btn btn-secondary" onClick={handlePauseCampaign} style={{ fontSize: "12px", padding: "6px 10px" }}>
              ⏸ Pause
            </button>
          ) : snapshot.state === CampaignState.PAUSED ? (
            <button type="button" className="btn btn-primary" onClick={handleResumeCampaign} style={{ fontSize: "12px", padding: "6px 10px" }}>
              ▶ Resume
            </button>
          ) : null}

          {snapshot.state !== CampaignState.IDLE && snapshot.state !== CampaignState.CAMPAIGN_COMPLETED && (
            <button type="button" className="btn btn-secondary" onClick={handleCancelCampaign} style={{ fontSize: "12px", padding: "6px 10px", color: "#f87171" }}>
              ✕ Cancel
            </button>
          )}

          {/* Export Dropdown / Buttons */}
          <button type="button" className="btn btn-secondary" onClick={handleExportJson} style={{ fontSize: "11px", padding: "4px 8px" }}>
            JSON
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExportCsv} style={{ fontSize: "11px", padding: "4px 8px" }}>
            CSV
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExportMarkdown} style={{ fontSize: "11px", padding: "4px 8px" }}>
            Markdown
          </button>
        </div>
      </div>

      {/* Campaign Summary Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Qualifying Runs</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#6ee7b7", marginTop: "2px" }}>
            {snapshot.totalCompletedQualifyingRuns} / {snapshot.totalRequiredRuns}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {snapshot.progressPercentage}% Completed ({snapshot.totalRequiredRuns - snapshot.totalCompletedQualifyingRuns} Remaining)
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Active Target</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#93c5fd", marginTop: "4px" }}>
            {currentTarget ? `${currentTarget.transportLabel} · ${currentTarget.modulation}` : "None Selected"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Target {snapshot.currentTargetIndex + 1} of 14
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Recorded Failures</div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: snapshot.totalRecordedFailures > 0 ? "#fca5a5" : "#6ee7b7", marginTop: "2px" }}>
            {snapshot.totalRecordedFailures}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Retained Immutably
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Campaign Invariant</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fef08a", marginTop: "4px" }}>
            N ≥ 3 & 0 Failures
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Strict Physical-Only Capture
          </div>
        </div>
      </div>

      {/* Master Progress Bar */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>
          <span>Campaign Progress</span>
          <span>{snapshot.totalCompletedQualifyingRuns} of {snapshot.totalRequiredRuns} Qualifying Runs</span>
        </div>
        <div style={{ width: "100%", background: "rgba(255,255,255,0.1)", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
          <div
            style={{
              width: `${snapshot.progressPercentage}%`,
              height: "100%",
              background: snapshot.progressPercentage === 100 ? "#4ade80" : "#6366f1",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Active Target Banner & Workbench Dispatch */}
      {currentTarget && (
        <div style={{ background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#c7d2fe", fontWeight: 600 }}>CURRENT CAMPAIGN TARGET #{snapshot.currentTargetIndex + 1}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", marginTop: "2px" }}>
              {currentTarget.transportLabel} — {currentTarget.modulation} {currentTarget.gridSize ? `(${currentTarget.gridSize}×${currentTarget.gridSize})` : ""}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              {currentTarget.description}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {onSelectTargetForWorkbench && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  onSelectTargetForWorkbench(
                    currentTarget.transport,
                    currentTarget.modulation,
                    currentTarget.gridSize
                  )
                }
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                🔬 Execute in Physical Workbench
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleAdvanceTarget}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              ⏩ Next Incomplete Target
            </button>
          </div>
        </div>
      )}

      {/* 14-Target Acquisition Matrix Table */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
          Campaign Target Matrix & Progression
        </h4>
        <div className="research-table-wrapper" style={{ maxHeight: "320px", overflowY: "auto" }}>
          <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Target ID</th>
                <th>Protocol</th>
                <th>Modulation</th>
                <th>Grid</th>
                <th>Required</th>
                <th>Qualifying</th>
                <th>Failed</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.targets.map((t: TargetCampaignProgress, idx: number) => {
                const isSelected = snapshot.currentTargetIndex === idx;
                let badgeClass = "tag-untested";
                if (t.status === "PHYSICALLY_VERIFIED") badgeClass = "tag-verified";
                else if (t.status === "PHYSICAL_FAILURE_RECORDED") badgeClass = "tag-failed";
                else if (t.status === "INSUFFICIENT_PHYSICAL_EVIDENCE") badgeClass = "tag-insufficient";

                return (
                  <tr
                    key={t.targetId}
                    style={{
                      background: isSelected ? "rgba(99, 102, 241, 0.15)" : undefined,
                    }}
                  >
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{t.targetId}</td>
                    <td>
                      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {t.protocol.toUpperCase()}
                      </span>
                    </td>
                    <td><strong>{t.modulation}</strong></td>
                    <td>{t.gridSize ? `${t.gridSize}×${t.gridSize}` : "-"}</td>
                    <td>{t.requiredRuns}</td>
                    <td style={{ color: "#6ee7b7", fontWeight: 600 }}>{t.qualifyingRuns}</td>
                    <td style={{ color: t.failedRuns > 0 ? "#f87171" : "inherit" }}>{t.failedRuns}</td>
                    <td>{t.remainingRuns}</td>
                    <td>
                      <span className={`tag ${badgeClass}`}>{t.status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn ${isSelected ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => handleSelectTarget(idx)}
                        style={{ fontSize: "10px", padding: "2px 6px" }}
                      >
                        {isSelected ? "Active" : "Select"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Physical Runs Provenance Card */}
      {physicalRuns.length > 0 && (
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: "#c7d2fe" }}>
              Recent Physical Run Provenance
            </h4>
            <div style={{ display: "flex", gap: "6px" }}>
              {physicalRuns.slice(0, 5).map((r) => (
                <button
                  key={r.runId}
                  type="button"
                  className={`btn ${selectedRun?.runId === r.runId ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setSelectedRun(r)}
                  style={{ fontSize: "10px", padding: "2px 6px", fontFamily: "var(--font-mono)" }}
                >
                  {r.runId.slice(0, 8)}…
                </button>
              ))}
            </div>
          </div>

          {selectedRun ? (
            <PhysicalRunEvidencePanel run={selectedRun} onClose={() => setSelectedRun(null)} />
          ) : (
            <PhysicalRunEvidencePanel run={physicalRuns[0]} />
          )}
        </div>
      )}
    </div>
  );
};
