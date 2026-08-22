# Lumen 2.0 Phase 1 Implementation Plan

**Design:** `docs/superpowers/specs/2026-08-22-lumen-2-optical-platform-design.md`  
**Phase:** QR Baseline Stabilization and Metrics Extraction  
**Date:** 2026-08-22

## Constraints

- Preserve legacy QR metadata, sequential, and fountain frame decoding.
- Preserve the current LT fountain algorithm and whole-buffer path during Phase 1.
- Add measurements without presenting inferred values as observed facts.
- Keep experimental transport results empty until physical tests exist.
- Run build, lint, and tests after every major milestone.

## Milestone 1A: Test Harness and Core Models

### Files created

- `src/core/transfer-metrics.ts`
- `src/core/transfer-session.ts`
- `src/core/integrity.ts`
- `src/core/transport.ts`
- `src/core/transfer-metrics.test.ts`
- `src/core/integrity.test.ts`

### Files modified

- `package.json`
- `src/modules/fountain.test.ts`

### Work

1. Add deterministic `test`, `test:fountain`, and `typecheck` scripts using the installed `tsx` and TypeScript tools.
2. Define transport identifiers and maturity labels, including the exact Visual OFDM research label.
3. Define transfer-session identity and status models without adding persistence yet.
4. Implement pure metrics calculations for elapsed time, achieved rates, valid/invalid/duplicate counts, hit rate, miss rate, sequence loss, throughput, recovery overhead, and ETA.
5. Keep metric denominators explicit in types and UI labels.
6. Add SHA-256 and constant-time-style byte comparison helpers around Web Crypto.
7. Strengthen fountain simulation to use deterministic loss/duplication cases where practical.

### Verification

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Milestone 1B: QR Observation Adapters and Loop Stability

### Files created

- `src/transports/qr/qr-observations.ts`

### Files modified

- `src/modules/qr-render.ts`
- `src/modules/qr-scan.ts`
- `src/App.tsx`

### Work

1. Return render duration and completion timestamps from QR rendering.
2. Return structured scan outcomes: valid decode, no-code miss, or decode error, plus duration.
3. Replace overlapping `setInterval(async ...)` QR rendering with a self-scheduling loop that completes one render before scheduling the next.
4. Ensure only one camera decode is active at a time.
5. Track requested versus achieved sender FPS and camera/decode FPS separately.
6. Track captured camera frames, decode attempts, decoded protocol frames, invalid frames, duplicate/redundant frames, and accepted fountain symbols.
7. Preserve existing legacy frame payloads in Phase 1; sequence-gap protocol changes are deferred to a separately tested additive protocol milestone to avoid sender/receiver incompatibility.
8. Clean up timers, animation frames, camera tracks, and object URLs reliably.

### Migration considerations

- Existing senders and receivers remain interoperable because Phase 1 does not replace the legacy wire payload.
- `missed` is displayed as camera decode misses (`attempts - QR decodes`), not transmitter packet loss.
- Packet loss remains `Unavailable` until sequence-bearing envelopes are introduced.

### Verification

- Unit tests for observation aggregation.
- Build, lint, typecheck, and all tests.
- Manual local sender start/pause/stop smoke test.

## Milestone 1C: Dashboard and UI Extraction

### Files created

- `src/components/TransferStatistics.tsx`
- `src/components/IntegrityResult.tsx`
- `src/components/ModeBadge.tsx`
- `src/components/OpticalSignalMetrics.tsx`
- `src/components/format.ts`

### Files modified

- `src/App.tsx`
- `src/index.css`

### Work

1. Extract reusable statistics rendering from the monolithic application.
2. Display mode, file, byte size, progress, elapsed time, ETA, current and average effective throughput, capture/decode counts, camera misses, hit rate, redundancy, camera FPS, achieved screen FPS, and integrity state.
3. Display configured canvas brightness and signal-quality availability honestly.
4. Add mode presentation for QR, VLC Experimental, and Visual OFDM (Research Prototype), while keeping only QR selectable for active transfer in Phase 1.
5. Add completion summary suitable for later research-record capture.

### Verification

- Component/type tests where logic is nontrivial.
- Build, lint, typecheck, and all tests.
- Desktop responsive visual inspection and screenshots.

## Milestone 1D: Media Verification

### Files created

- `src/media/media-metadata.ts`
- `src/media/media-verification.ts`
- `src/media/media-metadata.test.ts`
- `src/components/MediaVerification.tsx`

### Files modified

- `src/App.tsx`

### Work

1. Classify image, audio, video, and generic files from browser MIME plus extension fallback.
2. Extract image dimensions through browser image decoding.
3. Extract audio duration and video duration/dimensions through media metadata events where supported.
4. Treat codec as unavailable unless a reliable parser/API supplies it.
5. Record sender metadata and display it with final byte-size and SHA-256 comparison.
6. Never block arbitrary binary transfer when metadata extraction fails.
7. Display `Bit-perfect transfer` only after exact byte size and SHA-256 equality.

### Verification

- Unit tests for classification and metadata comparison.
- Browser fixture smoke tests for supported local media.
- Build, lint, typecheck, and all tests.

## Milestone 1E: Honest Claims, Regression, and Evidence

### Files modified

- `src/App.tsx`
- `src/index.css`
- `README.md`
- `index.html`

### Files created

- `docs/research/phase-1-baseline.md`

### Work

1. Reframe the page as an optical communication research platform.
2. Remove or qualify claims of universal compatibility, guaranteed recovery, deployment, zero emission, enterprise readiness, and unmeasured performance.
3. Add research/compatibility status placeholders with no invented results.
4. Run an in-process QR/fountain benchmark using generated bytes and record hardware/runtime context, input size, block size, symbol count, overhead, elapsed time, and SHA-256 result.
5. Capture screenshots of home/mode selection, active QR dashboard, and completion/verification states using synthetic or local fixture data clearly labeled as local UI evidence.
6. Review the final diff for legacy compatibility and unrelated changes.

### Verification

- Full `npm test`, typecheck, lint, and production build.
- Fountain byte-exact regression.
- Manual QR smoke test where camera/display access is available.
- No numeric comparison values appear without a stored measurement source.

## Phase 1 Exit Deliverables

- Working legacy QR/fountain sender and receiver.
- Stable, documented metric definitions and collection.
- Reusable QR transport observation boundary.
- Transfer and optical-signal dashboard components.
- Media metadata plus bit-perfect SHA-256 verification presentation.
- Evidence-backed local benchmark report.
- Screenshots of key Phase 1 UI states.
- Full verification results and known limitations.

Phase 2 will not start until Phase 1 results are reported and reviewed.
