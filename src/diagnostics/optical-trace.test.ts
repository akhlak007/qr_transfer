import assert from "node:assert/strict";
import test from "node:test";
import { OpticalDiagnosticTrace } from "./optical-trace";

test("optical trace is disabled by default and remains bounded", () => {
  const trace = new OpticalDiagnosticTrace(2);
  trace.record("VlcOokReceiver", "ignored");
  assert.equal(trace.snapshot().events.length, 0);
  trace.setEnabled(true);
  trace.record("VlcOokReceiver", "one", { value: 1 }, 10);
  trace.record("VlcOokReceiver", "two", { value: 2 }, 20);
  trace.record("VlcOokReceiver", "three", { value: 3 }, 30);
  const snapshot = trace.snapshot();
  assert.deepEqual(snapshot.events.map((event) => event.event), ["two", "three"]);
  assert.deepEqual(snapshot.events.map((event) => event.sequence), [2, 3]);
  assert.equal(snapshot.droppedEvents, 1);
});
