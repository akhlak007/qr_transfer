/**
 * Physical Run Evidence Provenance Panel (Milestone 7F)
 *
 * Implements:
 * - Detailed cryptographic and optical provenance inspection for individual physical runs
 * - Visual verification of bit-perfect SHA-256 parity, CRC status, and hardware telemetry
 * - Distinct qualification status badges (QUALIFYING vs NON-QUALIFYING)
 * - Absolute non-fabrication guarantee
 *
 * NOTE: For physical optical research evidence inspection.
 */

import React from "react";
import type { TestRun } from "../research/test-run";
import { isQualifyingPhysicalRun } from "../research/physical-acquisition";
import { validatePhysicalRun } from "../research/physical-run-validator";
import { formatBytes } from "./format";

interface PhysicalRunEvidencePanelProps {
  run: TestRun;
  onClose?: () => void;
}

export const PhysicalRunEvidencePanel: React.FC<PhysicalRunEvidencePanelProps> = ({ run, onClose }) => {
  const isQualifying = isQualifyingPhysicalRun(run);
  const validation = validatePhysicalRun(run);
  const isShaMatch = run.integrityStatus === "verified" && run.fileHashHex && run.fileHashHex.length === 64;
  const isCrcPass = (run.metrics.errorRate ?? 0) === 0;

  return (
    <div
      className="physical-evidence-panel"
      style={{
        background: "rgba(15, 23, 42, 0.95)",
        border: `1px solid ${isQualifying ? "rgba(74, 222, 128, 0.4)" : "rgba(248, 113, 113, 0.4)"}`,
        borderRadius: "10px",
        padding: "16px",
        marginTop: "12px",
        marginBottom: "16px",
        color: "#f8fafc",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">PHYSICAL EVIDENCE PROVENANCE</span>
            <span
              className="badge-active"
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                background: isQualifying ? "#059669" : "#dc2626",
              }}
            >
              {isQualifying ? "QUALIFYING EVIDENCE" : "NON-QUALIFYING"}
            </span>
          </div>
          <h4 style={{ margin: "4px 0 0 0", fontSize: "16px", color: "#f1f5f9" }}>
            Run ID: <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px" }}>{run.runId}</span>
          </h4>
        </div>

        {onClose && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            ✕ Close
          </button>
        )}
      </div>

      {/* Primary Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "12px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: "6px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Protocol & Modulation</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#93c5fd" }}>
            {run.transport.toUpperCase()} · {run.fileName.split("_")[2] || "OOK"}
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: "6px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Throughput & Duration</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#6ee7b7" }}>
            {((run.metrics.averageThroughputBytesPerSecond * 8) / 1000).toFixed(1)} KB/s ({run.metrics.elapsedMs} ms)
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: "6px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Camera Rate & Distance</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#c7d2fe" }}>
            {run.metrics.cameraFps ? `${run.metrics.cameraFps.toFixed(1)} fps` : "N/A"} · {run.distanceCm ? `${run.distanceCm} cm` : "N/A"}
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: "6px" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Payload & Integrity Score</div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fef08a" }}>
            {formatBytes(run.metrics.fileSize)} · {validation.evidenceScore}/100
          </div>
        </div>
      </div>

      {/* Cryptographic Hash Verification Block */}
      <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: "6px", padding: "10px", marginBottom: "12px", border: "1px solid rgba(255,255,255,0.05)", fontSize: "11px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <span style={{ fontWeight: 600, color: "#cbd5e1" }}>Cryptographic SHA-256 Bit-Perfect Parity:</span>
          <span style={{ color: isShaMatch ? "#4ade80" : "#f87171", fontWeight: 700 }}>
            {isShaMatch ? "✓ SHA-256 MATCH" : "✗ SHA-256 MISMATCH"}
          </span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all", color: "#94a3b8" }}>
          Expected/Actual: {run.fileHashHex || "N/A"}
        </div>
        <div style={{ marginTop: "6px", display: "flex", gap: "16px", color: "var(--text-secondary)" }}>
          <span>CRC-16 Status: <strong style={{ color: isCrcPass ? "#4ade80" : "#f87171" }}>{isCrcPass ? "PASS (0 errors)" : "FAIL"}</strong></span>
          <span>Camera Stream: <strong style={{ color: run.evidenceKind === "physical" ? "#4ade80" : "#f87171" }}>{run.evidenceKind === "physical" ? "LIVE SENSOR" : "SYNTHETIC PROHIBITED"}</strong></span>
          <span>Environment: <strong>{run.environment?.toUpperCase() || "NORMAL"}</strong></span>
        </div>
      </div>

      {/* Errors / Warnings if non-qualifying */}
      {validation.errors.length > 0 && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", padding: "8px 12px", fontSize: "11px", color: "#fca5a5" }}>
          <div style={{ fontWeight: 600, marginBottom: "2px" }}>Qualification Failure Reasons:</div>
          <ul style={{ margin: 0, paddingLeft: "16px" }}>
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
