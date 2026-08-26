# Phase 8C.2 Unified VLC Receiver Design

## Scope

Phase 8C.2 replaces the OOK-only receiver implementation with a unified, explicitly configured VLC receiver supporting OOK, 4-PAM, CSK-8, and CSK-16. It preserves the existing `VlcOokReceiver` API and leaves QR, OFDM, fountain coding, storage, and recovery implementations unchanged.

Automatic modulation detection is out of scope. A receiver instance decodes exactly the modulation selected at construction.

## Public API and Compatibility

The primary API is:

```ts
new VlcReceiver({ modulation: "ook" | "4pam" | "csk8" | "csk16" })
```

`VlcOokReceiver` remains constructible with its existing partial OOK configuration. It delegates to or subclasses `VlcReceiver` with `modulation: "ook"`. Existing public ingestion, listener, diagnostics, reconstruction, metadata, fountain-decoder, and reset methods remain available.

The public receiver spelling `"4pam"` maps explicitly to the existing framing/modulator spelling `"pam4"`. The serialized VLC modulation code table is not changed.

## Architecture

`VlcReceiver` owns the modulation-independent pipeline:

1. Normalize camera, canvas, video, or raw pixel input.
2. Sample the center ROI as average RGB and luminance.
3. Pass the optical sample to the configured symbol decoder.
4. Append the decoder's MSB-first bits to the common bit buffer.
5. Locate the Barker-11 preamble and parse the VLC header and payload.
6. Validate CRC-16 and reject corrupt frames.
7. Dispatch valid protocol payloads to metadata, sequential, or fountain reconstruction.
8. Compute SHA-256 for completed reconstructions.

Small modulation decoder units hide their adaptive state behind one interface. Each accepts luminance and RGB samples and returns a symbol index, its fixed-width bit representation, thresholds or color metrics, and confidence/error estimates. Shared receiver code does not branch on modulation after decoder construction.

## Modulation Decoders

### OOK

The OOK decoder retains the current high/low envelope EMA, minimum dynamic range, midpoint threshold, and binary decision behavior. This path is preserved without algorithmic changes so existing OOK streams and tests remain valid.

### 4-PAM

The 4-PAM decoder maintains four ordered adaptive luminance centroids initialized from the configured optical range. Each sample is assigned to its nearest centroid; the selected centroid is updated with the configured smoothing factor, ordering and minimum separation are enforced, and the three decision thresholds are the adjacent-centroid midpoints.

Level indices map to Gray-coded bit pairs in ascending luminance order: `0 -> 00`, `1 -> 01`, `2 -> 11`, `3 -> 10`. Diagnostics expose all three thresholds and a noise-tolerance estimate derived from distance to the selected centroid relative to adjacent decision boundaries.

### CSK-8 and CSK-16

CSK decoders convert sampled RGB to chromaticity by dividing each channel by the RGB sum. They maintain adaptive per-channel gain normalization from observed samples, with bounded gains and deterministic initialization, then compare normalized chromaticity with the matching fixed transmitter constellation.

CSK-8 emits three bits per symbol and CSK-16 emits four, both MSB first. Classification uses nearest Euclidean chromaticity distance. Confidence is derived from the separation between the nearest and second-nearest candidates, and diagnostics expose nearest distance, confidence, and a symbol-error estimate. Zero-energy samples are handled deterministically with zero confidence rather than producing non-finite values.

The Barker preamble remains binary. Modulators encode its zero and one using the two documented endpoint symbols for each modulation, and each decoder emits their corresponding bit patterns into the common synchronization pipeline.

## Framing and Reconstruction

All recovered bits enter the same existing Barker synchronization and frame parsing flow. The receiver verifies that a decoded frame's serialized modulation matches the configured receiver modulation; mismatches are rejected and counted as corrupt rather than triggering mode changes.

CRC validation remains `decodeVlcFrame`'s CRC-16-CCITT check. Valid payloads use the existing protocol decoders and `FountainDecoder` unchanged. Sequential and fountain completion assemble the original byte length, and `sha256Hex` provides reconstruction verification through the existing asynchronous result API.

## Diagnostics

Existing diagnostic fields remain intact. The unified diagnostics add:

- active public modulation;
- adaptive luminance threshold array;
- recent decoded symbol indices;
- symbol error estimate;
- color classification confidence;
- nearest color distance.

For OOK, the legacy scalar `adaptiveThreshold` remains authoritative. For 4-PAM it is accompanied by three ordered thresholds. For CSK modes luminance thresholds are empty and color metrics are populated. All values are finite, bounded where applicable, and deterministic for identical sample sequences.

## Error Handling and Isolation

Invalid optical sources do not mutate decoding state. Incomplete frames remain buffered. False Barker locks advance deterministically and resume searching. CRC failures and configured/serialized modulation mismatches increment corrupt-frame diagnostics and never reach protocol reconstruction.

No receiver performs automatic modulation guessing or switches modes based on sampled data or frame headers.

## Testing and Verification

Deterministic unit tests cover:

- unchanged OOK decode behavior and `VlcOokReceiver` compatibility;
- clean and perturbed 4-PAM Gray-code recovery;
- CSK-8 and CSK-16 constellation recovery;
- Barker synchronization and CRC rejection in unified modes;
- rejection of frames from a different configured modulation;
- diagnostic modulation, thresholds, symbols, distances, confidence, and counters;
- end-to-end fountain reconstruction and SHA-256 equality through a non-OOK mode.

The complete repository is verified with `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` to detect regressions outside VLC.
