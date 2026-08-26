import assert from "node:assert/strict";
import test from "node:test";
import { VerificationEvidenceController } from "./verification-evidence-controller";
import type { SoftwareOpticalIntegrationResult } from "./software-optical-integration";

test("newer verification execution atomically replaces stale evidence", async () => {
  const controller = new VerificationEvidenceController();
  let releaseOld!: (value: SoftwareOpticalIntegrationResult[]) => void;
  const old = new Promise<SoftwareOpticalIntegrationResult[]>((resolve) => { releaseOld = resolve; });
  const oldExecution = controller.execute(() => old);
  const fresh = Object.freeze([{ runId: "fresh" }]) as unknown as SoftwareOpticalIntegrationResult[];
  await controller.execute(async () => fresh);
  releaseOld([{ runId: "stale" } as SoftwareOpticalIntegrationResult]);
  await oldExecution;
  assert.equal(controller.getResults()[0].runId, "fresh");
  assert.equal(Object.isFrozen(controller.getResults()), true);
});
