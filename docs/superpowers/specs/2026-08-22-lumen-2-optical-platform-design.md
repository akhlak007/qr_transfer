# Lumen 2.0 Optical Communication Platform Design

**Date:** 2026-08-22  
**Status:** Proposed for implementation  
**Project:** Lumen (`qr_transfer`)

## 1. Purpose

Lumen 2.0 evolves the existing animated-QR file transfer application into a browser-based experimental optical communication platform. The platform will transmit arbitrary bytes from a display to a camera through multiple optical transports while retaining LT fountain coding as the shared loss-recovery layer and SHA-256 as the final integrity check.

The existing QR sender, ZXing receiver, binary protocol, chunker, and fountain implementation are the working baseline. They will be preserved and incrementally moved behind shared interfaces. VLC and Visual OFDM are research prototypes and will not carry unverified performance or compatibility claims.

## 2. Goals

- Preserve the current QR and fountain transfer behavior as Transmission Mode 1.
- Provide a stable transport interface for QR, VLC, and future optical methods.
- Add Brightness Modulation and RGB Color Modulation to the VLC research mode.
- Add an explicitly labeled **Visual OFDM (Research Prototype)** mode with configurable visual subcarriers.
- Measure transport, decoder, optical-signal, resource, and integrity outcomes consistently.
- Validate images, audio, video, and other files without modifying their bytes.
- Record cross-platform compatibility and research results only from actual test runs.
- Establish streaming, persistence, checkpoint, and progressive-hashing boundaries without claiming untested large-file support.
- Keep the application usable when experimental modes are unavailable or unreliable.

## 3. Non-goals for the Initial Release

- Guaranteed VLC or Visual OFDM operation on every browser or device.
- Claims of multi-gigabyte support before target-device validation.
- A live adaptive feedback channel from receiver to sender.
- Media transcoding, recompression, repair, or format conversion.
- Claiming frequency-domain OFDM unless a later implementation includes and validates the required waveform generation and demodulation.
- Fabricated benchmark, compatibility, environmental, or device results.

## 4. Existing Baseline

The current application has a single React component containing file selection, hashing, QR scheduling, camera capture, frame scanning, fountain/sequential decoding, download creation, and the public website. Supporting modules provide:

- `chunker.ts`: whole-buffer fixed-size chunking and reassembly.
- `fountain.ts`: LT encoder and peeling decoder.
- `protocol.ts`: metadata, sequential, and fountain frames.
- `qr-render.ts`: binary QR rendering.
- `qr-scan.ts`: ZXing WASM QR scanning.

The baseline production build, lint command, and fountain reconstruction simulation pass. Existing limitations include whole-file memory use, ambiguous frame metrics, no transfer/session identifier, no persisted resume state, a monolithic UI, and unverified marketing claims.

## 5. Architectural Principles

### 5.1 Shared reliability, separate optical transports

The file-processing and fountain layers do not know how symbols are displayed. Each transport converts versioned protocol frames into visual output and extracts protocol frames from camera images.

```text
FileSource -> ChunkSource -> FountainEncoder -> ProtocolFrame
                                              -> OpticalTransport transmitter
                                              -> Screen

Camera -> OpticalTransport receiver -> ProtocolFrame
       -> FountainDecoder -> ChunkSink -> IntegrityVerifier -> File
```

### 5.2 Incremental compatibility

Legacy QR frames remain decodable. Protocol versioning is introduced additively, and the existing QR implementation is wrapped before its behavior is changed. Experimental transports share the new envelope and do not alter LT-code mathematics.

### 5.3 Evidence-based status

Capabilities have explicit states: `not-tested`, `in-progress`, `verified`, `failed`, or `unsupported`. Dashboards display measured values, `Not tested`, or `Unavailable`; they never substitute estimates for experiments. ETA is an operational estimate and will be labeled separately from measured results.

## 6. Core Domain Model

### 6.1 Transport identity

```ts
type TransportId = "qr" | "vlc" | "visual-ofdm";
type TransportMaturity = "baseline" | "experimental" | "research-prototype";
```

Displayed names are fixed as:

- `QR Streaming`
- `Screen-to-Camera VLC (Experimental)`
- `Visual OFDM (Research Prototype)`

### 6.2 Optical transport contract

The contract is capability-oriented rather than tied to a single class hierarchy:

```ts
interface OpticalTransport {
  readonly descriptor: TransportDescriptor;
  createTransmitter(config: TransportConfig): OpticalTransmitter;
  createReceiver(config: TransportConfig): OpticalReceiver;
}

interface OpticalTransmitter {
  start(target: HTMLCanvasElement): Promise<void>;
  render(frame: Uint8Array, timing: SymbolTiming): Promise<TransmitObservation>;
  stop(): Promise<void>;
}

interface OpticalReceiver {
  start(source: HTMLVideoElement): Promise<void>;
  decode(image: ImageData, timestamp: DOMHighResTimeStamp): Promise<DecodeObservation>;
  stop(): Promise<void>;
}
```

`DecodeObservation` distinguishes camera frames with no signal, detected-but-invalid symbols, valid duplicate frames, and valid new frames. This distinction makes hit, miss, error, and redundancy metrics meaningful.

### 6.3 Transfer session

```ts
interface TransferSession {
  transferId: string;
  protocolVersion: number;
  direction: "send" | "receive";
  transport: TransportId;
  transportConfig: Record<string, unknown>;
  file: FileIdentity;
  chunking: ChunkingDescriptor;
  fountain: FountainDescriptor;
  status: TransferStatus;
  checkpoint: SessionCheckpoint;
  createdAt: number;
  updatedAt: number;
}
```

`FileIdentity` includes name, byte size, MIME type when supplied by the browser, SHA-256, media category, and optional extracted metadata. Session persistence stores received-symbol/checkpoint information and references persisted chunks; it does not serialize large byte arrays into React state.

## 7. Protocol Evolution

The new frame envelope adds:

- Magic bytes and protocol version.
- Transfer ID.
- Transport ID.
- Frame type.
- Monotonic transmission sequence number.
- Payload length.
- Payload checksum for early corruption rejection.

Metadata payloads retain file name, exact file size, block size, block count, and SHA-256. They add MIME type and a media-metadata descriptor. Fountain payloads retain seed, degree, total block count, and symbol bytes.

The receiver attempts the versioned envelope first and falls back to existing metadata/sequential/fountain frame decoding. A receiver never combines frames from different transfer IDs. Sequence gaps provide observable optical packet loss; camera frames without a decoded sequence remain camera misses rather than invented transmitter-frame losses.

## 8. QR Streaming Baseline

`QRTransport` delegates rendering and scanning to the existing QR modules. Initial stabilization will:

- Prevent overlapping asynchronous QR renders and camera decodes.
- Separate requested screen FPS from achieved screen FPS.
- Record camera frames captured, decode attempts, valid frames, invalid frames, duplicates, sequence gaps, and accepted fountain symbols.
- Preserve fountain and sequential diagnostic modes, with fountain as the user-facing default.
- Keep repeated metadata acquisition for late receiver entry.
- Preserve SHA-256 verification and legacy-frame reception.

QR remains the fallback transport and comparison baseline throughout development.

## 9. VLC Research Mode

VLC has a pluggable modulation contract:

```ts
interface VLCModulator {
  readonly id: "brightness" | "rgb";
  encode(bytes: Uint8Array): VisualSymbol[];
  render(symbol: VisualSymbol, target: CanvasRenderingContext2D): void;
}

interface VLCDemodulator {
  calibrate(samples: ImageData[]): CalibrationResult;
  decode(image: ImageData, calibration: CalibrationProfile): SignalObservation;
}
```

### 9.1 Brightness Modulation

The first scheme uses calibrated dark and bright states. A transmission contains a calibration preamble, synchronization marker, framed payload, and guard symbols. Thresholds derive from sampled receiver luminance rather than fixed RGB values. Configuration includes symbol duration, dark/bright levels, region of interest, guard duration, and preamble length.

### 9.2 RGB Color Modulation

RGB modulation maps symbols to a configurable color constellation. The initial conservative constellation uses visually separated colors plus synchronization/guard states. Calibration estimates per-channel response and white balance from camera samples. Configuration includes constellation, symbol duration, saturation, brightness, region of interest, and channel confidence thresholds.

Brightness and RGB modes use the same protocol and fountain layers. The UI exposes them as VLC modulation schemes, not independent transmission modes. Both remain Experimental until physical validation records establish supported configurations.

## 10. Visual OFDM Research Prototype

The initial Visual OFDM mode represents parallel visual channels as configurable screen regions. Each region acts as a subcarrier-like channel with independent symbol extraction. The implementation provides:

- Configurable grid rows and columns.
- Synchronization and calibration regions.
- Per-channel brightness/color state.
- Symbol interleaving and packet framing.
- Per-channel confidence and error observations.
- Aggregate frame recovery through the shared fountain layer.

The product label must always be **Visual OFDM (Research Prototype)**. Documentation will describe the first version as a multi-subcarrier visual prototype, not optimized mathematical OFDM. A later FFT/IFFT design would require a separate reviewed specification and validation.

## 11. Metrics Model

### 11.1 Transport and transfer metrics

- Requested and achieved screen FPS.
- Camera FPS and decode-attempt FPS.
- Frames/symbols emitted when observable locally.
- Camera frames captured.
- Valid decoded frames.
- Invalid detected frames.
- Duplicate/redundant frames.
- Sequence gaps (packet loss).
- Accepted fountain symbols and resolved blocks.
- Frame hit rate and miss rate with documented denominator.
- Decode time and end-to-end latency where measurable.
- Instantaneous and average effective throughput.
- Elapsed time and estimated remaining time.
- Fountain recovery overhead.
- Final SHA-256 result.

### 11.2 Optical signal metrics

- Ambient light estimate derived from camera-frame luminance and labeled as an estimate, not lux, unless a calibrated sensor/API is available.
- Configured transmitter brightness level.
- Observed luminance and RGB channel levels.
- Camera FPS.
- Requested and achieved screen FPS.
- Signal confidence/quality score with transport-specific derivation.
- Exposure clipping: underexposed and overexposed pixel ratios.

Browser JavaScript cannot reliably read or set physical device screen brightness. Lumen records configured canvas intensity and user-entered/device-test brightness percentage separately. It does not present either as OS brightness unless supplied by the tester.

### 11.3 Resource metrics

CPU usage is not generally exposed as a portable browser metric. The platform records decode/render task time and long-task observations as proxies. Memory is shown only where a supported browser API provides it; otherwise it is `Unavailable`. The dashboard explains these limitations.

## 12. Media Verification

All media is transferred as unchanged bytes. Lumen categorizes supported inputs by MIME type and extension but does not reject arbitrary files.

### 12.1 Common integrity result

- Original byte size and SHA-256.
- Received byte size and SHA-256.
- Exact equality status.
- `Bit-perfect transfer` only when both byte size and SHA-256 match.

### 12.2 Image metadata

- Format/MIME type.
- Width and height decoded from browser-supported image metadata.
- File size.

### 12.3 Audio metadata

- Format/MIME type.
- Duration when browser metadata decoding supports the format.
- File size.

### 12.4 Video metadata

- Format/MIME type.
- Duration, width, and height when browser metadata decoding supports the container/codec.
- Codec only when reliably available from parsed metadata or supported APIs; otherwise `Unavailable`.
- File size.

Metadata extraction failure never changes the transferred bytes or blocks transfer. Sender and receiver metadata are compared when both are available; SHA-256 remains authoritative.

## 13. Persistence, Streaming, and Resume

The initial architecture introduces `FileSource`, `ChunkSource`, and `ChunkSink`. Phase 1 may continue using an in-memory adapter to preserve QR behavior. IndexedDB adapters then persist session metadata, observations, received fountain state/checkpoints, and decoded chunks.

Because Web Crypto does not provide standardized incremental SHA-256, progressive hashing will use a reviewed streaming implementation or worker-backed library in a later phase. OPFS/File System Access support is capability-detected and optional; IndexedDB is the portable baseline. Resume is advertised only for session states that can actually be restored.

## 14. Adaptive Transmission

The receiver computes recommendations from hit rate, invalid-frame rate, decode time, and signal quality. Suggested actions include reducing symbol rate, increasing guard duration, lowering payload density, or recalibrating brightness/color thresholds.

The initial one-way system cannot automatically send these measurements back to a remote sender. Phase 1 records recommendations; later experiments may use manual settings, encoded receiver feedback shown optically in the reverse direction, or a separately approved return channel.

## 15. Cross-Platform Compatibility Validation

A dedicated compatibility module manages test definitions and evidence for:

- Android to Android and the reverse device-role run where devices differ.
- Android to iPhone.
- iPhone to Android.
- iPhone to iPhone.

The primary grouped display uses `Android ↔ Android`, `Android ↔ iPhone`, and `iPhone ↔ iPhone`, while each directional run is stored separately because sender and receiver behavior differs.

Each validation record includes device/browser/OS versions, transport and modulation, file identity, permission outcomes, download outcome, distance, environment, orientation, configured screen brightness, camera FPS, screen FPS, signal quality, frame statistics, transfer time, throughput, integrity result, tester notes, timestamp, and evidence references.

Compatibility is `Verified` only when the recorded run completes with matching SHA-256. A reverse direction is never inferred from a forward-direction result.

## 16. Research Dashboard

The Research Dashboard compares QR Streaming, Screen-to-Camera VLC, and Visual OFDM (Research Prototype). It reads immutable completed test records and aggregates only compatible measured runs.

Displayed metrics include throughput, hit rate, error rate, latency, recovery overhead, decode/render time, available memory proxy, transfer time, maximum tested file size, distance/environment conditions, optical metrics, and directional device compatibility.

Empty cells display `Not tested`; unsupported browser measurements display `Unavailable`. Filters cover devices, browsers, file type/size, transport/modulation, distance, lighting, brightness, orientation, and date. Aggregates show sample count and never mix simulated tests with physical-device tests without an explicit filter.

## 17. UI Structure

The application becomes a platform shell with:

- Home: `LUMEN`, `Offline Optical Data Transfer`, Send and Receive actions.
- Mode selection: QR Streaming, Screen-to-Camera VLC (Experimental), Visual OFDM (Research Prototype).
- Send/receive dashboards with shared transfer statistics and transport-specific signal panels.
- Completion view with file identity, integrity, mode, elapsed time, average throughput, and media verification.
- Research Dashboard.
- Compatibility Validation page.
- Test Protocol page for recording actual experiments.

Unverified claims currently present in marketing sections will be removed or replaced with architecture/capability language.

## 18. Error Handling

- Camera permission, unavailable APIs, unsupported media metadata, and download limitations produce actionable status messages.
- Malformed, wrong-version, wrong-transfer, and checksum-invalid frames are rejected without poisoning decoder state.
- Session reset revokes object URLs, stops media tracks, cancels animation/timers, and releases transport resources.
- Integrity mismatch prevents a `Verified` result but may still permit downloading the reconstructed bytes with a warning.
- Experimental transport calibration failure returns to setup and leaves QR available.
- Storage quota errors preserve the active in-memory session where possible and disable resume with an explanation.

## 19. Testing Strategy

### 19.1 Automated

- Deterministic protocol encode/decode and legacy compatibility tests.
- Fountain loss, duplication, corruption-rejection, and exact reassembly tests.
- Metrics calculations with explicit denominators and clocks.
- Session serialization/migration tests.
- Brightness and RGB modulation round trips using synthetic frames and noise/exposure fixtures.
- Visual OFDM grid mapping, channel extraction, and synthetic degradation tests.
- Media metadata extraction and SHA-256 comparison fixtures.
- React workflow tests for mode selection, status labeling, and measured-only result rendering.

### 19.2 Browser/manual

- Camera permission lifecycle, file selection, download, orientation, backgrounding, and refresh/resume checks.
- Android Chrome and iPhone Safari validation using the dedicated module.
- Required 1, 10, 50, 100, and 500 MB protocols are recorded as untested until completed.
- Distance tests at 10 cm, 25 cm, 50 cm, 1 m, and 2 m across bright, normal, and dark rooms.

Every major phase runs typecheck/build, lint, automated tests, and a QR regression check. Experimental transport tests do not redefine QR baseline success.

## 20. File and Module Plan

Existing files modified incrementally:

- `src/App.tsx`: application shell; current behavior extracted without wholesale replacement.
- `src/modules/protocol.ts`: versioned envelopes and legacy decoding.
- `src/modules/chunker.ts`: adapter-compatible chunk operations.
- `src/modules/fountain.ts`: observable decoder progress without algorithm replacement.
- `src/modules/qr-render.ts` and `qr-scan.ts`: QR adapter observations.
- `src/modules/fountain.test.ts`: retained baseline plus stronger cases.
- `src/index.css`, `index.html`, `README.md`, and `package.json`: platform UI, honest labeling, documentation, and scripts.

New areas:

```text
src/core/          transport, frames, sessions, metrics, integrity, file sources
src/transports/    qr, vlc brightness/RGB, visual OFDM
src/storage/       session and chunk persistence, capability detection
src/media/         metadata extraction and verification
src/research/      experiment records, aggregation, test protocol
src/compatibility/ cross-platform validation records and status
src/components/    shared transfer, signal, integrity, and status UI
src/pages/         transfer, research, compatibility, and test-protocol pages
```

## 21. Implementation Phases and Gates

### Phase 1: QR baseline stabilization and metrics extraction

Introduce core types, versioned metrics/session models, QR adapters, UI extraction, accurate timing/frame statistics, media verification, and legacy regression coverage. Retain in-memory file processing. Gate: legacy QR/fountain simulation, build, lint, automated metrics/protocol tests, and manual desktop QR smoke test pass.

### Phase 2: Research and compatibility foundation

Add measured-result storage, Research Dashboard, compatibility validation, experiment protocol, capability reporting, and initial IndexedDB sessions. Gate: dashboards never fabricate values and directional compatibility requires evidence.

### Phase 3: VLC prototype

Add calibration plus Brightness and RGB Color Modulation transmitter/receiver pairs and synthetic tests. Gate: both schemes recover versioned frames under defined synthetic noise; physical results remain not tested until recorded.

### Phase 4: Visual OFDM research prototype

Add configurable subcarrier grid, calibration/synchronization, per-channel observations, and synthetic tests. Gate: research labeling is present everywhere and measured results remain evidence-backed.

### Phase 5: Physical performance research

Execute the device, file-size, distance, lighting, brightness, orientation, and media matrices. Gate: SHA-256 match for verification and complete environment/device metadata for published comparisons.

### Phase 6: Streaming, resume, and adaptation

Move eligible paths to persisted chunks, restore supported sessions, add progressive integrity support, and evaluate receiver-to-sender adaptation mechanisms. Gate: capability claims match tested browser/device limits.

## 22. Acceptance Criteria

- Existing QR fountain transfer remains functional and legacy frames remain decodable.
- QR is represented through the same transport contract used by experimental modes.
- VLC exposes both Brightness and RGB Color Modulation.
- OFDM is labeled exactly `Visual OFDM (Research Prototype)` until separately validated.
- Transfer dashboards report defined metrics without presenting estimates as measurements.
- Ambient light estimate, configured brightness, camera FPS, screen FPS, and signal quality are recorded when available.
- Images, audio, and video retain original bytes and receive metadata plus SHA-256 verification.
- Compatibility validation stores directional Android/iPhone evidence and never infers untested directions.
- Research comparisons contain only persisted measured test results.
- No multi-gigabyte, universal-device, or extraordinary-throughput claims appear without evidence.
- Build, lint, automated tests, and QR regressions pass at every phase gate.
