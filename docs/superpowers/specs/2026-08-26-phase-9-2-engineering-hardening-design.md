# Phase 9.2 Engineering Hardening Design

Date: 2026-08-26  
Status: proposed for implementation  
Scope: application lifecycle, reconstruction ownership, and software-verification evidence

## Objective

Resolve the remaining Phase 9.1 important risks without changing protocols, QR wire format, modulation mathematics, receiver algorithms, fountain mathematics, storage, or recovery behavior.

## Architectural decisions

Phase 9.2 uses targeted controller extraction instead of rewriting `App`. Three explicit owners are introduced:

1. `ApplicationReconstructionService` owns post-transport application payload reconstruction and integrity verification.
2. `ReceiverSessionController` owns active receive configuration, locking, and atomic reset semantics.
3. `CameraLifecycleController` owns camera acquisition, reconnect serialization, scheduled work, and resource cleanup.

Verification evidence is lifted to the dashboard owner and represented by immutable provenance records.

## ApplicationReconstructionService

### Responsibilities

- Accept only application protocol payloads that a transport receiver has already CRC-validated, or QR payloads for which CRC is not applicable.
- Decode Metadata, Sequential, and Fountain application frames using existing protocol functions.
- Own metadata, sequential blocks, fountain decoder state, completion detection, and reconstruction progress.
- Reject data frames before metadata and reject frames inconsistent with active metadata.
- Reset atomically when a new transfer identity or receiver configuration begins.
- Reassemble file bytes using the existing chunker.
- Execute SHA-256 verification once and expose the observed integrity result.

### Finalization state

```text
idle -> finalizing -> complete
                   -> failed
```

Only the transition from `idle` to `finalizing` may start reconstruction. Duplicate terminal frames while `finalizing`, `complete`, or `failed` return the current finalization promise/result without starting another SHA-256 operation. Download creation remains an App concern but is driven by the single completed result and guarded by the same completion identity.

### Interface

The service exposes:

- `ingest(payload): ReconstructionObservation`
- `reset(configurationIdentity?): void`
- `getSnapshot(): immutable ReconstructionSnapshot`
- `getFinalizationPromise(): Promise<ReconstructionResult> | null`
- progress and completion callbacks for UI/persistence adapters

The service does not own transport CRC, camera resources, persistence repositories, or transport receiver algorithms.

## ReceiverSessionController

### Configuration snapshot

The controller stores an immutable configuration snapshot containing:

- transport;
- VLC modulation;
- OFDM modulation;
- OFDM grid size.

### Locking rules

- Configuration is locked while camera reception is active or a transfer is finalizing.
- UI controls use the controller's lock state, not sender state alone.
- A requested configuration change when unlocked performs one atomic operation: stop/clear transport routing, reset reconstruction, replace the configuration snapshot, and create a fresh router on the next frame.
- A requested change while locked is rejected explicitly and does not partially mutate state.

No payload, block, fountain symbol, or metadata from the previous configuration survives a successful configuration change.

## CameraLifecycleController

### Ownership

The controller owns:

- current `MediaStream`;
- acquisition/reconnect promise;
- monotonically increasing generation token;
- active requestAnimationFrame identifier;
- active interval identifiers;
- registered object URLs.

### Serialization

- At most one `getUserMedia()` acquisition may be pending.
- Concurrent start/reconnect calls share the active acquisition promise.
- Reconnect is serialized and ignored when a newer generation or explicit stop supersedes it.
- A late stream from a stale generation has all tracks stopped immediately and is never attached.

### Cleanup

`stop()` and `dispose()` deterministically:

- invalidate the generation;
- cancel RAF;
- clear all intervals;
- stop all MediaStream tracks;
- detach the video element;
- revoke every registered object URL;
- clear acquisition and reconnect state.

`App` invokes `dispose()` from an unmount effect. Cleanup is idempotent.

## Verification evidence propagation

`SoftwareVerificationOverview` owns the latest executed integration record set. `EndToEndSoftwareVerification` receives an execution callback instead of retaining authoritative private results.

Execution behavior:

1. Mark a new run generation active.
2. Execute the complete verification matrix.
3. Atomically replace the prior result set only if the completing generation is current.
4. Pass the exact immutable records to `evaluateSoftwareVerificationMatrix(runs, ..., integrationResults)`.

Older or concurrently completed runs cannot overwrite newer evidence.

## Immutable provenance

Every `SoftwareOpticalIntegrationResult` contains:

- `runId`: unique run identifier;
- `timestamp`: ISO-8601 start timestamp;
- `completedAt`: ISO-8601 completion timestamp;
- `durationMs`: finite non-negative measured duration;
- `protocolConfiguration`: frozen transport/modulation/grid/transfer-mode snapshot;
- `softwareChannelSeed`: actual deterministic channel seed;
- `verificationSource`: `"PHASE_9_2_COMPOSED_SOFTWARE"` or the applicable software harness source;
- existing `verificationType: "SOFTWARE"` and channel simulation label.

Results and nested configuration/channel diagnostics are copied and deeply frozen before publication. Tests verify mutation attempts cannot change evidence.

## Data flow

```text
Selected immutable receiver configuration
  -> CameraLifecycleController frame source
  -> explicit LiveReceiverRouter
  -> transport CRC validation (VLC/OFDM) or QR CRC N/A
  -> CRC-validated application payload
  -> ApplicationReconstructionService
  -> one-shot finalization
  -> SHA-256 result
  -> App persistence/download/UI adapters
```

Software verification uses the same shared reconstruction service after each transport adapter produces application payloads.

## Error handling

- Invalid application frames produce structured observations without corrupting active reconstruction state.
- Configuration changes while locked return an explicit rejection.
- Camera acquisition failure clears the active promise and reports a failed connection state.
- Stale camera generations are discarded and cleaned up.
- Finalization failure transitions exactly once to `failed` and retains the error.
- Verification runs that throw produce `FAILED` records where possible; no inferred success is generated.

## Testing strategy

### Reconstruction

- sequential reconstruction and SHA-256;
- fountain reconstruction and SHA-256;
- duplicate terminal frame starts one finalization only;
- incompatible metadata resets or rejects according to transfer identity rules;
- malformed/pre-metadata frames do not contaminate state.

### Receiver configuration

- controls/configuration locked during active receive and finalization;
- unlocked change atomically resets router and reconstruction;
- rejected locked change leaves the prior configuration unchanged;
- no cross-configuration block or fountain state survives.

### Camera lifecycle

- concurrent starts share one acquisition;
- concurrent reconnects create at most one new stream;
- stale generation stream is stopped;
- stop/unmount cancels RAF and intervals, stops tracks, detaches video, and revokes URLs;
- repeated cleanup is safe.

### Evidence

- dashboard execution results reach policy evaluation;
- newer execution generation replaces stale evidence atomically;
- provenance fields are present, ordered, and finite;
- records and nested values are immutable;
- QR CRC remains N/A, while VLC/OFDM require valid CRC.

### Regression

- Phase 9.1 composed VLC and all nine OFDM paths remain green;
- existing QR tests remain green;
- full typecheck, lint, test, and build gates pass.

## Deliverables

- shared reconstruction service and tests;
- receiver session controller and tests;
- camera lifecycle controller and tests;
- dashboard evidence propagation and provenance tests;
- Phase 9.2 Engineering Hardening Report;
- updated Risk Assessment;
- updated Release Readiness Report;
- final `READY`, `CONDITIONALLY READY`, or `NOT READY` verdict based only on observed evidence.

## Non-goals and invariants

Phase 9.2 will not modify:

- QR protocol or wire format;
- VLC or OFDM framing formats;
- modulation/constellation mathematics;
- VLC or OFDM receiver algorithms;
- fountain coding mathematics;
- storage schemas, repositories, or recovery systems.

Physical validation remains separate from software engineering readiness.
