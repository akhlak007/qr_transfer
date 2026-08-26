import assert from "node:assert/strict";
import test from "node:test";
import { FinalizationGenerationGuard } from "./finalization-generation-guard";

test("superseded finalization cannot publish completion side effects", async () => {
  const guard = new FinalizationGenerationGuard();
  const generation = guard.capture();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let publications = 0;
  const completion = pending.then(() => {
    if (guard.isCurrent(generation)) publications++;
  });
  guard.invalidate();
  release();
  await completion;
  assert.equal(publications, 0);
});
