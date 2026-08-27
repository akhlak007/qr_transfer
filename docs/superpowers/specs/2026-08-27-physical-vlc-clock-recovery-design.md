# Physical VLC Clock-Recovery Design

Date: 2026-08-27

## Goal

Make the browser VLC OOK path recover complete application frames from an asynchronous screen-to-camera link despite duplicated camera frames, dropped camera frames, arbitrary initial phase, modest clock drift, and normal brightness changes. A transfer is successful only after reconstructed bytes match the sender's SHA-256 hash.

## Scope

This change makes OOK the supported physical VLC mode. It preserves application metadata, sequential and fountain payload formats, VLC byte framing, CRC-16, reconstruction, persistence, and SHA-256 verification. PAM4, CSK8, and CSK16 remain software-tested experimental modes and are not presented as reliable physical receiver choices.

## Signal format

The physical OOK renderer Manchester-encodes every logical bit:

- logical `0` becomes low then high;
- logical `1` becomes high then low.

Each low/high value is a chip displayed for one transmitter interval. Manchester encoding guarantees a transition within every logical bit and removes dependence on payload run length. The existing Barker preamble and serialized VLC frame remain the logical bitstream; Manchester encoding is applied only between byte framing and screen rendering.

The UI reports logical bit rate and derives a chip rate twice that value. The initial physical preset is 5 logical bits/s (10 chips/s), providing multiple camera observations per chip on typical 30/60 FPS cameras. The sender repeats metadata as it does today.

## Receiver pipeline

The camera loop continues sampling at camera cadence. It must not rate-limit frames to the configured transmitter rate. Each observation records timestamp and center-ROI luminance.

The OOK receiver performs these stages:

1. **Calibrating**: maintain adaptive low/high luminance estimates and reject a signal whose dynamic range is below the configured minimum.
2. **Searching**: classify all camera observations and find transitions matching a plausible chip period near the configured rate.
3. **Locked**: establish chip centers from transition timing, use a small phase-locked-loop correction on later transitions, and majority-vote camera observations around each chip center.
4. **Manchester decode**: convert low/high pairs into logical bits. Equal-level pairs are invalid and force a bounded resynchronization attempt.
5. **Frame decode**: locate Barker sync, parse the existing VLC header, bound the advertised payload size, verify CRC-16, and emit the application payload.

The receiver must tolerate camera observations duplicated at arbitrary cadence because observations are aggregated by timestamp rather than treated as symbols. A missing observation does not create a bit; the clock model advances only when a chip center can be classified. Lock is dropped after an explicit consecutive-error ceiling, after an impossible header, or after excessive clock uncertainty.

## State and diagnostics

Receiver status exposes the actual boundary reached:

- `CALIBRATING`
- `SEARCHING_CLOCK`
- `SEARCHING_SYNC`
- `LOCKED_RECEIVING`
- `FRAME_DECODED`
- `SIGNAL_TOO_WEAK`
- `CLOCK_LOST`
- `INVALID_MANCHESTER`
- `CRC_FAILED`

The Receive tab displays sampled luminance, dynamic range, estimated camera FPS, recovered chip rate, timing lock, sync locks, invalid Manchester pairs, CRC failures, and valid frames. “Scanning” remains the top-level activity but cannot hide the engineering state.

## Configuration and UI

The Receive tab defaults to QR for compatibility. Selecting VLC Physical chooses OOK Manchester and exposes one shared logical bit-rate setting that must match the sender. Unsupported physical modulations are labeled experimental and are not selectable in the reliable VLC preset.

Configuration changes stop and reset the receiver before replacing its pipeline. Starting the camera freezes transport, modulation, and rate until it is stopped.

## Error handling

Weak or saturated signals produce a visible calibration error without accepting bits. Invalid Manchester pairs increment diagnostics and trigger local reacquisition. Impossible payload lengths drop lock before allocating memory. CRC failures discard the entire VLC frame. No application payload reaches reconstruction without a valid VLC CRC, and no completed transfer is offered without a matching SHA-256.

## Verification

The smallest authoritative automated check sends metadata plus a small sequential payload through a deterministic timed camera model and requires exact reconstruction and SHA-256 equality.

The test matrix covers:

- 30 and 60 FPS camera sampling against 10 chips/s;
- arbitrary start phase across one chip period;
- duplicated and dropped camera observations;
- at least 2% transmitter/receiver clock mismatch with gradual drift;
- luminance offset, reduced contrast, and bounded noise;
- malformed Manchester pairs, impossible headers, and CRC corruption;
- stopping, restarting, and changing receiver configuration;
- unchanged QR behavior and unchanged software tests for legacy PAM4/CSK modes.

Production verification requires the unit suite, production build, and one real screen-to-phone run that receives a small message and reports a matching SHA-256. Until that physical run succeeds, the UI must describe physical VLC as experimental rather than verified.

## Deliberate limits

The first reliable physical path is OOK only and prioritizes correctness over throughput. It uses the existing center ROI rather than spatial tracking. Later throughput work may raise the chip rate, add automatic rate negotiation, or validate higher-order modulation only after physical evidence shows bit-perfect transfers.
