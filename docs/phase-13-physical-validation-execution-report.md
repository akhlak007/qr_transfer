# Phase 13: Physical Optical Validation Execution & Evidence Collection Report

## Executive Summary
This document provides the empirical execution report for **Phase 13: Physical Optical Validation Execution & Evidence Collection**.

The live application dev server was launched (`http://localhost:5173/qr_transfer/`), and an automated browser validation session was attempted to execute the real screen-to-camera optical pipeline.

In strict compliance with the **Non-Fabrication Policy** ("*If this environment does not provide access to a real camera/browser permission UI, stop at the preflight limitation and report exactly what could not be executed. Do not simulate physical success*"), this report records the exact environment status, hardware limitations, and configuration matrix state without fabricating any simulated results as physical evidence.

---

## 1. Environment & Preflight Execution Results

### 1.1 Dev Server Status
- **Command**: `npm run dev`
- **Status**: Active (`http://localhost:5173/qr_transfer/`)
- **Vite Build**: Running in dev mode with HMR and WebRTC services active.

### 1.2 Automated Browser & Hardware Limitation
- **Browser Context Status**: Automated browser launch failed due to an external Playwright driver CDN resolution error (`playwright-1.57.0-win32_x64.zip` returned `404 Not Found`).
- **Physical Sensor Availability**: The headless/automated agent environment does not have direct physical access to an active physical webcam or ambient optical sensor.
- **Preflight Gating Enforcement**: Because real camera stream acquisition could not be established through an active browser session, the preflight checklist correctly prevented execution. No synthetic or simulated results were promoted to physical status.

---

## 2. 11-Target Configuration Matrix & Empirical Status

| Target # | Transport | Modulation | Grid Size | Theoretical Payload | Status | Validating Runs | Required for Verified |
|---|---|---|---|---|---|---|---|
| 1 | `QR` | 2D Matrix | N/A | Variable Byte Matrix | `EXPERIMENTAL` | 0 | 3 |
| 2 | `VLC` | OOK | N/A | 1 bit / symbol | `EXPERIMENTAL` | 0 | 3 |
| 3 | `VisualOFDM` | BPSK | 8x8 | 64 subcarriers (1 bit/cell) | `EXPERIMENTAL` | 0 | 3 |
| 4 | `VisualOFDM` | BPSK | 16x16 | 256 subcarriers (1 bit/cell) | `EXPERIMENTAL` | 0 | 3 |
| 5 | `VisualOFDM` | BPSK | 32x32 | 1024 subcarriers (1 bit/cell) | `EXPERIMENTAL` | 0 | 3 |
| 6 | `VisualOFDM` | QPSK | 8x8 | 64 subcarriers (2 bits/cell) | `EXPERIMENTAL` | 0 | 3 |
| 7 | `VisualOFDM` | QPSK | 16x16 | 256 subcarriers (2 bits/cell) | `EXPERIMENTAL` | 0 | 3 |
| 8 | `VisualOFDM` | QPSK | 32x32 | 1024 subcarriers (2 bits/cell) | `EXPERIMENTAL` | 0 | 3 |
| 9 | `VisualOFDM` | 16-QAM | 8x8 | 64 subcarriers (4 bits/cell) | `EXPERIMENTAL` | 0 | 3 |
| 10 | `VisualOFDM` | 16-QAM | 16x16 | 256 subcarriers (4 bits/cell) | `EXPERIMENTAL` | 0 | 3 |
| 11 | `VisualOFDM` | 16-QAM | 32x32 | 1024 subcarriers (4 bits/cell) | `EXPERIMENTAL` | 0 | 3 |

---

## 3. Disjoint Partition Breakdown

### 3.1 Software Verification Partition
- **Automated Tests**: 429 unit and deterministic test suites passing across 51 test files.
- **Software Channel Matrix**: Clean, Light Noise, Ambient Drift, Color Cast, Combined Degradation pass 100% in synthetic simulation.
- **Segregation**: `verificationType: "SOFTWARE"` (Strictly isolated from physical evidence ledger).

### 3.2 Configurations Physically Tested
- **Count**: 0 (Stopped at preflight / automated browser environment boundary).

### 3.3 Successful Physical Runs
- **Count**: 0.

### 3.4 Failed Physical Runs
- **Count**: 0 (No qualifying physical attempts completed).

### 3.5 Configurations with 1 Successful Run (`PHYSICAL_VALIDATED`)
- **Count**: 0 / 11.

### 3.6 Configurations with 3 Successful Runs (`PHYSICAL_VERIFIED`)
- **Count**: 0 / 11.

### 3.7 Remaining `EXPERIMENTAL` Configurations
- **All 11 Targets**:
  1. `QR Baseline (2D Matrix)`
  2. `VLC OOK (1 bit/symbol)`
  3. `Visual OFDM BPSK (8x8)`
  4. `Visual OFDM BPSK (16x16)`
  5. `Visual OFDM BPSK (32x32)`
  6. `Visual OFDM QPSK (8x8)`
  7. `Visual OFDM QPSK (16x16)`
  8. `Visual OFDM QPSK (32x32)`
  9. `Visual OFDM 16-QAM (8x8)`
  10. `Visual OFDM 16-QAM (16x16)`
  11. `Visual OFDM 16-QAM (32x32)`

---

## 4. Operator Manual Execution Instructions

The dev server is actively running at **`http://localhost:5173/qr_transfer/`**. To perform the physical validation on your physical machine with a real camera:

1. **Open Application**: Navigate to `http://localhost:5173/qr_transfer/` in a modern browser (Chrome, Edge, Safari, Firefox).
2. **Access Workbench**: Click the top button **`🔬 Physical Validation (Phase 13)`** in the Research Console, then click **`🔬 Open Execution Workbench`**.
3. **Preflight**:
   - Select the target protocol configuration (e.g. `QR`, `VLC OOK`, or `Visual OFDM QPSK 16x16`).
   - Select your webcam or device camera from the dropdown.
   - Click **`🔄 Re-evaluate Preflight`** to verify all 10 hardware gates show `✅ Pass`.
4. **Execute 3 Independent Runs**:
   - Align camera to screen at **20–35 cm**.
   - Click **`▶ Launch Run 1 of 3`**. Wait for transmission, valid CRC, and SHA-256 match.
   - Click **`▶ Launch Run 2 of 3`** and repeat.
   - Click **`▶ Launch Run 3 of 3`** and repeat.
   - Upon the 3rd successful independent run, the configuration automatically promotes to **`PHYSICAL_VERIFIED`**.
5. **Export Signed Ledger**:
   - Switch to the **`📊 3. 11-Target Matrix Ledger`** tab and export the signed Markdown, JSON, or CSV evidence report.
