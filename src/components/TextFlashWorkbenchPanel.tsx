/**
 * Isolated TEXT_FLASH_PROTOCOL workbench panel (TF7).
 * Separate from VLC/OFDM PhysicalExperimentWorkbench and physical evidence matrices.
 */

import React, { useMemo, useState } from "react";
import {
  TextFlashPhysicalExperimentService,
  TEXT_FLASH_WORKBENCH_TARGET,
  type TextFlashExperimentRecord,
} from "../transports/text-flash/text-flash-physical-experiment";

const PRESETS = ["HELLO", "TEST", "STATUS OK", "12345"] as const;

export const TextFlashWorkbenchPanel: React.FC = () => {
  const service = useMemo(() => new TextFlashPhysicalExperimentService(), []);
  const [targetId, setTargetId] = useState(TEXT_FLASH_WORKBENCH_TARGET.id);
  const [payload, setPayload] = useState("HELLO");
  const [frameMs, setFrameMs] = useState(750);
  const [last, setLast] = useState<TextFlashExperimentRecord | null>(null);
  const [history, setHistory] = useState<readonly TextFlashExperimentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const targets = service.listTargets();

  const onRun = () => {
    setError(null);
    try {
      service.selectTarget(targetId);
      const record = service.runSynthetic(payload, { frameMs });
      setLast(record);
      setHistory(service.getHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onReset = () => {
    service.reset();
    setLast(null);
    setError(null);
  };

  const onClear = () => {
    service.clearHistory();
    setLast(null);
    setHistory([]);
    setError(null);
  };

  return (
    <div className="tf-demo">
      <div className="tf-demo-banner">
        TEXT_FLASH workbench — synthetic demo evidence only. Results use transport
        id <code>text-flash</code> and are <strong>not</strong> counted as VLC/OFDM
        physical validation.
      </div>

      {error && <div className="tf-demo-error">{error}</div>}

      <div className="tf-demo-card">
        <h3>Workbench target</h3>
        <label className="form-label">Target</label>
        <select
          className="form-input"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value as typeof targetId)}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="form-label">Payload</label>
        <input
          className="form-input"
          value={payload}
          maxLength={64}
          onChange={(e) => setPayload(e.target.value)}
        />
        <div className="tf-presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-secondary"
              onClick={() => setPayload(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <label className="form-label">Dwell (ms)</label>
        <input
          className="form-input"
          type="number"
          min={500}
          max={2000}
          value={frameMs}
          onChange={(e) => setFrameMs(Number(e.target.value) || 750)}
        />

        <div className="tf-actions">
          <button type="button" className="btn btn-primary" onClick={onRun}>
            Run synthetic experiment
          </button>
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClear}>
            Clear history
          </button>
        </div>

        {last && (
          <div className={`tf-compare ${last.success ? "ok" : "bad"}`}>
            <div className="tf-mono">
              outcome={last.outcome} success={String(last.success)}
            </div>
            <div>
              <span className="form-label">Expected</span>
              <code>{last.payloadText}</code>
            </div>
            <div>
              <span className="form-label">Recovered</span>
              <code>{last.recoveredText ?? "—"}</code>
            </div>
            <div className="tf-mono">
              START={String(last.startDetected)} LENGTH=
              {String(last.lengthDetected)} END={String(last.endDetected)}{" "}
              progress={last.progressPercent}%
            </div>
            <div className="tf-mono">
              evidence={last.evidenceKind} transport={last.transport}{" "}
              physicalEligible={String(last.physicalValidationEligible)}
            </div>
            {last.failureStage && (
              <div className="tf-fail-stage">
                stage={last.failureStage}
                {last.failureDetail ? ` · ${last.failureDetail}` : ""}
              </div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="tf-diag tf-mono">
            <div>History ({history.length}) — demo store only</div>
            {history.map((h) => (
              <div key={h.runId}>
                {new Date(h.timestamp).toISOString()} · {h.payloadText} ·{" "}
                {h.outcome}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
