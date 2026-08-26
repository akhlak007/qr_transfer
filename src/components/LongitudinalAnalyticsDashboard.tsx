/**
 * Longitudinal Analytics & Trend Evolution Dashboard (Milestone 7D)
 *
 * Implements:
 * - Time-series trend analytics for physical optical screen-to-camera experiments
 * - Moving average progression (Success rate, Throughput, Stability, Distance)
 * - Multi-protocol and modulation filtering
 * - Strict non-fabrication guarantees: Only uses recorded physical runs
 *
 * NOTE: For physical optical research analytics.
 */

import React, { useState, useMemo } from "react";
import { TransportId } from "../core/transport";
import type { TestRun } from "../research/test-run";
import {
  analyzeLongitudinalTrends,
  TrendDirection,
  type LongitudinalTrendSummary,
} from "../research/longitudinal-analytics";

interface LongitudinalAnalyticsDashboardProps {
  runs: TestRun[];
}

export const LongitudinalAnalyticsDashboard: React.FC<LongitudinalAnalyticsDashboardProps> = ({ runs }) => {
  const [selectedTransport, setSelectedTransport] = useState<TransportId | "all">("all");
  const [selectedModulation, setSelectedModulation] = useState<string>("all");

  const trendSummary: LongitudinalTrendSummary = useMemo(() => {
    return analyzeLongitudinalTrends(runs, {
      transport: selectedTransport === "all" ? undefined : selectedTransport,
      modulation: selectedModulation === "all" ? undefined : selectedModulation,
    });
  }, [runs, selectedTransport, selectedModulation]);

  const getTrendBadge = (trend: TrendDirection) => {
    let bg = "#6b7280";
    if (trend === TrendDirection.IMPROVING) bg = "#059669";
    else if (trend === TrendDirection.DEGRADING) bg = "#dc2626";
    else if (trend === TrendDirection.STABLE) bg = "#2563eb";

    return (
      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: bg }}>
        {trend}
      </span>
    );
  };

  return (
    <div className="longitudinal-dashboard-container" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header & Filters */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">LONGITUDINAL RESEARCH TRENDS</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6" }}>
              TIME-SERIES ANALYTICS
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Optical Performance & Reliability Evolution
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Rolling moving averages and chronological stability trends derived strictly from real physical screen-to-camera test runs.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          {/* Transport Selector */}
          <select
            className="form-select"
            value={selectedTransport}
            onChange={(e) => setSelectedTransport(e.target.value as any)}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            <option value="all">All Protocols</option>
            <option value={TransportId.QR}>QR Baseline</option>
            <option value={TransportId.VLC}>VLC</option>
            <option value={TransportId.VisualOFDM}>Visual OFDM</option>
          </select>

          {/* Modulation Filter */}
          <select
            className="form-select"
            value={selectedModulation}
            onChange={(e) => setSelectedModulation(e.target.value)}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            <option value="all">All Modulations</option>
            <option value="ook">OOK</option>
            <option value="pam4">4-PAM</option>
            <option value="csk8">CSK-8</option>
            <option value="csk16">CSK-16</option>
            <option value="bpsk">BPSK</option>
            <option value="qpsk">QPSK</option>
            <option value="16qam">16-QAM</option>
          </select>
        </div>
      </div>

      {/* Top 4 Trend Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Success Rate Trend</span>
            {getTrendBadge(trendSummary.successRateTrend)}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#6ee7b7", marginTop: "4px" }}>
            {(trendSummary.overallSuccessRate * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Overall Success Rate
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Throughput Trend</span>
            {getTrendBadge(trendSummary.throughputTrend)}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#93c5fd", marginTop: "4px" }}>
            {trendSummary.overallAvgThroughputKbps} KB/s
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Average Optical Rate
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Stability Trend</span>
            {getTrendBadge(trendSummary.stabilityTrend)}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#c7d2fe", marginTop: "4px" }}>
            {trendSummary.timePoints.length > 0
              ? trendSummary.timePoints[trendSummary.timePoints.length - 1].stabilityScore
              : 0} / 100
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Recent Optical Stability
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Data Points</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#fef08a", marginTop: "4px" }}>
            {trendSummary.totalRuns}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {trendSummary.timePoints.length} Chronological Epochs
          </div>
        </div>
      </div>

      {/* Chronological Time-Series Table */}
      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
        <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
          Chronological Epochs & Moving Averages
        </h4>
        {trendSummary.timePoints.length === 0 ? (
          <div style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
            No physical test runs recorded matching the selected filter criteria.
          </div>
        ) : (
          <div className="research-table-wrapper" style={{ maxHeight: "280px", overflowY: "auto" }}>
            <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Runs</th>
                  <th>Success %</th>
                  <th>Rolling Success %</th>
                  <th>Avg Throughput</th>
                  <th>Rolling Throughput</th>
                  <th>Avg Distance</th>
                  <th>Stability</th>
                </tr>
              </thead>
              <tbody>
                {trendSummary.timePoints.map((tp, idx) => (
                  <tr key={tp.dateStr}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{tp.dateStr}</td>
                    <td>{tp.totalRuns} ({tp.successfulRuns} ✓)</td>
                    <td>{(tp.successRate * 100).toFixed(0)}%</td>
                    <td style={{ color: "#6ee7b7", fontWeight: 600 }}>
                      {(trendSummary.rollingSuccessRates[idx] * 100).toFixed(0)}%
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {tp.avgThroughputKbps > 0 ? `${tp.avgThroughputKbps} KB/s` : "-"}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "#93c5fd", fontWeight: 600 }}>
                      {trendSummary.rollingThroughputsKbps[idx] > 0
                        ? `${trendSummary.rollingThroughputsKbps[idx]} KB/s`
                        : "-"}
                    </td>
                    <td>{tp.avgDistanceCm !== null ? `${tp.avgDistanceCm} cm` : "-"}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{tp.stabilityScore}</span> / 100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
