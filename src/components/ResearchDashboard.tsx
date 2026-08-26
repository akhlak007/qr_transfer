import React, { useState, useEffect, useCallback } from "react";
import type { TestRun, EvidenceKind } from "../research/test-run";
import { TransportId } from "../core/transport";
import type { PersistenceRepositories } from "../storage/persistence";
import { CompatibilityMatrix } from "./CompatibilityMatrix";
import { TestProtocolModal } from "./TestProtocolModal";
import { PhysicalTestProtocolModal } from "./PhysicalTestProtocolModal";
import { VlcPhysicalExperimentModal } from "./VlcPhysicalExperimentModal";
import { OfdmPhysicalExperimentModal } from "./OfdmPhysicalExperimentModal";
import { PhysicalExperimentWorkbench } from "./PhysicalExperimentWorkbench";
import { PhysicalExperimentHistory } from "./PhysicalExperimentHistory";
import { PhysicalValidationDashboard } from "./PhysicalValidationDashboard";
import { VerificationMatrixDashboard } from "./VerificationMatrixDashboard";
import { ReproducibilityDashboard } from "./ReproducibilityDashboard";
import { LongitudinalAnalyticsDashboard } from "./LongitudinalAnalyticsDashboard";
import { ResearchArchiveDashboard } from "./ResearchArchiveDashboard";
import { PhysicalCampaignDashboard } from "./PhysicalCampaignDashboard";
import { LivePhysicalAcquisition } from "./LivePhysicalAcquisition";
import { SoftwareVerificationOverview } from "./SoftwareVerificationOverview";
import { BenchmarkDashboard } from "./BenchmarkDashboard";
import {
  generatePublicationMarkdownPaper,
  generatePublicationJson,
  generatePublicationCsv,
} from "../research/publication-generator";
import { formatBytes } from "./format";

interface ResearchDashboardProps {
  persistence: PersistenceRepositories | null;
}

export const ResearchDashboard: React.FC<ResearchDashboardProps> = ({ persistence }) => {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [mainTab, setMainTab] = useState<"physical_validation" | "software_overview" | "benchmarking" | "workbench" | "campaign" | "live_acquisition" | "matrix" | "analytics" | "reproducibility" | "longitudinal" | "archive" | "publication" | "ledger">("physical_validation");
  const [selectedTransport, setSelectedTransport] = useState<TransportId>(TransportId.QR);
  const [selectedEvidenceKind, setSelectedEvidenceKind] = useState<EvidenceKind | "all">("all");
  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [isPhysicalModalOpen, setIsPhysicalModalOpen] = useState(false);
  const [isVlcExperimentModalOpen, setIsVlcExperimentModalOpen] = useState(false);
  const [isOfdmExperimentModalOpen, setIsOfdmExperimentModalOpen] = useState(false);

  const loadRuns = useCallback(async () => {
    if (!persistence) return;
    setLoading(true);
    try {
      const list = await persistence.research.list();
      setRuns(list);
    } catch (err) {
      console.error("Failed to load test runs:", err);
    } finally {
      setLoading(false);
    }
  }, [persistence]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const filteredRuns = runs.filter((run) => {
    if (selectedEvidenceKind === "all") return true;
    return run.evidenceKind === selectedEvidenceKind;
  });

  const handleDownloadPaper = () => {
    const md = generatePublicationMarkdownPaper(runs);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `screen_to_camera_optical_research_paper_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const json = generatePublicationJson(runs);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optical_research_publication_bundle_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const csv = generatePublicationCsv(runs);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optical_comparative_benchmark_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="research-dashboard-container">
      {/* Research Suite Main Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div className="ollyo-section-label">EMPIRICAL BENCHMARKING & PUBLICATION SUITE</div>
          <h2 style={{ margin: "2px 0 0 0", fontSize: "22px", color: "#f3f4f6" }}>
            Optical Communications Research Console
          </h2>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setMainTab("physical_validation")}
            style={{ fontSize: "12px", padding: "6px 12px", background: "#2563eb", color: "#fff", border: "none" }}
          >
            🔬 Physical Validation (Phase 13)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsPhysicalModalOpen(true)}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            + Record Physical Run
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsProtocolModalOpen(true)}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            + Record Synthetic Run
          </button>
        </div>
      </div>

      {/* Main Mode Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", flexWrap: "wrap" }}>
        {[
          { id: "physical_validation", label: "🔬 Authoritative Physical Validation (Phase 11-13)" },
          { id: "software_overview", label: "⚡ Software Verification" },
          { id: "benchmarking", label: "⏱️ End-to-End Benchmarking (Phase 8B)" },
          { id: "matrix", label: "📊 Verification Matrix" },
          { id: "workbench", label: "🔬 Physical Workbench" },
          { id: "campaign", label: "🎯 Physical Campaign" },
          { id: "live_acquisition", label: "📡 Live Acquisition" },
          { id: "analytics", label: "📈 Performance Analytics" },
          { id: "reproducibility", label: "🧪 Reproducibility & Datasets" },
          { id: "longitudinal", label: "📉 Longitudinal Trends" },
          { id: "archive", label: "🏛️ Research Archive" },
          { id: "publication", label: "📄 Publication Generator" },
          { id: "ledger", label: `📋 Full Ledger (${runs.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${mainTab === t.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMainTab(t.id as any)}
            style={{ fontSize: "12px", padding: "6px 14px", fontWeight: mainTab === t.id ? 600 : 400 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Authoritative Physical Validation (Phase 11-13) */}
      {mainTab === "physical_validation" && (
        <PhysicalValidationDashboard runs={runs} />
      )}

      {/* Tab 0: Software Verification Overview (Phase 8A) */}
      {mainTab === "software_overview" && (
        <SoftwareVerificationOverview runs={runs} />
      )}


      {/* Tab 0.5: End-to-End Benchmarking (Phase 8B) */}
      {mainTab === "benchmarking" && (
        <BenchmarkDashboard />
      )}

      {/* Tab 1: Physical Workbench */}
      {mainTab === "workbench" && (
        <PhysicalExperimentWorkbench
          persistence={persistence}
          onExperimentCompleted={loadRuns}
        />
      )}

      {/* Tab 2: Physical Campaign */}
      {mainTab === "campaign" && (
        <PhysicalCampaignDashboard
          persistence={persistence}
          runs={runs}
          onSelectTargetForWorkbench={() => setMainTab("workbench")}
        />
      )}

      {/* Tab 3: Live Acquisition (Phase 7G) */}
      {mainTab === "live_acquisition" && (
        <LivePhysicalAcquisition
          persistence={persistence}
          onRunRecorded={loadRuns}
        />
      )}

      {/* Tab 4: Verification Matrix */}
      {mainTab === "matrix" && (
        <>
          <VerificationMatrixDashboard runs={runs} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", marginBottom: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#cbd5e1" }}>Directional Compatibility Matrix</span>
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { id: TransportId.QR, label: "QR" },
                { id: TransportId.VLC, label: "VLC" },
                { id: TransportId.VisualOFDM, label: "Visual OFDM" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`btn ${selectedTransport === t.id ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setSelectedTransport(t.id)}
                  style={{ fontSize: "11px", padding: "3px 8px" }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <CompatibilityMatrix runs={runs} transport={selectedTransport} />
        </>
      )}

      {/* Tab 3: Performance Analytics */}
      {mainTab === "analytics" && (
        <PhysicalValidationDashboard runs={runs} />
      )}

      {/* Tab 4: Longitudinal Trends */}
      {mainTab === "longitudinal" && (
        <LongitudinalAnalyticsDashboard runs={runs} />
      )}

      {/* Tab 5: Reproducibility & Datasets */}
      {mainTab === "reproducibility" && (
        <ReproducibilityDashboard runs={runs} />
      )}

      {/* Tab 6: Archive & Peer Review */}
      {mainTab === "archive" && (
        <ResearchArchiveDashboard runs={runs} />
      )}

      {/* Tab 7: Publication Generator */}
      {mainTab === "publication" && (
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "20px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <div className="ollyo-section-label">PUBLICATION-READY RESEARCH DISSEMINATION</div>
              <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
                Academic Research Paper & Data Bundle Generator
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                Generates formal peer-reviewable research artifacts directly from empirical ledger evidence.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownloadPaper}
                style={{ fontSize: "12px", padding: "8px 14px" }}
              >
                📄 Download Markdown Paper (.md)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadJson}
                style={{ fontSize: "12px", padding: "8px 12px" }}
              >
                📦 Download JSON Package
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadCsv}
                style={{ fontSize: "12px", padding: "8px 12px" }}
              >
                📊 Download CSV Dataset
              </button>
            </div>
          </div>

          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "16px", fontSize: "13px", lineHeight: "1.6", color: "#cbd5e1" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#93c5fd" }}>
              Included Paper Sections (IEEE / ACM Research Format)
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>• <strong>Abstract:</strong> Problem formulation & empirical scope</div>
              <div>• <strong>Methodology:</strong> Minimum evidence policy ($N \ge 3$)</div>
              <div>• <strong>Hardware Setup:</strong> Mini-LED display & 48MP camera parameters</div>
              <div>• <strong>Results:</strong> Comparative throughput, distance & FPS</div>
              <div>• <strong>Rankings:</strong> Highest throughput, reliability & robustness</div>
              <div>• <strong>Scientific Integrity:</strong> Anti-fabrication guarantees</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Test Run Ledger */}
      {mainTab === "ledger" && (
        <>
          <div style={{ marginBottom: "20px" }}>
            <PhysicalExperimentHistory runs={runs} />
          </div>

          <div className="research-history-section">
            <div className="research-history-header">
              <div style={{ fontWeight: 600, fontSize: "16px" }}>
                Complete Multi-Transport Ledger ({filteredRuns.length})
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Filter Evidence:</span>
                <select
                  className="form-select"
                  style={{ padding: "4px 10px", fontSize: "12px", width: "auto" }}
                  value={selectedEvidenceKind}
                  onChange={(e) => setSelectedEvidenceKind(e.target.value as any)}
                >
                  <option value="all">All Evidence Types</option>
                  <option value="physical">Physical Only</option>
                  <option value="simulated">Simulated Only</option>
                </select>
              </div>
            </div>

            {loading && runs.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                Loading research evidence ledger...
              </div>
            ) : filteredRuns.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)", background: "rgba(255,255,255,0.01)", borderRadius: "8px" }}>
                No test runs recorded matching the selected filter.
              </div>
            ) : (
              <div className="research-table-wrapper">
                <table className="research-table">
                  <thead>
                    <tr>
                      <th>Run ID</th>
                      <th>Kind</th>
                      <th>Direction</th>
                      <th>File & Size</th>
                      <th>Throughput</th>
                      <th>Frame Hit Rate</th>
                      <th>Integrity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((run) => (
                      <tr key={run.runId}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                          {run.runId.slice(0, 14)}…
                        </td>
                        <td>
                          <span className={`tag ${run.evidenceKind === "physical" ? "tag-verified" : "tag-simulated"}`}>
                            {run.evidenceKind.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {run.sender.platform} → {run.receiver.platform}
                        </td>
                        <td>
                          {run.fileName} ({formatBytes(run.metrics.fileSize)})
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>
                          {(run.metrics.averageThroughputBytesPerSecond / 1024).toFixed(1)} KB/s
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>
                          {((run.metrics.frameHitRate ?? 1.0) * 100).toFixed(0)}%
                        </td>
                        <td>
                          <span className={`tag ${run.integrityStatus === "verified" ? "tag-verified" : "tag-failed"}`}>
                            {run.integrityStatus.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <TestProtocolModal
        isOpen={isProtocolModalOpen}
        onClose={() => setIsProtocolModalOpen(false)}
        persistence={persistence}
        onRunSaved={loadRuns}
      />

      <PhysicalTestProtocolModal
        isOpen={isPhysicalModalOpen}
        onClose={() => setIsPhysicalModalOpen(false)}
        persistence={persistence}
        onRunSaved={loadRuns}
      />

      <VlcPhysicalExperimentModal
        isOpen={isVlcExperimentModalOpen}
        onClose={() => setIsVlcExperimentModalOpen(false)}
        persistence={persistence}
        onRunSaved={loadRuns}
      />

      <OfdmPhysicalExperimentModal
        isOpen={isOfdmExperimentModalOpen}
        onClose={() => setIsOfdmExperimentModalOpen(false)}
        persistence={persistence}
        onRunSaved={loadRuns}
      />
    </div>
  );
};
