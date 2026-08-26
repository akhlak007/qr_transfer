# Phase 9.2 Updated Risk Assessment

Date: 2026-08-26

## Blocker

None found after remediation and regression verification.

## Important Risk

None open within the Phase 9.2 software-release scope.

The review initially found that App still allowed service-rejected frames into a legacy reconstruction mirror. This was corrected by making the shared service decision authoritative and removing pre-metadata fountain synthesis. The same review identified configuration divergence, shallow result exposure, SHA-mismatch state, and incomplete transfer identity; each was corrected and covered by regression tests.

## Technical Debt

1. App retains persistence/recovery adapter state for durable checkpoints. It is downstream of authoritative service acceptance, but a later cleanup could extract this adapter from the component.
2. One pre-existing lint warning remains in `src/research/benchmark-engine.ts` for an unused `_err` catch parameter.
3. The production bundle remains above Vite's 500 kB advisory threshold; this is a performance optimization item, not a correctness defect.
4. Lifecycle tests use deterministic dependency fakes. Browser/device validation remains separate from software readiness.
5. Physical optical performance is unverified and must not be inferred from the software optical channel.

## Controls

- Protocol-specific policy permits QR CRC `not-applicable` but requires `valid` CRC for VLC/OFDM.
- Stale evidence generations cannot replace newer dashboard evidence.
- Configuration changes are disabled during reception/finalization and rejected by the controller while locked.
- Late camera acquisitions are stopped instead of attached.
- Duplicate terminal frames cannot start a second SHA-256 operation.
- Failed integrity verification cannot enter the `complete` finalization state.
