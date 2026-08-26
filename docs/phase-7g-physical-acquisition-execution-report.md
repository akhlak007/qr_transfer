# Phase 7G Evidence Report: Physical Hardware Acquisition Execution & Evidence Integrity Hardening

**Date:** 2026-08-23  
**Status:** Live Physical Acquisition Workbench & Integrity Hardening Operational (Milestone 7G Verified)  
**Real Physical Evidence Acquisition Tally:**
- **Physical VLC Runs Completed:** **0 / 12 qualifying runs**
- **Physical Visual OFDM Runs Completed:** **0 / 27 qualifying runs**
- **Total Qualifying Experimental Runs Completed:** **0 / 39 qualifying runs**
- **VLC Verification Status:** **EXPERIMENTAL / NOT TESTED**
- **Visual OFDM Verification Status:** **EXPERIMENTAL / NOT TESTED**
- **QR Streaming Reference Baseline:** **PHYSICALLY VERIFIED**

---

## 1. System Architecture & Acquisition Session Model

Phase 7G delivers an end-to-end real-hardware acquisition engine with cryptographic sealing and independence validation:

```
[ Operator Screen-to-Camera Workbench (LivePhysicalAcquisition.tsx) ]
                               │
                               ▼
           [ Hardware Readiness Gate (hardware-readiness.ts) ]
            (Camera stream, measured FPS, throw distance, lux)
                               │
                               ▼
        [ Physical Acquisition Session (physical-acquisition-session.ts) ]
         (Live MediaStream ImageData -> Demodulator -> CRC-16 -> SHA-256)
                               │
                               ▼
      [ Immutable Evidence Record & Seal (physical-evidence-record.ts) ]
           (Sealed with SHA-256 Checksum + Independence Verification)
                               │
                               ▼
    [ IndexedDB Research Repository ] ──► [ Master Manifest Export ]
```

---

## 2. Mandatory Pre-Flight Hardware Readiness Gates

Every physical acquisition attempt must pass 10 discrete pre-flight checks:

| Gate | Check | Passing Condition |
| :--- | :--- | :--- |
| **1. Camera Permission** | MediaDevices API | Granted by browser/user |
| **2. Active MediaStream** | Video stream | Live stream connected |
| **3. Camera Resolution** | Sensor dimension | $\ge 640\times 480$ measured |
| **4. Sensor Frame Rate** | Real FPS | $\text{FPS} > 0$ measured |
| **5. Transmitter Canvas** | Canvas element | Available and rendering |
| **6. Display Dimensions** | Screen resolution | Measured $> 0$ |
| **7. Optical Distance** | Throw distance | $d > 0\text{ cm}$ entered |
| **8. Ambient Illumination** | Photometer | $L \ge 0\text{ lux}$ entered |
| **9. Modulation & Payload** | Modulation + Hash | Loaded with 64-hex SHA-256 |
| **10. Evidence Mode** | Anti-Fabrication Lock | Explicitly enabled (simulations blocked) |

---

## 3. Real Camera Sensor Provenance Model

Every physical run encapsulates complete MediaStream sensor telemetry:
- Device ID & device label
- Sensor frame width and height
- Measured camera frame rate (FPS)
- Facing mode (`environment` / `user`)
- Captured frame count & dropped frame count
- Timestamp of frame acquisition

---

## 4. Cryptographic Evidence Sealing & Independence Validation

Each completed physical run produces an immutable [`PhysicalEvidenceRecord`](file:///e:/qr_transfer/src/research/physical-evidence-record.ts) sealed with a SHA-256 digest (`recordSealSha256`):

$$\text{SealHash} = \text{SHA-256}\Big(\text{RecordMetadata} \,\|\, \text{CameraProvenance} \,\|\, \text{PayloadDigest} \,\|\, \text{SealedTimestamp}\Big)$$

### Three-Run Independence Rules:
A target achieves `PHYSICALLY_VERIFIED` **if and only if**:
- $\ge 3$ independent physical records exist.
- All 3 records have unique `experimentId` and `sessionId` values.
- All 3 records have unique cryptographic seal digests and non-identical timestamps.
- Zero duplicate or replayed records are detected.
- All 3 records achieve bit-perfect SHA-256 matches and 0 CRC errors.

---

## 5. Systematic 14-Target Acquisition Matrix

| # | Protocol | Modulation / Grid | Required Runs | Qualifying Runs | Recorded Failures | Current Status |
| :-: | :--- | :--- | :---: | :-: | :-: | :--- |
| **0** | **QR Baseline** | 2D Binary Matrix | 3 | $\ge 20$ | 0 | **PHYSICALLY VERIFIED** |
| **1** | **VLC** | OOK | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **2** | **VLC** | 4-PAM | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **3** | **VLC** | CSK-8 | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **4** | **VLC** | CSK-16 | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **5** | **Visual OFDM** | BPSK ($8\times 8$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **6** | **Visual OFDM** | BPSK ($16\times 16$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **7** | **Visual OFDM** | BPSK ($32\times 32$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **8** | **Visual OFDM** | QPSK ($8\times 8$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **9** | **Visual OFDM** | QPSK ($16\times 16$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **10** | **Visual OFDM** | QPSK ($32\times 32$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **11** | **Visual OFDM** | 16-QAM ($8\times 8$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **12** | **Visual OFDM** | 16-QAM ($16\times 16$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **13** | **Visual OFDM** | 16-QAM ($32\times 32$) | 3 | 0 | 0 | **EXPERIMENTAL / NOT TESTED** |
| **Total** | — | — | **39 Required Runs** | **0 Qualifying Runs** | **0 Failures** | **0 / 39 Complete (0%)** |

---

## 6. Scientific Integrity & Anti-Fabrication Declaration

- [x] **No Fabricated Data:** Zero synthetic or mocked results have been inserted into the physical evidence ledger.
- [x] **Honest Baseline Reporting:** VLC (0 / 12) and Visual OFDM (0 / 27) remain accurately designated as `EXPERIMENTAL / NOT TESTED`.
- [x] **Strict Physical-Only Isolation:** Synthetic channel benchmarks are strictly blocked from the physical ledger and exports.
- [x] **Untouched Baseline:** `src/transports/qr/`, fountain mathematics, and IndexedDB storage remain 100% untouched.
