import { TransportId } from "../../core/transport";
import { createSubcarrierMap } from "./ofdm-framing";
import { modulateOfdmBytes } from "./ofdm-modulator";
import { renderOfdmGridToPixels } from "./ofdm-renderer";
import type { OpticalRenderer, RendererOptions, RendererResult } from "../rendering/optical-renderer";

export function createVisualOfdmRenderRepresentation(
  bytes: Uint8Array,
  options: RendererOptions,
  targetDisplaySize: number,
) {
  const modulation = options.ofdmModulation ?? "bpsk";
  const gridSize = options.ofdmGridSize ?? 16;
  const map = createSubcarrierMap(gridSize);
  const grids = modulateOfdmBytes(bytes, modulation, gridSize, map);
  const index = (options.opticalUnitIndex ?? 0) % grids.length;
  return { modulation, gridSize, grids, index, rendered: renderOfdmGridToPixels(grids[index], targetDisplaySize) };
}

export class VisualOfdmTransmitterRenderer implements OpticalRenderer {
  readonly id = TransportId.VisualOFDM;

  async render(canvas: HTMLCanvasElement, bytes: Uint8Array, options: RendererOptions): Promise<RendererResult> {
    const started = performance.now();
    const representation = createVisualOfdmRenderRepresentation(
      bytes, options, Math.min(canvas.width, canvas.height),
    );
    const { modulation, rendered } = representation;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Visual OFDM renderer requires a 2D canvas");
    const image = ctx.createImageData(rendered.width, rendered.height);
    image.data.set(rendered.pixelBuffer);
    ctx.putImageData(image, 0, 0);
    return {
      durationMs: performance.now() - started,
      diagnostics: {
        activeRenderer: TransportId.VisualOFDM,
        modulationType: modulation.toUpperCase(),
        symbolRate: options.symbolRate,
        frameSequence: options.frameSequence,
        transportPipeline: "File → Chunk/Fountain → OFDM Subcarriers → Screen",
      },
    };
  }
}
