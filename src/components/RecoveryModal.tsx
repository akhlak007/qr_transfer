import { useState, useEffect, useRef, useCallback } from "react";
import type { PersistenceRepositories } from "../storage/persistence";
import {
  RecoveryManager,
  type RecoverySessionSummary,
  type ReplayProgress,
  type ReplayResult,
} from "../storage/recovery-manager";
import type { TransferSession } from "../core/transfer-session";

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  persistence: PersistenceRepositories | null;
  onSelectReceiverResume: (session: TransferSession, replay: ReplayResult) => void;
  onSelectSenderResume: (session: TransferSession, file: File) => void;
}

export function RecoveryModal({
  isOpen,
  onClose,
  persistence,
  onSelectReceiverResume,
  onSelectSenderResume,
}: RecoveryModalProps) {
  const [sessions, setSessions] = useState<RecoverySessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayProgress, setReplayProgress] = useState<ReplayProgress | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validatingSession, setValidatingSession] = useState<TransferSession | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSessions = useCallback(async () => {
    if (!persistence) return;
    setLoading(true);
    try {
      const summaries = await RecoveryManager.listSessions(persistence);
      setSessions(summaries);
    } catch (err) {
      console.error("Failed to load sessions for recovery:", err);
    } finally {
      setLoading(false);
    }
  }, [persistence]);

  useEffect(() => {
    if (isOpen) {
      void loadSessions();
      setValidationError(null);
      setValidatingSession(null);
      setReplayingId(null);
      setReplayProgress(null);
    }
  }, [isOpen, loadSessions]);

  if (!isOpen) return null;

  const handleStartReceiverReplay = async (summary: RecoverySessionSummary) => {
    if (!persistence) return;
    setReplayingId(summary.session.transferId);
    setReplayProgress(null);

    try {
      const result = await RecoveryManager.replayReceiverSession(
        summary.session.transferId,
        persistence,
        (progress) => {
          setReplayProgress(progress);
        }
      );

      onSelectReceiverResume(summary.session, result);
      onClose();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : "Replay failed");
      setReplayingId(null);
    }
  };

  const handlePromptSenderFile = (session: TransferSession) => {
    setValidatingSession(session);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleSenderFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validatingSession) return;

    setLoading(true);
    setValidationError(null);

    try {
      const result = await RecoveryManager.validateSenderFile(validatingSession, file);
      if (result.valid) {
        onSelectSenderResume(validatingSession, file);
        onClose();
      } else {
        setValidationError(result.error ?? "File validation failed");
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : "Validation error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (transferId: string) => {
    if (!persistence) return;
    try {
      await RecoveryManager.deleteSessionGraph(transferId, persistence);
      await loadSessions();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="recovery-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-modal-title">
      <div className="recovery-modal-card">
        <div className="recovery-modal-header">
          <div>
            <h3 id="recovery-modal-title" style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
              Session Recovery & Replay
            </h3>
            <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
              Experimental state recovery from local durable persistence.
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: "6px 12px" }}>
            ✕
          </button>
        </div>

        <div className="recovery-disclaimer-banner">
          <span style={{ fontWeight: 600 }}>Notice:</span> Replay reconstructs state from local storage. Optical camera resume remains experimental until physical cross-device testing is completed.
        </div>

        {validationError && (
          <div className="recovery-error-banner" role="alert">
            <strong>Error:</strong> {validationError}
          </div>
        )}

        {replayingId && replayProgress && (
          <div className="recovery-replay-progress-card">
            <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>
              Replaying Durable Symbols into Decoder...
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              Symbols: {replayProgress.symbolsReplayed} / {replayProgress.totalSymbols} | Resolved: {replayProgress.resolvedBlocks} / {replayProgress.totalBlocks} blocks
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(replayProgress.symbolsReplayed / Math.max(1, replayProgress.totalSymbols)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleSenderFileSelected}
        />

        <div className="recovery-session-list">
          {loading && sessions.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
              Loading persisted sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
              No transfer sessions recorded in local persistence.
            </div>
          ) : (
            sessions.map((summary) => {
              const s = summary.session;
              const isRx = s.direction === "receive";
              const isReplaying = replayingId === s.transferId;

              let badgeClass = "badge-recoverable";
              if (summary.recoveryState === "completed") badgeClass = "badge-completed";
              if (summary.recoveryState === "non-recoverable") badgeClass = "badge-non-recoverable";
              if (summary.recoveryState === "corrupted") badgeClass = "badge-corrupted";

              return (
                <div key={s.transferId} className="recovery-session-item">
                  <div className="recovery-item-main">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span className="recovery-dir-badge">
                        {isRx ? "RECEIVER" : "SENDER"}
                      </span>
                      <span className={`recovery-state-badge ${badgeClass}`}>
                        {summary.recoveryState.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: "15px", color: "var(--text-primary)" }}>
                        {s.file.name}
                      </span>
                    </div>

                    <div className="recovery-item-meta">
                      <span>Size: {formatBytes(s.file.size)}</span>
                      <span>Blocks: {s.totalBlocks} ({s.blockSize} B/block)</span>
                      {isRx && (
                        <span>Durable Symbols: {summary.symbolCount}</span>
                      )}
                      <span>Updated: {new Date(s.updatedAt).toLocaleTimeString()}</span>
                    </div>

                    {summary.reason && (
                      <div style={{ fontSize: "12px", color: "var(--color-warning)", marginTop: "4px" }}>
                        Reason: {summary.reason}
                      </div>
                    )}
                  </div>

                  <div className="recovery-item-actions">
                    {summary.recoveryState === "recoverable" && (
                      <>
                        {isRx ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={isReplaying}
                            onClick={() => handleStartReceiverReplay(summary)}
                            style={{ padding: "6px 14px", fontSize: "13px" }}
                          >
                            {isReplaying ? "Replaying..." : "Replay & Resume"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handlePromptSenderFile(s)}
                            style={{ padding: "6px 14px", fontSize: "13px" }}
                          >
                            Re-select & Resume
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDeleteSession(s.transferId)}
                      style={{ padding: "6px 12px", fontSize: "13px" }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="recovery-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
