import { TRANSPORTS, type TransportId } from "../core/transport";

export function ModeBadge({ transport }: { transport: TransportId }) {
  const descriptor = TRANSPORTS[transport];
  return (
    <span className={`mode-badge ${descriptor.maturity}`}>
      {descriptor.label}
      {descriptor.maturity !== "baseline" && <span className="mode-maturity">{descriptor.maturity === "experimental" ? "Experimental" : "Research Prototype"}</span>}
    </span>
  );
}
