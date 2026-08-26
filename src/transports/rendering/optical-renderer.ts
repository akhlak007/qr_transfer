import type { TransportId } from "../../core/transport";
import type { VlcModulationScheme } from "../vlc/vlc-framing";
import type { OfdmModulationScheme } from "../ofdm/ofdm-framing";

export interface RendererOptions {
  transport: TransportId;
  vlcModulation?: VlcModulationScheme;
  ofdmModulation?: OfdmModulationScheme;
  ofdmGridSize?: number;
  qrEcc?: "L" | "M" | "Q" | "H";
  qrVersion?: number;
  symbolRate: number;
  frameSequence: number;
  opticalUnitIndex?: number;
}

export interface RendererDiagnostics {
  activeRenderer: TransportId;
  modulationType: string;
  symbolRate: number;
  frameSequence: number;
  transportPipeline: string;
}

export interface RendererResult {
  durationMs: number;
  diagnostics: RendererDiagnostics;
}

export interface OpticalRenderer {
  readonly id: TransportId;
  render(canvas: HTMLCanvasElement, frameBytes: Uint8Array, options: RendererOptions): Promise<RendererResult>;
}
