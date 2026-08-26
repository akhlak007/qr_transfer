# Phase 7F Evidence Report: Automated Physical Experiment Campaign Execution & Evidence Capture

**Date:** 2026-08-23  
**Status:** Automated Physical Campaign Execution Layer Operational (Milestone 7F Infrastructure Verified)  
**Current Physical Acquisition Campaign Status:**
- **Completed Qualifying Physical Runs:** **0 / 39 runs**
- **Recorded Physical Failures:** **0**
- **VLC Verification Status:** **EXPERIMENTAL / NOT TESTED (0 / 12 qualifying runs)**
- **Visual OFDM Verification Status:** **EXPERIMENTAL / NOT TESTED (0 / 27 qualifying runs)**
- **QR Reference Baseline:** **PHYSICALLY VERIFIED**

---

## 1. System Architecture

Phase 7F integrates an automated campaign orchestration layer over the physical screen-to-camera test bench:

```
[ Operator Campaign Dashboard (PhysicalCampaignDashboard.tsx) ]
                             │
                             ▼
     [ Campaign Controller (PhysicalCampaignController.ts) ]
                             │
   ┌─────────────────────────┼─────────────────────────┐
   ▼                         ▼                         ▼
[ Physical Workbench ]  [ Run Validator ]    [ Statistics Engine ]
(Screen-to-Camera Run) (physical-run-validator) (campaign-statistics)
   │                         │                         │
   ▼                         ▼                         ▼
[ IndexedDB Ledger ] ──► [ Manifests & Bundles ] ──► [ Archive & Export ]
```

---

## 2. Campaign State Machine & Lifecycle

The campaign engine operates on a 14-state deterministic finite state machine:

$$\text{IDLE} \longrightarrow \text{PREPARING} \longrightarrow \text{DEVICE\_CHECK} \longrightarrow \text{CALIBRATING} \longrightarrow \text{READY} \longrightarrow \text{RUNNING} \longrightarrow \text{CAPTURING} \longrightarrow \text{VALIDATING} \longrightarrow \text{RECORDING} \longrightarrow \text{TARGET\_COMPLETED} \longrightarrow \text{CAMPAIGN\_COMPLETED}$$

Auxiliary States:
- `PAUSED`: Temporarily halts execution for operator adjustments.
- `CANCELLED`: Aborts campaign and flushes unsaved transient state.
- `TARGET_FAILED`: Retains physical failure immutably and alerts operator.

---

## 3. The 39-Run Minimum Evidence Policy

The experimental campaign demands a minimum of **39 qualifying independent physical runs** across 13 target configurations:

1. **VLC Campaign (4 targets $\times$ 3 runs = 12 runs):**
   - OOK: 3 runs
   - 4-PAM: 3 runs
   - CSK-8: 3 runs
   - CSK-16: 3 runs
2. **Visual OFDM Campaign (9 targets $\times$ 3 runs = 27 runs):**
   - BPSK ($8\times 8$, $16\times 16$, $32\times 32$): 9 runs
   - QPSK ($8\times 8$, $16\times 16$, $32\times 32$): 9 runs
   - 16-QAM ($8\times 8$, $16\times 16$, $32\times 32$): 9 runs

A configuration is marked `PHYSICALLY_VERIFIED` **if and only if**:
- $\ge 3$ independent screen-to-camera test runs are executed.
- $\ge 3$ bit-perfect SHA-256 payload matches are achieved.
- Zero transmission/decode failures have occurred.

---

## 4. Centralized Physical Validation Rules

Every physical run is inspected by [`src/research/physical-run-validator.ts`](file:///e:/qr_transfer/src/research/physical-run-validator.ts):
- [x] `evidenceKind === "physical"` (strictly rejects simulated/mock runs).
- [x] Hardware transmitter and receiver metadata present.
- [x] Optical distance ($d > 0\text{ cm}$) and ambient lux ($L \ge 0\text{ lux}$) valid.
- [x] Measured camera sensor frame rate ($\text{FPS} > 0$) valid.
- [x] Exact CRC-16 pass ($\text{errorRate} === 0.0$).
- [x] Bit-perfect SHA-256 digest equality ($H_{\text{actual}} === H_{\text{expected}}$).
- [x] Transmission elapsed time ($T_{\text{elapsed}} > 0\text{ ms}$) valid.

---

## 5. Cryptographic Evidence Provenance & Archival

Each recorded physical run is linked to an immutable cryptographic evidence chain:
- **`TestRun` ID**: Globally unique run identifier.
- **`ExperimentManifest` Hash**: SHA-256 digest sealing hardware, environmental, and modulation metadata.
- **`ResearchDatasetBundle` Checksum**: Top-level SHA-256 checksum over the physical evidence package.
- **`ArchiveEntry`**: Versioned archival snapshot.
- **`Campaign Integrity SHA-256`**: Top-level campaign digest computed on JSON export.

---

## 6. Scientific Integrity & Anti-Fabrication Invariants

- [x] **Zero Synthetic Contamination:** Synthetic channel simulations and benchmarks are completely excluded from campaign statistics, progress calculations, and exports.
- [x] **No Placeholder Fabrication:** Empty datasets return 0, null, or `INSUFFICIENT_DATA`.
- [x] **Honest Baseline Reporting:** The campaign initial state accurately displays `0 / 39 qualifying physical runs` until live screen-to-camera experiments are conducted.
- [x] **Untouched Baseline:** `src/transports/qr/`, fountain mathematics, and IndexedDB storage remain 100% untouched.
