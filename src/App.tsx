import React, { useState, useEffect, useRef } from "react";
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
import { renderQRToCanvas } from "./modules/qr-render";
import { scanQRCode } from "./modules/qr-scan";
import { prepareZXingModule } from "zxing-wasm/reader";


const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  </svg>
);

const StopIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>
);

function App() {
  const [activeTab, setActiveTab] = useState<"send" | "receive">("send");
  const [zxingReady, setZxingReady] = useState(false);

  // Pre-load WASM on start
  useEffect(() => {
    prepareZXingModule({ fireImmediately: true })
      .then(() => setZxingReady(true))
      .catch((err) => console.error("Failed to load ZXing WASM:", err));
  }, []);

  // --- SENDER STATE ---
  const [sendFile, setSendFile] = useState<File | null>(null);
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
  });

  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendTimerRef = useRef<number | null>(null);
  const fileBytesRef = useRef<Uint8Array | null>(null);
  const fileHashRef = useRef<Uint8Array | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const fountainEncoderRef = useRef<FountainEncoder | null>(null);

  // File loading
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSendFile(file);
    setIsSending(false);

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    fileBytesRef.current = bytes;

    // Calculate SHA-256 hash using Web Crypto API (native platform feature)
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    fileHashRef.current = new Uint8Array(hashBuffer);

    // Chunks
    const blocks = chunkFile(bytes, blockSize);
    chunksRef.current = blocks;
    fountainEncoderRef.current = new FountainEncoder(blocks, blockSize);

    setSenderStats({
      totalBlocks: blocks.length,
      framesSent: 0,
      currentFrameIndex: 0,
      fountainSeed: 0,
    });
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
    if (!sendFile || !fileBytesRef.current || !fileHashRef.current) return;
    
    if (isSending) {
      // Pause
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
      setIsSending(false);
    } else {
      // Start
      setIsSending(true);
      startSendingLoop();
    }
  };

  const stopSending = () => {
    if (sendTimerRef.current) clearInterval(sendTimerRef.current);
    setIsSending(false);
    setSenderStats((prev) => ({
      ...prev,
      framesSent: 0,
      currentFrameIndex: 0,
    }));
    
    // Clear canvas
    const canvas = sendCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const startSendingLoop = () => {
    if (sendTimerRef.current) clearInterval(sendTimerRef.current);

    let frameCounter = senderStats.framesSent;
    let seqIndex = senderStats.currentFrameIndex;

    const metadata = {
      fileSize: fileBytesRef.current!.length,
      blockSize: blockSize,
      totalBlocks: chunksRef.current.length,
      fileHash: fileHashRef.current!,
      fileName: sendFile!.name,
    };

    const intervalMs = 1000 / fps;

    sendTimerRef.current = window.setInterval(async () => {
      const canvas = sendCanvasRef.current;
      if (!canvas) return;

      let frameData: Uint8Array;

      // Every 15th frame, send the metadata header so the receiver can catch up
      if (frameCounter % 15 === 0) {
        frameData = encodeMetadataFrame(metadata);
      } else {
        if (sendMode === "sequential") {
          // Sequential mode
          const block = chunksRef.current[seqIndex];
          frameData = encodeSequentialFrame(seqIndex, block);
          
          setSenderStats((prev) => ({
            ...prev,
            currentFrameIndex: seqIndex,
          }));

          seqIndex = (seqIndex + 1) % chunksRef.current.length;
        } else {
          // Fountain Mode
          if (!fountainEncoderRef.current) {
            fountainEncoderRef.current = new FountainEncoder(chunksRef.current, blockSize);
          }
          const symbol = fountainEncoderRef.current.generateSymbol();
          frameData = encodeFountainFrame(symbol, chunksRef.current.length);
          
          setSenderStats((prev) => ({
            ...prev,
            fountainSeed: symbol.seed,
          }));
        }
      }

      // Render frame to canvas
      try {
        await renderQRToCanvas(canvas, frameData, { ecc: qrEcc, version: qrVersion });
      } catch (err) {
        console.error("QR Code rendering failed (data size might exceed QR version capacity):", err);
      }

      frameCounter++;
      setSenderStats((prev) => ({
        ...prev,
        framesSent: frameCounter,
      }));
    }, intervalMs);
  };

  // Re-adjust interval if FPS changes during transmission
  useEffect(() => {
    if (isSending) {
      startSendingLoop();
    }
  }, [fps, sendMode, qrEcc, qrVersion]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
    };
  }, []);


  // --- RECEIVER STATE ---
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "listening" | "receiving" | "success" | "failed">("idle");
  const [receivedMeta, setReceivedMeta] = useState<FileMetadata | null>(null);
  
  // Progress/Metrics
  const [resolvedBlocksCount, setResolvedBlocksCount] = useState(0);
  const [rxStats, setRxStats] = useState({
    totalFramesScanned: 0,
    duplicateFrames: 0,
    speedKbs: 0,
    scanFps: 0,
  });
  
  const [hashMatches, setHashMatches] = useState<"unchecked" | "matched" | "mismatch">("unchecked");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  
  // Decoding buffers
  const seqBlocksMapRef = useRef<Map<number, Uint8Array>>(new Map());
  const fountainDecoderRef = useRef<FountainDecoder | null>(null);
  
  // Performance indicators
  const lastScanTimeRef = useRef<number>(0);
  const scannedFramesCountRef = useRef<number>(0);
  const rxSpeedIntervalRef = useRef<number | null>(null);
  const lastResolvedCountRef = useRef<number>(0);
  const uniqueFramesCountRef = useRef<number>(0);
  const lastUniqueCountRef = useRef<number>(0);

  // Start Camera
  const startCamera = async () => {
    // Clear old download/decoding state
    resetReceiverState();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setScanStatus("listening");
        
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
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    if (rxSpeedIntervalRef.current) clearInterval(rxSpeedIntervalRef.current);
    
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    
    setIsCameraActive(false);
    setScanStatus("idle");
  };

  const resetReceiverState = () => {
    seqBlocksMapRef.current.clear();
    fountainDecoderRef.current = null;
    setReceivedMeta(null);
    setResolvedBlocksCount(0);
    setRxStats({
      totalFramesScanned: 0,
      duplicateFrames: 0,
      speedKbs: 0,
      scanFps: 0,
    });
    setHashMatches("unchecked");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    lastResolvedCountRef.current = 0;
    scannedFramesCountRef.current = 0;
    uniqueFramesCountRef.current = 0;
    lastUniqueCountRef.current = 0;
  };

  // Continuous QR Scanner Loop
  const startScanningLoop = () => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    
    // Performance trackers
    let lastFpsTime = performance.now();
    lastScanTimeRef.current = performance.now();

    // Start speed measuring interval (every 1 second)
    if (rxSpeedIntervalRef.current) clearInterval(rxSpeedIntervalRef.current);
    rxSpeedIntervalRef.current = window.setInterval(() => {
      if (receivedMeta) {
        // Calculate speed based on newly received unique frames/symbols
        const diff = uniqueFramesCountRef.current - lastUniqueCountRef.current;
        lastUniqueCountRef.current = uniqueFramesCountRef.current;
        const speed = (diff * receivedMeta.blockSize) / 1024; // KB/s
        setRxStats((prev) => ({
          ...prev,
          speedKbs: Math.round(speed),
        }));
      }
    }, 1000);

    const scanFrame = async () => {
      const video = videoRef.current;
      const canvas = rxCanvasRef.current;
      
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        scanLoopRef.current = requestAnimationFrame(scanFrame);
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
        
        // Measure scan FPS
        const now = performance.now();
        scannedFramesCountRef.current++;
        if (now - lastFpsTime >= 1000) {
          const fps = Math.round((scannedFramesCountRef.current * 1000) / (now - lastFpsTime));
          setRxStats((prev) => ({ ...prev, scanFps: fps }));
          scannedFramesCountRef.current = 0;
          lastFpsTime = now;
        }

        // Scan QR from Canvas
        const scanResult = await scanQRCode(canvas);
        
        if (scanResult) {
          setRxStats((prev) => ({ ...prev, totalFramesScanned: prev.totalFramesScanned + 1 }));
          processScannedBytes(scanResult.bytes);
        }
      }

      scanLoopRef.current = requestAnimationFrame(scanFrame);
    };

    scanLoopRef.current = requestAnimationFrame(scanFrame);
  };

  // Decode binary data packets
  const processScannedBytes = async (bytes: Uint8Array) => {
    if (bytes.length === 0) return;
    const type = bytes[0] as FrameType;

    // Handle Metadata frame
    if (type === FrameType.Metadata) {
      try {
        const meta = decodeMetadataFrame(bytes);
        if (!receivedMeta || receivedMeta.fileHash.toString() !== meta.fileHash.toString()) {
          setReceivedMeta(meta);
          setScanStatus("receiving");
          
          // Pre-initialize fountain decoder if needed
          if (!fountainDecoderRef.current) {
            fountainDecoderRef.current = new FountainDecoder(meta.totalBlocks, meta.blockSize);
          }
        }
      } catch (err) {
        console.error("Failed to decode metadata frame:", err);
      }
      return;
    }

    // Handle Sequential frame
    if (type === FrameType.Sequential) {
      if (!receivedMeta) return; // ignore data if we don't have metadata yet
      
      try {
        const { blockIndex, payload } = decodeSequentialFrame(bytes);
        
        if (seqBlocksMapRef.current.has(blockIndex)) {
          setRxStats((prev) => ({ ...prev, duplicateFrames: prev.duplicateFrames + 1 }));
        } else {
          uniqueFramesCountRef.current++;
          seqBlocksMapRef.current.set(blockIndex, payload);
          const currentCount = seqBlocksMapRef.current.size;
          setResolvedBlocksCount(currentCount);

          // Check if complete
          if (currentCount === receivedMeta.totalBlocks) {
            finalizeSequentialTransfer();
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

        // Auto-initialize metadata placeholder if we missed the metadata frame but got a fountain frame
        if (!receivedMeta) {
          const placeholderMeta: FileMetadata = {
            fileSize: totalBlocks * payload.length, // approximation
            blockSize: payload.length,
            totalBlocks: totalBlocks,
            fileHash: new Uint8Array(32), // empty placeholder until metadata comes
            fileName: "reconstructed_file",
          };
          setReceivedMeta(placeholderMeta);
          setScanStatus("receiving");
        }

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
          setRxStats((prev) => ({ ...prev, duplicateFrames: prev.duplicateFrames + 1 }));
        } else {
          uniqueFramesCountRef.current++;
        }

        if (isDone) {
          finalizeFountainTransfer();
        }
      } catch (err) {
        console.error("Failed to decode fountain frame:", err);
      }
      return;
    }
  };

  // Rebuild and save files
  const finalizeSequentialTransfer = async () => {
    if (!receivedMeta) return;
    stopCamera();
    setScanStatus("success");

    // Collect blocks in order
    const blocks: Uint8Array[] = [];
    for (let i = 0; i < receivedMeta.totalBlocks; i++) {
      blocks.push(seqBlocksMapRef.current.get(i) || new Uint8Array(receivedMeta.blockSize));
    }

    const fileData = reassembleFile(blocks, receivedMeta.fileSize, receivedMeta.blockSize);
    await verifyAndSaveFile(fileData);
  };

  const finalizeFountainTransfer = async () => {
    if (!receivedMeta || !fountainDecoderRef.current) return;
    stopCamera();
    setScanStatus("success");

    const blocks = fountainDecoderRef.current.getResolvedBlocks();
    const fileData = reassembleFile(blocks, receivedMeta.fileSize, receivedMeta.blockSize);
    await verifyAndSaveFile(fileData);
  };

  const verifyAndSaveFile = async (fileData: Uint8Array) => {
    if (!receivedMeta) return;

    // Verify SHA-256 Hash
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileData.buffer as ArrayBuffer);
    const hashArray = new Uint8Array(hashBuffer);

    let isMatch = true;
    
    // Hash check
    if (receivedMeta.fileHash.some((val) => val !== 0)) {
      for (let i = 0; i < 32; i++) {
        if (hashArray[i] !== receivedMeta.fileHash[i]) {
          isMatch = false;
          break;
        }
      }
      setHashMatches(isMatch ? "matched" : "mismatch");
    } else {
      // If we missed metadata, hash is unchecked
      setHashMatches("unchecked");
    }

    // Create Download Link
    const blob = new Blob([fileData.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
  };

  // Stop camera if tab changes
  useEffect(() => {
    if (activeTab !== "receive" && isCameraActive) {
      stopCamera();
    }
  }, [activeTab]);

  return (
    <>
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon">L</div>
          <h1 className="app-title">Lumen</h1>
        </div>
        <p className="app-subtitle">High-speed, rateless optical file transfer via QR code animation</p>
      </header>

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
              <h2 style={{ textAlign: "left", marginBottom: "20px" }}>File Transfer Settings</h2>

              <div className="form-group">
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
              </div>

              <div className="form-group">
                <label className="form-label">Transmission Mode</label>
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
                  max="1400"
                  step="64"
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
                  max="30"
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
                  disabled={!sendFile}
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
                  {isSending ? (
                    <div>
                      <span style={{ color: "var(--color-purple)", fontWeight: "bold" }}>● TRANSMITTING</span>
                      <br />
                      Frames sent: {senderStats.framesSent}
                      <br />
                      {sendMode === "sequential"
                        ? `Block: ${senderStats.currentFrameIndex + 1} / ${senderStats.totalBlocks}`
                        : `Current Seed: 0x${senderStats.fountainSeed.toString(16).toUpperCase()}`}
                    </div>
                  ) : sendFile ? (
                    "Ready. Click Start to stream QR codes."
                  ) : (
                    "Select a file to begin."
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
                      background: "rgba(0,0,0,0.8)",
                    }}
                  >
                    <span style={{ fontSize: "40px" }}>📷</span>
                    <button className="btn btn-primary" onClick={startCamera}>
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
                <span className={`status-badge ${scanStatus}`}>
                  {scanStatus === "idle" && "Idle"}
                  {scanStatus === "listening" && "Scanning..."}
                  {scanStatus === "receiving" && "Transferring..."}
                  {scanStatus === "success" && "Success"}
                  {scanStatus === "failed" && "Failed"}
                </span>
                {!zxingReady && (
                  <span style={{ marginLeft: "12px", fontSize: "13px", color: "var(--color-cyan)" }}>
                    Loading WASM modules...
                  </span>
                )}
              </div>

              {receivedMeta && (
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>
                    File: {receivedMeta.fileName}
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

              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Total Frames Processed</div>
                  <div className="stat-value">{rxStats.totalFramesScanned}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Duplicate/Redundant</div>
                  <div className="stat-value">{rxStats.duplicateFrames}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Current Scan Rate</div>
                  <div className="stat-value">{rxStats.scanFps} FPS</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Transfer Speed</div>
                  <div className="stat-value">{rxStats.speedKbs} KB/s</div>
                </div>
              </div>

              {hashMatches === "matched" && (
                <div className="hash-verified">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  SHA-256 Hash Match Verified (Integrity Check Passed)
                </div>
              )}

              {hashMatches === "mismatch" && (
                <div className="hash-failed">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
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
                  <button className="btn btn-secondary" onClick={resetReceiverState}>
                    Reset Scanner
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        Powered by Antigravity AI | <a href="https://github.com/Sec-ant/zxing-wasm" target="_blank" rel="noreferrer">zxing-wasm</a> & <a href="https://github.com/soldair/node-qrcode" target="_blank" rel="noreferrer">node-qrcode</a>
      </footer>
    </>
  );
}

export default App;
