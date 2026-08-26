# Phase 6E Evidence Report: Real Hardware Physical Optical Validation

**Date:** 2026-08-23  
**Status:** Hardware Validation Pipeline Complete & Operational  
**Verification Policy:** Minimum Evidence Policy ($N \ge 3$ physical runs, $N \ge 3$ bit-perfect SHA-256 matches, 0 failures).

---

## 1. Executive Summary & Verification State

This document records the empirical results of screen-to-camera optical experiments conducted using the real hardware capture pipeline (`PhysicalExperimentWorkbench`, `PhysicalCameraService`, `VlcPhysicalExperimentService`, `OfdmPhysicalExperimentService`).

### Strict Scientific Integrity & Anti-Fabrication Invariants
1. **Zero Synthetic Ingestion:** No synthetic image buffers, simulated optical channels, or synthetic test artifacts are permitted in the physical validation ledger.
2. **Real Optical Hardware:** All physical evidence must originate from real `getUserMedia()` camera frames and physical screen displays.
3. **No Automatic/Fabricated Success:** If an experiment has not been executed with live hardware in a physical environment, it remains explicitly designated as **`EXPERIMENTAL / NOT TESTED`**.
4. **Failure Retention:** Any real screen-to-camera transmission failures (e.g., optical blur, dynamic range clipping, sync loss, CRC mismatch, SHA-256 discrepancy) are permanently recorded in the research ledger and cannot be deleted or concealed.

---

## 2. Hardware Test Protocol & Experimental Environment

### A. Transmitter Apparatus
- **Display Device:** MacBook Pro Liquid Retina XDR Mini-LED (120Hz) / Laboratory Display
- **Resolution:** 3024 × 1964 / 1920 × 1080
- **Refresh Rate:** 60 Hz – 120 Hz
- **Rendering Interface:** HTML5 Direct 2D Canvas

### B. Receiver Apparatus
- **Camera Device:** High-Resolution Smartphone / USB Optical Bench Camera (48MP Main f/1.78)
- **Capture Resolution:** 1280 × 720 / 1920 × 1080 @ 30 FPS / 60 FPS
- **Exposure Control:** Locked / Manual Fixed Exposure

### C. Optical Channel Parameters
- **Throw Distance ($d$):** 10 cm – 50 cm
- **Ambient Lighting ($L$):** 150 – 350 lux (Controlled indoor laboratory bench)
- **Optical Contrast Calibration:** Black (0,0,0) and White (255,255,255) reference baselines

---

## 3. Physical Evidence Matrix

### Visible Light Communication (VLC)

| Modulation Scheme | Physical Runs Recorded | SHA-256 Matches | CRC Pass Rate | Physical Verification Status |
| :--- | :---: | :---: | :---: | :--- |
| **OOK** (On-Off Keying) | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **4-PAM** (Pulse Amplitude) | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **CSK-8** (Color-Shift Keying) | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **CSK-16** (Color-Shift Keying) | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |

### Visual OFDM (Spatial Frequency)

| Modulation Scheme | Spatial Grid | Physical Runs Recorded | SHA-256 Matches | CRC Pass Rate | Physical Verification Status |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **BPSK** | 8 × 8 | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **BPSK** | 16 × 16 | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **QPSK** | 8 × 8 | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **QPSK** | 16 × 16 | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **16-QAM** | 8 × 8 | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |
| **16-QAM** | 16 × 16 | 0 | 0 | N/A | **EXPERIMENTAL / NOT TESTED** |

---

## 4. Empirical Status Summary

```
========================================================================================
OPTICAL TRANSPORT PHYSICAL VALIDATION STATUS
========================================================================================
1. QR Code Streaming (Phase 1 Baseline):
   - Physical Validation: PHYSICALLY VERIFIED (Live Screen-to-Camera Tested)
   - Integrity: Bit-Perfect SHA-256 Cryptographic Match

2. Visible Light Communication (VLC):
   - Synthetic Stress Matrix: 60 / 60 PASSED (100% bit-perfect in simulation)
   - Physical Hardware Runs: 0 / 3 QUALIFYING RUNS
   - Current Physical Status: EXPERIMENTAL / NOT TESTED

3. Visual OFDM (Spatial Frequency):
   - Synthetic Stress Matrix: 48 / 48 PASSED (100% bit-perfect in simulation)
   - Physical Hardware Runs: 0 / 3 QUALIFYING RUNS
   - Current Physical Status: EXPERIMENTAL / NOT TESTED
========================================================================================
```

---

## 5. Physical Verification Invariant Confirmation

- [x] **No Synthetic Contamination:** Physical evidence counters and simulation test tallies are maintained in mathematically distinct ledger partitions.
- [x] **Minimum Evidence Policy:** Requires $\ge 3$ independent successful physical runs with matching SHA-256 digests and zero failures before transitioning to `PHYSICALLY_VERIFIED`.
- [x] **Anti-Fabrication:** In accordance with empirical standards, no fictitious physical runs were fabricated. The hardware validation workbench is ready for human-operated bench sessions.
