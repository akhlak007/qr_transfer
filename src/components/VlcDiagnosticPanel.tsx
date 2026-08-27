import { useEffect, useMemo, useState } from "react";
import { downloadOpticalTrace, opticalDiagnosticTrace, type OpticalTraceExport } from "../diagnostics/optical-trace";

export function VlcDiagnosticPanel({ active }: { active: boolean }) {
  const [trace, setTrace] = useState<OpticalTraceExport>(() => opticalDiagnosticTrace.snapshot());
  useEffect(() => {
    setTrace(opticalDiagnosticTrace.snapshot());
    const timer = window.setInterval(() => setTrace(opticalDiagnosticTrace.snapshot()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  const counts = useMemo(() => Object.fromEntries(
    ["PhysicalCameraService", "PhysicalVlcReceiver", "VlcOokReceiver", "LiveReceiverRouter", "ApplicationReconstructionService"]
      .map((stage) => [stage, trace.events.filter((event) => event.stage === stage).length]),
  ), [trace]);
  const lastObservation = useMemo(() => {
    for (let i = trace.events.length - 1; i >= 0; i--) {
      if (trace.events[i].stage === "PhysicalVlcReceiver" && trace.events[i].event === "camera-observation") {
        return trace.events[i].details;
      }
    }
    return null;
  }, [trace]);

  const last = trace.events.at(-1);
  return <section style={{ marginBottom: "18px", padding: "14px", border: "1px solid rgba(34,211,238,.3)", borderRadius: "10px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
      <strong>Temporary VLC Diagnostic Trace</strong>
      <span>{active ? "CAPTURING" : "READY"} · {trace.events.length}/{trace.capacity} events</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: "6px", marginTop: "10px", fontSize: "12px" }}>
      {Object.entries(counts).map(([stage, count]) => <div key={stage}>{stage}: <strong>{count}</strong></div>)}
    </div>

    {lastObservation && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "6px", marginTop: "10px", padding: "8px", background: "rgba(0,0,0,0.3)", borderRadius: "6px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
        <div>Luma: <strong>{Number(lastObservation.luminance ?? 0).toFixed(1)}</strong></div>
        <div>Dyn Range: <strong>{Number(lastObservation.dynamicRange ?? 0).toFixed(0)}</strong></div>
        <div>Barker Sync: <strong>{(Number(lastObservation.barkerCorrelation ?? 0) * 100).toFixed(0)}%</strong></div>
        <div>Chips: <strong>{String(lastObservation.recoveredChips ?? 0)}</strong></div>
        <div>Bad Pairs: <strong style={{ color: Number(lastObservation.invalidManchesterPairs ?? 0) > 0 ? "var(--color-amber)" : "inherit" }}>{String(lastObservation.invalidManchesterPairs ?? 0)}</strong></div>
        <div>Bits: <strong>{String(lastObservation.bufferedFrameBits ?? 0)} / {String(lastObservation.expectedFrameBits ?? "?")}</strong></div>
      </div>
    )}

    <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
      Last: {last ? `#${last.sequence} ${last.stage} / ${last.event}` : "No observations yet"}
      {trace.droppedEvents > 0 ? ` · ${trace.droppedEvents} older events discarded` : ""}
    </div>
    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-secondary" onClick={() => downloadOpticalTrace()} disabled={trace.events.length === 0}>Download JSON Trace</button>
      <button type="button" className="btn btn-secondary" onClick={() => { opticalDiagnosticTrace.clear(); setTrace(opticalDiagnosticTrace.snapshot()); }} disabled={active}>Clear Trace</button>
    </div>
  </section>;
}
