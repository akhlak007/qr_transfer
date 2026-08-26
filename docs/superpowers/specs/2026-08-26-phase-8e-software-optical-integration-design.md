# Phase 8E End-to-End Software Optical Integration Design

## Scope

Phase 8E verifies and integrates the complete application-level software pipeline for QR, VLC OOK, and Visual OFDM. It adds a deterministic software optical channel, transport-specific integration adapters, explicit sender/receiver routing, execution-derived verification records, a dashboard matrix, integration tests, and a research report.

This phase adds no modulation schemes or hardware requirements. Every result is labeled software simulation and makes no physical-validation claim. QR transport files, QR wire format, fountain mathematics, and VLC/OFDM modulation mathematics remain unchanged.

## End-to-End Contract

Every successful record must execute one continuous path:

```text
File
  -> selected protocol payload pipeline
  -> metadata/sequential/fountain encoding
  -> transport framing
  -> real transport encoder/modulator representation
  -> SOFTWARE OPTICAL CHANNEL / SIMULATION
  -> explicitly selected receiver
  -> CRC-valid transport frames
  -> metadata/sequential/fountain decoding
  -> exact-length reconstruction
  -> SHA-256 equality
```

No stage may be inferred from unit-test counts, benchmark labels, or another protocol's result.

## Software Optical Channel

`SoftwareOpticalChannel` is a deterministic, seeded simulation. Its configuration supports:

- luminance noise;
- independent RGB noise;
- brightness/exposure drift;
- deterministic frame/grid drops;
- deterministic symbol/grid corruption;
- bounded sampling variation.

The channel operates on typed optical representations used by each adapter: RGBA images for QR, luminance/RGB symbols for VLC, and spatial-luminance grids for OFDM. A seeded PRNG makes identical inputs and configuration reproducible. Channel reports record delivered, dropped, and corrupted unit counts.

Every integration result contains exactly:

```ts
verificationType: "SOFTWARE"
channelLabel: "SOFTWARE OPTICAL CHANNEL / SIMULATION"
```

The channel documentation states that it is not a camera or physical propagation model.

## Transport Pipeline Registry

A registry maps every `TransportId` to one transmitter adapter and one receiver adapter. Lookup is exact and throws for unregistered transports. There is no default entry and no QR fallback.

Adapters share a small lifecycle contract: configure, begin a protocol frame, enumerate its complete optical units, ingest delivered units, expose diagnostics, and retrieve decoded protocol payloads/reconstruction results.

### QR Adapter

The QR adapter uses the installed `qrcode` encoder used by the application to create a QR module matrix, converts that matrix to deterministic RGBA pixels with a quiet zone, and invokes the existing `scanQRCode()` decoder. This preserves the existing QR receiver behavior without modifying `src/transports/qr/` or the QR wire format.

QR protocol payloads use the existing metadata, sequential, and fountain frame formats. The adapter's shared reconstruction layer verifies exact bytes and SHA-256.

### VLC OOK Adapter

The VLC adapter serializes protocol payloads with `encodeVlcFrame`, generates all symbols with the real OOK modulator, passes luminance/RGB samples through the software channel, and ingests delivered samples into `VlcOokReceiver`. CRC, protocol dispatch, sequential/fountain reconstruction, and SHA-256 use the receiver's production path.

Controlled corruptions must cause CRC rejection or incomplete recovery. Dropped symbols must never be reported as successful reconstruction unless later complete frames genuinely recover the data.

### Visual OFDM Adapter

The OFDM adapter serializes protocol payloads with `encodeOfdmFrame`, generates all grids with the real OFDM modulator, converts carrier grids to the existing spatial-luminance renderer representation, passes grids through the software channel, and ingests delivered grids into `VisualOfdmReceiver`.

It covers BPSK, QPSK, and 16-QAM at 8x8, 16x16, and 32x32. Multi-grid accumulation, header parsing, configuration isolation, CRC validation, protocol reconstruction, and SHA-256 occur in the production receiver.

## Shared Protocol Payload Layer

The harness owns file-to-protocol sequencing but does not duplicate transport receivers:

1. create deterministic file metadata;
2. send metadata through the selected transport;
3. send sequential blocks or fountain symbols through the same transport;
4. stop only after receiver completion or an explicit deterministic limit;
5. retrieve receiver bytes and compare SHA-256 with the original file.

QR uses a small shared reconstruction sink because its existing receiver returns decoded QR bytes rather than owning file assembly. VLC and OFDM use their implemented receiver reconstruction paths. All adapters consume the same existing protocol encoders and decoders.

## Application Sender Scheduling

The application separates protocol-frame sequence from optical-unit position:

- `applicationFrameSequence` identifies the framed metadata/sequential/fountain payload;
- `opticalSymbolIndex` advances only within the active VLC frame;
- `opticalGridIndex` advances only within the active OFDM frame;
- `totalOpticalSymbols` and `totalOpticalGrids` describe the active encoded frame.

The sender keeps one application payload active until every VLC symbol or OFDM grid has been rendered. Only then does it request and frame the next protocol payload. QR remains one QR image per application payload.

The application transmitter renderers receive an explicit optical-unit index rather than deriving it from the application frame sequence.

## Live Receiver Routing

The receive loop dispatches strictly by selected transport:

- QR calls `scanQRCode()`;
- VLC samples the frame and calls `VlcOokReceiver`;
- Visual OFDM calls `VisualOfdmReceiver` with the configured modulation/grid size.

Changing transport creates/reset the matching receiver. Unknown or unavailable transports produce a visible error and do not invoke any decoder. VLC and OFDM paths never call `scanQRCode()`.

Decoded transport payloads feed one application handler for metadata, sequential, fountain, progress, and integrity presentation.

## Verification Status Model

The allowed statuses are:

- `SOFTWARE_UNIT_VERIFIED`: unit-level evidence exists, without a complete recorded application pipeline;
- `SOFTWARE_END_TO_END_VERIFIED`: one recorded run has TX, software channel, RX, CRC, reconstruction, and exact SHA-256 success;
- `EXPERIMENTAL`: absent or incomplete evidence;
- `FAILED`: a recorded complete-path attempt failed a required stage.

Status promotion consumes explicit integration records. A run may be end-to-end verified only if all required booleans are true and both verification labels match the software simulation constants. Failed or missing stages cannot be averaged into success.

Legacy software verification views are migrated to these statuses without treating historical unit/benchmark records as end-to-end evidence.

## Dashboard

The research dashboard adds an "End-to-End Software Verification" section with this matrix:

```text
Protocol | Configuration | TX | Channel | RX | CRC | Reconstruction | SHA-256 | Status
```

Rows begin as `EXPERIMENTAL`. The user can execute the deterministic harness in the browser; only returned run records populate success/failure cells. The section displays protocol, modulation, grid size, transmitter and receiver status, recovered frames, CRC, fountain progress, SHA-256, and `Verification type = SOFTWARE`.

No hard-coded success rows, fabricated throughput, or physical claims are permitted.

## Diagnostics and Results

Each integration record contains configuration identity, stage outcomes, observed frame/unit counters, CRC outcome, reconstruction status, expected and actual SHA-256, channel counters, failure reason, and timestamps/duration measured during execution. Throughput is omitted unless actually measured by the harness.

Results are immutable snapshots suitable for dashboard rendering and policy evaluation.

## Testing

`src/research/software-optical-integration.test.ts` and focused application/policy tests cover:

- QR encode-image-scan-reconstruct-SHA end to end;
- VLC OOK sequential and fountain reconstruction;
- VLC CRC corruption and dropped symbols;
- all nine OFDM modulation/grid combinations;
- OFDM multi-grid accumulation;
- OFDM corruption and dropped grids;
- deterministic channel reproducibility and noise/drift behavior;
- strict transmitter/receiver registry isolation and unknown transport errors;
- sender scheduler holding one payload through every optical unit;
- live receiver dispatch never invoking QR for VLC/OFDM;
- status promotion and non-promotion rules;
- bit-perfect SHA-256 equality.

Failure tests assert `FAILED` or incomplete/experimental results rather than manufacturing recovery.

## Documentation and Verification

`docs/phase-8e-end-to-end-software-integration-report.md` documents architecture, paths, methodology, software-channel assumptions, limitations, observed results, and a non-fabrication statement.

The report is updated from actually observed deterministic test/harness results. It does not claim physical validation.

Required verification:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

The Phase 8E integration suite also runs independently. Existing QR, VLC, and OFDM tests must remain green.
