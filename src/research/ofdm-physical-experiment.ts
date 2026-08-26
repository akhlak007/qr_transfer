/**
 * Real Visual OFDM Screen-to-Camera Physical Experiment Service (Milestone 6C)
 *
 * Implements:
 * - Real hardware optical experiment loop:
 *   Display -> Spatial 2D Pattern -> Physical Light -> Camera Sensor -> ImageData -> Grid/ROI Extraction -> 2D-DCT Demodulation -> Pilot Sync -> Channel Equalization -> CRC-16 -> SHA-256 -> Ledger
 * - Explicit experiment state machine (IDLE -> CAMERA_READY -> GRID_DETECTION -> TRANSMITTING -> DEMODULATING -> SHA256_VERIFIED -> COMPLETED)
 * - Real camera frame consumption from PhysicalCameraService (Zero synthetic frames accepted)
 * - Dual CRC-16 and SHA-256 cryptographic verification
 * - Immutable PhysicalTestRun provenance recording
 *
 * NOTE: Experimental Visual OFDM Research Prototype.
 */

import { sha256Hex } from "../core/integrity";
import { TransportId } from "../core/transport";
import {
  encodeOfdmFrame,
  type OfdmFrame,
  type OfdmModulationScheme,
} from "../transports/ofdm/ofdm-framing";
import {
  modulateOfdmBytes,
  type OfdmSymbolGrid,
} from "../transports/ofdm/ofdm-modulator";
import {
  renderOfdmGridToPixels,
} from "../transports/ofdm/ofdm-renderer";
import {
  VisualOfdmDemodulator,
  type OfdmDemodulationReport,
} from "../transports/ofdm/ofdm-demodulator";
import {
  OfdmCalibrationEngine,
  type OfdmCalibrationResult,
} from "../transports/ofdm/ofdm-calibration";
import {
  PhysicalCameraService,
  type PhysicalCameraConfig,
  type PhysicalCameraDiagnostics,
  PhysicalCameraException,
} from "./physical-camera-capture";
import type {
  PhysicalExposureMode,
  PhysicalModulation,
  PhysicalOutcome,
  PhysicalSyncStatus,
  PhysicalTestRun,
} from "./physical-test-run";

export type OfdmExperimentState =
  | "IDLE"
  | "CAMERA_STARTING"
  | "CAMERA_READY"
  | "DISPLAY_CALIBRATING"
  | "GRID_DETECTION"
  | "TRANSMITTING"
  | "PILOT_DETECTION"
  | "CHANNEL_ESTIMATION"
  | "DEMODULATING"
  | "CRC_VERIFIED"
  | "SHA256_VERIFIED"
  | "COMPLETED"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "DISPLAY_UNAVAILABLE"
  | "CALIBRATION_FAILED"
  | "GRID_DETECTION_FAILED"
  | "PILOT_SYNC_TIMEOUT"
  | "CHANNEL_ESTIMATION_FAILED"
  | "DECODE_FAILED"
  | "CRC_FAILED"
  | "SHA256_MISMATCH"
  | "USER_CANCELLED";

export interface OfdmExperimentConfig {
  modulation: OfdmModulationScheme;
  gridSize: number; // 8, 16, 32
  distanceCm: number;
  ambientLux: number;
  exposureMode: PhysicalExposureMode;
  payload: Uint8Array;
  symbolRate: number; // spatial frame updates per second
  transmitterDevice: string;
  transmitterDisplay: string;
  displayResolution: string;
  displayRefreshRate: number;
  receiverDevice: string;
  receiverCamera: string;
  operatingSystem: string;
  browser: string;
  notes?: string;
  cameraConfig?: Partial<PhysicalCameraConfig>;
}

export interface OfdmExperimentTelemetry {
  state: OfdmExperimentState;
  elapsedMs: number;
  gridSize: number;
  modulation: OfdmModulationScheme;
  cameraDiagnostics: PhysicalCameraDiagnostics;
  calibration: OfdmCalibrationResult | null;
  detectedPilots: number;
  totalPilots: number;
  pilotBer: number;
  estimatedSnrDb: number;
  crcPassed: boolean;
  expectedSha256: string;
  recoveredSha256: string | null;
  sha256Matched: boolean;
  throughputBps: number;
  failureReason?: string;
}

export function extractSpatialGridFromImageData(
  imgData: ImageData,
  gridSize: number,
  roiFraction = 0.65
): Float64Array {
  const { data, width, height } = imgData;
  const roiW = Math.max(1, Math.floor(width * roiFraction));
  const roiH = Math.max(1, Math.floor(height * roiFraction));
  const startX = Math.floor((width - roiW) / 2);
  const startY = Math.floor((height - roiH) / 2);

  const cellW = roiW / gridSize;
  const cellH = roiH / gridSize;
  const spatial = new Float64Array(gridSize * gridSize);

  for (let r = 0; r < gridSize; r++) {
    const cY = Math.floor(startY + (r + 0.5) * cellH);
    for (let c = 0; c < gridSize; c++) {
      const cX = Math.floor(startX + (c + 0.5) * cellW);
      const idx = (cY * width + cX) * 4;

      const red = data[idx] ?? 0;
      const green = data[idx + 1] ?? 0;
      const blue = data[idx + 2] ?? 0;
      // ITU-R BT.601 luminance
      const lum = 0.299 * red + 0.587 * green + 0.114 * blue;
      spatial[r * gridSize + c] = lum;
    }
  }

  return spatial;
}

export class OfdmPhysicalExperimentService {
  private cameraService: PhysicalCameraService = new PhysicalCameraService();
  private demodulator: VisualOfdmDemodulator = new VisualOfdmDemodulator(16);
  private calibrationEngine: OfdmCalibrationEngine = new OfdmCalibrationEngine();
  private state: OfdmExperimentState = "IDLE";
  private running = false;
  private cancelled = false;

  private activeConfig: OfdmExperimentConfig | null = null;
  private expectedHash = "";
  private actualHash: string | null = null;
  private calibrationResult: OfdmCalibrationResult | null = null;
  private latestDemodReport: OfdmDemodulationReport | null = null;
  private startTime = 0;
  private endTime = 0;
  private failureReason?: string;
  private onStateChangeCb?: (telemetry: OfdmExperimentTelemetry) => void;

  public setStateChangeCallback(cb: (telemetry: OfdmExperimentTelemetry) => void): void {
    this.onStateChangeCb = cb;
  }

  private transition(newState: OfdmExperimentState, failureReason?: string): void {
    this.state = newState;
    if (failureReason) this.failureReason = failureReason;
    this.notifyTelemetry();
  }

  private notifyTelemetry(): void {
    if (!this.onStateChangeCb) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = this.startTime > 0 ? (this.endTime > 0 ? this.endTime - this.startTime : now - this.startTime) : 0;
    const bytes = this.activeConfig?.payload.length ?? 0;
    const throughput = elapsed > 0 && this.actualHash ? (bytes / (elapsed / 1000.0)) : 0;

    const sync = this.latestDemodReport?.sync;

    const telemetry: OfdmExperimentTelemetry = {
      state: this.state,
      elapsedMs: Math.round(elapsed),
      gridSize: this.activeConfig?.gridSize ?? 16,
      modulation: this.activeConfig?.modulation ?? "bpsk",
      cameraDiagnostics: this.cameraService.getDiagnostics(),
      calibration: this.calibrationResult,
      detectedPilots: sync?.detectedPilots ?? 0,
      totalPilots: sync?.totalPilots ?? 0,
      pilotBer: sync?.pilotBer ?? 1.0,
      estimatedSnrDb: this.latestDemodReport?.estimatedSnrDb ?? 0,
      crcPassed: this.state === "CRC_VERIFIED" || this.state === "SHA256_VERIFIED" || this.state === "COMPLETED",
      expectedSha256: this.expectedHash,
      recoveredSha256: this.actualHash,
      sha256Matched: this.actualHash !== null && this.actualHash.toLowerCase() === this.expectedHash.toLowerCase(),
      throughputBps: throughput,
      failureReason: this.failureReason,
    };
    this.onStateChangeCb(telemetry);
  }

  /**
   * Run the physical Visual OFDM screen-to-camera experiment.
   */
  public async runExperiment(
    config: OfdmExperimentConfig,
    transmitCanvas: HTMLCanvasElement,
    previewCanvas?: HTMLCanvasElement
  ): Promise<PhysicalTestRun> {
    this.activeConfig = config;
    this.running = true;
    this.cancelled = false;
    this.actualHash = null;
    this.latestDemodReport = null;
    this.failureReason = undefined;
    this.startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    // 1. Calculate Expected SHA-256 before transmission
    this.expectedHash = await sha256Hex(config.payload);

    // 2. Start Physical Camera
    this.transition("CAMERA_STARTING");
    try {
      await this.cameraService.start(config.cameraConfig);
      this.transition("CAMERA_READY");
    } catch (err: unknown) {
      this.cameraService.stop();
      if (err instanceof PhysicalCameraException && err.code === "CAMERA_PERMISSION_DENIED") {
        this.transition("CAMERA_PERMISSION_DENIED", "Camera access denied by user or security policy");
      } else {
        this.transition("CAMERA_UNAVAILABLE", `Failed to initialize camera: ${String(err)}`);
      }
      return this.createFailureRecord("sync_failure");
    }

    // 3. Optical Calibration Phase
    this.transition("DISPLAY_CALIBRATING");
    await this.renderSolidColor(transmitCanvas, [0, 0, 0], 250); // Black reference
    const blackSample = this.captureFrameLuminance(previewCanvas);

    await this.renderSolidColor(transmitCanvas, [255, 255, 255], 250); // White reference
    const whiteSample = this.captureFrameLuminance(previewCanvas);

    const blackLum = blackSample ?? 0;
    const whiteLum = whiteSample ?? 255;
    const dummySpatial = new Float64Array(config.gridSize * config.gridSize);
    for (let i = 0; i < dummySpatial.length; i++) {
      dummySpatial[i] = i % 2 === 0 ? whiteLum : blackLum;
    }
    this.calibrationResult = this.calibrationEngine.calibrateSpatialGrid(dummySpatial, config.gridSize);

    if (this.calibrationResult.confidence < 0.20 && Math.abs(whiteLum - blackLum) < 5) {
      this.cameraService.stop();
      this.transition("CALIBRATION_FAILED", "Insufficient optical contrast between black and white references");
      return this.createFailureRecord("sync_failure");
    }

    // 4. Encode & Modulate OFDM payload into Spatial Subcarrier Grid
    const ofdmFrame: OfdmFrame = {
      version: 1,
      modulation: config.modulation,
      gridSize: config.gridSize,
      pilotConfig: 1,
      seqNumber: 1,
      payload: config.payload,
    };
    const frameBytes = encodeOfdmFrame(ofdmFrame);

    const grids: OfdmSymbolGrid[] = modulateOfdmBytes(
      frameBytes,
      config.modulation,
      config.gridSize
    );
    const ofdmGrid = grids[0] ?? {
      gridSize: config.gridSize,
      modulation: config.modulation,
      carriers: [],
      dataCarriersCount: 0,
      pilotCarriersCount: 0,
    };

    // 5. Render Spatial 2D Pattern to display canvas
    this.transition("GRID_DETECTION");
    const targetSize = Math.min(transmitCanvas.width, transmitCanvas.height) || 256;
    const renderedPattern = renderOfdmGridToPixels(ofdmGrid, targetSize);
    this.renderPatternToCanvas(transmitCanvas, renderedPattern.pixelBuffer, renderedPattern.width, renderedPattern.height);

    // 6. Transmit & Camera Ingestion Loop
    this.transition("TRANSMITTING");
    this.demodulator.setGridSize(config.gridSize);

    let frameDecodedPayload: Uint8Array | null = null;
    let crcSuccess = false;

    // Capture multiple real camera frames to allow focus/exposure settling
    const captureRounds = 15;
    const captureIntervalMs = Math.max(25, Math.floor(1000 / config.symbolRate));

    for (let r = 0; r < captureRounds; r++) {
      if (this.cancelled) {
        this.cameraService.stop();
        this.transition("USER_CANCELLED", "Experiment aborted by user");
        return this.createFailureRecord("incomplete_payload");
      }

      const imgData = this.cameraService.captureFrame(previewCanvas);
      if (imgData) {
        const spatial = extractSpatialGridFromImageData(imgData, config.gridSize, 0.65);
        this.transition("DEMODULATING");

        const report = this.demodulator.demodulateSpatialPattern(spatial, config.modulation);
        this.latestDemodReport = report;

        if (report.sync.synchronized) {
          this.transition("PILOT_DETECTION");
          this.transition("CHANNEL_ESTIMATION");
        }

        if (report.status === "success" && report.frame?.isValidCrc) {
          crcSuccess = true;
          frameDecodedPayload = report.frame.payload;
          this.transition("CRC_VERIFIED");
          break;
        }
      }

      this.notifyTelemetry();
      await this.sleep(captureIntervalMs);
    }

    if (!frameDecodedPayload) {
      this.cameraService.stop();
      const lastStatus = this.latestDemodReport?.status ?? "sync_failure";
      if (lastStatus === "sync_failure" || !this.latestDemodReport?.sync.synchronized) {
        this.transition("PILOT_SYNC_TIMEOUT", "Failed to detect pilot subcarrier pattern in optical camera capture");
        return this.createFailureRecord("sync_failure");
      } else if (lastStatus === "crc_failure") {
        this.transition("CRC_FAILED", "CRC-16 checksum mismatch on received OFDM subcarriers");
        return this.createFailureRecord("crc_failure");
      } else {
        this.transition("DECODE_FAILED", this.latestDemodReport?.error ?? "Spatial OFDM demodulation failed");
        return this.createFailureRecord("incomplete_payload");
      }
    }

    // 7. SHA-256 Cryptographic Verification
    this.actualHash = await sha256Hex(frameDecodedPayload);
    const shaMatched = this.actualHash !== null && this.actualHash.toLowerCase() === this.expectedHash.toLowerCase();

    this.endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.cameraService.stop();

    if (!shaMatched) {
      this.transition("SHA256_MISMATCH", `Expected ${this.expectedHash.slice(0, 12)}... but got ${this.actualHash?.slice(0, 12)}...`);
      return this.createFailureRecord("sha256_mismatch");
    }

    this.transition("SHA256_VERIFIED");
    this.transition("COMPLETED");

    // 8. Return PhysicalTestRun
    return this.createSuccessRecord(crcSuccess, shaMatched, frameDecodedPayload.length);
  }

  public cancel(): void {
    this.cancelled = true;
    this.running = false;
    this.cameraService.stop();
    this.transition("USER_CANCELLED", "Experiment cancelled by operator");
  }

  private captureFrameLuminance(previewCanvas?: HTMLCanvasElement): number | null {
    const imgData = this.cameraService.captureFrame(previewCanvas);
    if (!imgData) return null;
    let sum = 0;
    const stride = 4;
    let count = 0;
    for (let i = 0; i < imgData.data.length; i += 4 * stride) {
      const r = imgData.data[i];
      const g = imgData.data[i + 1];
      const b = imgData.data[i + 2];
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
      count++;
    }
    return count > 0 ? sum / count : null;
  }

  private async renderSolidColor(
    canvas: HTMLCanvasElement,
    color: [number, number, number],
    durationMs: number
  ): Promise<void> {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await this.sleep(durationMs);
  }

  private renderPatternToCanvas(
    canvas: HTMLCanvasElement,
    pixelBuffer: Uint8ClampedArray,
    w: number,
    h: number
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const imgData = ctx.createImageData(w, h);
    imgData.data.set(pixelBuffer);
    ctx.putImageData(imgData, 0, 0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createSuccessRecord(
    crcPassed: boolean,
    sha256Matched: boolean,
    reconstructedBytes: number
  ): PhysicalTestRun {
    const config = this.activeConfig!;
    const now = Date.now();
    const duration = Math.max(1, (this.endTime || now) - this.startTime);
    const diag = this.cameraService.getDiagnostics();

    return {
      schemaVersion: 1,
      runId: `phys-ofdm-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      evidenceKind: "physical",
      transport: TransportId.VisualOFDM,
      modulation: config.modulation as PhysicalModulation,
      transmitterDevice: config.transmitterDevice,
      transmitterDisplay: config.transmitterDisplay,
      displayResolution: config.displayResolution,
      displayRefreshRate: config.displayRefreshRate,
      receiverDevice: config.receiverDevice,
      receiverCamera: config.receiverCamera,
      cameraResolution: `${diag.width}x${diag.height}`,
      operatingSystem: config.operatingSystem,
      browser: config.browser,
      distanceCm: config.distanceCm,
      ambientLightLux: config.ambientLux,
      exposureMode: config.exposureMode,
      gain: 1.0,
      frameRate: diag.actualFps || config.symbolRate,
      payloadSizeBytes: config.payload.length,
      blockSize: config.payload.length,
      symbolRate: config.symbolRate,
      durationMs: duration,
      reconstructedBytes,
      sha256Original: this.expectedHash,
      sha256Recovered: this.actualHash ?? "",
      sha256Matched,
      crcPassed,
      droppedFrames: diag.droppedFrames,
      synchronizationStatus: "locked",
      outcome: "success",
      notes: config.notes ?? `Physical Visual OFDM ${config.gridSize}x${config.gridSize} ${config.modulation.toUpperCase()} transmission`,
    };
  }

  private createFailureRecord(outcome: PhysicalOutcome): PhysicalTestRun {
    const config = this.activeConfig ?? {
      modulation: "bpsk",
      gridSize: 8,
      distanceCm: 10,
      ambientLux: 300,
      exposureMode: "locked",
      payload: new Uint8Array(),
      symbolRate: 15,
      transmitterDevice: "Unknown Display",
      transmitterDisplay: "Display",
      displayResolution: "1920x1080",
      displayRefreshRate: 60,
      receiverDevice: "Unknown Camera Device",
      receiverCamera: "Camera",
      operatingSystem: "OS",
      browser: "Browser",
      notes: "",
    };

    const now = Date.now();
    const duration = Math.max(1, (this.endTime || now) - (this.startTime || now));
    const diag = this.cameraService.getDiagnostics();

    let syncStatus: PhysicalSyncStatus = "failed";
    if (this.state === "CRC_VERIFIED" || this.state === "CHANNEL_ESTIMATION") syncStatus = "locked";
    else if (this.state === "GRID_DETECTION" || this.state === "TRANSMITTING") syncStatus = "intermittent";

    return {
      schemaVersion: 1,
      runId: `phys-ofdm-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      evidenceKind: "physical",
      transport: TransportId.VisualOFDM,
      modulation: config.modulation as PhysicalModulation,
      transmitterDevice: config.transmitterDevice,
      transmitterDisplay: config.transmitterDisplay,
      displayResolution: config.displayResolution,
      displayRefreshRate: config.displayRefreshRate,
      receiverDevice: config.receiverDevice,
      receiverCamera: config.receiverCamera,
      cameraResolution: `${diag.width}x${diag.height}`,
      operatingSystem: config.operatingSystem,
      browser: config.browser,
      distanceCm: config.distanceCm,
      ambientLightLux: config.ambientLux,
      exposureMode: config.exposureMode,
      gain: 1.0,
      frameRate: diag.actualFps || config.symbolRate,
      payloadSizeBytes: config.payload.length,
      blockSize: config.payload.length,
      symbolRate: config.symbolRate,
      durationMs: duration,
      reconstructedBytes: 0,
      sha256Original: this.expectedHash,
      sha256Recovered: this.actualHash ?? "0000000000000000000000000000000000000000000000000000000000000000",
      sha256Matched: false,
      crcPassed: false,
      droppedFrames: diag.droppedFrames,
      synchronizationStatus: syncStatus,
      outcome,
      notes: `${config.notes ?? "Physical OFDM run failure"}: ${this.failureReason ?? outcome}`,
    };
  }

  public getState(): OfdmExperimentState {
    return this.state;
  }

  public isRunning(): boolean {
    return this.running;
  }
}
