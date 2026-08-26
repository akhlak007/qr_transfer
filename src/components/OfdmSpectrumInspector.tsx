/**
 * Visual OFDM Spectrum & Constellation Inspector (Milestone 4D)
 *
 * Research-oriented live telemetry instrument for spatial frequency-domain optical communication.
 *
 * Displays:
 * - 2D Subcarrier spatial-frequency grid allocation (DC, Pilots, Data, Guards)
 * - 1D/2D Constellation plot (BPSK & QPSK)
 * - Pilot synchronization confidence and channel gain
 * - Estimated SNR (dB) and BER
 * - Subcarrier utilization efficiency
 * - CRC status and demodulation state
 *
 * NOTE: Explicitly designated as an Experimental Research Instrument (Not Physically Tested).
 */

import React, { useRef, useEffect } from "react";
import type { OfdmModulationScheme, SubcarrierGridMap } from "../transports/ofdm/ofdm-framing";
import type { OfdmDemodulationReport } from "../transports/ofdm/ofdm-demodulator";
import type { ComplexSymbol } from "../transports/ofdm/ofdm-modulator";
import { calculateCarrierUtilization } from "../transports/ofdm/ofdm-metrics";

export interface OfdmSpectrumInspectorProps {
  modulation?: OfdmModulationScheme;
  gridSize?: number;
  report?: OfdmDemodulationReport | null;
  observedSymbols?: ComplexSymbol[] | null;
  gridMap?: SubcarrierGridMap | null;
}

export const OfdmSpectrumInspector: React.FC<OfdmSpectrumInspectorProps> = ({
  modulation = "bpsk",
  gridSize = 16,
  report = null,
  observedSymbols = null,
  gridMap = null,
}) => {
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const constellationCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Draw 2D Subcarrier Allocation Grid
  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const N = gridSize;
    const cellW = width / N;
    const cellH = height / N;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const linearIdx = r * N + c;
        const carrier = gridMap?.carriers[linearIdx];

        if (r === 0 && c === 0) {
          ctx.fillStyle = "#f59e0b"; // DC Amber
        } else if (carrier?.type === "pilot") {
          ctx.fillStyle = "#38bdf8"; // Pilot Cyan
        } else if (carrier?.type === "guard") {
          ctx.fillStyle = "#334155"; // Guard Slate
        } else {
          // Data carrier: color by received energy if available
          const sym = observedSymbols ? observedSymbols[linearIdx] : null;
          if (sym) {
            const energy = Math.min(1.0, Math.abs(sym.real));
            ctx.fillStyle = energy > 0.6 ? "#10b981" : "#059669"; // Green
          } else {
            ctx.fillStyle = "#6366f1"; // Indigo default
          }
        }

        ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
      }
    }
  }, [gridSize, gridMap, observedSymbols]);

  // 2. Draw Constellation Diagram
  useEffect(() => {
    const canvas = constellationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Coordinate grid axes
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    // Scale factor
    const scale = (width / 2) * 0.45;

    // Draw Reference Constellation points
    ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
    if (modulation === "bpsk") {
      for (const val of [-1.0, 1.0]) {
        ctx.beginPath();
        ctx.arc(cx + val * scale, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (modulation === "qpsk") {
      for (const val of [-1.3416, -0.4472, 0.4472, 1.3416]) {
        ctx.beginPath();
        ctx.arc(cx + val * scale, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (modulation === "16qam") {
      const qamNorm = Math.sqrt(85);
      for (let k = 0; k < 16; k++) {
        const val = (2 * k - 15) / qamNorm;
        ctx.beginPath();
        ctx.arc(cx + val * scale, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Observed Received Symbols
    if (observedSymbols && gridMap) {
      ctx.fillStyle = "#38bdf8";
      for (const dIdx of gridMap.dataIndices) {
        const sym = observedSymbols[dIdx];
        if (!sym) continue;
        const px = cx + sym.real * scale;
        const py = cy - sym.imag * scale;

        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [modulation, observedSymbols, gridMap]);

  const snr = report?.estimatedSnrDb !== undefined ? `${report.estimatedSnrDb.toFixed(1)} dB` : "N/A";
  const ber = report?.estimatedBer !== undefined ? (report.estimatedBer === 0 ? "0.000 (Bit-Perfect)" : report.estimatedBer.toFixed(4)) : "N/A";
  const syncConf = report?.sync ? `${(report.sync.confidence * 100).toFixed(0)}%` : "N/A";
  const channelGain = report?.sync ? report.sync.channelGain.toFixed(2) : "N/A";
  const dataCarriers = gridMap ? gridMap.dataIndices.length : "N/A";
  const totalCarriers = gridSize * gridSize;
  const utilPercent = gridMap ? `${calculateCarrierUtilization(gridMap.dataIndices.length, totalCarriers).toFixed(1)}%` : "N/A";
  const crcStatus = report?.frame ? (report.frame.isValidCrc ? "VALID (Pass)" : "MISMATCH (Fail)") : "N/A";
  const seqNum = report?.frame ? `#${report.frame.seqNumber}` : "N/A";
  const demStatus = report?.status ? report.status.toUpperCase() : "IDLE / STANDBY";

  return (
    <div className="vlc-inspector-container" style={{ marginTop: "16px" }}>
      {/* Header with Strict Research Badges */}
      <div className="vlc-inspector-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            Visual OFDM Spectrum & Constellation Inspector
          </span>
          <span className="badge-warning" style={{ fontSize: "10px", padding: "2px 6px" }}>
            EXPERIMENTAL
          </span>
          <span className="badge-neutral" style={{ fontSize: "10px", padding: "2px 6px" }}>
            NOT PHYSICALLY TESTED
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          Modulation: <strong>{modulation.toUpperCase()}</strong> ({gridSize}×{gridSize} Grid)
        </span>
      </div>

      <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "12px" }}>
        Real-time spatial frequency-domain telemetry. Measurements derived from synthetic optical channel.
      </div>

      {/* Visualizers Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        {/* 2D Subcarrier Grid */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px", display: "flex", justifyContent: "space-between" }}>
            <span>2D Subcarrier Allocation Grid</span>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{gridSize}×{gridSize} ({totalCarriers} tones)</span>
          </div>
          <canvas
            ref={gridCanvasRef}
            width={200}
            height={200}
            style={{ width: "100%", height: "160px", borderRadius: "4px", display: "block" }}
          />
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: "10px", marginTop: "6px", color: "var(--text-secondary)" }}>
            <span><span style={{ color: "#f59e0b" }}>■</span> DC</span>
            <span><span style={{ color: "#38bdf8" }}>■</span> Pilot</span>
            <span><span style={{ color: "#10b981" }}>■</span> Data</span>
            <span><span style={{ color: "#334155" }}>■</span> Guard</span>
          </div>
        </div>

        {/* Constellation Diagram */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px", display: "flex", justifyContent: "space-between" }}>
            <span>{modulation.toUpperCase()} Constellation</span>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Decision Slices</span>
          </div>
          <canvas
            ref={constellationCanvasRef}
            width={200}
            height={200}
            style={{ width: "100%", height: "160px", borderRadius: "4px", display: "block" }}
          />
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: "10px", marginTop: "6px", color: "var(--text-secondary)" }}>
            <span><span style={{ color: "rgba(148, 163, 184, 0.6)" }}>●</span> Target</span>
            <span><span style={{ color: "#38bdf8" }}>●</span> Equalized Symbol</span>
          </div>
        </div>
      </div>

      {/* Telemetry Dashboard Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "11px" }}>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Estimated SNR</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>{snr}</div>
        </div>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Estimated BER</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>{ber}</div>
        </div>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Pilot Sync Confidence</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>{syncConf}</div>
        </div>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Channel Gain</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>{channelGain}</div>
        </div>

        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Data Carriers</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>{dataCarriers} / {totalCarriers}</div>
        </div>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Carrier Efficiency</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>{utilPercent}</div>
        </div>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>CRC-16 Status</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px", color: report?.frame?.isValidCrc ? "#10b981" : "inherit" }}>
            {crcStatus}
          </div>
        </div>
        <div className="telemetry-card" style={{ background: "rgba(0,0,0,0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-secondary)" }}>Demod Status / Seq</div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "2px" }}>
            {demStatus} ({seqNum})
          </div>
        </div>
      </div>
    </div>
  );
};
