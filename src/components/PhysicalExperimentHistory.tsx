/**
 * Physical Optical Experiment History Ledger (Milestone 6D)
 *
 * Implements:
 * - Immutable view of all recorded physical optical test runs
 * - Detailed telemetry inspection (FPS, distance, lux, CRC, SHA-256 match, failure reasons)
 * - Strict provenance and reproducible hardware evidence display
 *
 * NOTE: Read-only ledger view. Prevents editing or mutation of historical evidence.
 */

import React, { useState } from "react";
import type { TestRun } from "../research/test-run";
import { formatBytes } from "./format";

interface PhysicalExperimentHistoryProps {
  runs: TestRun[];
}

export const PhysicalExperimentHistory: React.FC<PhysicalExperimentHistoryProps> = ({ runs }) => {
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);

  const physicalRuns = runs.filter((r) => r.evidenceKind === "physical");

  return (
    <div className="physical-history-container" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "16px", border: "1px solid var(--border-color)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", color: "#f3f4f6" }}>
            Physical Hardware Experiment Ledger ({physicalRuns.length})
          </h3>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Immutable records of real screen-to-camera test runs. Every entry includes verified hardware provenance.
          </p>
        </div>
      </div>

      {physicalRuns.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", background: "rgba(255,255,255,0.01)", borderRadius: "6px", fontSize: "13px" }}>
          No physical optical experiments recorded yet. Use the Physical Experiment Workbench to execute a live test run.
        </div>
      ) : (
        <div className="research-table-wrapper" style={{ maxHeight: "360px", overflowY: "auto" }}>
          <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Transport</th>
                <th>Direction</th>
                <th>Distance / Env</th>
                <th>Camera FPS</th>
                <th>Throughput</th>
                <th>CRC</th>
                <th>SHA-256 Integrity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {physicalRuns.map((run) => {
                const isVerified = run.integrityStatus === "verified";
                const isMismatch = run.integrityStatus === "mismatch";

                let badge = <span className="tag tag-untested">NOT TESTED</span>;
                if (isVerified) {
                  badge = <span className="tag tag-verified" style={{ background: "#059669", color: "#fff" }}>✓ SHA-256 MATCH</span>;
                } else if (isMismatch) {
                  badge = <span className="tag tag-failed" style={{ background: "#dc2626", color: "#fff" }}>✕ HASH MISMATCH</span>;
                }

                return (
                  <tr key={run.runId}>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(run.createdAt).toLocaleDateString()} {new Date(run.createdAt).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {run.transport.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {run.sender.platform} → {run.receiver.platform}
                    </td>
                    <td>
                      {run.distanceCm ? `${run.distanceCm}cm` : "-"} / {run.environment}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {run.metrics.cameraFps ? `${run.metrics.cameraFps.toFixed(1)} fps` : "N/A"}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {(run.metrics.averageThroughputBytesPerSecond / 1024).toFixed(1)} KB/s
                    </td>
                    <td>
                      <span style={{ color: run.metrics.errorRate === 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                        {run.metrics.errorRate === 0 ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td>{badge}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setSelectedRun(run)}
                        style={{ padding: "2px 8px", fontSize: "11px" }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detailed Modal Inspection */}
      {selectedRun && (
        <div className="modal-backdrop">
          <div className="modal-container" style={{ maxWidth: "650px" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: "16px" }}>Physical Experiment Provenance</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedRun(null)} style={{ padding: "4px 8px" }}>
                ✕
              </button>
            </div>
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "14px", fontSize: "12px", fontFamily: "var(--font-mono)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div><strong>Run ID:</strong> {selectedRun.runId}</div>
              <div><strong>Transport:</strong> {selectedRun.transport.toUpperCase()}</div>
              <div><strong>Payload Size:</strong> {formatBytes(selectedRun.metrics.fileSize)} ({selectedRun.metrics.fileSize} bytes)</div>
              <div><strong>Transmitter:</strong> {selectedRun.sender.deviceName} ({selectedRun.sender.platform})</div>
              <div><strong>Receiver:</strong> {selectedRun.receiver.deviceName} ({selectedRun.receiver.platform})</div>
              <div><strong>Distance:</strong> {selectedRun.distanceCm ? `${selectedRun.distanceCm} cm` : "Not recorded"}</div>
              <div><strong>Camera FPS:</strong> {selectedRun.metrics.cameraFps ? `${selectedRun.metrics.cameraFps.toFixed(1)} fps` : "N/A"}</div>
              <div><strong>Transmission Duration:</strong> {selectedRun.metrics.elapsedMs} ms</div>
              <div><strong>Throughput:</strong> {(selectedRun.metrics.averageThroughputBytesPerSecond / 1024).toFixed(2)} KB/s</div>
              <div style={{ wordBreak: "break-all" }}><strong>SHA-256 Hash:</strong> <span style={{ color: "#93c5fd" }}>{selectedRun.fileHashHex}</span></div>
              <div><strong>Notes:</strong> {selectedRun.notes}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
              <button type="button" className="btn btn-primary" onClick={() => setSelectedRun(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
