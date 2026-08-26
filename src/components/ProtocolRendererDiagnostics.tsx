import type { RendererDiagnostics } from "../transports/rendering/optical-renderer";

export function ProtocolRendererDiagnostics({ diagnostics }: { diagnostics: RendererDiagnostics | null }) {
  if (!diagnostics) return null;
  return <div className="renderer-diagnostics" aria-label="Protocol renderer diagnostics">
    <div><strong>Renderer:</strong> {diagnostics.activeRenderer}</div>
    <div><strong>Modulation:</strong> {diagnostics.modulationType}</div>
    <div><strong>Symbol rate:</strong> {diagnostics.symbolRate} symbols/s</div>
    <div><strong>Frame:</strong> {diagnostics.frameSequence}</div>
    <div><strong>Pipeline:</strong> {diagnostics.transportPipeline}</div>
  </div>;
}
