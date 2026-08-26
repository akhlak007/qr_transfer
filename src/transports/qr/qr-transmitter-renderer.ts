import { TransportId } from "../../core/transport";
import { renderQRToCanvas } from "../../modules/qr-render";
import type { OpticalRenderer, RendererOptions, RendererResult } from "../rendering/optical-renderer";

export class QRTransmitterRenderer implements OpticalRenderer {
  readonly id = TransportId.QR;

  async render(canvas: HTMLCanvasElement, frameBytes: Uint8Array, options: RendererOptions): Promise<RendererResult> {
    const observation = await renderQRToCanvas(canvas, frameBytes, { ecc: options.qrEcc ?? "L", version: options.qrVersion });
    return {
      durationMs: observation.durationMs,
      diagnostics: {
        activeRenderer: TransportId.QR,
        modulationType: "QR matrix",
        symbolRate: options.symbolRate,
        frameSequence: options.frameSequence,
        transportPipeline: "File → Chunk/Fountain → QR Encoder → Screen",
      },
    };
  }
}
