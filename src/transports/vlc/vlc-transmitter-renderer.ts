import { TransportId } from "../../core/transport";
import { modulateManchesterOok, modulateVlcFrame } from "./vlc-modulator";
import type { OpticalRenderer, RendererOptions, RendererResult } from "../rendering/optical-renderer";

export function createVlcRenderRepresentation(bytes: Uint8Array, options: RendererOptions) {
  const modulation = options.vlcModulation ?? "ook";
  const stream = modulation === "ook" ? modulateManchesterOok(bytes) : modulateVlcFrame(bytes, modulation);
  const index = (options.opticalUnitIndex ?? 0) % stream.totalSymbols;
  return { modulation, stream, index, color: stream.colors[index] ?? [0, 0, 0] };
}

export class VlcTransmitterRenderer implements OpticalRenderer {
  readonly id = TransportId.VLC;

  async render(canvas: HTMLCanvasElement, bytes: Uint8Array, options: RendererOptions): Promise<RendererResult> {
    const started = performance.now();
    const { modulation, stream, index, color } = createVlcRenderRepresentation(bytes, options);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("VLC renderer requires a 2D canvas");
    ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    ctx.fillRect(0, 0, canvas.width, Math.floor(canvas.height * 0.78));
    ctx.fillStyle = "rgba(8,12,24,.96)";
    ctx.fillRect(0, Math.floor(canvas.height * 0.78), canvas.width, Math.ceil(canvas.height * 0.22));
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const waveformStart = Math.max(0, index - 31);
    const waveformCount = Math.min(32, stream.totalSymbols - waveformStart);
    for (let i = 0; i < waveformCount; i++) {
      const level = stream.levels[waveformStart + i] / 255;
      const x = (i / Math.max(1, waveformCount - 1)) * canvas.width;
      const y = canvas.height * 0.98 - level * canvas.height * 0.16;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "600 14px sans-serif";
    ctx.fillText(`VLC · ${modulation.toUpperCase()} · symbol ${index + 1}/${stream.totalSymbols}`, 16, 24);
    return {
      durationMs: performance.now() - started,
      diagnostics: {
        activeRenderer: TransportId.VLC,
        modulationType: modulation.toUpperCase(),
        symbolRate: options.symbolRate,
        frameSequence: options.frameSequence,
        transportPipeline: "File → Chunk/Fountain → VLC Modulator → Screen",
      },
    };
  }
}
