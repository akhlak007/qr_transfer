import assert from "node:assert/strict";
import test from "node:test";
import { encodeVlcFrame } from "./vlc-framing";
import { modulateManchesterOok } from "./vlc-modulator";
import { PhysicalVlcReceiver } from "./vlc-physical-receiver";

function transmitAtCameraFps(cameraFps: number, phaseMs = 0, dropEvery = 0, transmitterChipMs = 100) {
  const payload = Uint8Array.from({ length: 48 }, (_, index) => index * 17 + 3);
  const bytes = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 4, payload });
  const stream = modulateManchesterOok(bytes);
  const receiver = new PhysicalVlcReceiver(10);
  let recovered: Uint8Array | null = null;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  const framePeriod = 1000 / cameraFps;
  const duration = stream.totalSymbols * transmitterChipMs + 200;
  let observation = 0;
  for (let time = phaseMs; time < duration; time += framePeriod) {
    observation++;
    if (dropEvery > 0 && observation % dropEvery === 0) continue;
    const chip = Math.min(stream.totalSymbols - 1, Math.floor(time / transmitterChipMs));
    receiver.ingestSample(stream.levels[chip], time);
  }
  return { payload, recovered, diagnostics: receiver.getDiagnostics() };
}

for (const cameraFps of [30, 60]) {
  test(`physical Manchester VLC recovers at ${cameraFps} camera FPS`, () => {
    const result = transmitAtCameraFps(cameraFps, 17);
    assert.deepEqual(result.recovered, result.payload);
    assert.ok(result.diagnostics.validFramesCount >= 1);
  });
}

test("physical Manchester VLC tolerates dropped camera observations", () => {
  const result = transmitAtCameraFps(60, 41, 11);
  assert.deepEqual(result.recovered, result.payload);
});

test("physical Manchester VLC tracks two-percent sender clock drift", () => {
  const result = transmitAtCameraFps(60, 23, 0, 102);
  assert.deepEqual(result.recovered, result.payload);
});

test("physical VLC drops lock instead of inventing chips across a camera stall", () => {
  const receiver = new PhysicalVlcReceiver(10);
  receiver.ingestSample(0, 0);
  receiver.ingestSample(255, 20);
  receiver.ingestSample(0, 200);
  assert.equal(receiver.getDiagnostics().state, "CLOCK_LOST");
  assert.equal(receiver.getDiagnostics().validFramesCount, 0);
});

test("physical VLC calibration accepts a shifted exposure range", () => {
  const payload = new Uint8Array([3, 1, 4, 1, 5]);
  const bytes = encodeVlcFrame({ version: 1, modulation: "ook", seqNumber: 8, payload });
  const stream = modulateManchesterOok(bytes);
  const receiver = new PhysicalVlcReceiver(10);
  let recovered: Uint8Array | null = null;
  receiver.onFrame((event) => { recovered = event.rawPayload; });
  for (let time = 0; time < stream.totalSymbols * 100; time += 1000 / 60) {
    const chip = Math.min(stream.totalSymbols - 1, Math.floor(time / 100));
    receiver.ingestSample(stream.levels[chip] === 0 ? 140 : 220, time);
  }
  assert.deepEqual(recovered, payload);
});

test("physical VLC acknowledges an unusable camera signal", () => {
  const receiver = new PhysicalVlcReceiver(10);
  for (let index = 0; index < 20; index++) receiver.ingestSample(110, index * 16);
  const diagnostics = receiver.getDiagnostics();
  assert.equal(diagnostics.state, "SIGNAL_TOO_WEAK");
  assert.match(diagnostics.message, /cannot distinguish light levels/i);
});
