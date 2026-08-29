import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { emptyTextFlashDiagnostics } from "../transports/text-flash/text-flash-types";
import {
  buildTextFlashDemoViewModel,
  compareExpectedReceived,
  deriveReceiveUiLabel,
  deriveTransmitUiLabel,
  formatProgressPercent,
  mayShowStable,
} from "../transports/text-flash/text-flash-demo-model";
import { runTextFlashLoopback } from "../transports/text-flash/text-flash-loopback";

describe("TextFlashDemoPanel view-model (TF6)", () => {
  test("transmit labels map IDLE/SENDING/COMPLETE/STOPPED", () => {
    assert.equal(deriveTransmitUiLabel("IDLE"), "IDLE");
    assert.equal(deriveTransmitUiLabel("SENDING"), "SENDING");
    assert.equal(deriveTransmitUiLabel("COMPLETE"), "COMPLETE");
    assert.equal(deriveTransmitUiLabel("STOPPED"), "STOPPED");
  });

  test("STABLE only when DATA bytes observed; never alone as success", () => {
    const base = emptyTextFlashDiagnostics("RECEIVING");
    const stableNoData = {
      ...base,
      isStable: true,
      bytesReceived: 0,
      lengthDetected: true,
    };
    assert.equal(deriveReceiveUiLabel(stableNoData), "RECEIVING");
    assert.equal(mayShowStable(stableNoData), false);

    const stableWithData = {
      ...base,
      isStable: true,
      bytesReceived: 2,
      partialText: "HE",
    };
    assert.equal(deriveReceiveUiLabel(stableWithData), "STABLE");
    assert.equal(mayShowStable(stableWithData), true);

    const complete = {
      ...base,
      syncState: "COMPLETE" as const,
      finalStatus: "COMPLETE" as const,
      isStable: true,
      bytesReceived: 5,
      progressPercent: 100,
      success: true,
    };
    assert.equal(deriveReceiveUiLabel(complete), "COMPLETE");
  });

  test("REACQUIRING and WAITING_FOR_NEXT_FRAME labels", () => {
    const base = emptyTextFlashDiagnostics("RECEIVING");
    assert.equal(
      deriveReceiveUiLabel({ ...base, reacquiring: true, bytesReceived: 1 }),
      "REACQUIRING",
    );
    assert.equal(
      deriveReceiveUiLabel({
        ...base,
        awaitingNextFrame: true,
        isStable: false,
        bytesReceived: 1,
      }),
      "WAITING_FOR_NEXT_FRAME",
    );
  });

  test("incremental progress formatting", () => {
    assert.equal(formatProgressPercent(1), "1%");
    assert.equal(formatProgressPercent(2), "2%");
    assert.equal(formatProgressPercent(99), "99%");
    assert.equal(formatProgressPercent(100), "100%");
  });

  test("expected vs received match and mismatch", () => {
    const match = compareExpectedReceived("HELLO", {
      partialText: "HELLO",
      finalText: "HELLO",
      bytesReceived: 5,
      syncState: "COMPLETE",
      success: true,
    });
    assert.equal(match.match, true);
    assert.equal(match.mismatch, false);

    const mismatch = compareExpectedReceived("HELLO", {
      partialText: "TEST",
      finalText: "TEST",
      bytesReceived: 4,
      syncState: "FAILED",
      success: false,
    });
    assert.equal(mismatch.mismatch, true);
    assert.equal(mismatch.match, false);
  });

  test("partial reception appears in view-model before COMPLETE", () => {
    const rx = {
      ...emptyTextFlashDiagnostics("RECEIVING"),
      bytesReceived: 2,
      declaredLength: 5,
      progressPercent: 40,
      partialText: "HE",
      lastValidFrame: "data" as const,
    };
    const vm = buildTextFlashDemoViewModel({
      tx: null,
      rx,
      expectedText: "HELLO",
    });
    assert.equal(vm.rxLabel, "RECEIVING");
    assert.equal(vm.partialText, "HE");
    assert.equal(vm.rxProgress, "40%");
    assert.equal(vm.comparison.pending, true);
  });

  test("loopback HELLO with repeated LL feeds demo comparison MATCH", () => {
    const result = runTextFlashLoopback("HELLO");
    assert.equal(result.failureStage, "ok");
    const vm = buildTextFlashDemoViewModel({
      tx: null,
      rx: result.diagnostics,
      expectedText: "HELLO",
      failureStage: null,
    });
    assert.equal(vm.rxLabel, "COMPLETE");
    assert.equal(vm.rxProgress, "100%");
    assert.equal(vm.comparison.match, true);
    assert.equal(vm.partialText, "HELLO");
    assert.ok(result.repeatedDataSteps.length >= 1);
  });

  test("mismatch exposes failure stage for workbench", () => {
    const result = runTextFlashLoopback("TEST", { expectedText: "HELLO" });
    const vm = buildTextFlashDemoViewModel({
      tx: null,
      rx: result.diagnostics,
      expectedText: "HELLO",
      failureStage: result.failureStage === "ok" ? null : result.failureStage,
      failureDetail: result.failureDetail,
    });
    assert.equal(vm.rxLabel, "FAILED");
    assert.equal(vm.comparison.mismatch, true);
    assert.equal(vm.failureStage, "utf8_decode");
  });

  test("FAILED view-model surfaces completion reason", () => {
    const rx = {
      ...emptyTextFlashDiagnostics("FAILED"),
      syncState: "FAILED" as const,
      finalStatus: "FAILED" as const,
      completionReason: "timeout",
      bytesReceived: 2,
      progressPercent: 40,
      partialText: "HE",
      success: false,
    };
    const vm = buildTextFlashDemoViewModel({
      tx: null,
      rx,
      expectedText: "HELLO",
      failureStage: "end_detection",
      failureDetail: "timeout",
    });
    assert.equal(vm.rxLabel, "FAILED");
    assert.equal(vm.diagnosticsSummary.completionReason, "timeout");
    assert.equal(vm.failureStage, "end_detection");
  });
});
