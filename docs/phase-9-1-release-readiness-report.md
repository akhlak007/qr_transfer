# Phase 9.1 Updated Release Readiness Report

## Verdict

# CONDITIONALLY READY

The three Phase 9 release blockers are fixed and executable composed-path evidence is green. The software multi-protocol release candidate may proceed to controlled final validation, but important lifecycle and evidence-provenance risks remain before an unqualified `READY` verdict.

## Protocol readiness matrix

| Protocol | Exactly-once framing | Renderer representation | Live receiver | CRC reporting | Fountain + SHA-256 | Result |
|---|---|---|---|---|---|---|
| QR | Payload unchanged | Passed | Existing scanner | N/A, accurately reported | Passed | Conditionally ready |
| VLC OOK | `encodeVlcFrame()` | Passed | `VlcOokReceiver` | Valid | Passed | Conditionally ready |
| OFDM BPSK 8x8 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM BPSK 16x16 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM BPSK 32x32 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM QPSK 8x8 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM QPSK 16x16 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM QPSK 32x32 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM 16-QAM 8x8 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM 16-QAM 16x16 | `encodeOfdmFrame()` | Passed | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |
| OFDM 16-QAM 32x32 | `encodeOfdmFrame()` | Passed with renderer dithering | `VisualOfdmReceiver` | Valid | Passed | Conditionally ready |

## Remaining classification

### Blocker

None identified after the Phase 9.1 verification run.

### Important Risk

1. Receiver transport/modulation controls can change during an active receive session without atomically clearing all application reconstruction state.
2. Terminal sequential/fountain finalization lacks an explicit completion latch and is not awaited at every call site.
3. Camera/RAF/interval/object-URL cleanup lacks a dedicated component-unmount effect.
4. Camera reconnection attempts are not serialized, so overlapping `getUserMedia()` requests remain possible.
5. Dashboard-executed integration records remain local to the child component and do not feed the overview policy evaluation.
6. Integration records do not yet contain immutable start/end timestamps and measured duration.
7. Application reconstruction rules remain duplicated between receiver implementations, App logic, and the research harness.

### Technical Debt

1. One unused catch parameter produces a lint warning.
2. Sender session construction is duplicated between file and text paths.
3. `lastScanTimeRef` remains write-only instrumentation.
4. The production JavaScript bundle is 709.77 kB, 188.41 kB gzip, above Vite's advisory threshold.
5. Transport availability metadata remains inconsistent with selectable experimental transports.

## Verification evidence

- TypeScript: passed.
- Lint: passed with one known warning.
- Unit/integration tests: 396 passed, 0 failed.
- Fountain offline reconstruction: passed byte-for-byte.
- Production build: passed.
- Independent composed live-path tests: 14 passed, 0 failed.
- No QR fallback was observed or introduced.
- No physical hardware claim is made.

## Path to READY

Resolve or explicitly accept the seven important risks, add browser-level lifecycle coverage for configuration changes and camera cleanup, and repeat all gates. Physical validation remains a distinct activity and is not required for this software-readiness verdict unless the release claims physical performance.
