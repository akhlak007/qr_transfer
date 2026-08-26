import { TransportId } from "./transport";
import type { VlcModulationScheme } from "../transports/vlc/vlc-framing";
import type { OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";
import type { OfdmReceiverGridSize } from "../transports/ofdm/ofdm-receiver";

export interface ReceiverConfigurationSnapshot {
  transport: TransportId;
  vlcModulation: VlcModulationScheme;
  ofdmModulation: OfdmModulationScheme;
  ofdmGridSize: OfdmReceiverGridSize;
}

export class ReceiverSessionController {
  private readonly reset: () => void;
  private configuration: Readonly<ReceiverConfigurationSnapshot>;
  private receiving = false;
  private finalizing = false;

  constructor(initial: ReceiverConfigurationSnapshot, reset: () => void) {
    this.reset = reset;
    this.configuration = Object.freeze({ ...initial });
  }

  getConfiguration(): Readonly<ReceiverConfigurationSnapshot> { return this.configuration; }
  isLocked(): boolean { return this.receiving || this.finalizing; }
  setReceiving(active: boolean): void { this.receiving = active; }
  setFinalizing(active: boolean): void { this.finalizing = active; }

  changeConfiguration(next: ReceiverConfigurationSnapshot): boolean {
    if (this.isLocked()) return false;
    const snapshot = Object.freeze({ ...next });
    if (JSON.stringify(snapshot) === JSON.stringify(this.configuration)) return true;
    this.reset();
    this.configuration = snapshot;
    return true;
  }
}
