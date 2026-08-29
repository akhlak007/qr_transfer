import { useEffect, useState } from "react";
import { downloadOpticalTrace, opticalDiagnosticTrace, type OpticalTraceLiveSummary } from "../diagnostics/optical-trace";

export function VlcDiagnosticPanel({ active }: { active: boolean }) {
  const [trace, setTrace] = useState<OpticalTraceLiveSummary>(() => opticalDiagnosticTrace.getLiveSummary());
  useEffect(() => {
    setTrace(opticalDiagnosticTrace.getLiveSummary());
    const timer = window.setInterval(() => setTrace(opticalDiagnosticTrace.getLiveSummary()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  const observation = trace.lastPhysicalObservation?.details ?? null;
  const last = trace.lastEvent;

  return <section style={{ marginBottom: "18px", padding: "14px", border: "1px solid rgba(34,211,238,.3)", borderRadius: "10px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
      <strong>Temporary VLC Diagnostic Trace</strong>
      <span>{active ? "CAPTURING" : "READY"} · {trace.eventCount}/{trace.capacity} events</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: "6px", marginTop: "10px", fontSize: "12px" }}>
      {Object.entries(trace.stageCounts).filter(([stage]) => stage !== "VlcTransmitter")
        .map(([stage, count]) => <div key={stage}>{stage}: <strong>{count}</strong></div>)}
    </div>

    {observation && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "6px", marginTop: "10px", padding: "8px", background: "rgba(0,0,0,0.3)", borderRadius: "6px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
      <div>Luma: <strong>{Number(observation.luminance ?? 0).toFixed(1)}</strong></div>
      <div>Dyn Range: <strong>{Number(observation.dynamicRange ?? 0).toFixed(0)}</strong></div>
      <div>Barker Sync: <strong>{(Number(observation.barkerCorrelation ?? 0) * 100).toFixed(0)}%</strong></div>
      <div>Chips: <strong>{String(observation.recoveredChips ?? 0)}</strong></div>
      <div>Bad Pairs: <strong style={{ color: Number(observation.invalidManchesterPairs ?? 0) > 0 ? "var(--color-amber)" : "inherit" }}>{String(observation.invalidManchesterPairs ?? 0)}</strong></div>
      <div>Recovered Bits: <strong>{String(observation.recoveredBits ?? 0)}</strong></div>
      <div>Frame Buffer: <strong>{String(observation.bufferedFrameBits ?? 0)} / {String(observation.expectedFrameBits ?? "?")}</strong></div>
      <div>Clock Resets: <strong>{String(observation.clockResets ?? 0)}</strong></div>
      <div>Soft Reacq: <strong>{String(observation.softReacquisitions ?? 0)}</strong></div>
      <div>Timing: <strong>{observation.timingLocked ? "LOCKED" : "OPEN"}</strong></div>
      <div>Progress: <strong>{String(observation.frameProgressPercent ?? 0)}%</strong></div>
      <div>Frame Gap: <strong>{Number(observation.gapMs ?? 0).toFixed(1)} ms</strong></div>
    </div>}

    <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
      Last: {last ? `#${last.sequence} ${last.stage} / ${last.event}` : "No observations yet"}
      {trace.droppedEvents > 0 ? ` · ${trace.droppedEvents} older events discarded` : ""}
    </div>
    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-secondary" onClick={() => downloadOpticalTrace()} disabled={trace.eventCount === 0}>Download JSON Trace</button>
      <button type="button" className="btn btn-secondary" onClick={() => { opticalDiagnosticTrace.clear(); setTrace(opticalDiagnosticTrace.getLiveSummary()); }} disabled={active}>Clear Trace</button>
    </div>
  </section>;
}
