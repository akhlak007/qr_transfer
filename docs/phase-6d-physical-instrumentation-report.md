# Phase 6D Evidence Report: Physical Test Protocol UI Refinement & End-to-End Instrumentation Integration

**Date:** 2026-08-23  
**Status:** Instrumentation Complete & Verified  
**Physical Validation Status:**
- **QR Streaming:** **PHYSICALLY VERIFIED** (Phase 1 Baseline)
- **VLC (Visible Light Communication):** **EXPERIMENTAL / NOT PHYSICALLY TESTED**
- **Visual OFDM (Spatial Frequency):** **EXPERIMENTAL / NOT PHYSICALLY TESTED**

---

## 1. Executive Summary

Milestone 6D delivers the **Unified Physical Optical Experiment Workbench & End-to-End Instrumentation Framework** integrating:
1. `PhysicalCameraService` (Real WebRTC camera feed acquisition & telemetry).
2. `PhysicalExperimentController` (Unified session manager & dispatcher for VLC and Visual OFDM).
3. `PhysicalExperimentWorkbench` (Interactive research workbench with device readiness checklist, live dual canvas, real-time telemetry, and optical waveform/spectrum inspectors).
4. `PhysicalExperimentHistory` (Immutable research ledger of recorded physical optical test runs).

### Mandatory Empirical Integrity Standard
> [!IMPORTANT]
> **Physical verification is only granted after real hardware experiments satisfy the minimum evidence policy ($\ge 3$ physical runs with matching SHA-256).**
>
> Synthetic test success is **NEVER** treated as physical evidence. No mock or synthetic video frames are accepted by the physical capture pipeline.

---

## 2. Architecture & State Machine

```
                              [ Unified Physical Controller ]
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
     [ VlcPhysicalExperimentService ]               [ OfdmPhysicalExperimentService ]
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            ▼
                               [ PhysicalCameraService ]
                                            │ (Real ImageData)
                                            ▼
                    [ Optical Calibration & Demodulation Engine ]
                                            │
                                            ▼
                              [ Dual CRC-16 & SHA-256 ]
                                            │
                                            ▼
                           [ Immutable Research Ledger ]
```

### State Machine Lifecycle
$$\text{IDLE} \to \text{DEVICE\_CHECK} \to \text{CAMERA\_READY} \to \text{DISPLAY\_READY} \to \text{CALIBRATING} \to \text{READY} \to \text{TRANSMITTING} \to \text{DECODING} \to \text{VALIDATING} \to \text{COMPLETED}$$

**Failure Paths:** `CAMERA_PERMISSION_DENIED`, `CAMERA_UNAVAILABLE`, `DISPLAY_UNAVAILABLE`, `LOW_CONTRAST`, `EXPOSURE_UNSTABLE`, `SYNC_TIMEOUT`, `GRID_DETECTION_FAILED`, `PILOT_SYNC_FAILED`, `DECODE_FAILED`, `CRC_FAILED`, `SHA256_MISMATCH`, `USER_CANCELLED`.

---

## 3. Device & Optical Readiness Verification Checklist

Before transmission can begin, the workbench evaluates a strict readiness checklist:
1. **Camera Stream Active:** Real hardware handle acquired via `navigator.mediaDevices.getUserMedia()`.
2. **Resolution & Actual FPS Detected:** Measured from true `performance.now()` frame interval deltas.
3. **Display Canvas Available:** Active rendering context with verified pixel scaling.
4. **Optical Distance Valid:** Stated geometry between 5 cm and 500 cm.
5. **Ambient Lux Valid:** Measured or declared ambient illumination.
6. **Payload & SHA-256 Generated:** Transmit payload serialized and cryptographic hash prepared.

---

## 4. Minimum Evidence Policy & LEDGER Status

$$\text{MIN\_PHYSICAL\_RUNS} = 3, \quad \text{MIN\_SHA256\_MATCHES} = 3$$

| Status | Condition |
| :--- | :--- |
| **`PHYSICALLY_VERIFIED`** | $\ge 3$ physical runs, $\ge 3$ SHA-256 matches, 0 failures, 100% CRC pass |
| **`INSUFFICIENT_EVIDENCE`** | $1\dots 2$ successful physical runs recorded ($< 3$ threshold) |
| **`PHYSICAL_FAILURE_RECORDED`** | $\ge 1$ physical failure recorded in research ledger |
| **`EXPERIMENTAL / NOT TESTED`** | 0 physical runs recorded |

---

## 5. Verification Gate Results

| Verification Gate | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **TypeScript Compilation** | `npm run typecheck` | **PASS** | 0 errors across 114 modules |
| **Static Code Analysis / Lint** | `npm run lint` | **PASS** | 0 errors, 0 warnings across 117 files |
| **Session Model Unit Tests** | `npx tsx --test src/research/physical-experiment-session.test.ts` | **PASS (4 / 4)** | Throughput calculation & schema validation |
| **Unified Controller Unit Tests** | `npx tsx --test src/research/physical-experiment-controller.test.ts` | **PASS (5 / 5)** | VLC/OFDM dispatch, readiness, cancellation |
| **VLC Physical Service Tests** | `npx tsx --test src/research/vlc-physical-experiment.test.ts` | **PASS (4 / 4)** | State machine & failure PhysicalTestRun |
| **OFDM Physical Service Tests** | `npx tsx --test src/research/ofdm-physical-experiment.test.ts` | **PASS (5 / 5)** | Grid extraction & failure PhysicalTestRun |
| **All OFDM Test Suites** | `npx tsx --test src/transports/ofdm/*.test.ts` | **PASS (66 / 66)** | Framing, modulation, demodulation, stress |
| **All VLC Test Suites** | `npx tsx --test src/transports/vlc/*.test.ts` | **PASS (73 / 73)** | Framing, calibration, modulation, stress |
| **Full Test Suite** | `npm test` | **PASS (246 / 246)** | 19 suites passing |
| **Fountain Peeling Benchmark** | `npm run test:fountain` | **PASS** | Bit-perfect reconstruction |
| **Production Build** | `npm run build` | **PASS** | Client bundle built in 486ms |
| **QR Regression Check** | `git diff -- src/transports/qr/` | **PASS** | 0 modifications to QR baseline |

---

## 6. Current Optical Transport Physical Status

| Optical Transport | Modulation | Synthetic Channel Status | Physical Evidence (Recorded) | Current Status |
| :--- | :--- | :---: | :---: | :---: |
| **QR Streaming** | Binary Matrix | 20/20 Interruption Tests Pass | Screen-to-Camera Validated | **PHYSICALLY VERIFIED** |
| **VLC** | OOK, 4-PAM, CSK-8, CSK-16 | 60/60 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **Visual OFDM** | BPSK, QPSK, 16-QAM | 48/48 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |

> **Scientific Integrity Confirmation:**
> The software provides the complete physical capture and transmission infrastructure for real hardware optical validation. However, no physical test runs have been fabricated or marked as verified. VLC and Visual OFDM remain explicitly classified as **EXPERIMENTAL / NOT PHYSICALLY TESTED** until real hardware runs satisfying the Minimum Evidence Policy ($\ge 3$ physical runs with matching SHA-256) are recorded in the research ledger.
