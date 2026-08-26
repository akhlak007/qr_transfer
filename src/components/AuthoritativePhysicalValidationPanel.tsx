/**
 * Phase 11: Authoritative Physical Validation Dashboard Panel
 *
 * Implements:
 * - Real hardware screen-to-camera optical validation dashboard HUD
 * - Live camera state, identifier, resolution, and FPS diagnostics
 * - Real-time optical signal diagnostics, symbol lock, valid/corrupt/dropped counters
 * - Transport CRC state (valid / invalid / not-applicable) and reconstruction progress
 * - Cryptographic SHA-256 equality verification and verificationType: PHYSICAL badge
 * - Authoritative physical validation status: EXPERIMENTAL | FAILED | PHYSICAL_VALIDATED | PHYSICAL_VERIFIED
 * - One-click export of authoritative Markdown, JSON, and CSV records
 *
 * NOTE: Strictly adheres to 2026-08-26-phase-11-physical-optical-validation-design.md.
 */

import React, { useState, useMemo } from "react";
import { TransportId } from "../core/transport";
import type {
  PhysicalValidationRecord,
  ProtocolConfiguration,
} from "../research/physical-validation-evidence";
import {
  evaluatePhysicalValidationStatus,
  generatePhysicalValidationMarkdown,
  generatePhysicalValidationJson,
  generatePhysicalValidationCsv,
} from "../research/physical-validation-evidence";
import type { PhysicalValidationTelemetry } from "../research/physical-validation-session";
import { PhysicalValidationExecutionModal } from "./PhysicalValidationExecutionModal";

interface AuthoritativePhysicalValidationPanelProps {
  records?: PhysicalValidationRecord[];
  activeTelemetry?: PhysicalValidationTelemetry | null;
  activeConfig?: ProtocolConfiguration;
  onStartSession?: () => void;
  onCancelSession?: () => void;
  onRunRecorded?: (record: PhysicalValidationRecord) => void;
}

export const AuthoritativePhysicalValidationPanel: React.FC<AuthoritativePhysicalValidationPanelProps> = ({
  records = [],
  activeTelemetry,
  activeConfig = { transport: TransportId.VLC, vlcModulation: "ook" },
  onStartSession,
  onCancelSession,
  onRunRecorded,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState<TransportId>(activeConfig.transport);
  const [selectedVlcModulation, setSelectedVlcModulation] = useState(activeConfig.vlcModulation || "ook");
  const [selectedOfdmModulation, setSelectedOfdmModulation] = useState(activeConfig.ofdmModulation || "bpsk");
  const [selectedOfdmGridSize, setSelectedOfdmGridSize] = useState(activeConfig.ofdmGridSize || 16);

  const currentConfig: ProtocolConfiguration = useMemo(() => ({
    transport: selectedTransport,
    vlcModulation: selectedTransport === TransportId.VLC ? selectedVlcModulation : undefined,
    ofdmModulation: selectedTransport === TransportId.VisualOFDM ? selectedOfdmModulation : undefined,
    ofdmGridSize: selectedTransport === TransportId.VisualOFDM ? selectedOfdmGridSize : undefined,
  }), [selectedTransport, selectedVlcModulation, selectedOfdmModulation, selectedOfdmGridSize]);

  // Evaluate authoritative physical validation status
  const evaluation = useMemo(() => {
    return evaluatePhysicalValidationStatus(records, currentConfig);
  }, [records, currentConfig]);

  const handleExportMarkdown = () => {
    const md = generatePhysicalValidationMarkdown(records, evaluation);
    downloadFile(md, `physical_optical_validation_report_${Date.now()}.md`, "text/markdown");
  };

  const handleExportJson = () => {
    const json = generatePhysicalValidationJson(records, evaluation);
    downloadFile(json, `physical_optical_validation_${Date.now()}.json`, "application/json");
  };

  const handleExportCsv = () => {
    const csv = generatePhysicalValidationCsv(records);
    downloadFile(csv, `physical_optical_validation_ledger_${Date.now()}.csv`, "text/csv");
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "PHYSICAL_VERIFIED":
        return "#059669"; // Green
      case "PHYSICAL_VALIDATED":
        return "#2563eb"; // Blue
      case "FAILED":
        return "#dc2626"; // Red
      default:
        return "#d97706"; // Amber
    }
  };

  return (
    <div
      className="authoritative-physical-panel"
      style={{
        background: "rgba(15, 23, 42, 0.75)",
        borderRadius: "12px",
        padding: "20px",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        color: "#f8fafc",
        marginBottom: "24px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "1px", fontWeight: 700, color: "#60a5fa" }}>
              PHASE 11 AUTHORITATIVE VALIDATION
            </span>
            <span
              style={{
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(37, 99, 235, 0.2)",
                color: "#93c5fd",
                border: "1px solid #3b82f6",
                fontWeight: 600,
              }}
            >
              verificationType: PHYSICAL
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#ffffff" }}>
            Authoritative Physical Optical Validation
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
            Real screen-to-camera optical pipeline. Strictly separates physical hardware observations from software simulations.
          </p>
        </div>

        {/* Global Authoritative Status Badge */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 800,
              padding: "6px 14px",
              borderRadius: "6px",
              background: getStatusBadgeColor(evaluation.status),
              color: "#ffffff",
              display: "inline-block",
              letterSpacing: "0.5px",
            }}
          >
            {evaluation.status}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            Qualifying Runs: {evaluation.independentRunCount} / 3 required for VERIFIED
          </div>
        </div>
      </div>

      {/* Configuration Selector */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          background: "rgba(30, 41, 59, 0.6)",
          padding: "14px",
          borderRadius: "8px",
          marginBottom: "16px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div>
          <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
            Target Optical Transport
          </label>
          <select
            value={selectedTransport}
            onChange={(e) => setSelectedTransport(e.target.value as TransportId)}
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            <option value={TransportId.QR}>QR Streaming (Baseline)</option>
            <option value={TransportId.VLC}>Visible Light Communication (VLC OOK)</option>
            <option value={TransportId.VisualOFDM}>Visual OFDM (Spatial Modulation)</option>
          </select>
        </div>

        {selectedTransport === TransportId.VLC && (
          <div>
            <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
              VLC Modulation
            </label>
            <select
              value={selectedVlcModulation}
              onChange={(e) => setSelectedVlcModulation(e.target.value as any)}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "#0f172a",
                color: "#f8fafc",
                border: "1px solid #475569",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              <option value="ook">On-Off Keying (OOK - 1 bit/sym)</option>
            </select>
          </div>
        )}

        {selectedTransport === TransportId.VisualOFDM && (
          <>
            <div>
              <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                OFDM Constellation
              </label>
              <select
                value={selectedOfdmModulation}
                onChange={(e) => setSelectedOfdmModulation(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  background: "#0f172a",
                  color: "#f8fafc",
                  border: "1px solid #475569",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                <option value="bpsk">BPSK (1 bit/cell)</option>
                <option value="qpsk">QPSK (2 bits/cell)</option>
                <option value="16qam">16-QAM (4 bits/cell)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                Grid Size
              </label>
              <select
                value={selectedOfdmGridSize}
                onChange={(e) => setSelectedOfdmGridSize(Number(e.target.value) as any)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  background: "#0f172a",
                  color: "#f8fafc",
                  border: "1px solid #475569",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                <option value={8}>8x8 Subcarrier Grid</option>
                <option value={16}>16x16 Subcarrier Grid</option>
                <option value={32}>32x32 Subcarrier Grid</option>
              </select>
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
          {onStartSession && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStartSession}
              style={{
                flex: 1,
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                background: "#2563eb",
                color: "#fff",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
              }}
            >
              ▶ Start Physical Run
            </button>
          )}
          {onCancelSession && activeTelemetry && activeTelemetry.state === "capturing" && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={onCancelSession}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                background: "#dc2626",
                color: "#fff",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
              }}
            >
              ⏹ Cancel
            </button>
          )}
        </div>
      </div>

      {/* Live Telemetry HUD (When active) */}
      {activeTelemetry && (
        <div
          style={{
            background: "rgba(30, 58, 138, 0.25)",
            border: "1px solid rgba(96, 165, 250, 0.4)",
            borderRadius: "8px",
            padding: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#93c5fd" }}>
              LIVE HARDWARE TELEMETRY · State: <span style={{ color: "#fff" }}>{activeTelemetry.state.toUpperCase()}</span>
            </span>
            <span style={{ fontSize: "12px", color: "#cbd5e1" }}>
              Elapsed: {(activeTelemetry.elapsedMs / 1000).toFixed(1)}s · FPS: {activeTelemetry.cameraFps.toFixed(1)}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>Captured Frames</div>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{activeTelemetry.capturedFramesCount}</div>
            </div>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>Valid / Corrupt</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: activeTelemetry.corruptFramesCount > 0 ? "#f87171" : "#4ade80" }}>
                {activeTelemetry.validFramesCount} / {activeTelemetry.corruptFramesCount}
              </div>
            </div>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>Transport CRC</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: activeTelemetry.crcStatus === "valid" ? "#4ade80" : activeTelemetry.crcStatus === "invalid" ? "#f87171" : "#94a3b8" }}>
                {activeTelemetry.crcStatus.toUpperCase()}
              </div>
            </div>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>Reconstruction</div>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{(activeTelemetry.reconstructionProgress * 100).toFixed(0)}%</div>
            </div>
            <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "8px", borderRadius: "6px" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>SHA-256 Equality</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: activeTelemetry.sha256Matched ? "#4ade80" : "#fbbf24" }}>
                {activeTelemetry.sha256Matched ? "MATCHED" : activeTelemetry.reconstructionCompleted ? "MISMATCH" : "PENDING"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Actions & Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          Target Status: <strong style={{ color: "#fff" }}>{evaluation.status}</strong> · Total Qualifying Physical Records: <strong style={{ color: "#fff" }}>{evaluation.validatingRunCount}</strong>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: "5px 12px",
              fontSize: "11px",
              fontWeight: 700,
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            🔬 Open Execution Workbench
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportMarkdown}
            style={{
              padding: "5px 10px",
              fontSize: "11px",
              background: "#334155",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            📄 Export Markdown
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportJson}
            style={{
              padding: "5px 10px",
              fontSize: "11px",
              background: "#334155",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            JSON
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCsv}
            style={{
              padding: "5px 10px",
              fontSize: "11px",
              background: "#334155",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            CSV
          </button>
        </div>
      </div>

      {/* Phase 12 Interactive Operator Execution Workbench Modal */}
      <PhysicalValidationExecutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        existingRecords={records}
        onRunRecorded={(rec) => {
          onRunRecorded?.(rec);
        }}
      />
    </div>
  );
};

