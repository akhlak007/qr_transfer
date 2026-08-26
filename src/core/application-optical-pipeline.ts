import { TransportId, type OpticalDecodeObservation } from "./transport";
import { scanQRCode } from "../modules/qr-scan";
import { VlcOokReceiver } from "../transports/vlc/vlc-receiver";
import { encodeVlcFrame, type VlcModulationScheme } from "../transports/vlc/vlc-framing";
import { modulateVlcFrame } from "../transports/vlc/vlc-modulator";
import { VisualOfdmReceiver, type OfdmReceiverGridSize } from "../transports/ofdm/ofdm-receiver";
import { encodeOfdmFrame, type OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";
import { modulateOfdmBytes } from "../transports/ofdm/ofdm-modulator";

export interface OpticalSchedulingConfig {
  transport: TransportId;
  vlcModulation: VlcModulationScheme;
  ofdmModulation: OfdmModulationScheme;
  ofdmGridSize: OfdmReceiverGridSize;
}

/** The single application-payload -> transport-frame boundary used by live rendering. */
export function frameApplicationPayload(
  config: OpticalSchedulingConfig,
  payload: Uint8Array,
  applicationFrameSequence: number,
): Uint8Array {
  if (config.transport === TransportId.QR) return payload;
  if (config.transport === TransportId.VLC) {
    return encodeVlcFrame({
      version: 1,
      modulation: config.vlcModulation,
      seqNumber: applicationFrameSequence & 0xffff,
      payload,
    });
  }
  if (config.transport === TransportId.VisualOFDM) {
    return encodeOfdmFrame({
      version: 1,
      modulation: config.ofdmModulation,
      gridSize: config.ofdmGridSize,
      pilotConfig: 1,
      seqNumber: applicationFrameSequence & 0xffff,
      payload,
    });
  }
  throw new Error(`Unsupported optical scheduling transport: ${String(config.transport)}`);
}

export class OpticalFrameScheduler {
  private readonly config: OpticalSchedulingConfig;
  private activeBytes: Uint8Array | null = null;
  private applicationFrameSequence = 0;
  private opticalSymbolIndex = 0;
  private opticalGridIndex = 0;
  private totalOpticalSymbols = 0;
  private totalOpticalGrids = 0;

  constructor(config: OpticalSchedulingConfig) { this.config = config; }

  beginFrame(applicationPayload: Uint8Array): void {
    if (this.activeBytes) throw new Error("Cannot advance application payload before optical frame completes");
    const framedBytes = frameApplicationPayload(this.config, applicationPayload, this.applicationFrameSequence);
    this.activeBytes = framedBytes;
    this.opticalSymbolIndex = 0;
    this.opticalGridIndex = 0;
    this.totalOpticalSymbols = this.config.transport === TransportId.VLC
      ? modulateVlcFrame(framedBytes, this.config.vlcModulation).totalSymbols : 0;
    this.totalOpticalGrids = this.config.transport === TransportId.VisualOFDM
      ? modulateOfdmBytes(framedBytes, this.config.ofdmModulation, this.config.ofdmGridSize).length : 0;
  }

  getActiveBytes(): Uint8Array {
    if (!this.activeBytes) throw new Error("No active application payload");
    return this.activeBytes;
  }

  getOpticalUnitIndex(): number {
    if (this.config.transport === TransportId.VLC) return this.opticalSymbolIndex;
    if (this.config.transport === TransportId.VisualOFDM) return this.opticalGridIndex;
    return 0;
  }

  markRendered(): boolean {
    if (!this.activeBytes) throw new Error("No active application payload");
    if (this.config.transport === TransportId.VLC) this.opticalSymbolIndex++;
    else if (this.config.transport === TransportId.VisualOFDM) this.opticalGridIndex++;
    const complete = this.config.transport === TransportId.QR
      ? true
      : this.config.transport === TransportId.VLC
        ? this.opticalSymbolIndex >= this.totalOpticalSymbols
        : this.opticalGridIndex >= this.totalOpticalGrids;
    if (complete) {
      this.activeBytes = null;
      this.applicationFrameSequence++;
    }
    return complete;
  }

  hasActiveFrame(): boolean { return this.activeBytes !== null; }
  getSnapshot() {
    return {
      applicationFrameSequence: this.applicationFrameSequence,
      opticalSymbolIndex: this.opticalSymbolIndex,
      opticalGridIndex: this.opticalGridIndex,
      totalOpticalSymbols: this.totalOpticalSymbols,
      totalOpticalGrids: this.totalOpticalGrids,
      hasActiveFrame: this.activeBytes !== null,
    };
  }
}

export type OpticalCameraSource = ImageData | HTMLCanvasElement
  | { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
type QrDecoder = (source: OpticalCameraSource) => Promise<OpticalDecodeObservation>;

export interface LiveReceiverConfiguration {
  transport: TransportId;
  ofdmModulation: OfdmModulationScheme;
  ofdmGridSize: OfdmReceiverGridSize;
}

export class LiveReceiverRouter {
  private readonly config: LiveReceiverConfiguration;
  private readonly qrDecoder: QrDecoder;
  private readonly vlcReceiver: VlcOokReceiver | null;
  private readonly ofdmReceiver: VisualOfdmReceiver | null;
  private readonly payloadQueue: Uint8Array[] = [];

  constructor(
    config: LiveReceiverConfiguration,
    qrDecoder: QrDecoder = (source) => scanQRCode(source as ImageData | HTMLCanvasElement),
  ) {
    this.config = config;
    this.qrDecoder = qrDecoder;
    if (![TransportId.QR, TransportId.VLC, TransportId.VisualOFDM].includes(config.transport)) {
      throw new Error(`Unsupported live receiver transport: ${String(config.transport)}`);
    }
    this.vlcReceiver = config.transport === TransportId.VLC ? new VlcOokReceiver() : null;
    this.ofdmReceiver = config.transport === TransportId.VisualOFDM
      ? new VisualOfdmReceiver({ modulation: config.ofdmModulation, gridSize: config.ofdmGridSize }) : null;
    this.vlcReceiver?.onFrame((event) => { this.payloadQueue.push(event.rawPayload); });
    this.ofdmReceiver?.onFrame((event) => { this.payloadQueue.push(event.rawPayload); });
  }

  async ingest(source: OpticalCameraSource) {
    const started = performance.now();
    if (this.config.transport === TransportId.QR) {
      const observation = await this.qrDecoder(source);
      const payloads = observation.outcome === "decoded" && observation.bytes ? [observation.bytes] : [];
      return { transport: TransportId.QR, payloads, crcStatus: "not-applicable" as const,
        recoveredFrames: payloads.length, durationMs: performance.now() - started };
    }
    if (this.config.transport === TransportId.VLC && this.vlcReceiver) {
      const diagnostics = this.vlcReceiver.ingestFrame(source);
      return this.drain(TransportId.VLC, diagnostics.crcStatus, diagnostics.validFramesCount, started);
    }
    if (this.config.transport === TransportId.VisualOFDM && this.ofdmReceiver) {
      const diagnostics = this.ofdmReceiver.ingestFrame(source);
      return this.drain(TransportId.VisualOFDM, diagnostics.crcStatus, diagnostics.validFramesCount, started);
    }
    throw new Error(`No live receiver pipeline for ${this.config.transport}`);
  }

  private drain(transport: TransportId, crcStatus: string, recoveredFrames: number, started: number) {
    return { transport, payloads: this.payloadQueue.splice(0), crcStatus, recoveredFrames,
      durationMs: performance.now() - started };
  }
}
