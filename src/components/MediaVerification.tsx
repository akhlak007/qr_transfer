import type { MediaMetadata } from "../media/media-metadata";
import { formatBytes, formatDuration } from "./format";

export function MediaVerification({ metadata }: { metadata: MediaMetadata }) {
  return (
    <section className="media-verification">
      <h3>Media verification</h3>
      <div className="media-grid">
        <div><span>Category</span><strong>{metadata.kind}</strong></div>
        <div><span>Format</span><strong>{metadata.format}</strong></div>
        <div><span>File size</span><strong>{formatBytes(metadata.fileSize)}</strong></div>
        {metadata.width !== undefined && metadata.height !== undefined && <div><span>Resolution</span><strong>{metadata.width} × {metadata.height}</strong></div>}
        {metadata.durationSeconds !== undefined && <div><span>Duration</span><strong>{formatDuration(metadata.durationSeconds * 1000)}</strong></div>}
        <div><span>Codec</span><strong>{metadata.codec ?? "Unavailable"}</strong></div>
      </div>
      <p className="metric-note">Metadata is informational. SHA-256 and byte size determine bit-perfect integrity.</p>
    </section>
  );
}
