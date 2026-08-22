interface OpticalSignalMetricsProps {
  configuredBrightnessPercent: number;
  cameraFps: number;
  screenFps: number | null;
  ambientLightEstimate?: string;
  signalQuality?: string;
}

export function OpticalSignalMetrics({
  configuredBrightnessPercent,
  cameraFps,
  screenFps,
  ambientLightEstimate = "Not measured in QR baseline",
  signalQuality = "Not measured in QR baseline",
}: OpticalSignalMetricsProps) {
  return (
    <section className="signal-panel" aria-label="Optical signal metrics">
      <h3>Optical Signal</h3>
      <div className="signal-grid">
        <div><span>Canvas brightness</span><strong>{configuredBrightnessPercent}%</strong></div>
        <div><span>Camera FPS</span><strong>{cameraFps.toFixed(1)}</strong></div>
        <div><span>Screen FPS</span><strong>{screenFps === null ? "Unavailable at receiver" : screenFps.toFixed(1)}</strong></div>
        <div><span>Ambient light</span><strong>{ambientLightEstimate}</strong></div>
        <div><span>Signal quality</span><strong>{signalQuality}</strong></div>
      </div>
      <p className="metric-note">Canvas intensity is not the device's physical screen-brightness setting.</p>
    </section>
  );
}
