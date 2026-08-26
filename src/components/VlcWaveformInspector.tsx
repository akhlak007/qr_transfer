import React from "react";
import type { VlcModulationScheme, VlcDecodedFrame } from "../transports/vlc/vlc-framing";
import type { CalibrationResult } from "../transports/vlc/vlc-calibration";
import type { VlcDemodulationStatus } from "../transports/vlc/vlc-demodulator";
import type { RGBColor } from "../transports/vlc/vlc-modulator";
import { rgbToYuv } from "../transports/vlc/vlc-calibration";

export interface VlcWaveformSample {
  rgb: RGBColor;
  luminance: number;
  timestamp: number;
}

export interface VlcWaveformInspectorProps {
  modulation: VlcModulationScheme;
  calibration?: CalibrationResult | null;
  lastDecodedFrame?: VlcDecodedFrame | null;
  demodStatus?: VlcDemodulationStatus | "idle";
  samples?: VlcWaveformSample[];
  syncIndex?: number;
  droppedFramesCount?: number;
}

export const VlcWaveformInspector: React.FC<VlcWaveformInspectorProps> = ({
  modulation,
  calibration,
  lastDecodedFrame,
  demodStatus = "idle",
  samples = [],
  syncIndex = -1,
  droppedFramesCount = 0,
}) => {
  // Format modulation label
  const getModulationLabel = (scheme: VlcModulationScheme) => {
    switch (scheme) {
      case "ook":
        return "OOK (On-Off Keying · 1 bit/sym)";
      case "pam4":
        return "4-PAM (Pulse Amplitude · 2 bits/sym)";
      case "csk8":
        return "CSK-8 (Color-Shift Keying · 3 bits/sym)";
      case "csk16":
        return "CSK-16 (Color-Shift Keying · 4 bits/sym)";
    }
  };

  const getStatusBadge = (status: VlcDemodulationStatus | "idle") => {
    switch (status) {
      case "success":
        return <span className="badge-simulated" style={{ background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.4)" }}>DEMODULATED</span>;
      case "crc_failure":
        return <span className="badge-error">CRC MISMATCH</span>;
      case "sync_failure":
        return <span className="badge-error">SYNC LOST</span>;
      case "insufficient_quality":
        return <span className="badge-error">LOW QUALITY</span>;
      case "incomplete_frame":
        return <span className="badge-warning">INCOMPLETE</span>;
      case "unsupported_modulation":
        return <span className="badge-error">UNSUPPORTED</span>;
      case "idle":
      default:
        return <span className="badge-neutral">STANDBY</span>;
    }
  };

  const isColorMode = modulation === "csk8" || modulation === "csk16";
  const recentSamples = samples.slice(-40);

  return (
    <div className="vlc-inspector-card" style={{
      background: "var(--card-bg, #111827)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "12px",
      padding: "16px",
      marginTop: "16px",
      color: "#e5e7eb",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px", marginBottom: "16px" }}>
        <div>
          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em", color: "#f3f4f6", textTransform: "uppercase" }}>
            Experimental VLC Research Instrument
          </h4>
          <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#9ca3af" }}>
            Live optical waveform, constellation & calibration telemetry
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <span className="badge-warning" style={{ fontSize: "11px", padding: "3px 8px" }}>EXPERIMENTAL</span>
          <span className="badge-neutral" style={{ fontSize: "11px", padding: "3px 8px" }}>NOT PHYSICALLY TESTED</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: "10px",
        marginBottom: "16px",
      }}>
        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Demod Status</div>
          <div style={{ marginTop: "4px" }}>{getStatusBadge(demodStatus)}</div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Modulation</div>
          <div style={{ marginTop: "4px", fontSize: "12px", fontWeight: 600, color: "#93c5fd" }}>
            {modulation.toUpperCase()}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>CRC-16 Status</div>
          <div style={{ marginTop: "4px", fontSize: "12px", fontWeight: 600 }}>
            {lastDecodedFrame ? (
              lastDecodedFrame.isValidCrc ? (
                <span style={{ color: "#34d399" }}>VALID ✓</span>
              ) : (
                <span style={{ color: "#f87171" }}>MISMATCH ✕</span>
              )
            ) : (
              <span style={{ color: "#6b7280" }}>N/A</span>
            )}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Frame Seq</div>
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "#f9fafb" }}>
            {lastDecodedFrame ? `#${lastDecodedFrame.seqNumber}` : "N/A"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Dynamic Range</div>
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "#f9fafb" }}>
            {calibration ? `${calibration.dynamicRange.toFixed(0)} LSB` : "N/A"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Ambient Lux</div>
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "#f9fafb" }}>
            {calibration ? `${calibration.ambientLuminance.toFixed(0)}` : "N/A"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Exposure Sync</div>
          <div style={{ marginTop: "4px", fontSize: "12px", fontWeight: 600 }}>
            {calibration ? (
              calibration.isExposureStable ? (
                <span style={{ color: "#34d399" }}>STABLE</span>
              ) : (
                <span style={{ color: "#fbbf24" }}>UNSETTLED</span>
              )
            ) : (
              <span style={{ color: "#6b7280" }}>N/A</span>
            )}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Confidence</div>
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "#a78bfa" }}>
            {calibration ? `${(calibration.confidenceScore * 100).toFixed(0)}%` : "N/A"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Barker Sync Pos</div>
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: "#f9fafb" }}>
            {syncIndex >= 0 ? `Sym ${syncIndex}` : "N/A"}
          </div>
        </div>

        <div className="metric-box" style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" }}>Dropped Samples</div>
          <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 600, color: droppedFramesCount > 0 ? "#f87171" : "#9ca3af" }}>
            {droppedFramesCount}
          </div>
        </div>
      </div>

      {/* Waveform & Constellation Display Section */}
      <div style={{ display: "grid", gridTemplateColumns: isColorMode ? "1fr 1fr" : "1fr", gap: "12px" }}>
        {/* Optical Intensity Waveform */}
        <div style={{ background: "rgba(0, 0, 0, 0.35)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
            <span>OPTICAL INTENSITY WAVEFORM (LUMA 0..255)</span>
            <span>{recentSamples.length} samples</span>
          </div>

          <svg width="100%" height="90" viewBox="0 0 300 90" style={{ overflow: "visible" }}>
            {/* Grid & Threshold lines */}
            <line x1="0" y1="10" x2="300" y2="10" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
            <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />
            <line x1="0" y1="80" x2="300" y2="80" stroke="rgba(255,255,255,0.1)" strokeDasharray="2,2" />

            {/* Calibration Thresholds */}
            {calibration && (
              <line
                x1="0"
                y1={80 - (calibration.adaptiveThreshold / 255) * 70}
                x2="300"
                y2={80 - (calibration.adaptiveThreshold / 255) * 70}
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            )}

            {/* Sample Waveform Bars */}
            {recentSamples.map((sample, idx) => {
              const x = (idx / Math.max(1, recentSamples.length - 1)) * 290 + 5;
              const height = (sample.luminance / 255) * 70;
              const y = 80 - height;
              return (
                <g key={idx}>
                  <rect
                    x={x - 2}
                    y={y}
                    width="4"
                    height={Math.max(2, height)}
                    fill={isColorMode ? `rgb(${sample.rgb[0]},${sample.rgb[1]},${sample.rgb[2]})` : "#93c5fd"}
                    opacity="0.85"
                    rx="1"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* 2D Chromaticity Constellation for CSK */}
        {isColorMode && (
          <div style={{ background: "rgba(0, 0, 0, 0.35)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
              <span>2D YUV CHROMATICITY CONSTELLATION</span>
              <span>{modulation.toUpperCase()}</span>
            </div>

            <svg width="100%" height="90" viewBox="-130 -130 260 260" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "4px" }}>
              {/* Axes (U horizontal, V vertical) */}
              <line x1="-120" y1="0" x2="120" y2="0" stroke="rgba(255,255,255,0.15)" />
              <line x1="0" y1="-120" x2="0" y2="120" stroke="rgba(255,255,255,0.15)" />

              {/* Reference Centroids */}
              {(calibration ? (modulation === "csk8" ? calibration.calibratedPalette8 : calibration.calibratedPalette16) : []).map((color, cIdx) => {
                const yuv = rgbToYuv(color);
                return (
                  <circle
                    key={cIdx}
                    cx={yuv[1]}
                    cy={-yuv[2]} // Invert V for screen coords
                    r="6"
                    fill={`rgb(${color[0]},${color[1]},${color[2]})`}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* Observed Sample Points */}
              {recentSamples.map((sample, sIdx) => {
                const yuv = rgbToYuv(sample.rgb);
                return (
                  <circle
                    key={sIdx}
                    cx={yuv[1]}
                    cy={-yuv[2]}
                    r="3"
                    fill={`rgb(${sample.rgb[0]},${sample.rgb[1]},${sample.rgb[2]})`}
                    opacity="0.65"
                  />
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Footer / Scheme note */}
      <div style={{ marginTop: "12px", fontSize: "11px", color: "#6b7280", display: "flex", justifyContent: "space-between" }}>
        <span>Selected: {getModulationLabel(modulation)}</span>
        <span>CRC-16-CCITT Protected</span>
      </div>
    </div>
  );
};
