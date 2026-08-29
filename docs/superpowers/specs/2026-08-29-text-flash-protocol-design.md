# TEXT_FLASH_PROTOCOL Design

Date: 2026-08-29  
Status: approved for implementation planning  
Scope: isolated demo/workbench short-text optical transport

Approved addendum (2026-08-29): receiver-side integrity without protocol CRC; expanded diagnostics; stall UI must never look like success; phone-camera robustness (adaptive threshold, temporal stability, duplicate-frame tolerance, reacquisition after missed *camera* frames). Visual encoding unchanged.

## 1. Objective

Provide a **separate experimental transport** that reliably sends short UTF-8 text through a normal phone camera for demonstration and physical workbench validation.

This transport deliberately abandons VLC OOK timing, Manchester, Barker, OFDM, fountain coding, and existing protocol envelopes. It optimizes for:

1. Reliability under phone-camera exposure and FPS jitter  
2. Simplicity  
3. Real phone-camera success for messages such as `HELLO`, `TEST`, `12345`, `STATUS OK`

It is **not** a replacement for VLC, QR, or Visual OFDM.

## 2. Non-goals / hard isolation

**Do not modify:**

- QR transport behavior or wire format  
- VLC OOK / Manchester / Barker / physical VLC receiver  
- Visual OFDM modulator, demodulator, framing, or renderer  
- Fountain coding  
- Existing application protocol framing (`Metadata` / `Sequential` / `Fountain` / `CompactMessage`)  
- Existing SHA-256 / CRC verification systems used by file transfer  

**Do not:**

- Add `TEXT_FLASH_PROTOCOL` to the main file-transfer transport selector  
- Count Text Flash runs as VLC or OFDM physical validation evidence  
- Feed Text Flash results into `aggregatePhysicalEvidence` for VLC/OFDM matrices  
- Share framing, modulators, or receivers with VLC/OFDM modules  

## 3. Product surface (approved)

**Option A — Demo-only + Physical Workbench**

| Surface | Behavior |
| --- | --- |
| Main send/receive mode selector | Unchanged; Text Flash absent |
| Dedicated demo UI | Send short text / receive with live progress |
| Physical Experiment Workbench | New target `TEXT_FLASH_PROTOCOL` |
| Research evidence | Separate Text Flash evidence kind; never mixed into VLC/OFDM success matrices |

## 4. Visual encoding (approved)

**Option A — 4×2 bit card**

Each **DATA** frame paints **8 large black/white cells** in a 4×2 grid. Cell luminance encodes one UTF-8 byte (MSB first, row-major).

```text
Bit layout (row-major, MSB = bit 7):

  [7] [6] [5] [4]
  [3] [2] [1] [0]

White cell = 1, Black cell = 0
```

**START** and **END** are distinct **full-screen control patterns**, not bit cards.

Default dwell: **750 ms** per frame (configurable, suggested range 500–1000 ms).

## 5. Frame format

### 5.1 Logical sequence

```text
Frame 0:     START
Frame 1:     LENGTH  (1 byte = UTF-8 byte count, 0–64)
Frame 2..N:  DATA    (one UTF-8 byte per frame)
Last frame:  END
```

Empty message: `START → LENGTH(0) → END` (3 frames).

### 5.2 Length limit

Maximum UTF-8 **byte** length: **64**.

Rationale: demo messages only; at 750 ms/frame, 64 data bytes + START + LENGTH + END ≈ 50 s — still usable for demos, long enough for `STATUS OK` and short phrases. Reject longer input at the transmitter boundary with a clear error.

### 5.3 Control patterns

All patterns fill the **central 80%** of the canvas (margin for phone framing). Outside margin is mid-gray (`#808080`) so the receiver can find the active region by contrast.

| Kind | Pattern | Purpose |
| --- | --- | --- |
| `START` | Full white active region, **one black horizontal bar** across the vertical center (bar height = 12% of active height) | Message begin |
| `LENGTH` | Same 4×2 bit card as DATA; byte value = UTF-8 length | Payload size |
| `DATA` | 4×2 bit card; one payload byte | Character bytes |
| `END` | Full black active region, **one white horizontal bar** across the vertical center (bar height = 12% of active height) | Message end |
| `IDLE` | Solid mid-gray full canvas | Between sessions / waiting |

START and END are photographic inverses of each other so a single thresholded region classifier can distinguish them from bit cards (bit cards always have a 4×2 cell structure; control frames do not).

### 5.4 Bit-card geometry

Within the active region:

- 2 rows × 4 columns of equal cells  
- 4% inner gap between cells (black gap always) so adjacent same-color bits remain separable  
- Each cell fills its slot; no text overlays, logos, or HUD chrome on the transmit canvas

### 5.5 No CRC / no Manchester / no Barker

No protocol CRC in v1. Integrity is **receiver-side**:

- Reject malformed START / END / BITCARD patterns (failed geometric or margin checks).
- Accept LENGTH only if `0 <= length <= 64`; refuse DATA until LENGTH is accepted.
- Track expected byte index `0 .. length-1`; reject unexpected frame kinds; treat repeated identical BITCARD while still on the same index as **duplicate** (ignore; do not advance progress).
- Progress advances only when a **new valid** byte is accepted at the expected index.
- `COMPLETE` / 100% / SUCCESS only after END and `receivedBytes.length === declaredLength`.
- Workbench SUCCESS additionally requires reconstructed UTF-8 **byte-identical** to the known transmitted payload.
- Open demo receive (no expected payload): COMPLETE after END + length match; operator verifies text visually.

A completely skipped transmitter DATA dwell cannot be repaired without changing the visual encoding; “reacquisition” means resyncing to the **current** on-screen frame after camera drops / UNKNOWN bursts, not inventing missing payload bytes.

## 6. Transmitter

### 6.1 Pipeline

```text
text (JS string)
  → TextEncoder UTF-8 bytes (reject if length > 64)
  → frame list: [START, LENGTH, ...DATA bytes..., END]
  → for each frame: paint canvas, dwell `frameMs`, then next
  → IDLE after END (or on cancel)
```

### 6.2 Transmitter state machine

```text
IDLE
  → start(text) → PREPARING
PREPARING
  → frames built → TRANSMITTING
TRANSMITTING
  → all frames shown → COMPLETE
  → cancel/error → FAILED
COMPLETE | FAILED
  → reset → IDLE
```

While `TRANSMITTING`, expose:

- `frameIndex` / `frameCount`  
- `phase`: `start` | `length` | `data` | `end`  
- `elapsedMs`  
- current painted kind  

Sender progress is **display progress only** (one-way link). It must not claim remote delivery.

### 6.3 Configuration

```ts
interface TextFlashTxConfig {
  frameMs: number;      // default 750; clamp 500..2000
  maxBytes: number;     // fixed 64 in v1
  activeRegionRatio: number; // default 0.8
}
```

## 7. Receiver

### 7.1 Responsibilities (`TextFlashReceiver`)

- Sample camera frames (or synthetic luminance grids in tests)  
- Locate active region  
- Classify each sample as optical `START` | `END` | `BITCARD` | `UNKNOWN` | `IDLE` (LENGTH/DATA assigned by receiver phase)
- Detect frame boundaries via dwell / change detection  
- Reconstruct UTF-8 text  
- Emit live progress, partial text, signal quality, and diagnostics  

### 7.2 Receiver status (operator-facing)

State-machine status (mutually exclusive):

```ts
type TextFlashStatus =
  | "WAITING_FOR_START"  // UI label: WAITING
  | "DETECTING"          // high-contrast structure seen; START not yet committed
  | "RECEIVING"          // after START; collecting LENGTH/DATA/END
  | "COMPLETE"           // END accepted and length satisfied
  | "FAILED";
```

**STABLE** is not a separate machine state. It is a boolean overlay `isStable` set only when `status === "RECEIVING"` **and** the last `K` samples (K=3) agree **and** a commit candidate is actively confirming (not idle between frames).

When `status === "RECEIVING"` but no new symbol is committing (inter-frame gap / stall), UI must show **RECEIVING — WAITING FOR NEXT FRAME**, never STABLE, never COMPLETE, never SUCCESS.

**Invariant:** never transition to `COMPLETE` until an `END` frame is accepted and `receivedBytes.length === declaredLength`. Never present STABLE/RECEIVING as successful completion.
### 7.3 Receiver state machine

```text
WAITING_FOR_START
  → START accepted → RECEIVING (expect LENGTH)
  → ambiguous high-contrast noise → DETECTING → back to WAITING_FOR_START on timeout

RECEIVING (sub-phase: need_length)
  → LENGTH accepted → RECEIVING (need_data or need_end if length=0)
  → timeout / desync → FAILED

RECEIVING (sub-phase: need_data)
  → DATA byte accepted → append; if count==length → expect END
  → unexpected END → FAILED
  → timeout → FAILED

RECEIVING (sub-phase: need_end)
  → END accepted → COMPLETE
  → unexpected DATA → FAILED
  → timeout → FAILED

Any RECEIVING/DETECTING
  → explicit abort or unrecoverable classify storm → FAILED

COMPLETE | FAILED
  → reset() → WAITING_FOR_START
```

### 7.4 Synchronization strategy

No chip clock. Sync is **symbol dwell + change detection**:

1. **Region find:** each camera frame, find the largest near-square high-contrast rectangle in the center crop (or use fixed center 80% in software loopback).  
2. **Classify (optical layer only):**  
   - If region mean near white and a dark horizontal band near mid-height → `START`  
   - If region mean near black and a bright horizontal band near mid-height → `END`  
   - Else sample 4×2 cell centers; if each cell is clearly dark or light (margin from adaptive threshold) → `BITCARD` with byte value  
   - Else → `UNKNOWN`  
   LENGTH vs DATA is **not** visually distinct: the receiver maps a committed `BITCARD` to LENGTH or DATA from its sub-phase (`need_length` vs `need_data`).  
3. **Hold-off / commit:** a new logical frame is accepted only when the same classification persists for `commitMs` (default `max(200, frameMs * 0.35)`), after a preceding `change` from the previous committed symbol.  
4. **Inter-frame gap:** after commit, ignore further identical samples until a **different** classification persists for `commitMs` (handles long dwell and FPS jitter).  
5. **FPS jitter:** wall-clock commit windows, not frame-count windows.  
6. **Exposure:** per-frame adaptive threshold = midpoint between the 10th and 90th percentile luminance inside the active region (not a global fixed 128).  

### 7.5 Partial progress and partial text

While `RECEIVING` after LENGTH:

| Metric | Definition |
| --- | --- |
| Progress % | Before LENGTH: `0`. After LENGTH and before COMPLETE: `min(99, round(100 * receivedBytes.length / max(declaredLength, 1)))` so a full DATA set never shows 100% before END. On COMPLETE: `100`. Empty message stays `0` until END then `100`. |
| Bytes/characters received | `receivedBytes.length / declaredLength` (diagnostics label “bytes”; ASCII demos may show “Characters received: a/b”) |
| Current text | Longest **valid UTF-8 prefix** of `receivedBytes` (complete codepoints only) |

**Safety rule:** never display replacement characters for truncated multi-byte sequences. Hold trailing incomplete UTF-8 bytes invisible until the codepoint completes or END/fail clears them.

Example for `HELLO` (5 bytes): 0% → (LENGTH) 0% → 20% → 40% → 60% → 80% → 99% (all five DATA bytes, awaiting END) → 100% on END; live text `H`, `HE`, `HEL`, `HELL`, `HELLO`.
### 7.6 Signal quality

```ts
type TextFlashSignalQuality = "GOOD" | "FAIR" | "POOR";
```

Derived from recent window (e.g. last 30 camera frames):

- **GOOD:** region found ≥ 90%, cell margin ≥ 40 luminance points, commit accept rate ≥ 80%  
- **FAIR:** region found ≥ 70%, margin ≥ 25, accept rate ≥ 50%  
- **POOR:** otherwise  

### 7.7 Diagnostics (required)

```ts
interface TextFlashDiagnostics {
  cameraFps: number;
  startDetected: boolean;
  lengthDetected: boolean;
  endDetected: boolean;
  dataByteIndex: number | null; // next expected DATA index, or null before LENGTH
  bytesReceived: number;
  declaredLength: number | null;
  progressPercent: number;      // 0..99 until COMPLETE, then 100
  duplicateFrames: number;      // identical symbol re-seen while awaiting change
  invalidFrames: number;        // malformed classify / unexpected kind
  missedFrames: number;         // camera starvation / large timestamp gaps
  detectedSymbols: number;      // committed logical frames
  syncState: TextFlashStatus;
  isStable: boolean;
  awaitingNextFrame: boolean;   // RECEIVING inter-frame stall
  signalQuality: TextFlashSignalQuality;
  partialText: string;
  finalText: string | null;     // set on COMPLETE (or FAILED attempt snapshot)
  finalStatus: TextFlashStatus; // mirrors syncState at terminal; else current
  lastError?: string;
}
```

### 7.8 Error recovery

| Condition | Action |
| --- | --- |
| START seen twice before LENGTH | Reset buffer; treat as new message |
| LENGTH > 64 | `FAILED` (`invalid_length`) |
| DATA after declared length exhausted, before END | `FAILED` (`overflow`) |
| END before enough DATA | `FAILED` (`unexpected_end`) |
| No commit for `timeoutMs` (default `frameMs * 8`) while RECEIVING | `FAILED` (`timeout`) |
| Bit margin failure | Count `decodingErrors`; do not commit; stay RECEIVING |
| After FAILED/COMPLETE | Operator must `reset()`; auto-return to WAITING after showing terminal state |

No mid-message retransmission protocol in v1. Failed runs are restarted from START by the sender.

## 8. Validation success criteria

Workbench / physical validation for target `TEXT_FLASH_PROTOCOL` succeeds iff:

1. START detected  
2. LENGTH detected  
3. All declared DATA bytes recovered  
4. END detected  
5. Recovered text **exactly equals** transmitted text (UTF-8 byte-identical)

Failure otherwise (`FAILED` with reason). Do not mark success on LENGTH+DATA alone.

## 9. Evidence isolation

- Text Flash experiment records use a **distinct transport id string** `text-flash` that is **not** a `TransportId` union member used by the main app selector.  
- Prefer a parallel type, e.g. `DemoTransportId = "text-flash"`, rather than extending `TransportId`, to avoid accidental inclusion in QR/VLC/OFDM matrices.  
- Persistence: optional demo/workbench log separate from authoritative VLC/OFDM physical matrices, **or** tagged so exporters for VLC/OFDM **filter it out**.  
- `aggregatePhysicalEvidence(..., TransportId.VLC|VisualOFDM, ...)` must remain unchanged in behavior; Text Flash runs must not appear in those aggregates.

Minimal workbench wiring: add a third transport button that runs `TextFlashPhysicalExperimentService` and stores results under the demo id — without changing VLC/OFDM service code paths beyond a new `else if` branch in the workbench controller (or a thin dispatcher wrapper). Prefer a **separate small controller** used only by the Text Flash workbench panel if that reduces risk of regressing VLC/OFDM; either way VLC/OFDM logic stays behavior-identical.

## 10. Architecture and required files

New directory: `src/transports/text-flash/`

| File | Role |
| --- | --- |
| `text-flash-types.ts` | Status, quality, config, diagnostics, frame kinds |
| `text-flash-framing.ts` | Build frame list from text; encode/decode bit cards; START/END pattern descriptors |
| `text-flash-renderer.ts` | Paint IDLE/START/LENGTH/DATA/END onto canvas |
| `text-flash-transmitter.ts` | Dwell scheduler + tx state machine |
| `text-flash-classifier.ts` | Region find, adaptive threshold, START/END/BITCARD classify |
| `text-flash-receiver.ts` | Commit logic, state machine, partial UTF-8, diagnostics |
| `text-flash-synthetic-channel.ts` | Test helpers: jitter, exposure offset, frame drops |
| `text-flash-physical-experiment.ts` | Workbench runner (camera + tx canvas + success criteria) |

UI (demo/workbench only):

| File | Role |
| --- | --- |
| `src/components/TextFlashDemoPanel.tsx` | Demo send/receive UI (progress, partial text, status, quality) |
| `src/components/TextFlashWorkbenchPanel.tsx` | Workbench target panel **or** additive section inside `PhysicalExperimentWorkbench.tsx` gated so VLC/OFDM paths are untouched |

Tests:

| File | Role |
| --- | --- |
| `text-flash-framing.test.ts` | Encode/decode, empty, max length, UTF-8 |
| `text-flash-classifier.test.ts` | START/END/bitcard under threshold shifts |
| `text-flash-receiver.test.ts` | State machine, progress, partial text, failures |
| `text-flash-synthetic-channel.test.ts` | Jitter + exposure simulations |
| `text-flash-end-to-end.test.ts` | HELLO/TEST/12345/STATUS OK/single/empty loopback |
| `text-flash-physical-experiment.test.ts` | Success criteria wiring (synthetic camera) |

**Explicitly not created:** changes under `src/transports/vlc/**`, `src/transports/ofdm/**`, `src/transports/qr/**`, fountain modules, or main transport selector lists — except unavoidable additive registration for a demo entry point in `App.tsx` (new panel route/tab only).

## 11. UI requirements (demo panel)

Show at minimum:

- Status: WAITING / DETECTING / RECEIVING / STABLE / COMPLETE / FAILED (STABLE = RECEIVING + `isStable`)  
- `Receiving...` with live `progressPercent` (capped at 99 until END; then 100)  
- `Characters received: a/b` (bytes when non-ASCII)  
- `Current text:` partial safe UTF-8 prefix  
- `Current signal quality:` GOOD / FAIR / POOR  
- Diagnostics strip: FPS, detected symbols, dropped frames, sync state, received bytes, decoding errors  

Transmit side: text input, frameMs control, Start/Stop, frame phase indicator.

## 12. Test plan

### 12.1 Deterministic software tests

| Case | Expect |
| --- | --- |
| `HELLO` | Exact recover, COMPLETE after END |
| `TEST` | Exact recover |
| `12345` | Exact recover |
| `STATUS OK` | Exact recover (space preserved) |
| Single character `A` | Exact recover |
| Empty string | START/LENGTH0/END → COMPLETE, text `""` |
| UTF-8 multi-byte (e.g. `✓` or Bangla sample) | Exact recover; partial UI hides incomplete trailing bytes |
| Reject > 64 bytes at tx | Throw / FAILED prepare |
| Camera jitter simulation | Random 15–45 FPS sampling still recovers at 750 ms dwell |
| Exposure fluctuation | Add ±30–60 luminance bias + mild noise; still recovers |
| Dropped camera frames | Up to 30% random drops; still recovers |
| Missing END | Stays RECEIVING then timeout FAILED; never COMPLETE |
| Bit flip in one DATA cell | Wrong text or FAILED; never false COMPLETE with wrong equality success in workbench validator |
| Progress monotonicity | After LENGTH, percent only increases; 100% only on COMPLETE |

### 12.2 Real camera / workbench tests

Operator checklist (manual):

1. Same-device or two-device: transmitter full screen, phone camera on receiver demo/workbench  
2. Messages: `HELLO`, `TEST`, `STATUS OK`  
3. Distance ~15–40 cm, indoor ambient  
4. Confirm live partial text and progress  
5. Confirm COMPLETE only after END  
6. Confirm failed run when transmitter stopped mid-message  
7. Confirm result **not** listed in VLC/OFDM evidence aggregates  

## 13. Implementation plan (phased)

Implementation begins **only after this spec is approved**. Suggested order:

1. **Types + framing + renderer** — pure functions; golden canvas fixtures optional  
2. **Classifier + synthetic channel** — threshold/jitter unit tests green  
3. **Receiver state machine** — progress/partial/COMPLETE invariants  
4. **Transmitter dwell loop** — headless timer tests with injected clock  
5. **End-to-end synthetic** — message suite from §12.1  
6. **Demo UI panel** — wire tx/rx, no main transport selector  
7. **Workbench target** — isolated experiment service + evidence tagging  
8. **Manual phone-camera pass** — record notes; no claim of VLC parity  

## 14. Risks and deliberate ceilings

- `ponytail:` global adaptive threshold per frame — ceiling: strong non-uniform illumination; upgrade: tiled thresholds per cell.  
- `ponytail:` no CRC — ceiling: silent single-bit errors yield wrong text marked COMPLETE only if END + length match; workbench equality check against known payload catches this in validation; demo mode shows whatever was decoded — operator verifies visually. For workbench, success requires equality to transmitted text, so false COMPLETE cannot pass validation.  
- Max 64 bytes / ~750 ms per byte — ceiling: not for file transfer; upgrade path is out of scope.  

## 15. Approval gate

Design approved. Implementation awaits approval of `docs/superpowers/plans/2026-08-29-text-flash-protocol-implementation-plan.md`.

Confirmed:

1. Encoding: 4×2 bit card, START/END bars  
2. Surface: demo + workbench only  
3. Max 64 UTF-8 bytes  
4. Default 750 ms dwell  
5. Transport id `text-flash` outside main `TransportId`  
6. No protocol CRC in v1; strong receiver-side integrity + workbench exact-text SUCCESS  
