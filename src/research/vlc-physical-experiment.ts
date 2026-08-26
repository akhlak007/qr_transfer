/**
 * Real VLC Screen-to-Camera Physical Experiment Service (Milestone 6B)
 *
 * Implements:
 * - Real hardware optical experiment loop (Screen -> Light -> Camera -> Demodulator -> SHA-256)
 * - Explicit experiment state machine (IDLE -> CAMERA_READY -> CALIBRATING -> TRANSMITTING -> DECODING -> COMPLETED)
 * - Real camera frame consumption from PhysicalCameraService
 * - Dual CRC-16 and SHA-256 cryptographic verification
 * - Strict PhysicalTestRun provenance recording
 *
 * NOTE: Operates exclusively on real physical hardware camera captures. Synthetic frames are strictly prohibited.
 */

import { sha256Hex } from "../core/integrity";
import { TransportId } from "../core/transport";
import {
  encodeVlcFrame,
  type VlcFrame,
  type VlcModulationScheme,
} from "../transports/vlc/vlc-framing";
import {
  modulateVlcFrame,
  renderVlcColorToCanvas,
  type RGBColor,
} from "../transports/vlc/vlc-modulator";
import {
  extractCenterRoiAverage,
  VlcDemodulator,
  type OpticalSample,
} from "../transports/vlc/vlc-demodulator";
import {
  OpticalCalibrationEngine,
  type CalibrationResult,
} from "../transports/vlc/vlc-calibration";
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

export type VlcExperimentState =
  | "IDLE"
  | "CAMERA_STARTING"
  | "CAMERA_READY"
  | "CALIBRATING"
  | "TRANSMITTING"
  | "WAITING_FOR_SYNC"
  | "DECODING"
  | "CRC_VERIFIED"
  | "SHA256_VERIFIED"
  | "COMPLETED"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "CALIBRATION_FAILED"
  | "SYNC_TIMEOUT"
  | "DECODE_FAILED"
  | "CRC_FAILED"
  | "SHA256_MISMATCH"
  | "USER_CANCELLED";

export interface VlcExperimentConfig {
  modulation: VlcModulationScheme;
  distanceCm: number;
  ambientLux: number;
  exposureMode: PhysicalExposureMode;
  payload: Uint8Array;
  symbolRate: number; // symbols per second (e.g. 15, 30)
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

export interface VlcExperimentTelemetry {
  state: VlcExperimentState;
  elapsedMs: number;
  totalTransmittedSymbols: number;
  currentSymbolIndex: number;
  capturedFramesCount: number;
  cameraDiagnostics: PhysicalCameraDiagnostics;
  calibration: CalibrationResult | null;
  detectedSync: boolean;
  crcPassed: boolean;
  expectedSha256: string;
  recoveredSha256: string | null;
  sha256Matched: boolean;
  throughputBps: number;
  failureReason?: string;
}

export class VlcPhysicalExperimentService {
  private cameraService: PhysicalCameraService = new PhysicalCameraService();
  private calibrationEngine: OpticalCalibrationEngine = new OpticalCalibrationEngine();
  private demodulator: VlcDemodulator = new VlcDemodulator(
    new OpticalCalibrationEngine().calibrate(255, 0, 100)
  );
  private state: VlcExperimentState = "IDLE";
  private running = false;
  private cancelled = false;

  private activeConfig: VlcExperimentConfig | null = null;
  private expectedHash = "";
  private actualHash: string | null = null;
  private capturedSamples: OpticalSample[] = [];
  private calibrationResult: CalibrationResult | null = null;
  private startTime = 0;
  private endTime = 0;
  private transmittedSymbolsCount = 0;
  private currentSymbolIdx = 0;
  private failureReason?: string;
  private onStateChangeCb?: (telemetry: VlcExperimentTelemetry) => void;

  public setStateChangeCallback(cb: (telemetry: VlcExperimentTelemetry) => void): void {
    this.onStateChangeCb = cb;
  }

  private transition(newState: VlcExperimentState, failureReason?: string): void {
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

    const telemetry: VlcExperimentTelemetry = {
      state: this.state,
      elapsedMs: Math.round(elapsed),
      totalTransmittedSymbols: this.transmittedSymbolsCount,
      currentSymbolIndex: this.currentSymbolIdx,
      capturedFramesCount: this.capturedSamples.length,
      cameraDiagnostics: this.cameraService.getDiagnostics(),
      calibration: this.calibrationResult,
      detectedSync: this.state === "CRC_VERIFIED" || this.state === "SHA256_VERIFIED" || this.state === "COMPLETED",
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
   * Run the physical VLC screen-to-camera experiment.
   */
  public async runExperiment(
    config: VlcExperimentConfig,
    transmitCanvas: HTMLCanvasElement,
    previewCanvas?: HTMLCanvasElement
  ): Promise<PhysicalTestRun> {
    this.activeConfig = config;
    this.running = true;
    this.cancelled = false;
    this.capturedSamples = [];
    this.actualHash = null;
    this.failureReason = undefined;
    this.startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    // 1. Calculate Expected SHA-256 before transmission
    this.expectedHash = await sha256Hex(config.payload);

    // 2. Start Camera
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
    this.transition("CALIBRATING");
    await this.renderColorScreen(transmitCanvas, [0, 0, 0], 250); // Black reference
    const blackSample = this.captureOpticalSample(previewCanvas);

    await this.renderColorScreen(transmitCanvas, [255, 255, 255], 250); // White reference
    const whiteSample = this.captureOpticalSample(previewCanvas);

    const blackLum = blackSample ? blackSample.luminance : 0;
    const whiteLum = whiteSample ? whiteSample.luminance : 255;
    this.calibrationResult = this.calibrationEngine.calibrate(whiteLum, blackLum, config.ambientLux);

    if (this.calibrationResult.confidenceScore < 0.20 && Math.abs(whiteLum - blackLum) < 5) {
      this.cameraService.stop();
      this.transition("CALIBRATION_FAILED", "Insufficient optical contrast between black and white references");
      return this.createFailureRecord("sync_failure");
    }

    // 4. Encode & Modulate VLC payload
    const vlcFrame: VlcFrame = {
      version: 1,
      modulation: config.modulation,
      seqNumber: 1,
      payload: config.payload,
    };
    const frameBytes = encodeVlcFrame(vlcFrame);
    const modulatedStream = modulateVlcFrame(frameBytes, config.modulation);
    const symbols = modulatedStream.colors;
    this.transmittedSymbolsCount = symbols.length;

    // 5. Transmission & Real Camera Reception Loop
    this.transition("TRANSMITTING");
    const symbolIntervalMs = Math.max(16, Math.floor(1000 / config.symbolRate));

    let frameDecodedPayload: Uint8Array | null = null;
    let crcSuccess = false;

    for (let i = 0; i < symbols.length; i++) {
      if (this.cancelled) {
        this.cameraService.stop();
        this.transition("USER_CANCELLED", "Experiment aborted by user");
        return this.createFailureRecord("incomplete_payload");
      }

      this.currentSymbolIdx = i;
      const color = symbols[i];

      // Render symbol to display canvas
      renderVlcColorToCanvas(transmitCanvas, color);

      // Concurrently capture real optical frame from camera
      const sample = this.captureOpticalSample(previewCanvas);
      if (sample) {
        this.capturedSamples.push(sample);
      }

      this.notifyTelemetry();
      await this.sleep(symbolIntervalMs);
    }

    // Capture post-amble samples (guard duration)
    for (let g = 0; g < 15; g++) {
      const sample = this.captureOpticalSample(previewCanvas);
      if (sample) this.capturedSamples.push(sample);
      await this.sleep(symbolIntervalMs);
    }

    // 6. Demodulate received optical stream
    this.transition("DECODING");
    if (this.calibrationResult) {
      this.demodulator.updateCalibration(this.calibrationResult);
    }

    const report = this.demodulator.demodulateWithReport(this.capturedSamples, config.modulation);

    if (report.status === "success" && report.frame?.isValidCrc) {
      crcSuccess = true;
      frameDecodedPayload = report.frame.payload;
      this.transition("CRC_VERIFIED");
    } else {
      this.cameraService.stop();
      if (report.status === "sync_failure") {
        this.transition("SYNC_TIMEOUT", "Failed to detect Barker synchronization preamble in optical capture");
        return this.createFailureRecord("sync_failure");
      } else if (report.status === "crc_failure") {
        this.transition("CRC_FAILED", "CRC-16 checksum mismatch on received optical payload");
        return this.createFailureRecord("crc_failure");
      } else {
        this.transition("DECODE_FAILED", report.error ?? "Optical symbol classification failed");
        return this.createFailureRecord("incomplete_payload");
      }
    }

    // 7. SHA-256 Cryptographic Verification
    if (frameDecodedPayload) {
      this.actualHash = await sha256Hex(frameDecodedPayload);
    }

    const shaMatched = this.actualHash !== null && this.actualHash.toLowerCase() === this.expectedHash.toLowerCase();

    this.endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.cameraService.stop();

    if (!shaMatched || !frameDecodedPayload) {
      this.transition("SHA256_MISMATCH", `Expected ${this.expectedHash.slice(0, 12)}... but got ${this.actualHash?.slice(0, 12)}...`);
      return this.createFailureRecord("sha256_mismatch");
    }

    this.transition("SHA256_VERIFIED");
    this.transition("COMPLETED");

    // 8. Generate Successful PhysicalTestRun record
    return this.createSuccessRecord(crcSuccess, shaMatched, frameDecodedPayload.length);
  }

  public cancel(): void {
    this.cancelled = true;
    this.running = false;
    this.cameraService.stop();
    this.transition("USER_CANCELLED", "Experiment cancelled by operator");
  }

  private captureOpticalSample(previewCanvas?: HTMLCanvasElement): OpticalSample | null {
    const imgData = this.cameraService.captureFrame(previewCanvas);
    if (!imgData) return null;

    const roi = extractCenterRoiAverage(imgData, 0.5);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      rgb: roi.rgb,
      luminance: roi.luminance,
      timestamp: now,
    };
  }

  private async renderColorScreen(
    canvas: HTMLCanvasElement,
    color: RGBColor,
    durationMs: number
  ): Promise<void> {
    renderVlcColorToCanvas(canvas, color);
    await this.sleep(durationMs);
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
      runId: `phys-vlc-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      evidenceKind: "physical",
      transport: TransportId.VLC,
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
      notes: config.notes ?? "Physical VLC screen-to-camera transmission",
    };
  }

  private createFailureRecord(outcome: PhysicalOutcome): PhysicalTestRun {
    const config = this.activeConfig ?? {
      modulation: "ook",
      distanceCm: 10,
      ambientLux: 300,
      exposureMode: "locked",
      payload: new Uint8Array(),
      symbolRate: 30,
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
    if (this.state === "CRC_VERIFIED") syncStatus = "locked";
    else if (this.state === "CALIBRATING" || this.state === "TRANSMITTING") syncStatus = "intermittent";

    return {
      schemaVersion: 1,
      runId: `phys-vlc-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      evidenceKind: "physical",
      transport: TransportId.VLC,
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
      notes: `${config.notes ?? "Physical VLC run failure"}: ${this.failureReason ?? outcome}`,
    };
  }

  public getState(): VlcExperimentState {
    return this.state;
  }

  public isRunning(): boolean {
    return this.running;
  }
}
