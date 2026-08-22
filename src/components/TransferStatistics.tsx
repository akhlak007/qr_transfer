import { formatBytes, formatDuration, formatPercent } from "./format";
import { ModeBadge } from "./ModeBadge";
import { TransportId } from "../core/transport";

interface TransferStatisticsProps {
  fileName: string;
  fileSize: number;
  progress: number;
  decodedFrames: number;
  missedFrames: number;
  invalidFrames: number;
  duplicateFrames: number;
  acceptedSymbols: number;
  cameraFps: number;
  screenFps: number | null;
  throughputBytesPerSecond: number;
  elapsedMs: number;
  remainingMs: number | null;
}

export function TransferStatistics(props: TransferStatisticsProps) {
  const attempts = props.decodedFrames + props.missedFrames + props.invalidFrames;
  const hitRate = attempts > 0 ? props.decodedFrames / attempts : null;
  return (
    <section className="transfer-dashboard" aria-label="Transfer statistics">
      <div className="dashboard-heading">
        <div><span className="eyebrow">Transmission mode</span><ModeBadge transport={TransportId.QR} /></div>
        <div className="dashboard-file"><strong>{props.fileName}</strong><span>{formatBytes(props.fileSize)}</span></div>
      </div>
      <div className="dashboard-progress"><div style={{ width: `${Math.max(0, Math.min(100, props.progress))}%` }} /></div>
      <div className="stats-grid research-stats">
        <div className="stat-item"><div className="stat-label">Progress</div><div className="stat-value">{props.progress.toFixed(1)}%</div></div>
        <div className="stat-item"><div className="stat-label">Effective throughput</div><div className="stat-value">{formatBytes(props.throughputBytesPerSecond)}/s</div></div>
        <div className="stat-item"><div className="stat-label">Frame hit rate</div><div className="stat-value">{formatPercent(hitRate)}</div></div>
        <div className="stat-item"><div className="stat-label">QR frames decoded</div><div className="stat-value">{props.decodedFrames}</div></div>
        <div className="stat-item"><div className="stat-label">Camera decode misses</div><div className="stat-value">{props.missedFrames}</div></div>
        <div className="stat-item"><div className="stat-label">Invalid decode attempts</div><div className="stat-value">{props.invalidFrames}</div></div>
        <div className="stat-item"><div className="stat-label">Duplicate / redundant</div><div className="stat-value">{props.duplicateFrames}</div></div>
        <div className="stat-item"><div className="stat-label">Accepted symbols</div><div className="stat-value">{props.acceptedSymbols}</div></div>
        <div className="stat-item"><div className="stat-label">Camera / screen FPS</div><div className="stat-value">{props.cameraFps.toFixed(1)} / {props.screenFps === null ? "Unavailable" : props.screenFps.toFixed(1)}</div></div>
        <div className="stat-item"><div className="stat-label">Elapsed</div><div className="stat-value">{formatDuration(props.elapsedMs)}</div></div>
        <div className="stat-item"><div className="stat-label">Estimated remaining</div><div className="stat-value">{formatDuration(props.remainingMs)}</div></div>
      </div>
      <p className="metric-note">Camera misses are decode attempts without a QR result. Transmitter packet loss is unavailable until sequence-bearing frames are introduced.</p>
    </section>
  );
}
