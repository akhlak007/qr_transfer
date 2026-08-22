import QRCode from "qrcode";
import type { OpticalRenderObservation } from "../core/transport";

export interface QRCodeRenderOptions {
  ecc: "L" | "M" | "Q" | "H";
  version?: number;
}

/**
 * Renders a Uint8Array into a canvas as a binary QR Code.
 */
export async function renderQRToCanvas(
  canvas: HTMLCanvasElement,
  data: Uint8Array,
  options: QRCodeRenderOptions
): Promise<OpticalRenderObservation> {
  const startedAt = performance.now();
  const qrData = [{ data, mode: "byte" as const }];
  
  await QRCode.toCanvas(canvas, qrData, {
    errorCorrectionLevel: options.ecc,
    version: options.version,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    width: Math.min(canvas.parentElement?.clientWidth || 400, 500),
  });

  return {
    durationMs: performance.now() - startedAt,
    completedAt: performance.now(),
    payloadBytes: data.byteLength,
  };
}
