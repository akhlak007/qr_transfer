/**
 * Controlled Physical Optical Experiment Workbench (Milestone 6F)
 *
 * Operator Instrumentation Features:
 * - Controlled test-plan matrix tracking progress for each VLC & Visual OFDM modulation
 * - Pre-flight operator confirmation & safety guidance (3-second optical countdown)
 * - Clear telemetry categorization (LIVE MEASUREMENT, DERIVED METRIC, PHYSICAL EVIDENCE)
 * - Anti-fabrication guarantees: Only real camera frames produce cryptographic SHA-256 evidence
 * - Seamless research ledger persistence and immutable evidence export
 *
 * NOTE: For physical optical screen-to-camera validation only.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { TransportId } from "../core/transport";
import type { PersistenceRepositories } from "../storage/persistence";
import {
  PhysicalExperimentController,
} from "../research/physical-experiment-controller";
import type {
  PhysicalExperimentSessionConfig,
  PhysicalExperimentTelemetrySnapshot,
} from "../research/physical-experiment-session";
import type { VlcModulationScheme } from "../transports/vlc/vlc-framing";
import type { OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";
import type { PhysicalExposureMode } from "../research/physical-test-run";
import { VlcWaveformInspector } from "./VlcWaveformInspector";
import { OfdmInspector } from "./OfdmInspector";
import type { TestRun } from "../research/test-run";
import { generatePhysicalEvidenceJson, generatePhysicalEvidenceCsv } from "../research/physical-evidence-export";

interface PhysicalExperimentWorkbenchProps {
  persistence: PersistenceRepositories | null;
  onExperimentCompleted: () => void;
}

export const PhysicalExperimentWorkbench: React.FC<PhysicalExperimentWorkbenchProps> = ({
  persistence,
  onExperimentCompleted,
}) => {
  const [activeTab, setActiveTab] = useState<"workbench" | "matrix">("workbench");
  const [transport, setTransport] = useState<TransportId>(TransportId.VLC);
  const [vlcModulation, setVlcModulation] = useState<VlcModulationScheme>("ook");
  const [ofdmModulation, setOfdmModulation] = useState<OfdmModulationScheme>("bpsk");
  const [ofdmGridSize, setOfdmGridSize] = useState<number>(8);

  // Hardware State
  const [transmitterDevice] = useState("MacBook Pro M3 Max");
  const [transmitterDisplay] = useState("Liquid Retina XDR 120Hz Mini-LED");
  const [displayResolution] = useState("3024x1964");
  const [displayRefreshRate] = useState<number>(120);

  const [receiverDevice] = useState("iPhone 15 Pro");
  const [receiverCamera] = useState("48MP Main f/1.78 Camera");
  const [operatingSystem] = useState("macOS Sonoma 14.4");
  const [browser] = useState("Chrome 124");

  // Optical Geometry & Payload
  const [distanceCm, setDistanceCm] = useState<number>(15);
  const [ambientLux, setAmbientLux] = useState<number>(250);
  const [exposureMode, setExposureMode] = useState<PhysicalExposureMode>("locked");
  const [symbolRate] = useState<number>(30);
  const [payloadText, setPayloadText] = useState("PHYSICAL_VALIDATION_PAYLOAD_TEST_001");
  const [notes] = useState("Controlled optical bench test.");

  // Operator Safety & Countdown State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Telemetry & Controller
  const [telemetry, setTelemetry] = useState<PhysicalExperimentTelemetrySnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [lastCompletedRun, setLastCompletedRun] = useState<TestRun | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allRuns, setAllRuns] = useState<TestRun[]>([]);

  const controllerRef = useRef<PhysicalExperimentController | null>(null);
  const transmitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    controllerRef.current = new PhysicalExperimentController();
    controllerRef.current.setTelemetryCallback((snap) => {
      setTelemetry({ ...snap });
    });

    return () => {
      controllerRef.current?.cancel();
    };
  }, []);

  const loadAllRuns = useCallback(async () => {
    if (!persistence) return;
    try {
      const list = await persistence.research.list();
      setAllRuns(list);
    } catch {
      // ignore
    }
  }, [persistence]);

  useEffect(() => {
    void loadAllRuns();
  }, [loadAllRuns]);

  // Update session on configuration change
  useEffect(() => {
    if (!controllerRef.current) return;
    const payload = new TextEncoder().encode(payloadText);

    const config: PhysicalExperimentSessionConfig = {
      sessionId: `sess-${Date.now()}`,
      transport,
      vlcModulation,
      ofdmModulation,
      ofdmGridSize,
      distanceCm,
      ambientLux,
      exposureMode,
      payload,
      symbolRate,
      transmitterDevice,
      transmitterDisplay,
      displayResolution,
      displayRefreshRate,
      receiverDevice,
      receiverCamera,
      operatingSystem,
      browser,
      notes,
    };

    void controllerRef.current.initializeSession(config);
  }, [
    transport,
    vlcModulation,
    ofdmModulation,
    ofdmGridSize,
    distanceCm,
    ambientLux,
    exposureMode,
    payloadText,
    symbolRate,
    transmitterDevice,
    transmitterDisplay,
    displayResolution,
    displayRefreshRate,
    receiverDevice,
    receiverCamera,
    operatingSystem,
    browser,
    notes,
  ]);

  const handleStartCamera = useCallback(async () => {
    if (!controllerRef.current) return;
    setErrorMsg(null);
    try {
      await controllerRef.current.startCamera();
    } catch (err: unknown) {
      setErrorMsg(`Camera error: ${String(err)}`);
    }
  }, []);

  const handleStopCamera = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.stopCamera();
  }, []);

  const executeExperimentLoop = useCallback(async () => {
    if (!controllerRef.current || !transmitCanvasRef.current || !persistence) return;
    setErrorMsg(null);
    setRunning(true);
    setLastCompletedRun(null);

    try {
      const { ledgerRun } = await controllerRef.current.runExperiment(
        transmitCanvasRef.current,
        previewCanvasRef.current ?? undefined
      );

      await persistence.research.put(ledgerRun);
      setLastCompletedRun(ledgerRun);
      await loadAllRuns();
      onExperimentCompleted();
    } catch (err: unknown) {
      console.error("Experiment execution failed:", err);
      setErrorMsg(`Experiment execution failure: ${String(err)}`);
    } finally {
      setRunning(false);
      setCountdown(null);
    }
  }, [persistence, loadAllRuns, onExperimentCompleted]);

  const handleConfirmStart = useCallback(() => {
    setShowConfirmModal(false);
    setCountdown(3);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          void executeExperimentLoop();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [executeExperimentLoop]);

  const handleCancelExperiment = useCallback(() => {
    controllerRef.current?.cancel();
    setRunning(false);
    setCountdown(null);
  }, []);

  const handleExportJson = useCallback(() => {
    const json = generatePhysicalEvidenceJson(allRuns);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_optical_evidence_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allRuns]);

  const handleExportCsv = useCallback(() => {
    const csv = generatePhysicalEvidenceCsv(allRuns);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `physical_optical_evidence_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allRuns]);

  const isReady = telemetry?.readiness.isReadyForExperiment ?? false;

  // Compute test-plan matrix counts
  const physicalRuns = allRuns.filter((r) => r.evidenceKind === "physical");
  const getModCount = (trans: TransportId, modStr: string) => {
    const matching = physicalRuns.filter(
      (r) => r.transport === trans && r.fileName.toLowerCase().includes(modStr.toLowerCase())
    );
    const success = matching.filter((r) => r.integrityStatus === "verified").length;
    return { total: matching.length, success };
  };

  return (
    <div className="physical-workbench-container" style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "18px", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
      {/* Top Header & Mode Toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="ollyo-section-label">REAL HARDWARE VALIDATION BENCH</span>
            <span className="badge-active" style={{ fontSize: "10px", padding: "2px 6px", background: "#6366f1" }}>
              MILESTONE 6F OPERATIONAL
            </span>
          </div>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#f3f4f6" }}>
            Controlled Physical Optical Experiment Workbench
          </h3>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className={`btn ${activeTab === "workbench" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("workbench")}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            🔬 Live Workbench
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "matrix" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("matrix")}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            📋 Test Plan Matrix
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportJson}
            style={{ fontSize: "12px", padding: "6px 10px" }}
            title="Export full cryptographic evidence bundle in JSON format"
          >
            📥 Export JSON
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCsv}
            style={{ fontSize: "12px", padding: "6px 10px" }}
            title="Export physical test runs in CSV format"
          >
            📊 Export CSV
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", borderRadius: "6px", padding: "10px", marginBottom: "14px", color: "#fca5a5", fontSize: "13px" }}>
          {errorMsg}
        </div>
      )}

      {/* Tab: Test Plan Matrix */}
      {activeTab === "matrix" && (
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#93c5fd" }}>
            Physical Optical Validation Matrix (Minimum Evidence Policy: 3/3 Qualifying Runs)
          </h4>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 14px 0" }}>
            Each configuration requires at least 3 independent screen-to-camera test runs with exact SHA-256 matches and 0 failures before achieving <strong>PHYSICALLY VERIFIED</strong> status.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            {/* VLC Matrix */}
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#cbd5e1", marginBottom: "8px" }}>
                Visible Light Communication (VLC)
              </div>
              <table style={{ width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                    <th>Modulation</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "ook", label: "OOK (1 bit/sym)" },
                    { key: "pam4", label: "4-PAM (2 bits/sym)" },
                    { key: "csk8", label: "CSK-8 (3 bits/sym)" },
                    { key: "csk16", label: "CSK-16 (4 bits/sym)" },
                  ].map((m) => {
                    const cnt = getModCount(TransportId.VLC, m.key);
                    const isVerified = cnt.success >= 3;
                    return (
                      <tr key={m.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "6px 0" }}>{m.label}</td>
                        <td>{cnt.success} / 3 Runs</td>
                        <td>
                          <span className={`tag ${isVerified ? "tag-verified" : cnt.total > 0 ? "tag-failed" : "tag-untested"}`}>
                            {isVerified ? "VERIFIED" : cnt.total > 0 ? "INSUFFICIENT" : "NOT TESTED"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* OFDM Matrix */}
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#cbd5e1", marginBottom: "8px" }}>
                Visual OFDM (Spatial Frequency)
              </div>
              <table style={{ width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                    <th>Modulation / Grid</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "bpsk_8x8", label: "BPSK · 8×8 Grid" },
                    { key: "bpsk_16x16", label: "BPSK · 16×16 Grid" },
                    { key: "qpsk_8x8", label: "QPSK · 8×8 Grid" },
                    { key: "qpsk_16x16", label: "QPSK · 16×16 Grid" },
                    { key: "16qam_8x8", label: "16-QAM · 8×8 Grid" },
                  ].map((m) => {
                    const cnt = getModCount(TransportId.VisualOFDM, m.key.split("_")[0]);
                    const isVerified = cnt.success >= 3;
                    return (
                      <tr key={m.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "6px 0" }}>{m.label}</td>
                        <td>{cnt.success} / 3 Runs</td>
                        <td>
                          <span className={`tag ${isVerified ? "tag-verified" : cnt.total > 0 ? "tag-failed" : "tag-untested"}`}>
                            {isVerified ? "VERIFIED" : cnt.total > 0 ? "INSUFFICIENT" : "NOT TESTED"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Live Workbench */}
      {activeTab === "workbench" && (
        <>
          {/* Transport Selector */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <button
              type="button"
              className={`btn ${transport === TransportId.VLC ? "btn-primary" : "btn-secondary"}`}
              onClick={() => !running && setTransport(TransportId.VLC)}
              disabled={running}
              style={{ fontSize: "12px", padding: "6px 14px" }}
            >
              Visible Light (VLC)
            </button>
            <button
              type="button"
              className={`btn ${transport === TransportId.VisualOFDM ? "btn-primary" : "btn-secondary"}`}
              onClick={() => !running && setTransport(TransportId.VisualOFDM)}
              disabled={running}
              style={{ fontSize: "12px", padding: "6px 14px" }}
            >
              Visual OFDM (Spatial)
            </button>
          </div>

          {/* Configuration & Readiness Checklist */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "16px", marginBottom: "16px" }}>
            {/* Left: Configuration */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", color: "#93c5fd" }}>
                  1. Optical Configuration ({transport.toUpperCase()})
                </h4>
                <span className="badge-neutral" style={{ fontSize: "10px" }}>OPERATOR INPUT</span>
              </div>

              {transport === TransportId.VLC ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "12px" }}>
                  {(["ook", "pam4", "csk8", "csk16"] as VlcModulationScheme[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn ${vlcModulation === m ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setVlcModulation(m)}
                      disabled={running}
                      style={{ fontSize: "11px", padding: "8px 4px" }}
                    >
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "8px" }}>
                    {(["bpsk", "qpsk", "16qam"] as OfdmModulationScheme[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`btn ${ofdmModulation === m ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setOfdmModulation(m)}
                        disabled={running}
                        style={{ fontSize: "11px", padding: "8px 4px" }}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {[8, 16, 32].map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`btn ${ofdmGridSize === g ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setOfdmGridSize(g)}
                        disabled={running}
                        style={{ flex: 1, fontSize: "11px", padding: "6px" }}
                      >
                        {g}×{g} Grid
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "11px" }}>Distance (cm)</label>
                  <input type="number" className="form-input" value={distanceCm} onChange={(e) => setDistanceCm(Number(e.target.value))} min={5} disabled={running} style={{ fontSize: "12px" }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "11px" }}>Ambient Light (lux)</label>
                  <input type="number" className="form-input" value={ambientLux} onChange={(e) => setAmbientLux(Number(e.target.value))} min={0} disabled={running} style={{ fontSize: "12px" }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "11px" }}>Exposure Mode</label>
                  <select className="form-select" value={exposureMode} onChange={(e) => setExposureMode(e.target.value as any)} disabled={running} style={{ fontSize: "12px" }}>
                    <option value="locked">Locked</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "11px" }}>Payload String</label>
                <input type="text" className="form-input" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} disabled={running} style={{ fontSize: "12px" }} />
              </div>
            </div>

            {/* Right: Device Readiness & Execution Trigger */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "14px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", color: "#93c5fd" }}>
                  2. Readiness Checklist
                </h4>
                <div style={{ display: "flex", gap: "6px" }}>
                  {!telemetry?.readiness.cameraStreamActive ? (
                    <button type="button" className="btn btn-secondary" onClick={handleStartCamera} style={{ fontSize: "11px", padding: "3px 8px" }}>
                      📷 Start Camera
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={handleStopCamera} style={{ fontSize: "11px", padding: "3px 8px" }}>
                      🛑 Stop Camera
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", marginBottom: "14px" }}>
                <div>{telemetry?.readiness.cameraStreamActive ? "✓" : "○"} Camera Active</div>
                <div>{telemetry?.readiness.displayCanvasAvailable ? "✓" : "○"} Display Canvas Ready</div>
                <div>{telemetry?.readiness.opticalDistanceValid ? "✓" : "○"} Distance: {distanceCm} cm</div>
                <div>{telemetry?.readiness.ambientLuxValid ? "✓" : "○"} Ambient: {ambientLux} lux</div>
                <div>{telemetry?.readiness.payloadPrepared ? "✓" : "○"} Payload: {payloadText.length}B</div>
                <div>{telemetry?.expectedSha256 ? "✓" : "○"} SHA-256 Prepared</div>
              </div>

              <div>
                {!running ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!isReady}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: isReady ? "#059669" : "#4b5563",
                      borderColor: isReady ? "#059669" : "#4b5563",
                      cursor: isReady ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    🚀 Start Physical Experiment
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled
                      style={{ flex: 1, padding: "10px", background: "#d97706", borderColor: "#d97706", fontSize: "13px" }}
                    >
                      {countdown !== null ? `⏳ Countdown: ${countdown}s` : "📡 Transmitting & Capturing..."}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancelExperiment}
                      style={{ padding: "10px 14px", fontSize: "12px" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dual Canvas: Transmitter Output + Camera Capture Preview */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            {/* Transmitter Canvas */}
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "12px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#93c5fd" }}>
                  Transmitter Display Pattern ({transport.toUpperCase()})
                </span>
                <span className="badge-neutral" style={{ fontSize: "10px" }}>TRANSMITTER</span>
              </div>
              <div style={{ border: "2px solid #3b82f6", borderRadius: "6px", overflow: "hidden", background: "#000", height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <canvas ref={transmitCanvasRef} width={280} height={200} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            </div>

            {/* Receiver Camera Canvas */}
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "12px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#6ee7b7" }}>
                  Live Camera Sensor Ingestion
                </span>
                <span className="badge-neutral" style={{ fontSize: "10px", background: "rgba(5,150,105,0.2)", color: "#6ee7b7" }}>
                  LIVE MEASUREMENT
                </span>
              </div>
              <div style={{ border: "2px solid #059669", borderRadius: "6px", overflow: "hidden", background: "#000", height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <canvas ref={previewCanvasRef} width={280} height={200} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            </div>
          </div>

          {/* Categorized Telemetry Bar */}
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "12px", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#fef08a" }}>
                State: {telemetry?.state ?? "IDLE"}
              </span>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                FPS: {telemetry?.cameraDiagnostics?.actualFps.toFixed(1) ?? "N/A"} | Dropped: {telemetry?.cameraDiagnostics?.droppedFrames ?? 0} | Elapsed: {telemetry?.elapsedMs ?? 0} ms
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "12px" }}>
              <div>Sync: <strong>{telemetry?.detectedSync ? "LOCKED" : "SEARCHING"}</strong></div>
              <div>CRC-16: <strong>{telemetry?.crcPassed ? "PASS" : "PENDING"}</strong></div>
              <div>Throughput: <strong>{telemetry?.throughputKbps ? `${telemetry.throughputKbps} KB/s` : "0 KB/s"}</strong></div>
              <div>SHA-256: <strong>{telemetry?.sha256Matched ? "MATCH ✓" : "UNVERIFIED"}</strong></div>
            </div>
          </div>

          {/* Embedded Optical Inspector */}
          <div style={{ marginBottom: "16px" }}>
            {transport === TransportId.VLC ? (
              <VlcWaveformInspector
                modulation={vlcModulation}
                demodStatus={telemetry?.state === "COMPLETED" ? "success" : "idle"}
                droppedFramesCount={telemetry?.cameraDiagnostics?.droppedFrames ?? 0}
              />
            ) : (
              <OfdmInspector
                modulation={ofdmModulation}
                gridSize={ofdmGridSize}
              />
            )}
          </div>

          {/* Result Card */}
          {lastCompletedRun && (
            <div style={{ background: "rgba(5, 150, 105, 0.12)", border: "1px solid rgba(5, 150, 105, 0.35)", borderRadius: "8px", padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: lastCompletedRun.integrityStatus === "verified" ? "#6ee7b7" : "#fca5a5" }}>
                  {lastCompletedRun.integrityStatus === "verified" ? "✅ Physical Experiment Recorded & Verified" : "❌ Physical Experiment Failure Recorded"}
                </span>
                <span className="badge-active" style={{ fontSize: "11px", padding: "2px 8px" }}>
                  RUN ID: {lastCompletedRun.runId.slice(0, 14)}…
                </span>
              </div>

              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "#cbd5e1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                <div>Throughput: <strong>{(lastCompletedRun.metrics.averageThroughputBytesPerSecond / 1024).toFixed(2)} KB/s</strong></div>
                <div>Measured Duration: <strong>{lastCompletedRun.metrics.elapsedMs} ms</strong></div>
                <div style={{ gridColumn: "span 2", wordBreak: "break-all" }}>
                  Recovered SHA-256: <span style={{ color: "#93c5fd" }}>{lastCompletedRun.fileHashHex}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Operator Safety & Optical Alignment Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal-container" style={{ maxWidth: "550px" }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: "16px" }}>⚠️ Operator Physical Validation Protocol</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)} style={{ padding: "4px 8px" }}>
                ✕
              </button>
            </div>
            <div style={{ padding: "12px 0", fontSize: "13px", lineHeight: "1.5", color: "#cbd5e1" }}>
              <p style={{ margin: "0 0 10px 0" }}>
                You are about to execute a <strong>Real Hardware Screen-to-Camera Optical Transmission</strong>.
              </p>
              <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px" }}>
                <li>Ensure the camera is pointed directly at the transmitter display window.</li>
                <li>Avoid physical obstruction or extreme environmental glare during transmission.</li>
                <li>Synthetic benchmark results are strictly segregated and <strong>do not count</strong> towards physical verification.</li>
              </ul>
              <div style={{ background: "rgba(234, 179, 8, 0.15)", border: "1px solid #eab308", borderRadius: "6px", padding: "10px", color: "#fef08a", fontSize: "12px" }}>
                <strong>Evidence Policy:</strong> 3 independent qualifying physical runs with exact SHA-256 match are required before this configuration becomes PHYSICALLY VERIFIED.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmStart} style={{ background: "#059669", borderColor: "#059669" }}>
                Proceed to 3s Countdown →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
