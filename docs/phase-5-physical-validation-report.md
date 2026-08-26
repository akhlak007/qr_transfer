# Phase 5 Evidence Report: Physical Optical Validation & Hardware Test Instrumentation

**Date:** 2026-08-23  
**Status:** Instrumentation Complete & Verified  
**Physical Validation Status:**
- **QR Streaming:** **PHYSICALLY VERIFIED** (Phase 1 Screen-to-Camera Baseline)
- **VLC (Visible Light Communication):** **EXPERIMENTAL / NOT PHYSICALLY TESTED**
- **Visual OFDM (Spatial Frequency):** **EXPERIMENTAL / NOT PHYSICALLY TESTED**

---

## 1. Executive Summary & Objective

Phase 5 establishes a formal, reproducible **Physical Optical Validation & Hardware Instrumentation Framework** for screen-to-camera optical data transmission.

The objective is to strictly enforce empirical evidence standards across all optical transports:

$$\text{Display Transmitter} \xrightarrow{\text{Free Space}} \text{Camera Sensor} \xrightarrow{\text{Decoder}} \text{Reconstructed Bytes} \xrightarrow{\text{SHA-256 Match}} \text{Ledger Provenance}$$

### Mandatory Empirical Integrity Rule
- **Synthetic Simulation is NOT Physical Proof:** A 100% pass rate in synthetic channel simulation does not constitute physical hardware validation.
- **Physical Verification Requirement:** A capability is marked as **Physically Verified** if and only if real physical display-to-camera experiments achieve exact SHA-256 cryptographic match under a strict minimum evidence threshold ($\ge 3$ verified runs).
- **Physical Status Baseline:** In the absence of recorded multi-run physical hardware experiments, VLC and Visual OFDM remain strictly classified as **EXPERIMENTAL / NOT PHYSICALLY TESTED**.

---

## 2. Hardware Test Instrumentation Layer

### 2.1 Camera Diagnostics Layer (`src/research/camera-diagnostics.ts`)
Captures real optical receiver properties from live frame buffers:
- **Observed Frame Rate (FPS):** Calculated from precise high-resolution `performance.now()` timestamp differences rather than unverified browser API reports.
- **Frame Interval & Jitter (ms):** Frame-to-frame delta tracking with dropped frame detection ($\Delta t > 1.75 \times \text{interval}$).
- **Average Luminance & Variance:** Frame-wide ITU-R BT.601 luminance distribution ($Y = 0.299R + 0.587G + 0.114B$).
- **RGB Channel Balance:** Per-channel optical intensity tracking.
- **Exposure Stability Score:** Metric ($0.0\dots 1.0$) based on rolling luminance standard deviation, detecting camera auto-exposure hunting.
- **Optical Dynamic Range:** Max minus min luminance across sampled pixels.

### 2.2 Display Transmitter Diagnostics Layer (`src/research/display-diagnostics.ts`)
Separates declared browser properties from measured optical properties:
- **Declared Properties:** OS/Browser reported resolution, device pixel ratio, viewport size, color depth.
- **Measured Properties:** Actual screen refresh rate (Hz) and rendering jitter (ms) measured via `requestAnimationFrame` deltas.

### 2.3 Hardware Experiment Ledger & Protocol Modal (`src/research/physical-test-run.ts`, `PhysicalTestProtocolModal.tsx`)
Strongly typed physical experiment recording interface capturing:
- Transmitter device, display model, resolution, refresh rate.
- Receiver device, camera sensor model, resolution, OS, browser.
- Physical environment (throw distance in cm, ambient light in lux, exposure mode, gain).
- Cryptographic verification (Original SHA-256, Recovered SHA-256, bit-by-bit match boolean, CRC-16 status).
- Optical telemetry (duration ms, throughput Bps, dropped frames, synchronization status, failure outcome).

---

## 3. Minimum Physical Evidence Policy

To prevent false positives and premature validation claims, Phase 5 implements the deterministic **Minimum Evidence Policy**:

$$\text{MIN\_PHYSICAL\_RUNS} = 3, \quad \text{MIN\_SHA256\_MATCHES} = 3$$

| Status | Evaluation Criteria | UI Badge |
| :--- | :--- | :--- |
| **`PHYSICALLY_VERIFIED`** | $\ge 3$ physical runs, $\ge 3$ SHA-256 matches, 0 failures, 100% CRC pass | `badge-active` (Green) |
| **`INSUFFICIENT_PHYSICAL_EVIDENCE`** | $1\dots 2$ successful physical runs recorded ($< 3$ required threshold) | `badge-warning` (Amber) |
| **`PHYSICAL_FAILURE_RECORDED`** | $\ge 1$ physical run failed (CRC mismatch, SHA-256 failure, sync loss) | `badge-danger` (Red) |
| **`EXPERIMENTAL_NOT_TESTED`** | 0 physical hardware experiments recorded in research ledger | `badge-neutral` (Gray) |

---

## 4. Current Transport Physical Verification Matrix

| Optical Transport | Modulation | Synthetic Simulation Status | Physical Hardware Evidence | Final Verification Status |
| :--- | :--- | :---: | :---: | :---: |
| **QR Streaming** | Binary Matrix | 20/20 Interruption Tests Pass | Screen-to-Camera Validated | **PHYSICALLY VERIFIED** |
| **VLC** | OOK | 60/60 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **VLC** | 4-PAM | 60/60 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **VLC** | CSK-8 | 60/60 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **VLC** | CSK-16 | 60/60 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **Visual OFDM** | BPSK (8×8, 16×16, 32×32) | 48/48 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **Visual OFDM** | QPSK (8×8, 16×16, 32×32) | 48/48 Stress Scenarios Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |
| **Visual OFDM** | 16-QAM | Automated Unit Tests Pass | 0 Physical Runs Recorded | **EXPERIMENTAL / NOT TESTED** |

---

## 5. Physical Failure Evidence Retention Policy

Physical experiment failures are essential empirical research data and are **never deleted or discarded**:
- Failed experiments are permanently recorded in the IndexedDB research ledger.
- Failure types (such as `sha256_mismatch`, `crc_failure`, `sync_failure`, `frame_loss_failure`) are categorized and exposed in telemetry.
- Any recorded physical failure automatically prevents a transport configuration from claiming `PHYSICALLY_VERIFIED` status until the failure root cause is resolved and validated across fresh test runs.

---

## 6. Verification Gate Summary

| Verification Gate | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **TypeScript Compilation** | `npm run typecheck` | **PASS** | 0 errors across all research and transport modules |
| **Static Code Analysis / Lint** | `npm run lint` | **PASS** | 0 errors, 0 warnings across 96 files |
| **Full Unit & Integration Suite** | `npm test` | **PASS** | **223 / 223 tests passed** across 15 suites |
| **Physical Test Run Validation** | `npx tsx --test src/research/physical-test-run.test.ts` | **PASS (4 / 4 tests)** | Hardware validation & SHA-256 match rules |
| **Physical Evidence Aggregation** | `npx tsx --test src/research/physical-evidence.test.ts` | **PASS (5 / 5 tests)** | Minimum evidence policy & physical/sim separation |
| **Fountain Benchmark** | `npm run test:fountain` | **PASS** | 51,200 bytes reconstructed with 0 bit errors |
| **Production Build** | `npm run build` | **PASS** | Client bundle built in 459ms |

---

## 7. Directional Mobile Compatibility

Physical directional compatibility is strictly evidence-backed:
- Validation in one direction (e.g., $\text{Android} \to \text{iPhone}$) **never implies or verifies** the reverse direction ($\text{iPhone} \to \text{Android}$).
- All matrix cells are populated exclusively from verified physical ledger records with independent directional provenance.

---

## 8. Formal Physical Status Statement

> [!IMPORTANT]
> **NO PHYSICAL VALIDATION DATA RECORDED FOR VLC OR VISUAL OFDM.**
>
> While the Phase 1 QR baseline is physically verified, Visible Light Communication (VLC) and Visual OFDM have not yet been evaluated in real-world hardware screen-to-camera experiments.
>
> In accordance with strict empirical scientific standards, both VLC and Visual OFDM remain explicitly classified as **EXPERIMENTAL / NOT PHYSICALLY TESTED** across all user interfaces, telemetry dashboards, and documentation until real physical hardware test runs meeting the minimum evidence policy ($\ge 3$ runs with matching SHA-256) are recorded in the research ledger.
