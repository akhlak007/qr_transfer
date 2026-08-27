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
  assert.equal(trace.getLiveSummary().stageCounts.VlcOokReceiver, 2);
});

test("optical trace keeps insertion order after repeated circular-buffer wraps", () => {
  const trace = new OpticalDiagnosticTrace(3);
  trace.setEnabled(true);
  for (let index = 0; index < 100_000; index++) trace.record("PhysicalVlcReceiver", "camera-observation", { index });
  assert.deepEqual(trace.snapshot().events.map((event) => event.details.index), [99_997, 99_998, 99_999]);
  assert.equal(trace.getLiveSummary().stageCounts.PhysicalVlcReceiver, 3);
  assert.equal(trace.getLiveSummary().droppedEvents, 99_997);
});

test("optical trace invalidates evicted live observations and snapshots mutable details", () => {
  const trace = new OpticalDiagnosticTrace(2);
  trace.setEnabled(true);
  const bits = [1, 0];
  trace.record("PhysicalVlcReceiver", "camera-observation", { bits });
  bits[0] = 0;
  trace.record("LiveReceiverRouter", "one");
  trace.record("LiveReceiverRouter", "two");
  assert.equal(trace.getLiveSummary().lastPhysicalObservation, null);
  assert.deepEqual(trace.snapshot().events.map((event) => event.event), ["one", "two"]);
});
