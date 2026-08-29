/**
 * TEXT_FLASH_PROTOCOL — end-to-end synthetic loopback tests (TF5).
 * Synthetic reliability only — not a physical phone-camera success claim.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { runTextFlashLoopback } from "./text-flash-loopback";
import { TEXT_FLASH_NOISY_CHANNEL } from "./text-flash-synthetic-channel";
import { TextFlashReceiver } from "./text-flash-receiver";

describe("TEXT_FLASH_PROTOCOL end-to-end synthetic loopback (TF5)", () => {
  test("HELLO recovers exactly through full pipeline", () => {
    const r = runTextFlashLoopback("HELLO");
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.equal(r.diagnostics.syncState, "COMPLETE");
    assert.equal(r.diagnostics.finalText, "HELLO");
    assert.equal(r.diagnostics.success, true);
    assert.equal(r.diagnostics.progressPercent, 100);
    assert.equal(r.diagnostics.endDetected, true);
    assert.equal(r.diagnostics.bytesReceived, 5);
  });

  test("STATUS OK recovers with space preserved", () => {
    const r = runTextFlashLoopback("STATUS OK");
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.equal(r.diagnostics.finalText, "STATUS OK");
    assert.equal(r.diagnostics.success, true);
  });

  test("consecutive identical bytes LL in HELLO are separate DATA commits", () => {
    const r = runTextFlashLoopback("HELLO");
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.ok(r.repeatedDataSteps.length >= 1, "plan must mark repeated L");
    // Progress must pass through 3 bytes (HEL) then 4 (HELL) — two L commits
    const byteCounts = r.progressTrace.map((p) => p.bytesReceived);
    assert.ok(byteCounts.includes(3), `missing 3-byte state: ${byteCounts}`);
    assert.ok(byteCounts.includes(4), `missing 4-byte state (second L): ${byteCounts}`);
    assert.ok(byteCounts.includes(5), `missing 5-byte state: ${byteCounts}`);
    assert.equal(r.diagnostics.finalText, "HELLO");
  });

  test("UTF-8 multi-byte recovers exactly", () => {
    const r = runTextFlashLoopback("✓");
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.equal(r.diagnostics.finalText, "✓");
    assert.equal(r.diagnostics.bytesReceived, 3);
  });

  test("progress updates incrementally and reflects each DATA byte immediately", () => {
    // 50 ASCII bytes → ~2% steps; also assert non-zero after first byte
    const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmn";
    assert.equal(text.length, 50);
    const r = runTextFlashLoopback(text, {
      channel: { seed: 7, cameraFps: 30, missProbability: 0 },
    });
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");

    const dataProgress = r.progressTrace.filter(
      (p) => p.bytesReceived > 0 && p.progressPercent < 100,
    );
    assert.ok(dataProgress.length >= 10, "expected many incremental updates");
    assert.equal(dataProgress[0]!.progressPercent > 0, true);
    // Monotonic bytes / progress before COMPLETE
    for (let i = 1; i < dataProgress.length; i++) {
      assert.ok(
        dataProgress[i]!.bytesReceived >= dataProgress[i - 1]!.bytesReceived,
      );
      assert.ok(
        dataProgress[i]!.progressPercent >= dataProgress[i - 1]!.progressPercent,
      );
      assert.ok(dataProgress[i]!.progressPercent <= 99);
    }
    // Immediate reflection: after N bytes, partialText length tracks (ASCII)
    for (const p of dataProgress) {
      assert.equal(p.partialText.length, p.bytesReceived);
    }
    // Includes small percentages (2%, 10%, …) for a 50-byte payload
    const percents = new Set(dataProgress.map((p) => p.progressPercent));
    assert.ok(percents.has(2) || [...percents].some((p) => p > 0 && p <= 4));
    assert.ok([...percents].some((p) => p >= 10 && p <= 12));
  });

  test("STABLE overlay is false while awaiting next frame (not false success)", () => {
    const r = runTextFlashLoopback("TEST");
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    const awaiting = r.progressTrace.filter((p) => p.awaitingNextFrame);
    for (const p of awaiting) {
      assert.equal(
        p.isStable,
        false,
        "awaitingNextFrame must not report isStable success",
      );
    }
    assert.equal(r.diagnostics.syncState, "COMPLETE");
    assert.notEqual(r.diagnostics.syncState, "RECEIVING");
  });

  test("COMPLETE needs END+length; workbench success needs exact text", () => {
    const ok = runTextFlashLoopback("TEST", { expectedText: "TEST" });
    assert.equal(ok.diagnostics.syncState, "COMPLETE");
    assert.equal(ok.diagnostics.success, true);

    const bad = runTextFlashLoopback("TEST", { expectedText: "HELLO" });
    assert.equal(bad.diagnostics.syncState, "FAILED");
    assert.equal(bad.diagnostics.completionReason, "text_mismatch");
    assert.equal(bad.diagnostics.success, false);
    assert.equal(bad.diagnostics.finalText, "TEST");
    assert.equal(bad.diagnostics.endDetected, true);
    assert.equal(bad.failureStage, "utf8_decode");
  });

  test("noisy channel with jitter, exposure, noise, and misses still recovers HELLO", () => {
    const r = runTextFlashLoopback("HELLO", {
      channel: {
        ...TEXT_FLASH_NOISY_CHANNEL,
        exposureBias: 30,
        noiseStdDev: 8,
        missProbability: 0.2,
        timingJitterFraction: 0.35,
        cameraFps: 26,
        seed: 2026,
      },
      commitMs: 50,
    });
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.equal(r.diagnostics.finalText, "HELLO");
    assert.ok(r.channel.missedSampleCount > 0);
    assert.ok(r.diagnostics.missedFrames >= 0);
  });

  test("reacquisition after camera gaps keeps recovery", () => {
    const r = runTextFlashLoopback("STATUS OK", {
      channel: {
        seed: 11,
        width: 160,
        height: 160,
        exposureBias: 0,
        noiseStdDev: 0,
        cameraFps: 24,
        timingJitterFraction: 0.4,
        missProbability: 0.35,
        missGapMs: 50,
      },
      commitMs: 45,
    });
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.equal(r.diagnostics.finalText, "STATUS OK");
    assert.ok(r.channel.reacquisitionCount > 0 || r.channel.missedSampleCount > 0);
  });

  test("injected UNKNOWN frames do not prevent recovery and leave stage diagnostics", () => {
    const r = runTextFlashLoopback("HI", {
      injectUnknownAtSampleIndexes: [3, 7, 12, 20],
      channel: { seed: 3, missProbability: 0 },
    });
    assert.equal(r.failureStage, "ok", r.failureDetail ?? "");
    assert.equal(r.diagnostics.finalText, "HI");
    assert.ok(r.diagnostics.invalidFrames >= 1);
  });

  test("stage diagnostics identify missing END when stream truncated", () => {
    const r = runTextFlashLoopback("AB", {
      channel: {
        seed: 1,
        width: 120,
        height: 120,
        exposureBias: 0,
        noiseStdDev: 0,
        cameraFps: 30,
        timingJitterFraction: 0,
        missProbability: 0,
        missGapMs: 80,
      },
      commitMs: 40,
      // Force failure by expecting wrong length via a custom path: truncate samples
    });
    // Truncate after LENGTH+DATA but before END optical dwell
    const cut = r.channel.samples.filter((s) => s.opticalStepIndex < r.channel.plan.steps.length - 1);
    assert.ok(cut.length > 0);

    // Re-run receiver on truncated sample list
    const rx = new TextFlashReceiver({
      frameMs: 750,
      maxBytes: 64,
      commitMs: 40,
      expectedText: "AB",
      timeoutMs: 500,
    });
    for (const s of cut) {
      rx.ingestClassification(
        s.classify.classification,
        s.timestampMs,
        "GOOD",
        { missedSincePrevious: s.missedSincePrevious },
      );
    }
    // Force timeout
    const last = cut[cut.length - 1]!;
    rx.ingestClassification({ kind: "unknown" }, last.timestampMs + 2000, "POOR");
    const d = rx.getDiagnostics();
    assert.notEqual(d.syncState, "COMPLETE");
    assert.notEqual(d.progressPercent, 100);
    assert.ok(
      d.completionReason === "timeout" ||
        d.completionReason === "unexpected_end" ||
        !d.endDetected,
    );
  });

  test("empty string and single character loopback", () => {
    for (const text of ["", "A"]) {
      const r = runTextFlashLoopback(text);
      assert.equal(r.failureStage, "ok", `${text}: ${r.failureDetail}`);
      assert.equal(r.diagnostics.finalText, text);
      assert.equal(r.diagnostics.success, true);
    }
  });
});
