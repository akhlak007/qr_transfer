import React from "react";
import type { StorageCapabilities } from "../storage/storage-capabilities";
import type { PersistenceQueueStatus } from "../storage/persistence-queue";
import { formatBytes } from "./format";

export interface StorageStatusProps {
  backendKind: "indexeddb" | "memory";
  queueStatus: PersistenceQueueStatus;
  capabilities: StorageCapabilities | null;
  error?: string | null;
  fallbackReason?: string | null;
  durableCheckpoints?: number;
  persistedSymbols?: number;
  recoverableCount?: number;
  onOpenRecovery?: () => void;
}

export const StorageStatus: React.FC<StorageStatusProps> = ({
  backendKind,
  queueStatus,
  capabilities,
  error,
  fallbackReason,
  durableCheckpoints,
  persistedSymbols,
  recoverableCount,
  onOpenRecovery,
}) => {
  // Determine state labels and badge classes
  let engineLabel = "IndexedDB Active";
  let engineClass = "storage-badge-active";

  if (backendKind === "memory") {
    engineLabel = "Memory Fallback";
    engineClass = "storage-badge-fallback";
  }

  if (capabilities && !capabilities.indexedDbAvailable) {
    engineLabel = "Persistence Unavailable";
    engineClass = "storage-badge-unavailable";
  }

  let statusLabel = "Saved";
  let statusClass = "status-saved";

  if (queueStatus === "saving") {
    statusLabel = "Saving…";
    statusClass = "status-saving";
  } else if (queueStatus === "error" || error) {
    statusLabel = "Persistence Error";
    statusClass = "status-error";
  } else if (queueStatus === "idle") {
    statusLabel = "Ready";
    statusClass = "status-idle";
  }

  return (
    <div className="storage-status-card" aria-label="Storage persistence status">
      <div className="storage-status-header">
        <div className="storage-engine-group">
          <span className="storage-engine-label">Persistence Engine</span>
          <span className={`storage-badge ${engineClass}`}>{engineLabel}</span>
        </div>
        <div className="storage-state-group">
          <span className="storage-state-indicator-dot" />
          <span className={`storage-state-label ${statusClass}`}>{statusLabel}</span>
        </div>
      </div>

      <div className="storage-details-grid">
        {capabilities?.quotaBytes !== null && capabilities?.quotaBytes !== undefined && (
          <div className="storage-detail-item">
            <span className="detail-key">Quota Available</span>
            <span className="detail-val">
              {formatBytes(capabilities.quotaBytes - (capabilities.usageBytes ?? 0))}
            </span>
          </div>
        )}

        {capabilities?.usageBytes !== null && capabilities?.usageBytes !== undefined && (
          <div className="storage-detail-item">
            <span className="detail-key">Storage Used</span>
            <span className="detail-val">{formatBytes(capabilities.usageBytes)}</span>
          </div>
        )}

        {persistedSymbols !== undefined && (
          <div className="storage-detail-item">
            <span className="detail-key">Durable Symbols</span>
            <span className="detail-val">{persistedSymbols}</span>
          </div>
        )}

        {durableCheckpoints !== undefined && (
          <div className="storage-detail-item">
            <span className="detail-key">Durable Checkpoints</span>
            <span className="detail-val">{durableCheckpoints}</span>
          </div>
        )}

        {recoverableCount !== undefined && (
          <div className="storage-detail-item">
            <span className="detail-key">Saved Sessions</span>
            <span className="detail-val">{recoverableCount}</span>
          </div>
        )}
      </div>

      {onOpenRecovery && (
        <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenRecovery}
            style={{ fontSize: "12px", padding: "4px 10px" }}
          >
            Manage Sessions & Recovery
          </button>
        </div>
      )}

      {fallbackReason && (
        <div className="storage-fallback-note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Operating in RAM-only mode: {fallbackReason}</span>
        </div>
      )}

      {error && queueStatus === "error" && (
        <div className="storage-error-note">
          <span>Storage write warning: {error} (transfer continuing in memory)</span>
        </div>
      )}
    </div>
  );
};
