# Phase 6F Operator Guide & Physical Evidence Verification Report

**Date:** 2026-08-23  
**Status:** Operational Research Instrument (Milestone 6F Complete)  
**Current Physical Classification:**
- **QR Streaming:** **PHYSICALLY VERIFIED**
- **VLC (Visible Light Communication):** **EXPERIMENTAL / NOT PHYSICALLY TESTED**
- **Visual OFDM (Spatial Frequency):** **EXPERIMENTAL / NOT PHYSICALLY TESTED**

---

## 1. Executive Summary

Milestone 6F delivers the **Controlled Operator Workflow & Physical Validation Bench**:
1. **Operator Safety & Guidance Protocol**: Pre-flight confirmation modal, aiming guidance, and a 3-second optical stabilization countdown before transmission begins.
2. **Controlled Test Plan Matrix**: Tracks progress per modulation (VLC: OOK, 4-PAM, CSK-8, CSK-16; Visual OFDM: BPSK, QPSK, 16-QAM across $8\times 8, 16\times 16, 32\times 32$ grids) towards the mandatory $3/3$ qualifying run threshold.
3. **Cryptographic Export Engine**: Deterministic JSON and CSV export bundle generation for physical optical evidence with zero synthetic contamination.
4. **Anti-Fabrication Guarantee**: Only genuine camera frames from `PhysicalCameraService` can produce physical verification records.

---

## 2. Operator Step-by-Step Execution Workflow

```
[ Step 1: Select Transport & Modulation ]
          │ (VLC: OOK / 4-PAM / CSK-8 / CSK-16 or OFDM: BPSK / QPSK / 16-QAM)
          ▼
[ Step 2: Configure Physical Geometry ]
          │ (Set Distance in cm, Ambient Lux, Exposure Mode, Test Payload)
          ▼
[ Step 3: Verify Pre-Flight Checklist ]
          │ (Start Camera, Confirm Live Stream, Display Canvas Readiness)
          ▼
[ Step 4: Operator Confirmation & 3s Countdown ]
          │ (Confirm direct camera optical alignment, 3... 2... 1...)
          ▼
[ Step 5: Screen Transmission & Frame Capture ]
          │ (Optical rendering -> Camera capture -> Demodulation -> CRC)
          ▼
[ Step 6: SHA-256 Cryptographic Match & Ledger Recording ]
          │ (Bit-perfect hash comparison -> Persistent IndexedDB Ledger)
```

---

## 3. Physical Evidence Matrix Progress

### Visible Light Communication (VLC)
| Modulation Scheme | Required Runs | Qualifying Physical Runs | SHA-256 Match Rate | Verification Status |
| :--- | :---: | :---: | :---: | :--- |
| **OOK** | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **4-PAM** | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **CSK-8** | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **CSK-16** | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |

### Visual OFDM (Spatial Frequency)
| Modulation Scheme | Grid Size | Required Runs | Qualifying Physical Runs | SHA-256 Match Rate | Verification Status |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **BPSK** | 8 × 8 | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **BPSK** | 16 × 16 | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **QPSK** | 8 × 8 | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **QPSK** | 16 × 16 | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **16-QAM** | 8 × 8 | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **16-QAM** | 16 × 16 | 3 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |

---

## 4. Verification Gate Results

| Verification Gate | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **TypeScript Compilation** | `npm run typecheck` | **PASS** | 0 errors across 116 modules |
| **Static Code Analysis / Lint** | `npm run lint` | **PASS** | 0 errors, 0 warnings across 121 files |
| **Export Engine Unit Tests** | `npx tsx --test src/research/physical-evidence-export.test.ts` | **PASS (3 / 3)** | JSON & CSV export with synthetic exclusion |
| **Session Model Unit Tests** | `npx tsx --test src/research/physical-experiment-session.test.ts` | **PASS (4 / 4)** | Throughput calculation & schema validation |
| **Unified Controller Tests** | `npx tsx --test src/research/physical-experiment-controller.test.ts` | **PASS (5 / 5)** | Dispatching & headless rejection handling |
| **All Research Unit Tests** | `npx tsx --test src/research/*.test.ts` | **PASS (38 / 38)** | 8 test suites passing |
| **All VLC Test Suites** | `npx tsx --test src/transports/vlc/*.test.ts` | **PASS (73 / 73)** | 5 test suites passing |
| **All OFDM Test Suites** | `npx tsx --test src/transports/ofdm/*.test.ts` | **PASS (66 / 66)** | 5 test suites passing |
| **Full Unit & Integration Suite** | `npm test` | **PASS (249 / 249)** | 21 test suites passing |
| **Fountain Peeling Benchmark** | `npm run test:fountain` | **PASS** | Bit-perfect reconstruction |
| **Production Build** | `npm run build` | **PASS** | Client bundle built in 502ms |
| **QR Regression Check** | `git diff -- src/transports/qr/` | **PASS** | 0 changes (100% untouched) |

---

## 5. Scientific Integrity Confirmation

- [x] **No Synthetic Frames:** Real screen-to-camera optical link is mandatory for physical evidence.
- [x] **No Fabricated Records:** 0 runs recorded for unexecuted hardware sessions; status remains explicitly `EXPERIMENTAL / NOT TESTED`.
- [x] **Minimum Evidence Policy Enforcement:** $\ge 3$ physical runs with matching SHA-256 and zero failures required before transitioning to `PHYSICALLY_VERIFIED`.
- [x] **Segregation:** Synthetic test scores and physical evidence tallies are kept in distinct data structures.
