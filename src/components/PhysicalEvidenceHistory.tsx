/**
 * Immutable Physical Evidence History Component (Milestone 7G)
 *
 * Implements:
 * - Immutable view of all recorded physical runs in the IndexedDB ledger
 * - Multi-dimensional filtering: Qualifying, Failed, VLC, Visual OFDM, Date
 * - Cryptographic seal and camera sensor provenance display
 * - Zero delete actions: Preserves all experimental attempts immutably
 *
 * NOTE: For physical optical research history inspection.
 */

import React, { useState, useMemo } from "react";
import type { TestRun } from "../research/test-run";
import { TransportId } from "../core/transport";
import { isQualifyingPhysicalRun } from "../research/physical-acquisition";

interface PhysicalEvidenceHistoryProps {
  runs: TestRun[];
  onSelectRun?: (run: TestRun) => void;
}

export const PhysicalEvidenceHistory: React.FC<PhysicalEvidenceHistoryProps> = ({
  runs,
  onSelectRun,
}) => {
  const [filterType, setFilterType] = useState<"all" | "qualifying" | "failed" | "vlc" | "ofdm">("all");

  const physicalRuns = useMemo(() => {
    return runs.filter((r) => r.evidenceKind === "physical");
  }, [runs]);

  const filteredRuns = useMemo(() => {
    return physicalRuns.filter((r) => {
      const isQualifying = isQualifyingPhysicalRun(r);
      if (filterType === "qualifying") return isQualifying;
      if (filterType === "failed") return !isQualifying;
      if (filterType === "vlc") return r.transport === TransportId.VLC;
      if (filterType === "ofdm") return r.transport === TransportId.VisualOFDM;
      return true;
    });
  }, [physicalRuns, filterType]);

  return (
    <div className="physical-evidence-history" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Header & Filter Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">IMMUTABLE PHYSICAL LEDGER</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#3b82f6" }}>
              {physicalRuns.length} PHYSICAL RUNS RECORDED
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Physical Screen-to-Camera Evidence History
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Complete immutable ledger of all real hardware attempts. Failed runs are permanently preserved for scientific integrity.
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { id: "all", label: `All (${physicalRuns.length})` },
            { id: "qualifying", label: `Qualifying (${physicalRuns.filter(isQualifyingPhysicalRun).length})` },
            { id: "failed", label: `Failed (${physicalRuns.filter((r) => !isQualifyingPhysicalRun(r)).length})` },
            { id: "vlc", label: "VLC" },
            { id: "ofdm", label: "Visual OFDM" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn ${filterType === f.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterType(f.id as any)}
              style={{ fontSize: "11px", padding: "4px 8px" }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Evidence Runs Table */}
      {filteredRuns.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
          No physical runs matching the selected filter criteria. Connect a real camera in the Workbench or Live Acquisition tab to record live screen-to-camera trials.
        </div>
      ) : (
        <div className="research-table-wrapper" style={{ maxHeight: "400px", overflowY: "auto" }}>
          <table className="research-table" style={{ width: "100%", fontSize: "12px" }}>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Timestamp</th>
                <th>Protocol</th>
                <th>Camera Sensor</th>
                <th>Distance / Lux</th>
                <th>Throughput</th>
                <th>CRC</th>
                <th>SHA-256</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((r) => {
                const isQualifying = isQualifyingPhysicalRun(r);
                const isShaMatch = r.integrityStatus === "verified";
                const isCrcPass = (r.metrics.errorRate ?? 0) === 0;

                return (
                  <tr
                    key={r.runId}
                    onClick={() => onSelectRun?.(r)}
                    style={{ cursor: onSelectRun ? "pointer" : "default" }}
                  >
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{r.runId.slice(0, 12)}…</td>
                    <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {r.transport.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: "11px" }}>
                      {r.receiver.deviceName} ({r.metrics.cameraFps ? `${r.metrics.cameraFps.toFixed(0)} fps` : "N/A"})
                    </td>
                    <td>
                      {r.distanceCm ? `${r.distanceCm} cm` : "-"} · {r.environment?.toUpperCase() || "NORMAL"}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {isQualifying
                        ? `${((r.metrics.averageThroughputBytesPerSecond * 8) / 1000).toFixed(1)} KB/s`
                        : "-"}
                    </td>
                    <td>
                      <span style={{ color: isCrcPass ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                        {isCrcPass ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: isShaMatch ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                        {isShaMatch ? "MATCH" : "MISMATCH"}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${isQualifying ? "tag-verified" : "tag-failed"}`}>
                        {isQualifying ? "QUALIFYING" : "FAILED"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
