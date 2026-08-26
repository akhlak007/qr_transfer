import QRCode from "qrcode";
import { TransportId } from "../core/transport";
import { sha256, sha256Hex } from "../core/integrity";
import { ApplicationReconstructionService } from "../core/application-reconstruction-service";
import { chunkFile } from "../modules/chunker";
import { FountainEncoder, mulberry32 } from "../modules/fountain";
import {
  encodeFountainFrame,
  encodeMetadataFrame,
  encodeSequentialFrame,
  type FileMetadata,
} from "../modules/protocol";
import { scanQRCode } from "../modules/qr-scan";
import { encodeVlcFrame } from "../transports/vlc/vlc-framing";
import { modulateVlcFrame } from "../transports/vlc/vlc-modulator";
import { VlcOokReceiver } from "../transports/vlc/vlc-receiver";
import { encodeOfdmFrame, type OfdmModulationScheme } from "../transports/ofdm/ofdm-framing";
import { modulateOfdmBytes } from "../transports/ofdm/ofdm-modulator";
import { idct2D } from "../transports/ofdm/ofdm-fft";
import { VisualOfdmReceiver, type OfdmReceiverGridSize } from "../transports/ofdm/ofdm-receiver";
import {
  SOFTWARE_CHANNEL_LABEL,
  DEFAULT_SOFTWARE_CHANNEL_SEED,
  SoftwareOpticalChannel,
  type SoftwareOpticalChannelConfig,
  type SoftwareOpticalChannelDiagnostics,
} from "./software-optical-channel";
import { TransportPipelineRegistry, type SoftwareTransportPipeline } from "./transport-pipeline-registry";

export type SoftwareIntegrationStatus = "SOFTWARE_END_TO_END_VERIFIED" | "FAILED";
export type IntegrationTransferMode = "sequential" | "fountain";
export type IntegrationCrcStatus = "valid" | "invalid" | "not-applicable";
export type SoftwareVerificationSource = "PHASE_8E_SOFTWARE_HARNESS" | "PHASE_9_2_COMPOSED_SOFTWARE";

export interface SoftwareProtocolConfigurationSnapshot {
  transport: TransportId;
  modulation: string;
  gridSize: OfdmReceiverGridSize | null;
  transferMode: IntegrationTransferMode;
}

export interface SoftwareOpticalIntegrationConfig {
  transport: TransportId;
  payload: Uint8Array;
  transferMode?: IntegrationTransferMode;
  modulation?: OfdmModulationScheme;
  gridSize?: OfdmReceiverGridSize;
  blockSize?: number;
  channel?: Partial<SoftwareOpticalChannelConfig>;
}

export interface SoftwareOpticalIntegrationResult {
  runId: string;
  timestamp: string;
  completedAt: string;
  durationMs: number;
  protocolConfiguration: Readonly<SoftwareProtocolConfigurationSnapshot>;
  softwareChannelSeed: number;
  verificationSource: SoftwareVerificationSource;
  verificationType: "SOFTWARE";
  channelLabel: typeof SOFTWARE_CHANNEL_LABEL;
  protocol: TransportId;
  configuration: string;
  transferMode: IntegrationTransferMode;
  txSuccess: boolean;
  channelSuccess: boolean;
  rxSuccess: boolean;
  crcStatus: IntegrationCrcStatus;
  reconstructionSuccess: boolean;
  sha256Success: boolean;
  expectedSha256: string;
  actualSha256: string | null;
  recoveredFrames: number;
  fountainSymbolsAccepted: number;
  multiUnitFrames: number;
  channelDiagnostics: SoftwareOpticalChannelDiagnostics;
  status: SoftwareIntegrationStatus;
  failureReason: string | null;
}

interface PipelineRunContext extends SoftwareOpticalIntegrationConfig {
  runId: string;
  timestamp: string;
  startedAt: number;
  transferMode: IntegrationTransferMode;
  blockSize: number;
  metadata: FileMetadata;
  expectedSha256: string;
  protocolPayloads: Uint8Array[];
}

let integrationRunSequence = 0;
const integrationStartTimes = new WeakMap<object, number>();

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function createBaseResult(
  context: PipelineRunContext,
  configuration: string,
  channel: SoftwareOpticalChannel,
): SoftwareOpticalIntegrationResult {
  const result: SoftwareOpticalIntegrationResult = {
    runId: context.runId,
    timestamp: context.timestamp,
    completedAt: "",
    durationMs: 0,
    protocolConfiguration: Object.freeze({
      transport: context.transport,
      modulation: context.transport === TransportId.VLC ? "ook" : context.modulation ?? "qr",
      gridSize: context.transport === TransportId.VisualOFDM ? context.gridSize ?? 16 : null,
      transferMode: context.transferMode,
    }),
    softwareChannelSeed: context.channel?.seed ?? DEFAULT_SOFTWARE_CHANNEL_SEED,
    verificationSource: "PHASE_8E_SOFTWARE_HARNESS",
    verificationType: "SOFTWARE",
    channelLabel: SOFTWARE_CHANNEL_LABEL,
    protocol: context.transport,
    configuration,
    transferMode: context.transferMode,
    txSuccess: false,
    channelSuccess: false,
    rxSuccess: false,
    crcStatus: context.transport === TransportId.QR ? "not-applicable" : "invalid",
    reconstructionSuccess: false,
    sha256Success: false,
    expectedSha256: context.expectedSha256,
    actualSha256: null,
    recoveredFrames: 0,
    fountainSymbolsAccepted: 0,
    multiUnitFrames: 0,
    channelDiagnostics: channel.getDiagnostics(),
    status: "FAILED",
    failureReason: null,
  };
  integrationStartTimes.set(result, context.startedAt);
  return result;
}

async function finalizeResult(
  result: SoftwareOpticalIntegrationResult,
  recovered: Uint8Array | null,
  channel: SoftwareOpticalChannel,
): Promise<SoftwareOpticalIntegrationResult> {
  result.channelDiagnostics = channel.getDiagnostics();
  result.channelSuccess = result.channelDiagnostics.unitsProcessed > 0;
  result.reconstructionSuccess = recovered !== null;
  result.actualSha256 = recovered ? result.actualSha256 ?? await sha256Hex(recovered) : null;
  result.sha256Success = result.actualSha256 === result.expectedSha256;
  const crcSatisfied = result.protocol === TransportId.QR
    ? result.crcStatus === "not-applicable"
    : result.crcStatus === "valid";
  const complete = result.txSuccess && result.channelSuccess && result.rxSuccess
    && crcSatisfied && result.reconstructionSuccess && result.sha256Success;
  result.status = complete ? "SOFTWARE_END_TO_END_VERIFIED" : "FAILED";
  result.failureReason = complete ? null : result.failureReason ?? "Complete software optical path did not verify";
  result.completedAt = new Date().toISOString();
  result.durationMs = Math.max(0, performance.now() - (integrationStartTimes.get(result) ?? performance.now()));
  if (!Number.isFinite(result.durationMs)) result.durationMs = 0;
  return deepFreeze({ ...result, channelDiagnostics: { ...result.channelDiagnostics } });
}

async function finalizeReconstruction(
  result: SoftwareOpticalIntegrationResult,
  reconstruction: ApplicationReconstructionService,
  channel: SoftwareOpticalChannel,
): Promise<SoftwareOpticalIntegrationResult> {
  const promise = reconstruction.getFinalizationPromise();
  const completed = promise ? await promise : null;
  result.fountainSymbolsAccepted = reconstruction.getSnapshot().mode === "fountain"
    ? reconstruction.getSnapshot().acceptedFrames - 1 : 0;
  if (completed) result.actualSha256 = completed.actualSha256;
  return finalizeResult(result, completed?.data ?? null, channel);
}

function renderQrImage(bytes: Uint8Array): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = QRCode.create([{ data: bytes, mode: "byte" }], { errorCorrectionLevel: "L" });
  const margin = 4;
  const scale = 8;
  const moduleCount = qr.modules.size;
  const width = (moduleCount + margin * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);
  for (let row = 0; row < moduleCount; row++) {
    for (let column = 0; column < moduleCount; column++) {
      if (!qr.modules.get(row, column)) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const pixelX = (column + margin) * scale + x;
          const pixelY = (row + margin) * scale + y;
          const offset = (pixelY * width + pixelX) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
          data[offset + 3] = 255;
        }
      }
    }
  }
  return { data, width, height: width };
}

function asImageData(source: { data: Uint8ClampedArray; width: number; height: number }): ImageData {
  if (typeof ImageData !== "undefined") {
    return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  }
  if (typeof (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement === "undefined") {
    Object.defineProperty(globalThis, "HTMLCanvasElement", { value: class HTMLCanvasElement {}, configurable: true });
  }
  return source as ImageData;
}

class QrIntegrationPipeline implements SoftwareTransportPipeline<PipelineRunContext, SoftwareOpticalIntegrationResult> {
  readonly transport = TransportId.QR;

  async run(context: PipelineRunContext): Promise<SoftwareOpticalIntegrationResult> {
    const channel = new SoftwareOpticalChannel(context.channel);
    const result = createBaseResult(context, "QR Matrix", channel);
    const reconstruction = new ApplicationReconstructionService();
    let unitIndex = 0;
    try {
      result.txSuccess = true;
      for (const payload of context.protocolPayloads) {
        const delivered = channel.transmitRgba(renderQrImage(payload), unitIndex++);
        if (!delivered) continue;
        const decoded = await scanQRCode(asImageData(delivered));
        if (decoded.outcome === "decoded" && decoded.bytes) {
          result.recoveredFrames++;
          reconstruction.ingest(decoded.bytes);
        }
      }
      result.rxSuccess = result.recoveredFrames > 0;
      result.crcStatus = "not-applicable";
      return finalizeReconstruction(result, reconstruction, channel);
    } catch (error) {
      result.failureReason = error instanceof Error ? error.message : "QR integration failed";
      return finalizeResult(result, null, channel);
    }
  }
}

class VlcIntegrationPipeline implements SoftwareTransportPipeline<PipelineRunContext, SoftwareOpticalIntegrationResult> {
  readonly transport = TransportId.VLC;

  async run(context: PipelineRunContext): Promise<SoftwareOpticalIntegrationResult> {
    const channel = new SoftwareOpticalChannel(context.channel);
    const result = createBaseResult(context, "OOK", channel);
    const receiver = new VlcOokReceiver();
    const reconstruction = new ApplicationReconstructionService();
    receiver.onFrame((event) => { reconstruction.ingest(event.rawPayload); });
    let sequence = 0;
    let unitIndex = 0;
    try {
      result.txSuccess = true;
      for (const payload of context.protocolPayloads) {
        const encoded = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: sequence++, payload });
        const stream = modulateVlcFrame(encoded, "ook");
        if (stream.totalSymbols > 1) result.multiUnitFrames++;
        for (let symbol = 0; symbol < stream.totalSymbols; symbol++) {
          const delivered = channel.transmitVlcSymbol(stream.levels[symbol], stream.colors[symbol], unitIndex++);
          if (delivered) receiver.ingestLuminanceSample(delivered.luminance, delivered.rgb);
        }
      }
      const diagnostics = receiver.getDiagnostics();
      result.recoveredFrames = diagnostics.validFramesCount;
      result.rxSuccess = diagnostics.validFramesCount > 0;
      result.crcStatus = diagnostics.corruptFramesCount === 0 && diagnostics.crcStatus === "valid"
        ? "valid" : "invalid";
      return finalizeReconstruction(result, reconstruction, channel);
    } catch (error) {
      result.failureReason = error instanceof Error ? error.message : "VLC integration failed";
      return finalizeResult(result, null, channel);
    }
  }
}

class OfdmIntegrationPipeline implements SoftwareTransportPipeline<PipelineRunContext, SoftwareOpticalIntegrationResult> {
  readonly transport = TransportId.VisualOFDM;

  async run(context: PipelineRunContext): Promise<SoftwareOpticalIntegrationResult> {
    const modulation = context.modulation ?? "bpsk";
    const gridSize = context.gridSize ?? 16;
    const channel = new SoftwareOpticalChannel(context.channel);
    const result = createBaseResult(context, `${modulation.toUpperCase()} ${gridSize}x${gridSize}`, channel);
    const receiver = new VisualOfdmReceiver({ modulation, gridSize });
    const reconstruction = new ApplicationReconstructionService();
    receiver.onFrame((event) => { reconstruction.ingest(event.rawPayload); });
    let sequence = 0;
    let unitIndex = 0;
    try {
      result.txSuccess = true;
      for (const payload of context.protocolPayloads) {
        const encoded = encodeOfdmFrame({
          version: 1, modulation, gridSize, pilotConfig: 1, seqNumber: sequence++, payload,
        });
        const grids = modulateOfdmBytes(encoded, modulation, gridSize);
        if (grids.length > 1) result.multiUnitFrames++;
        for (const grid of grids) {
          const spatial = idct2D(Float64Array.from(grid.carriers, (carrier) => carrier.real), gridSize);
          const delivered = channel.transmitOfdmGrid(spatial, unitIndex++);
          if (delivered) receiver.ingestSpatialGrid(delivered);
        }
      }
      const diagnostics = receiver.getDiagnostics();
      result.recoveredFrames = diagnostics.validFramesCount;
      result.rxSuccess = diagnostics.validFramesCount > 0;
      result.crcStatus = diagnostics.corruptFramesCount === 0 && diagnostics.crcStatus === "valid"
        ? "valid" : "invalid";
      return finalizeReconstruction(result, reconstruction, channel);
    } catch (error) {
      result.failureReason = error instanceof Error ? error.message : "OFDM integration failed";
      return finalizeResult(result, null, channel);
    }
  }
}

function createProtocolPayloads(
  payload: Uint8Array,
  metadata: FileMetadata,
  mode: IntegrationTransferMode,
): Uint8Array[] {
  const blocks = chunkFile(payload, metadata.blockSize);
  const frames = [encodeMetadataFrame(metadata)];
  if (mode === "sequential") {
    for (let index = 0; index < blocks.length; index++) {
      const length = Math.min(metadata.blockSize, payload.length - index * metadata.blockSize);
      frames.push(encodeSequentialFrame(index, blocks[index].subarray(0, length)));
    }
  } else {
    const encoder = new FountainEncoder(blocks, metadata.blockSize, mulberry32(0x8e5eed));
    for (let count = 0; count < blocks.length * 20; count++) {
      frames.push(encodeFountainFrame(encoder.generateSymbol(), blocks.length));
    }
  }
  return frames;
}

export function createSoftwareIntegrationRegistry(): TransportPipelineRegistry {
  return new TransportPipelineRegistry()
    .register(new QrIntegrationPipeline())
    .register(new VlcIntegrationPipeline())
    .register(new OfdmIntegrationPipeline());
}

export async function runSoftwareOpticalIntegration(
  config: SoftwareOpticalIntegrationConfig,
): Promise<SoftwareOpticalIntegrationResult> {
  const transferMode = config.transferMode ?? "sequential";
  const blockSize = config.blockSize ?? 16;
  const digest = await sha256(config.payload);
  const metadata: FileMetadata = {
    dataType: "file",
    fileSize: config.payload.length,
    blockSize,
    totalBlocks: Math.ceil(config.payload.length / blockSize),
    fileHash: digest,
    fileName: `software-${config.transport}.bin`,
  };
  const context: PipelineRunContext = {
    ...config,
    runId: `software-${Date.now().toString(36)}-${(++integrationRunSequence).toString(36)}`,
    timestamp: new Date().toISOString(),
    startedAt: performance.now(),
    transferMode,
    blockSize,
    metadata,
    expectedSha256: await sha256Hex(config.payload),
    protocolPayloads: createProtocolPayloads(config.payload, metadata, transferMode),
  };
  return createSoftwareIntegrationRegistry().run(config.transport, context);
}

export async function runPhase8eVerificationMatrix(payload?: Uint8Array): Promise<SoftwareOpticalIntegrationResult[]> {
  const source = payload ?? Uint8Array.from({ length: 48 }, (_, index) => (index * 37 + 11) & 0xff);
  const configs: SoftwareOpticalIntegrationConfig[] = [
    { transport: TransportId.QR, payload: source, transferMode: "sequential" },
    { transport: TransportId.VLC, payload: source, transferMode: "fountain" },
  ];
  for (const modulation of ["bpsk", "qpsk", "16qam"] as const) {
    for (const gridSize of [8, 16, 32] as const) {
      configs.push({ transport: TransportId.VisualOFDM, payload: source, modulation, gridSize });
    }
  }
  return Promise.all(configs.map(runSoftwareOpticalIntegration));
}
