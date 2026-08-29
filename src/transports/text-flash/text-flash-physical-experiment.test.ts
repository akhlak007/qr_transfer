import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../../core/transport";
import { aggregatePhysicalEvidence } from "../../research/physical-evidence";
import {
  TEXT_FLASH_EVIDENCE_KIND,
  TEXT_FLASH_WORKBENCH_TARGET,
  TextFlashPhysicalExperimentService,
  assertTextFlashEvidenceIsolated,
  evaluateTextFlashWorkbenchSuccess,
  isTextFlashExperimentRecord,
  textFlashTransportIsNotMainTransportId,
} from "./text-flash-physical-experiment";
import { emptyTextFlashDiagnostics } from "./text-flash-types";
import { DemoTransportId } from "./text-flash-types";

describe("TEXT_FLASH_PROTOCOL workbench experiment (TF7)", () => {
  test("target selection exposes only TEXT_FLASH_PROTOCOL demo target", () => {
    const svc = new TextFlashPhysicalExperimentService();
    const targets = svc.listTargets();
    assert.equal(targets.length, 1);
    assert.equal(targets[0]!.id, "TEXT_FLASH_PROTOCOL");
    assert.equal(targets[0]!.countsAsPhysicalValidation, false);
    assert.equal(targets[0]!.transport, DemoTransportId.TextFlash);
    assert.deepEqual(svc.selectTarget("TEXT_FLASH_PROTOCOL"), TEXT_FLASH_WORKBENCH_TARGET);
    assert.throws(() => svc.selectTarget("vlc"));
  });

  test("synthetic HELLO run succeeds with exact-text workbench criteria", () => {
    const svc = new TextFlashPhysicalExperimentService();
    const record = svc.runSynthetic("HELLO");
    assert.equal(record.success, true);
    assert.equal(record.outcome, "success");
    assert.equal(record.recoveredText, "HELLO");
    assert.equal(record.startDetected, true);
    assert.equal(record.lengthDetected, true);
    assert.equal(record.endDetected, true);
    assert.equal(record.frameMs, 750);
    assert.equal(record.mode, "synthetic");
    assert.equal(record.physicalValidationEligible, false);
    assert.equal(record.evidenceKind, TEXT_FLASH_EVIDENCE_KIND);
    assert.ok(isTextFlashExperimentRecord(record));
    assertTextFlashEvidenceIsolated(record);
  });

  test("repeated LL and STATUS OK succeed through workbench runner", () => {
    const svc = new TextFlashPhysicalExperimentService();
    assert.equal(svc.runSynthetic("HELLO").success, true);
    assert.equal(svc.runSynthetic("STATUS OK").success, true);
  });

  test("mismatch / incomplete evaluation helpers", () => {
    const ok = evaluateTextFlashWorkbenchSuccess("AB", {
      ...emptyTextFlashDiagnostics("COMPLETE"),
      syncState: "COMPLETE",
      finalStatus: "COMPLETE",
      startDetected: true,
      lengthDetected: true,
      endDetected: true,
      declaredLength: 2,
      bytesReceived: 2,
      finalText: "AB",
      success: true,
      progressPercent: 100,
    });
    assert.equal(ok.success, true);

    const mismatch = evaluateTextFlashWorkbenchSuccess("AB", {
      ...emptyTextFlashDiagnostics("FAILED"),
      syncState: "FAILED",
      finalStatus: "FAILED",
      startDetected: true,
      lengthDetected: true,
      endDetected: true,
      declaredLength: 2,
      bytesReceived: 2,
      finalText: "XX",
      success: false,
      completionReason: "text_mismatch",
    });
    assert.equal(mismatch.outcome, "text_mismatch");
  });

  test("reset and clearHistory cleanup", () => {
    const svc = new TextFlashPhysicalExperimentService();
    svc.runSynthetic("A");
    assert.equal(svc.getHistory().length, 1);
    assert.ok(svc.getLastResult());
    assert.ok(svc.getLastLoopback());
    svc.reset();
    assert.equal(svc.getLastResult(), null);
    assert.equal(svc.getLastLoopback(), null);
    assert.equal(svc.getHistory().length, 1);
    assert.equal(svc.isActive(), false);
    svc.clearHistory();
    assert.equal(svc.getHistory().length, 0);
  });

  test("rendering/receiving flow retains progress and diagnostics on last loopback", () => {
    const svc = new TextFlashPhysicalExperimentService();
    const record = svc.runSynthetic("TEST");
    const loop = svc.getLastLoopback();
    assert.ok(loop);
    assert.ok(loop!.progressTrace.some((p) => p.bytesReceived > 0 && p.progressPercent < 100));
    assert.equal(record.progressPercent, 100);
    assert.equal(loop!.diagnostics.partialText, "TEST");
  });

  test("evidence isolation from TransportId and VLC/OFDM aggregates", () => {
    const svc = new TextFlashPhysicalExperimentService();
    const record = svc.runSynthetic("OK");
    assert.ok(textFlashTransportIsNotMainTransportId(record.transport));
    assert.notEqual(record.transport, TransportId.QR);
    assert.notEqual(record.transport, TransportId.VLC);
    assert.notEqual(record.transport, TransportId.VisualOFDM);

    // Demo records are not PhysicalTestRun / TestRun — VLC aggregate stays empty
    const vlcSummary = aggregatePhysicalEvidence([], TransportId.VLC, "ook");
    assert.equal(vlcSummary.totalPhysicalRuns, 0);
    assert.equal(vlcSummary.successfulRuns, 0);

    // Even if history exists on the Text Flash service, it is a separate store
    assert.equal(svc.getHistory().length, 1);
    assert.equal(svc.getHistory()[0]!.evidenceKind, TEXT_FLASH_EVIDENCE_KIND);
  });

  test("camera-unverified mode is rejected in TF7 synthetic runner", () => {
    const svc = new TextFlashPhysicalExperimentService();
    assert.throws(() =>
      svc.runSynthetic("HI", { mode: "camera-unverified" }),
    );
  });
});
