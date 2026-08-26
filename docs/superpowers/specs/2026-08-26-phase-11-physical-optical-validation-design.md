# Phase 11 Physical Optical Validation Design Specification

Date: 2026-08-26  
Status: design for review  
Scope: real screen-to-camera validation of the existing QR, VLC OOK, and Visual OFDM application paths

## Objective

Add one authoritative physical-validation workflow around the existing camera, routing, reconstruction, and evidence infrastructure. The workflow records actual hardware observations without changing any protocol format, receiver algorithm, modulation mathematics, fountain mathematics, storage, or recovery behavior.

The canonical path is:

```text
Physical screen/display
  -> real camera and MediaStream
  -> PhysicalCameraService frame acquisition
  -> explicitly configured LiveReceiverRouter
  -> existing transport CRC result (QR: N/A)
  -> ApplicationReconstructionService
  -> SHA-256 comparison
  -> immutable PhysicalEvidenceRecord
  -> physical dashboard and export ledger
```

Existing physical workbenches remain compatibility/read-only views. They do not create a second authoritative record or promotion path.

## Evidence separation and promotion

Physical records carry `evidenceKind: "physical"` and a separate `verificationType: "PHYSICAL"`. Software records carry `evidenceKind: "software"` and `verificationType: "SOFTWARE"`. The physical policy rejects software records, mixed records, synthetic frames, and copied simulation measurements before evaluation.

Physical status values are:

- `EXPERIMENTAL`: a physical session is configured or has partial observations, but the complete path has not succeeded.
- `FAILED`: a real physical attempt completed with camera/transport/CRC/reconstruction/hash failure.
- `PHYSICAL_VALIDATED`: one complete real camera-based run succeeded, including optical reception, transport CRC (or QR CRC N/A), reconstruction, and exact SHA-256 equality.
- `PHYSICAL_VERIFIED`: at least three independent qualifying `PHYSICAL_VALIDATED` runs match the exact protocol configuration. Software runs never contribute to this count.

Promotion is monotonic within an immutable record. A failed or incomplete record cannot be edited into success. A run may be promoted only from observations captured by the physical session itself; no inferred values are accepted.

## Authoritative physical session

Create a `PhysicalValidationSession` controller/service that composes existing services:

1. Validate explicit configuration and start a real `PhysicalCameraService`.
2. Use the selected screen/transmitter representation already produced by the application.
3. Feed acquired `ImageData` frames into the selected `LiveReceiverRouter` (QR, VLC OOK, or Visual OFDM configuration).
4. Forward only transport-decoded payloads and their actual CRC outcome to `ApplicationReconstructionService`.
5. On terminal reconstruction, compare the observed SHA-256 with the source payload hash exactly once.
6. Freeze a complete `PhysicalEvidenceRecord`, append it to the physical ledger, and update the dashboard atomically.
7. Stop camera resources deterministically on success, failure, cancellation, disconnect, or unmount.

The session has explicit states: `idle`, `preparing`, `camera-starting`, `capturing`, `finalizing`, `validated`, `failed`, and `cancelled`. No state infers success from elapsed time, frame counts, unit-test counts, or software evidence.

## Configuration and provenance

Every record includes:

- run ID and start/completion timestamps;
- transport and explicit modulation;
- OFDM grid size when applicable;
- transmitter screen/device identifier when available;
- receiver camera/device identifier when available;
- camera resolution and measured frame rate;
- distance, brightness, ambient-light condition, and exposure information when available;
- payload size and measured transmission duration;
- valid, corrupt, and dropped frame counters;
- synchronization and optical signal diagnostics;
- CRC state (`valid`, `invalid`, or `not-applicable`);
- reconstruction progress/result;
- source and recovered SHA-256 digests and exact-match flag;
- `evidenceKind: "physical"`, `verificationType: "PHYSICAL"`, and a physical source label;
- immutable configuration snapshot and operator notes.

Unknown hardware measurements remain explicitly unavailable (`null`/`N/A`); they are never replaced with software defaults or fabricated values.

## Camera and error handling

Use `PhysicalCameraService` and the existing lifecycle ownership. Permission denial, unavailable devices, unsupported constraints, stream termination, and disconnect are distinct errors and are shown as camera failures, not protocol failures. The session records the failure and available diagnostics, then cleans up the stream. Reconnect is serialized and cannot overwrite a newer run.

Synthetic software-channel frames are rejected by the physical session boundary. The deterministic software optical channel remains exclusively in the software evidence partition.

## Dashboard and export

Add an authoritative physical validation dashboard section showing:

- selected protocol/modulation/grid;
- camera state, identifier, resolution, and measured FPS;
- luminance/RGB signal diagnostics and synchronization;
- valid/corrupt/dropped frames;
- CRC state and reconstruction progress;
- transmission duration and SHA-256 comparison;
- `verificationType: PHYSICAL` and final physical status.

The dashboard consumes only records emitted by `PhysicalValidationSession`. Existing analytics/history/workbench components may render the same immutable records as compatibility views, but cannot promote or rewrite them. JSON/CSV/Markdown exports include the complete provenance and evidence classification.

## Supported experiment matrix

The controller accepts exactly these physical configurations:

- QR baseline;
- VLC OOK;
- Visual OFDM BPSK at 8x8, 16x16, and 32x32;
- Visual OFDM QPSK at 8x8, 16x16, and 32x32;
- Visual OFDM 16-QAM at 8x8, 16x16, and 32x32.

No automatic modulation or grid-size inference is added.

## Testing strategy

Deterministic tests use dependency-injected camera and router seams while preserving the real session state machine:

- immutable physical record creation and required provenance;
- software evidence cannot be promoted to physical status;
- mixed software/physical evidence is rejected;
- permission-denied and unavailable-camera failures;
- incomplete transfer, dropped/corrupt frames, CRC failure, and SHA mismatch;
- one successful mocked-camera run promotes to `PHYSICAL_VALIDATED`;
- three independent matching successful runs promote to `PHYSICAL_VERIFIED`;
- mismatched configuration does not count toward the three-run threshold;
- dashboard and export consume the executed record only;
- cleanup on stop, disconnect, reconnect, cancellation, and unmount.

Existing software tests remain unchanged and must continue to pass. Physical tests must not invoke or alter QR/VLC/OFDM mathematics.

## Non-goals and safety invariants

This phase does not alter QR wire format, VLC or OFDM framing/modulation/demodulation, fountain coding, storage, recovery, or software verification policy. It does not claim camera/display equivalence, laboratory calibration, or physical performance beyond recorded runs. A missing camera or permission is an explicit physical-session failure, never a successful result.

## Self-review

- Scope is limited to one physical orchestration boundary, evidence model, dashboard integration, and deterministic tests.
- Status definitions are unambiguous and require actual camera-originated evidence.
- Software and physical partitions are disjoint and promotion cannot cross the boundary.
- Existing workbenches are compatibility views, not competing owners.
- Unknown measurements are represented as unavailable rather than inferred.
- Protocol algorithms and formats remain outside the change surface.
- Physical success is impossible without terminal reconstruction and exact SHA-256 equality.
