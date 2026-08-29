import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TransportId } from "../core/transport";
import {
  TEXT_FLASH_WORKBENCH_TARGET,
  TextFlashPhysicalExperimentService,
  isTextFlashExperimentRecord,
} from "../transports/text-flash/text-flash-physical-experiment";

describe("TextFlashWorkbenchPanel integration (TF7)", () => {
  test("workbench target is demo-only and outside TransportId", () => {
    assert.equal(TEXT_FLASH_WORKBENCH_TARGET.countsAsPhysicalValidation, false);
    assert.equal(TEXT_FLASH_WORKBENCH_TARGET.id, "TEXT_FLASH_PROTOCOL");
    const ids: string[] = Object.values(TransportId);
    assert.ok(!ids.includes(TEXT_FLASH_WORKBENCH_TARGET.transport));
  });

  test("panel service flow: select → run → reset → clear", () => {
    const svc = new TextFlashPhysicalExperimentService();
    const target = svc.selectTarget("TEXT_FLASH_PROTOCOL");
    assert.equal(target.evidenceKind, "text-flash-demo");
    const run = svc.runSynthetic("HELLO", { frameMs: 750 });
    assert.ok(isTextFlashExperimentRecord(run));
    assert.equal(run.success, true);
    svc.reset();
    assert.equal(svc.getLastResult(), null);
    assert.equal(svc.getHistory().length, 1);
    svc.clearHistory();
    assert.equal(svc.getHistory().length, 0);
  });
});
