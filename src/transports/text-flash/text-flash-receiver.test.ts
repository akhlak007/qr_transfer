import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TextFlashReceiver,
  safeUtf8Prefix,
  textFlashProgressPercent,
} from "./text-flash-receiver";
import { textFlashCommitMs } from "./text-flash-types";
import type { TextFlashOpticalClass } from "./text-flash-types";
import {
  TEXT_FLASH_CLEAN_CHANNEL,
  simulateTextFlashCamera,
} from "./text-flash-synthetic-channel";

const COMMIT = textFlashCommitMs(750);

function feed(
  rx: TextFlashReceiver,
  optical: TextFlashOpticalClass,
  t: number,
  opts?: { missedSincePrevious?: boolean },
) {
  return rx.ingestClassification(optical, t, "GOOD", opts);
}

/** Persist a class for commitMs, then leave hold-for-change armed. */
function commitAt(
  rx: TextFlashReceiver,
  optical: TextFlashOpticalClass,
  t0: number,
  opts?: { missedSincePrevious?: boolean },
): number {
  feed(rx, optical, t0, opts);
  feed(rx, optical, t0 + COMMIT);
  return t0 + COMMIT;
}

function commitSequence(
  rx: TextFlashReceiver,
  classes: TextFlashOpticalClass[],
  t0 = 0,
  frameMs = 750,
): number {
  let t = t0;
  for (const c of classes) {
    // Space commits by a full dwell so identical consecutive DATA bytes can re-arm.
    t = commitAt(rx, c, t + frameMs);
  }
  return t;
}

describe("TEXT_FLASH_PROTOCOL receiver (TF3)", () => {
  test("progress is monotonic and capped at 99 until COMPLETE", () => {
    assert.equal(textFlashProgressPercent(0, 5, false), 0);
    assert.equal(textFlashProgressPercent(1, 5, false), 20);
    assert.equal(textFlashProgressPercent(5, 5, false), 99);
    assert.equal(textFlashProgressPercent(5, 5, true), 100);
    assert.equal(textFlashProgressPercent(1, 100, false), 1);
  });

  test("partial reception shows text/progress after first DATA; never COMPLETE early", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 5 },
      { kind: "bitcard", byte: 0x48 }, // H
    ]);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "RECEIVING");
    assert.equal(d.bytesReceived, 1);
    assert.equal(d.partialText, "H");
    assert.equal(d.progressPercent, 20);
    assert.equal(d.endDetected, false);
    assert.notEqual(d.progressPercent, 100);
    assert.equal(d.success, false);
    assert.ok(d.awaitingNextFrame || !d.isStable);
  });

  test("duplicate frames do not advance progress or bytes", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    let t = commitAt(rx, { kind: "start" }, 0);
    t = commitAt(rx, { kind: "bitcard", byte: 2 }, t + 10);
    t = commitAt(rx, { kind: "bitcard", byte: 0x41 }, t + 10); // A
    const before = rx.getDiagnostics();
    // Same DATA still on screen — duplicates
    for (let i = 0; i < 5; i++) {
      t += 50;
      feed(rx, { kind: "bitcard", byte: 0x41 }, t);
    }
    const after = rx.getDiagnostics();
    assert.equal(after.bytesReceived, before.bytesReceived);
    assert.equal(after.progressPercent, before.progressPercent);
    assert.ok(after.duplicateFrames > 0);
  });

  test("missed samples / reacquisition keep accumulated bytes", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    let t = commitAt(rx, { kind: "start" }, 0);
    t = commitAt(rx, { kind: "bitcard", byte: 3 }, t + 10);
    t = commitAt(rx, { kind: "bitcard", byte: 0x41 }, t + 10);
    const mid = rx.getDiagnostics();
    assert.equal(mid.partialText, "A");

    // Large camera gap then reacquire same LENGTH-next DATA path
    t = commitAt(
      rx,
      { kind: "bitcard", byte: 0x42 },
      t + 500,
      { missedSincePrevious: true },
    );
    const d = rx.getDiagnostics();
    assert.ok(d.missedFrames >= 1);
    assert.equal(d.partialText, "AB");
    assert.equal(d.bytesReceived, 2);
    assert.equal(d.syncState, "RECEIVING");
  });

  test("malformed UNKNOWN does not reset accumulated data", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    const t = commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 2 },
      { kind: "bitcard", byte: 0x58 }, // X
    ]);
    feed(rx, { kind: "unknown" }, t + 20);
    feed(rx, { kind: "unknown" }, t + 70);
    const d = rx.getDiagnostics();
    assert.ok(d.invalidFrames >= 1);
    assert.equal(d.partialText, "X");
    assert.equal(d.bytesReceived, 1);
    assert.equal(d.syncState, "RECEIVING");
  });

  test("premature END fails and never reports 100%/COMPLETE", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 3 },
      { kind: "bitcard", byte: 0x41 },
      { kind: "end" },
    ]);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "FAILED");
    assert.equal(d.completionReason, "unexpected_end");
    assert.equal(d.progressPercent, 33); // 1/3 → still not complete path... wait FAILED uses complete=false so 33
    assert.notEqual(d.progressPercent, 100);
    assert.equal(d.success, false);
  });

  test("exact completion for HELLO with END + length", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    const bytes = [...new TextEncoder().encode("HELLO")];
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 5 },
      ...bytes.map((b) => ({ kind: "bitcard" as const, byte: b })),
      { kind: "end" },
    ]);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "COMPLETE");
    assert.equal(d.progressPercent, 100);
    assert.equal(d.finalText, "HELLO");
    assert.equal(d.endDetected, true);
    assert.equal(d.success, true);
    assert.equal(d.completionReason, "end_ok");
  });

  test("workbench expectedText mismatch fails SUCCESS even if length matches", () => {
    const rx = new TextFlashReceiver({
      frameMs: 750,
      maxBytes: 64,
      expectedText: "HELLO",
    });
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 4 },
      { kind: "bitcard", byte: 0x54 },
      { kind: "bitcard", byte: 0x45 },
      { kind: "bitcard", byte: 0x53 },
      { kind: "bitcard", byte: 0x54 },
      { kind: "end" },
    ]);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "FAILED");
    assert.equal(d.completionReason, "text_mismatch");
    assert.equal(d.finalText, "TEST");
    assert.equal(d.success, false);
    assert.equal(d.endDetected, true);
  });

  test("workbench expectedText match yields COMPLETE + success", () => {
    const rx = new TextFlashReceiver({
      frameMs: 750,
      maxBytes: 64,
      expectedText: "TEST",
    });
    const bytes = [...new TextEncoder().encode("TEST")];
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 4 },
      ...bytes.map((b) => ({ kind: "bitcard" as const, byte: b })),
      { kind: "end" },
    ]);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "COMPLETE");
    assert.equal(d.success, true);
    assert.equal(d.finalText, "TEST");
  });

  test("UTF-8 partial hides incomplete trailing codepoint", () => {
    // ✓ = E2 9C 93
    assert.equal(safeUtf8Prefix(Uint8Array.of(0xe2)), "");
    assert.equal(safeUtf8Prefix(Uint8Array.of(0xe2, 0x9c)), "");
    assert.equal(safeUtf8Prefix(Uint8Array.of(0xe2, 0x9c, 0x93)), "✓");

    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 3 },
      { kind: "bitcard", byte: 0xe2 },
    ]);
    assert.equal(rx.getDiagnostics().partialText, "");
    commitSequence(rx, [{ kind: "bitcard", byte: 0x9c }], 5000);
    assert.equal(rx.getDiagnostics().partialText, "");
    commitSequence(rx, [{ kind: "bitcard", byte: 0x93 }, { kind: "end" }], 8000);
    const d = rx.getDiagnostics();
    assert.equal(d.finalText, "✓");
    assert.equal(d.syncState, "COMPLETE");
  });

  test("empty string completes after START LENGTH(0) END", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 0 },
      { kind: "end" },
    ]);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "COMPLETE");
    assert.equal(d.finalText, "");
    assert.equal(d.progressPercent, 100);
  });

  test("timeout after stall fails without COMPLETE", () => {
    const rx = new TextFlashReceiver({
      frameMs: 750,
      maxBytes: 64,
      timeoutMs: 1000,
    });
    let t = commitAt(rx, { kind: "start" }, 0);
    t = commitAt(rx, { kind: "bitcard", byte: 2 }, t + 10);
    feed(rx, { kind: "bitcard", byte: 0x41 }, t + 2000);
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "FAILED");
    assert.equal(d.completionReason, "timeout");
    assert.notEqual(d.progressPercent, 100);
  });

  test("reset recovers from FAILED for a new message", () => {
    const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 1 },
      { kind: "end" },
    ]);
    assert.equal(rx.getDiagnostics().syncState, "FAILED");
    rx.reset();
    const bytes = [...new TextEncoder().encode("OK")];
    commitSequence(rx, [
      { kind: "start" },
      { kind: "bitcard", byte: 2 },
      ...bytes.map((b) => ({ kind: "bitcard" as const, byte: b })),
      { kind: "end" },
    ]);
    assert.equal(rx.getDiagnostics().finalText, "OK");
    assert.equal(rx.getDiagnostics().syncState, "COMPLETE");
  });

  test("synthetic camera samples drive full HELLO recovery (not physical claim)", () => {
    const sim = simulateTextFlashCamera("HELLO", TEXT_FLASH_CLEAN_CHANNEL, 750);
    const rx = new TextFlashReceiver({
      frameMs: 750,
      maxBytes: 64,
      expectedText: "HELLO",
      commitMs: 50, // synthetic samples are dense; shorter commit for lab loopback
    });
    for (const s of sim.samples) {
      rx.ingestClassification(
        s.classify.classification,
        s.timestampMs,
        s.classify.diagnostics.quality,
        { missedSincePrevious: s.missedSincePrevious },
      );
    }
    const d = rx.getDiagnostics();
    assert.equal(d.syncState, "COMPLETE");
    assert.equal(d.finalText, "HELLO");
    assert.equal(d.success, true);
    assert.equal(d.progressPercent, 100);
  });

  test("message suite recovers exactly", () => {
    for (const text of ["TEST", "12345", "STATUS OK", "A", ""]) {
      const rx = new TextFlashReceiver({ frameMs: 750, maxBytes: 64 });
      const bytes = [...new TextEncoder().encode(text)];
      commitSequence(rx, [
        { kind: "start" },
        { kind: "bitcard", byte: bytes.length },
        ...bytes.map((b) => ({ kind: "bitcard" as const, byte: b })),
        { kind: "end" },
      ]);
      const d = rx.getDiagnostics();
      assert.equal(d.syncState, "COMPLETE", text);
      assert.equal(d.finalText, text);
      assert.equal(d.progressPercent, 100);
    }
  });
});
