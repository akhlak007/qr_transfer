/**
 * VLC Optical Transport Implementation (Milestone 3A)
 *
 * Implements the optical transport layer for Visible Light Communication (VLC).
 * Provides frame creation, Barker sync management, intensity modulation, and CRC integrity.
 *
 * NOTE: This is explicitly labeled as an Experimental Research Prototype.
 */

import { TransportId, type TransportDescriptor, type TransportMaturity } from "../../core/transport";
import {
  encodeVlcFrame,
  decodeVlcFrame,
  type VlcFrame,
  type VlcDecodedFrame,
  type VlcModulationScheme,
} from "./vlc-framing";
import {
  modulateVlcFrame,
  type VlcModulatedStream,
} from "./vlc-modulator";
import { VlcOokReceiver, VlcReceiver, type VlcReceiverConfig } from "./vlc-receiver";

export { VlcOokReceiver, VlcReceiver, type VlcReceiverConfig };

export interface VlcTransportConfig {
  defaultModulation: VlcModulationScheme;
  targetFps: number;
}

export const DEFAULT_VLC_CONFIG: VlcTransportConfig = {
  defaultModulation: "ook",
  targetFps: 30,
};

export class VlcTransport {
  static readonly id = TransportId.VLC;
  static readonly label = "Visible Light Communication (Experimental Prototype)";
  static readonly maturity: TransportMaturity = "experimental";

  private config: VlcTransportConfig;
  private seqCounter = 0;

  constructor(config: Partial<VlcTransportConfig> = {}) {
    this.config = { ...DEFAULT_VLC_CONFIG, ...config };
  }

  static getDescriptor(): TransportDescriptor {
    return {
      id: TransportId.VLC,
      label: this.label,
      maturity: this.maturity,
      available: true,
    };
  }

  /**
   * Create an instance of the VLC OOK Optical Receiver.
   */
  createReceiver(config?: Partial<VlcReceiverConfig>): VlcOokReceiver {
    return new VlcOokReceiver(config);
  }

  /**
   * Package a payload into a serialized VLC frame with header and CRC-16.
   */
  packageFrame(payload: Uint8Array, modulation?: VlcModulationScheme): Uint8Array {
    const scheme = modulation ?? this.config.defaultModulation;
    const frame: VlcFrame = {
      version: 1,
      modulation: scheme,
      seqNumber: this.seqCounter++,
      payload,
    };
    return encodeVlcFrame(frame);
  }

  /**
   * Parse and validate a received byte buffer as a VLC frame.
   */
  unpackageFrame(bytes: Uint8Array): VlcDecodedFrame | null {
    return decodeVlcFrame(bytes);
  }

  /**
   * Modulate frame bytes into an optical stream of intensity levels (OOK / 4-PAM).
   */
  modulate(frameBytes: Uint8Array, modulation?: VlcModulationScheme): VlcModulatedStream {
    const scheme = modulation ?? this.config.defaultModulation;
    return modulateVlcFrame(frameBytes, scheme);
  }

  resetSequence(): void {
    this.seqCounter = 0;
  }
}
