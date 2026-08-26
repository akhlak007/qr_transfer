# Phase 9 Risk Assessment

## Release Blockers

| ID | Risk | Evidence | Impact |
|---|---|---|---|
| RB-1 | Live VLC sends unframed application bytes | `App.tsx` -> scheduler -> VLC renderer calls modulation without `encodeVlcFrame()` | VLC camera receiver cannot validate or dispatch live application frames |
| RB-2 | Live OFDM sends unframed application bytes | `App.tsx` -> scheduler -> OFDM renderer calls modulation without `encodeOfdmFrame()` | All live OFDM configurations fail before CRC/payload dispatch |
| RB-3 | QR CRC success is inferred | Phase 8E adapter assigns `crcSuccess = rxSuccess` | False end-to-end verification promotion and misleading release evidence |

## Important Risks

| ID | Risk | Consequence | Recommended control |
|---|---|---|---|
| IR-1 | Phase 8E tests bypass actual App composition | Integration regression can remain invisible while tests pass | Add App scheduler/renderer/router round trips |
| IR-2 | Dashboard integration state is local and not supplied to verification policy | UI matrix and overview can disagree | Lift integration results and pass them to policy evaluation |
| IR-3 | Integration results lack start/end/duration provenance and are mutable | Weak auditability and post-run mutation risk | Add immutable timestamped run records |
| IR-4 | Receive configuration can change mid-transfer without clearing application reconstruction | Blocks/symbols from incompatible configurations may mix | Lock controls during receive or atomically reset the entire receive session |
| IR-5 | Terminal reconstruction is launched without await/deduplication | Concurrent hashes, session transitions, and download URLs | Add a completion latch and await finalization |
| IR-6 | No receiver resource cleanup on component unmount | Camera, interval, RAF, or object URL leak | Add a dedicated unmount cleanup effect |
| IR-7 | Reconnect requests can overlap | Multiple acquired streams and stale routing loops | Serialize/cancel camera acquisition attempts |
| IR-8 | Reconstruction rules are duplicated across receivers, App, and harness | Behavioral drift and inconsistent validation | Consolidate the post-CRC application payload layer |
| IR-9 | Registry stores opaque monolithic runners, not explicit TX/RX pairs | Cannot enforce adapter pairing or lifecycle | Register explicit transmitter and receiver adapters |
| IR-10 | Transport descriptors mark VLC/OFDM unavailable while UI permits selection | Conflicting capability state | Define one authoritative availability/readiness source |

## Minor Technical Debt

| ID | Debt | Effect |
|---|---|---|
| TD-1 | `lastScanTimeRef` is write-only | Dead instrumentation and reader confusion |
| TD-2 | File/text sender-session construction is duplicated | Maintenance overhead |
| TD-3 | One unused catch parameter remains in benchmark engine | Persistent lint warning |
| TD-4 | Production JS chunk exceeds Vite's 500 kB advisory threshold | Initial load and caching cost |
| TD-5 | Verification labels mix legacy milestone terminology with current status model | Documentation/UI clarity risk |

## Risk posture

Risk acceptance is not appropriate for RB-1 through RB-3 because they invalidate core release claims. IR-1 through IR-5 should be fixed before a public multi-protocol release. Remaining important risks require either remediation or an explicit documented acceptance decision.
