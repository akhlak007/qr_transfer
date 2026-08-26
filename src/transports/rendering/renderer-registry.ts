import { TransportId } from "../../core/transport";
import type { OpticalRenderer, RendererOptions, RendererResult } from "./optical-renderer";

export class RendererRegistry {
  private readonly renderers = new Map<TransportId, OpticalRenderer>();

  register(renderer: OpticalRenderer): this {
    this.renderers.set(renderer.id, renderer);
    return this;
  }

  get(id: TransportId): OpticalRenderer {
    const renderer = this.renderers.get(id);
    if (!renderer) throw new Error(`No optical renderer registered for ${id}`);
    return renderer;
  }

  render(id: TransportId, canvas: HTMLCanvasElement, bytes: Uint8Array, options: RendererOptions): Promise<RendererResult> {
    return this.get(id).render(canvas, bytes, options);
  }
}
