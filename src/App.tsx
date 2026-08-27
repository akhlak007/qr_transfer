import React, { useState, useEffect, useRef, useCallback } from "react";
import { chunkFile, reassembleFile } from "./modules/chunker";
import { FountainEncoder, FountainDecoder } from "./modules/fountain";
import type { FountainSymbol } from "./modules/fountain";
import {
  FrameType,
  encodeMetadataFrame,
  decodeMetadataFrame,
  encodeSequentialFrame,
  decodeSequentialFrame,
  encodeFountainFrame,
  decodeFountainFrame,
} from "./modules/protocol";
import type { FileMetadata } from "./modules/protocol";
import { prepareZXingModule } from "zxing-wasm/reader";
import { sha256, createIntegrityResult } from "./core/integrity";
import type { IntegrityResult as IntegrityResultModel } from "./core/integrity";
import { extractMediaMetadata } from "./media/media-metadata";
import type { MediaMetadata } from "./media/media-metadata";
import { TransferStatistics } from "./components/TransferStatistics";
import { OpticalSignalMetrics } from "./components/OpticalSignalMetrics";
import { IntegrityResult } from "./components/IntegrityResult";
import { MediaVerification } from "./components/MediaVerification";
import { ModeBadge } from "./components/ModeBadge";
import { StorageStatus } from "./components/StorageStatus";
import { RecoveryModal } from "./components/RecoveryModal";
import { ResearchDashboard } from "./components/ResearchDashboard";
import { VlcWaveformInspector } from "./components/VlcWaveformInspector";
import { TransportId } from "./core/transport";
import { bytesToHex, deriveLegacySessionId } from "./modules/protocol";
import { createPersistence, type PersistenceRepositories } from "./storage/persistence";
import { detectStorageCapabilities, type StorageCapabilities } from "./storage/storage-capabilities";
import { PersistenceQueue, type PersistenceQueueStatus } from "./storage/persistence-queue";
import { createTransferId, type TransferSession } from "./core/transfer-session";
import { transitionSession, setResumeCapability } from "./core/session-controller";
import { type ReplayResult } from "./storage/recovery-manager";
import type { VlcModulationScheme } from "./transports/vlc/vlc-framing";
import { OpticalCalibrationEngine, type CalibrationResult } from "./transports/vlc/vlc-calibration";
import { OfdmSpectrumInspector } from "./components/OfdmSpectrumInspector";
import type { OfdmModulationScheme } from "./transports/ofdm/ofdm-framing";
import { createSubcarrierMap } from "./transports/ofdm/ofdm-framing";
import { RendererRegistry } from "./transports/rendering/renderer-registry";
import type { RendererDiagnostics } from "./transports/rendering/optical-renderer";
import { QRTransmitterRenderer } from "./transports/qr/qr-transmitter-renderer";
import { VlcTransmitterRenderer } from "./transports/vlc/vlc-transmitter-renderer";
import { VisualOfdmTransmitterRenderer } from "./transports/ofdm/visual-ofdm-transmitter-renderer";
import { ProtocolRendererDiagnostics } from "./components/ProtocolRendererDiagnostics";
import { isVlcDecodeAttemptDue, LiveReceiverRouter, OpticalFrameScheduler } from "./core/application-optical-pipeline";
import { ApplicationReconstructionService, type ReconstructionResult } from "./core/application-reconstruction-service";
import { CameraLifecycleController } from "./core/camera-lifecycle-controller";
import { FinalizationGenerationGuard } from "./core/finalization-generation-guard";
import { ReceiverSessionController } from "./core/receiver-session-controller";


const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const StopIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

function App() {
  const [activeTab, setActiveTab] = useState<"send" | "receive">("send");
  const [zxingReady, setZxingReady] = useState(false);

  // Persistence and Storage State
  const [persistence, setPersistence] = useState<PersistenceRepositories | null>(null);
  const [storageCaps, setStorageCaps] = useState<StorageCapabilities | null>(null);
  const [queueStatus, setQueueStatus] = useState<PersistenceQueueStatus>("idle");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [durableCheckpointsCount, setDurableCheckpointsCount] = useState<number>(0);
  const [persistedSymbolsCount, setPersistedSymbolsCount] = useState<number>(0);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [savedSessionsCount, setSavedSessionsCount] = useState<number>(0);
  const [selectedTransport, setSelectedTransport] = useState<TransportId>(TransportId.QR);
  const [vlcModulation, setVlcModulation] = useState<VlcModulationScheme>("ook");
  const [vlcCalibration] = useState<CalibrationResult | null>(() => {
    const engine = new OpticalCalibrationEngine();
    return engine.calibrate(255, 0, 10);
  });
  const [ofdmModulation, setOfdmModulation] = useState<OfdmModulationScheme>("bpsk");
  const [ofdmGridSize, setOfdmGridSize] = useState<number>(16);
  const ofdmSubcarrierMap = createSubcarrierMap(ofdmGridSize);
  const [rendererDiagnostics, setRendererDiagnostics] = useState<RendererDiagnostics | null>(null);
  const rendererRegistryRef = useRef<RendererRegistry | null>(null);
  if (!rendererRegistryRef.current) {
    rendererRegistryRef.current = new RendererRegistry()
      .register(new QRTransmitterRenderer())
      .register(new VlcTransmitterRenderer())
      .register(new VisualOfdmTransmitterRenderer());
  }

  const persistenceRef = useRef<PersistenceRepositories | null>(null);
  const persistenceQueueRef = useRef<PersistenceQueue | null>(null);
  const currentTransferIdRef = useRef<string | null>(null);
  const currentSessionRef = useRef<TransferSession | null>(null);
  const currentSenderSessionRef = useRef<TransferSession | null>(null);
  const persistedResolvedIndicesRef = useRef<Set<number>>(new Set());

  const refreshSavedSessionsCount = useCallback(async () => {
    if (!persistenceRef.current) return;
    try {
      const list = await persistenceRef.current.sessions.list();
      setSavedSessionsCount(list.length);
    } catch {
      // ignore
    }
  }, []);

  // Initialize persistence and capabilities on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const caps = await detectStorageCapabilities();
        if (active) setStorageCaps(caps);
      } catch (err) {
        console.warn("Storage capabilities detection failed:", err);
      }

      try {
        const repo = await createPersistence();
        if (active) {
          setPersistence(repo);
          persistenceRef.current = repo;
          try {
            const list = await repo.sessions.list();
            if (active) setSavedSessionsCount(list.length);
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn("Persistence creation failed:", err);
      }
    })();

    const handleVisibilityOrUnload = () => {
      if (persistenceQueueRef.current) {
        void persistenceQueueRef.current.flush();
      }
    };
    window.addEventListener("visibilitychange", handleVisibilityOrUnload);
    window.addEventListener("pagehide", handleVisibilityOrUnload);
    window.addEventListener("beforeunload", handleVisibilityOrUnload);

    return () => {
      active = false;
      window.removeEventListener("visibilitychange", handleVisibilityOrUnload);
      window.removeEventListener("pagehide", handleVisibilityOrUnload);
      window.removeEventListener("beforeunload", handleVisibilityOrUnload);
      if (persistenceQueueRef.current) {
        persistenceQueueRef.current.destroy();
      }
    };
  }, []);

  // Pre-load WASM on start
  useEffect(() => {
    prepareZXingModule({ fireImmediately: true })
      .then(() => setZxingReady(true))
      .catch((err) => console.error("Failed to load ZXing WASM:", err));
  }, []);

  // --- SENDER STATE ---
  const [transferType, setTransferType] = useState<"file" | "message">("file");
  const [sendText, setSendText] = useState("");
  const [sendFile, setSendFile] = useState<File | null>(null);
  const [sendMediaMetadata, setSendMediaMetadata] = useState<MediaMetadata | null>(null);
  const [sendMode, setSendMode] = useState<"fountain" | "sequential">("fountain");
  const [blockSize, setBlockSize] = useState<number>(512); // default 512 bytes
  const [fps, setFps] = useState<number>(10);
  const [qrEcc, setQrEcc] = useState<"L" | "M" | "Q" | "H">("L");
  const [qrVersion, setQrVersion] = useState<number | undefined>(undefined); // Auto version

  const [isSending, setIsSending] = useState(false);
  const [senderStats, setSenderStats] = useState({
    totalBlocks: 0,
    framesSent: 0,
    currentFrameIndex: 0,
    fountainSeed: 0,
    achievedFps: 0,
    averageRenderMs: 0,
    renderFailures: 0,
  });

  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendTimerRef = useRef<number | null>(null);
  const isSendingRef = useRef(false);
  const sendLoopGenerationRef = useRef(0);
  const senderFrameCounterRef = useRef(0);
  const senderSequenceIndexRef = useRef(0);
  const successfulRenderCountRef = useRef(0);
  const opticalSchedulerRef = useRef<OpticalFrameScheduler | null>(null);
  const liveReceiverRouterRef = useRef<LiveReceiverRouter | null>(null);
  const receiverSessionControllerRef = useRef<ReceiverSessionController | null>(null);
  const cameraLifecycleRef = useRef<CameraLifecycleController | null>(null);
  const reconstructionServiceRef = useRef(new ApplicationReconstructionService());
  const applicationFinalizationRef = useRef<Promise<void> | null>(null);
  const finalizationGenerationGuardRef = useRef(new FinalizationGenerationGuard());
  const resetReceiverStateRef = useRef<() => void>(() => undefined);
  const fileBytesRef = useRef<Uint8Array | null>(null);
  const fileHashRef = useRef<Uint8Array | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const fountainEncoderRef = useRef<FountainEncoder | null>(null);
  const filePreparationGenerationRef = useRef(0);

  useEffect(() => {
    const next = {
      transport: selectedTransport,
      vlcModulation,
      ofdmModulation,
      ofdmGridSize: ofdmGridSize as 8 | 16 | 32,
    };
    if (!receiverSessionControllerRef.current) {
      receiverSessionControllerRef.current = new ReceiverSessionController(next, () => resetReceiverStateRef.current());
    } else {
      receiverSessionControllerRef.current.changeConfiguration(next);
    }
    opticalSchedulerRef.current = null;
  }, [selectedTransport, ofdmModulation, ofdmGridSize, vlcModulation]);

  // File and message loading
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preparationGeneration = ++filePreparationGenerationRef.current;
    fileBytesRef.current = null;
    fileHashRef.current = null;
    chunksRef.current = [];
    fountainEncoderRef.current = null;
    setSendMediaMetadata(null);
    setSendFile(file);
    setIsSending(false);

    const [mediaMetadata, arrayBuffer] = await Promise.all([
      extractMediaMetadata(file, file.name),
      file.arrayBuffer(),
    ]);
    if (preparationGeneration !== filePreparationGenerationRef.current) return;
    setSendMediaMetadata(mediaMetadata);
    const bytes = new Uint8Array(arrayBuffer);

    // Calculate SHA-256 hash using Web Crypto API (native platform feature)
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    if (preparationGeneration !== filePreparationGenerationRef.current) return;
    fileBytesRef.current = bytes;
    fileHashRef.current = new Uint8Array(hashBuffer);

    // Chunks
    const blocks = chunkFile(bytes, blockSize);
    chunksRef.current = blocks;
    fountainEncoderRef.current = new FountainEncoder(blocks, blockSize);

    const hexHash = bytesToHex(new Uint8Array(hashBuffer));
    const transferId = createTransferId();
    const senderSession: TransferSession = {
      schemaVersion: 1,
      transferId,
      protocolVersion: 1,
      direction: "send",
      transport: selectedTransport,
      file: {
        name: file.name,
        size: bytes.length,
        mimeType: file.type || "application/octet-stream",
        sha256Hex: hexHash,
        mediaKind: mediaMetadata?.kind ?? "other",
      },
      fileHashHex: hexHash,
      blockSize,
      totalBlocks: blocks.length,
      status: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "restart-sender",
      encodingMode: sendMode,
      acceptedSymbols: 0,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: { fps, qrEcc, qrVersion },
    };
    currentSenderSessionRef.current = senderSession;
    if (persistenceRef.current) {
      void persistenceRef.current.sessions.put(senderSession).catch((err) => {
        console.warn("Could not persist sender session:", err);
      });
    }

    setSenderStats({
      totalBlocks: blocks.length,
      framesSent: 0,
      currentFrameIndex: 0,
      fountainSeed: 0,
      achievedFps: 0,
      averageRenderMs: 0,
      renderFailures: 0,
    });
    senderFrameCounterRef.current = 0;
    senderSequenceIndexRef.current = 0;
    opticalSchedulerRef.current = null;
    successfulRenderCountRef.current = 0;
  };

  const handleTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setSendText(text);
    setIsSending(false);

    if (!text.trim()) {
      fileBytesRef.current = null;
      return;
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    fileBytesRef.current = bytes;

    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    fileHashRef.current = new Uint8Array(hashBuffer);

    const blocks = chunkFile(bytes, blockSize);
    chunksRef.current = blocks;
    fountainEncoderRef.current = new FountainEncoder(blocks, blockSize);

    const hexHash = bytesToHex(new Uint8Array(hashBuffer));
    const transferId = createTransferId();
    const senderSession: TransferSession = {
      schemaVersion: 1,
      transferId,
      protocolVersion: 1,
      direction: "send",
      transport: selectedTransport,
      file: {
        name: "message",
        size: bytes.length,
        mimeType: "text/plain",
        sha256Hex: hexHash,
        mediaKind: "other",
      },
      fileHashHex: hexHash,
      blockSize,
      totalBlocks: blocks.length,
      status: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      resumeCapability: "restart-sender",
      encodingMode: sendMode,
      acceptedSymbols: 0,
      resolvedBlocks: 0,
      checkpointVersion: 1,
      failureCode: null,
      transportConfig: { fps, qrEcc, qrVersion },
    };
    currentSenderSessionRef.current = senderSession;
    if (persistenceRef.current) {
      void persistenceRef.current.sessions.put(senderSession).catch((err) => {
        console.warn("Could not persist sender message session:", err);
      });
    }

    setSenderStats({
      totalBlocks: blocks.length,
      framesSent: 0,
      currentFrameIndex: 0,
      fountainSeed: 0,
      achievedFps: 0,
      averageRenderMs: 0,
      renderFailures: 0,
    });
    senderFrameCounterRef.current = 0;
    senderSequenceIndexRef.current = 0;
    opticalSchedulerRef.current = null;
    successfulRenderCountRef.current = 0;
  };

  // Adjust chunk list if block size changes
  useEffect(() => {
    if (fileBytesRef.current) {
      const blocks = chunkFile(fileBytesRef.current, blockSize);
      chunksRef.current = blocks;
      fountainEncoderRef.current = new FountainEncoder(blocks, blockSize);
      setSenderStats((prev) => ({
        ...prev,
        totalBlocks: blocks.length,
      }));
    }
  }, [blockSize]);

  // Start / Pause / Stop loop
  const toggleSend = () => {
    if (transferType === "file" && !sendFile) return;
    if (transferType === "message" && !sendText.trim()) return;
    if (!fileBytesRef.current || !fileHashRef.current) return;

    if (isSending) {
      // Pause
      isSendingRef.current = false;
      sendLoopGenerationRef.current++;
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      setIsSending(false);
      if (currentSenderSessionRef.current && currentSenderSessionRef.current.status === "active") {
        try {
          const paused = transitionSession(currentSenderSessionRef.current, "paused");
          currentSenderSessionRef.current = paused;
          if (persistenceRef.current) {
            void persistenceRef.current.sessions.put(paused).catch((err) => console.warn(err));
          }
        } catch (err) {
          console.warn("Sender transition warning:", err);
        }
      }
    } else {
      // Start
      isSendingRef.current = true;
      setIsSending(true);
      if (currentSenderSessionRef.current && currentSenderSessionRef.current.status !== "active") {
        try {
          const activeSession = transitionSession(currentSenderSessionRef.current, "active");
          currentSenderSessionRef.current = activeSession;
          if (persistenceRef.current) {
            void persistenceRef.current.sessions.put(activeSession).catch((err) => console.warn(err));
          }
        } catch (err) {
          console.warn("Sender transition warning:", err);
        }
      }
    }
  };

  const stopSending = () => {
    isSendingRef.current = false;
    sendLoopGenerationRef.current++;
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    setIsSending(false);
    if (currentSenderSessionRef.current && currentSenderSessionRef.current.status !== "ready") {
      try {
        const readySession = transitionSession(currentSenderSessionRef.current, "ready");
        currentSenderSessionRef.current = readySession;
        if (persistenceRef.current) {
          void persistenceRef.current.sessions.put(readySession).catch((err) => console.warn(err));
        }
      } catch (err) {
        console.warn("Sender stop transition warning:", err);
      }
    }
    senderFrameCounterRef.current = 0;
    senderSequenceIndexRef.current = 0;
    successfulRenderCountRef.current = 0;
    setSenderStats((prev) => ({
      ...prev,
      framesSent: 0,
      currentFrameIndex: 0,
      achievedFps: 0,
      averageRenderMs: 0,
      renderFailures: 0,
    }));

    // Clear canvas
    const canvas = sendCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const startSendingLoop = useCallback(() => {
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    const generation = ++sendLoopGenerationRef.current;

    let frameCounter = senderFrameCounterRef.current;
    let successfulRenders = successfulRenderCountRef.current;
    let seqIndex = senderSequenceIndexRef.current;
    let totalRenderMs = 0;
    let renderedThisRun = 0;
    const loopStartedAt = performance.now();

    const metadata: FileMetadata = {
      dataType: transferType,
      fileSize: fileBytesRef.current!.length,
      blockSize: blockSize,
      totalBlocks: chunksRef.current.length,
      fileHash: fileHashRef.current!,
      fileName: transferType === "file" ? sendFile!.name : "message",
    };

    const intervalMs = 1000 / fps;
    const scheduler = opticalSchedulerRef.current ?? new OpticalFrameScheduler({
      transport: selectedTransport,
      vlcModulation,
      ofdmModulation,
      ofdmGridSize: ofdmGridSize as 8 | 16 | 32,
    });
    opticalSchedulerRef.current = scheduler;

    const renderNextFrame = async () => {
      if (!isSendingRef.current || generation !== sendLoopGenerationRef.current) return;
      const tickStartedAt = performance.now();
      const canvas = sendCanvasRef.current;
      if (!canvas) return;

      if (!scheduler.hasActiveFrame()) {
        let nextFrameData: Uint8Array;

        // Every 15th application frame, send metadata so the receiver can catch up.
        if (frameCounter % 15 === 0) {
          nextFrameData = encodeMetadataFrame(metadata);
        } else if (sendMode === "sequential") {
          // Sequential mode
          const block = chunksRef.current[seqIndex];
          nextFrameData = encodeSequentialFrame(seqIndex, block);

          setSenderStats((prev) => ({
            ...prev,
            currentFrameIndex: seqIndex,
          }));

          seqIndex = (seqIndex + 1) % chunksRef.current.length;
          senderSequenceIndexRef.current = seqIndex;
        } else {
          // Fountain Mode
          if (!fountainEncoderRef.current) {
            fountainEncoderRef.current = new FountainEncoder(chunksRef.current, blockSize);
          }
          const symbol = fountainEncoderRef.current.generateSymbol();
          nextFrameData = encodeFountainFrame(symbol, chunksRef.current.length);

          setSenderStats((prev) => ({
            ...prev,
            fountainSeed: symbol.seed,
          }));
        }
        scheduler.beginFrame(nextFrameData);
      }
      const frameData = scheduler.getActiveBytes();

      // Render frame to canvas
      let renderSucceeded = false;
      try {
        const result = await rendererRegistryRef.current!.render(selectedTransport, canvas, frameData, {
          transport: selectedTransport,
          vlcModulation,
          ofdmModulation,
          ofdmGridSize,
          qrEcc,
          qrVersion,
          symbolRate: fps,
          frameSequence: frameCounter,
          opticalUnitIndex: scheduler.getOpticalUnitIndex(),
        });
        totalRenderMs += result.durationMs;
        setRendererDiagnostics(result.diagnostics);
        renderSucceeded = true;
      } catch (err) {
        console.error("Optical rendering failed:", err);
        setSenderStats((prev) => ({ ...prev, renderFailures: prev.renderFailures + 1 }));
      }

      if (!isSendingRef.current || generation !== sendLoopGenerationRef.current) return;

      if (renderSucceeded) {
        if (scheduler.markRendered()) {
          frameCounter++;
          senderFrameCounterRef.current = frameCounter;
        }
        renderedThisRun++;
        successfulRenders++;
        successfulRenderCountRef.current = successfulRenders;
      }
      const elapsedMs = Math.max(1, performance.now() - loopStartedAt);
      setSenderStats((prev) => ({
        ...prev,
        framesSent: successfulRenders,
        achievedFps: (renderedThisRun * 1000) / elapsedMs,
        averageRenderMs: renderedThisRun > 0 ? totalRenderMs / renderedThisRun : 0,
      }));

      const renderElapsedMs = performance.now() - tickStartedAt;
      sendTimerRef.current = window.setTimeout(renderNextFrame, Math.max(0, intervalMs - renderElapsedMs));
    };

    void renderNextFrame();
  }, [blockSize, fps, ofdmGridSize, ofdmModulation, qrEcc, qrVersion, selectedTransport, sendFile, sendMode, transferType, vlcModulation]);

  // Re-adjust interval if FPS changes during transmission
  useEffect(() => {
    if (isSending) {
      startSendingLoop();
    }
  }, [isSending, startSendingLoop]);

  // Clean up timer on unmount
  useEffect(() => {
    const timerRef = sendTimerRef;
    const sendingRef = isSendingRef;
    const generationRef = sendLoopGenerationRef;
    return () => {
      sendingRef.current = false;
      generationRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);


  // --- RECEIVER STATE ---
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isReceiverFinalizing, setIsReceiverFinalizing] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "listening" | "receiving" | "success" | "failed" | "reconnecting">("idle");
  const [receivedMeta, setReceivedMeta] = useState<FileMetadata | null>(null);
  const receivedMetaRef = useRef<FileMetadata | null>(null);

  // Progress/Metrics
  const [resolvedBlocksCount, setResolvedBlocksCount] = useState(0);
  const [rxStats, setRxStats] = useState({
    cameraFramesCaptured: 0,
    decodeAttempts: 0,
    decodedFrames: 0,
    missedFrames: 0,
    invalidFrames: 0,
    duplicateFrames: 0,
    acceptedSymbols: 0,
    speedKbs: 0,
    cameraFps: 0,
    decodeFps: 0,
    averageDecodeMs: 0,
  });

  const [hashMatches, setHashMatches] = useState<"unchecked" | "matched" | "mismatch">("unchecked");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [receivedMessage, setReceivedMessage] = useState<string | null>(null);
  const [receivedMediaMetadata, setReceivedMediaMetadata] = useState<MediaMetadata | null>(null);
  const [integrityResult, setIntegrityResult] = useState<IntegrityResultModel>({ status: "waiting", bitPerfect: false });
  const rxStartedAtRef = useRef<number | null>(null);
  const rxCompletedAtRef = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  // Decoding buffers
  const seqBlocksMapRef = useRef<Map<number, Uint8Array>>(new Map());
  const fountainDecoderRef = useRef<FountainDecoder | null>(null);

  // Performance indicators
  const lastScanTimeRef = useRef<number>(0);
  const scannedFramesCountRef = useRef<number>(0);
  const capturedFramesCountRef = useRef<number>(0);
  const totalDecodeTimeRef = useRef<number>(0);
  const rxSpeedIntervalRef = useRef<number | null>(null);
  const lastRecoveredBytesRef = useRef<number>(0);
  const lastSpeedSampleAtRef = useRef<number | null>(null);

  const getCameraLifecycle = () => {
    if (cameraLifecycleRef.current) return cameraLifecycleRef.current;
    const video = videoRef.current;
    if (!video) throw new Error("Camera video element is unavailable");
    cameraLifecycleRef.current = new CameraLifecycleController(video, {
      acquire: () => navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      }),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => cancelAnimationFrame(id),
      setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
      clearInterval: (id) => clearInterval(id),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    });
    return cameraLifecycleRef.current;
  };

  // Start Camera
  const startCamera = async (resume: boolean = false) => {
    // Clear old download/decoding state
    if (!resume) {
      resetReceiverState();
    }

    try {
      const lifecycle = getCameraLifecycle();
      await (resume ? lifecycle.reconnect() : lifecycle.start());

      if (videoRef.current) {
        receiverSessionControllerRef.current?.setReceiving(true);
        setIsCameraActive(true);
        if (!resume) {
          setScanStatus("listening");
        } else {
          // If resuming, we stay in 'receiving' if we already have metadata, else 'listening'
          setScanStatus(receivedMetaRef.current ? "receiving" : "listening");
        }

        // Start scanning loop
        startScanningLoop();
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      alert("Failed to access camera. Please allow camera permissions.");
    }
  };

  // Stop Camera
  const stopCamera = () => {
    cameraLifecycleRef.current?.stop();
    scanLoopRef.current = null;
    rxSpeedIntervalRef.current = null;
    receiverSessionControllerRef.current?.setReceiving(false);

    if (currentSessionRef.current && currentSessionRef.current.status === "active") {
      try {
        const paused = transitionSession(currentSessionRef.current, "paused");
        currentSessionRef.current = paused;
        persistenceQueueRef.current?.setSession(paused);
        void persistenceQueueRef.current?.flush();
      } catch (err) {
        console.warn("Receiver stopCamera session transition warning:", err);
      }
    }

    setIsCameraActive(false);
    setScanStatus("idle");
  };

  const resetReceiverState = (resetAuthoritative = true) => {
    finalizationGenerationGuardRef.current.invalidate();
    receiverSessionControllerRef.current?.setFinalizing(false);
    setIsReceiverFinalizing(false);
    liveReceiverRouterRef.current = null;
    if (resetAuthoritative) reconstructionServiceRef.current.reset();
    applicationFinalizationRef.current = null;
    if (persistenceQueueRef.current) {
      void persistenceQueueRef.current.flush();
      persistenceQueueRef.current.destroy();
      persistenceQueueRef.current = null;
    }
    currentTransferIdRef.current = null;
    currentSessionRef.current = null;
    persistedResolvedIndicesRef.current.clear();
    setDurableCheckpointsCount(0);
    setPersistedSymbolsCount(0);
    setQueueStatus("idle");
    setPersistenceError(null);

    seqBlocksMapRef.current.clear();
    fountainDecoderRef.current = null;
    setReceivedMeta(null);
    receivedMetaRef.current = null;
    setResolvedBlocksCount(0);
    setRxStats({
      cameraFramesCaptured: 0,
      decodeAttempts: 0,
      decodedFrames: 0,
      missedFrames: 0,
      invalidFrames: 0,
      duplicateFrames: 0,
      acceptedSymbols: 0,
      speedKbs: 0,
      cameraFps: 0,
      decodeFps: 0,
      averageDecodeMs: 0,
    });
    setHashMatches("unchecked");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setReceivedMessage(null);
    setReceivedMediaMetadata(null);
    setIntegrityResult({ status: "waiting", bitPerfect: false });
    rxStartedAtRef.current = null;
    rxCompletedAtRef.current = null;
    lastRecoveredBytesRef.current = 0;
    lastSpeedSampleAtRef.current = null;
    scannedFramesCountRef.current = 0;
    capturedFramesCountRef.current = 0;
    totalDecodeTimeRef.current = 0;
  };
  resetReceiverStateRef.current = () => resetReceiverState();

  const sampleReceiveSpeed = () => {
    const meta = receivedMetaRef.current;
    if (!meta) return;
    const now = performance.now();
    const sampleStartedAt = lastSpeedSampleAtRef.current ?? rxStartedAtRef.current ?? now;
    const elapsedMs = Math.max(0, now - sampleStartedAt);
    const resolvedNow = fountainDecoderRef.current?.getResolvedCount() ?? seqBlocksMapRef.current.size;
    const recoveredNow = Math.min(meta.fileSize, resolvedNow * meta.blockSize);
    const diffBytes = Math.max(0, recoveredNow - lastRecoveredBytesRef.current);
    lastRecoveredBytesRef.current = recoveredNow;
    lastSpeedSampleAtRef.current = now;
    const speedKbs = elapsedMs > 0 ? (diffBytes / 1024) / (elapsedMs / 1000) : 0;
    setRxStats((prev) => ({ ...prev, speedKbs }));
  };

  // Continuous transport-specific optical receiver loop.
  const startScanningLoop = () => {
    const lifecycle = getCameraLifecycle();
    lifecycle.clearScheduledWork();

    // Performance trackers
    let lastFpsTime = performance.now();
    lastScanTimeRef.current = performance.now();

    // Start speed measuring interval (every 1 second)
    rxSpeedIntervalRef.current = lifecycle.registerInterval(() => {
      // Camera Stream Watchdog
      const video = videoRef.current;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0 && tracks[0].readyState === 'ended') {
          console.warn("Camera stream died (track ended). Reconnecting...");
          setScanStatus("reconnecting");
          startCamera(true);
          return;
        }
      }

      if (receivedMetaRef.current) {
        sampleReceiveSpeed();
      }
    }, 1000);

    const scanFrame = async () => {
      try {
        const video = videoRef.current;
        const canvas = rxCanvasRef.current;

        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
          return;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (video.videoWidth && video.videoHeight && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          // Draw video frame to hidden canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          capturedFramesCountRef.current++;
          setRxStats((prev) => ({ ...prev, cameraFramesCaptured: prev.cameraFramesCaptured + 1 }));

          const configured = receiverSessionControllerRef.current?.getConfiguration() ?? {
            transport: selectedTransport,
            vlcModulation,
            ofdmModulation,
            ofdmGridSize: ofdmGridSize as 8 | 16 | 32,
          };

          // Decode VLC once per transmitted symbol instead of once per camera frame.
          const now = performance.now();
          if (configured.transport === TransportId.VLC
            && !isVlcDecodeAttemptDue(lastScanTimeRef.current, now, fps)) {
            return;
          }
          lastScanTimeRef.current = now;
          scannedFramesCountRef.current++;
          if (now - lastFpsTime >= 1000) {
            const elapsed = now - lastFpsTime;
            const decodeFps = Math.round((scannedFramesCountRef.current * 1000) / elapsed);
            const cameraFps = Math.round((capturedFramesCountRef.current * 1000) / elapsed);
            setRxStats((prev) => ({ ...prev, decodeFps, cameraFps }));
            scannedFramesCountRef.current = 0;
            capturedFramesCountRef.current = 0;
            lastFpsTime = now;
          }
          const router = liveReceiverRouterRef.current ?? new LiveReceiverRouter({
            transport: configured.transport,
            vlcModulation: configured.vlcModulation,
            ofdmModulation: configured.ofdmModulation,
            ofdmGridSize: configured.ofdmGridSize,
          });
          liveReceiverRouterRef.current = router;
          const scanResult = await router.ingest(canvas);
          const decodedCount = scanResult.payloads.length;
          const corrupt = scanResult.crcStatus === "failed" || scanResult.crcStatus === "invalid";

          totalDecodeTimeRef.current += scanResult.durationMs;
          setRxStats((prev) => ({
            ...prev,
            decodeAttempts: prev.decodeAttempts + 1,
            averageDecodeMs: totalDecodeTimeRef.current / (prev.decodeAttempts + 1),
            decodedFrames: prev.decodedFrames + decodedCount,
            missedFrames: prev.missedFrames + (decodedCount === 0 && !corrupt ? 1 : 0),
            invalidFrames: prev.invalidFrames + (corrupt ? 1 : 0),
          }));

          for (const payload of scanResult.payloads) {
            await processScannedBytes(payload);
          }
        }
      } catch (err) {
        console.error(`${selectedTransport} receiver pipeline error:`, err);
        setScanStatus("failed");
      } finally {
        if (videoRef.current && videoRef.current.srcObject) {
          scanLoopRef.current = lifecycle.scheduleFrame(scanFrame);
        }
      }
    };

    scanLoopRef.current = lifecycle.scheduleFrame(scanFrame);
  };

  // Decode binary data packets
  const processScannedBytes = async (bytes: Uint8Array) => {
    if (bytes.length === 0) return;
    const reconstruction = reconstructionServiceRef.current.ingest(bytes);
    if (reconstruction.finalization && !applicationFinalizationRef.current) {
      const finalizationGeneration = finalizationGenerationGuardRef.current.capture();
      receiverSessionControllerRef.current?.setFinalizing(true);
      setIsReceiverFinalizing(true);
      applicationFinalizationRef.current = reconstruction.finalization
        .then((result) => {
          if (!finalizationGenerationGuardRef.current.isCurrent(finalizationGeneration)) return;
          return completeApplicationReconstruction(result);
        })
        .catch((error) => {
          if (!finalizationGenerationGuardRef.current.isCurrent(finalizationGeneration)) return;
          console.error("Application reconstruction failed:", error);
          setScanStatus("failed");
        })
        .finally(() => {
          if (!finalizationGenerationGuardRef.current.isCurrent(finalizationGeneration)) return;
          receiverSessionControllerRef.current?.setFinalizing(false);
          setIsReceiverFinalizing(false);
        });
    }
    const type = bytes[0] as FrameType;

    // Legacy persistence/UI mirrors are adapters only: a payload rejected by the
    // authoritative reconstruction service must never mutate their state.
    if (!reconstruction.accepted && !reconstruction.duplicate) return;
    // An authoritative transfer-identity reset must clear every downstream
    // persistence/UI mirror before the accepted replacement metadata is applied.
    if (reconstruction.reset) resetReceiverState(false);

    // Handle Metadata frame
    if (type === FrameType.Metadata) {
      try {
        const meta = decodeMetadataFrame(bytes);
        if (!receivedMetaRef.current || receivedMetaRef.current.fileHash.toString() !== meta.fileHash.toString()) {
          setReceivedMeta(meta);
          receivedMetaRef.current = meta;
          setScanStatus("receiving");
          if (rxStartedAtRef.current === null) {
            rxStartedAtRef.current = performance.now();
            lastSpeedSampleAtRef.current = rxStartedAtRef.current;
          }

          // Pre-initialize fountain decoder if needed
          if (!fountainDecoderRef.current) {
            fountainDecoderRef.current = new FountainDecoder(meta.totalBlocks, meta.blockSize);
          }

          // Setup persistence queue for this transfer
          const legacyId = await deriveLegacySessionId(meta);
          if (currentTransferIdRef.current !== legacyId) {
            if (persistenceQueueRef.current) {
              await persistenceQueueRef.current.flush();
              persistenceQueueRef.current.destroy();
            }
            currentTransferIdRef.current = legacyId;
            persistedResolvedIndicesRef.current.clear();
            const hexHash = bytesToHex(meta.fileHash);
            const rxSession: TransferSession = {
              schemaVersion: 1,
              transferId: legacyId,
              protocolVersion: 1,
              direction: "receive",
              transport: receiverSessionControllerRef.current?.getConfiguration().transport ?? selectedTransport,
              file: {
                name: meta.fileName,
                size: meta.fileSize,
                mimeType: meta.dataType === "message" ? "text/plain" : "application/octet-stream",
                sha256Hex: hexHash,
                mediaKind: "other",
              },
              fileHashHex: hexHash,
              blockSize: meta.blockSize,
              totalBlocks: meta.totalBlocks,
              status: "active",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              completedAt: null,
              resumeCapability: "none",
              encodingMode: "fountain",
              acceptedSymbols: 0,
              resolvedBlocks: 0,
              checkpointVersion: 1,
              failureCode: null,
              transportConfig: {},
            };
            currentSessionRef.current = rxSession;
            const currentPersistence = persistenceRef.current;
            if (currentPersistence) {
              const queue = new PersistenceQueue(legacyId, currentPersistence, {
                batchSize: 16,
                flushIntervalMs: 250,
                checkpointSymbolInterval: 16,
                onStatusChange: (status, err) => {
                  setQueueStatus(status);
                  setPersistenceError(err ?? null);
                },
              });
              queue.setSession(rxSession);
              persistenceQueueRef.current = queue;
            }
          }
        }
      } catch (err) {
        console.error("Failed to decode metadata frame:", err);
      }
      return;
    }

    // Handle Sequential frame
    if (type === FrameType.Sequential) {
      if (!receivedMetaRef.current) return; // ignore data if we don't have metadata yet

      try {
        const { blockIndex, payload } = decodeSequentialFrame(bytes);

        if (seqBlocksMapRef.current.has(blockIndex)) {
          console.log("Duplicate symbol dropped");
          setRxStats((prev) => ({ ...prev, duplicateFrames: prev.duplicateFrames + 1 }));
        } else {
          console.log("Symbol accepted");
          setRxStats((prev) => ({ ...prev, acceptedSymbols: prev.acceptedSymbols + 1 }));
          seqBlocksMapRef.current.set(blockIndex, payload);
          const currentCount = seqBlocksMapRef.current.size;
          setResolvedBlocksCount(currentCount);

          if (persistenceQueueRef.current && receivedMetaRef.current) {
            const meta = receivedMetaRef.current;
            const logicalLen = (blockIndex === meta.totalBlocks - 1)
              ? (meta.fileSize % meta.blockSize) || meta.blockSize
              : meta.blockSize;
            persistenceQueueRef.current.queueChunk(blockIndex, payload, logicalLen, meta.blockSize);
          }

          // Check if complete
          if (currentCount === receivedMetaRef.current.totalBlocks) {
            // The shared reconstruction service owns completion and SHA-256 finalization.
          }
        }
      } catch (err) {
        console.error("Failed to decode sequential frame:", err);
      }
      return;
    }

    // Handle Fountain frame
    if (type === FrameType.Fountain) {
      try {
        const { seed, degree, totalBlocks, payload } = decodeFountainFrame(bytes);

        // Metadata is required by the authoritative reconstruction service.
        if (!receivedMetaRef.current) return;

        const K = totalBlocks;
        if (!fountainDecoderRef.current) {
          fountainDecoderRef.current = new FountainDecoder(K, payload.length);
        }

        const redundantBefore = fountainDecoderRef.current.redundantSymbols;
        const symbol: FountainSymbol = { seed, degree, payload };

        const isDone = fountainDecoderRef.current.processSymbol(symbol);
        const redundantAfter = fountainDecoderRef.current.redundantSymbols;

        const resolvedCountAfter = fountainDecoderRef.current.getResolvedCount();
        setResolvedBlocksCount(resolvedCountAfter);

        if (redundantAfter > redundantBefore) {
          console.log("Duplicate symbol dropped");
          setRxStats((prev) => ({ ...prev, duplicateFrames: prev.duplicateFrames + 1 }));
        } else {
          console.log("Symbol accepted");
          setRxStats((prev) => {
            const nextAccepted = prev.acceptedSymbols + 1;
            if (persistenceQueueRef.current) {
              persistenceQueueRef.current.queueSymbol(symbol, nextAccepted);
              setPersistedSymbolsCount(nextAccepted);
            }
            return { ...prev, acceptedSymbols: nextAccepted };
          });

          // Check if new blocks got resolved and queue chunks + checkpoints
          const decoder = fountainDecoderRef.current;
          const meta = receivedMetaRef.current;
          if (decoder && persistenceQueueRef.current && meta && currentTransferIdRef.current) {
            const resolvedIndices = decoder.getResolvedIndices();
            for (const idx of resolvedIndices) {
              if (!persistedResolvedIndicesRef.current.has(idx)) {
                persistedResolvedIndicesRef.current.add(idx);
                const block = decoder.getResolvedBlock(idx);
                if (block) {
                  const logicalLen = (idx === meta.totalBlocks - 1)
                    ? (meta.fileSize % meta.blockSize) || meta.blockSize
                    : meta.blockSize;
                  persistenceQueueRef.current.queueChunk(idx, block, logicalLen, meta.blockSize);
                }
              }
            }

            if (resolvedIndices.length > 0) {
              setDurableCheckpointsCount((c) => c + 1);
              persistenceQueueRef.current.setCheckpoint({
                schemaVersion: 1,
                transferId: currentTransferIdRef.current,
                acceptedSymbols: rxStats.acceptedSymbols + 1,
                resolvedBlockIndices: resolvedIndices,
                persistedChunks: persistedResolvedIndicesRef.current.size,
                metrics: {
                  throughputBytesPerSecond: rxStats.speedKbs * 1024,
                  cameraFps: rxStats.cameraFps,
                  decodeFps: rxStats.decodeFps,
                },
                createdAt: Date.now(),
              });
            }
          }
        }

        if (isDone) {
          // The shared reconstruction service owns completion and SHA-256 finalization.
        }
      } catch (err) {
        console.error("Failed to decode fountain frame:", err);
      }
      return;
    }
  };

  const completeApplicationReconstruction = async (result: ReconstructionResult) => {
    sampleReceiveSpeed();
    stopCamera();
    setScanStatus("success");
    rxCompletedAtRef.current = performance.now();
    const observedHash = Uint8Array.from(result.actualSha256.match(/.{2}/g) ?? [], (value) => Number.parseInt(value, 16));
    await verifyAndSaveFile(result.data, observedHash);
  };

  const finalizeFountainTransfer = async () => {
    const meta = receivedMetaRef.current;
    if (!meta || !fountainDecoderRef.current) return;
    sampleReceiveSpeed();
    stopCamera();
    setScanStatus("success");
    rxCompletedAtRef.current = performance.now();

    const blocks = fountainDecoderRef.current.getResolvedBlocks();
    const fileData = reassembleFile(blocks, meta.fileSize, meta.blockSize);
    await verifyAndSaveFile(fileData);
  };

  const verifyAndSaveFile = async (fileData: Uint8Array, precomputedHash?: Uint8Array) => {
    const meta = receivedMetaRef.current;
    if (!meta) return;

    // Verify SHA-256 Hash
    setIntegrityResult({ status: "verifying", bitPerfect: false });
    const hashArray = precomputedHash ?? await sha256(fileData);

    let isMatch = true;

    // Hash check
    if (meta.fileHash.some((val) => val !== 0)) {
      for (let i = 0; i < 32; i++) {
        if (hashArray[i] !== meta.fileHash[i]) {
          isMatch = false;
          break;
        }
      }
      setHashMatches(isMatch ? "matched" : "mismatch");
      setIntegrityResult(createIntegrityResult(meta.fileHash, hashArray, meta.fileSize, fileData.byteLength));
    } else {
      // If we missed metadata, hash is unchecked
      setHashMatches("unchecked");
      setIntegrityResult(createIntegrityResult(null, hashArray, meta.fileSize, fileData.byteLength));
    }

    if (currentSessionRef.current) {
      try {
        const nextStatus = isMatch ? "complete" : "failed";
        let updatedSession = transitionSession(currentSessionRef.current, nextStatus);
        if (isMatch) {
          updatedSession = setResumeCapability(updatedSession, "complete");
        }
        currentSessionRef.current = updatedSession;
        persistenceQueueRef.current?.setSession(updatedSession);
      } catch (err) {
        console.warn("Session transition on verification warning:", err);
      }
    }
    if (persistenceQueueRef.current) {
      await persistenceQueueRef.current.flush();
    }

    // Handle Message vs File
    if (meta.dataType === "message") {
      const decoder = new TextDecoder();
      const text = decoder.decode(fileData);
      setReceivedMessage(text);
    } else {
      // Create Download Link
      const blob = new Blob([fileData.buffer as ArrayBuffer], { type: "application/octet-stream" });
      setReceivedMediaMetadata(await extractMediaMetadata(blob, meta.fileName));
      const url = URL.createObjectURL(blob);
      cameraLifecycleRef.current?.registerObjectUrl(url);
      setDownloadUrl(url);
    }
  };

  // Stop camera if tab changes
  useEffect(() => {
    if (activeTab !== "receive" && isCameraActive) {
      stopCamera();
    }
  }, [activeTab, isCameraActive]);

  useEffect(() => () => {
    cameraLifecycleRef.current?.dispose();
    cameraLifecycleRef.current = null;
  }, []);

  const recoveredBytes = receivedMeta
    ? Math.min(receivedMeta.fileSize, resolvedBlocksCount * receivedMeta.blockSize)
    : 0;
  const receiverElapsedMs = rxStartedAtRef.current === null
    ? 0
    : (rxCompletedAtRef.current ?? performance.now()) - rxStartedAtRef.current;
  const receiverRemainingMs = receivedMeta && recoveredBytes < receivedMeta.fileSize && rxStats.speedKbs > 0
    ? ((receivedMeta.fileSize - recoveredBytes) / (rxStats.speedKbs * 1024)) * 1000
    : recoveredBytes >= (receivedMeta?.fileSize ?? Number.POSITIVE_INFINITY) ? 0 : null;

  const handleSelectReceiverResume = (session: TransferSession, replay: ReplayResult) => {
    setActiveTab("receive");
    setScanStatus("listening");

    const hexHash = session.file.sha256Hex;
    const match = hexHash.match(/.{1,2}/g);
    const hashBytes = new Uint8Array(match ? match.map((byte) => parseInt(byte, 16)) : []);
    const meta: FileMetadata = {
      fileName: session.file.name,
      fileSize: session.file.size,
      blockSize: session.blockSize,
      totalBlocks: session.totalBlocks,
      fileHash: hashBytes,
      dataType: "file",
    };
    setReceivedMeta(meta);
    receivedMetaRef.current = meta;
    currentTransferIdRef.current = session.transferId;
    currentSessionRef.current = session;

    fountainDecoderRef.current = replay.decoder;
    setResolvedBlocksCount(replay.resolvedIndices.length);
    persistedResolvedIndicesRef.current = new Set(replay.resolvedIndices);
    setPersistedSymbolsCount(replay.replayedSymbols);

    if (persistenceRef.current) {
      const queue = new PersistenceQueue(session.transferId, persistenceRef.current, {
        batchSize: 16,
        flushIntervalMs: 250,
        onStatusChange: (status: PersistenceQueueStatus, err?: string | null) => {
          setQueueStatus(status);
          if (err) setPersistenceError(err);
        },
      });
      persistenceQueueRef.current = queue;
    }

    if (replay.isComplete) {
      void finalizeFountainTransfer();
    } else {
      void startCamera(true);
    }
  };

  const handleSelectSenderResume = useCallback(async (session: TransferSession, file: File) => {
    setActiveTab("send");
    setTransferType("file");
    setSendFile(file);
    setBlockSize(session.blockSize);
    setSendMode(session.encodingMode);
    currentSenderSessionRef.current = session;
    if (persistenceRef.current) {
      try {
        const activeSession = transitionSession(session, "active", Date.now());
        await persistenceRef.current.sessions.put(activeSession);
        currentSenderSessionRef.current = activeSession;
        void refreshSavedSessionsCount();
      } catch (err) {
        console.warn("Error updating resumed sender session:", err);
      }
    }
    setIsSending(true);
  }, [refreshSavedSessionsCount]);

  return (
    <>
      {/* Editorial Fixed Header */}
      <header className="ollyo-nav">
        <div className="ollyo-nav-inner">
          <a href="#" className="ollyo-brand">
            <div className="ollyo-brand-badge">L</div>
            <span>LUMEN</span>
          </a>
          <nav className="ollyo-nav-links">
            <a href="#problem" className="ollyo-nav-link">Problem</a>
            <a href="#solution" className="ollyo-nav-link">Solution</a>
            <a href="#technology" className="ollyo-nav-link">Technology</a>
            <a href="#features" className="ollyo-nav-link">Capabilities</a>
            <a href="#use-cases" className="ollyo-nav-link">Use Cases</a>
            <a href="#performance" className="ollyo-nav-link">Performance</a>
            <a href="#research" className="ollyo-nav-link">Research</a>
            <a href="#demo" className="ollyo-nav-link">Live Demo</a>
          </nav>
          <a href="#demo" className="ollyo-nav-cta">Launch Demo</a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="ollyo-hero">
        <div className="ollyo-container">
          <div className="ollyo-pill">OPTICAL OFFLINE DATA TRANSFER</div>
          <h1 className="ollyo-hero-title">
            Transfer Files.<br />
            Without Networks.<br />
            Using Only Light.
          </h1>
          <p className="ollyo-hero-subtitle">
            A browser-based research platform for moving original file bytes from a screen to a camera without a transfer network. QR Streaming is the measured baseline; VLC and Visual OFDM remain research modes.
          </p>
          <div className="ollyo-hero-actions">
            <a href="#demo" className="ollyo-btn-main">Launch Live Demo</a>
            <a href="#technology" className="ollyo-btn-sub">View Architecture</a>
          </div>
        </div>
      </section>

      {/* The Problem Section */}
      <section className="ollyo-section" id="problem">
        <div className="ollyo-container">
          <div className="ollyo-section-label">THE PROBLEM</div>
          <h2 className="ollyo-editorial-headline">
            Some environments cannot use a transfer network.
          </h2>
          <div className="ollyo-editorial-grid">
            <div className="ollyo-editorial-block">
              <h3>Why WiFi Fails</h3>
              <p>
                Network interfaces may be unavailable, restricted, congested, or unsuitable for a particular experiment. Lumen investigates a local screen-to-camera alternative.
              </p>
            </div>
            <div className="ollyo-editorial-block">
              <h3>Why Bluetooth Fails</h3>
              <p>
                Bluetooth suffers from slow throughput, complex device pairing handshakes, and known protocol exploits. Intercepting or jamming RF broadcasts requires zero physical access to your hardware.
              </p>
            </div>
            <div className="ollyo-editorial-block">
              <h3>Why USB is Restricted</h3>
              <p>
                Physical endpoints are strictly locked down under enterprise zero-trust policies. Mounting external USB flash drives introduces BadUSB firmware exploits and physical hardware payload risks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="ollyo-section" id="solution">
        <div className="ollyo-container">
          <div className="ollyo-section-label">THE SOLUTION</div>
          <h2 className="ollyo-editorial-headline">
            Visual Photons as an Air-Gapped Physical Medium.
          </h2>
          <div className="ollyo-editorial-grid">
            <div className="ollyo-editorial-block">
              <h3>Visible Optical Channel</h3>
              <p>
                Lumen encodes bytes into visual frames shown on a display and observed by a nearby camera. The current transfer path does not require a network connection between the devices.
              </p>
            </div>
            <div className="ollyo-editorial-block">
              <h3>Strict One-Way Isolation</h3>
              <p>
                The baseline application uses a one-way screen-to-camera data path. Security properties depend on the surrounding devices and environment and are not assumed from the optical medium alone.
              </p>
            </div>
            <div className="ollyo-editorial-block">
              <h3>Rateless Fountain Encoding</h3>
              <p>
                By utilizing Luby Transform (LT) Fountain Codes, data packets are mathematically randomized. The receiving camera doesn't need specific frames—it decodes the original payload from any random subset of symbols.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Pipeline Section */}
      <section className="ollyo-section" id="technology">
        <div className="ollyo-container">
          <div className="ollyo-section-label">ARCHITECTURE & PIPELINE</div>
          <h2 className="ollyo-editorial-headline">
            From Binary Chunks to Reconstructed Data.
          </h2>
          <div className="ollyo-pipeline">
            <div className="ollyo-pipe-step">
              <div className="ollyo-pipe-badge">01</div>
              <h5>Input Data</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>File or Message</p>
            </div>
            <div className="ollyo-pipe-arrow">➔</div>
            <div className="ollyo-pipe-step">
              <div className="ollyo-pipe-badge">02</div>
              <h5>SHA-256 Hash</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Cryptographic Check</p>
            </div>
            <div className="ollyo-pipe-arrow">➔</div>
            <div className="ollyo-pipe-step">
              <div className="ollyo-pipe-badge">03</div>
              <h5>Fountain Codes</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>LT Symbol Generator</p>
            </div>
            <div className="ollyo-pipe-arrow">➔</div>
            <div className="ollyo-pipe-step">
              <div className="ollyo-pipe-badge">04</div>
              <h5>QR Stream</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>High-FPS Canvas</p>
            </div>
            <div className="ollyo-pipe-arrow">➔</div>
            <div className="ollyo-pipe-step">
              <div className="ollyo-pipe-badge">05</div>
              <h5>WASM Reader</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>ZXing WebAssembly</p>
            </div>
            <div className="ollyo-pipe-arrow">➔</div>
            <div className="ollyo-pipe-step">
              <div className="ollyo-pipe-badge">06</div>
              <h5>Reassembly</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>SHA-256 Result</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="ollyo-section" id="features">
        <div className="ollyo-container">
          <div className="ollyo-section-label">CORE CAPABILITIES</div>
          <h2 className="ollyo-editorial-headline">
            Engineered for High-Security Operations.
          </h2>
          <div className="ollyo-feature-grid">
            <div className="ollyo-feature-card">
              <div className="ollyo-feature-num">01</div>
              <h3>Completely Offline</h3>
              <p>Zero network adapters, zero socket connections, and zero web requests required during transmission.</p>
            </div>
            <div className="ollyo-feature-card">
              <div className="ollyo-feature-num">02</div>
              <h3>Cross-Platform Validation</h3>
              <p>Android and iPhone device pairs remain explicitly Not tested until a recorded transfer completes with matching SHA-256.</p>
            </div>
            <div className="ollyo-feature-card">
              <div className="ollyo-feature-num">03</div>
              <h3>Camera Based</h3>
              <p>Leverages high-speed WebAssembly decoding engines to scan video frames directly from device cameras.</p>
            </div>
            <div className="ollyo-feature-card">
              <div className="ollyo-feature-num">04</div>
              <h3>Integrity Instrumented</h3>
              <p>Compares the reconstructed byte length and SHA-256 with sender metadata before reporting a bit-perfect transfer.</p>
            </div>
            <div className="ollyo-feature-card">
              <div className="ollyo-feature-num">05</div>
              <h3>Forward Error Correction</h3>
              <p>Rateless Fountain Codes prevent data loss even if camera focus stutters or video frames drop.</p>
            </div>
            <div className="ollyo-feature-card">
              <div className="ollyo-feature-num">06</div>
              <h3>No Infrastructure</h3>
              <p>No backend servers, no cloud storage, no local routers, and zero pairing handshakes required.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Section */}
      <section className="ollyo-section" id="performance">
        <div className="ollyo-container">
          <div className="ollyo-section-label">PERFORMANCE METRICS</div>
          <h2 className="ollyo-editorial-headline">
            Measurements, not marketing estimates.
          </h2>
          <div className="ollyo-metrics-grid">
            <div className="ollyo-metric-card">
              <div className="ollyo-metric-val">Live</div>
              <div className="ollyo-metric-lbl">Requested vs Achieved Screen FPS</div>
            </div>
            <div className="ollyo-metric-card">
              <div className="ollyo-metric-val">Live</div>
              <div className="ollyo-metric-lbl">Effective Throughput</div>
            </div>
            <div className="ollyo-metric-card">
            </div>
            <div className="ollyo-metric-card">
              <div className="ollyo-metric-val">SHA-256</div>
              <div className="ollyo-metric-lbl">Bit-Perfect Completion Check</div>
            </div>
            <div className="ollyo-metric-card">
              <div className="ollyo-metric-val">Not tested</div>
              <div className="ollyo-metric-lbl">Maximum Validated Mobile File Size</div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="ollyo-section" id="use-cases">
        <div className="ollyo-container">
          <div className="ollyo-section-label">ENTERPRISE USE CASES</div>
          <h2 className="ollyo-editorial-headline">
            Candidate research scenarios.
          </h2>
          <div className="ollyo-usecases-grid">
            <div className="ollyo-usecase-card">
              <div className="ollyo-usecase-tag">DEFENSE & GOV</div>
              <h4>Air-Gapped Intelligence</h4>
              <p>Study controlled optical export workflows in isolated laboratory environments after an appropriate security review.</p>
            </div>
            <div className="ollyo-usecase-card">
              <div className="ollyo-usecase-tag">HEALTHCARE</div>
              <h4>Clinical Device Research</h4>
              <p>Evaluate offline transfer mechanics using synthetic data; production medical use requires separate privacy, security, and regulatory validation.</p>
            </div>
            <div className="ollyo-usecase-card">
              <div className="ollyo-usecase-tag">INDUSTRIAL & SCADA</div>
              <h4>PLC Firmware Delivery</h4>
              <p>Deploy signed updates and code blocks directly to air-gapped industrial manufacturing controllers.</p>
            </div>
            <div className="ollyo-usecase-card">
              <div className="ollyo-usecase-tag">FINANCIAL VAULTS</div>
              <h4>Cold Storage Wallet Sync</h4>
              <p>Sign transactions and transfer cryptographic public keys between hardware security modules and offline terminals.</p>
            </div>
            <div className="ollyo-usecase-card">
              <div className="ollyo-usecase-tag">EMERGENCY RESPONSE</div>
              <h4>Zero-Cellular Comms</h4>
              <p>Transmit text messages and coordinates between field devices during disaster relief when cell towers are down.</p>
            </div>
            <div className="ollyo-usecase-card">
              <div className="ollyo-usecase-tag">RESEARCH LABS</div>
              <h4>Proprietary Code Audit</h4>
              <p>Extract telemetry logs and audit records from isolated cleanrooms without granting external internet access.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Research Dashboard Section */}
      <section className="ollyo-section" id="research">
        <div className="ollyo-container">
          <ResearchDashboard persistence={persistence} />
        </div>
      </section>

      {/* Live Demo Console Container */}
      <section className="ollyo-section" id="demo">
        <div className="ollyo-container">
          <div className="ollyo-section-label">LIVE ENGINE CONSOLE</div>
          <h2 className="ollyo-editorial-headline">
            Experience Optical Transfer in Action.
          </h2>

          <div className="ollyo-demo">
            <nav className="tabs">
              <button
                className={`tab-btn ${activeTab === "send" ? "active" : ""}`}
                onClick={() => setActiveTab("send")}
              >
                Send
              </button>
              <button
                className={`tab-btn ${activeTab === "receive" ? "active" : ""}`}
                onClick={() => setActiveTab("receive")}
              >
                Receive
              </button>
            </nav>

            <main className="content">
              {activeTab === "send" ? (
                <div className="card grid-2col">
                  {/* Sender controls */}
                  <div className="sender-controls">
                    <h2 style={{ textAlign: "left", marginBottom: "20px" }}>Transfer Settings</h2>

                    <StorageStatus
                      backendKind={persistence?.kind ?? "memory"}
                      queueStatus={currentSenderSessionRef.current ? "saved" : "idle"}
                      capabilities={storageCaps}
                      fallbackReason={persistence?.fallbackReason}
                      recoverableCount={savedSessionsCount}
                      onOpenRecovery={() => setIsRecoveryOpen(true)}
                    />

                    <div className="form-group" style={{ marginTop: "16px" }}>
                      <label className="form-label">Transfer Type</label>
                      <div className="transfer-type-toggle" role="group" aria-label="Transfer type">
                        <button type="button" className={`transfer-type-btn ${transferType === "file" ? "active" : ""}`} onClick={() => setTransferType("file")} disabled={isSending}>File</button>
                        <button type="button" className={`transfer-type-btn ${transferType === "message" ? "active" : ""}`} onClick={() => setTransferType("message")} disabled={isSending}>Message</button>
                      </div>
                    </div>

                    <div className="form-group">
                      {transferType === "file" ? <>
                        <label className="form-label">Select File</label>
                        <div className="dropzone active" onClick={() => document.getElementById("file-picker")?.click()}>
                          <div className="dropzone-icon">📁</div>
                          <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)" }}>
                            {sendFile ? "Click to change file" : "Drag and drop or click to select file"}
                          </p>
                          <input
                            id="file-picker"
                            type="file"
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                            disabled={isSending}
                          />
                        </div>

                        {sendFile && (
                          <div className="file-info-bar">
                            <div className="file-name" title={sendFile.name}>
                              {sendFile.name}
                            </div>
                            <div className="file-size">
                              {(sendFile.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        )}
                        {sendMediaMetadata && <MediaVerification metadata={sendMediaMetadata} />}
                      </> : <>
                        <label className="form-label" htmlFor="message-input">Write Message</label>
                        <textarea id="message-input" className="message-input" value={sendText} onChange={handleTextChange} placeholder="Type the message you want to send..." disabled={isSending} rows={9} />
                        <div className="message-byte-count">{new TextEncoder().encode(sendText).length.toLocaleString()} bytes</div>
                      </>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Optical Transport</label>
                      <div className="mode-selector" role="list" aria-label="Optical transports">
                        <button
                          type="button"
                          className={`mode-option ${selectedTransport === TransportId.QR ? "selected" : ""}`}
                          onClick={() => setSelectedTransport(TransportId.QR)}
                          disabled={isSending || isCameraActive || isReceiverFinalizing}
                        >
                          <ModeBadge transport={TransportId.QR} />
                          <small>Verified Baseline</small>
                        </button>
                        <button
                          type="button"
                          className={`mode-option ${selectedTransport === TransportId.VLC ? "selected" : ""}`}
                          onClick={() => setSelectedTransport(TransportId.VLC)}
                          disabled={isSending || isCameraActive || isReceiverFinalizing}
                        >
                          <ModeBadge transport={TransportId.VLC} />
                          <small>Experimental Prototype</small>
                        </button>
                        <button
                          type="button"
                          className={`mode-option ${selectedTransport === TransportId.VisualOFDM ? "selected" : ""}`}
                          onClick={() => setSelectedTransport(TransportId.VisualOFDM)}
                          disabled={isSending || isCameraActive || isReceiverFinalizing}
                        >
                          <ModeBadge transport={TransportId.VisualOFDM} />
                          <small>Experimental Prototype</small>
                        </button>
                      </div>
                    </div>

                    {selectedTransport === TransportId.VLC && (
                      <div className="vlc-controls-panel" style={{
                        background: "rgba(234, 179, 8, 0.08)",
                        border: "1px solid rgba(234, 179, 8, 0.3)",
                        borderRadius: "8px",
                        padding: "14px",
                        marginBottom: "16px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <span style={{ fontWeight: 600, color: "#fde047", fontSize: "13px" }}>
                            ⚠️ VLC Mode (Experimental Prototype)
                          </span>
                        </div>
                        <p style={{ fontSize: "12px", color: "#d1d5db", margin: "0 0 10px 0" }}>
                          Visible Light Communication is an experimental prototype. Screen-to-camera transmission is unverified in hardware.
                        </p>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: "12px" }}>VLC Modulation Scheme</label>
                          <select
                            className="form-select"
                            value={vlcModulation}
                            onChange={(e) => setVlcModulation(e.target.value as VlcModulationScheme)}
                            disabled={isSending || isCameraActive || isReceiverFinalizing}
                            style={{ fontSize: "12px" }}
                          >
                            <option value="ook">OOK (On-Off Keying · 1 bit/symbol)</option>
                            <option value="pam4">4-PAM (Pulse Amplitude Modulation · 2 bits/symbol)</option>
                            <option value="csk8">CSK-8 (Color-Shift Keying · 3 bits/symbol)</option>
                            <option value="csk16">CSK-16 (Color-Shift Keying · 4 bits/symbol)</option>
                          </select>
                        </div>

                        <VlcWaveformInspector
                          modulation={vlcModulation}
                          calibration={vlcCalibration}
                          demodStatus="idle"
                        />
                      </div>
                    )}

                    {selectedTransport === TransportId.VisualOFDM && (
                      <div className="vlc-controls-panel" style={{
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        borderRadius: "8px",
                        padding: "14px",
                        marginBottom: "16px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <span style={{ fontWeight: 600, color: "#a5b4fc", fontSize: "13px" }}>
                            ⚠️ Visual OFDM (Experimental Prototype)
                          </span>
                        </div>
                        <p style={{ fontSize: "12px", color: "#d1d5db", margin: "0 0 10px 0" }}>
                          Visual OFDM is an experimental spatial-frequency prototype. Screen-to-camera optical transmission is not physically tested.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: "12px" }}>Modulation Scheme</label>
                            <select
                              className="form-select"
                              value={ofdmModulation}
                              onChange={(e) => setOfdmModulation(e.target.value as OfdmModulationScheme)}
                              disabled={isSending || isCameraActive || isReceiverFinalizing}
                              style={{ fontSize: "12px" }}
                            >
                              <option value="bpsk">BPSK (1 bit/carrier · Real Basis)</option>
                              <option value="qpsk">QPSK (2 bits/carrier · 4-Level)</option>
                              <option value="16qam">16-QAM (4 bits/carrier)</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: "12px" }}>Spatial Grid Size</label>
                            <select
                              className="form-select"
                              value={ofdmGridSize}
                              onChange={(e) => setOfdmGridSize(Number(e.target.value))}
                              disabled={isSending || isCameraActive || isReceiverFinalizing}
                              style={{ fontSize: "12px" }}
                            >
                              <option value={8}>8×8 Grid (64 carriers)</option>
                              <option value={16}>16×16 Grid (256 carriers)</option>
                              <option value={32}>32×32 Grid (1024 carriers)</option>
                            </select>
                          </div>
                        </div>

                        <OfdmSpectrumInspector
                          modulation={ofdmModulation}
                          gridSize={ofdmGridSize}
                          gridMap={ofdmSubcarrierMap}
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">QR Reliability Mode</label>
                      <select
                        className="form-select"
                        value={sendMode}
                        onChange={(e) => setSendMode(e.target.value as "fountain" | "sequential")}
                        disabled={isSending}
                      >
                        <option value="fountain">Fountain Code (LT code, rateless, drop-resilient)</option>
                        <option value="sequential">Sequential Loop (standard frame-by-frame)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <div className="range-val-container">
                        <label className="form-label">Block Size (Bytes)</label>
                        <span className="range-val">{blockSize} bytes</span>
                      </div>
                      <input
                        type="range"
                        className="form-input-range"
                        min="256"
                        max="2900"
                        step="100"
                        value={blockSize}
                        onChange={(e) => setBlockSize(parseInt(e.target.value))}
                        disabled={isSending}
                      />
                    </div>

                    <div className="form-group">
                      <div className="range-val-container">
                        <label className="form-label">Display Frame Rate (FPS)</label>
                        <span className="range-val">{fps} FPS</span>
                      </div>
                      <input
                        type="range"
                        className="form-input-range"
                        min="2"
                        max="60"
                        step="1"
                        value={fps}
                        onChange={(e) => setFps(parseInt(e.target.value))}
                      />
                    </div>

                    <div className="form-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <label className="form-label">QR Version (Cap)</label>
                        <select
                          className="form-select"
                          value={qrVersion !== undefined ? qrVersion : ""}
                          onChange={(e) => setQrVersion(e.target.value ? parseInt(e.target.value) : undefined)}
                          disabled={isSending}
                        >
                          <option value="">Auto-select (Recommended)</option>
                          {Array.from({ length: 40 }, (_, i) => i + 1).map((v) => (
                            <option key={v} value={v}>Version {v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">QR Error Correction</label>
                        <select
                          className="form-select"
                          value={qrEcc}
                          onChange={(e) => setQrEcc(e.target.value as "L" | "M" | "Q" | "H")}
                          disabled={isSending}
                        >
                          <option value="L">Level L (Low overhead, max density)</option>
                          <option value="M">Level M (Medium)</option>
                          <option value="Q">Level Q (Quarter)</option>
                          <option value="H">Level H (High robustness)</option>
                        </select>
                      </div>
                    </div>

                    <div className="controls-row">
                      <button
                        className={`btn ${isSending ? "btn-secondary" : "btn-primary"}`}
                        onClick={toggleSend}
                        disabled={transferType === "file" ? !sendFile : !sendText.trim()}
                      >
                        {isSending ? <PauseIcon /> : <PlayIcon />}
                        {isSending ? "Pause Transmission" : "Start Transmission"}
                      </button>
                      {isSending && (
                        <button className="btn btn-danger" onClick={stopSending}>
                          <StopIcon />
                          Stop
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Canvas screen */}
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div className="canvas-wrapper">
                      <canvas
                        ref={sendCanvasRef}
                        width="360"
                        height="360"
                        style={{ width: "100%", height: "auto", display: "block" }}
                      />
                      <div className="canvas-caption">
                        <ProtocolRendererDiagnostics diagnostics={rendererDiagnostics} />
                        {isSending ? (
                          <div>
                            <span style={{ color: "var(--color-accent)", fontWeight: "bold" }}>● TRANSMITTING</span>
                            <br />
                            Frames sent: {senderStats.framesSent}
                            <br />
                            Achieved: {senderStats.achievedFps.toFixed(1)} FPS | Render: {senderStats.averageRenderMs.toFixed(1)} ms
                            <br />
                            {sendMode === "sequential"
                              ? `Block: ${senderStats.currentFrameIndex + 1} / ${senderStats.totalBlocks}`
                              : `Current Seed: 0x${senderStats.fountainSeed.toString(16).toUpperCase()}`}
                          </div>
                        ) : (transferType === "file" ? sendFile : sendText.trim()) ? (
                          `Ready. Click Start to transmit ${selectedTransport === TransportId.QR ? "QR frames" : selectedTransport === TransportId.VLC ? "VLC optical symbols" : "Visual OFDM carrier grids"}.`
                        ) : (
                          transferType === "file" ? "Select a file to begin." : "Write a message to begin."
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card grid-2col">
                  {/* Left Column: Video Scanner Feed */}
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div className="scanner-container">
                      <video
                        ref={videoRef}
                        className="scanner-video"
                        autoPlay
                        playsInline
                        muted
                      />
                      {isCameraActive && (
                        <div className="scanner-overlay">
                          <div className="scanner-laser" />
                          <div className="scanner-target-box" />
                        </div>
                      )}
                      {!isCameraActive && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "16px",
                            background: "rgba(0,0,0,0.85)",
                          }}
                        >
                          <span style={{ fontSize: "40px" }}>📷</span>
                          <button className="btn btn-primary" onClick={() => startCamera()}>
                            Start Camera Feed
                          </button>
                        </div>
                      )}
                    </div>

                    {isCameraActive && (
                      <div style={{ marginTop: "16px" }}>
                        <button className="btn btn-secondary" onClick={stopCamera}>
                          Stop Camera
                        </button>
                      </div>
                    )}

                    {/* Hidden scan canvas */}
                    <canvas
                      ref={rxCanvasRef}
                      width="320"
                      height="240"
                      style={{ display: "none" }}
                    />
                  </div>

                  {/* Right Column: Decoding Stats and Downloads */}
                  <div style={{ textAlign: "left" }}>
                    <h2 style={{ marginBottom: "20px" }}>Receiver Status</h2>

                    <div className="form-group">
                      <label className="form-label">Receive Mode</label>
                      <select
                        className="form-select"
                        value={selectedTransport}
                        onChange={(event) => setSelectedTransport(event.target.value as TransportId)}
                        disabled={isCameraActive || isReceiverFinalizing}
                      >
                        <option value={TransportId.QR}>QR Streaming</option>
                        <option value={TransportId.VLC}>VLC</option>
                        <option value={TransportId.VisualOFDM}>Visual OFDM</option>
                      </select>
                    </div>

                    {selectedTransport === TransportId.VLC && (
                      <div className="form-group">
                        <label className="form-label">VLC Modulation</label>
                        <select
                          className="form-select"
                          value={vlcModulation}
                          onChange={(event) => setVlcModulation(event.target.value as VlcModulationScheme)}
                          disabled={isCameraActive || isReceiverFinalizing}
                        >
                          <option value="ook">OOK</option>
                          <option value="pam4">4-PAM</option>
                          <option value="csk8">CSK-8</option>
                          <option value="csk16">CSK-16</option>
                        </select>
                        <label className="form-label" style={{ marginTop: "12px" }}>Symbol Rate</label>
                        <input
                          className="form-input"
                          type="number"
                          min="1"
                          max="30"
                          value={fps}
                          onChange={(event) => setFps(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
                          disabled={isCameraActive || isReceiverFinalizing}
                        />
                        <small style={{ display: "block", marginTop: "8px", color: "var(--text-secondary)" }}>
                          Match the sender's VLC modulation and symbol rate ({fps} symbols/s) before starting the camera.
                        </small>
                      </div>
                    )}

                    <div className="form-group">
                      <span className={`status-badge ${scanStatus}`}>
                        {scanStatus === "idle" ? "Idle" : scanStatus === "listening" ? "Scanning..." : scanStatus === "receiving" ? "Transferring..." : scanStatus === "success" ? "Success" : scanStatus === "failed" ? "Failed" : "Camera disconnected, reconnecting..."}
                      </span>
                      {!zxingReady && (
                        <span style={{ marginLeft: "12px", fontSize: "13px", color: "var(--color-accent)" }}>
                          Loading WASM modules...
                        </span>
                      )}
                    </div>

                    {receivedMeta && (
                      <div style={{ marginBottom: "24px" }}>
                        <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>
                          {receivedMeta.dataType === "message" ? "Incoming message" : `File: ${receivedMeta.fileName}`}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "14px", fontFamily: "var(--font-mono)" }}>
                          Size: {(receivedMeta.fileSize / 1024).toFixed(1)} KB | Blocks: {receivedMeta.totalBlocks} | Size/Block: {receivedMeta.blockSize} B
                        </div>
                      </div>
                    )}

                    <div className="progress-container">
                      <div className="progress-header">
                        <span>Reassembly Progress</span>
                        <span>
                          {resolvedBlocksCount} / {receivedMeta?.totalBlocks || "?"} blocks
                        </span>
                      </div>
                      <div className="progress-bar-bg">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: receivedMeta
                              ? `${(resolvedBlocksCount / receivedMeta.totalBlocks) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                    </div>

                    <StorageStatus
                      backendKind={persistence?.kind ?? "memory"}
                      queueStatus={queueStatus}
                      capabilities={storageCaps}
                      error={persistenceError}
                      fallbackReason={persistence?.fallbackReason}
                      durableCheckpoints={durableCheckpointsCount}
                      persistedSymbols={persistedSymbolsCount}
                      recoverableCount={savedSessionsCount}
                      onOpenRecovery={() => setIsRecoveryOpen(true)}
                    />

                    <TransferStatistics
                      fileName={receivedMeta?.fileName ?? "Waiting for metadata"}
                      fileSize={receivedMeta?.fileSize ?? 0}
                      progress={receivedMeta ? (resolvedBlocksCount / receivedMeta.totalBlocks) * 100 : 0}
                      decodedFrames={rxStats.decodedFrames}
                      missedFrames={rxStats.missedFrames}
                      invalidFrames={rxStats.invalidFrames}
                      duplicateFrames={rxStats.duplicateFrames}
                      acceptedSymbols={rxStats.acceptedSymbols}
                      cameraFps={rxStats.cameraFps}
                      screenFps={null}
                      throughputBytesPerSecond={rxStats.speedKbs * 1024}
                      elapsedMs={receiverElapsedMs}
                      remainingMs={receiverRemainingMs}
                      persistenceStatus={queueStatus}
                      durableCheckpoints={durableCheckpointsCount}
                    />

                    <OpticalSignalMetrics
                      configuredBrightnessPercent={100}
                      cameraFps={rxStats.cameraFps}
                      screenFps={null}
                    />

                    <IntegrityResult result={integrityResult} />
                    {receivedMediaMetadata && <MediaVerification metadata={receivedMediaMetadata} />}

                    {hashMatches === "matched" && (
                      <div className="hash-verified">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        SHA-256 Hash Match Verified (Integrity Check Passed)
                      </div>
                    )}

                    {hashMatches === "mismatch" && (
                      <div className="hash-failed">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        SHA-256 Integrity Error: Hash Mismatch
                      </div>
                    )}

                    {downloadUrl && receivedMeta && (
                      <div style={{ marginTop: "32px", display: "flex", gap: "12px" }}>
                        <a
                          href={downloadUrl}
                          download={receivedMeta.fileName}
                          className="btn btn-primary"
                          style={{ textDecoration: "none" }}
                        >
                          <DownloadIcon />
                          Download File
                        </a>
                        <button className="btn btn-secondary" onClick={() => resetReceiverState()}>
                          Reset Scanner
                        </button>
                      </div>
                    )}

                    {receivedMessage !== null && receivedMeta?.dataType === "message" && (
                      <div className="received-message-container">
                        <div className="received-message-title">Message Received</div>
                        <div className="received-message-body">{receivedMessage}</div>
                        <button className="btn btn-secondary" onClick={() => resetReceiverState()}>Reset Scanner</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </section>

      {/* Editorial Footer */}
      <footer className="ollyo-footer">
        <div className="ollyo-container">
          <div className="ollyo-footer-inner">
            <a href="#" className="ollyo-brand">
              <div className="ollyo-brand-badge">L</div>
              <span>LUMEN</span>
            </a>
            <div className="ollyo-footer-links">
              <a href="#problem">Problem</a>
              <a href="#technology">Technology</a>
              <a href="#features">Capabilities</a>
              <a href="#use-cases">Use Cases</a>
              <a href="#research">Research</a>
              <a href="https://github.com/akhlak007/qr_transfer" target="_blank" rel="noreferrer">GitHub</a>
              <a href="#demo">Launch Console</a>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: "40px", color: "var(--text-muted)", fontSize: "13px" }}>
            © {new Date().getFullYear()} Lumen. Experimental browser-based optical communication research platform.
          </div>
        </div>
      </footer>

      <RecoveryModal
        isOpen={isRecoveryOpen}
        onClose={() => {
          setIsRecoveryOpen(false);
          void refreshSavedSessionsCount();
        }}
        persistence={persistence}
        onSelectReceiverResume={handleSelectReceiverResume}
        onSelectSenderResume={handleSelectSenderResume}
      />
    </>
  );
}

export default App;
