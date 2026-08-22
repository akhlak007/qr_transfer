import type { IntegrityResult as IntegrityResultModel, IntegrityStatus } from "../core/integrity";

const labels: Record<IntegrityStatus, string> = {
  waiting: "Waiting for reconstructed bytes",
  verifying: "Verifying SHA-256…",
  verified: "SHA-256 verified",
  mismatch: "SHA-256 mismatch",
  unavailable: "Original hash unavailable",
};

export function IntegrityResult({ result }: { result: IntegrityResultModel }) {
  return (
    <div className={`integrity-result ${result.status}`}>
      <div className="integrity-title">Integrity: {labels[result.status]}</div>
      {result.bitPerfect && <div className="bit-perfect">Bit-perfect transfer</div>}
      {result.expectedHashHex && <div className="hash-line"><span>Original</span><code>{result.expectedHashHex}</code></div>}
      {result.actualHashHex && <div className="hash-line"><span>Received</span><code>{result.actualHashHex}</code></div>}
    </div>
  );
}
