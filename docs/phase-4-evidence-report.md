# Phase 4 Evidence Report: Visual OFDM Prototype & Spatial Optical Communication

**Date:** 2026-08-23  
**Status:** Complete & Verified  
**Classification:** Experimental Prototype (Not Physically Tested)

---

## 1. Executive Summary

Phase 4 introduces **Visual Orthogonal Frequency-Division Multiplexing (Visual OFDM)** as an experimental spatial frequency-domain optical transport alongside the verified Phase 1 QR baseline and Phase 2 durability infrastructure. 

Visual OFDM modulates binary payload data across a 2D spatial grid of orthogonal subcarriers using 2D Discrete Cosine Transforms (2D-DCT-II), generating high-throughput 2D spatial luminance patterns.

### Key Evidence Highlights
- **Synthetic Stress Matrix:** 48/48 scenarios passed (100% bit-perfect SHA-256 match) across BPSK and QPSK under 8 optical degradation profiles.
- **Negative Fault Checks:** 3/3 negative failure tests passed (sync failure, CRC corruption, and frame truncation properly rejected).
- **Zero Regression:** QR wire formats, fountain mathematics, and IndexedDB persistence remain 100% untouched.
- **Physical Validation Notice:** Screen-to-camera optical transmission for Visual OFDM is **NOT PHYSICALLY TESTED** and remains explicitly badged as an experimental research prototype.

---

## 2. Phase 4 Architecture & Transport Hierarchy

```text
                       OpticalTransport Contract
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
  QrTransport               VlcTransport            VisualOfdmTransport
(Verified Baseline)     (Phase 3 Prototype)         (Phase 4 Prototype)
 [Phase 1 Foundation]    [Phase 3 Prototype]         [Phase 4 Prototype]
      │                           │                           │
 QR Frame Format           VLC Serial Framing          2D Spatial Grid Framing
  Byte Streaming           Temporal Modulation         Spatial-Frequency DCT
```

Visual OFDM is implemented in `src/transports/ofdm/` with complete mathematical and logical isolation from QR and VLC transports.

---

## 3. Visual OFDM Framing Specification

| Offset (Bytes) | Field | Type | Description |
| :--- | :--- | :--- | :--- |
| `0..1` | Magic Identifier | `0x56, 0x4F` | ASCII `"VO"` (Visual OFDM) |
| `2` | Version | `uint8` | Version `1` |
| `3` | Modulation Code | `uint8` | `1` = BPSK, `2` = QPSK, `3` = 16-QAM |
| `4` | Grid Dimension ($N$) | `uint8` | Grid size: `8`, `16`, `32` |
| `5` | Pilot Configuration | `uint8` | Bitflags & pilot spacing identifier |
| `6..7` | Sequence Number | `uint16` BE | Monotonically incrementing frame counter |
| `8..9` | Payload Length ($L$) | `uint16` BE | Size of payload in bytes ($0\dots 65535$) |
| `10..10+L-1` | Payload Body | `bytes` | Raw data bytes |
| `10+L..11+L` | CRC-16 Checksum | `uint16` BE | CRC-16-CCITT (Poly `0x1021`, Init `0xFFFF`) |

---

## 4. 2D Subcarrier Grid Allocation Model

Each 2D spatial frequency grid of dimension $N \times N$ is deterministically partitioned:

```text
     col 0      col 1      col 2      col 3  ...  col N-1
row 0 [ DC ]   [ Data ]   [ Data ]   [ Data ] ... [ Guard ]
row 1 [ Data ] [ Data ]   [ Data ]   [ Data ] ... [ Guard ]
row 2 [ Data ] [ Data ]   [ Data ]   [ Data ] ... [ Guard ]
row 3 [ Data ] [ Data ]   [ Data ]   [ Data ] ... [ Guard ]
row 4 [Pilot ] [ Data ]   [ Data ]   [ Data ] ... [ Guard ]
  :      :        :          :          :     ...    :
row N-1 [Guard] [Guard]    [Guard]    [Guard] ... [ Guard ]
```

1. **DC Component `(0, 0)`:** Reserved for global luminance normalization; carries 0 information data.
2. **Pilot Subcarriers `(r % 4 === 0 && c % 4 === 0)`:** Injected with deterministic alternating signs ($+1.0 / -1.0$) for optical channel frequency response (CFR) estimation and phase locking.
3. **Guard Carriers (Perimeter $r = N-1$ or $c = N-1$):** High-frequency Nyquist boundaries reserved to prevent spatial aliasing.
4. **Data Carriers (Remaining valid coordinates):** Allocated for BPSK or QPSK constellation symbols.

---

## 5. Modulation Constellations

### BPSK (1 bit / subcarrier)
- Binary Bit `0` $\rightarrow -1.0$
- Binary Bit `1` $\rightarrow +1.0$
- Decision Boundary: $r \ge 0 \rightarrow 1, r < 0 \rightarrow 0$

### QPSK (2 bits / subcarrier, 4-Level Real Basis)
- Constellation Points (Unit Average Energy $\bar{E} = 1.0$):
  - `00` $\rightarrow -1.34164$
  - `01` $\rightarrow -0.44721$
  - `10` $\rightarrow +0.44721$
  - `11` $\rightarrow +1.34164$
- Optimal Decision Thresholds:
  - $r < -0.89443 \rightarrow 00$
  - $-0.89443 \le r < 0.0 \rightarrow 01$
  - $0.0 \le r < +0.89443 \rightarrow 10$
  - $r \ge +0.89443 \rightarrow 11$

---

## 6. Demodulation Pipeline

```text
Spatial Image Capture (Camera / Buffer)
               │
               ▼
Mean Luminance Normalization (Removes DC ambient level)
               │
               ▼
Forward 2D Discrete Cosine Transform (2D-DCT-II)
               │
               ▼
Pilot Tone Extraction & Least-Squares Channel Estimation
               │
               ▼
Zero-Forcing Subcarrier Equalization (H^-1 scaling)
               │
               ▼
BPSK / QPSK Constellation Slicing & Bit Reassembly
               │
               ▼
OFDM Header Parsing & CRC-16 Verification
               │
               ▼
Bit-Perfect Payload Delivery & Telemetry Generation
```

---

## 7. 48-Scenario Synthetic Optical Channel Stress Matrix

### Channel Degradation Profiles Tested
1. **`1_Clean`:** Ideal baseline channel ($\sigma=0$, gain $1.0$).
2. **`2_LightNoise`:** Additive Gaussian sensor noise ($\sigma=0.06$, gain $0.99$).
3. **`3_ExposureVariation`:** Optical gain attenuation ($0.96$) + baseline ambient offset ($+2$ LSB).
4. **`4_AmbientDrift`:** Ambient background offset ($+2$) + linear spatial drift ($0.0005$).
5. **`5_Blur`:** Optical lens defocus smoothing ($\alpha=0.15$) + noise ($\sigma=0.04$).
6. **`6_PerspectiveDistortion`:** 2D spatial perspective tilt ($0.0002$) + noise ($\sigma=0.04$).
7. **`7_SensorQuantization`:** 8-bit ADC quantization + exposure gain $0.99$.
8. **`8_CombinedDegradation`:** Combined gain $0.98$, ambient $+2$, noise $\sigma=0.05$, and perspective tilt $0.0001$.

### Payload Test Vectors
- **Binary:** `[0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00, 0xAA, 0x55]`
- **Utf8Text:** `"Visual OFDM Spatial Frequency Optical Transmission 2026."`
- **HighEntropyRandom:** 24 pseudorandom high-entropy bytes.

### 48-Scenario Stress Matrix Execution Results

| Modulation Scheme | 1_Clean | 2_LightNoise | 3_ExposureVariation | 4_AmbientDrift | 5_Blur | 6_PerspectiveDistortion | 7_SensorQuantization | 8_CombinedDegradation | Integrity Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **BPSK** (1 bit/carrier) | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 100% Bit-Perfect Match |
| **QPSK** (2 bits/carrier) | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass | 100% Bit-Perfect Match |

- **Total Scenarios Executed:** 48 stress matrix scenarios + 3 negative fault tests = **51 tests**
- **Pass Rate:** **51 / 51 (100%)**
- **Payload Integrity:** 100% SHA-256 exact match across all successful decodes.

---

## 8. Verification Gate Summary

| Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Typecheck** | `npm run typecheck` | **PASS (0 errors)** | Clean TypeScript compile across all modules |
| **Linter** | `npm run lint` | **PASS (0 warnings, 0 errors)** | oxlint across 84 files |
| **Full Unit Suite** | `npm test` | **PASS (156 / 156 tests)** | 100% unit and integration test pass rate |
| **OFDM Framing Tests** | `npx tsx --test src/transports/ofdm/ofdm-framing.test.ts` | **PASS (5 / 5 tests)** | Subcarrier mapping, BPSK/QPSK, CRC-16 |
| **OFDM Synthetic Tests** | `npx tsx --test src/transports/ofdm/ofdm-synthetic-channel.test.ts` | **PASS (51 / 51 tests)** | 48 stress scenarios + 3 fault checks |
| **Fountain Benchmark** | `npm run test:fountain` | **PASS (Exact Match)** | 51,200 bytes reconstructed with 0 bit errors |
| **Production Build** | `npm run build` | **PASS** | Vite production bundle built in ~450ms |

---

## 9. Capability Classification

| Tier | Capabilities Included |
| :--- | :--- |
| **Implemented** | • `VisualOfdmTransport` contract implementing `OpticalTransport`<br>• Binary OFDM framing (`0x56, 0x4F` magic, CRC-16-CCITT)<br>• 2D Subcarrier grid mapping (DC, Pilot, Data, Guard)<br>• BPSK and 4-level QPSK modulators and demodulators<br>• 2D Forward and Inverse DCT transform engine (`ofdm-fft.ts`)<br>• `estimateAndEqualizeChannel` pilot tracking and Zero-Forcing equalizer<br>• `OfdmSpectrumInspector` live 2D subcarrier grid and constellation instrument<br>• Console transport selection with fallback to QR baseline<br>• `ResearchDashboard` and `CompatibilityMatrix` OFDM research provenance |
| **Simulated / Automated** | • 48-scenario synthetic optical channel stress matrix (100% bit-perfect SHA-256 match)<br>• Negative fault rejection suite (sync failure, CRC corruption, truncation)<br>• Multi-point interruption and replay benchmark (20/20 scenarios pass)<br>• Fountain offline simulation benchmark (`fountain.test.ts`) |
| **Physically Tested** | • Screen-to-camera optical QR transmission with bit-perfect SHA-256 validation (Phase 1 baseline) |
| **Experimental / Not Tested** | • **Physical Visual OFDM screen-to-camera transmission**: Explicitly unverified in physical hardware. Synthetic channel tests do not constitute physical camera proof.<br>• **Physical VLC screen-to-camera transmission**: Unverified in hardware. |

---

## 10. Formal Physical Validation Statement

> [!IMPORTANT]
> **Visual OFDM physical screen-to-camera transmission has NOT been validated on real cameras or displays.**
>
> All Visual OFDM decoding results in Phase 4 are derived strictly from the mathematical **Synthetic Optical Channel Simulator** and offline test suites. Physical Visual OFDM capability remains explicitly designated as **EXPERIMENTAL / NOT PHYSICALLY TESTED** across all UI badges, telemetry instruments, and documentation.
