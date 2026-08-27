# Fast, Reliable Physical VLC Messages

## Problem

The physical OOK path applies the file-transfer metadata protocol to short text messages. A message metadata payload is at least 55 bytes, then receives the 10-byte VLC envelope, Barker-11 preamble, 16 calibration chips, and Manchester expansion. At 10 chips/s, metadata alone occupies roughly 108 seconds. A receiver that misses its one preamble cannot reacquire until the next complete application frame.

The compact path must make short messages practical without weakening physical synchronization, CRC validation, or file-transfer integrity.

## Scope

This change applies only to `dataType: "message"` over physical VLC OOK. File transfers, QR, non-OOK VLC modes, OFDM, fountain coding, CRC-16 implementation, Barker mathematics, and SHA-256 file verification remain unchanged.

## Protocol

Add one application frame type, `CompactMessage`, after the existing Metadata, Sequential, and Fountain values. Its payload is:

| Field | Size | Meaning |
| --- | ---: | --- |
| type | 1 byte | `CompactMessage` discriminator |
| messageId | 4 bytes | Stable sender-generated identifier for duplicate suppression |
| UTF-8 length | 2 bytes | Number of following message bytes |
| UTF-8 bytes | 0–65535 bytes | Exact message content |

The existing `encodeVlcFrame()` envelope provides version, modulation, sequence, payload length, and CRC-16. No second CRC is added.

The decoder rejects truncated payloads, length mismatches, invalid UTF-8 using fatal `TextDecoder` validation, and messages above the UI limit. A repeated `messageId` with identical bytes is recognized but not delivered twice. The same identifier with different bytes is rejected as a collision.

## Sender

For VLC OOK messages, bypass file metadata, chunking, and fountain encoding. Encode one compact application payload, wrap it once in the existing VLC frame, Manchester-modulate it, and repeat that complete optical frame until the user stops transmission. Each repetition starts with calibration chips and Barker preamble, so a receiver can reacquire quickly.

The default physical chip rate becomes 15 chips/s. The UI describes this as the balanced 30-FPS setting and retains 10 chips/s as the compatibility setting. Rates above 15 are not offered until physical evidence supports them.

Sender progress reports the current chip and repetition number. It must not imply that the remote receiver acknowledged delivery because the optical link is one-way.

## Receiver

`PhysicalVlcReceiver` and `VlcOokReceiver` keep their existing timing recovery, Manchester decisions, Barker correlation, framing, and CRC logic. After a CRC-valid outer frame, `LiveReceiverRouter` dispatches `CompactMessage` directly to `ApplicationReconstructionService`, which completes it as a single application payload without waiting for metadata.

The receiver exposes these operator states:

1. Camera ready — waiting for visible light changes.
2. Signal detected — shows dynamic range and camera FPS.
3. Synchronizing — shows Barker correlation and clock resets.
4. Receiving — shows recovered frame bits versus expected bits.
5. Checking integrity — CRC validation in progress.
6. Message received — displays the text once.

Failures name the action: insufficient dynamic range, camera FPS too low, chip-rate mismatch, clock lost, invalid Manchester pairs, frame-header rejection, or CRC failure. A stalled receiving percentage resets to synchronizing when lock is lost instead of leaving stale progress.

## Rate and Timing Policy

At 15 chips/s, a three-byte compact message with the proposed seven-byte application header occupies 358 Manchester/calibration chips, or approximately 24 seconds. This is the honest physical ceiling with the existing 10-byte VLC envelope and Manchester line coding. At 10 chips/s it takes approximately 36 seconds.

The earlier 12–18 second estimate is not achievable at a reliable 15 chips/s once all existing envelope bits are counted. Reaching that target would require either a higher validated chip rate, a shorter outer envelope, or different modulation; none is included in this change.

The receiver displays measured camera FPS. For 15 chips/s it recommends at least 30 FPS; below 27 measured FPS it tells the operator to select 10 chips/s on both devices. Configuration remains explicit and identical at both ends.

## Compatibility

Existing Metadata, Sequential, and Fountain application frames decode exactly as before. Unknown application frame types are rejected explicitly. A new receiver accepts both compact messages and legacy message-as-file transfers. An old receiver safely ignores the new application type after the outer CRC passes.

## Verification

Add deterministic checks for:

- Exact compact-message encoding/decoding, UTF-8, maximum length, truncation, and length mismatch.
- Outer VLC CRC pass and controlled CRC failure without altering CRC code.
- Bit-perfect delivery at simulated 30 and 60 camera FPS at 10 and 15 chips/s.
- Initial preamble missed, then successful acquisition on repetition.
- Dropped observations, exposure offset, two-percent clock drift, and camera stalls.
- Duplicate repetition delivered once and message-ID collision rejected.
- Legacy file and legacy message paths unchanged.
- Receiver progress resets on lock loss and reaches integrity/completion only after CRC pass.
- Measured optical duration is substantially smaller than the legacy metadata-first duration.

Physical reception remains unverified until a real-device trace records Barker lock, complete frame recovery, CRC pass, compact-message dispatch, and displayed payload.
