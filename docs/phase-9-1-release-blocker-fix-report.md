# Phase 9.1 Release Blocker Fix Report

Date: 2026-08-26  
Verification scope: software/application composition  
Channel claims: no physical validation claim

## Outcome

All three Phase 9 release blockers are resolved.

## RB-1: Live VLC application framing

`OpticalFrameScheduler.beginFrame()` is now the single live application-payload transport boundary. For VLC it calls `encodeVlcFrame()` exactly once with:

- protocol version 1;
- the explicitly configured VLC modulation;
- the scheduler-owned application-frame sequence;
- the unmodified application payload.

The scheduler retains the framed bytes for the complete optical symbol train. Symbol totals are calculated from those same framed bytes, so the next application payload cannot advance prematurely.

Composed evidence executes:

```text
application metadata/fountain payload
  -> OpticalFrameScheduler / encodeVlcFrame exactly once
  -> VLC optical renderer representation
  -> LiveReceiverRouter
  -> VlcOokReceiver
  -> CRC valid
  -> application fountain decoder
  -> SHA-256 exact match
```

Observed VLC SHA-256:

`744f9e0aa124cc481265b33c17e59a5ee97e1db12dab22dbc5468b0d709c9627`

## RB-2: Live OFDM application framing

The same scheduler boundary calls `encodeOfdmFrame()` exactly once for Visual OFDM, including explicit modulation, grid size, pilot configuration, and scheduler sequence. Grid totals and grid advancement use the resulting framed bytes.

The composed suite passes for:

- BPSK: 8x8, 16x16, 32x32
- QPSK: 8x8, 16x16, 32x32
- 16-QAM: 8x8, 16x16, 32x32

Each configuration verifies transport magic/header, exactly-one-wrapper payload identity, real pixel renderer representation, live router isolation, receiver CRC, fountain reconstruction, and SHA-256.

Observed OFDM SHA-256 for every configuration:

`bf687c99c608fe0266c762353326d3a70e67e49ecf2da56c0bf4d80268013885`

During composed testing, 16-QAM 32x32 exposed insufficient precision from assigning one rounded 8-bit luminance to each rendered cell. The renderer now uses deterministic intra-cell dithering so the sampled cell average retains fractional luminance. This changes only the 8-bit display representation; OFDM modulation, constellation, framing, and receiver algorithms are unchanged.

## RB-3: QR CRC evidence

Software integration results now use the explicit state:

```text
valid | invalid | not-applicable
```

QR reports `not-applicable` in both software integration records and live receiver routing. The dashboard renders this as `N/A`. End-to-end policy accepts `not-applicable` as an honest absence of a CRC stage, without calling it CRC success. VLC and OFDM must report `valid` to promote.

## Exactly-once and isolation controls

- Callers provide only application payloads to the scheduler.
- Transport wrapping is centralized at scheduler ingress.
- Decoding the scheduled VLC/OFDM frame yields the original application payload, proving it was not double-wrapped.
- Active framed bytes remain fixed until all symbols/grids render.
- QR payload bytes are returned unchanged.
- The live router remains explicit and never falls back to QR.

## Verification

| Command/suite | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with one pre-existing warning in `benchmark-engine.ts` |
| `npm test` | 396 passed, 0 failed across 49 suites |
| Fountain simulation | Passed; exact byte equality |
| `npm run build` | Passed |
| Independent composed live-path suite | 14 passed, 0 failed |

## Files changed for Phase 9.1

- `src/core/application-optical-pipeline.ts`
- `src/core/application-optical-pipeline.test.ts`
- `src/transports/ofdm/ofdm-renderer.ts`
- `src/transports/ofdm/visual-ofdm-transmitter-renderer.ts`
- `src/transports/vlc/vlc-transmitter-renderer.ts`
- `src/research/software-optical-integration.ts`
- `src/research/software-optical-integration.test.ts`
- `src/research/software-verification.ts`
- `src/research/software-verification.test.ts`
- `src/components/EndToEndSoftwareVerification.tsx`

No QR wire format, VLC/OFDM modulation mathematics, receiver algorithm, fountain code, storage, or recovery implementation was changed.
