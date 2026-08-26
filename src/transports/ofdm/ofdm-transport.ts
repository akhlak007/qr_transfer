/**
 * Visual OFDM Optical Transport Contract (Milestone 4A)
 *
 * Implements the transport layer contract for Visual OFDM spatial-frequency modulation.
 *
 * NOTE: Explicitly designated as an Experimental Research Prototype (Not Physically Tested).
 */

import { TransportId, type TransportDescriptor, type TransportMaturity } from "../../core/transport";
import {
  encodeOfdmFrame,
  decodeOfdmFrame,
  type OfdmFrame,
  type OfdmDecodedFrame,
  type OfdmModulationScheme,
} from "./ofdm-framing";
import {
  modulateOfdmBytes,
  type OfdmSymbolGrid,
} from "./ofdm-modulator";
export { VisualOfdmReceiver } from "./ofdm-receiver";
export type {
  VisualOfdmReceiverConfig,
  VisualOfdmReceiverDiagnostics,
  OfdmReceiverGridSize,
} from "./ofdm-receiver";

export interface VisualOfdmTransportConfig {
  defaultModulation: OfdmModulationScheme;
  defaultGridSize: number;
  targetFps: number;
}

export const DEFAULT_OFDM_CONFIG: VisualOfdmTransportConfig = {
  defaultModulation: "bpsk",
  defaultGridSize: 16,
  targetFps: 15,
};

export class VisualOfdmTransport {
  static readonly id = TransportId.VisualOFDM;
  static readonly label = "Visual OFDM (Research Prototype)";
  static readonly maturity: TransportMaturity = "research-prototype";

  private config: VisualOfdmTransportConfig;
  private seqCounter = 0;

  constructor(config: Partial<VisualOfdmTransportConfig> = {}) {
    this.config = { ...DEFAULT_OFDM_CONFIG, ...config };
  }

  static getDescriptor(): TransportDescriptor {
    return {
      id: TransportId.VisualOFDM,
      label: this.label,
      maturity: this.maturity,
      available: true,
    };
  }

  /**
   * Package a payload into a serialized OFDM frame with header and CRC-16.
   */
  packageFrame(
    payload: Uint8Array,
    modulation?: OfdmModulationScheme,
    gridSize?: number
  ): Uint8Array {
    const scheme = modulation ?? this.config.defaultModulation;
    const size = gridSize ?? this.config.defaultGridSize;

    const frame: OfdmFrame = {
      version: 1,
      modulation: scheme,
      gridSize: size,
      pilotConfig: 1,
      seqNumber: this.seqCounter++,
      payload,
    };
    return encodeOfdmFrame(frame);
  }

  /**
   * Decode and validate an incoming OFDM frame buffer.
   */
  unpackageFrame(bytes: Uint8Array): OfdmDecodedFrame | null {
    return decodeOfdmFrame(bytes);
  }

  /**
   * Modulate frame bytes into 2D spatial-frequency symbol grids.
   */
  modulate(
    frameBytes: Uint8Array,
    modulation?: OfdmModulationScheme,
    gridSize?: number
  ): OfdmSymbolGrid[] {
    const scheme = modulation ?? this.config.defaultModulation;
    const size = gridSize ?? this.config.defaultGridSize;
    return modulateOfdmBytes(frameBytes, scheme, size);
  }

  resetSequence(): void {
    this.seqCounter = 0;
  }
}
