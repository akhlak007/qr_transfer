# TEXT_FLASH_PROTOCOL Implementation Plan

**Design:** `docs/superpowers/specs/2026-08-29-text-flash-protocol-design.md`  
**Date:** 2026-08-29  
**Status:** awaiting approval — no production code until approved  

## Goal

Ship an isolated demo/workbench optical text transport (`text-flash`) that reliably moves short UTF-8 messages through a phone camera using 4×2 bit cards and START/END patterns, without touching QR, VLC, or OFDM pipelines.

## Locked constraints

| Item | Value |
| --- | --- |
| Surface | Demo panel + physical workbench only |
| Transport id | `text-flash` via `DemoTransportId` — **not** added to `TransportId` / main mode selector |
| Encoding | 4×2 B/W bit card (MSB-first, row-major); white=1, black=0 |
| Controls | Distinct START (white + black mid bar) / END (black + white mid bar) |
| Sequence | `START → LENGTH → DATA×N → END` |
| Max payload | 64 UTF-8 bytes |
| Default dwell | 750 ms (`frameMs` clamp 500–2000) |
| Protocol CRC | None in v1 |
| Isolation | No edits to `src/transports/vlc/**`, `ofdm/**`, `qr/**`, fountain, or existing protocol framing |

## Receiver integrity (v1, no CRC)

1. Reject malformed START/END/BITCARD (geometry / adaptive-threshold margin failures).  
2. Do not accept any DATA until LENGTH is accepted and `0 <= length <= 64`.  
3. Maintain `expectedDataIndex`; accept at most one new byte per index.  
4. Identical BITCARD while still on the same index → `duplicateFrames++`, **no** progress advance.  
5. Unexpected kind (e.g. END before enough DATA, DATA after length exhausted, BITCARD when expecting END) → `invalidFrames++`; fail or ignore per design table — never silent success.  
6. Progress % = `min(99, round(100 * bytesReceived / max(declaredLength, 1)))` after LENGTH; **100 only on COMPLETE**. Update immediately on each newly accepted byte (fine-grained 1%/2% steps when length is large).  
7. COMPLETE / SUCCESS only after END **and** length satisfied. Workbench SUCCESS also requires byte-identical match to the known transmitted payload.  
8. STABLE never means done. Inter-frame stall → UI **RECEIVING — WAITING FOR NEXT FRAME**.  
9. Phone-camera robustness: large cells, per-frame adaptive threshold, temporal commit window, duplicate-frame tolerance, reacquisition after missed **camera** samples while the same optical frame remains on screen. A fully skipped transmitter dwell cannot be reconstructed without changing encoding.

## Diagnostics (required fields)

Expose and display at least:

- `startDetected`, `lengthDetected`, `endDetected`  
- `dataByteIndex`, `bytesReceived`, `declaredLength`, `progressPercent`  
- `duplicateFrames`, `invalidFrames`, `missedFrames`  
- `partialText`, `finalText`, `finalStatus` / `syncState`  
- `awaitingNextFrame`, `isStable`, `cameraFps`, `signalQuality`  

## Milestone TF0: Types and framing (pure)

### Files created

- `src/transports/text-flash/text-flash-types.ts`
- `src/transports/text-flash/text-flash-framing.ts`
- `src/transports/text-flash/text-flash-framing.test.ts`

### Work

1. Define `DemoTransportId = "text-flash"` (local to text-flash module; do not extend `TransportId`).  
2. Define `TextFlashStatus`, frame kinds, tx/rx config defaults (`frameMs: 750`, `maxBytes: 64`), diagnostics interface matching the design addendum.  
3. `buildTextFlashFrames(text: string): TextFlashFrame[]` → START, LENGTH byte, DATA bytes, END; reject `TextEncoder` length > 64.  
4. Bit pack/unpack helpers for one byte ↔ 8 booleans (4×2).  
5. Pattern descriptors for START/END geometry (active region 80%, bar 12% height, cell gap 4%).  

### Verification

- Empty / single / `HELLO` / `STATUS OK` / UTF-8 multi-byte frame lists.  
- Reject 65+ byte payloads.  
- Bit round-trip for `0x00`, `0xFF`, `0xA5`.  

### Gate

`npx tsx --test src/transports/text-flash/text-flash-framing.test.ts`

---

## Milestone TF1: Renderer

### Files created

- `src/transports/text-flash/text-flash-renderer.ts`
- `src/transports/text-flash/text-flash-renderer.test.ts`

### Work

1. Paint IDLE / START / LENGTH / DATA / END onto an `HTMLCanvasElement` or offscreen canvas using only `#000` / `#FFF` / `#808080`.  
2. No HUD text on the transmit canvas.  
3. Deterministic pixel sampling helpers for tests (read cell centers / bar band).  

### Verification

- Synthetic canvas: START has bright field + dark bar; END inverse; DATA `0x48` (`H`) matches bit layout.  

### Gate

Renderer tests green. No VLC/OFDM imports.

---

## Milestone TF2: Classifier + synthetic channel

### Files created

- `src/transports/text-flash/text-flash-classifier.ts`
- `src/transports/text-flash/text-flash-classifier.test.ts`
- `src/transports/text-flash/text-flash-synthetic-channel.ts`
- `src/transports/text-flash/text-flash-synthetic-channel.test.ts`

### Work

1. Active-region find (center crop / high-contrast box).  
2. Adaptive threshold = midpoint of 10th/90th percentile luminance in region.  
3. Classify → `START` | `END` | `BITCARD(byte)` | `UNKNOWN` | `IDLE`.  
4. Reject weak margins as UNKNOWN (feeds `invalidFrames` upstream).  
5. Synthetic channel: render frame → ImageData; inject exposure bias (±30–60), noise, FPS jitter (15–45), random drops ≤30%, delayed frames.  

### Verification

- Clean render classifies correctly.  
- Exposure bias still classifies.  
- Malformed / mid-gray mush → UNKNOWN.  

### Gate

Classifier + synthetic-channel tests green.

---

## Milestone TF3: Receiver state machine (integrity core)

### Files created

- `src/transports/text-flash/text-flash-receiver.ts`
- `src/transports/text-flash/text-flash-receiver.test.ts`

### Work

1. Ingest timestamped luminance/ImageData observations.  
2. Wall-clock `commitMs = max(200, frameMs * 0.35)` temporal stability filter.  
3. After commit, require a **different** committed symbol before accepting the next (duplicate tolerance).  
4. Phase machine: `need_start` → `need_length` → `need_data` → `need_end` → COMPLETE.  
5. LENGTH gate before DATA; sequence index tracking; duplicate / invalid counters.  
6. Safe UTF-8 partial text (complete codepoints only).  
7. Progress rules; `awaitingNextFrame` when RECEIVING and not in active commit; `isStable` only during active confirming samples.  
8. Timeout → FAILED (`frameMs * 8`); never COMPLETE without END.  
9. Optional `expectedText` for workbench: on END, if bytes decode ≠ expected → FAILED (`text_mismatch`) even if length matches.  
10. Missed camera frames: large `dt` gaps increment `missedFrames`; resume classifying current optical frame (reacquisition).  

### Verification (deterministic)

| Case | Expect |
| --- | --- |
| Partial reception | After k DATA bytes, progress and partial text update; status RECEIVING; not COMPLETE |
| Duplicate frames | Same BITCARD repeated → `duplicateFrames`↑; bytes/progress unchanged |
| Missed camera frames | Drops mid-dwell; still accepts symbol once; no false progress |
| Invalid frames | UNKNOWN / wrong kind → `invalidFrames`↑; no progress |
| Camera jitter | Irregular sample times; full message recovers |
| Delayed frames | Long gap then resume; reacquisition; or timeout FAILED if beyond `timeoutMs` |
| UTF-8 | Multi-byte exact; partial hides incomplete trailing bytes |
| Early termination | Stop before END → timeout FAILED; never 100%/COMPLETE |
| Exact final-text match | With `expectedText`, SUCCESS only on byte-identical; mismatch → FAILED |
| Empty / HELLO / TEST / 12345 / STATUS OK / single char | Exact recover |

### Gate

All receiver tests green. Assert: no path sets `progressPercent === 100` or `COMPLETE` without `endDetected`.

---

## Milestone TF4: Transmitter

### Files created

- `src/transports/text-flash/text-flash-transmitter.ts`
- `src/transports/text-flash/text-flash-transmitter.test.ts`

### Work

1. Build frames; paint; dwell via injectable clock (`now` / `sleep`) for tests.  
2. States: IDLE → PREPARING → TRANSMITTING → COMPLETE | FAILED.  
3. Expose phase / frameIndex; cancel → IDLE/FAILED; end on IDLE gray.  
4. Sender progress is display-only (never “delivered”).  

### Verification

- Injected clock advances through START/LENGTH/DATA/END in order.  
- Cancel mid-stream stops further paints.  

### Gate

Transmitter tests green.

---

## Milestone TF5: End-to-end synthetic loopback

### Files created

- `src/transports/text-flash/text-flash-end-to-end.test.ts`

### Work

1. Tx render → synthetic channel (jitter + exposure + drops) → Rx ingest → assert exact text.  
2. Cover message suite + integrity negative cases from TF3 at full pipeline level.  

### Gate

End-to-end suite green.

---

## Milestone TF6: Demo UI (not main transport selector)

### Files created

- `src/components/TextFlashDemoPanel.tsx`

### Files modified (additive only)

- `src/App.tsx` — add a **demo/research entry** (tab or section) that mounts `TextFlashDemoPanel`. Do **not** add `text-flash` to the file-transfer `TransportId` selector / `TRANSPORTS` map.

### Work

1. Send: text input, `frameMs` control, Start/Stop, phase indicator, full-bleed tx canvas.  
2. Receive: getUserMedia preview → classifier/receiver loop.  
3. Live UI: status labels WAITING / DETECTING / RECEIVING / STABLE / WAITING FOR NEXT FRAME / COMPLETE / FAILED; progress %; bytes a/b; partial text; signal quality; full diagnostics strip (START/LENGTH/END flags, data index, duplicates, invalids, missed, final text/status).  
4. COMPLETE styling only when `finalStatus === "COMPLETE"`.  

### Verification

- Typecheck/build.  
- Manual smoke: same-device loopback if camera available (optional in CI).  

### Gate

`npm run typecheck` and existing tests still pass; new text-flash tests pass.

---

## Milestone TF7: Physical workbench target (isolated)

### Files created

- `src/transports/text-flash/text-flash-physical-experiment.ts`
- `src/transports/text-flash/text-flash-physical-experiment.test.ts`
- `src/components/TextFlashWorkbenchPanel.tsx`

### Files modified

- Prefer **not** rewriting `PhysicalExperimentController` VLC/OFDM branches. Mount `TextFlashWorkbenchPanel` beside the existing workbench (App or parent research view) so VLC/OFDM controller code stays behavior-identical.  
- If a single workbench shell must list the target, add a third button that only constructs the Text Flash service — zero changes to VLC/OFDM success criteria.

### Work

1. Experiment runner: known payload → tx → camera/synthetic → rx with `expectedText` → SUCCESS iff START, LENGTH, all DATA, END, and exact text match.  
2. Persist/export under demo id `text-flash` only; **exclude** from `aggregatePhysicalEvidence` VLC/OFDM matrices (no changes to aggregate filter semantics beyond ensuring text-flash records cannot satisfy `TransportId.VLC|VisualOFDM` queries — ideally by never using those ids).  
3. Unit-test success and mismatch failure with synthetic camera.  

### Gate

Physical-experiment tests green; VLC/OFDM existing tests unchanged and still green.

---

## Milestone TF8: Regression and manual checklist

### Work

1. Run full `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.  
2. Confirm git diff touches no files under `src/transports/vlc/`, `ofdm/`, `qr/` except none.  
3. Manual phone-camera checklist from design §12.2 (operator-run; not a CI gate).  

### Gate

All automated gates green. Document manual result separately if performed.

---

## File inventory (final)

```text
src/transports/text-flash/
  text-flash-types.ts
  text-flash-framing.ts
  text-flash-framing.test.ts
  text-flash-renderer.ts
  text-flash-renderer.test.ts
  text-flash-classifier.ts
  text-flash-classifier.test.ts
  text-flash-synthetic-channel.ts
  text-flash-synthetic-channel.test.ts
  text-flash-receiver.ts
  text-flash-receiver.test.ts
  text-flash-transmitter.ts
  text-flash-transmitter.test.ts
  text-flash-end-to-end.test.ts
  text-flash-physical-experiment.ts
  text-flash-physical-experiment.test.ts

src/components/TextFlashDemoPanel.tsx
src/components/TextFlashWorkbenchPanel.tsx
src/App.tsx                          # additive demo entry only
```

## Explicit non-goals for this plan

- Extending `TransportId` or main send/receive mode selector  
- Protocol CRC / Barker / Manchester / OFDM reuse  
- Counting Text Flash as VLC/OFDM physical validation evidence  
- File transfer, fountain, or >64-byte payloads  
- Recovering a fully skipped transmitter DATA frame without encoding changes  

## Approval gate

**Do not write production code until this plan is approved.**

Please confirm or amend:

1. Milestone order TF0→TF8  
2. Separate workbench panel (preferred) vs third button inside existing workbench shell  
3. Open demo COMPLETE = END + length only; workbench SUCCESS = END + length + exact expected text  
4. “Missed frame reacquisition” = camera-sample gaps only (not skipped TX dwells)  
