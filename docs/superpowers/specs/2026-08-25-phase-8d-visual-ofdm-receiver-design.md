# Phase 8D End-to-End Visual OFDM Receiver Design

## Scope

Phase 8D adds a stateful Visual OFDM receiver that reconstructs serialized OFDM frames across one or more optical grid images and dispatches CRC-valid payloads into the existing sequential and fountain reconstruction pipeline. It supports BPSK, QPSK, and 16-QAM on configured 8x8, 16x16, and 32x32 grids.

Modulation and grid size are explicit receiver configuration. Automatic modulation detection and grid-size inference are out of scope. QR and VLC implementations remain unchanged.

## Public API

```ts
new VisualOfdmReceiver({
  modulation: "bpsk" | "qpsk" | "16qam",
  gridSize: 8 | 16 | 32,
})
```

The receiver accepts `ImageData`, canvas, video, and raw RGBA pixel buffers. It also accepts an already sampled spatial-luminance grid for deterministic tests and integration with existing acquisition code.

Configuration is validated at construction. Unsupported modulation values, grid sizes, ROI fractions, or bit-buffer limits are rejected rather than guessed or silently coerced.

## Architecture

```text
Camera / Canvas / Video / raw RGBA
                  |
                  v
        centered square ROI locator
                  |
                  v
       configured N x N cell sampler
                  |
                  v
 DCT + pilots + channel equalization
                  |
                  v
 configured constellation symbol slicer
                  |
                  v
       persistent recovered-bit buffer
                  |
                  v
 OFDM header parser + expected frame length
                  |
                  v
     CRC and configuration validation
                  |
                  v
      protocol payload dispatcher
          /          |          \
    metadata     sequential     fountain
          \          |          /
                  v
       exact-length file assembly
                  |
                  v
              SHA-256
```

The implementation separates stateless per-grid physical-layer recovery from stateful transport-frame and file reconstruction.

## Grid Location and Sampling

Grid detection means locating the largest centered square inside the provided image. The receiver does not inspect the image to infer grid dimensions. The square is divided into the configured number of equal logical cells, and each cell is sampled by averaging RGB-derived luminance over its complete pixel bounds.

This cell averaging tolerates source resolutions not evenly divisible by the configured grid size by deriving integer cell boundaries from proportional coordinates. Invalid dimensions, undersized pixel buffers, and non-finite samples do not mutate receiver state.

## Reusable Physical-Layer Recovery

The existing single-grid demodulator's common stages are extracted into reusable OFDM functions:

1. Validate an N x N spatial-luminance grid.
2. Remove its DC/ambient mean.
3. Apply the forward 2D DCT.
4. Build complex carrier observations.
5. synchronize and equalize from deterministic pilots.
6. estimate pilot SNR and symbol error diagnostics.
7. slice configured data carriers as BPSK, QPSK, or 16-QAM.
8. return recovered symbol indices and MSB-first bits.

`VisualOfdmDemodulator.demodulateSpatialPattern` continues to expose its current report and behavior by consuming this reusable result and parsing a single grid. Existing demodulator callers require no API change.

## Stateful Multi-Grid Frame Recovery

`VisualOfdmReceiver` processes each synchronized grid independently and appends recovered data bits to a persistent buffer. Once at least the 12-byte OFDM header is available, it validates magic, version, configured modulation, and configured grid size, then reads payload length and computes the exact serialized frame bit length.

An incomplete frame remains buffered across later grids. Once complete, only the exact frame bits are converted to bytes and passed to the existing `decodeOfdmFrame` CRC implementation. CRC-invalid or configuration-mismatched frames are counted as corrupt and never reach reconstruction. After a complete valid or invalid frame, trailing padded/data bits remain available for deterministic subsequent header search. Impossible declared lengths are rejected without allowing permanent buffer lockup.

Because the final transmitter grid is zero-padded, the receiver appends the full configured carrier capacity and consumes only the exact encoded frame length. It retains trailing bits as required, then uses a bounded magic-header search to discard terminal padding only when locating the next serialized frame. Tests define and verify this boundary behavior for every modulation and grid size.

## Protocol and Reconstruction

CRC-valid payloads use the existing protocol decoders unchanged:

- metadata initializes or replaces incompatible reconstruction state;
- sequential blocks assemble in block-index order and are clipped to metadata file size;
- fountain symbols feed the existing `FountainDecoder` and assemble resolved blocks at exact metadata length.

Completed data is hashed through the existing `sha256Hex` implementation. Result APIs expose reconstructed bytes, metadata, and SHA-256 without modifying fountain coding or integrity modules.

## Diagnostics

Receiver diagnostics expose:

- configured active modulation and grid size;
- synchronization status and confidence;
- recent recovered symbol indices;
- current frame sequence and CRC status;
- pilot-derived SNR estimate;
- total camera/spatial grids processed and synchronized;
- total recovered bits;
- valid and corrupt frame counts;
- fountain symbols accepted and blocks resolved;
- reconstruction completion state.

Diagnostic arrays are defensive copies, and numeric metrics remain finite for invalid or zero-energy inputs.

## Error Handling

Invalid optical sources and non-finite spatial grids are ignored without state mutation. Unsynchronized grids update grid-level failure diagnostics but contribute no payload bits. Invalid headers trigger bounded resynchronization rather than unbounded buffering. CRC failures, modulation mismatches, and grid-size mismatches increment corruption counters and do not dispatch payloads.

Reset clears bit accumulation, frame state, counters, reconstruction state, cached hash, and physical-layer diagnostics while retaining explicit configuration.

## Testing

Deterministic tests cover:

- BPSK, QPSK, and 16-QAM symbol recovery;
- 8x8, 16x16, and 32x32 configured grids;
- centered-square ROI location and cell averaging;
- accumulation of one encoded frame across multiple grids;
- early header parsing and expected-length tracking;
- CRC rejection followed by recovery of a later valid frame;
- modulation and grid configuration isolation;
- diagnostic counters, symbols, synchronization, SNR, and progress;
- sequential and fountain reconstruction;
- end-to-end byte equality and SHA-256 equality.

The complete repository is verified with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` to confirm QR, VLC, and other subsystems remain regression-free.
