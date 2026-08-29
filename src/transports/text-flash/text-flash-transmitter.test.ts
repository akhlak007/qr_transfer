import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXT_FLASH_DEFAULT_FRAME_MS,
} from "./text-flash-types";
import { createTextFlashRenderPlan } from "./text-flash-renderer";
import {
  TextFlashFakeClock,
  TextFlashTransmitter,
  assertNoCoalescedRepeatedData,
  isRepeatedDataByte,
  runTransmitterWithFakeClock,
} from "./text-flash-transmitter";

describe("TEXT_FLASH_PROTOCOL transmitter (TF4)", () => {
  test("default dwell is exactly 750 ms and plan preserves HELLO frame order", () => {
    const plan = createTextFlashRenderPlan("HELLO");
    assert.equal(plan.frameMs, TEXT_FLASH_DEFAULT_FRAME_MS);
    assert.equal(plan.frameMs, 750);
    assert.ok(plan.steps.every((s) => s.dwellMs === 750));
    assert.deepEqual(
      plan.steps.map((s) => s.kind),
      ["start", "length", "data", "data", "data", "data", "data", "end"],
    );
    assertNoCoalescedRepeatedData(plan);
    // Two L bytes are separate DATA steps
    const dataBytes = plan.steps
      .filter((s) => s.kind === "data")
      .map((s) => s.byte);
    assert.deepEqual(dataBytes, [0x48, 0x45, 0x4c, 0x4c, 0x4f]);
    assert.equal(isRepeatedDataByte(plan, 5), true); // second L
    assert.equal(isRepeatedDataByte(plan, 4), false); // first L
  });

  test("HELLO transmission visits every frame with full dwell timing", async () => {
    const clock = new TextFlashFakeClock(1000);
    const paints: string[] = [];
    const dwells: number[] = [];
    const tx = new TextFlashTransmitter({
      clock,
      frameMs: 750,
      onFrame: (_buf, snap) => {
        if (snap.status === "SENDING") {
          paints.push(snap.kind);
          dwells.push(snap.dwellMs);
        }
      },
    });

    const { kinds, snapshots } = await runTransmitterWithFakeClock(
      tx,
      clock,
      "HELLO",
      750,
    );

    assert.deepEqual(kinds, [
      "start",
      "length",
      "data",
      "data",
      "data",
      "data",
      "data",
      "end",
    ]);
    assert.ok(dwells.every((d) => d === 750));
    assert.equal(tx.getStatus(), "COMPLETE");
    assert.equal(snapshots[snapshots.length - 1]!.status, "COMPLETE");
    assert.equal(snapshots[snapshots.length - 1]!.progressPercent, 100);

    // Repeated L flagged on the second L frame (index 5)
    const secondL = snapshots.find(
      (s) => s.kind === "data" && s.dataIndex === 3 && s.repeatedByteFrame,
    );
    assert.ok(secondL, "second L must be marked repeatedByteFrame for re-arm");
  });

  test("STATUS OK and UTF-8 keep exact frame ordering", async () => {
    for (const text of ["STATUS OK", "✓"]) {
      const clock = new TextFlashFakeClock();
      const tx = new TextFlashTransmitter({ clock, frameMs: 750 });
      const { kinds } = await runTransmitterWithFakeClock(tx, clock, text, 750);
      const plan = createTextFlashRenderPlan(text, 750);
      assert.deepEqual(
        kinds,
        plan.steps.map((s) => s.kind),
      );
      assert.equal(tx.getStatus(), "COMPLETE");
    }
  });

  test("stop cancels mid-stream and leaves STOPPED", async () => {
    const clock = new TextFlashFakeClock();
    const tx = new TextFlashTransmitter({ clock, frameMs: 750 });
    const startPromise = tx.start("HELLO");
    for (let i = 0; i < 100 && clock.pendingSleeps() === 0; i++) {
      await Promise.resolve();
    }
    assert.ok(clock.pendingSleeps() > 0);
    assert.equal(tx.getStatus(), "SENDING");
    assert.equal(tx.getSnapshot().kind, "start");

    tx.stop();
    assert.equal(tx.getStatus(), "STOPPED");

    await clock.advance(750);
    const snap = await startPromise;
    assert.equal(snap.status, "STOPPED");
    assert.ok((tx.getSnapshot().frameIndex ?? 0) < 7);
  });

  test("reset returns to IDLE and clears plan", async () => {
    const clock = new TextFlashFakeClock();
    const tx = new TextFlashTransmitter({ clock, frameMs: 750 });
    const p = tx.start("A");
    for (let i = 0; i < 100 && clock.pendingSleeps() === 0; i++) {
      await Promise.resolve();
    }
    tx.stop();
    await clock.advance(750);
    await p;
    tx.reset();
    assert.equal(tx.getStatus(), "IDLE");
    assert.equal(tx.getPlan(), null);
    assert.equal(tx.getSnapshot().kind, "idle");
  });

  test("restart after COMPLETE sends a new message", async () => {
    const clock = new TextFlashFakeClock();
    const tx = new TextFlashTransmitter({ clock, frameMs: 750 });
    await runTransmitterWithFakeClock(tx, clock, "A", 750);
    assert.equal(tx.getStatus(), "COMPLETE");

    const { kinds } = await runTransmitterWithFakeClock(tx, clock, "OK", 750);
    assert.deepEqual(kinds, ["start", "length", "data", "data", "end"]);
    assert.equal(tx.getStatus(), "COMPLETE");
  });

  test("sender progress is display-only and reaches 100 only after last frame", async () => {
    const clock = new TextFlashFakeClock();
    const progress: number[] = [];
    const tx = new TextFlashTransmitter({
      clock,
      frameMs: 750,
      onStatus: (snap) => {
        if (snap.status === "SENDING" || snap.status === "COMPLETE") {
          progress.push(snap.progressPercent);
        }
      },
    });
    await runTransmitterWithFakeClock(tx, clock, "AB", 750);
    assert.ok(progress.some((p) => p > 0 && p < 100));
    assert.equal(progress[progress.length - 1], 100);
  });

  test("empty string is START → LENGTH(0) → END with 750 ms dwells", async () => {
    const clock = new TextFlashFakeClock();
    const tx = new TextFlashTransmitter({ clock, frameMs: 750 });
    const { kinds, snapshots } = await runTransmitterWithFakeClock(
      tx,
      clock,
      "",
      750,
    );
    assert.deepEqual(kinds, ["start", "length", "end"]);
    assert.equal(snapshots[1]!.byte, 0);
    assert.ok(snapshots.filter((s) => s.status === "SENDING").every((s) => s.dwellMs === 750));
  });
});
