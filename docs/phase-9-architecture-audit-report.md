# Phase 9 Architecture Audit Report

Date: 2026-08-26  
Scope: read-only audit; report files only  
Verdict: **NOT READY**

## System architecture

The intended application flow is:

```text
File/message
  -> metadata + sequential/fountain application frames
  -> selected transport framing
  -> transport renderer
  -> optical channel/camera
  -> matching transport receiver
  -> transport CRC validation
  -> shared application payload handling
  -> sequential/fountain reconstruction
  -> SHA-256 verification
```

The QR application path follows the application framing -> QR renderer -> `scanQRCode()` -> application reconstruction path. VLC and OFDM have working transport framers and receivers in isolation, and the research integration harness correctly calls `encodeVlcFrame()` or `encodeOfdmFrame()` before modulation. The live application path does not.

## End-to-end trace findings

### QR

- Application transmitter and QR renderer: present.
- Existing QR encoder and `scanQRCode()`: exercised successfully by the software integration suite.
- Sequential/fountain layer and final SHA-256: present and tested elsewhere in the suite.
- CRC evidence: **not established**. QR scan success is copied into `crcSuccess` in `software-optical-integration.ts`; no CRC calculation or observed CRC result occurs at that point. QR Reed-Solomon decoding is internal to the QR library and is not exposed as the claimed protocol CRC stage.

### VLC OOK

- VLC transport framing, CRC-16, modulation, renderer, `VlcOokReceiver`, fountain reconstruction, and SHA-256 all work in isolated receiver/integration tests.
- Live application failure: `App.tsx` builds application protocol bytes and passes them directly to `OpticalFrameScheduler`. The scheduler and VLC renderer call `modulateVlcFrame()` on those bytes without first calling `encodeVlcFrame()`.
- `LiveReceiverRouter` routes the samples to `VlcOokReceiver`, which expects a VLC transport header and CRC. An independent direct probe of the live-path byte shape produced zero valid frames and a pending CRC state.

### Visual OFDM

- OFDM framing, CRC-16, BPSK/QPSK/16-QAM modulation, all three grid sizes, renderer representation, receiver, accumulation, fountain reconstruction, and SHA-256 work in isolated tests.
- Live application failure: raw application bytes are passed to `modulateOfdmBytes()` without `encodeOfdmFrame()`.
- `VisualOfdmReceiver` requires the OFDM transport header and CRC. An independent rendered-pixel probe of this live-path byte shape produced zero valid frames.

## Component and state audit

### Duplication

- Reconstruction exists in VLC/OFDM receivers, the application receiver logic, and the Phase 8E `ProtocolReconstructor`. This creates three places where metadata, sequential, fountain, and completion rules can diverge.
- Sender session construction is substantially duplicated between file and text preparation in `App.tsx`.
- Research integration registry entries are opaque `run()` pipelines instead of explicit paired transmitter/receiver adapters, limiting enforcement of transport pairing.

### Dead or unused code

- Strict TypeScript unused-local/unused-parameter checking completed without errors.
- No confidently unused React component was identified from repository references.
- `lastScanTimeRef` is assigned but never consumed and is dead instrumentation state.
- No confirmed unreachable protocol state was found. Several defensive branches have low reachability but remain valid guards.

### Concurrency and lifecycle

- `finalizeSequentialTransfer()` and `finalizeFountainTransfer()` are invoked without awaiting or a completion latch. Duplicate terminal frames can start concurrent hash/session/download finalization.
- Transport or modulation controls can change while receiving because they are disabled only while sending. The router resets, but application metadata, sequential blocks, and fountain decoder state remain, permitting cross-configuration contamination.
- The sender uses generation guards and clears its timeout on unmount; this is sound.
- Receiver camera tracks, animation frame, speed interval, and object URL have no dedicated component-unmount cleanup. Normal `stopCamera()` cleans them, but direct unmount can leak resources.
- Camera reconnect can call `startCamera(true)` repeatedly while an earlier asynchronous `getUserMedia()` request is pending, potentially producing multiple streams.

## Verification architecture gap

The Phase 8E harness tests real protocol algorithms, but it does not compose the actual `App` sender, scheduler, renderer, and `LiveReceiverRouter`. Consequently it passes while the production VLC/OFDM application chain is incompatible. The dashboard's locally executed integration results are also not passed back into `evaluateSoftwareVerificationMatrix`, so the overview status and executed matrix can disagree.

## Architectural conclusion

Transport algorithms are mature at the software-unit and isolated-integration level. The release boundary fails at application orchestration and evidence semantics. Release must be blocked until live transport framing is inserted exactly once, QR integrity-stage semantics are corrected, and actual application-path round-trip tests exist.
