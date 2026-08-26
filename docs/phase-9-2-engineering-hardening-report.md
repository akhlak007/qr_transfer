# Phase 9.2 Engineering Hardening Report

Date: 2026-08-26  
Scope: software application lifecycle, reconstruction, and verification evidence

## Implemented architecture

`ApplicationReconstructionService` is now the authoritative post-transport owner of metadata, sequential/fountain ingestion, completion detection, reassembly, and SHA-256 verification. It uses the existing protocol, chunker, and fountain implementations. Finalization is one-shot (`idle -> finalizing -> complete|failed`), duplicate terminal frames share one promise, SHA mismatch is a failed finalization, and callers receive defensive result copies.

`ReceiverSessionController` owns an immutable transport/modulation/grid snapshot. Active reception and finalization lock configuration. An unlocked change resets the live router and reconstruction service atomically. Live routing and receive-session persistence read the controller snapshot rather than mutable UI values.

`CameraLifecycleController` serializes acquisition/reconnect, discards late generations, and owns deterministic cleanup of streams, RAF work, intervals, video attachment, and object URLs. App unmount invokes `dispose()`.

The legacy App persistence/UI code is retained only as a downstream adapter. A payload that the reconstruction service neither accepts nor classifies as a duplicate returns before it can mutate persistence, progress, or decoder mirrors. The former pre-metadata fountain placeholder path was removed.

Software verification evidence is owned by `SoftwareVerificationOverview`, atomically replaced through `VerificationEvidenceController`, and passed directly into verification-policy evaluation. Published integration records include immutable provenance: run ID, timestamps, measured duration, protocol configuration, channel seed, source, software verification type, and simulation channel label.

## Files created

- `src/core/application-reconstruction-service.ts`
- `src/core/application-reconstruction-service.test.ts`
- `src/core/receiver-session-controller.ts`
- `src/core/receiver-session-controller.test.ts`
- `src/core/camera-lifecycle-controller.ts`
- `src/core/camera-lifecycle-controller.test.ts`
- `src/core/finalization-generation-guard.ts`
- `src/core/finalization-generation-guard.test.ts`
- `src/research/verification-evidence-controller.ts`
- `src/research/verification-evidence-controller.test.ts`
- `docs/superpowers/specs/2026-08-26-phase-9-2-engineering-hardening-design.md`
- `docs/phase-9-2-engineering-hardening-report.md`
- `docs/phase-9-2-risk-assessment.md`
- `docs/phase-9-2-release-readiness-report.md`

## Files modified

- `src/App.tsx`
- `src/components/EndToEndSoftwareVerification.tsx`
- `src/components/SoftwareVerificationOverview.tsx`
- `src/research/software-optical-channel.ts`
- `src/research/software-optical-integration.ts`
- `src/research/software-optical-integration.test.ts`
- `src/research/software-verification.ts`
- `src/research/software-verification.test.ts`

## Test evidence

The hardening coverage includes configuration locking/reset, sequential and fountain reconstruction, duplicate terminal frames, one-shot hashing, SHA mismatch, transfer identity, result copy isolation, concurrent camera acquisition/reconnect, stale acquisition disposal, unmount-equivalent cleanup, evidence generation ordering, immutable provenance, dashboard propagation, and protocol-specific CRC promotion.

The full observed test run passed 409 tests in 49 suites with zero failures. Fountain offline reconstruction also passed byte-for-byte. The independently executed Phase 8E integration suite passed 18 tests, covering QR, VLC OOK, all nine OFDM configurations, channel impairment behavior, configuration isolation, reconstruction, and SHA-256 equality.

## Invariants

No QR wire format, modulation mathematics, receiver algorithm, fountain mathematics, storage schema, or recovery algorithm was changed. All optical-channel evidence remains explicitly software/simulation evidence; no physical validation claim is made.
