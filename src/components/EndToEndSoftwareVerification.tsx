import React from "react";
import type { SoftwareOpticalIntegrationResult } from "../research/software-optical-integration";
import { SOFTWARE_CHANNEL_LABEL } from "../research/software-optical-channel";

const mark = (value: boolean) => value ? "PASS" : "FAIL";

interface Props {
  results: readonly SoftwareOpticalIntegrationResult[] | null;
  running: boolean;
  error: string | null;
  onExecute(): void;
}

export const EndToEndSoftwareVerification: React.FC<Props> = ({ results, running, error, onExecute }) => {

  return (
    <section style={{ marginTop: 20, padding: 16, border: "1px solid var(--border-color)", borderRadius: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>End-to-End Software Verification</h3>
          <small>Verification type: SOFTWARE · {SOFTWARE_CHANNEL_LABEL}</small>
        </div>
        <button className="btn btn-primary" type="button" onClick={onExecute} disabled={running}>
          {running ? "Running actual pipelines…" : "Run software verification"}
        </button>
      </div>
      {error && <p style={{ color: "#fca5a5" }}>FAILED: {error}</p>}
      {!results && !running && !error && <p>No integration run has been executed in this session. No success is inferred.</p>}
      {results && (
        <div className="research-table-wrapper" style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="research-table" style={{ width: "100%", fontSize: 11 }}>
            <thead><tr><th>Protocol</th><th>Configuration</th><th>TX</th><th>Channel</th><th>RX</th><th>CRC</th><th>Reconstruction</th><th>SHA-256</th><th>Status</th></tr></thead>
            <tbody>{results.map((result) => (
              <tr key={`${result.protocol}-${result.configuration}`}>
                <td>{result.protocol}</td><td>{result.configuration}</td>
                <td>{mark(result.txSuccess)}</td><td>{mark(result.channelSuccess)}</td>
                <td>{mark(result.rxSuccess)}</td><td>{result.crcStatus === "not-applicable" ? "N/A" : result.crcStatus.toUpperCase()}</td>
                <td>{mark(result.reconstructionSuccess)}</td><td>{mark(result.sha256Success)}</td>
                <td>{result.status}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
};
