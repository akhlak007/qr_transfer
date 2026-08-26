# Phase 7E Evidence Report: Controlled Physical Evidence Acquisition & Multi-Run Validation

**Date:** 2026-08-23  
**Status:** Physical Acquisition Framework Active (Milestone 7E Infrastructure Verified)  
**Current Physical Acquisition Ledger Summary:**
- **Recorded Physical Runs in Current Ledger:** **0 physical runs recorded**
- **Qualifying Bit-Perfect SHA-256 Matches:** **0**
- **Recorded Physical Failures:** **0**
- **VLC Verification Status:** **EXPERIMENTAL / NOT TESTED (0 / 12 qualifying runs)**
- **Visual OFDM Verification Status:** **EXPERIMENTAL / NOT TESTED (0 / 27 qualifying runs)**
- **QR Reference Baseline:** **PHYSICALLY VERIFIED**

---

## 1. Primary Objective

The primary objective of Phase 7E is to transition from experimental software readiness to **systematic physical screen-to-camera evidence acquisition** across 13 target configurations (4 VLC + 9 Visual OFDM) requiring a minimum of **39 qualifying independent physical runs** with exact SHA-256 bit-perfect parity and zero failures.

---

## 2. Hardware Protocol & Experimental Setup

1. **Transmitter Display:** Mini-LED / OLED display (120 Hz, $3024 \times 1964$ resolution) rendering uncompressed optical frames via HTML5 2D Canvas.
2. **Receiver Camera:** High-resolution optical sensor (48 MP Main, f/1.78) streaming live `ImageData` via WebRTC `getUserMedia()`.
3. **Channel Environment:**
   - Throw distance: $d \in [5\text{ cm}, 50\text{ cm}]$
   - Ambient illumination: $L \in [30\text{ lux}, 450\text{ lux}]$
   - Fixed locked exposure mode (manual / fixed AGC) to prevent auto-gain optical drift.

---

## 3. Systematic 14-Target Configuration Matrix

| # | Protocol | Modulation / Grid | Target Subcarriers / Density | Required Qualifying Runs | Current Physical Runs | Current Status |
| :-: | :--- | :--- | :--- | :-: | :-: | :--- |
| **0** | **QR Baseline** | 2D Binary Matrix | Fountain-coded dynamic blocks | 3 | $\ge 20$ | **PHYSICALLY VERIFIED** |
| **1** | **VLC** | OOK | 1 bit / symbol intensity | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **2** | **VLC** | 4-PAM | 2 bits / symbol intensity | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **3** | **VLC** | CSK-8 | 3 bits / symbol chromaticity | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **4** | **VLC** | CSK-16 | 4 bits / symbol chromaticity | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **5** | **Visual OFDM** | BPSK ($8\times 8$) | 64 spatial subcarriers (1 bit/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **6** | **Visual OFDM** | BPSK ($16\times 16$) | 256 spatial subcarriers (1 bit/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **7** | **Visual OFDM** | BPSK ($32\times 32$) | 1024 spatial subcarriers (1 bit/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **8** | **Visual OFDM** | QPSK ($8\times 8$) | 64 spatial subcarriers (2 bits/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **9** | **Visual OFDM** | QPSK ($16\times 16$) | 256 spatial subcarriers (2 bits/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **10** | **Visual OFDM** | QPSK ($32\times 32$) | 1024 spatial subcarriers (2 bits/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **11** | **Visual OFDM** | 16-QAM ($8\times 8$) | 64 spatial subcarriers (4 bits/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **12** | **Visual OFDM** | 16-QAM ($16\times 16$) | 256 spatial subcarriers (4 bits/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **13** | **Visual OFDM** | 16-QAM ($32\times 32$) | 1024 spatial subcarriers (4 bits/sc) | 3 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **Total** | — | — | **13 Experimental Configurations** | **39 Required Runs** | **0 Recorded** | **0 / 39 Complete (0%)** |

---

## 4. Physical Execution Procedure

1. **Pre-flight Hardware Check:** Verify transmitter canvas resolution and receiver camera stream availability.
2. **Optical Calibration:** Measure black $(0,0,0)$ and white $(255,255,255)$ levels to establish dynamic range.
3. **Payload & Expected SHA-256:** Generate expected payload hash ($H_{\text{expected}}$) prior to transmission.
4. **Stabilization Countdown:** 3-second stabilization period to allow optical alignment and camera exposure settling.
5. **Optical Transmission:** Render temporal light sequence (VLC) or 2D-DCT spatial subcarriers with pilot tones (OFDM).
6. **Live Camera Demodulation:** Extract frame regions, slice constellation points, apply Zero-Forcing equalization, and check CRC-16.
7. **Cryptographic Validation:** Verify bit-perfect reconstruction: $H_{\text{actual}} === H_{\text{expected}}$.
8. **Immutable Persistence:** Record physical `TestRun` to IndexedDB ledger.

---

## 5. Minimum Evidence Policy

$$\text{MIN\_PHYSICAL\_RUNS} = 3, \quad \text{MIN\_SHA256\_MATCHES} = 3, \quad \text{MAX\_FAILURES} = 0$$

- **`EXPERIMENTAL / NOT TESTED`**: 0 physical runs recorded.
- **`INSUFFICIENT PHYSICAL EVIDENCE`**: 1–2 qualifying physical runs.
- **`PHYSICAL FAILURE RECORDED`**: $\ge 1$ physical failure recorded and $< 3$ qualifying runs.
- **`PHYSICALLY VERIFIED`**: $\ge 3$ independent qualifying physical runs, $\ge 3$ SHA-256 matches, 0 failures.

---

## 6. Failure Classification & Root-Cause Analysis

All failed physical attempts are immutably retained in the ledger with explicit classification:

- `CAMERA_PERMISSION_DENIED`
- `CAMERA_UNAVAILABLE`
- `DISPLAY_UNAVAILABLE`
- `CALIBRATION_FAILED`
- `LOW_CONTRAST`
- `EXPOSURE_UNSTABLE`
- `SYNC_TIMEOUT`
- `GRID_DETECTION_FAILED`
- `PILOT_SYNC_FAILED`
- `CHANNEL_ESTIMATION_FAILED`
- `DECODE_FAILED`
- `CRC_FAILED`
- `SHA256_MISMATCH`
- `USER_CANCELLED`
- `UNKNOWN_ERROR`

---

## 7. End-to-End Evidence-Chain Architecture

```
[ Physical Screen-to-Camera TestRun ]
                 │ (Live ImageData from Camera)
                 ▼
     [ Experiment Manifest ] (Immutable hardware/env metadata + SHA-256)
                 │
                 ▼
     [ Research Dataset Bundle ] (Packaged with top-level SHA-256 checksum)
                 │
                 ▼
     [ Archival Storage Entry ] (Versioned and tamper-verified)
                 │
                 ▼
  [ Peer-Review Readiness Audit ] (6-point formal compliance evaluation)
```

---

## 8. Current Physical Results & Remaining Experiments

- **Current Physical Runs in Ledger:** 0
- **Current Verified Runs:** 0
- **Current Physical Failures:** 0
- **Remaining Experimental Runs to Execute:** **39 qualifying physical runs** (12 VLC + 27 Visual OFDM)

---

## 9. Scientific Integrity & Anti-Fabrication Declaration

- [x] **No Fabricated Evidence:** Zero simulated or mock results have been inserted into the physical evidence ledger.
- [x] **Honest Hardware Reporting:** When physical hardware is unperformed, the system reports `EXPERIMENTAL / NOT TESTED`.
- [x] **Strict Non-Contamination:** Synthetic channel simulations remain 100% segregated from the physical evidence partition.
- [x] **Baseline Invariance:** `src/transports/qr/`, fountain coding, and storage schemas remain 100% untouched.
