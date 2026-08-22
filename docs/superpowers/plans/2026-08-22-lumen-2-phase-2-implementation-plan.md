# Lumen 2.0 Phase 2 Implementation Plan

**Phase:** Persistence, Session, Resume, and Research Foundation  
**Date:** 2026-08-22  
**Design authority:** `docs/superpowers/specs/2026-08-22-lumen-2-optical-platform-design.md`  
**Baseline:** Phase 1 commit `a45a862`

## 1. Scope and Evidence Labels

Phase 2 adds storage and research infrastructure around the verified QR baseline. It does not implement VLC modulation or Visual OFDM signaling. Their descriptors remain unavailable placeholders labeled `Screen-to-Camera VLC (Experimental)` and `Visual OFDM (Research Prototype)`.

Capabilities will be reported in three separate groups:

- **Implemented:** behavior present in production code and covered by automated verification.
- **Simulated:** behavior exercised with generated or synthetic data without a physical optical path.
- **Physically tested:** behavior observed on recorded screen/camera device runs with matching SHA-256.

No simulated result may set a compatibility record to `Verified`.

## 2. Recommended Approach

Use a versioned IndexedDB repository behind storage interfaces. Persist session metadata, accepted fountain symbols, reconstructed source chunks, checkpoints, and research runs in separate stores. Restore fountain decoding by replaying persisted accepted symbols instead of serializing private decoder internals.

This approach is preferred over:

1. **Serializing the decoder object:** tightly couples stored data to private class internals and makes migrations fragile.
2. **Persisting only resolved blocks:** insufficient for peeling-decoder progress because unresolved equations may later unlock blocks.
3. **Persisting every camera observation payload:** consumes storage without improving recovery; metrics can be aggregated while only accepted symbols are retained.

Phase 2 introduces streaming-friendly source/sink contracts but retains the Phase 1 in-memory fountain encoder/decoder adapters. Therefore it establishes the migration path without claiming bounded-memory multi-gigabyte transmission.

## 3. Files Modified

- `src/App.tsx`
  - Adopt the session controller and repositories incrementally.
  - Add navigation to Research and Test Protocol pages.
  - Offer restoration only when a compatible recoverable session exists.
  - Preserve the current QR sender/receiver path as fallback.
- `src/core/transfer-session.ts`
  - Expand the Phase 1 model with schema version, source identity, checkpoints, capabilities, failure reason, and resume status.
- `src/core/integrity.ts`
  - Accept `FileSource` input boundaries while retaining the current `Uint8Array` helpers.
- `src/modules/chunker.ts`
  - Add adapter helpers that read individual blocks from `FileSource`; retain `chunkFile` and `reassembleFile` unchanged.
- `src/modules/fountain.ts`
  - Add read-only progress export needed for checkpoints; do not replace the LT algorithm.
- `src/components/TransferStatistics.tsx`
  - Display persistence/checkpoint status separately from transfer completion.
- `src/index.css`
  - Style session restore, storage capability, research, and test-protocol views.
- `src/core/transport.ts`
  - Keep QR available and experimental transports unavailable.
- `package.json`
  - Include new storage, session, research, and integration tests.
- `README.md`
  - Document implemented resume limits and evidence categories.

No Phase 2 change alters legacy QR wire-frame bytes in `src/modules/protocol.ts`. If a derived legacy session identifier helper is added there, existing encode/decode functions remain byte-for-byte unchanged.

## 4. New Files and Modules

```text
src/core/
  file-source.ts
  chunk-source.ts
  chunk-sink.ts
  session-controller.ts
  resume-policy.ts

src/storage/
  database.ts
  schema.ts
  session-repository.ts
  chunk-repository.ts
  symbol-repository.ts
  checkpoint-repository.ts
  research-repository.ts
  storage-capabilities.ts
  memory-repositories.ts

src/research/
  test-run.ts
  test-protocol.ts
  research-aggregation.ts
  evidence-status.ts

src/compatibility/
  compatibility-record.ts
  compatibility-validation.ts

src/pages/
  ResearchDashboardPage.tsx
  TestProtocolPage.tsx
  SessionsPage.tsx

src/components/
  StorageStatus.tsx
  ResumeSessionCard.tsx
  EvidenceBadge.tsx
  ResearchComparisonTable.tsx
  CompatibilityMatrix.tsx

src/storage/*.test.ts
src/core/*source.test.ts
src/core/session-controller.test.ts
src/research/*.test.ts
src/compatibility/*.test.ts
```

Tests may use a small development-only IndexedDB implementation if Node's runtime lacks IndexedDB. Browser production code will use only the standard IndexedDB API.

## 5. IndexedDB Schema

### 5.1 Database

- Name: `lumen-optical-platform`
- Version: `1`
- Upgrade ownership: `src/storage/database.ts`
- All writes use explicit transactions; repository methods resolve only after transaction completion.

### 5.2 Object stores

#### `sessions`

- Key path: `transferId`
- Indexes:
  - `by-status` on `status`
  - `by-direction` on `direction`
  - `by-updated-at` on `updatedAt`
  - `by-transport` on `transport`
  - `by-file-hash` on `fileHashHex`
- Value: `PersistedTransferSession`

#### `symbols`

- Key path: compound `[transferId, symbolKey]`
- Indexes:
  - `by-transfer` on `transferId`
  - `by-transfer-order` on `[transferId, acceptedOrder]`
- Value: accepted fountain symbol seed, degree, payload `ArrayBuffer`, accepted order, and received timestamp.
- `symbolKey` is a deterministic seed/degree/payload-checksum identity. Repeated camera decodes are idempotent and do not create duplicate records.

#### `chunks`

- Key path: compound `[transferId, chunkIndex]`
- Index: `by-transfer` on `transferId`
- Value: exact source-chunk bytes as `ArrayBuffer`, logical byte length, block size, persistence timestamp, and optional chunk checksum.

#### `checkpoints`

- Key path: `transferId`
- Value: checkpoint schema version, accepted-symbol count, resolved-block indices, persisted-chunk count, metrics snapshot, and timestamp.
- A checkpoint references durable symbol/chunk records; it does not embed their byte payloads.

#### `testRuns`

- Key path: `runId`
- Indexes:
  - `by-completed-at`
  - `by-transport`
  - `by-evidence-kind`
  - `by-device-direction`
  - `by-integrity-status`
- Value: immutable completed test record. Draft protocols are stored with `status: "draft"` and are excluded from measured aggregates.

### 5.3 Deletion and retention

- Deleting a session removes its symbols, chunks, and checkpoint in one logical repository operation using bounded per-store cursor transactions.
- Completed session cleanup is user initiated in Phase 2.
- Research records are not deleted automatically.
- Database reset is explicit and reports exactly what will be removed.

## 6. Session Data Model

```ts
interface PersistedTransferSession {
  schemaVersion: 1;
  transferId: string;
  protocolVersion: number;
  direction: "send" | "receive";
  transport: "qr" | "vlc" | "visual-ofdm";
  status: "preparing" | "ready" | "active" | "paused" |
          "recoverable" | "complete" | "failed" | "cancelled";
  resumeCapability: "none" | "restart-sender" | "replay-receiver" | "complete";
  fileName: string;
  fileSize: number;
  mimeType: string;
  mediaKind: "image" | "audio" | "video" | "other";
  fileHashHex: string | null;
  blockSize: number;
  totalBlocks: number;
  encodingMode: "fountain" | "sequential";
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  checkpointVersion: number;
  acceptedSymbols: number;
  resolvedBlocks: number;
  failureCode: string | null;
  transportConfig: Record<string, unknown>;
}
```

Rules:

- QR is the only transport allowed to become active in Phase 2.
- A receiver session is not marked recoverable until metadata establishes exact file identity and at least one accepted symbol is durable.
- A sender's browser `File` handle is not assumed to survive refresh. Resume means reselecting the original file, validating identity, and restarting the rateless QR stream.
- Session metrics are snapshots; immutable research results are created only through explicit test-run completion.

## 7. Chunk Persistence Strategy

### 7.1 Sender

- `BrowserFileSource` reads blocks with `Blob.slice(start, end).arrayBuffer()`.
- `MemoryFileSource` supports text and the unchanged Phase 1 buffer path.
- Phase 2 does not persist the full sender file automatically.
- Sender settings/session identity are persisted; after refresh the user reselects the file.
- Reselection validation compares size and name immediately, then SHA-256 when available. Transmission cannot resume on mismatch.

### 7.2 Receiver

- Accepted non-redundant fountain symbols are persisted idempotently.
- Newly resolved source blocks are written to `chunks` when the decoder exposes them.
- Writes are queued and committed in bounded batches, initially 16 records or 250 ms, whichever occurs first.
- UI progress may lead the durable checkpoint briefly; the storage status shows `Saving`, `Saved`, or `Storage error`.
- Completion requires flushing the write queue before a session becomes `complete`.
- Reassembly reads chunks in ascending index order. Phase 2 may still build the final downloadable Blob in memory; the limitation is documented.

### 7.3 Quota behavior

- Call `navigator.storage.estimate()` when available.
- Warn before transfer when the estimated required storage exceeds available quota.
- Treat estimates as advisory, not guarantees.
- On quota failure, preserve the live in-memory QR session when possible, mark resume unavailable, and display the error.

## 8. Streaming Architecture

```ts
interface FileSource {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  read(offset: number, length: number): Promise<Uint8Array>;
  stream(): ReadableStream<Uint8Array>;
}

interface ChunkSource {
  readonly blockSize: number;
  readonly totalBlocks: number;
  readBlock(index: number): Promise<Uint8Array>;
}

interface ChunkSink {
  writeBlock(index: number, bytes: Uint8Array, logicalLength: number): Promise<void>;
  readBlock(index: number): Promise<Uint8Array | null>;
  flush(): Promise<void>;
}
```

Adapters:

- `BrowserFileSource`: lazy reads from a selected `File`.
- `MemoryFileSource`: Phase 1 compatibility and messages.
- `FileChunkSource`: pads only the returned fountain block, not the stored original source.
- `IndexedDbChunkSink`: durable receiver chunks.
- `MemoryChunkSink`: fallback and automated tests.

The existing `FountainEncoder` still accepts `Uint8Array[]`. Phase 2 introduces the source contract and exercises it independently but does not claim the encoder is streaming. A future encoder design may maintain a bounded block window or use another erasure-code layout; that requires its own measured migration.

SHA-256 remains whole-buffer for the active QR path in Phase 2. The abstraction allows a future progressive implementation, but the UI must not label hashing as streaming yet.

## 9. Resume and Recovery Design

### 9.1 Legacy session identity

Legacy QR frames have no transfer ID. After receiving a valid metadata frame, derive a stable local identifier from:

```text
SHA-256("legacy-qr" || fileHash || fileSize || blockSize || totalBlocks || fileName)
```

No frame received before metadata is persisted, because its transfer identity and exact file size are unknown. Phase 2 does not alter legacy frame bytes.

### 9.2 Receiver recovery

1. Load recoverable session and checkpoint.
2. Read accepted symbols by `acceptedOrder`.
3. Create a fresh `FountainDecoder` from metadata.
4. Replay stored symbols to reconstruct peeling state.
5. Confirm replayed resolved count is consistent with the checkpoint.
6. Resume camera scanning and append newly accepted symbols.
7. If replay is corrupt or incompatible, leave stored data intact and offer restart/delete actions.

Replay is simulated and automatically tested in Phase 2. It is not reported as physically validated until an actual interrupted screen-to-camera transfer is restored on a target browser.

### 9.3 Sender restart

1. Restore settings and expected file identity.
2. Ask the user to reselect the source file.
3. Validate name/size, then SHA-256.
4. Recreate chunks and fountain encoder.
5. Start a new rateless symbol stream for the same local session.

Exact sender symbol continuation is unnecessary for LT coding. Sender counters restart as a new transmission attempt while the session retains cumulative attempt history.

### 9.4 Checkpoint policy

- Save aggregated session/checkpoint state after 16 newly accepted symbols or 1 second.
- Flush immediately on pause, visibility change, camera stop, completion, and `pagehide` where the browser permits.
- Do not promise that asynchronous IndexedDB work completes during forced browser termination.

## 10. Research and Test Protocol Pages

### 10.1 Test Protocol page

Captures:

- Evidence kind: `simulated` or `physical`.
- Sender/receiver device, OS, browser, and versions.
- Direction: Android to Android, Android to iPhone, iPhone to Android, iPhone to iPhone, desktop combinations.
- File identity, type, size, and SHA-256 result.
- QR transport parameters; VLC/OFDM remain disabled placeholders.
- Distance, room lighting, orientation, user-recorded screen brightness, camera FPS, achieved sender screen FPS, and signal-quality availability.
- Frame statistics, elapsed time, throughput, recovery overhead, permission outcome, download outcome, notes, and evidence references.

Draft records may be incomplete. Completing a physical run requires device fields, environment, metrics, transfer completion, and matching SHA-256 to receive `verified`; failed physical runs are retained as measured failures.

### 10.2 Research Dashboard

- Reads only completed `testRuns`.
- Displays QR, VLC, and Visual OFDM columns.
- VLC and OFDM cells show `Not tested` unless qualifying records exist in future phases.
- Separates simulated and physical filters and shows sample count.
- Does not combine incompatible environments into a single best result without showing filters.
- Maximum tested file size and compatibility use physical SHA-256-verified records only.

### 10.3 Compatibility matrix

Directional records are authoritative. `Android ↔ iPhone` is a grouped presentation over two independently stored directions; one direction never verifies the reverse.

## 11. Migration and Backward Compatibility

- IndexedDB schema begins at version 1; all records carry their own schema version for future migrations.
- Opening or upgrading the database is the only place object stores/indexes are changed.
- A failed upgrade closes the database and falls back to the in-memory Phase 1 path with persistence disabled.
- Phase 1 has no IndexedDB data, so no legacy storage migration is required.
- Existing QR metadata, sequential, and fountain encoding/decoding remain unchanged.
- Persistence is additive: QR send/receive can operate when IndexedDB is unavailable, blocked, private-mode-limited, or quota-exhausted.
- Experimental transport descriptors remain present but unavailable; no VLC/OFDM frame formats are introduced.
- Database migrations never delete unknown/newer-version data automatically. A newer unsupported schema produces an actionable incompatibility message.

## 12. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| IndexedDB transaction closes across an awaited gap | Keep transaction-scoped operations synchronous and await transaction completion outside request creation. |
| Write load lowers QR decode rate | Batch accepted records, measure task time, and keep camera processing independent from React state. |
| Replay becomes slow with many symbols | Show replay progress, order by accepted index, and record replay duration; optimize only from measurements. |
| Storage contains decoder-incompatible records | Version every record and validate metadata/payload lengths before replay. |
| Browser quota or private mode blocks persistence | Capability detection and memory fallback; no resume claim. |
| Old and new QR devices stop interoperating | Do not change Phase 1 wire frames. |
| File re-selection differs from original | Validate identity before sender restart. |
| Research dashboard implies compatibility | Require physical evidence and matching SHA-256 for verification. |
| Page termination loses recent records | Bounded batches and lifecycle flush attempts; document that forced termination may lose the final unsaved batch. |

## 13. Implementation Milestones

### 2A. Pure contracts and in-memory repositories

- Add file/chunk source and sink contracts.
- Add expanded session, resume policy, research, compatibility, and evidence models.
- Add memory repositories used by tests and as runtime fallback.
- Verify Phase 1 QR tests/build before and after.

### 2B. IndexedDB schema and repositories

- Create database upgrade/open/close handling.
- Implement session, symbol, chunk, checkpoint, and research repositories.
- Add capability/quota reporting and transactional deletion.
- Test schema creation, idempotent writes, ordering, isolation, quota/error paths, and upgrade failure fallback.

### 2C. QR session integration

- Create sessions after file preparation or valid receiver metadata.
- Persist accepted fountain symbols and resolved chunks through a bounded queue.
- Flush at lifecycle and completion boundaries.
- Keep the existing memory path operational when persistence is unavailable.
- Run QR regression, build, lint, and tests.

### 2D. Resume/recovery foundation

- List recoverable sessions.
- Implement receiver symbol replay and consistency checks.
- Implement sender re-selection validation and rateless restart.
- Mark exact capability status in the UI.
- Test refresh/repository reconstruction in simulation; do not claim physical resume.

### 2E. Research and compatibility UI

- Add Sessions, Test Protocol, and Research Dashboard pages.
- Store drafts and immutable completed runs.
- Add evidence badges, measured-only aggregation, and directional compatibility matrix.
- Keep VLC and Visual OFDM placeholders disabled and `Not tested`.

### 2F. Phase verification and evidence report

- Run all automated gates.
- Run IndexedDB simulated interruption/replay benchmark.
- Attempt local browser visual QA and screenshots when a browser backend is available.
- Report implemented, simulated, and physically tested capabilities separately.
- Do not begin Phase 3 before review.

## 14. Test Plan

### Unit tests

- File-source range reads, last-block padding, and arbitrary binary equality.
- Session validation, state transitions, legacy ID derivation, and resume eligibility.
- Research evidence validation and measured-only aggregation.
- Directional compatibility rules.
- Batch queue behavior and failure propagation.

### IndexedDB repository tests

- Version 1 store/index creation.
- Session create/read/update/list/delete.
- Compound chunk and symbol keys.
- Idempotent duplicate-symbol writes.
- Ordered symbol replay.
- Cross-session isolation.
- Checkpoint replacement.
- Cascading logical session deletion.
- Completed/draft research filtering.
- Unsupported/corrupt record rejection.

### Integration tests

- Persist accepted fountain symbols, create a new decoder, replay, continue, and reconstruct exact bytes.
- Persist and retrieve non-block-aligned final chunks without padding corruption.
- Reopen a database and recover a session model.
- IndexedDB-disabled memory fallback preserves QR operation.
- Sender file re-selection rejects name/size/hash mismatch.
- Dashboard excludes drafts, simulations from physical compatibility, and unverified hashes from maximum-tested-size calculations.

### Regression gates after each milestone

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Deterministic Phase 1 fountain benchmark and SHA-256 match.
- Source review confirming no legacy protocol-frame changes.

### Manual/browser tests

- IndexedDB persistence across refresh.
- Storage denied/unavailable fallback.
- Quota warning/error presentation.
- Session delete/reset.
- Research draft/completion workflow.
- Responsive pages and accurate `Not tested` states.

These are recorded as local browser checks, not physical optical validation.

## 15. Acceptance Criteria

- QR remains the only available transmission transport and its Phase 1 protocol remains unchanged.
- The application functions through the in-memory fallback when IndexedDB is unavailable.
- Version 1 IndexedDB stores and indexes are created exactly as documented.
- Sessions, accepted fountain symbols, chunks, checkpoints, and test runs are isolated by stable identifiers.
- Accepted symbols can be replayed into a fresh decoder and complete byte-exact reconstruction in an automated interruption simulation.
- Chunk reads/writes preserve the exact logical length of the final block.
- Sender recovery requires file re-selection and rejects mismatched identity.
- UI distinguishes saving, durable checkpoint, recoverable, complete, failed, and non-resumable states.
- Research Dashboard aggregates only completed measured records and exposes evidence kind/sample count.
- Compatibility verification requires a physical directional run with matching SHA-256.
- VLC remains Experimental and unavailable; Visual OFDM remains `Visual OFDM (Research Prototype)` and unavailable.
- No large-file, resume, performance, or device-compatibility claim appears without appropriate evidence.
- Unit, storage, integration, typecheck, lint, build, and QR regression gates pass.
- Phase 2 report separates implemented, simulated, and physically tested capabilities.

## 16. Expected Deliverables

- IndexedDB and memory repository implementations.
- Versioned transfer-session and checkpoint lifecycle.
- Durable accepted-symbol and decoded-chunk storage.
- Streaming-friendly file/chunk source and sink abstractions.
- Simulated receiver interruption/replay recovery.
- Sender re-selection/restart foundation.
- Sessions, Test Protocol, Research Dashboard, and compatibility views.
- Measured-only research aggregation.
- Phase 2 test/benchmark evidence and capability-status report.

Phase 3 VLC work is explicitly outside this plan.
