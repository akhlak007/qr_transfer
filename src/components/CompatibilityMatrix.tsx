import React from "react";
import type { TestRun } from "../research/test-run";
import { TransportId } from "../core/transport";
import { compatibilityStatus, type CompatibilityStatus } from "../compatibility/compatibility-validation";
import type { MobileDirection } from "../compatibility/compatibility-record";

interface CompatibilityMatrixProps {
  runs: TestRun[];
  transport?: TransportId;
}

interface DirectionCell {
  direction: MobileDirection;
  label: string;
  from: string;
  to: string;
}

const MATRIX_CELLS: DirectionCell[] = [
  { direction: "android-to-android", label: "Android → Android", from: "Android", to: "Android" },
  { direction: "android-to-iphone", label: "Android → iPhone", from: "Android", to: "iPhone" },
  { direction: "iphone-to-android", label: "iPhone → Android", from: "iPhone", to: "Android" },
  { direction: "iphone-to-iphone", label: "iPhone → iPhone", from: "iPhone", to: "iPhone" },
];

export const CompatibilityMatrix: React.FC<CompatibilityMatrixProps> = ({
  runs,
  transport = TransportId.QR,
}) => {
  const getStatusBadge = (status: CompatibilityStatus, direction: MobileDirection) => {
    // Find matching physical and simulated runs for provenance
    const matchingPhysicalRuns = runs.filter(
      (r) =>
        r.status === "complete" &&
        r.evidenceKind === "physical" &&
        r.transport === transport &&
        ((direction === "android-to-android" && r.sender.platform === "android" && r.receiver.platform === "android") ||
          (direction === "android-to-iphone" && r.sender.platform === "android" && r.receiver.platform === "iphone") ||
          (direction === "iphone-to-android" && r.sender.platform === "iphone" && r.receiver.platform === "android") ||
          (direction === "iphone-to-iphone" && r.sender.platform === "iphone" && r.receiver.platform === "iphone"))
    );

    const matchingSimulatedRuns = runs.filter(
      (r) =>
        r.status === "complete" &&
        r.evidenceKind === "simulated" &&
        r.transport === transport &&
        ((direction === "android-to-android" && r.sender.platform === "android" && r.receiver.platform === "android") ||
          (direction === "android-to-iphone" && r.sender.platform === "android" && r.receiver.platform === "iphone") ||
          (direction === "iphone-to-android" && r.sender.platform === "iphone" && r.receiver.platform === "android") ||
          (direction === "iphone-to-iphone" && r.sender.platform === "iphone" && r.receiver.platform === "iphone"))
    );

    if (status === "verified" && matchingPhysicalRuns.length >= 3) {
      return (
        <div className="compat-cell compat-verified" title={`Physically verified by ${matchingPhysicalRuns.length} physical test runs`}>
          <span className="compat-icon">✓</span>
          <span className="compat-text">PHYSICALLY VERIFIED</span>
          <span className="compat-count">({matchingPhysicalRuns.length} physical runs)</span>
        </div>
      );
    }

    if (status === "failed" || matchingPhysicalRuns.some((r) => r.integrityStatus === "mismatch")) {
      return (
        <div className="compat-cell compat-failed" title={`Failed in physical test runs`}>
          <span className="compat-icon">✕</span>
          <span className="compat-text">PHYSICAL FAILURE RECORDED</span>
          <span className="compat-count">({matchingPhysicalRuns.length} runs)</span>
        </div>
      );
    }

    if (matchingPhysicalRuns.length > 0 && matchingPhysicalRuns.length < 3) {
      return (
        <div className="compat-cell compat-untested" style={{ borderColor: "#fbbf24", color: "#fbbf24" }} title="Insufficient physical evidence (< 3 verified runs)">
          <span className="compat-icon">⚠</span>
          <span className="compat-text">INSUFFICIENT EVIDENCE</span>
          <span className="compat-count">({matchingPhysicalRuns.length}/3 physical runs)</span>
        </div>
      );
    }

    if (matchingSimulatedRuns.length > 0) {
      return (
        <div className="compat-cell compat-simulated" title={`Simulated evidence only (${matchingSimulatedRuns.length} runs)`}>
          <span className="compat-icon">⚗</span>
          <span className="compat-text">SIMULATED ONLY</span>
          <span className="compat-count">({matchingSimulatedRuns.length} sim runs)</span>
        </div>
      );
    }

    return (
      <div className="compat-cell compat-untested" title="No qualifying physical screen-to-camera runs recorded">
        <span className="compat-icon">○</span>
        <span className="compat-text">NOT TESTED</span>
        <span className="compat-count">(0 physical runs)</span>
      </div>
    );
  };

  return (
    <div className="compat-matrix-container">
      <div className="compat-matrix-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>
            Directional Mobile Compatibility Matrix ({
              transport === TransportId.VisualOFDM
                ? "Visual OFDM Prototype"
                : transport === TransportId.VLC
                ? "VLC Prototype"
                : "QR Streaming"
            })
          </div>
          {transport === TransportId.QR ? (
            <span className="badge-active" style={{ fontSize: "11px", padding: "2px 8px" }}>QR VERIFIED BASELINE</span>
          ) : (
            <span className="badge-neutral" style={{ fontSize: "11px", padding: "2px 8px" }}>
              {transport === TransportId.VisualOFDM ? "OFDM NOT PHYSICALLY TESTED" : "VLC NOT PHYSICALLY TESTED"}
            </span>
          )}
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
          {transport === TransportId.VisualOFDM
            ? "Visual OFDM spatial-frequency compatibility is unverified on physical hardware. Synthetic channel tests do not constitute physical camera proof."
            : transport === TransportId.VLC
            ? "VLC physical cross-device compatibility is unverified. Synthetic simulation does not constitute physical device proof."
            : "Strict evidence-backed validation. One direction does not verify the reverse."}
        </div>
      </div>

      <div className="compat-grid">
        {MATRIX_CELLS.map((cell) => {
          const status = compatibilityStatus(runs, cell.direction, transport);
          return (
            <div key={cell.direction} className="compat-card">
              <div className="compat-card-label">
                <span className="compat-platform-from">{cell.from}</span>
                <span className="compat-arrow">→</span>
                <span className="compat-platform-to">{cell.to}</span>
              </div>
              <div className="compat-card-body">{getStatusBadge(status, cell.direction)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
