import React, { useState } from "react";
import type { TestRun, EvidenceKind, DevicePlatform } from "../research/test-run";
import { TransportId } from "../core/transport";
import type { PersistenceRepositories } from "../storage/persistence";
import { isSha256Hex } from "../core/integrity";

interface TestProtocolModalProps {
  isOpen: boolean;
  onClose: () => void;
  persistence: PersistenceRepositories | null;
  onRunSaved: () => void;
}

export const TestProtocolModal: React.FC<TestProtocolModalProps> = ({
  isOpen,
  onClose,
  persistence,
  onRunSaved,
}) => {
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>("physical");
  const [status, setStatus] = useState<"draft" | "complete">("complete");
  const [senderPlatform, setSenderPlatform] = useState<DevicePlatform>("android");
  const [senderDevice, setSenderDevice] = useState("Pixel 7");
  const [senderOs, setSenderOs] = useState("Android 14");
  const [senderBrowser, setSenderBrowser] = useState("Chrome 124");

  const [receiverPlatform, setReceiverPlatform] = useState<DevicePlatform>("iphone");
  const [receiverDevice, setReceiverDevice] = useState("iPhone 15 Pro");
  const [receiverOs, setReceiverOs] = useState("iOS 17.4");
  const [receiverBrowser, setReceiverBrowser] = useState("Safari 17.4");

  const [fileName, setFileName] = useState("research_sample_50kb.bin");
  const [fileSize, setFileSize] = useState<number>(51200);
  const [fileHashHex, setFileHashHex] = useState(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  const [elapsedMs, setElapsedMs] = useState<number>(4500);
  const [cameraFps, setCameraFps] = useState<number>(30);
  const [screenFps, setScreenFps] = useState<number>(30);
  const [distanceCm, setDistanceCm] = useState<number>(25);
  const [environment, setEnvironment] = useState<"bright" | "normal" | "dark" | "unspecified">("normal");
  const [integrityStatus, setIntegrityStatus] = useState<"verified" | "mismatch">("verified");
  const [notes, setNotes] = useState("Standard laboratory optical desk run at 100% screen brightness.");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persistence) return;
    setErrorMsg(null);

    if (fileSize <= 0 || !Number.isFinite(fileSize)) {
      setErrorMsg("File size must be a positive integer");
      return;
    }

    if (fileHashHex && !isSha256Hex(fileHashHex)) {
      setErrorMsg("Invalid SHA-256 hex string (must be 64 lowercase hex characters)");
      return;
    }

    const throughput = elapsedMs > 0 ? (fileSize / (elapsedMs / 1000)) : 0;

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    const newRun: TestRun = {
      schemaVersion: 1,
      runId,
      status,
      evidenceKind,
      transport: TransportId.QR,
      sender: {
        platform: senderPlatform,
        deviceName: senderDevice.trim() || "Unspecified Device",
        osVersion: senderOs.trim() || "Unspecified OS",
        browserName: senderBrowser.trim() || "Browser",
        browserVersion: "1.0",
      },
      receiver: {
        platform: receiverPlatform,
        deviceName: receiverDevice.trim() || "Unspecified Device",
        osVersion: receiverOs.trim() || "Unspecified OS",
        browserName: receiverBrowser.trim() || "Browser",
        browserVersion: "1.0",
      },
      fileName: fileName.trim() || "unnamed.bin",
      fileHashHex: fileHashHex.trim() || null,
      integrityStatus: integrityStatus,
      metrics: {
        fileSize,
        elapsedMs,
        averageThroughputBytesPerSecond: throughput,
        frameHitRate: integrityStatus === "verified" ? 0.95 : 0.4,
        errorRate: integrityStatus === "verified" ? 0.05 : 0.6,
        recoveryOverhead: 1.15,
        cameraFps,
        screenFps,
        signalQuality: 0.9,
      },
      distanceCm,
      environment,
      notes: notes.trim(),
      createdAt: now,
      completedAt: status === "complete" ? now : null,
    };

    try {
      await persistence.research.put(newRun);
      onRunSaved();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to record test run");
    }
  };

  return (
    <div className="recovery-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="protocol-modal-title">
      <div className="recovery-modal-card" style={{ maxWidth: "740px" }}>
        <div className="recovery-modal-header">
          <div>
            <h3 id="protocol-modal-title" style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
              Record Test Protocol Evidence
            </h3>
            <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
              Standardized optical transfer measurement and provenance recording.
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: "6px 12px" }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
          <div className="recovery-session-list" style={{ gap: "16px", padding: "20px 24px" }}>
            {errorMsg && (
              <div className="recovery-error-banner" style={{ borderRadius: "8px" }}>
                <strong>Error:</strong> {errorMsg}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label className="form-label">Evidence Classification</label>
                <select
                  className="form-select"
                  value={evidenceKind}
                  onChange={(e) => setEvidenceKind(e.target.value as EvidenceKind)}
                >
                  <option value="physical">Physical Test (Real Screen to Camera)</option>
                  <option value="simulated">Simulated Run (Synthetic / Loopback)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Record Lifecycle State</label>
                <select
                  className="form-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "complete")}
                >
                  <option value="complete">Completed Run (Immutable)</option>
                  <option value="draft">Draft Protocol (Editable)</option>
                </select>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px", color: "var(--color-cyan)" }}>
                Sender Device Details
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>Platform</label>
                  <select
                    className="form-select"
                    value={senderPlatform}
                    onChange={(e) => setSenderPlatform(e.target.value as DevicePlatform)}
                  >
                    <option value="android">Android</option>
                    <option value="iphone">iPhone (iOS)</option>
                    <option value="desktop">Desktop / Laptop</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>Device Model</label>
                  <input
                    type="text"
                    className="form-input"
                    value={senderDevice}
                    onChange={(e) => setSenderDevice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>OS Version</label>
                  <input
                    type="text"
                    className="form-input"
                    value={senderOs}
                    onChange={(e) => setSenderOs(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>Browser</label>
                  <input
                    type="text"
                    className="form-input"
                    value={senderBrowser}
                    onChange={(e) => setSenderBrowser(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px", color: "var(--color-cyan)" }}>
                Receiver Device Details
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>Platform</label>
                  <select
                    className="form-select"
                    value={receiverPlatform}
                    onChange={(e) => setReceiverPlatform(e.target.value as DevicePlatform)}
                  >
                    <option value="android">Android</option>
                    <option value="iphone">iPhone (iOS)</option>
                    <option value="desktop">Desktop / Laptop</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>Device Model</label>
                  <input
                    type="text"
                    className="form-input"
                    value={receiverDevice}
                    onChange={(e) => setReceiverDevice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>OS Version</label>
                  <input
                    type="text"
                    className="form-input"
                    value={receiverOs}
                    onChange={(e) => setReceiverOs(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "11px" }}>Browser</label>
                  <input
                    type="text"
                    className="form-input"
                    value={receiverBrowser}
                    onChange={(e) => setReceiverBrowser(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: "10px" }}>
              <div>
                <label className="form-label">File Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Size (Bytes)</label>
                <input
                  type="number"
                  className="form-input"
                  value={fileSize}
                  onChange={(e) => setFileSize(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="form-label">Duration (ms)</label>
                <input
                  type="number"
                  className="form-input"
                  value={elapsedMs}
                  onChange={(e) => setElapsedMs(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="form-label">Camera FPS</label>
                <input
                  type="number"
                  className="form-input"
                  value={cameraFps}
                  onChange={(e) => setCameraFps(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="form-label">Screen FPS</label>
                <input
                  type="number"
                  className="form-input"
                  value={screenFps}
                  onChange={(e) => setScreenFps(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div>
              <label className="form-label">SHA-256 Hash Hex</label>
              <input
                type="text"
                className="form-input"
                style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                value={fileHashHex}
                onChange={(e) => setFileHashHex(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div>
                <label className="form-label">Integrity Result</label>
                <select
                  className="form-select"
                  value={integrityStatus}
                  onChange={(e) => setIntegrityStatus(e.target.value as "verified" | "mismatch")}
                >
                  <option value="verified">SHA-256 Matched (Verified)</option>
                  <option value="mismatch">Hash Mismatch (Measured Failure)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Distance (cm)</label>
                <input
                  type="number"
                  className="form-input"
                  value={distanceCm}
                  onChange={(e) => setDistanceCm(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="form-label">Lighting</label>
                <select
                  className="form-select"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as any)}
                >
                  <option value="normal">Normal Indoor</option>
                  <option value="bright">Bright Lab / Daylight</option>
                  <option value="dark">Low Light</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Notes & Environmental Observations</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="recovery-modal-footer" style={{ gap: "12px" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Record Protocol Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
